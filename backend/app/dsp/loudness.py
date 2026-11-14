"""
EBU R128 / ITU-R BS.1770-4 Loudness Measurement Module for Phase 2 DSP Engine.
Parses FFmpeg ebur128 filter output for Integrated LUFS, Loudness Range (LRA),
and 4x Over-sampled True Peak (dBTP), with pyloudnorm fallback and framelog extraction.
"""

import math
from pathlib import Path
import re
import subprocess
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pyloudnorm as pyln
import soundfile as sf

from backend.app.dsp.media_probe import resolve_binary


def parse_ebur128_stderr(stderr_text: str) -> Dict[str, Any]:
    """
    Parses ffmpeg ebur128 summary block and framelog lines from stderr.
    """
    result: Dict[str, Any] = {
        "integrated_lufs": None,
        "lra_lu": None,
        "true_peak_dbtp": None,
        "momentary_max_lufs": None,
        "short_term_max_lufs": None,
        "frames": [],  # list of (t_sec, M_lufs, S_lufs)
    }

    # Summary regexes
    # I:         -14.2 LUFS
    m_i = re.search(r"Integrated loudness:\s+I:\s+([-\d\.]+)\s+LUFS", stderr_text, re.IGNORECASE)
    if m_i:
        try:
            result["integrated_lufs"] = float(m_i.group(1))
        except ValueError:
            pass

    # LRA:         6.4 LU
    m_lra = re.search(r"Loudness range:\s+LRA:\s+([-\d\.]+)\s+LU", stderr_text, re.IGNORECASE)
    if m_lra:
        try:
            result["lra_lu"] = float(m_lra.group(1))
        except ValueError:
            pass

    # True peak:\s+Peak:\s+([-\d\.]+)\s+dBFS
    m_tp = re.search(r"True peak:\s+Peak:\s+([-\d\.]+)\s+(?:dBFS|dBTP)", stderr_text, re.IGNORECASE)
    if m_tp:
        try:
            result["true_peak_dbtp"] = float(m_tp.group(1))
        except ValueError:
            pass

    # Framelog parsing: [Parsed_ebur128_0 ...] t: 0.1   TARGET: ... M: -20.4 S: -24.1
    # Example line: [Parsed_ebur128_0 @ 000...] t: 0.100000       M: -18.2 S: -22.1 ...
    frame_matches = re.finditer(
        r"t:\s+([\d\.]+)\s+(?:TARGET:[^\s]+\s+)?M:\s+([-\d\.]+|-\s*inf)\s+S:\s+([-\d\.]+|-\s*inf)",
        stderr_text,
    )
    m_vals = []
    s_vals = []
    for fm in frame_matches:
        try:
            t = float(fm.group(1))
            m_str = fm.group(2).replace(" ", "")
            s_str = fm.group(3).replace(" ", "")
            m_val = -120.0 if "-inf" in m_str else float(m_str)
            s_val = -120.0 if "-inf" in s_str else float(s_str)
            result["frames"].append((t, m_val, s_val))
            if m_val > -120.0:
                m_vals.append(m_val)
            if s_val > -120.0:
                s_vals.append(s_val)
        except (ValueError, IndexError):
            continue

    if m_vals:
        result["momentary_max_lufs"] = max(m_vals)
    if s_vals:
        result["short_term_max_lufs"] = max(s_vals)

    return result


def measure_loudness_ebur128(
    decoded_wav_path: Path,
    duration_seconds: float,
    sample_rate_hz: int,
) -> Dict[str, Any]:
    """
    Runs FFmpeg ebur128 with peak=true and framelog=verbose.
    Falls back to pyloudnorm if FFmpeg analysis is unavailable or incomplete.
    """
    ffmpeg_bin = resolve_binary("ffmpeg")
    cmd = [
        ffmpeg_bin,
        "-nostdin",
        "-hide_banner",
        "-i", str(decoded_wav_path),
        "-filter_complex", "ebur128=peak=true:framelog=verbose",
        "-f", "null",
        "-",
    ]

    parsed: Dict[str, Any] = {
        "integrated_lufs": None,
        "lra_lu": None,
        "true_peak_dbtp": None,
        "momentary_max_lufs": None,
        "short_term_max_lufs": None,
        "frames": [],
        "unavailable_reasons": {},
    }

    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=45, shell=False)
        parsed = parse_ebur128_stderr(res.stderr)
        parsed["unavailable_reasons"] = {}
    except Exception:
        pass

    # If duration is shorter than standard EBU R128 integration windows
    if duration_seconds < 0.4:
        parsed["unavailable_reasons"]["momentary_max_loudness"] = "file_duration_too_short_for_ebur128"
    if duration_seconds < 3.0:
        parsed["unavailable_reasons"]["short_term_max_loudness"] = "file_duration_too_short_for_ebur128"
        parsed["unavailable_reasons"]["loudness_range_lra"] = "file_duration_too_short_for_ebur128"
        parsed["lra_lu"] = None
        parsed["short_term_max_lufs"] = None

    # Fallback to pyloudnorm for integrated loudness if ffmpeg didn't catch it
    if parsed.get("integrated_lufs") is None:
        try:
            data, sr = sf.read(str(decoded_wav_path), dtype="float32")
            if len(data.shape) == 1:
                meter = pyln.Meter(sr)
            else:
                meter = pyln.Meter(sr)
            lufs = meter.integrated_loudness(data)
            if math.isinf(lufs) or math.isnan(lufs) or lufs < -100:
                parsed["integrated_lufs"] = -70.0
            else:
                parsed["integrated_lufs"] = round(float(lufs), 2)
        except Exception:
            parsed["integrated_lufs"] = None
            parsed["unavailable_reasons"]["integrated_loudness"] = "file_duration_too_short_for_ebur128"

    # Fallback momentary max to integrated if missing and file >= 0.4s
    if parsed.get("momentary_max_lufs") is None and duration_seconds >= 0.4 and parsed.get("integrated_lufs") is not None:
        parsed["momentary_max_lufs"] = parsed["integrated_lufs"]

    # Fallback short-term max to integrated if missing and file >= 3.0s
    if parsed.get("short_term_max_lufs") is None and duration_seconds >= 3.0 and parsed.get("integrated_lufs") is not None:
        parsed["short_term_max_lufs"] = parsed["integrated_lufs"]

    return parsed

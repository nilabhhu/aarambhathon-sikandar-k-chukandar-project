"""
EBU R128 / ITU-R BS.1770-4 Loudness Measurement Module for MixLearn Studio Phase 2.
Parses FFmpeg ebur128 filter output for Integrated LUFS, Loudness Range (LRA),
and 4x Over-sampled True Peak (dBTP), with pyloudnorm fallback.
Adheres strictly to Rule 2 (No fabricated measurements).
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
    Never invents values for silent or unmeasured audio.
    """
    result: Dict[str, Any] = {
        "integrated_lufs": None,
        "lra_lu": None,
        "true_peak_dbtp": None,
        "momentary_max_lufs": None,
        "short_term_max_lufs": None,
        "frames": [],  # list of (t_sec, M_lufs, S_lufs)
        "is_silent": False,
    }

    # Summary regexes
    # Integrated loudness: I: -14.2 LUFS or I: -inf LUFS
    m_i = re.search(r"Integrated loudness:\s+I:\s+([-\d\.]+|-\s*inf)\s+LUFS", stderr_text, re.IGNORECASE)
    if m_i:
        val_str = m_i.group(1).replace(" ", "").lower()
        if "-inf" in val_str:
            result["is_silent"] = True
            result["integrated_lufs"] = None
        else:
            try:
                val = float(val_str)
                if not math.isnan(val) and not math.isinf(val) and val > -99.0:
                    result["integrated_lufs"] = val
                else:
                    result["is_silent"] = True
                    result["integrated_lufs"] = None
            except ValueError:
                pass

    # Loudness range: LRA: 6.4 LU
    m_lra = re.search(r"Loudness range:\s+LRA:\s+([-\d\.]+)\s+LU", stderr_text, re.IGNORECASE)
    if m_lra:
        try:
            val = float(m_lra.group(1))
            if not math.isnan(val) and not math.isinf(val):
                result["lra_lu"] = val
        except ValueError:
            pass

    # True peak: Peak: -1.2 dBFS or dBTP
    m_tp = re.search(r"True peak:\s+Peak:\s+([-\d\.]+|-\s*inf)\s+(?:dBFS|dBTP)", stderr_text, re.IGNORECASE)
    if m_tp:
        val_str = m_tp.group(1).replace(" ", "").lower()
        if "-inf" not in val_str:
            try:
                val = float(val_str)
                if not math.isnan(val) and not math.isinf(val):
                    result["true_peak_dbtp"] = val
            except ValueError:
                pass

    # Framelog parsing:
    # Example line: [Parsed_ebur128_0 @ 000...] t: 0.100000       M: -18.2 S: -22.1 ...
    frame_matches = re.finditer(
        r"t:\s+([\d\.]+)\s+(?:TARGET:[^\s]+\s+)?M:\s+([-\d\.]+|-\s*inf)\s+S:\s+([-\d\.]+|-\s*inf)",
        stderr_text,
    )
    m_vals: List[float] = []
    s_vals: List[float] = []
    for fm in frame_matches:
        try:
            t = float(fm.group(1))
            m_str = fm.group(2).replace(" ", "").lower()
            s_str = fm.group(3).replace(" ", "").lower()

            m_val: Optional[float] = None
            if "-inf" not in m_str:
                parsed_m = float(m_str)
                if not math.isnan(parsed_m) and not math.isinf(parsed_m) and parsed_m > -99.0:
                    m_val = parsed_m
                    m_vals.append(parsed_m)

            s_val: Optional[float] = None
            if "-inf" not in s_str:
                parsed_s = float(s_str)
                if not math.isnan(parsed_s) and not math.isinf(parsed_s) and parsed_s > -99.0:
                    s_val = parsed_s
                    s_vals.append(parsed_s)

            result["frames"].append((t, m_val, s_val))
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
    Never substitutes integrated loudness for momentary or short-term max.
    Never invents -70 LUFS on silence or undefined signals.
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

    unavailable_reasons: Dict[str, str] = {}
    parsed: Dict[str, Any] = {
        "integrated_lufs": None,
        "lra_lu": None,
        "true_peak_dbtp": None,
        "momentary_max_lufs": None,
        "short_term_max_lufs": None,
        "frames": [],
        "unavailable_reasons": unavailable_reasons,
    }

    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=45, shell=False)
        if res.returncode == 0:
            parsed = parse_ebur128_stderr(res.stderr)
            parsed["unavailable_reasons"] = unavailable_reasons
    except Exception:
        pass

    # Duration-based gating (EBU R128 standard windows)
    if duration_seconds < 0.4:
        unavailable_reasons["momentary_max_loudness"] = "file_duration_too_short_for_ebur128"
        parsed["momentary_max_lufs"] = None

    if duration_seconds < 3.0:
        unavailable_reasons["short_term_max_loudness"] = "file_duration_too_short_for_ebur128"
        unavailable_reasons["loudness_range_lra"] = "file_duration_too_short_for_ebur128"
        parsed["lra_lu"] = None
        parsed["short_term_max_lufs"] = None

    # Handle silence from FFmpeg ebur128
    if parsed.get("is_silent"):
        unavailable_reasons["integrated_loudness"] = "audio_signal_silent_or_below_gating_threshold"
        unavailable_reasons["momentary_max_loudness"] = "audio_signal_silent_or_below_gating_threshold"
        unavailable_reasons["short_term_max_loudness"] = "audio_signal_silent_or_below_gating_threshold"
        unavailable_reasons["loudness_range_lra"] = "audio_signal_silent_or_below_gating_threshold"
        parsed["integrated_lufs"] = None
        parsed["momentary_max_lufs"] = None
        parsed["short_term_max_lufs"] = None
        parsed["lra_lu"] = None

    # Fallback to pyloudnorm for integrated loudness if ffmpeg parsing was incomplete
    # and file was not explicitly silent
    if parsed.get("integrated_lufs") is None and not parsed.get("is_silent") and duration_seconds >= 0.4:
        try:
            data, sr = sf.read(str(decoded_wav_path), dtype="float32")
            meter = pyln.Meter(sr)
            lufs = meter.integrated_loudness(data)
            if math.isinf(lufs) or math.isnan(lufs) or lufs <= -99.0:
                parsed["integrated_lufs"] = None
                unavailable_reasons["integrated_loudness"] = "audio_signal_silent_or_below_gating_threshold"
            else:
                parsed["integrated_lufs"] = round(float(lufs), 2)
        except Exception:
            parsed["integrated_lufs"] = None
            if "integrated_loudness" not in unavailable_reasons:
                unavailable_reasons["integrated_loudness"] = "loudness_measurement_unavailable"

    # Explicit unavailable reasons when values could not be computed
    if parsed.get("integrated_lufs") is None and "integrated_loudness" not in unavailable_reasons:
        if duration_seconds < 0.4:
            unavailable_reasons["integrated_loudness"] = "file_duration_too_short_for_ebur128"
        else:
            unavailable_reasons["integrated_loudness"] = "audio_signal_silent_or_below_gating_threshold"

    if parsed.get("momentary_max_lufs") is None and "momentary_max_loudness" not in unavailable_reasons:
        unavailable_reasons["momentary_max_loudness"] = "audio_signal_silent_or_below_gating_threshold"

    if parsed.get("short_term_max_lufs") is None and "short_term_max_loudness" not in unavailable_reasons:
        unavailable_reasons["short_term_max_loudness"] = "audio_signal_silent_or_below_gating_threshold"

    if parsed.get("true_peak_dbtp") is None:
        unavailable_reasons["true_peak_max"] = "true_peak_measurement_unavailable"

    if parsed.get("lra_lu") is None and "loudness_range_lra" not in unavailable_reasons:
        unavailable_reasons["loudness_range_lra"] = "loudness_range_undefined_for_signal"

    parsed["unavailable_reasons"] = unavailable_reasons
    return parsed

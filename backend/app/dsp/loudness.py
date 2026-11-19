"""
EBU R128 / ITU-R BS.1770-4 Loudness Measurement Module for MixLearn Studio Phase 2.
Parses FFmpeg ebur128 filter output for Integrated LUFS, Loudness Range (LRA),
and 4x Over-sampled True Peak (dBTP), with pyloudnorm fallback.
Adheres strictly to Rule 2 (No fabricated measurements).
"""

import logging
import math
from pathlib import Path
import re
import subprocess
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pyloudnorm as pyln
from scipy.signal import lfilter, resample_poly
import soundfile as sf

from backend.app.dsp.media_probe import resolve_binary

logger = logging.getLogger(__name__)


def compute_true_peak_4x_polyphase_dbtp(samples: np.ndarray) -> Optional[float]:
    """
    Computes 4x oversampled polyphase FIR inter-sample True Peak in dBTP
    (ITU-R BS.1770-4 / EBU Tech 3341 methodology).
    """
    arr = np.asarray(samples, dtype=np.float64)
    if arr.size == 0:
        return None
    if arr.ndim == 1:
        oversampled = resample_poly(arr, up=4, down=1)
    else:
        oversampled = resample_poly(arr, up=4, down=1, axis=0)
    peak = float(np.max(np.abs(oversampled)))
    if peak <= 1e-12:
        return None
    return round(20.0 * math.log10(peak), 2)


def compute_kweighted_sliding_lufs_frames(
    samples: np.ndarray,
    sample_rate_hz: int,
    include_short_term: bool = True,
) -> Tuple[List[Tuple[float, Optional[float], Optional[float]]], Optional[float], Optional[float]]:
    """
    Computes real ITU-R BS.1770-4 K-weighted sliding-window Momentary (400ms)
    and Short-Term (3.0s) LUFS frames directly from decoded PCM audio.

    Uses a 0.25s hop for clips <= 10.0s (and 0.5s hop for longer clips) with a
    clamped 3.0s window so even 3.0s–4.0s clips populate dense, accurate Short-Term
    LUFS timeline buckets and short_term_max_lufs.
    """
    arr = np.asarray(samples, dtype=np.float64)
    if arr.size == 0 or sample_rate_hz <= 0:
        return [], None, None

    if arr.ndim == 1:
        arr = arr[:, np.newaxis]

    n_samples, n_channels = arr.shape
    duration_sec = n_samples / float(sample_rate_hz)
    if duration_sec < 0.4:
        return [], None, None

    if float(np.max(np.abs(arr))) <= 1e-9:
        return [], None, None

    # ITU-R BS.1770-4 Stage 1: High-shelf filter (f0 = 1681.974 Hz, G = +3.9998 dB)
    f0_shelf = 1681.9744509555319
    g_db = 3.99984380697
    k_shelf = math.tan(math.pi * f0_shelf / float(sample_rate_hz))
    vh = 10.0 ** (g_db / 20.0)
    vb = vh ** 0.499666774155
    a0_s = 1.0 + k_shelf / 0.7071752369554193 + k_shelf * k_shelf
    b_shelf = np.array([
        (vh + vb * math.sqrt(2.0) * k_shelf + k_shelf * k_shelf) / a0_s,
        (2.0 * (k_shelf * k_shelf - vh)) / a0_s,
        (vh - vb * math.sqrt(2.0) * k_shelf + k_shelf * k_shelf) / a0_s,
    ], dtype=np.float64)
    a_shelf = np.array([
        1.0,
        (2.0 * (k_shelf * k_shelf - 1.0)) / a0_s,
        (1.0 - k_shelf / 0.7071752369554193 + k_shelf * k_shelf) / a0_s,
    ], dtype=np.float64)

    # ITU-R BS.1770-4 Stage 2: High-pass filter (f0 = 38.135 Hz, Q = 0.5003)
    f0_hp = 38.13547087602444
    k_hp = math.tan(math.pi * f0_hp / float(sample_rate_hz))
    q_hp = 0.5003270373253953
    a0_hp = 1.0 + k_hp / q_hp + k_hp * k_hp
    b_hp = np.array([1.0 / a0_hp, -2.0 / a0_hp, 1.0 / a0_hp], dtype=np.float64)
    a_hp = np.array([
        1.0,
        (2.0 * (k_hp * k_hp - 1.0)) / a0_hp,
        (1.0 - k_hp / q_hp + k_hp * k_hp) / a0_hp,
    ], dtype=np.float64)

    # Accumulate squared K-weighted energy across channels (equal weight for mono/stereo)
    sum_sq = np.zeros(n_samples, dtype=np.float64)
    for ch in range(n_channels):
        y1 = lfilter(b_shelf, a_shelf, arr[:, ch])
        y2 = lfilter(b_hp, a_hp, y1)
        sum_sq += y2 * y2

    prefix = np.empty(n_samples + 1, dtype=np.float64)
    prefix[0] = 0.0
    np.cumsum(sum_sq, out=prefix[1:])

    def _power_to_lufs(mean_sq_sum: float) -> Optional[float]:
        if mean_sq_sum <= 1e-12:
            return None
        val = -0.691 + 10.0 * math.log10(mean_sq_sum)
        if math.isnan(val) or math.isinf(val) or val <= -99.0:
            return None
        return round(val, 2)

    hop_sec = 0.25 if duration_sec <= 10.0 else 0.5
    num_steps = min(240, max(8, int(round(duration_sec / hop_sec))))
    step_sec = duration_sec / float(num_steps)

    win_m = min(n_samples, max(1, int(round(0.4 * sample_rate_hz))))
    win_s = min(n_samples, max(1, int(round(3.0 * sample_rate_hz))))
    can_compute_short_term = include_short_term and duration_sec >= 3.0

    frames: List[Tuple[float, Optional[float], Optional[float]]] = []
    m_vals: List[float] = []
    s_vals: List[float] = []

    for idx in range(num_steps):
        mid_t = (idx + 0.5) * step_sec
        center = min(n_samples - 1, max(0, int(round(mid_t * sample_rate_hz))))

        m_start = max(0, min(n_samples - win_m, center - win_m // 2))
        m_end = min(n_samples, m_start + win_m)
        m_mean = float(prefix[m_end] - prefix[m_start]) / float(max(1, m_end - m_start))
        m_lufs = _power_to_lufs(m_mean)
        if m_lufs is not None:
            m_vals.append(m_lufs)

        s_lufs: Optional[float] = None
        if can_compute_short_term:
            s_start = max(0, min(n_samples - win_s, center - win_s // 2))
            s_end = min(n_samples, s_start + win_s)
            s_mean = float(prefix[s_end] - prefix[s_start]) / float(max(1, s_end - s_start))
            s_lufs = _power_to_lufs(s_mean)
            if s_lufs is not None:
                s_vals.append(s_lufs)

        frames.append((round(mid_t, 3), m_lufs, s_lufs))

    momentary_max = round(max(m_vals), 2) if m_vals else None
    short_term_max = round(max(s_vals), 2) if s_vals else None
    return frames, momentary_max, short_term_max


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

    # Summary regexes — FFmpeg on Linux can emit an initial empty filtergraph Summary
    # (-70.0 LUFS / -inf dBFS) during stream probing before the final post-decode Summary.
    # Always read from the FINAL Summary block when multiple blocks are present.
    summary_section = stderr_text
    summary_splits = re.split(r"\[Parsed_ebur128_\d+[^\]]*\]\s*Summary:", stderr_text, flags=re.IGNORECASE)
    if len(summary_splits) > 1:
        summary_section = summary_splits[-1]

    # Integrated loudness: I: -14.2 LUFS or I: -inf LUFS
    i_matches = list(
        re.finditer(r"Integrated loudness:\s+I:\s+([-\d\.]+|-\s*inf)\s+LUFS", summary_section, re.IGNORECASE)
    )
    m_i = i_matches[-1] if i_matches else None
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
    lra_matches = list(
        re.finditer(r"Loudness range:\s+LRA:\s+([-\d\.]+)\s+LU", summary_section, re.IGNORECASE)
    )
    m_lra = lra_matches[-1] if lra_matches else None
    if m_lra:
        try:
            val = float(m_lra.group(1))
            if not math.isnan(val) and not math.isinf(val):
                result["lra_lu"] = val
        except ValueError:
            pass

    # True peak: Peak: -1.2 dBFS or dBTP
    tp_matches = list(
        re.finditer(r"True peak:\s+Peak:\s+([-\d\.]+|-\s*inf)\s+(?:dBFS|dBTP)", summary_section, re.IGNORECASE)
    )
    m_tp = tp_matches[-1] if tp_matches else None
    if m_tp:
        val_str = m_tp.group(1).replace(" ", "").lower()
        if "-inf" in val_str:
            # On Linux FFmpeg, pure digital silence reports I: -70.0 LUFS and Peak: -inf dBFS
            if result["integrated_lufs"] is not None and result["integrated_lufs"] <= -70.0:
                result["is_silent"] = True
                result["integrated_lufs"] = None
        else:
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
    ffmpeg_fallback_used = False
    parsed: Dict[str, Any] = {
        "integrated_lufs": None,
        "lra_lu": None,
        "true_peak_dbtp": None,
        "momentary_max_lufs": None,
        "short_term_max_lufs": None,
        "frames": [],
        "unavailable_reasons": unavailable_reasons,
        "ffmpeg_fallback_used": False,
    }

    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=45, shell=False)
        if res.returncode == 0:
            parsed = parse_ebur128_stderr(res.stderr)
            parsed["unavailable_reasons"] = unavailable_reasons
        else:
            ffmpeg_fallback_used = True
            logger.warning(
                "FFmpeg ebur128 exited with code %s for %s; using pyloudnorm + 4x polyphase fallback. stderr=%s",
                res.returncode,
                decoded_wav_path.name,
                (res.stderr or "").strip()[:300],
            )
    except Exception as exc:
        ffmpeg_fallback_used = True
        logger.warning(
            "FFmpeg ebur128 execution failed (%s: %s) for %s; using pyloudnorm + 4x polyphase fallback.",
            type(exc).__name__,
            exc,
            decoded_wav_path.name,
        )

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

    # Fallback to pyloudnorm for integrated loudness and 4x polyphase for True Peak
    # if ffmpeg parsing was incomplete and file was not explicitly silent.
    # Also compute real ITU-R BS.1770-4 K-weighted sliding-window Short-Term/Momentary frames
    # whenever frames are missing or lack finite short-term coverage (e.g., 3s–6s clips or fallback mode).
    existing_frames = parsed.get("frames") or []
    finite_st_frames = sum(1 for f in existing_frames if len(f) >= 3 and f[2] is not None)
    needs_sliding_frames = (
        not parsed.get("is_silent")
        and duration_seconds >= 0.4
        and (
            len(existing_frames) < 2
            or (duration_seconds >= 3.0 and (parsed.get("short_term_max_lufs") is None or finite_st_frames < max(2, len(existing_frames) // 2)))
            or parsed.get("momentary_max_lufs") is None
        )
    )

    if (
        (parsed.get("integrated_lufs") is None or parsed.get("true_peak_dbtp") is None or needs_sliding_frames)
        and not parsed.get("is_silent")
    ):
        if parsed.get("integrated_lufs") is None or parsed.get("true_peak_dbtp") is None:
            ffmpeg_fallback_used = True
        try:
            data, sr = sf.read(str(decoded_wav_path), dtype="float32")
            if parsed.get("integrated_lufs") is None and duration_seconds >= 0.4:
                meter = pyln.Meter(sr)
                lufs = meter.integrated_loudness(data)
                if math.isinf(lufs) or math.isnan(lufs) or lufs <= -99.0:
                    parsed["integrated_lufs"] = None
                    unavailable_reasons["integrated_loudness"] = "audio_signal_silent_or_below_gating_threshold"
                else:
                    parsed["integrated_lufs"] = round(float(lufs), 2)
            if parsed.get("true_peak_dbtp") is None:
                tp = compute_true_peak_4x_polyphase_dbtp(data)
                if tp is not None:
                    parsed["true_peak_dbtp"] = tp
            if needs_sliding_frames:
                sliding_frames, calc_m_max, calc_s_max = compute_kweighted_sliding_lufs_frames(
                    data,
                    sr,
                    include_short_term=(duration_seconds >= 3.0),
                )
                if sliding_frames:
                    parsed["frames"] = sliding_frames
                if parsed.get("momentary_max_lufs") is None and calc_m_max is not None:
                    parsed["momentary_max_lufs"] = calc_m_max
                if duration_seconds >= 3.0 and parsed.get("short_term_max_lufs") is None and calc_s_max is not None:
                    parsed["short_term_max_lufs"] = calc_s_max
        except Exception as exc:
            logger.warning(
                "pyloudnorm / 4x polyphase / sliding LUFS fallback failed (%s: %s) for %s.",
                type(exc).__name__,
                exc,
                decoded_wav_path.name,
            )
            if parsed.get("integrated_lufs") is None and "integrated_loudness" not in unavailable_reasons:
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
    parsed["ffmpeg_fallback_used"] = ffmpeg_fallback_used
    return parsed


def compute_streaming_normalization_estimates(
    integrated_lufs: Optional[float],
    true_peak_dbtp: Optional[float],
) -> Dict[str, Any]:
    """
    Computes deterministic streaming loudness normalization estimates (Rule 7)
    from measured ITU-R BS.1770-4 Integrated LUFS and 4x oversampled True Peak (dBTP).
    """
    disclaimer = (
        "Rule 7: Estimates based on documented platform loudness normalization modes; "
        "actual playback varies by user settings, playback device, and codec."
    )

    if integrated_lufs is None or math.isnan(integrated_lufs) or math.isinf(integrated_lufs):
        return {
            "available": False,
            "reason": "integrated_loudness_unavailable",
            "measured_integrated_lufs": None,
            "measured_true_peak_dbtp": (
                round(float(true_peak_dbtp), 2)
                if true_peak_dbtp is not None and not math.isnan(true_peak_dbtp) and not math.isinf(true_peak_dbtp)
                else None
            ),
            "disclaimer": disclaimer,
            "platforms": [],
        }

    measured_lufs = round(float(integrated_lufs), 2)
    measured_tp = (
        round(float(true_peak_dbtp), 2)
        if true_peak_dbtp is not None and not math.isnan(true_peak_dbtp) and not math.isinf(true_peak_dbtp)
        else None
    )

    def _build_platform(
        platform: str,
        target_lufs: float,
        ceiling_dbtp: float,
        allow_upward_gain: bool,
        assumption_note: str,
    ) -> Dict[str, Any]:
        raw_gain = target_lufs - measured_lufs
        estimated_gain_db = round(raw_gain if allow_upward_gain else min(0.0, raw_gain), 2)
        # Avoid negative zero (-0.0)
        if estimated_gain_db == 0.0:
            estimated_gain_db = 0.0
        limiter_engaged_warning = bool(
            estimated_gain_db > 0.0
            and measured_tp is not None
            and (measured_tp + estimated_gain_db) > ceiling_dbtp
        )
        return {
            "platform": platform,
            "target_lufs": target_lufs,
            "estimated_gain_db": estimated_gain_db,
            "limiter_engaged_warning": limiter_engaged_warning,
            "assumption_note": assumption_note,
        }

    platforms = [
        _build_platform(
            platform="Spotify Normal",
            target_lufs=-14.0,
            ceiling_dbtp=-1.0,
            allow_upward_gain=True,
            assumption_note="Spotify Normal mode (-14.0 LUFS target, -1.0 dBTP limiter ceiling on upward gain).",
        ),
        _build_platform(
            platform="Apple Music Sound Check",
            target_lufs=-16.0,
            ceiling_dbtp=-1.0,
            allow_upward_gain=True,
            assumption_note="Apple Music Sound Check enabled (-16.0 LUFS target, -1.0 dBTP ceiling).",
        ),
        _build_platform(
            platform="YouTube",
            target_lufs=-14.0,
            ceiling_dbtp=-1.0,
            allow_upward_gain=False,
            assumption_note="YouTube normalization (-14.0 LUFS ceiling; attenuates louder tracks, no upward gain).",
        ),
    ]

    return {
        "available": True,
        "measured_integrated_lufs": measured_lufs,
        "measured_true_peak_dbtp": measured_tp,
        "disclaimer": disclaimer,
        "platforms": platforms,
    }

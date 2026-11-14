"""
Waveform and time-domain DSP analysis for MixLearn Studio Phase 2.
Performs streaming block-based sample peak detection, contiguous clipping event counts,
global RMS, dynamic crest factor, silence-gated stereo phase correlation,
orthonormal mid/side stereo width index, and uniform timeline series generation.
"""

import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import soundfile as sf


def compute_waveform_metrics(
    decoded_wav_path: Path,
    duration_seconds: float,
    sample_rate_hz: int,
    channels: int,
    loudness_frames: Optional[List[Tuple[float, float, float]]] = None,
) -> Dict[str, Any]:
    """
    Computes time-domain waveform measurements and timeline buckets via chunked streaming.
    """
    block_size = 65536
    total_samples = 0
    sum_sq_total = 0.0
    global_max_abs = 0.0

    # Clipping run detection (>= 3 consecutive samples >= 0.9999)
    contiguous_clipping_events = 0
    current_run_length = [0] * channels

    # Mid/Side RMS accumulation
    sum_sq_mid = 0.0
    sum_sq_side = 0.0

    # Timeline bucket setup (max 240 buckets)
    num_buckets = min(240, max(12, int(duration_seconds / 1.0)))
    bucket_duration = duration_seconds / float(num_buckets)
    samples_per_bucket = max(1, int(round(bucket_duration * sample_rate_hz)))

    # Bucket tracking arrays
    bucket_peak = np.zeros(num_buckets, dtype=np.float32)
    bucket_sum_sq = np.zeros(num_buckets, dtype=np.float64)
    bucket_samples = np.zeros(num_buckets, dtype=np.int64)
    bucket_clipped = np.zeros(num_buckets, dtype=bool)

    # For stereo correlation per bucket
    bucket_sum_ll = np.zeros(num_buckets, dtype=np.float64)
    bucket_sum_rr = np.zeros(num_buckets, dtype=np.float64)
    bucket_sum_lr = np.zeros(num_buckets, dtype=np.float64)

    # Stereo correlation tracking across 400ms windows
    window_400ms = int(0.4 * sample_rate_hz)
    correlations_400ms: List[float] = []

    # Stream through blocks
    current_sample_idx = 0
    with sf.SoundFile(str(decoded_wav_path), mode="r") as snd:
        channels = snd.channels
        while True:
            block = snd.read(frames=block_size, dtype="float32", always_2d=True)
            if block.shape[0] == 0:
                break

            n_frames = block.shape[0]
            total_samples += n_frames
            abs_block = np.abs(block)
            block_max = float(np.max(abs_block))
            if block_max > global_max_abs:
                global_max_abs = block_max

            sum_sq_total += float(np.sum(block ** 2))

            # Contiguous clipping detection across channels
            for ch in range(channels):
                ch_samples = abs_block[:, ch]
                for s in ch_samples:
                    if s >= 0.9999:
                        current_run_length[ch] += 1
                        if current_run_length[ch] == 3:
                            contiguous_clipping_events += 1
                    else:
                        current_run_length[ch] = 0

            # Mid / Side accumulation for stereo
            if channels == 2:
                left = block[:, 0]
                right = block[:, 1]
                mid = (left + right) / math.sqrt(2.0)
                side = (left - right) / math.sqrt(2.0)
                sum_sq_mid += float(np.sum(mid ** 2))
                sum_sq_side += float(np.sum(side ** 2))

            # Distribute into timeline buckets
            frame_indices = current_sample_idx + np.arange(n_frames)
            b_indices = np.minimum(num_buckets - 1, (frame_indices / samples_per_bucket).astype(int))

            for b in np.unique(b_indices):
                mask = b_indices == b
                sub_block = block[mask]
                sub_abs = abs_block[mask]
                sub_max = float(np.max(sub_abs))
                if sub_max > bucket_peak[b]:
                    bucket_peak[b] = sub_max
                bucket_sum_sq[b] += float(np.sum(sub_block ** 2))
                bucket_samples[b] += int(np.sum(mask))
                if sub_max >= 0.9999:
                    bucket_clipped[b] = True

                if channels == 2:
                    bl = sub_block[:, 0]
                    br = sub_block[:, 1]
                    bucket_sum_ll[b] += float(np.sum(bl ** 2))
                    bucket_sum_rr[b] += float(np.sum(br ** 2))
                    bucket_sum_lr[b] += float(np.sum(bl * br))

            current_sample_idx += n_frames

    # Global Peak dBFS
    if global_max_abs <= 1e-12:
        sample_peak_max_dbfs = -120.0
    else:
        sample_peak_max_dbfs = round(20.0 * math.log10(global_max_abs), 2)

    # Global RMS dBFS
    if total_samples > 0:
        mean_sq = sum_sq_total / (total_samples * channels)
        rms_linear = math.sqrt(max(1e-12, mean_sq))
        global_rms_dbfs = round(20.0 * math.log10(rms_linear), 2)
    else:
        global_rms_dbfs = -120.0
        rms_linear = 1e-6

    # Dynamic Crest Factor
    crest_factor_db = round(max(0.0, sample_peak_max_dbfs - global_rms_dbfs), 2)

    # Stereo Phase Correlation & Width
    unavailable_reasons: Dict[str, str] = {}
    phase_correlation_mean: Optional[float] = None
    phase_correlation_min: Optional[float] = None
    stereo_width_index: Optional[float] = None

    if channels == 1:
        unavailable_reasons["phase_correlation_mean"] = "mono_input_no_stereo_field"
        unavailable_reasons["phase_correlation_min"] = "mono_input_no_stereo_field"
        unavailable_reasons["stereo_width_index"] = "mono_input_no_stereo_field"
    else:
        # Calculate correlation per bucket
        bucket_correlations: List[float] = []
        for b in range(num_buckets):
            ll = bucket_sum_ll[b]
            rr = bucket_sum_rr[b]
            lr = bucket_sum_lr[b]
            b_rms = math.sqrt(max(1e-12, (ll + rr) / (2.0 * max(1, bucket_samples[b]))))
            b_rms_dbfs = 20.0 * math.log10(b_rms)
            if b_rms_dbfs >= -60.0:  # Silence gate
                denom = math.sqrt(max(1e-12, ll * rr))
                corr = max(-1.0, min(1.0, lr / denom))
                bucket_correlations.append(corr)

        if bucket_correlations:
            phase_correlation_mean = round(float(np.mean(bucket_correlations)), 2)
            phase_correlation_min = round(float(np.min(bucket_correlations)), 2)
        else:
            phase_correlation_mean = 1.0
            phase_correlation_min = 1.0

        # Orthonormal Mid/Side Stereo Width Index
        rms_mid = math.sqrt(max(1e-12, sum_sq_mid / max(1, total_samples)))
        rms_side = math.sqrt(max(1e-12, sum_sq_side / max(1, total_samples)))
        width_ratio = (math.sqrt(2.0) * rms_side) / (rms_mid + rms_side + 1e-12)
        stereo_width_index = round(float(min(100.0, max(0.0, width_ratio * 100.0))), 1)

    # Assemble timeline buckets
    # Pre-index loudness frames by timestamp if available
    loudness_lookup = []
    if loudness_frames:
        loudness_lookup = sorted(loudness_frames, key=lambda x: x[0])

    def find_nearest_lufs(t: float) -> Tuple[Optional[float], Optional[float]]:
        if not loudness_lookup:
            return None, None
        best = min(loudness_lookup, key=lambda x: abs(x[0] - t))
        m_val = None if best[1] <= -100.0 else round(best[1], 1)
        s_val = None if best[2] <= -100.0 else round(best[2], 1)
        return m_val, s_val

    buckets: List[Dict[str, Any]] = []
    for b in range(num_buckets):
        start_sec = round(b * bucket_duration, 2)
        end_sec = round(min(duration_seconds, (b + 1) * bucket_duration), 2)
        p_val = bucket_peak[b]
        p_dbfs = -120.0 if p_val <= 1e-6 else round(20.0 * math.log10(p_val), 1)

        b_samp = max(1, bucket_samples[b] * channels)
        rms_val = math.sqrt(max(1e-12, bucket_sum_sq[b] / b_samp))
        b_rms_dbfs = -120.0 if rms_val <= 1e-6 else round(20.0 * math.log10(rms_val), 1)

        mid_t = (start_sec + end_sec) / 2.0
        m_lufs, s_lufs = find_nearest_lufs(mid_t)

        b_corr: Optional[float] = None
        if channels == 2:
            ll = bucket_sum_ll[b]
            rr = bucket_sum_rr[b]
            lr = bucket_sum_lr[b]
            if b_rms_dbfs >= -60.0:
                denom = math.sqrt(max(1e-12, ll * rr))
                b_corr = round(float(max(-1.0, min(1.0, lr / denom))), 2)

        buckets.append({
            "start_sec": start_sec,
            "end_sec": end_sec,
            "peak_dbfs": p_dbfs,
            "rms_dbfs": b_rms_dbfs,
            "momentary_lufs": m_lufs,
            "short_term_lufs": s_lufs,
            "phase_correlation": b_corr,
            "clipped": bool(bucket_clipped[b]),
        })

    timeline = {
        "bucket_duration_sec": round(bucket_duration, 3),
        "total_duration_sec": round(duration_seconds, 2),
        "buckets": buckets,
    }

    return {
        "sample_peak_max_dbfs": sample_peak_max_dbfs,
        "sample_clipping_events": contiguous_clipping_events,
        "global_rms_dbfs": global_rms_dbfs,
        "crest_factor_db": crest_factor_db,
        "phase_correlation_mean": phase_correlation_mean,
        "phase_correlation_min": phase_correlation_min,
        "stereo_width_index": stereo_width_index,
        "timeline": timeline,
        "unavailable_reasons": unavailable_reasons,
    }

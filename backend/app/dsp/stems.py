"""
Phase 4 Original User-Uploaded Stem Diagnostics Engine for MixLearn Studio.

Enforces Non-Negotiable Product Rule #1:
- Operates EXCLUSIVELY on 2–8 original DAW stems deliberately uploaded by the user.
- Never fabricates, splits, or approximates stems from a stereo mixdown.

Render 512 MB RAM Safety:
- Streams uploads with strict 100 MB per-file and 350 MB total limits.
- Processes decoded stems using chunked soundfile.blocks() reads inside an
  EphemeralAudioWorkspace and deletes decoded PCM scratch files immediately.
"""

from datetime import datetime, timezone
import hashlib
import logging
import math
from pathlib import Path
import subprocess
from typing import Any, Dict, List, Optional, Tuple
import uuid

from fastapi import HTTPException, UploadFile, status
import numpy as np
from scipy.signal import resample_poly
import soundfile as sf

from backend.app.dsp.loudness import measure_loudness_ebur128
from backend.app.dsp.media_probe import (
    CHUNK_SIZE,
    probe_media_file,
    resolve_binary,
)
from backend.app.dsp.pipeline import sanitize_display_filename, sanitize_floats

logger = logging.getLogger("mixlearn.dsp.stems")

MIN_STEMS = 2
MAX_STEMS = 8
MAX_STEM_FILE_BYTES = 104_857_600  # 100 MiB per file
MAX_TOTAL_STEMS_BYTES = 367_001_600  # 350 MiB total across stems
MAX_DURATION_MISMATCH_MS = 50.0  # Strict <= 50 ms alignment tolerance
STREAM_BLOCK_FRAMES = 65536  # ~512 KB per float32 stereo block

SIX_OCTAVE_BANDS: List[Tuple[str, str, float, float]] = [
    ("sub", "Sub (20–60 Hz)", 20.0, 60.0),
    ("low", "Low (60–250 Hz)", 60.0, 250.0),
    ("low_mid", "Low-Mid (250–800 Hz)", 250.0, 800.0),
    ("high_mid", "High-Mid (800–4k Hz)", 800.0, 4000.0),
    ("presence", "Presence (4–10k Hz)", 4000.0, 10000.0),
    ("air", "Air (10–20k Hz)", 10000.0, 20000.0),
]

PROHIBITED_STEM_DETAIL = {
    "error_code": "PROHIBITED_AI_STEM_SEPARATION",
    "message": (
        "Product Rule 1 Violation: AI stem separation, automatic stem splitting, "
        "and pseudo-stems are strictly forbidden. Upload 2–8 genuine original DAW stems only."
    ),
}


def stream_stem_upload_with_limits(
    upload_file: UploadFile,
    dest_path: Path,
    running_total_bytes: int,
    max_file_bytes: int = MAX_STEM_FILE_BYTES,
    max_total_bytes: int = MAX_TOTAL_STEMS_BYTES,
) -> Tuple[int, str]:
    """
    Streams an uploaded stem file in 64 KiB chunks to disk while enforcing
    both the 100 MB per-file cap and 350 MB combined upload cap.
    """
    try:
        dest_path.resolve().relative_to(dest_path.parent.resolve())
    except (ValueError, RuntimeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error_code": "ILLEGAL_PATH_TRAVERSAL",
                "message": "Illegal path traversal attempt detected in stem upload destination.",
            },
        )

    hasher = hashlib.sha256()
    file_bytes = 0

    try:
        with open(dest_path, "wb") as out_f:
            while True:
                chunk = upload_file.file.read(CHUNK_SIZE)
                if not chunk:
                    break
                file_bytes += len(chunk)
                if file_bytes > max_file_bytes:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail={
                            "error_code": "STEM_FILE_TOO_LARGE",
                            "message": (
                                f"Stem '{sanitize_display_filename(upload_file.filename or 'stem')}' "
                                f"exceeds the 100 MB per-file limit."
                            ),
                        },
                    )
                if running_total_bytes + file_bytes > max_total_bytes:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail={
                            "error_code": "TOTAL_STEM_UPLOAD_TOO_LARGE",
                            "message": "Combined stem upload exceeds the 350 MB session limit.",
                        },
                    )
                hasher.update(chunk)
                out_f.write(chunk)
    except HTTPException:
        dest_path.unlink(missing_ok=True)
        raise
    except Exception as exc:
        dest_path.unlink(missing_ok=True)
        logger.error("Error streaming stem upload to disk: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error_code": "UPLOAD_IO_ERROR",
                "message": "Encountered an internal disk error while storing uploaded stem.",
            },
        )

    if file_bytes == 0:
        dest_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error_code": "EMPTY_FILE",
                "message": f"Uploaded stem '{sanitize_display_filename(upload_file.filename or 'stem')}' is empty (0 bytes).",
            },
        )

    return file_bytes, hasher.hexdigest()


def decode_stem_to_pcm_f32le(
    raw_path: Path,
    decoded_wav_path: Path,
    target_sample_rate: Optional[int] = None,
    force_stereo: bool = False,
) -> Path:
    """
    Decodes an audio file into float32 PCM WAV, optionally normalizing sample rate
    and channel layout for aligned residual summation.
    """
    ffmpeg_bin = resolve_binary("ffmpeg")
    cmd = [
        ffmpeg_bin,
        "-nostdin",
        "-hide_banner",
        "-y",
        "-i", str(raw_path),
    ]
    if target_sample_rate is not None:
        cmd.extend(["-ar", str(target_sample_rate)])
    if force_stereo:
        cmd.extend(["-ac", "2"])
    cmd.extend(["-c:a", "pcm_f32le", str(decoded_wav_path)])

    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=45, shell=False)
    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error_code": "DECODE_TIMEOUT",
                "message": "Stem audio decoding timed out after 45 seconds.",
            },
        )
    except Exception as exc:
        logger.error("FFmpeg stem decode error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error_code": "DECODE_EXECUTION_ERROR",
                "message": "Audio decoder encountered an internal error while decoding a stem.",
            },
        )

    if res.returncode != 0 or not decoded_wav_path.exists() or decoded_wav_path.stat().st_size == 0:
        logger.error("FFmpeg stem decode failed (%s): %s", res.returncode, res.stderr[:300])
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error_code": "DECODE_FAILED",
                "message": "Failed to decode uploaded stem audio into PCM float32.",
            },
        )
    return decoded_wav_path


def compute_streaming_spectral_and_peak(
    decoded_wav_path: Path,
    compute_true_peak_fallback: bool = False,
) -> Dict[str, Any]:
    """
    Streams a decoded PCM WAV using soundfile.blocks() to stay well below
    Render's 512 MB RAM ceiling.

    Computes:
    - sample_peak_dbfs
    - optional chunked 4x polyphase true_peak_dbtp fallback
    - rms_dbfs
    - 6-band Welch-equivalent averaged periodogram energies (dBFS)
    - spectral_centroid_hz (power-weighted mean frequency)
    """
    info = sf.info(str(decoded_wav_path))
    sr = int(info.samplerate)
    total_frames = int(info.frames)
    channels = int(info.channels)
    nyquist = sr / 2.0

    nperseg = min(4096, max(256, 2 ** int(math.floor(math.log2(max(256, min(4096, total_frames)))))))
    if total_frames < 256:
        nperseg = max(64, total_frames)
    hop = max(1, nperseg // 2)
    window = np.hanning(nperseg).astype(np.float64)
    win_power = float(np.sum(window ** 2))
    freqs = np.fft.rfftfreq(nperseg, d=1.0 / sr)
    psd_accum = np.zeros(len(freqs), dtype=np.float64)
    segment_count = 0

    max_sample_abs = 0.0
    max_tp_abs = 0.0
    sum_sq = 0.0
    total_samples = 0

    carry = np.empty((0, channels), dtype=np.float32)
    tp_tail = np.empty((0, channels), dtype=np.float32)

    for block in sf.blocks(
        str(decoded_wav_path),
        blocksize=STREAM_BLOCK_FRAMES,
        dtype="float32",
        always_2d=True,
    ):
        if block.size == 0:
            continue

        blk_peak = float(np.max(np.abs(block)))
        if blk_peak > max_sample_abs:
            max_sample_abs = blk_peak

        sum_sq += float(np.sum(block.astype(np.float64) ** 2))
        total_samples += block.size

        if compute_true_peak_fallback:
            tp_chunk = np.vstack([tp_tail, block]) if tp_tail.size else block
            oversampled = resample_poly(tp_chunk.astype(np.float64), up=4, down=1, axis=0)
            chunk_tp = float(np.max(np.abs(oversampled)))
            if chunk_tp > max_tp_abs:
                max_tp_abs = chunk_tp
            tp_tail = block[-64:] if block.shape[0] >= 64 else block

        # Streaming Welch PSD accumulation with 50% overlap
        buf = np.vstack([carry, block]) if carry.size else block
        pos = 0
        while pos + nperseg <= buf.shape[0]:
            seg = buf[pos : pos + nperseg, :]
            seg_psd = np.zeros(len(freqs), dtype=np.float64)
            for ch in range(channels):
                xw = seg[:, ch].astype(np.float64) * window
                spec = np.fft.rfft(xw)
                pxx = (np.abs(spec) ** 2) / (sr * win_power)
                if len(pxx) > 2:
                    pxx[1:-1] *= 2.0
                seg_psd += pxx
            psd_accum += seg_psd / float(channels)
            segment_count += 1
            pos += hop
        carry = buf[pos:]

    # Handle very short files that didn't fill a full nperseg window
    if segment_count == 0 and carry.shape[0] >= 64:
        n_short = carry.shape[0]
        w_short = np.hanning(n_short).astype(np.float64)
        wp_short = float(np.sum(w_short ** 2))
        freqs = np.fft.rfftfreq(n_short, d=1.0 / sr)
        psd_accum = np.zeros(len(freqs), dtype=np.float64)
        for ch in range(channels):
            spec = np.fft.rfft(carry[:, ch].astype(np.float64) * w_short)
            pxx = (np.abs(spec) ** 2) / (sr * wp_short)
            if len(pxx) > 2:
                pxx[1:-1] *= 2.0
            psd_accum += pxx
        psd_accum /= float(channels)
        segment_count = 1

    sample_peak_dbfs: Optional[float] = (
        round(20.0 * math.log10(max_sample_abs), 2) if max_sample_abs > 1e-12 else None
    )
    fallback_tp_dbtp: Optional[float] = (
        round(20.0 * math.log10(max_tp_abs), 2)
        if compute_true_peak_fallback and max_tp_abs > 1e-12
        else None
    )
    rms_lin = math.sqrt(sum_sq / total_samples) if total_samples > 0 else 0.0
    rms_dbfs: Optional[float] = (
        round(20.0 * math.log10(rms_lin), 2) if rms_lin > 1e-12 else None
    )

    six_band_energies_db: Dict[str, Optional[float]] = {}
    spectral_centroid_hz: Optional[float] = None

    if segment_count > 0:
        avg_psd = psd_accum / float(segment_count)
        df = freqs[1] - freqs[0] if len(freqs) > 1 else 1.0

        # Spectral centroid across audible spectrum (20 Hz to min(20 kHz, Nyquist))
        audible_mask = (freqs >= 20.0) & (freqs <= min(20000.0, nyquist))
        audible_power = float(np.sum(avg_psd[audible_mask]))
        if audible_power > 1e-15:
            spectral_centroid_hz = round(
                float(np.sum(freqs[audible_mask] * avg_psd[audible_mask]) / audible_power),
                1,
            )

        for band_key, _, low_hz, high_hz in SIX_OCTAVE_BANDS:
            if nyquist < high_hz:
                six_band_energies_db[band_key] = None
                continue
            mask = (freqs >= low_hz) & (freqs <= high_hz)
            if not np.any(mask):
                six_band_energies_db[band_key] = None
                continue
            # Trapezoidal or rectangular band power integration
            band_f = freqs[mask]
            band_p = avg_psd[mask]
            if len(band_f) >= 2:
                band_power = float(np.trapz(band_p, band_f)) if hasattr(np, "trapz") else float(np.trapezoid(band_p, band_f))
            else:
                band_power = float(band_p[0] * df)
            if band_power <= 1e-12:
                six_band_energies_db[band_key] = -120.0
            else:
                six_band_energies_db[band_key] = round(10.0 * math.log10(band_power), 1)
    else:
        for band_key, _, _, _ in SIX_OCTAVE_BANDS:
            six_band_energies_db[band_key] = None

    return {
        "sample_peak_dbfs": sample_peak_dbfs,
        "fallback_true_peak_dbtp": fallback_tp_dbtp,
        "rms_dbfs": rms_dbfs,
        "spectral_centroid_hz": spectral_centroid_hz,
        "six_band_energies_db": six_band_energies_db,
    }


def _compute_band_overlap(
    db_a: Optional[float],
    db_b: Optional[float],
    peak_band_a: float,
    peak_band_b: float,
) -> Dict[str, Any]:
    """
    Computes deterministic spectral overlap intensity for one band between two stems.
    Explicitly models potential spectral masking (never definitive psychoacoustic masking).
    """
    if db_a is None or db_b is None or db_a <= -60.0 or db_b <= -60.0:
        return {
            "stem_a_db": db_a,
            "stem_b_db": db_b,
            "level_diff_db": None,
            "overlap_score": 0.0,
            "severity": "low",
        }

    # Prominence of each stem within this band relative to its own strongest band
    prom_a = max(0.0, min(1.0, (db_a - (peak_band_a - 24.0)) / 24.0))
    prom_b = max(0.0, min(1.0, (db_b - (peak_band_b - 24.0)) / 24.0))

    # Absolute loudness gate (-52 dBFS floor -> -14 dBFS full)
    abs_floor = min(db_a, db_b)
    abs_factor = max(0.0, min(1.0, (abs_floor + 52.0) / 34.0))

    # Proximity factor: stems within 0..18 dB of each other compete more strongly
    level_diff = abs(db_a - db_b)
    proximity = max(0.0, 1.0 - (level_diff / 18.0))

    # Combined deterministic overlap index [0.0 .. 1.0]
    score = round(math.sqrt(prom_a * prom_b) * (0.45 + 0.55 * proximity) * abs_factor, 3)

    if score >= 0.62:
        severity = "high"
    elif score >= 0.36:
        severity = "moderate"
    else:
        severity = "low"

    return {
        "stem_a_db": round(db_a, 1),
        "stem_b_db": round(db_b, 1),
        "level_diff_db": round(level_diff, 1),
        "overlap_score": score,
        "severity": severity,
    }


def build_pairwise_overlap_matrix(stems: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Builds the 6-band pairwise frequency overlap matrix across all uploaded stems.
    """
    stem_peak_band: Dict[str, float] = {}
    for stem in stems:
        vals = [
            v for v in stem["six_band_energies_db"].values()
            if isinstance(v, (int, float)) and v > -110.0
        ]
        stem_peak_band[stem["stem_id"]] = max(vals) if vals else -60.0

    pairs: List[Dict[str, Any]] = []
    high_overlap_highlights: List[Dict[str, Any]] = []

    for i in range(len(stems)):
        for j in range(i + 1, len(stems)):
            s_a = stems[i]
            s_b = stems[j]
            band_overlaps: Dict[str, Dict[str, Any]] = {}
            max_score = 0.0
            dominant_band_key = "low"
            dominant_band_label = "Low (60–250 Hz)"

            for band_key, band_label, _, _ in SIX_OCTAVE_BANDS:
                ov = _compute_band_overlap(
                    s_a["six_band_energies_db"].get(band_key),
                    s_b["six_band_energies_db"].get(band_key),
                    stem_peak_band[s_a["stem_id"]],
                    stem_peak_band[s_b["stem_id"]],
                )
                band_overlaps[band_key] = ov
                if ov["overlap_score"] > max_score:
                    max_score = ov["overlap_score"]
                    dominant_band_key = band_key
                    dominant_band_label = band_label

                if ov["severity"] in ("high", "moderate"):
                    high_overlap_highlights.append({
                        "stem_a": s_a["stem_name"],
                        "stem_b": s_b["stem_name"],
                        "band_key": band_key,
                        "band_label": band_label,
                        "severity": ov["severity"],
                        "overlap_score": ov["overlap_score"],
                        "stem_a_db": ov["stem_a_db"],
                        "stem_b_db": ov["stem_b_db"],
                        "note": (
                            f"Potential spectral masking between '{s_a['stem_name']}' "
                            f"({ov['stem_a_db']} dBFS) and '{s_b['stem_name']}' ({ov['stem_b_db']} dBFS) "
                            f"in {band_label}. Verify with solo/mute and complementary EQ carving."
                        ),
                    })

            overall_severity = (
                "high" if max_score >= 0.62 else "moderate" if max_score >= 0.36 else "low"
            )
            pairs.append({
                "stem_a_id": s_a["stem_id"],
                "stem_a_name": s_a["stem_name"],
                "stem_b_id": s_b["stem_id"],
                "stem_b_name": s_b["stem_name"],
                "peak_overlap_band": dominant_band_key,
                "peak_overlap_band_label": dominant_band_label,
                "peak_overlap_score": round(max_score, 3),
                "severity": overall_severity,
                "bands": band_overlaps,
                "summary": (
                    f"Highest shared energy in {dominant_band_label} "
                    f"(potential spectral masking: {overall_severity})."
                ),
            })

    high_overlap_highlights.sort(key=lambda item: item["overlap_score"], reverse=True)

    return {
        "bands": [
            {"key": k, "label": label, "low_hz": lo, "high_hz": hi}
            for k, label, lo, hi in SIX_OCTAVE_BANDS
        ],
        "pairs": pairs,
        "highlights": high_overlap_highlights[:12],
        "methodology_note": (
            "Measured via chunked Hann-windowed Welch PSD across 6 octave bands on genuine "
            "user-uploaded stems. Overlap values flag potential spectral masking zones—not "
            "definitive psychoacoustic masking—and should be verified by ear."
        ),
    }


def _accumulate_stem_into_sum_file(
    stem_wav_path: Path,
    sum_raw_path: Path,
    target_frames: int,
    is_first: bool,
) -> None:
    """
    Streams a decoded stereo float32 stem and adds it sample-by-sample into a raw
    float32 accumulator file on disk (keeping memory usage < 4 MB).
    """
    chunk_frames = STREAM_BLOCK_FRAMES
    frames_written = 0
    mode = "wb" if is_first else "r+b"

    with sf.SoundFile(str(stem_wav_path), "r") as sf_in, open(sum_raw_path, mode) as sum_f:
        while frames_written < target_frames:
            n_read = min(chunk_frames, target_frames - frames_written)
            block = sf_in.read(frames=n_read, dtype="float32", always_2d=True)
            if block.shape[0] < n_read:
                pad = np.zeros((n_read - block.shape[0], block.shape[1]), dtype=np.float32)
                block = np.vstack([block, pad])
            if block.shape[1] == 1:
                block = np.repeat(block, 2, axis=1)
            elif block.shape[1] > 2:
                block = block[:, :2]

            if is_first:
                sum_f.write(block.tobytes())
            else:
                pos = sum_f.tell()
                existing_bytes = sum_f.read(n_read * 2 * 4)
                existing = np.frombuffer(existing_bytes, dtype=np.float32).reshape((-1, 2))
                updated = (existing + block[: existing.shape[0]]).astype(np.float32)
                sum_f.seek(pos)
                sum_f.write(updated.tobytes())

            frames_written += n_read


def _compute_primary_mix_residual(
    sum_raw_path: Path,
    primary_decoded_wav: Path,
    target_frames: int,
) -> Dict[str, Any]:
    """
    Compares the linear stem sum against the uploaded primary stereo mixdown
    in streaming blocks to compute residual RMS & loudness delta.
    """
    chunk_frames = STREAM_BLOCK_FRAMES
    frames_done = 0
    sum_sq_mix = 0.0
    sum_sq_stems = 0.0
    sum_sq_residual = 0.0
    peak_residual = 0.0
    total_samples = 0

    with sf.SoundFile(str(primary_decoded_wav), "r") as sf_mix, open(sum_raw_path, "rb") as sum_f:
        while frames_done < target_frames:
            n_read = min(chunk_frames, target_frames - frames_done)
            mix_blk = sf_mix.read(frames=n_read, dtype="float32", always_2d=True)
            raw_bytes = sum_f.read(n_read * 2 * 4)
            if not raw_bytes or mix_blk.size == 0:
                break
            stems_blk = np.frombuffer(raw_bytes, dtype=np.float32).reshape((-1, 2))
            if mix_blk.shape[1] == 1:
                mix_blk = np.repeat(mix_blk, 2, axis=1)
            m = min(mix_blk.shape[0], stems_blk.shape[0])
            if m == 0:
                break
            mix_64 = mix_blk[:m, :2].astype(np.float64)
            stems_64 = stems_blk[:m, :2].astype(np.float64)
            diff_64 = mix_64 - stems_64

            sum_sq_mix += float(np.sum(mix_64 ** 2))
            sum_sq_stems += float(np.sum(stems_64 ** 2))
            sum_sq_residual += float(np.sum(diff_64 ** 2))
            blk_peak = float(np.max(np.abs(diff_64)))
            if blk_peak > peak_residual:
                peak_residual = blk_peak
            total_samples += m * 2
            frames_done += m

    rms_mix = math.sqrt(sum_sq_mix / total_samples) if total_samples > 0 else 0.0
    rms_stems = math.sqrt(sum_sq_stems / total_samples) if total_samples > 0 else 0.0
    rms_res = math.sqrt(sum_sq_residual / total_samples) if total_samples > 0 else 0.0

    mix_rms_dbfs = round(20.0 * math.log10(rms_mix), 2) if rms_mix > 1e-12 else None
    stems_rms_dbfs = round(20.0 * math.log10(rms_stems), 2) if rms_stems > 1e-12 else None
    res_rms_dbfs = round(20.0 * math.log10(rms_res), 2) if rms_res > 1e-12 else -120.0
    res_peak_dbfs = round(20.0 * math.log10(peak_residual), 2) if peak_residual > 1e-12 else -120.0
    rms_diff_db = (
        round(mix_rms_dbfs - stems_rms_dbfs, 2)
        if mix_rms_dbfs is not None and stems_rms_dbfs is not None
        else None
    )
    residual_ratio_pct = round(min(999.9, (rms_res / max(rms_mix, 1e-9)) * 100.0), 1) if rms_mix > 1e-12 else 0.0

    return {
        "available": True,
        "primary_mix_rms_dbfs": mix_rms_dbfs,
        "stem_sum_rms_dbfs": stems_rms_dbfs,
        "rms_difference_db": rms_diff_db,
        "residual_rms_dbfs": res_rms_dbfs,
        "residual_peak_dbfs": res_peak_dbfs,
        "residual_energy_ratio_percent": residual_ratio_pct,
        "interpretation_note": (
            "Non-zero residual between the linear stem sum and stereo mixdown is expected when "
            "master-bus compression, saturation, limiting, stereo bus EQ, or parallel send FX "
            "were applied during bounce, or if any DAW stem was omitted."
        ),
    }


def analyze_stems_workspace(
    workspace: Path,
    stem_uploads: List[UploadFile],
    primary_mix_upload: Optional[UploadFile] = None,
    stem_roles: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Executes memory-safe Phase 4 multitrack stem diagnostics on 2–8 genuine
    user-uploaded original stems inside an EphemeralAudioWorkspace.
    """
    if len(stem_uploads) == 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error_code": "PROHIBITED_AI_STEM_SEPARATION",
                "message": (
                    "Product Rule 1: Stem diagnostics require 2–8 original user-uploaded stems. "
                    "A single stereo mixdown cannot be split into stems because AI stem separation is permanently prohibited."
                ),
            },
        )

    if len(stem_uploads) < MIN_STEMS or len(stem_uploads) > MAX_STEMS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error_code": "INVALID_STEM_COUNT",
                "message": f"Upload between {MIN_STEMS} and {MAX_STEMS} original stems (received {len(stem_uploads)}).",
            },
        )

    running_bytes = 0
    staged_stems: List[Dict[str, Any]] = []

    # 1. Stream all stem files to workspace and probe alignment first
    for idx, upload in enumerate(stem_uploads):
        raw_name = sanitize_display_filename(upload.filename or f"stem_{idx + 1}.wav")
        ext = Path(raw_name).suffix.lower()
        if not ext or len(ext) > 8 or not ext[1:].isalnum():
            ext = ".bin"
        dest_raw = workspace / f"stem_raw_{idx}_{uuid.uuid4().hex[:8]}{ext}"
        file_bytes, sha256_hex = stream_stem_upload_with_limits(
            upload_file=upload,
            dest_path=dest_raw,
            running_total_bytes=running_bytes,
        )
        running_bytes += file_bytes
        probe_meta = probe_media_file(dest_raw)
        role = (
            stem_roles[idx]
            if stem_roles and idx < len(stem_roles) and stem_roles[idx]
            else "original_stem"
        )
        staged_stems.append({
            "index": idx,
            "stem_id": f"stem-{idx + 1}",
            "stem_name": raw_name,
            "stem_role": role,
            "raw_path": dest_raw,
            "file_size_bytes": file_bytes,
            "sha256_checksum": sha256_hex,
            "probe": probe_meta,
        })

    # Optional primary mix staging
    staged_primary: Optional[Dict[str, Any]] = None
    if primary_mix_upload is not None:
        p_name = sanitize_display_filename(primary_mix_upload.filename or "primary_mix.wav")
        p_ext = Path(p_name).suffix.lower()
        if not p_ext or len(p_ext) > 8 or not p_ext[1:].isalnum():
            p_ext = ".bin"
        p_dest = workspace / f"primary_mix_{uuid.uuid4().hex[:8]}{p_ext}"
        p_bytes, p_sha = stream_stem_upload_with_limits(
            upload_file=primary_mix_upload,
            dest_path=p_dest,
            running_total_bytes=0,
            max_file_bytes=MAX_STEM_FILE_BYTES,
            max_total_bytes=MAX_STEM_FILE_BYTES,
        )
        staged_primary = {
            "filename": p_name,
            "raw_path": p_dest,
            "file_size_bytes": p_bytes,
            "sha256_checksum": p_sha,
            "probe": probe_media_file(p_dest),
        }

    # 2. Strict Alignment Verification (<= 50 ms duration tolerance across stems)
    durations = [s["probe"]["duration_seconds"] for s in staged_stems]
    min_dur = min(durations)
    max_dur = max(durations)
    max_diff_ms = round((max_dur - min_dur) * 1000.0, 2)

    if max_diff_ms > MAX_DURATION_MISMATCH_MS:
        stem_durations_summary = [
            {"stem_name": s["stem_name"], "duration_seconds": round(s["probe"]["duration_seconds"], 4)}
            for s in staged_stems
        ]
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error_code": "STEM_ALIGNMENT_MISMATCH",
                "message": (
                    f"Uploaded stems are misaligned by {max_diff_ms:.1f} ms "
                    f"(maximum allowed tolerance is {MAX_DURATION_MISMATCH_MS:.0f} ms). "
                    "Export all stems from the exact same DAW start and end locators."
                ),
                "max_duration_diff_ms": max_diff_ms,
                "tolerance_ms": MAX_DURATION_MISMATCH_MS,
                "stem_durations": stem_durations_summary,
            },
        )

    sample_rates = sorted({s["probe"]["sample_rate_hz"] for s in staged_stems})
    alignment_warnings: List[str] = []
    target_sr = sample_rates[0]
    if len(sample_rates) > 1:
        target_sr = max(sample_rates)
        alignment_warnings.append(
            f"Mixed stem sample rates detected ({', '.join(str(r) + ' Hz' for r in sample_rates)}). "
            f"Normalized internally to {target_sr} Hz for aligned comparison."
        )

    primary_duration_aligned = False
    if staged_primary is not None:
        p_dur = staged_primary["probe"]["duration_seconds"]
        p_diff_ms = round(abs(p_dur - min_dur) * 1000.0, 2)
        if p_diff_ms <= MAX_DURATION_MISMATCH_MS:
            primary_duration_aligned = True
        else:
            alignment_warnings.append(
                f"Primary stereo mix duration differs from stems by {p_diff_ms:.1f} ms (> 50 ms); "
                "stem-sum vs. primary-mix residual calculation skipped."
            )

    # 3. Process each stem sequentially with chunked reads and immediate scratch cleanup
    analyzed_stems: List[Dict[str, Any]] = []
    sum_raw_path = workspace / f"stem_sum_{uuid.uuid4().hex[:8]}.f32"
    target_sum_frames = int(round(min_dur * target_sr))

    for idx, staged in enumerate(staged_stems):
        decoded_path = workspace / f"stem_dec_{idx}_{uuid.uuid4().hex[:8]}.wav"
        try:
            need_resample = staged["probe"]["sample_rate_hz"] != target_sr
            decode_stem_to_pcm_f32le(
                raw_path=staged["raw_path"],
                decoded_wav_path=decoded_path,
                target_sample_rate=target_sr if need_resample else None,
                force_stereo=primary_duration_aligned,
            )

            # EBU R128 Loudness & 4x True Peak (FFmpeg streams in C with minimal RAM)
            loudness_res = measure_loudness_ebur128(
                decoded_wav_path=decoded_path,
                duration_seconds=staged["probe"]["duration_seconds"],
                sample_rate_hz=target_sr,
            )

            # Chunked streaming Peak, Spectral Centroid & 6-Band PSD
            need_tp_fallback = loudness_res.get("true_peak_dbtp") is None
            spec_peak_res = compute_streaming_spectral_and_peak(
                decoded_wav_path=decoded_path,
                compute_true_peak_fallback=need_tp_fallback,
            )

            true_peak_dbtp = (
                loudness_res.get("true_peak_dbtp")
                if loudness_res.get("true_peak_dbtp") is not None
                else spec_peak_res.get("fallback_true_peak_dbtp")
            )
            sample_peak_dbfs = spec_peak_res["sample_peak_dbfs"]
            headroom_db = (
                round(-true_peak_dbtp, 2)
                if true_peak_dbtp is not None
                else (round(-sample_peak_dbfs, 2) if sample_peak_dbfs is not None else None)
            )

            if primary_duration_aligned and target_sum_frames > 0:
                _accumulate_stem_into_sum_file(
                    stem_wav_path=decoded_path,
                    sum_raw_path=sum_raw_path,
                    target_frames=target_sum_frames,
                    is_first=(idx == 0),
                )

            analyzed_stems.append({
                "stem_id": staged["stem_id"],
                "stem_name": staged["stem_name"],
                "stem_role": staged["stem_role"],
                "stem_source_type": "user_uploaded_original",
                "duration_seconds": round(staged["probe"]["duration_seconds"], 3),
                "sample_rate_hz": staged["probe"]["sample_rate_hz"],
                "channels": staged["probe"]["channels"],
                "file_size_bytes": staged["file_size_bytes"],
                "integrated_lufs": (
                    round(float(loudness_res["integrated_lufs"]), 2)
                    if loudness_res.get("integrated_lufs") is not None
                    else None
                ),
                "sample_peak_dbfs": sample_peak_dbfs,
                "true_peak_dbtp": round(float(true_peak_dbtp), 2) if true_peak_dbtp is not None else None,
                "headroom_db": headroom_db,
                "rms_dbfs": spec_peak_res["rms_dbfs"],
                "spectral_centroid_hz": spec_peak_res["spectral_centroid_hz"],
                "six_band_energies_db": spec_peak_res["six_band_energies_db"],
            })
        finally:
            # Immediately purge decoded float32 PCM and raw upload to keep disk/RAM minimal
            decoded_path.unlink(missing_ok=True)
            staged["raw_path"].unlink(missing_ok=True)

    # 4. Pairwise 6-band frequency overlap matrix
    overlap_matrix = build_pairwise_overlap_matrix(analyzed_stems)

    # 5. Optional primary stereo mix residual summary
    primary_mix_residual: Optional[Dict[str, Any]] = None
    if staged_primary is not None:
        if primary_duration_aligned and sum_raw_path.exists() and target_sum_frames > 0:
            primary_decoded = workspace / f"primary_dec_{uuid.uuid4().hex[:8]}.wav"
            try:
                decode_stem_to_pcm_f32le(
                    raw_path=staged_primary["raw_path"],
                    decoded_wav_path=primary_decoded,
                    target_sample_rate=target_sr,
                    force_stereo=True,
                )
                primary_mix_residual = _compute_primary_mix_residual(
                    sum_raw_path=sum_raw_path,
                    primary_decoded_wav=primary_decoded,
                    target_frames=target_sum_frames,
                )
                primary_mix_residual["primary_mix_filename"] = staged_primary["filename"]
            finally:
                primary_decoded.unlink(missing_ok=True)
                staged_primary["raw_path"].unlink(missing_ok=True)
        else:
            staged_primary["raw_path"].unlink(missing_ok=True)
            primary_mix_residual = {
                "available": False,
                "primary_mix_filename": staged_primary["filename"],
                "reason": "primary_mix_duration_mismatch",
                "interpretation_note": (
                    "Primary stereo mix duration differed from uploaded stems by more than 50 ms; "
                    "stem-sum residual was skipped."
                ),
            }

    sum_raw_path.unlink(missing_ok=True)

    result = {
        "schema_version": "2.0.0",
        "analysis_id": f"stems-{uuid.uuid4()}",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "has_user_stems": True,
        "stem_source_type": "user_uploaded_original",
        "rule_1_compliance_notice": (
            "Product Rule 1 Verified: All stem metrics were computed exclusively from genuine "
            "user-uploaded original DAW stems. Zero AI stem separation was performed."
        ),
        "stem_count": len(analyzed_stems),
        "total_upload_bytes": running_bytes,
        "alignment": {
            "aligned": True,
            "tolerance_ms": MAX_DURATION_MISMATCH_MS,
            "max_duration_diff_ms": max_diff_ms,
            "reference_duration_seconds": round(min_dur, 3),
            "sample_rates_hz": sample_rates,
            "normalized_sample_rate_hz": target_sr,
            "warnings": alignment_warnings,
        },
        "stems": analyzed_stems,
        "overlap_matrix": overlap_matrix,
        "primary_mix_residual": primary_mix_residual,
    }
    return sanitize_floats(result)

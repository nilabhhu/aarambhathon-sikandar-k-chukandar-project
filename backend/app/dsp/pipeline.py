"""
Master DSP Pipeline orchestrator for MixLearn Studio Phase 2.
Coordinates media probing, decoding, loudness, waveform, spectral, and diagnostics
within an EphemeralAudioWorkspace. Sanitizes NaN/Inf and validates against schema v2.0.0.
"""

from datetime import datetime, timezone
import json
import math
from pathlib import Path
from typing import Any, Dict, List, Optional
import uuid

from fastapi import HTTPException, UploadFile, status
import jsonschema

from backend.app.dsp.diagnostics import evaluate_diagnostics
from backend.app.dsp.loudness import measure_loudness_ebur128
from backend.app.dsp.media_probe import (
    decode_to_pcm_f32le,
    probe_media_file,
    stream_upload_and_hash,
)
from backend.app.dsp.spectral import compute_spectral_metrics
from backend.app.dsp.waveform_metrics import compute_waveform_metrics

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
SCHEMA_FILE = BASE_DIR / "contracts" / "analysis_report.schema.json"


def sanitize_floats(obj: Any) -> Any:
    """
    Recursively replaces NaN, +Inf, -Inf with None to guarantee strict JSON RFC compliance.
    """
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    elif isinstance(obj, dict):
        return {k: sanitize_floats(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_floats(x) for x in obj]
    return obj


def _build_measurement_item(
    value: Optional[float],
    unit: str,
    standard: str,
    target_min: Optional[float],
    target_max: Optional[float],
    algorithm_detail: str,
    unavailable_reason: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Constructs a schema-compliant measurementValue dictionary.
    """
    if value is None:
        return {
            "value": None,
            "unit": unit,
            "standard": standard,
            "target_min": target_min,
            "target_max": target_max,
            "status": "unavailable",
            "source": "mathematical_dsp",
            "unavailable_reason": unavailable_reason or "metric_unavailable",
            "algorithm_detail": algorithm_detail,
        }

    # Determine status
    metric_status = "optimal"
    if target_min is not None and value < target_min:
        metric_status = "warning"
    if target_max is not None and value > target_max:
        metric_status = "warning"

    return {
        "value": round(float(value), 2) if unit != "count" else int(value),
        "unit": unit,
        "standard": standard,
        "target_min": target_min,
        "target_max": target_max,
        "status": metric_status,
        "source": "mathematical_dsp",
        "unavailable_reason": None,
        "algorithm_detail": algorithm_detail,
    }


def analyze_audio_workspace(
    raw_audio_path: Path,
    original_filename: str,
    file_size_bytes: int,
    sha256_hash: str,
    interface_mode: str,
    genre: str,
    mix_stage: str,
    consent_state: Dict[str, Any],
    user_notes: Optional[str] = None,
    plugin_chain_metadata: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Executes real mathematical DSP pipeline on verified audio file inside workspace.
    """
    workspace_dir = raw_audio_path.parent

    # 1. Probe Media Container
    probe_meta = probe_media_file(raw_audio_path)
    duration_sec = probe_meta["duration_seconds"]
    sr_hz = probe_meta["sample_rate_hz"]
    channels = probe_meta["channels"]

    # 2. Decode to Canonical Float32 PCM WAV
    decoded_wav_path = workspace_dir / "decoded.wav"
    decode_to_pcm_f32le(raw_audio_path, decoded_wav_path)

    # 3. EBU R128 Loudness Analysis
    loudness_res = measure_loudness_ebur128(decoded_wav_path, duration_sec, sr_hz)

    # 4. Waveform & Timeline Metrics
    waveform_res = compute_waveform_metrics(
        decoded_wav_path=decoded_wav_path,
        duration_seconds=duration_sec,
        sample_rate_hz=sr_hz,
        channels=channels,
        loudness_frames=loudness_res.get("frames"),
    )

    # 5. Spectral Welch PSD Metrics
    spectral_res = compute_spectral_metrics(
        decoded_wav_path=decoded_wav_path,
        sample_rate_hz=sr_hz,
        channels=channels,
    )

    # Merge unavailable reasons
    unavail = {
        **loudness_res.get("unavailable_reasons", {}),
        **waveform_res.get("unavailable_reasons", {}),
        **spectral_res.get("unavailable_reasons", {}),
    }

    is_unmastered = mix_stage == "unmastered_mix"

    # Build canonical measurements map
    measurements = {
        "sample_peak_max": _build_measurement_item(
            value=waveform_res["sample_peak_max_dbfs"],
            unit="dBFS",
            standard="AES17 / IEC 60268-10",
            target_min=None,
            target_max=-0.5,
            algorithm_detail="Peak absolute linear sample amplitude converted to 20*log10(peak)",
            unavailable_reason=unavail.get("sample_peak_max"),
        ),
        "integrated_loudness": _build_measurement_item(
            value=loudness_res.get("integrated_lufs"),
            unit="LUFS",
            standard="ITU-R BS.1770-4 / EBU R128",
            target_min=-18.0 if is_unmastered else -14.0,
            target_max=-14.0 if is_unmastered else -9.0,
            algorithm_detail="EBU R128 K-weighted gated integrated loudness filter pass",
            unavailable_reason=unavail.get("integrated_loudness"),
        ),
        "short_term_max_loudness": _build_measurement_item(
            value=loudness_res.get("short_term_max_lufs"),
            unit="LUFS",
            standard="EBU R128 (3s window)",
            target_min=-16.0,
            target_max=-11.0 if is_unmastered else -7.5,
            algorithm_detail="Maximum short-term loudness over 3-second sliding rectangular window",
            unavailable_reason=unavail.get("short_term_max_loudness"),
        ),
        "momentary_max_loudness": _build_measurement_item(
            value=loudness_res.get("momentary_max_lufs"),
            unit="LUFS",
            standard="EBU R128 (400ms window)",
            target_min=-14.0,
            target_max=-9.0 if is_unmastered else -6.0,
            algorithm_detail="Maximum momentary loudness over 400ms sliding rectangular window",
            unavailable_reason=unavail.get("momentary_max_loudness"),
        ),
        "true_peak_max": _build_measurement_item(
            value=loudness_res.get("true_peak_dbtp") or waveform_res["sample_peak_max_dbfs"],
            unit="dBTP",
            standard="ITU-R BS.1770-4 (4x Oversampled)",
            target_min=None,
            target_max=-3.0 if is_unmastered else -1.0,
            algorithm_detail="4x oversampled polyphase filter inter-sample peak detector",
            unavailable_reason=unavail.get("true_peak_max"),
        ),
        "sample_clipping_events": _build_measurement_item(
            value=waveform_res["sample_clipping_events"],
            unit="count",
            standard="AES Recommended Practice (>=3 consecutive samples >= 0.9999 FS)",
            target_min=0.0,
            target_max=0.0,
            algorithm_detail="Counter of contiguous flat-topped sample runs >= 3 consecutive samples",
            unavailable_reason=unavail.get("sample_clipping_events"),
        ),
        "loudness_range_lra": _build_measurement_item(
            value=loudness_res.get("lra_lu"),
            unit="LU",
            standard="EBU R128 Loudness Range",
            target_min=4.0,
            target_max=12.0 if is_unmastered else 9.0,
            algorithm_detail="Statistical loudness distribution difference between 10th and 95th percentiles",
            unavailable_reason=unavail.get("loudness_range_lra"),
        ),
        "crest_factor": _build_measurement_item(
            value=waveform_res["crest_factor_db"],
            unit="dB",
            standard="IEC 60268 Dynamic Peak-to-RMS Ratio",
            target_min=8.0,
            target_max=18.0 if is_unmastered else 14.0,
            algorithm_detail="Difference between peak absolute sample dBFS and global RMS dBFS",
            unavailable_reason=unavail.get("crest_factor"),
        ),
        "phase_correlation_mean": _build_measurement_item(
            value=waveform_res["phase_correlation_mean"],
            unit="correlation",
            standard="Normalized Cross-Correlation [-1.0, +1.0]",
            target_min=0.20,
            target_max=1.0,
            algorithm_detail="Mean normalized dot product across 400ms silence-gated stereo windows",
            unavailable_reason=unavail.get("phase_correlation_mean"),
        ),
        "phase_correlation_min": _build_measurement_item(
            value=waveform_res["phase_correlation_min"],
            unit="correlation",
            standard="Minimum Stereo Phase Correlation",
            target_min=0.0,
            target_max=1.0,
            algorithm_detail="Minimum stereo correlation encountered across active 400ms windows",
            unavailable_reason=unavail.get("phase_correlation_min"),
        ),
        "stereo_width_index": _build_measurement_item(
            value=waveform_res["stereo_width_index"],
            unit="percent",
            standard="Orthonormal Mid/Side Energy Ratio",
            target_min=20.0,
            target_max=85.0,
            algorithm_detail="Orthonormal RMS(Side)*sqrt(2) / (RMS(Mid) + RMS(Side)) * 100%",
            unavailable_reason=unavail.get("stereo_width_index"),
        ),
        "sub_bass_energy_20_60hz": _build_measurement_item(
            value=spectral_res.get("sub_bass_energy_20_60hz"),
            unit="dBFS",
            standard="Welch PSD Band Integral (20–60 Hz)",
            target_min=-35.0,
            target_max=-18.0,
            algorithm_detail="Per-channel Welch PSD (Hann window, nperseg=8192) band integration",
            unavailable_reason=unavail.get("sub_bass_energy_20_60hz"),
        ),
        "mud_band_energy_200_500hz": _build_measurement_item(
            value=spectral_res.get("mud_band_energy_200_500hz"),
            unit="dBFS",
            standard="Welch PSD Band Integral (200–500 Hz)",
            target_min=-26.0,
            target_max=-16.0,
            algorithm_detail="Per-channel Welch PSD band integration over 200–500 Hz mud zone",
            unavailable_reason=unavail.get("mud_band_energy_200_500hz"),
        ),
        "presence_band_energy_2k_5khz": _build_measurement_item(
            value=spectral_res.get("presence_band_energy_2k_5khz"),
            unit="dBFS",
            standard="Welch PSD Band Integral (2–5 kHz)",
            target_min=-30.0,
            target_max=-18.0,
            algorithm_detail="Per-channel Welch PSD band integration over 2–5 kHz vocal presence zone",
            unavailable_reason=unavail.get("presence_band_energy_2k_5khz"),
        ),
        "air_band_energy_10k_20khz": _build_measurement_item(
            value=spectral_res.get("air_band_energy_10k_20khz"),
            unit="dBFS",
            standard="Welch PSD Band Integral (10–20 kHz)",
            target_min=-40.0,
            target_max=-24.0,
            algorithm_detail="Per-channel Welch PSD band integration over 10–20 kHz air zone",
            unavailable_reason=unavail.get("air_band_energy_10k_20khz"),
        ),
    }

    # 6. Generate Rule-8 Compliant Diagnostics
    issues, recommendations = evaluate_diagnostics(
        measurements=measurements,
        genre=genre,
        mix_stage=mix_stage,
        duration_seconds=duration_sec,
        timeline=waveform_res["timeline"],
    )

    # 7. Construct Full Canonical Report Object
    report: Dict[str, Any] = {
        "schema_version": "2.0.0",
        "report_id": f"dsp-{uuid.uuid4().hex[:12]}",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "is_demonstration_data": False,
        "data_source_notice": "MATHEMATICAL DSP ANALYSIS — REAL AUDIO MEASUREMENTS: Measured with FFmpeg libebur128, pyloudnorm, and SciPy.",
        "input_context": {
            "interface_mode": interface_mode,
            "genre": genre,
            "mix_stage": mix_stage,
            "user_notes": user_notes,
            "plugin_chain_metadata": plugin_chain_metadata,
        },
        "consent_state": consent_state,
        "file_metadata": {
            "filename": original_filename,
            "format": probe_meta["format"],
            "duration_seconds": duration_sec,
            "sample_rate_hz": sr_hz,
            "bit_depth": probe_meta["bit_depth"],
            "channels": channels,
            "file_size_bytes": file_size_bytes,
            "sha256_checksum": sha256_hash,
            "codec": probe_meta["codec"],
            "bit_depth_note": probe_meta["bit_depth_note"],
        },
        "capabilities": {
            "dsp_core_measurements": {
                "status": "IMPLEMENTED",
                "phase_target": 2,
                "disclosure": "Real mathematical DSP analysis engine executed via FFmpeg libebur128, pyloudnorm, and SciPy.",
            },
            "streaming_normalization_estimates": {
                "status": "NOT_IMPLEMENTED",
                "phase_target": 3,
                "disclosure": "Rule 7: Streaming loudness predictions scheduled for Phase 3.",
            },
            "reference_track_comparison": {
                "status": "NOT_IMPLEMENTED",
                "phase_target": 3,
                "disclosure": "Loudness-matched reference track delta analysis scheduled for Phase 3.",
            },
            "original_stem_multitrack_analysis": {
                "status": "NOT_IMPLEMENTED",
                "phase_target": 4,
                "disclosure": "Rule 1: Analyzes genuine user-uploaded original stems only (Phase 4). AI stem splitting is permanently prohibited.",
            },
            "device_translation_preview": {
                "status": "NOT_IMPLEMENTED",
                "phase_target": 4,
                "disclosure": "Rule 6: Playback-device translation previews scheduled for Phase 4.",
            },
            "mix_revision_comparison": {
                "status": "NOT_IMPLEMENTED",
                "phase_target": 5,
                "disclosure": "Before/after mix revision delta comparison scheduled for Phase 5.",
            },
            "ai_educational_interpretation": {
                "status": "NOT_IMPLEMENTED",
                "phase_target": 5,
                "disclosure": "Rule 2 & 4: Consent-gated Gemini educational interpretation scheduled for Phase 5.",
            },
            "ai_stem_separation": {
                "status": "PROHIBITED_BY_PRODUCT_RULE",
                "phase_target": None,
                "disclosure": "Rule 1: AI stem separation, automatic stem splitting, and pseudo-stem generation are permanently forbidden. Only genuine user-uploaded original stems are accepted.",
            },
        },
        "measurements": measurements,
        "issues": issues,
        "recommendations": recommendations,
        "extensions": {
            "streaming_estimates": None,
            "reference_comparison": None,
            "stem_multitrack_report": None,
            "device_translation_profiles": None,
            "revision_comparison": None,
            "ai_interpretation": None,
        },
        "timeline": waveform_res["timeline"],
    }

    # 8. Sanitize NaN / Inf
    report = sanitize_floats(report)

    # 9. Validate against canonical schema v2.0.0
    if SCHEMA_FILE.exists():
        with open(SCHEMA_FILE, "r", encoding="utf-8") as f:
            schema = json.load(f)
        try:
            jsonschema.validate(instance=report, schema=schema)
        except jsonschema.ValidationError as ve:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={
                    "error_code": "SCHEMA_VALIDATION_ERROR",
                    "message": f"Generated DSP analysis report failed canonical schema validation: {ve.message}",
                },
            )

    return report

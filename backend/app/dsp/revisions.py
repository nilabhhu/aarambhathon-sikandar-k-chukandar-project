"""
Phase 4 Mix Revision Delta Comparison Engine (v1 vs. v2) for MixLearn Studio.

Computes exact deterministic deltas between baseline mix (v1) and revised mix (v2):
- Integrated LUFS delta
- 4x oversampled True Peak (dBTP) delta
- Loudness Range (LRA, LU) delta
- Stereo Phase Correlation (mean & min) delta
- 6-band spectral energy deltas (Sub, Low, Low-Mid, High-Mid, Presence, Air)
- Prior v1 finding verification: classifies every prior finding as
  'improved', 'unchanged', or 'regressed' with exact measured before/after values.
"""

from datetime import datetime, timezone
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import uuid

from backend.app.dsp.pipeline import sanitize_floats
from backend.app.dsp.stems import SIX_OCTAVE_BANDS

logger = logging.getLogger("mixlearn.dsp.revisions")

# Metric-specific deadbands below which a change is considered 'unchanged'
METRIC_EPSILONS: Dict[str, float] = {
    "sample_clipping_events": 0.5,
    "true_peak_max": 0.15,
    "sample_peak_max": 0.15,
    "integrated_loudness": 0.25,
    "short_term_max_loudness": 0.25,
    "momentary_max_loudness": 0.25,
    "loudness_range_lra": 0.25,
    "crest_factor": 0.25,
    "phase_correlation_mean": 0.03,
    "phase_correlation_min": 0.03,
    "stereo_width_index": 1.5,
    "sub_bass_energy_20_60hz": 0.4,
    "mud_band_energy_200_500hz": 0.4,
    "presence_band_energy_2k_5khz": 0.4,
    "air_band_energy_10k_20khz": 0.4,
}


def _safe_delta(v1: Optional[float], v2: Optional[float], decimals: int = 2) -> Optional[float]:
    if v1 is None or v2 is None:
        return None
    val = round(float(v2) - float(v1), decimals)
    return 0.0 if val == 0.0 else val


def _distance_to_target(
    value: Optional[float],
    target_min: Optional[float],
    target_max: Optional[float],
) -> Optional[float]:
    """
    Returns non-negative distance outside [target_min, target_max] (0.0 when in range).
    """
    if value is None:
        return None
    v = float(value)
    if target_min is not None and v < target_min:
        return target_min - v
    if target_max is not None and v > target_max:
        return v - target_max
    return 0.0


def extract_six_bands_from_report(report: Dict[str, Any]) -> Tuple[Dict[str, Optional[float]], str]:
    """
    Extracts standardized 6-band spectral energy map (dBFS) from an AnalysisReport.
    Uses exact 6-band values if attached, otherwise maps cleanly from the 4 canonical
    Welch PSD measurements in schema v2.0.0.
    """
    ext = report.get("extensions") or {}
    if isinstance(ext.get("six_band_spectrum"), dict):
        return (
            {k: ext["six_band_spectrum"].get(k) for k, _, _, _ in SIX_OCTAVE_BANDS},
            "direct_six_band_welch_psd",
        )

    meas = report.get("measurements") or {}
    sub = (meas.get("sub_bass_energy_20_60hz") or {}).get("value")
    mud = (meas.get("mud_band_energy_200_500hz") or {}).get("value")
    pres = (meas.get("presence_band_energy_2k_5khz") or {}).get("value")
    air = (meas.get("air_band_energy_10k_20khz") or {}).get("value")

    def _avg(a: Optional[float], b: Optional[float]) -> Optional[float]:
        if a is not None and b is not None:
            return round((float(a) + float(b)) / 2.0, 1)
        return a if a is not None else b

    mapped: Dict[str, Optional[float]] = {
        "sub": sub,
        "low": _avg(sub, mud),
        "low_mid": mud,
        "high_mid": pres,
        "presence": _avg(pres, air),
        "air": air,
    }
    return mapped, "derived_from_canonical_4_band_psd"


def _classify_prior_issue(
    issue: Dict[str, Any],
    v1_measurements: Dict[str, Any],
    v2_measurements: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Classifies a prior v1 issue as 'improved', 'unchanged', or 'regressed' by
    comparing its measured DSP evidence against its target range in v1 vs. v2.
    """
    evidence_list = issue.get("evidence") or []
    primary_ev = evidence_list[0] if evidence_list else {}
    metric_key = primary_ev.get("metric_key")

    m1 = v1_measurements.get(metric_key, {}) if metric_key else {}
    m2 = v2_measurements.get(metric_key, {}) if metric_key else {}

    v1_val = m1.get("value") if m1.get("value") is not None else primary_ev.get("measured_value")
    v2_val = m2.get("value")
    unit = m1.get("unit") or primary_ev.get("unit") or ""
    target_min = m1.get("target_min")
    target_max = m1.get("target_max")
    target_range = primary_ev.get("target_range") or (
        f"{target_min} to {target_max} {unit}".strip()
        if target_min is not None or target_max is not None
        else "target range"
    )

    eps = METRIC_EPSILONS.get(metric_key or "", 0.2)
    delta_val = _safe_delta(v1_val, v2_val, decimals=2)

    status_label = "unchanged"
    explanation = "Measured value remained effectively unchanged between v1 and v2."

    if v1_val is None or v2_val is None:
        status_label = "unchanged"
        explanation = "Could not compare metric because one revision lacked a valid DSP measurement."
    elif metric_key == "sample_clipping_events":
        if v2_val < v1_val:
            status_label = "improved"
            explanation = (
                f"Sample clipping events reduced from {int(v1_val)} to {int(v2_val)}."
                if v2_val > 0
                else f"Sample clipping completely resolved ({int(v1_val)} → 0 events)."
            )
        elif v2_val > v1_val:
            status_label = "regressed"
            explanation = f"Sample clipping events increased from {int(v1_val)} to {int(v2_val)}."
        else:
            status_label = "unchanged"
            explanation = f"Sample clipping count remained at {int(v2_val)}."
    else:
        d1 = _distance_to_target(v1_val, target_min, target_max)
        d2 = _distance_to_target(v2_val, target_min, target_max)

        if d1 is not None and d2 is not None:
            if d2 < d1 - eps:
                status_label = "improved"
                if d2 == 0.0:
                    explanation = (
                        f"Resolved into target range ({target_range}): {v1_val} → {v2_val} {unit}."
                    )
                else:
                    explanation = (
                        f"Moved closer to target range ({target_range}): {v1_val} → {v2_val} {unit}."
                    )
            elif d2 > d1 + eps:
                status_label = "regressed"
                explanation = (
                    f"Moved further from target range ({target_range}): {v1_val} → {v2_val} {unit}."
                )
            elif d1 == 0.0 and d2 == 0.0:
                # Special handling for issues triggered even near boundary (e.g. phase min < 0 or true peak > -1.0)
                if metric_key in ("phase_correlation_min", "phase_correlation_mean") and delta_val is not None:
                    if delta_val > eps:
                        status_label = "improved"
                        explanation = f"Phase correlation improved from {v1_val} to {v2_val}."
                    elif delta_val < -eps:
                        status_label = "regressed"
                        explanation = f"Phase correlation declined from {v1_val} to {v2_val}."
                elif metric_key in ("true_peak_max", "sample_peak_max") and delta_val is not None:
                    if delta_val < -eps:
                        status_label = "improved"
                        explanation = f"Peak headroom improved from {v1_val} to {v2_val} {unit}."
                    elif delta_val > eps:
                        status_label = "regressed"
                        explanation = f"Peak level rose from {v1_val} to {v2_val} {unit}."

    return {
        "issue_id": issue.get("issue_id"),
        "title": issue.get("title"),
        "domain": issue.get("domain"),
        "classification": issue.get("classification"),
        "original_severity": issue.get("severity"),
        "metric_key": metric_key,
        "unit": unit,
        "target_range": target_range,
        "before_value": v1_val,
        "after_value": v2_val,
        "delta_value": delta_val,
        "status": status_label,
        "summary": explanation,
    }


def compare_revision_reports(
    v1_report: Dict[str, Any],
    v2_report: Dict[str, Any],
    v1_six_bands: Optional[Dict[str, Optional[float]]] = None,
    v2_six_bands: Optional[Dict[str, Optional[float]]] = None,
) -> Dict[str, Any]:
    """
    Computes complete deterministic v1 -> v2 revision deltas and verifies every
    prior v1 diagnostic finding as 'improved', 'unchanged', or 'regressed'.
    """
    m1 = v1_report.get("measurements") or {}
    m2 = v2_report.get("measurements") or {}

    def _val(meas: Dict[str, Any], key: str) -> Optional[float]:
        entry = meas.get(key)
        if isinstance(entry, dict):
            return entry.get("value")
        return None

    v1_lufs = _val(m1, "integrated_loudness")
    v2_lufs = _val(m2, "integrated_loudness")
    v1_tp = _val(m1, "true_peak_max")
    v2_tp = _val(m2, "true_peak_max")
    v1_lra = _val(m1, "loudness_range_lra")
    v2_lra = _val(m2, "loudness_range_lra")
    v1_phase_mean = _val(m1, "phase_correlation_mean")
    v2_phase_mean = _val(m2, "phase_correlation_mean")
    v1_phase_min = _val(m1, "phase_correlation_min")
    v2_phase_min = _val(m2, "phase_correlation_min")
    v1_crest = _val(m1, "crest_factor")
    v2_crest = _val(m2, "crest_factor")
    v1_clips = _val(m1, "sample_clipping_events")
    v2_clips = _val(m2, "sample_clipping_events")

    if v1_six_bands is None:
        v1_six_bands, v1_band_source = extract_six_bands_from_report(v1_report)
    else:
        v1_band_source = "direct_six_band_welch_psd"

    if v2_six_bands is None:
        v2_six_bands, v2_band_source = extract_six_bands_from_report(v2_report)
    else:
        v2_band_source = "direct_six_band_welch_psd"

    delta_spectral_db: Dict[str, Dict[str, Any]] = {}
    for band_key, band_label, low_hz, high_hz in SIX_OCTAVE_BANDS:
        b1 = v1_six_bands.get(band_key)
        b2 = v2_six_bands.get(band_key)
        delta_spectral_db[band_key] = {
            "label": band_label,
            "low_hz": low_hz,
            "high_hz": high_hz,
            "v1_db": b1,
            "v2_db": b2,
            "delta_db": _safe_delta(b1, b2, decimals=1),
        }

    # Classify every prior v1 finding
    finding_deltas: List[Dict[str, Any]] = [
        _classify_prior_issue(issue, m1, m2)
        for issue in (v1_report.get("issues") or [])
    ]

    v1_domains = {issue.get("domain") for issue in (v1_report.get("issues") or [])}
    new_v2_issues = [
        {
            "issue_id": issue.get("issue_id"),
            "title": issue.get("title"),
            "domain": issue.get("domain"),
            "classification": issue.get("classification"),
            "severity": issue.get("severity"),
        }
        for issue in (v2_report.get("issues") or [])
        if issue.get("domain") not in v1_domains
    ]

    improved_count = sum(1 for f in finding_deltas if f["status"] == "improved")
    unchanged_count = sum(1 for f in finding_deltas if f["status"] == "unchanged")
    regressed_count = sum(1 for f in finding_deltas if f["status"] == "regressed")

    result = {
        "schema_version": "2.0.0",
        "comparison_id": f"rev-{uuid.uuid4()}",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "v1_metadata": {
            "report_id": v1_report.get("report_id"),
            "filename": (v1_report.get("file_metadata") or {}).get("filename", "mix_v1.wav"),
            "duration_seconds": (v1_report.get("file_metadata") or {}).get("duration_seconds"),
            "sample_rate_hz": (v1_report.get("file_metadata") or {}).get("sample_rate_hz"),
        },
        "v2_metadata": {
            "report_id": v2_report.get("report_id"),
            "filename": (v2_report.get("file_metadata") or {}).get("filename", "mix_v2.wav"),
            "duration_seconds": (v2_report.get("file_metadata") or {}).get("duration_seconds"),
            "sample_rate_hz": (v2_report.get("file_metadata") or {}).get("sample_rate_hz"),
        },
        "metric_deltas": {
            "delta_integrated_lufs": _safe_delta(v1_lufs, v2_lufs, decimals=2),
            "delta_true_peak_dbtp": _safe_delta(v1_tp, v2_tp, decimals=2),
            "delta_lra_lu": _safe_delta(v1_lra, v2_lra, decimals=2),
            "delta_phase_correlation": _safe_delta(v1_phase_mean, v2_phase_mean, decimals=2),
            "delta_phase_correlation_min": _safe_delta(v1_phase_min, v2_phase_min, decimals=2),
            "delta_crest_factor_db": _safe_delta(v1_crest, v2_crest, decimals=2),
            "delta_sample_clipping_events": _safe_delta(v1_clips, v2_clips, decimals=0),
            "before_after": {
                "integrated_lufs": {"v1": v1_lufs, "v2": v2_lufs, "unit": "LUFS"},
                "true_peak_dbtp": {"v1": v1_tp, "v2": v2_tp, "unit": "dBTP"},
                "lra_lu": {"v1": v1_lra, "v2": v2_lra, "unit": "LU"},
                "phase_correlation_mean": {"v1": v1_phase_mean, "v2": v2_phase_mean, "unit": "correlation"},
                "phase_correlation_min": {"v1": v1_phase_min, "v2": v2_phase_min, "unit": "correlation"},
                "crest_factor_db": {"v1": v1_crest, "v2": v2_crest, "unit": "dB"},
                "sample_clipping_events": {"v1": v1_clips, "v2": v2_clips, "unit": "count"},
            },
        },
        "delta_spectral_db": delta_spectral_db,
        "spectral_band_sources": {
            "v1": v1_band_source,
            "v2": v2_band_source,
        },
        "finding_verifications": finding_deltas,
        "new_v2_issues": new_v2_issues,
        "summary_counts": {
            "total_prior_findings": len(finding_deltas),
            "improved": improved_count,
            "unchanged": unchanged_count,
            "regressed": regressed_count,
            "new_issues_in_v2": len(new_v2_issues),
        },
        "v2_report": v2_report,
    }
    return sanitize_floats(result)

"""
Phase 5 Evidence-Bound Gemini AI Mentor & Deterministic Offline Fallback.

Security & Privacy Guardrails:
- Calls the Gemini API STRICTLY server-side using os.environ.get("GEMINI_API_KEY")
  and the official Python `google-genai` SDK (`gemini-2.5-flash`).
- Never receives or transmits raw audio bytes when Toggle B (direct audio inspection)
  is disabled; strips any audio-byte fields before prompt construction.
- Rule 2: Cites ONLY exact `evidence_id` values and measured numbers present in the
  DSP JSON; never invents timestamps, plugins, or unmeasured instruments.
- Rule 3: Frames creative trade-offs around selected Artist Vision tags
  (Punchy, Warm, Aggressive, Wide, Dynamic) WITHOUT EVER suppressing objective
  technical warnings (e.g., true_peak_dbtp > -0.1 or negative phase correlation).
- Deterministic Offline Mentor Fallback activates automatically whenever
  GEMINI_API_KEY is unset, quota is exceeded, SDK is unavailable, or Gemini times out.
"""

from __future__ import annotations

import contextvars
import json
import logging
import os
import re
from typing import Any, Dict, List, Literal, Optional, Sequence, Set

from pydantic import BaseModel, Field

logger = logging.getLogger("mixlearn.ai.mentor")

GEMINI_MODEL_NAME = "gemini-2.5-flash"
GEMINI_FALLBACK_MODEL_NAME = "gemini-2.0-flash"
GEMINI_TIMEOUT_SECONDS = 18.0
_LAST_GEMINI_MODEL_USED: contextvars.ContextVar[str] = contextvars.ContextVar(
    "_LAST_GEMINI_MODEL_USED", default=GEMINI_MODEL_NAME
)

ALLOWED_ARTIST_VISIONS: tuple[str, ...] = (
    "Punchy",
    "Warm",
    "Aggressive",
    "Wide",
    "Dynamic",
)

PROHIBITED_AUDIO_KEYS: frozenset[str] = frozenset(
    {
        "audio_bytes",
        "raw_audio",
        "audio_base64",
        "base64_audio",
        "pcm_samples",
        "waveform_samples",
        "file_bytes",
    }
)


class AiCoachingStep(BaseModel):
    evidence_id: str = Field(
        ...,
        description="Exact issue_id or deterministic metric evidence ID from the DSP JSON.",
    )
    classification: Literal["objective_technical", "subjective_stylistic"] = Field(
        ...,
        description="Rule 8 separation between objective technical warnings and stylistic notes.",
    )
    title: str = Field(..., description="Concise studio action title grounded in measured DSP.")
    what_happened: str = Field(
        ...,
        description="Plain-language description citing exact measured DSP values and units.",
    )
    why_it_matters: str = Field(
        ...,
        description="Acoustic/translation reason this measurement matters on real playback systems.",
    )
    listen_prompt: str = Field(
        ...,
        description="Focused ear-training cue guiding what to listen for in the DAW or Translation Lab.",
    )
    what_to_try: str = Field(
        ...,
        description="Concrete, reversible DAW mixing/mastering adjustment referencing generic tools (no invented plugins).",
    )
    recheck_target: str = Field(
        ...,
        description="Exact numerical DSP re-verification target after bouncing a revision (v2).",
    )


class AiPrivacyAudit(BaseModel):
    raw_audio_sent_to_ai: bool = Field(
        ...,
        description="Strictly False when Toggle B (direct audio inspection) is disabled.",
    )
    external_ai_enabled: bool = Field(
        ...,
        description="Whether Toggle A (metrics-only AI mentor) was explicitly enabled.",
    )
    direct_audio_inspection_enabled: bool = Field(
        False,
        description="Whether Toggle B (direct audio inspection) was separately enabled.",
    )
    training_opt_in: bool = Field(
        False,
        description="Toggle C: Strictly separate from API processing; default False (Rule 5).",
    )
    retention_policy: str = Field(
        ...,
        description="Explicit distinction between ephemeral API processing and zero model training.",
    )


class GeminiStructuredMentorOutput(BaseModel):
    """Strict Pydantic v2 structured output schema passed to Gemini response_schema."""

    summary: str = Field(
        ...,
        description="2-3 sentence executive studio summary strictly grounded in DSP metrics.",
    )
    vision_alignment_note: str = Field(
        ...,
        description="How the measured DSP profile relates to the user's selected Artist Vision tags while preserving technical integrity.",
    )
    coaching_steps: List[AiCoachingStep] = Field(
        ...,
        min_length=1,
        max_length=6,
        description="Evidence-cited coaching steps referencing only valid DSP evidence_id values.",
    )


class AiMentorResponse(BaseModel):
    schema_version: Literal["2.0.0"] = "2.0.0"
    mentor_mode: Literal["gemini_live", "deterministic_fallback"]
    model_name: Optional[str] = None
    fallback_reason: Optional[str] = None
    artist_vision: List[str] = Field(default_factory=list)
    objective_warnings_preserved: bool = True
    summary: str
    vision_alignment_note: str
    coaching_steps: List[AiCoachingStep]
    privacy_audit: AiPrivacyAudit


SYSTEM_INSTRUCTION = """You are MixLearn Studio's Evidence-Bound Mixing & Mastering Mentor.
You educate musicians by explaining real mathematical DSP measurements clearly and honestly.

NON-NEGOTIABLE RULES:
1. EVIDENCE-BOUND ONLY (Rule 2):
   - Cite ONLY exact `evidence_id` values present in `dsp_findings` (or `synthetic_objective_alerts`) in the input JSON.
   - Cite ONLY exact numerical measurements, units, and timestamps present in the input JSON.
   - NEVER invent timestamps, plugin brands/names not listed in `user_reported_context`, unmeasured instruments, or arbitrary mix quality scores (never output "84/100" or letter grades).
2. TECHNICAL INTEGRITY UNCOMPROMISED (Rule 3):
   - Frame creative trade-offs around the user's selected `artist_vision` tags (Punchy, Warm, Aggressive, Wide, Dynamic).
   - NEVER suppress, soften, omit, or excuse objective technical warnings—especially True Peak inter-sample clipping (`true_peak_dbtp > -0.1`), contiguous digital sample clipping, or negative phase correlation (`phase_correlation_min < 0.0`). Even if the user selects "Aggressive", you MUST include an `objective_technical` coaching step warning about True Peak clipping and explaining how to achieve perceived aggression safely (e.g., saturation/clipper before a True Peak limiter set to -1.0 dBTP or lower).
3. OBJECTIVE VS. STYLISTIC SPLIT (Rule 8):
   - Preserve `classification: "objective_technical"` for boundary violations (clipping, True Peak overshoots, negative phase correlation) and `classification: "subjective_stylistic"` for tonal or macrodynamic preferences.
4. DATA PROVENANCE:
   - Treat `user_reported_context` strictly as self-reported DAW/routing notes, never as measured acoustic truth.
5. CONCISE STUDIO TONE:
   - Be direct, practical, encouraging, and educational. Return valid JSON matching the exact response schema."""


def normalize_artist_vision(raw_vision: Optional[Sequence[str]]) -> List[str]:
    if not raw_vision:
        return []
    allowed_lower = {tag.lower(): tag for tag in ALLOWED_ARTIST_VISIONS}
    cleaned: List[str] = []
    for item in raw_vision:
        if not isinstance(item, str):
            continue
        canonical = allowed_lower.get(item.strip().lower())
        if canonical and canonical not in cleaned:
            cleaned.append(canonical)
    return cleaned


def _extract_measurement_value(measurements: Dict[str, Any], key: str) -> Optional[float]:
    entry = measurements.get(key)
    if isinstance(entry, dict):
        val = entry.get("value")
        if isinstance(val, (int, float)):
            return float(val)
    elif isinstance(entry, (int, float)):
        return float(entry)
    return None


def _strip_raw_audio_keys(obj: Any) -> Any:
    """Recursively strips any raw audio byte fields from input payloads."""
    if isinstance(obj, dict):
        return {
            k: _strip_raw_audio_keys(v)
            for k, v in obj.items()
            if k.lower() not in PROHIBITED_AUDIO_KEYS and not isinstance(v, (bytes, bytearray))
        }
    if isinstance(obj, list):
        return [_strip_raw_audio_keys(item) for item in obj]
    if isinstance(obj, (bytes, bytearray)):
        return None
    return obj


def _ensure_objective_findings_list(
    measurements: Dict[str, Any],
    issues: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Guarantees that critical objective technical conditions (True Peak > -0.1 dBTP,
    negative phase correlation) are represented as explicit DSP findings with valid
    evidence IDs—even if a minimal DSP payload omitted the issues array.
    """
    normalized_issues = [dict(i) for i in issues if isinstance(i, dict)]
    existing_keys: Set[str] = set()
    for iss in normalized_issues:
        for ev in iss.get("evidence") or []:
            if isinstance(ev, dict) and ev.get("metric_key"):
                existing_keys.add(str(ev["metric_key"]))

    tp_val = _extract_measurement_value(measurements, "true_peak_max")
    if tp_val is not None and tp_val > -0.1 and "true_peak_max" not in existing_keys:
        normalized_issues.insert(
            0,
            {
                "issue_id": "dsp_true_peak_overshoot",
                "classification": "objective_technical",
                "domain": "true_peak_clipping",
                "severity": "critical",
                "confidence": 0.99,
                "title": f"Inter-Sample True Peak Overshoot ({tp_val:+.2f} dBTP)",
                "timestamps": [],
                "evidence": [
                    {
                        "metric_key": "true_peak_max",
                        "measured_value": round(tp_val, 2),
                        "unit": "dBTP",
                        "target_range": "<= -1.0 dBTP",
                        "method": "ITU-R BS.1770-4 / 4x oversampled True Peak",
                    }
                ],
                "learning_guide": {
                    "what_was_detected": f"Measured 4x oversampled True Peak reached {tp_val:+.2f} dBTP (above -0.1 dBTP).",
                    "why_it_matters": "Peaks above -0.1 dBTP cause DAC inter-sample clipping and lossy codec distortion on Spotify/Apple Music/YouTube.",
                    "what_to_try": "Enable True Peak limiting with a ceiling of -1.0 dBTP (final master) or lower master fader to <= -3.0 dBTP (unmastered mix).",
                    "how_to_verify": "Re-bounce and verify true_peak_max drops to <= -1.0 dBTP with 0 clipping runs.",
                },
            },
        )

    phase_min = _extract_measurement_value(measurements, "phase_correlation_min")
    if phase_min is not None and phase_min < 0.0 and "phase_correlation_min" not in existing_keys:
        normalized_issues.append(
            {
                "issue_id": "dsp_negative_phase_correlation",
                "classification": "objective_technical",
                "domain": "phase_polarity",
                "severity": "critical",
                "confidence": 0.96,
                "title": f"Negative Phase Correlation Dip ({phase_min:+.2f})",
                "timestamps": [],
                "evidence": [
                    {
                        "metric_key": "phase_correlation_min",
                        "measured_value": round(phase_min, 2),
                        "unit": "correlation",
                        "target_range": ">= +0.20",
                        "method": "IEC 60268 Stereo Phase Correlation",
                    }
                ],
                "learning_guide": {
                    "what_was_detected": f"Minimum stereo phase correlation dropped to {phase_min:+.2f}.",
                    "why_it_matters": "Negative phase correlation causes audible hollowing and frequency cancellation on mono speakers and phones.",
                    "what_to_try": "Check stereo wideners, Haas delays, or inverted channel polarity; mono-sum bass below 120 Hz.",
                    "how_to_verify": "Toggle Mono in the Translation Lab and confirm phase_correlation_min >= 0.00.",
                },
            }
        )

    return normalized_issues


def sanitize_dsp_payload_for_ai(
    report: Optional[Dict[str, Any]],
    genre: str,
    mix_stage: str,
    interface_mode: str,
    artist_vision: List[str],
    user_reported_context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Constructs a strictly metrics-only JSON payload for Gemini.
    Zero raw audio bytes are ever included.
    """
    safe_report = _strip_raw_audio_keys(report or {})
    measurements = safe_report.get("measurements") or {}
    raw_issues = safe_report.get("issues") or []
    issues = _ensure_objective_findings_list(measurements, raw_issues)

    compact_measurements: Dict[str, Dict[str, Any]] = {}
    for key, val in measurements.items():
        if isinstance(val, dict):
            compact_measurements[key] = {
                "value": val.get("value"),
                "unit": val.get("unit"),
                "status": val.get("status"),
                "target_min": val.get("target_min"),
                "target_max": val.get("target_max"),
                "standard": val.get("standard"),
            }
        elif isinstance(val, (int, float)):
            compact_measurements[key] = {"value": float(val)}

    compact_findings: List[Dict[str, Any]] = []
    for iss in issues:
        compact_findings.append(
            {
                "evidence_id": iss.get("issue_id", "dsp_finding"),
                "classification": iss.get("classification", "subjective_stylistic"),
                "domain": iss.get("domain", "loudness"),
                "severity": iss.get("severity", "notice"),
                "title": iss.get("title", "Measured DSP Finding"),
                "timestamps": iss.get("timestamps", [])[:3],
                "evidence": iss.get("evidence", []),
                "learning_guide": iss.get("learning_guide", {}),
            }
        )

    sanitized_context: Optional[Dict[str, Any]] = None
    if isinstance(user_reported_context, dict):
        daw_name = str(user_reported_context.get("daw_name") or "").strip()[:80]
        bus_routing = str(user_reported_context.get("bus_routing") or "").strip()[:300]
        plugin_chain_notes = str(user_reported_context.get("plugin_chain_notes") or "").strip()[:500]
        if daw_name or bus_routing or plugin_chain_notes:
            sanitized_context = {
                "source_tag": "user_reported_context",
                "daw_name": daw_name,
                "bus_routing": bus_routing,
                "plugin_chain_notes": plugin_chain_notes,
            }

    return {
        "schema_version": "2.0.0",
        "interface_mode": interface_mode,
        "genre": genre,
        "mix_stage": mix_stage,
        "artist_vision": artist_vision,
        "measured_dsp_metrics": compact_measurements,
        "dsp_findings": compact_findings,
        "user_reported_context": sanitized_context,
    }


def _vision_tradeoff_note(
    artist_vision: List[str],
    has_objective_warning: bool,
    genre: str,
    mix_stage: str,
) -> str:
    stage_label = "Final Master" if mix_stage == "final_master" else "Unmastered Mix"
    if not artist_vision:
        base = (
            f"Evaluated against {genre.replace('_', ' ')} ({stage_label}) technical and tonal references "
            "with no custom Artist Vision tags selected."
        )
    else:
        vision_hints = {
            "Punchy": "tight transient impact (preserve crest factor and avoid over-compressing drum attacks)",
            "Warm": "controlled low-mid body without mud buildup and smooth upper-mid transitions",
            "Aggressive": "forward harmonic density and perceived loudness achieved via controlled saturation rather than digital clipping",
            "Wide": "expansive stereo side energy while keeping bass mono-centered and phase correlation positive",
            "Dynamic": "preserved macrodynamic contrast (healthy LRA and transient headroom without brickwall limiting)",
        }
        phrases = [f"{tag}: {vision_hints[tag]}" for tag in artist_vision if tag in vision_hints]
        base = f"Artist Vision ({', '.join(artist_vision)}) prioritizes " + "; ".join(phrases) + "."

    if has_objective_warning:
        base += (
            " Rule 3 Technical Integrity: Objective boundary warnings (such as True Peak clipping or "
            "negative phase correlation) remain fully active and are never suppressed to match a creative vision."
        )
    return base


def _issue_to_coaching_step(
    iss: Dict[str, Any],
    artist_vision: List[str],
) -> AiCoachingStep:
    evidence_id = str(iss.get("issue_id") or iss.get("evidence_id") or "dsp_finding")
    classification: Literal["objective_technical", "subjective_stylistic"] = (
        "objective_technical"
        if iss.get("classification") == "objective_technical"
        else "subjective_stylistic"
    )
    title = str(iss.get("title") or "Measured DSP Observation")
    guide = iss.get("learning_guide") or {}
    evidence_list = iss.get("evidence") or []

    ev_snippets = []
    target_snippets = []
    for ev in evidence_list:
        if isinstance(ev, dict):
            mk = ev.get("metric_key", "metric")
            mv = ev.get("measured_value")
            unit = ev.get("unit", "")
            tr = ev.get("target_range", "")
            if mv is not None:
                ev_snippets.append(f"{mk}={mv} {unit}".strip())
            if tr:
                target_snippets.append(f"{mk} within {tr}")

    what_happened = str(guide.get("what_was_detected") or "").strip()
    if not what_happened:
        what_happened = (
            f"Measured {', '.join(ev_snippets)}." if ev_snippets else f"Flagged {title} from mathematical DSP analysis."
        )
    elif ev_snippets and all(str(ev.get("measured_value")) not in what_happened for ev in evidence_list if isinstance(ev, dict)):
        what_happened = f"{what_happened} ({', '.join(ev_snippets)})."

    why_it_matters = str(guide.get("why_it_matters") or "").strip() or (
        "Resolving objective technical warnings prevents codec clipping or mono collapse across consumer playback systems."
        if classification == "objective_technical"
        else "Balancing this frequency or dynamic region improves translation against genre conventions."
    )

    domain = str(iss.get("domain") or "")
    if domain == "true_peak_clipping":
        listen_prompt = (
            "Audition the loudest snare/kick transients at unity gain—listen for brittle upper-mid crunch "
            "or harsh fizz that worsens on lossy streaming codecs."
        )
    elif domain in ("phase_polarity", "stereo_field"):
        listen_prompt = (
            "Toggle Mono vs. Stereo in the Translation Lab during the widest chorus section—listen for "
            "guitars, synths, or bass thinning out or disappearing in mono."
        )
    elif domain == "frequency_balance":
        listen_prompt = (
            "Switch between Studio Flat and Smartphone/Laptop preview—listen for vocal clarity and low-mid "
            "congestion around the flagged frequency range."
        )
    else:
        listen_prompt = (
            "Audition loudness-matched Mix A vs. Reference B—focus on transient punch, vocal anchor, "
            "and sustain density between verse and chorus."
        )

    what_to_try = str(guide.get("what_to_try") or "").strip() or (
        "Adjust gain staging, EQ, or dynamics incrementally in your DAW and compare loudness-matched."
    )
    if classification == "objective_technical" and "Aggressive" in artist_vision and domain == "true_peak_clipping":
        what_to_try += (
            " To preserve your 'Aggressive' vision without inter-sample clipping, use controlled bus saturation "
            "or soft-clipping before a True Peak limiter capped at -1.0 dBTP (or -3.0 dBTP for unmastered mix)."
        )

    recheck_target = str(guide.get("how_to_verify") or "").strip()
    if not recheck_target:
        recheck_target = (
            f"Re-export Revision v2 and confirm {'; '.join(target_snippets)}."
            if target_snippets
            else "Re-export Revision v2 and confirm the DSP warning clears in Mix Revision Delta."
        )

    return AiCoachingStep(
        evidence_id=evidence_id,
        classification=classification,
        title=title,
        what_happened=what_happened,
        why_it_matters=why_it_matters,
        listen_prompt=listen_prompt,
        what_to_try=what_to_try,
        recheck_target=recheck_target,
    )


def build_deterministic_mentor_response(
    sanitized_payload: Dict[str, Any],
    privacy_audit: AiPrivacyAudit,
    fallback_reason: str,
) -> AiMentorResponse:
    """
    Deterministic Offline Mentor Fallback (zero external API dependency, zero HTTP 500s).
    Strictly grounded in measured DSP findings and exact evidence_id values.
    """
    artist_vision: List[str] = sanitized_payload.get("artist_vision") or []
    genre = str(sanitized_payload.get("genre") or "indie_rock")
    mix_stage = str(sanitized_payload.get("mix_stage") or "unmastered_mix")
    measurements = sanitized_payload.get("measured_dsp_metrics") or {}
    findings = sanitized_payload.get("dsp_findings") or []

    # Sort objective technical warnings first so they are never buried
    sorted_findings = sorted(
        findings,
        key=lambda f: (
            0 if f.get("classification") == "objective_technical" else 1,
            0 if f.get("severity") == "critical" else 1,
        ),
    )

    steps: List[AiCoachingStep] = [
        _issue_to_coaching_step(f, artist_vision) for f in sorted_findings[:5]
    ]

    if not steps:
        lufs = _extract_measurement_value(measurements, "integrated_loudness")
        tp = _extract_measurement_value(measurements, "true_peak_max")
        lufs_str = f"{lufs:.1f} LUFS" if lufs is not None else "measured loudness"
        tp_str = f"{tp:+.2f} dBTP" if tp is not None else "measured peak headroom"
        steps.append(
            AiCoachingStep(
                evidence_id="dsp_overview",
                classification="subjective_stylistic",
                title="Technical Targets Met — Refine Translation by Ear",
                what_happened=f"No objective technical violations were flagged ({lufs_str}, True Peak {tp_str}).",
                why_it_matters="Clean technical headroom and phase coherence give you a reliable foundation for stylistic polish.",
                listen_prompt="Compare loudness-matched Mix A against a commercial Reference B across Studio Flat, Smartphone, and Mono modes.",
                what_to_try="Make subtle 0.5–1.0 dB tonal or balance refinements only if ear-checks reveal vocal masking or tonal tilt.",
                recheck_target="Verify Revision v2 maintains True Peak <= target ceiling and positive phase correlation.",
            )
        )

    objective_count = sum(1 for s in steps if s.classification == "objective_technical")
    stylistic_count = len(steps) - objective_count

    lufs_val = _extract_measurement_value(measurements, "integrated_loudness")
    tp_val = _extract_measurement_value(measurements, "true_peak_max")
    metric_brief_parts = []
    if lufs_val is not None:
        metric_brief_parts.append(f"{lufs_val:.1f} LUFS integrated")
    if tp_val is not None:
        metric_brief_parts.append(f"{tp_val:+.2f} dBTP true peak")
    metric_brief = ", ".join(metric_brief_parts) if metric_brief_parts else "measured DSP metrics"

    summary = (
        f"Analyzed {metric_brief} for {genre.replace('_', ' ')} ({mix_stage.replace('_', ' ')}): "
        f"{objective_count} objective technical warning(s) and {stylistic_count} stylistic coaching note(s) identified. "
        "Address objective technical items first, then verify creative adjustments with Revision v2."
    )

    vision_note = _vision_tradeoff_note(
        artist_vision=artist_vision,
        has_objective_warning=objective_count > 0,
        genre=genre,
        mix_stage=mix_stage,
    )

    return AiMentorResponse(
        mentor_mode="deterministic_fallback",
        model_name=None,
        fallback_reason=fallback_reason,
        artist_vision=artist_vision,
        objective_warnings_preserved=True,
        summary=summary,
        vision_alignment_note=vision_note,
        coaching_steps=steps,
        privacy_audit=privacy_audit,
    )


def _enforce_evidence_and_rule3(
    parsed: GeminiStructuredMentorOutput,
    sanitized_payload: Dict[str, Any],
) -> tuple[List[AiCoachingStep], str]:
    """
    Post-validates Gemini output against Rule 2 (valid evidence_id only) and
    Rule 3 (never omit objective technical warnings regardless of Artist Vision).
    """
    findings = sanitized_payload.get("dsp_findings") or []
    artist_vision = sanitized_payload.get("artist_vision") or []

    valid_ids = {str(f.get("evidence_id")) for f in findings if f.get("evidence_id")}
    if not valid_ids:
        valid_ids.add("dsp_overview")

    finding_by_id = {str(f.get("evidence_id")): f for f in findings if f.get("evidence_id")}

    validated_steps: List[AiCoachingStep] = []
    covered_ids: Set[str] = set()

    for step in parsed.coaching_steps:
        if step.evidence_id not in valid_ids:
            continue
        source_finding = finding_by_id.get(step.evidence_id)
        if source_finding and source_finding.get("classification") == "objective_technical":
            # Force objective_technical classification so model cannot downgrade it to stylistic
            step = step.model_copy(update={"classification": "objective_technical"})
        validated_steps.append(step)
        covered_ids.add(step.evidence_id)

    # Rule 3 Guarantee: Every objective technical finding MUST be present
    for f in findings:
        eid = str(f.get("evidence_id") or "")
        if f.get("classification") == "objective_technical" and eid and eid not in covered_ids:
            validated_steps.insert(0, _issue_to_coaching_step(f, artist_vision))
            covered_ids.add(eid)

    if not validated_steps:
        fallback = build_deterministic_mentor_response(
            sanitized_payload=sanitized_payload,
            privacy_audit=AiPrivacyAudit(
                raw_audio_sent_to_ai=False,
                external_ai_enabled=True,
                direct_audio_inspection_enabled=False,
                training_opt_in=False,
                retention_policy="Ephemeral API processing only; zero model training.",
            ),
            fallback_reason="Gemini returned zero valid evidence_id citations.",
        )
        return fallback.coaching_steps, fallback.vision_alignment_note

    return validated_steps[:6], parsed.vision_alignment_note


def _format_safe_gemini_error(exc: Exception, api_key: str = "") -> str:
    """
    Extracts ClientError HTTP status code and message safely for diagnostics
    while guaranteeing the GEMINI_API_KEY (or any AIza* token) is NEVER logged.
    """
    status_code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
    status_label = getattr(exc, "status", None)
    raw_msg = str(getattr(exc, "message", None) or exc or "").strip()

    if api_key:
        raw_msg = raw_msg.replace(api_key, "[REDACTED_KEY]")
    raw_msg = re.sub(r"AIza[0-9A-Za-z_\-]{10,}", "[REDACTED_KEY]", raw_msg)
    raw_msg = re.sub(r"(?i)(api[_-]?key\s*[=:]\s*)[^\s&\"']+", r"\1[REDACTED_KEY]", raw_msg)
    if len(raw_msg) > 260:
        raw_msg = raw_msg[:260] + "..."

    parts = [type(exc).__name__]
    if status_code is not None:
        parts.append(f"status={status_code}")
    if status_label:
        parts.append(f"code={status_label}")
    if raw_msg:
        parts.append(f"message={raw_msg}")
    return " | ".join(parts)


def _is_model_not_found_error(exc: Exception) -> bool:
    code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
    status_text = str(getattr(exc, "status", "") or "").upper()
    msg_text = str(exc or "").lower()
    if code == 404 or status_text == "NOT_FOUND":
        return True
    return (
        "not found" in msg_text
        or "404" in msg_text
        or "is not supported for generatecontent" in msg_text
        or "model not found" in msg_text
    )


def _call_gemini_structured(
    api_key: str,
    sanitized_payload: Dict[str, Any],
) -> GeminiStructuredMentorOutput:
    """
    Executes a server-side Gemini API call using the official `google-genai` SDK
    with strict Pydantic structured JSON output.
    Targets `gemini-2.5-flash` first and cleanly falls back to `gemini-2.0-flash`
    if a model-not-found ClientError occurs.
    """
    from google import genai
    from google.genai import types

    clean_key = (api_key or "").strip()
    client = genai.Client(api_key=clean_key)
    prompt_body = (
        "Generate evidence-bound mixing & mastering coaching for the following sanitized "
        "mathematical DSP telemetry JSON. Cite ONLY exact evidence_id values from dsp_findings.\n\n"
        f"{json.dumps(sanitized_payload, indent=2)}"
    )

    candidate_models = [GEMINI_MODEL_NAME, GEMINI_FALLBACK_MODEL_NAME]
    last_exc: Optional[Exception] = None

    for idx, model_id in enumerate(candidate_models):
        try:
            response = client.models.generate_content(
                model=model_id,
                contents=prompt_body,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_INSTRUCTION,
                    response_mime_type="application/json",
                    response_schema=GeminiStructuredMentorOutput,
                    temperature=0.2,
                ),
            )
            raw_text = (getattr(response, "text", None) or "").strip()
            if not raw_text:
                raise ValueError("Gemini returned an empty response body.")
            _LAST_GEMINI_MODEL_USED.set(model_id)
            return GeminiStructuredMentorOutput.model_validate_json(raw_text)
        except Exception as exc:
            last_exc = exc
            is_last = idx == len(candidate_models) - 1
            if not is_last and _is_model_not_found_error(exc):
                logger.warning(
                    "Gemini primary model '%s' returned model-not-found (%s); retrying with fallback model '%s'.",
                    model_id,
                    _format_safe_gemini_error(exc, clean_key),
                    candidate_models[idx + 1],
                )
                continue
            raise

    assert last_exc is not None
    raise last_exc


def generate_ai_mentor_interpretation(
    report: Optional[Dict[str, Any]],
    genre: str,
    mix_stage: str,
    interface_mode: str,
    artist_vision: Optional[Sequence[str]],
    allow_ai_interpretation: bool,
    allow_direct_audio_inspection: bool = False,
    allow_model_training: bool = False,
    user_reported_context: Optional[Dict[str, Any]] = None,
) -> AiMentorResponse:
    """
    Main Phase 5 entry point invoked by POST /api/v1/interpret/ai.
    - Never sends raw audio bytes (raw_audio_sent_to_ai is strictly False when Toggle B is False;
      and in Phase 5 metrics-only JSON mode, zero audio bytes are ever attached).
    - Automatically falls back to Deterministic Offline Mentor on missing key, quota, timeout, or SDK error.
    """
    normalized_vision = normalize_artist_vision(artist_vision)
    sanitized_payload = sanitize_dsp_payload_for_ai(
        report=report,
        genre=genre,
        mix_stage=mix_stage,
        interface_mode=interface_mode,
        artist_vision=normalized_vision,
        user_reported_context=user_reported_context,
    )

    # Toggle B defaults to False; Phase 5 metrics-only flow sends strictly JSON (0 audio bytes)
    raw_audio_sent = False

    retention_policy = (
        "Ephemeral API processing only (metrics-only JSON, 0 audio bytes sent). "
        "User explicitly enabled model_training_opt_in=true (Toggle C); zero server audio retention."
        if allow_model_training
        else "Ephemeral API processing only (metrics-only JSON, 0 audio bytes sent). "
        "Zero server retention and zero model training on user audio or metrics."
    )

    privacy_audit = AiPrivacyAudit(
        raw_audio_sent_to_ai=raw_audio_sent,
        external_ai_enabled=bool(allow_ai_interpretation),
        direct_audio_inspection_enabled=bool(allow_direct_audio_inspection),
        training_opt_in=bool(allow_model_training),
        retention_policy=retention_policy,
    )

    api_key = (os.environ.get("GEMINI_API_KEY") or "").strip()
    if not api_key:
        logger.info("GEMINI_API_KEY is not configured; using deterministic offline mentor fallback.")
        return build_deterministic_mentor_response(
            sanitized_payload=sanitized_payload,
            privacy_audit=privacy_audit,
            fallback_reason="GEMINI_API_KEY is not configured on this server; running Deterministic Offline Mentor.",
        )

    _LAST_GEMINI_MODEL_USED.set(GEMINI_MODEL_NAME)
    try:
        gemini_parsed = _call_gemini_structured(api_key=api_key, sanitized_payload=sanitized_payload)
        used_model = _LAST_GEMINI_MODEL_USED.get()
        validated_steps, vision_note = _enforce_evidence_and_rule3(gemini_parsed, sanitized_payload)
        return AiMentorResponse(
            mentor_mode="gemini_live",
            model_name=used_model,
            fallback_reason=None,
            artist_vision=normalized_vision,
            objective_warnings_preserved=True,
            summary=gemini_parsed.summary,
            vision_alignment_note=vision_note,
            coaching_steps=validated_steps,
            privacy_audit=privacy_audit,
        )
    except Exception as exc:
        safe_err = _format_safe_gemini_error(exc, api_key)
        logger.warning(
            "Gemini AI Mentor call failed (%s); falling back to Deterministic Offline Mentor.",
            safe_err,
        )
        return build_deterministic_mentor_response(
            sanitized_payload=sanitized_payload,
            privacy_audit=privacy_audit,
            fallback_reason=f"Gemini API unavailable ({type(exc).__name__}); running Deterministic Offline Mentor.",
        )

"""
Phase 5 Pytest Suite: Consent-Gated Gemini AI Mentor, Artist Vision Profiles,
Evidence-Bound Citations, Rate Limiting & Deterministic Offline Fallback.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
import pytest

from backend.app.ai.mentor import (
    AiCoachingStep,
    AiMentorResponse,
    GeminiStructuredMentorOutput,
    sanitize_dsp_payload_for_ai,
)
from backend.app.main import app, reset_ai_rate_limiter

client = TestClient(app)

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DEMO_REPORT_FILE = BASE_DIR / "contracts" / "fixtures" / "demo_report.json"


@pytest.fixture(autouse=True)
def _reset_limiter():
    reset_ai_rate_limiter()
    yield
    reset_ai_rate_limiter()


def _load_sample_dsp_report() -> dict:
    with open(DEMO_REPORT_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def test_interpret_ai_returns_403_when_toggle_a_consent_is_false():
    report = _load_sample_dsp_report()
    payload = {
        "allow_ai_interpretation": False,
        "allow_direct_audio_inspection": False,
        "allow_model_training": False,
        "consent_state": {
            "audio_analysis_consent": True,
            "external_ai_transfer_consent": False,
            "ai_numerical_metrics_transfer_consent": False,
            "ai_audio_content_inspection_consent": False,
            "raw_audio_transfer_consent": False,
            "model_training_opt_in": False,
        },
        "artist_vision": ["Punchy", "Warm"],
        "report": report,
    }
    res = client.post("/api/v1/interpret/ai", json=payload)
    assert res.status_code == 403
    assert res.json()["detail"]["error_code"] == "AI_TRANSFER_CONSENT_REQUIRED"


def test_metrics_only_toggle_a_sends_zero_raw_audio_and_sets_privacy_audit_false(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    report = _load_sample_dsp_report()

    # Even if a client accidentally includes raw audio keys, sanitizer must strip them completely
    report_with_accident = {
        **report,
        "raw_audio": "BASE64_SHOULD_NEVER_BE_SENT",
        "audio_bytes": "SHOULD_BE_STRIPPED",
    }
    sanitized = sanitize_dsp_payload_for_ai(
        report=report_with_accident,
        genre="indie_rock",
        mix_stage="unmastered_mix",
        interface_mode="advanced",
        artist_vision=["Warm"],
        user_reported_context={
            "source_tag": "user_reported_context",
            "daw_name": "Ableton Live",
            "bus_routing": "Drum Bus -> Stereo Out",
            "plugin_chain_notes": "EQ Eight HPF 30 Hz",
        },
    )
    serialized = json.dumps(sanitized)
    assert "BASE64_SHOULD_NEVER_BE_SENT" not in serialized
    assert "SHOULD_BE_STRIPPED" not in serialized
    assert sanitized["user_reported_context"]["source_tag"] == "user_reported_context"

    res = client.post(
        "/api/v1/interpret/ai",
        json={
            "allow_ai_interpretation": True,
            "allow_direct_audio_inspection": False,
            "allow_model_training": False,
            "artist_vision": ["Warm", "Dynamic"],
            "report": report,
        },
    )
    assert res.status_code == 200
    parsed = AiMentorResponse.model_validate(res.json())
    assert parsed.privacy_audit.raw_audio_sent_to_ai is False
    assert parsed.privacy_audit.external_ai_enabled is True
    assert parsed.privacy_audit.direct_audio_inspection_enabled is False
    assert parsed.privacy_audit.training_opt_in is False
    assert "zero model training" in parsed.privacy_audit.retention_policy.lower()
    assert "ephemeral" in parsed.privacy_audit.retention_policy.lower()


def test_deterministic_offline_fallback_cites_real_evidence_ids_when_key_unset(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    report = _load_sample_dsp_report()
    valid_issue_ids = {iss["issue_id"] for iss in report["issues"]}

    res = client.post(
        "/api/v1/interpret/ai",
        json={
            "allow_ai_interpretation": True,
            "allow_direct_audio_inspection": False,
            "allow_model_training": False,
            "artist_vision": ["Punchy", "Wide"],
            "report": report,
        },
    )
    assert res.status_code == 200
    parsed = AiMentorResponse.model_validate(res.json())
    assert parsed.mentor_mode == "deterministic_fallback"
    assert parsed.model_name is None
    assert parsed.artist_vision == ["Punchy", "Wide"]
    assert len(parsed.coaching_steps) >= 1

    for step in parsed.coaching_steps:
        assert step.evidence_id in valid_issue_ids
        assert step.what_happened.strip()
        assert step.why_it_matters.strip()
        assert step.listen_prompt.strip()
        assert step.what_to_try.strip()
        assert step.recheck_target.strip()


def test_aggressive_artist_vision_never_suppresses_true_peak_objective_warning(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    # Report with severe inter-sample True Peak overshoot (+0.45 dBTP > -0.1 dBTP)
    hot_report = {
        "input_context": {
            "interface_mode": "advanced",
            "genre": "electronic_club",
            "mix_stage": "final_master",
        },
        "measurements": {
            "integrated_loudness": {"value": -7.8, "unit": "LUFS", "status": "warning"},
            "true_peak_max": {"value": 0.45, "unit": "dBTP", "status": "critical"},
            "phase_correlation_min": {"value": 0.35, "unit": "correlation", "status": "optimal"},
        },
        "issues": [
            {
                "issue_id": "issue-tp-hot-001",
                "classification": "objective_technical",
                "domain": "true_peak_clipping",
                "severity": "critical",
                "confidence": 0.99,
                "title": "True Peak Ceiling Overshoot (+0.45 dBTP)",
                "timestamps": [{"start_sec": 12.0, "end_sec": 15.0, "label": "Drop peak"}],
                "evidence": [
                    {
                        "metric_key": "true_peak_max",
                        "measured_value": 0.45,
                        "unit": "dBTP",
                        "target_range": "<= -1.0 dBTP",
                        "method": "4x polyphase ISP",
                    }
                ],
                "learning_guide": {
                    "what_was_detected": "True Peak hit +0.45 dBTP, exceeding the -0.1 dBTP clipping boundary.",
                    "why_it_matters": "Inter-sample overshoots distort on streaming codecs.",
                    "what_to_try": "Set limiter ceiling to -1.0 dBTP with oversampling enabled.",
                    "how_to_verify": "Confirm true_peak_max <= -1.0 dBTP in Revision v2.",
                },
            }
        ],
    }

    res = client.post(
        "/api/v1/interpret/ai",
        json={
            "allow_ai_interpretation": True,
            "allow_direct_audio_inspection": False,
            "allow_model_training": False,
            "artist_vision": ["Aggressive"],
            "report": hot_report,
        },
    )
    assert res.status_code == 200
    parsed = AiMentorResponse.model_validate(res.json())
    assert parsed.objective_warnings_preserved is True
    obj_steps = [s for s in parsed.coaching_steps if s.classification == "objective_technical"]
    assert len(obj_steps) >= 1
    assert any(s.evidence_id == "issue-tp-hot-001" for s in obj_steps)
    assert "aggressive" in parsed.vision_alignment_note.lower()

    # Also verify Rule 3 post-validation: even if mocked live Gemini omits the objective warning,
    # the backend MUST re-inject it and never suppress true_peak_dbtp > -0.1!
    monkeypatch.setenv("GEMINI_API_KEY", "test-fake-key-for-mock")
    mock_gemini_output = GeminiStructuredMentorOutput(
        summary="Track sounds loud and aggressive.",
        vision_alignment_note="Aggressive vibe achieved.",
        coaching_steps=[
            AiCoachingStep(
                evidence_id="invented_hallucinated_id",
                classification="subjective_stylistic",
                title="Keep pushing louder",
                what_happened="Loud mix",
                why_it_matters="Hits hard",
                listen_prompt="Listen to drums",
                what_to_try="Leave ceiling hot",
                recheck_target="None",
            )
        ],
    )
    with patch("backend.app.ai.mentor._call_gemini_structured", return_value=mock_gemini_output):
        live_res = client.post(
            "/api/v1/interpret/ai",
            json={
                "allow_ai_interpretation": True,
                "allow_direct_audio_inspection": False,
                "allow_model_training": False,
                "artist_vision": ["Aggressive"],
                "report": hot_report,
            },
        )
    assert live_res.status_code == 200
    live_parsed = AiMentorResponse.model_validate(live_res.json())
    assert live_parsed.mentor_mode == "gemini_live"
    assert live_parsed.privacy_audit.raw_audio_sent_to_ai is False
    # Hallucinated ID stripped, objective True Peak warning preserved!
    assert all(s.evidence_id != "invented_hallucinated_id" for s in live_parsed.coaching_steps)
    assert any(
        s.evidence_id == "issue-tp-hot-001" and s.classification == "objective_technical"
        for s in live_parsed.coaching_steps
    )


def test_interpret_ai_rate_limit_protects_quota(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    body = {
        "allow_ai_interpretation": True,
        "artist_vision": ["Dynamic"],
        "report": {"measurements": {}, "issues": []},
    }
    for _ in range(15):
        r = client.post("/api/v1/interpret/ai", json=body)
        assert r.status_code == 200

    blocked = client.post("/api/v1/interpret/ai", json=body)
    assert blocked.status_code == 429
    assert blocked.json()["detail"]["error_code"] == "AI_MENTOR_RATE_LIMIT_EXCEEDED"
    assert "retry-after" in {k.lower() for k in blocked.headers.keys()}

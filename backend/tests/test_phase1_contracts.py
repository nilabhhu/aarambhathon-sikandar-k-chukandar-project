"""
Phase 1 Pytest Contract, Endpoint & Boundary Verification Suite.
Verifies:
1. Health and capabilities endpoints return HTTP 200 and enforce Phase 1 boundaries.
2. Canonical schema and demo report endpoints return valid version 1.0.0 contracts.
3. Rule 1: AI stem separation / pseudo-stems are rejected with HTTP 422.
4. Rule 4: Consent gating blocks unauthorized analysis (403) and external AI transfer (403).
5. Phase 2-6 endpoints return HTTP 501 Not Implemented.
6. Rule 9: Ephemeral temporary storage is cleaned up automatically without disk residue.
"""

import json
from pathlib import Path
from fastapi.testclient import TestClient
import jsonschema
import pytest

from backend.app.main import app, EphemeralAudioWorkspace

client = TestClient(app)

BASE_DIR = Path(__file__).resolve().parent.parent.parent
SCHEMA_FILE = BASE_DIR / "contracts" / "analysis_report.schema.json"


def test_root_health_endpoint():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["phase"] == 1
    assert data["is_demonstration_mode"] is True


def test_api_v1_health_endpoint():
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["phase"] == 1
    assert data["mode"] == "foundation_contracts_only"
    assert data["is_demonstration_mode"] is True
    assert data["active_contract_version"] == "1.0.0"


def test_capabilities_endpoint_reports_phase1_boundaries():
    res = client.get("/api/v1/capabilities")
    assert res.status_code == 200
    data = res.json()
    assert data["phase"] == 1

    rules = data["rules_enforced"]
    assert rules["no_ai_stem_separation"] is True
    assert rules["dsp_is_sole_measurement_source"] is True
    assert rules["separate_three_tier_consent"] is True
    assert rules["default_no_model_training"] is True
    assert rules["objective_vs_subjective_separated"] is True
    assert rules["zero_unnecessary_infrastructure"] is True

    caps = data["capabilities_status"]
    assert caps["dsp_core_measurements"] == "DEMO_FIXTURE_ONLY"
    assert caps["ai_stem_separation"] == "PROHIBITED_BY_PRODUCT_RULE"
    assert caps["streaming_normalization_estimates"] == "NOT_IMPLEMENTED_PHASE_3"
    assert caps["original_stem_multitrack_analysis"] == "NOT_IMPLEMENTED_PHASE_4"
    assert caps["ai_educational_interpretation"] == "NOT_IMPLEMENTED_PHASE_5"


def test_schema_endpoint_serves_valid_canonical_schema():
    res = client.get("/api/v1/contracts/schema")
    assert res.status_code == 200
    schema = res.json()
    assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert schema["properties"]["schema_version"]["const"] == "1.0.0"


def test_demo_report_endpoint_validates_against_schema():
    res = client.get("/api/v1/demo/report")
    assert res.status_code == 200
    report = res.json()
    assert report["schema_version"] == "1.0.0"
    assert report["is_demonstration_data"] is True
    assert len(report["issues"]) >= 4

    # Validate against actual canonical schema
    with open(SCHEMA_FILE, "r", encoding="utf-8") as f:
        schema = json.load(f)
    jsonschema.validate(instance=report, schema=schema)


def test_analyze_demo_respects_consent_gate():
    # Attempt without audio analysis consent -> 403 Forbidden
    unconsented_payload = {
        "interface_mode": "advanced",
        "genre": "indie_rock",
        "mix_stage": "unmastered_mix",
        "consent_state": {
            "audio_analysis_consent": False,
            "external_ai_transfer_consent": False,
            "model_training_opt_in": False,
            "consent_timestamp": "2026-11-10T18:00:00Z",
        },
    }
    blocked_res = client.post("/api/v1/analyze/demo", json=unconsented_payload)
    assert blocked_res.status_code == 403
    assert blocked_res.json()["detail"]["error_code"] == "CONSENT_REQUIRED"

    # Consented payload -> 200 OK
    consented_payload = {
        **unconsented_payload,
        "consent_state": {
            **unconsented_payload["consent_state"],
            "audio_analysis_consent": True,
        },
    }
    ok_res = client.post("/api/v1/analyze/demo", json=consented_payload)
    assert ok_res.status_code == 200
    report = ok_res.json()
    assert report["is_demonstration_data"] is True
    assert report["input_context"]["genre"] == "indie_rock"


def test_phase2_dsp_endpoint_returns_501_not_implemented():
    res = client.post("/api/v1/analyze/dsp")
    assert res.status_code == 501
    assert res.json()["detail"]["target_phase"] == 2


def test_phase3_reference_and_streaming_return_501():
    ref_res = client.post("/api/v1/analyze/reference")
    assert ref_res.status_code == 501
    assert ref_res.json()["detail"]["target_phase"] == 3

    stream_res = client.post("/api/v1/analyze/streaming")
    assert stream_res.status_code == 501
    assert stream_res.json()["detail"]["target_phase"] == 3


def test_rule1_rejects_ai_stem_separation_with_422():
    res = client.post(
        "/api/v1/analyze/stems",
        json=[{"stem_name": "demucs_vocals.wav", "stem_source_type": "ai_separated"}],
    )
    assert res.status_code == 422
    assert res.json()["detail"]["error_code"] == "PROHIBITED_AI_STEM_SEPARATION"


def test_original_stems_return_501_in_phase1():
    res = client.post(
        "/api/v1/analyze/stems",
        json=[{"stem_name": "original_drums.wav", "stem_source_type": "user_uploaded_original"}],
    )
    assert res.status_code == 501
    assert res.json()["detail"]["target_phase"] == 4


def test_phase5_revisions_returns_501():
    res = client.post("/api/v1/analyze/revisions")
    assert res.status_code == 501
    assert res.json()["detail"]["target_phase"] == 5


def test_phase5_ai_endpoint_enforces_consent_and_501():
    # Without AI consent -> 403 Forbidden
    no_ai_consent = {
        "report_id": "demo-p1-indie_rock-unmastered_mix",
        "consent_state": {
            "audio_analysis_consent": True,
            "external_ai_transfer_consent": False,
            "model_training_opt_in": False,
            "consent_timestamp": "2026-11-10T18:00:00Z",
        },
    }
    forbidden_res = client.post("/api/v1/interpret/ai", json=no_ai_consent)
    assert forbidden_res.status_code == 403
    assert forbidden_res.json()["detail"]["error_code"] == "AI_TRANSFER_CONSENT_REQUIRED"

    # With AI consent -> 501 Not Implemented (Phase 5 boundary)
    with_ai_consent = {
        "report_id": "demo-p1-indie_rock-unmastered_mix",
        "consent_state": {
            "audio_analysis_consent": True,
            "external_ai_transfer_consent": True,
            "model_training_opt_in": False,
            "consent_timestamp": "2026-11-10T18:00:00Z",
        },
    }
    not_impl_res = client.post("/api/v1/interpret/ai", json=with_ai_consent)
    assert not_impl_res.status_code == 501
    assert not_impl_res.json()["detail"]["target_phase"] == 5


def test_ephemeral_workspace_purged_after_context_exit():
    temp_path = None
    with EphemeralAudioWorkspace(prefix="test-mixlearn-") as workspace:
        temp_path = workspace
        assert temp_path.exists()
        # Create a dummy file in workspace
        dummy_file = temp_path / "test.txt"
        dummy_file.write_text("ephemeral audio scratchpad")
        assert dummy_file.exists()

    # Workspace directory must be deleted on context exit
    assert not temp_path.exists()

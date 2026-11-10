"""
Phase 1 Pytest Contract & Boundary Verification Suite.
Verifies:
1. Health and capabilities endpoints return HTTP 200 and enforce Phase 1 boundaries.
2. Phase 2-6 endpoints return HTTP 501 Not Implemented.
3. Rule 1: AI stem separation / pseudo-stems are rejected with HTTP 422.
"""
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)


def test_health_endpoint_marks_demonstration_mode():
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    body = res.json()
    assert body["phase"] == 1
    assert body["is_demonstration_mode"] is True


def test_capabilities_enforces_product_rules():
    res = client.get("/api/v1/capabilities")
    assert res.status_code == 200
    body = res.json()
    rules = body["rules_enforced"]
    assert rules["no_ai_stem_separation"] is True
    assert rules["dsp_is_sole_measurement_source"] is True
    assert rules["separate_three_tier_consent"] is True
    assert rules["default_no_model_training"] is True


def test_phase2_dsp_endpoint_returns_501_not_implemented():
    res = client.post("/api/v1/analyze/dsp")
    assert res.status_code == 501
    assert res.json()["detail"]["target_phase"] == 2


def test_rule1_rejects_ai_stem_separation():
    res = client.post(
        "/api/v1/analyze/stems",
        json=[{"stem_name": "vocals.wav", "stem_source_type": "ai_separated"}],
    )
    assert res.status_code == 422
    assert res.json()["detail"]["error_code"] == "PROHIBITED_AI_STEM_SEPARATION"

"""
Phase 6 Edge-Case & Hardening Pytest Suite for MixLearn Studio.

Deterministic synthetic audio coverage:
1. Digital silence WAV (no fabricated LUFS or +1.0 phase correlation)
2. Pure mono WAV (channels == 1, stereo metrics explicitly unavailable)
3. Phase-inverted stereo WAV (phase_correlation_mean ~= -1.0, objective phase issue)
4. Heavily clipped master (> 0.0 dBTP, sample_clipping_events > 0, objective warnings)
5. Short 3-second & 4-second clips (populated Short-Term LUFS timeline & clamped timestamps)
6. Corrupt / invalid audio header (clean HTTP 400/422, never HTTP 500)
7. Dynamic privacy_audit.retention_policy reflecting allow_model_training (Toggle C)
"""

import json
import numpy as np
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.tests.fixtures_generator import (
    generate_clipped_audio,
    generate_out_of_phase_stereo,
    generate_silence,
    generate_sine_wave,
    save_audio_to_bytes,
)

client = TestClient(app)

DEFAULT_CONSENT_JSON = json.dumps({
    "audio_analysis_consent": True,
    "external_ai_transfer_consent": False,
    "ai_numerical_metrics_transfer_consent": False,
    "ai_audio_content_inspection_consent": False,
    "raw_audio_transfer_consent": False,
    "model_training_opt_in": False,
})


def _post_dsp(wav_bytes: bytes, filename: str, mix_stage: str = "final_master"):
    return client.post(
        "/api/v1/analyze/dsp",
        files={"audio_file": (filename, wav_bytes, "audio/wav")},
        data={
            "interface_mode": "advanced",
            "genre": "indie_rock",
            "mix_stage": mix_stage,
            "consent_state_json": DEFAULT_CONSENT_JSON,
        },
    )


def test_phase6_digital_silence_never_fabricates_metrics():
    data, sr = generate_silence(duration_sec=3.5, sample_rate=48000, channels=2)
    wav_bytes = save_audio_to_bytes(data, sr, subtype="PCM_24", format="WAV")

    res = _post_dsp(wav_bytes, "phase6_silence.wav")
    assert res.status_code == 200, res.text
    report = res.json()

    m = report["measurements"]
    assert m["integrated_loudness"]["value"] is None
    assert m["integrated_loudness"]["status"] == "unavailable"
    assert m["short_term_max_loudness"]["value"] is None
    assert m["phase_correlation_mean"]["value"] is None
    assert m["phase_correlation_mean"]["status"] == "unavailable"
    assert m["crest_factor"]["value"] is None


def test_phase6_pure_mono_wav_marks_stereo_metrics_unavailable():
    data, sr = generate_sine_wave(
        duration_sec=3.5, sample_rate=48000, frequency=440.0, peak_dbfs=-6.0, channels=1
    )
    wav_bytes = save_audio_to_bytes(data, sr, subtype="PCM_24", format="WAV")

    res = _post_dsp(wav_bytes, "phase6_mono.wav")
    assert res.status_code == 200, res.text
    report = res.json()

    assert report["file_metadata"]["channels"] == 1
    m = report["measurements"]
    assert m["integrated_loudness"]["value"] is not None
    assert m["phase_correlation_mean"]["value"] is None
    assert m["phase_correlation_mean"]["unavailable_reason"] == "mono_input_no_stereo_field"
    assert m["phase_correlation_min"]["unavailable_reason"] == "mono_input_no_stereo_field"
    assert m["stereo_width_index"]["unavailable_reason"] == "mono_input_no_stereo_field"


def test_phase6_phase_inverted_stereo_detects_negative_correlation():
    data, sr = generate_out_of_phase_stereo(
        duration_sec=3.5, sample_rate=48000, frequency=440.0, peak_dbfs=-6.0
    )
    wav_bytes = save_audio_to_bytes(data, sr, subtype="PCM_24", format="WAV")

    res = _post_dsp(wav_bytes, "phase6_inverted.wav")
    assert res.status_code == 200, res.text
    report = res.json()

    m = report["measurements"]
    assert m["phase_correlation_mean"]["value"] is not None
    assert m["phase_correlation_mean"]["value"] <= -0.95
    assert m["phase_correlation_min"]["value"] <= -0.95

    phase_issues = [
        iss for iss in report["issues"]
        if iss["classification"] == "objective_technical" and iss["domain"] == "phase_polarity"
    ]
    assert len(phase_issues) >= 1


def test_phase6_heavily_clipped_master_exceeds_zero_dbtp_and_flags_clipping():
    # Generate heavily overdriven multi-harmonic stereo wave clipped to +/-1.0
    # so 4x oversampled True Peak exceeds 0.0 dBTP and contiguous sample runs trigger.
    sr = 48000
    duration_sec = 3.5
    t = np.arange(int(sr * duration_sec)) / float(sr)
    raw = 2.4 * np.sin(2.0 * np.pi * 1000.0 * t) + 1.2 * np.sin(2.0 * np.pi * 3000.0 * t)
    clipped = np.clip(raw, -1.0, 1.0).astype(np.float32)
    stereo = np.column_stack((clipped, clipped))
    wav_bytes = save_audio_to_bytes(stereo, sr, subtype="PCM_16", format="WAV")

    res = _post_dsp(wav_bytes, "phase6_heavily_clipped.wav", mix_stage="final_master")
    assert res.status_code == 200, res.text
    report = res.json()

    m = report["measurements"]
    assert m["true_peak_max"]["value"] is not None
    assert m["true_peak_max"]["value"] > 0.0
    assert m["sample_clipping_events"]["value"] > 0

    objective_domains = {
        iss["domain"] for iss in report["issues"] if iss["classification"] == "objective_technical"
    }
    assert "true_peak_clipping" in objective_domains


def test_phase6_short_3s_and_4s_clips_populate_short_term_lufs_and_clamp_timestamps():
    for dur in (3.0, 4.0):
        data, sr = generate_sine_wave(
            duration_sec=dur, sample_rate=44100, frequency=1000.0, peak_dbfs=-9.0, channels=2
        )
        wav_bytes = save_audio_to_bytes(data, sr, subtype="PCM_24", format="WAV")

        res = _post_dsp(wav_bytes, f"phase6_short_{int(dur)}s.wav", mix_stage="unmastered_mix")
        assert res.status_code == 200, res.text
        report = res.json()

        m = report["measurements"]
        assert m["short_term_max_loudness"]["value"] is not None
        assert -30.0 <= m["short_term_max_loudness"]["value"] <= 0.0

        timeline = report["timeline"]
        assert timeline is not None
        buckets = timeline["buckets"]
        assert len(buckets) >= 12
        finite_st = [b["short_term_lufs"] for b in buckets if b["short_term_lufs"] is not None]
        assert len(finite_st) >= 8, f"Expected populated short_term_lufs buckets for {dur}s clip"

        reported_dur = report["file_metadata"]["duration_seconds"]
        for iss in report["issues"]:
            for ts in iss["timestamps"]:
                assert 0.0 <= ts["start_sec"] <= reported_dur + 0.05
                assert ts["start_sec"] <= ts["end_sec"] <= reported_dur + 0.05


def test_phase6_corrupt_audio_header_returns_400_or_422_never_500():
    corrupt_bytes = b"RIFF\x00\x00\x00\x00NOT_A_VALID_WAVE_STREAM_CORRUPTED_HEADER_1234567890"
    res = _post_dsp(corrupt_bytes, "phase6_corrupt.wav")

    assert res.status_code in (400, 422), f"Expected 400/422 for corrupt WAV, got {res.status_code}: {res.text}"
    assert res.status_code != 500
    body = res.json()
    assert "detail" in body


def test_phase6_dynamic_retention_policy_reflects_model_training_toggle(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    base_payload = {
        "genre": "indie_rock",
        "mix_stage": "unmastered_mix",
        "interface_mode": "advanced",
        "artist_vision": [],
        "allow_ai_interpretation": True,
        "allow_direct_audio_inspection": False,
        "report": {"measurements": {}, "issues": []},
    }

    res_opt_out = client.post(
        "/api/v1/interpret/ai",
        json={
            **base_payload,
            "allow_model_training": False,
            "consent_state": {
                "audio_analysis_consent": True,
                "external_ai_transfer_consent": True,
                "ai_numerical_metrics_transfer_consent": True,
                "ai_audio_content_inspection_consent": False,
                "raw_audio_transfer_consent": False,
                "model_training_opt_in": False,
            },
        },
    )
    assert res_opt_out.status_code == 200, res_opt_out.text
    audit_off = res_opt_out.json()["privacy_audit"]
    assert audit_off["training_opt_in"] is False
    assert "zero model training" in audit_off["retention_policy"].lower()

    res_opt_in = client.post(
        "/api/v1/interpret/ai",
        json={
            **base_payload,
            "allow_model_training": True,
            "consent_state": {
                "audio_analysis_consent": True,
                "external_ai_transfer_consent": True,
                "ai_numerical_metrics_transfer_consent": True,
                "ai_audio_content_inspection_consent": False,
                "raw_audio_transfer_consent": False,
                "model_training_opt_in": True,
            },
        },
    )
    assert res_opt_in.status_code == 200, res_opt_in.text
    audit_on = res_opt_in.json()["privacy_audit"]
    assert audit_on["training_opt_in"] is True
    assert "zero model training" not in audit_on["retention_policy"].lower()
    assert "model_training_opt_in=true" in audit_on["retention_policy"].lower()

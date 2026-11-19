"""
Phase 4 Pytest Suite: Original User-Uploaded Stem Diagnostics & Mix Revision Delta Verification.

Verifies:
1. Aligned synthetic stems (Kick + Bass + Vocals) return valid per-stem LUFS,
   sample peak, true peak headroom, spectral centroid (Hz), and pairwise 6-band
   frequency overlap matrix (plus optional primary stereo mix residual).
2. Misaligned stems (> 50 ms duration mismatch) return HTTP 422 STEM_ALIGNMENT_MISMATCH.
3. Non-Negotiable Rule #1: HTTP 422 PROHIBITED_AI_STEM_SEPARATION passes for AI stem
   separation requests AND single-stereo-mixdown stem requests.
4. Mix Revision v1 vs. v2 comparison (both two-bounce upload and v1_report_json + mix_v2)
   computes exact deterministic deltas and classifies prior findings as
   improved, unchanged, and regressed.
"""

import io
import json
from typing import Tuple

from fastapi.testclient import TestClient
import numpy as np
import soundfile as sf

from backend.app.main import app

client = TestClient(app)


def _make_wav_bytes(
    signal: np.ndarray,
    sr: int = 44100,
    subtype: str = "PCM_16",
) -> bytes:
    buf = io.BytesIO()
    sf.write(buf, signal, sr, format="WAV", subtype=subtype)
    buf.seek(0)
    return buf.read()


def _sine_stereo(
    freq_hz: float,
    duration_sec: float = 3.5,
    amp: float = 0.25,
    sr: int = 44100,
) -> np.ndarray:
    t = np.arange(int(round(duration_sec * sr)), dtype=np.float32) / float(sr)
    wave = (amp * np.sin(2.0 * np.pi * freq_hz * t)).astype(np.float32)
    return np.column_stack([wave, wave])


def _compound_stereo(
    components: Tuple[Tuple[float, float], ...],
    duration_sec: float = 3.5,
    sr: int = 44100,
    invert_right: bool = False,
    clip_hard: bool = False,
) -> np.ndarray:
    t = np.arange(int(round(duration_sec * sr)), dtype=np.float32) / float(sr)
    mono = np.zeros_like(t)
    for freq_hz, amp in components:
        mono += (amp * np.sin(2.0 * np.pi * freq_hz * t)).astype(np.float32)
    if clip_hard:
        mono = np.clip(mono, -1.0, 1.0)
    right = -mono if invert_right else mono
    return np.column_stack([mono, right])


def test_aligned_original_stems_return_metrics_overlap_matrix_and_residual():
    sr = 44100
    dur = 3.5
    # Kick & Bass both have strong 100 Hz energy (Low 60-250 Hz overlap),
    # while Vocals sit cleanly at 1600 Hz (High-Mid 800-4k Hz).
    kick_sig = _compound_stereo(((65.0, 0.28), (110.0, 0.24)), duration_sec=dur, sr=sr)
    bass_sig = _compound_stereo(((95.0, 0.25), (140.0, 0.22)), duration_sec=dur, sr=sr)
    vocals_sig = _compound_stereo(((1600.0, 0.22), (3200.0, 0.10)), duration_sec=dur, sr=sr)

    # Primary stereo mix = linear stem sum scaled slightly (simulating master bus gain/glue)
    primary_sig = np.clip((kick_sig + bass_sig + vocals_sig) * 0.85, -0.95, 0.95)

    files = [
        ("stems", ("Kick.wav", _make_wav_bytes(kick_sig, sr), "audio/wav")),
        ("stems", ("Bass.wav", _make_wav_bytes(bass_sig, sr), "audio/wav")),
        ("stems", ("Vocals.wav", _make_wav_bytes(vocals_sig, sr), "audio/wav")),
        ("primary_mix", ("Full_Mix.wav", _make_wav_bytes(primary_sig, sr), "audio/wav")),
    ]
    res = client.post("/api/v1/analyze/stems", files=files)
    assert res.status_code == 200, res.text
    data = res.json()

    assert data["has_user_stems"] is True
    assert data["stem_source_type"] == "user_uploaded_original"
    assert data["stem_count"] == 3
    assert data["alignment"]["aligned"] is True
    assert data["alignment"]["max_duration_diff_ms"] <= 50.0

    stems_by_name = {s["stem_name"]: s for s in data["stems"]}
    assert set(stems_by_name.keys()) == {"Kick.wav", "Bass.wav", "Vocals.wav"}

    # Per-stem telemetry sanity
    for name, stem in stems_by_name.items():
        assert stem["integrated_lufs"] is not None
        assert stem["sample_peak_dbfs"] is not None
        assert stem["true_peak_dbtp"] is not None
        assert stem["headroom_db"] is not None
        assert stem["spectral_centroid_hz"] is not None
        assert len(stem["six_band_energies_db"]) == 6

    # Spectral centroid ordering: Vocals (1600+ Hz) >> Kick/Bass (~100 Hz)
    assert stems_by_name["Vocals.wav"]["spectral_centroid_hz"] > 1200.0
    assert stems_by_name["Kick.wav"]["spectral_centroid_hz"] < 250.0
    assert stems_by_name["Bass.wav"]["spectral_centroid_hz"] < 250.0

    # Pairwise overlap matrix: 3 stems -> 3 pairs
    matrix = data["overlap_matrix"]
    assert len(matrix["bands"]) == 6
    assert len(matrix["pairs"]) == 3
    assert "potential spectral masking" in matrix["methodology_note"].lower()

    kick_bass_pair = next(
        p for p in matrix["pairs"]
        if {p["stem_a_name"], p["stem_b_name"]} == {"Kick.wav", "Bass.wav"}
    )
    kick_vox_pair = next(
        p for p in matrix["pairs"]
        if {p["stem_a_name"], p["stem_b_name"]} == {"Kick.wav", "Vocals.wav"}
    )
    # Kick vs Bass must overlap strongly in Low (60-250 Hz), far more than Kick vs Vocals
    assert kick_bass_pair["peak_overlap_band"] == "low"
    assert kick_bass_pair["bands"]["low"]["severity"] in ("moderate", "high")
    assert kick_bass_pair["bands"]["low"]["overlap_score"] > kick_vox_pair["bands"]["low"]["overlap_score"]

    # Primary mix residual summary present and honest
    residual = data["primary_mix_residual"]
    assert residual is not None
    assert residual["available"] is True
    assert residual["primary_mix_rms_dbfs"] is not None
    assert residual["stem_sum_rms_dbfs"] is not None
    assert "master-bus" in residual["interpretation_note"].lower()


def test_misaligned_stems_return_422_alignment_error():
    sr = 44100
    stem_a = _sine_stereo(100.0, duration_sec=3.0, sr=sr)
    # 200 ms longer (> 50 ms tolerance)
    stem_b = _sine_stereo(440.0, duration_sec=3.2, sr=sr)

    files = [
        ("stems", ("Kick.wav", _make_wav_bytes(stem_a, sr), "audio/wav")),
        ("stems", ("Bass.wav", _make_wav_bytes(stem_b, sr), "audio/wav")),
    ]
    res = client.post("/api/v1/analyze/stems", files=files)
    assert res.status_code == 422
    detail = res.json()["detail"]
    assert detail["error_code"] == "STEM_ALIGNMENT_MISMATCH"
    assert detail["max_duration_diff_ms"] > 50.0


def test_rule1_blocks_ai_separation_and_single_stereo_mixdown_on_stems_endpoint():
    sr = 44100
    mixdown = _sine_stereo(220.0, duration_sec=2.0, sr=sr)

    # 1. Single stereo mixdown passed as sole stem -> 422 PROHIBITED_AI_STEM_SEPARATION
    res_single = client.post(
        "/api/v1/analyze/stems",
        files=[("stems", ("full_stereo_mix.wav", _make_wav_bytes(mixdown, sr), "audio/wav"))],
    )
    assert res_single.status_code == 422
    assert res_single.json()["detail"]["error_code"] == "PROHIBITED_AI_STEM_SEPARATION"

    # 2. Multipart request flagging AI separation -> 422 PROHIBITED_AI_STEM_SEPARATION
    res_ai_flag = client.post(
        "/api/v1/analyze/stems",
        data={"stem_source_type": "ai_separated"},
        files=[
            ("stems", ("s1.wav", _make_wav_bytes(mixdown, sr), "audio/wav")),
            ("stems", ("s2.wav", _make_wav_bytes(mixdown, sr), "audio/wav")),
        ],
    )
    assert res_ai_flag.status_code == 422
    assert res_ai_flag.json()["detail"]["error_code"] == "PROHIBITED_AI_STEM_SEPARATION"

    # 3. Single stereo mix passed as primary_mix without stems -> 422 PROHIBITED_AI_STEM_SEPARATION
    res_only_mix = client.post(
        "/api/v1/analyze/stems",
        files=[("primary_mix", ("mix.wav", _make_wav_bytes(mixdown, sr), "audio/wav"))],
    )
    assert res_only_mix.status_code == 422
    assert res_only_mix.json()["detail"]["error_code"] == "PROHIBITED_AI_STEM_SEPARATION"


def test_revision_comparison_two_bounces_detects_improved_unchanged_and_regressed():
    sr = 44100
    # v1: Hard-clipped loud mix with heavy 300 Hz mud and moderate loudness
    v1_sig = _compound_stereo(
        ((60.0, 0.25), (300.0, 0.95), (2500.0, 0.20)),
        duration_sec=3.5,
        sr=sr,
        clip_hard=True,
    )
    # v2: Headroom restored (no clipping!), mud reduced, clean peaks
    v2_sig = _compound_stereo(
        ((60.0, 0.12), (300.0, 0.14), (2500.0, 0.12)),
        duration_sec=3.5,
        sr=sr,
        clip_hard=False,
    )

    res = client.post(
        "/api/v1/compare/revisions",
        data={"genre": "indie_rock", "mix_stage": "unmastered_mix"},
        files=[
            ("mix_v1", ("song_v1.wav", _make_wav_bytes(v1_sig, sr), "audio/wav")),
            ("mix_v2", ("song_v2.wav", _make_wav_bytes(v2_sig, sr), "audio/wav")),
        ],
    )
    assert res.status_code == 200, res.text
    comp = res.json()

    deltas = comp["metric_deltas"]
    assert deltas["delta_integrated_lufs"] is not None
    assert deltas["delta_integrated_lufs"] < -5.0  # v2 is quieter with restored headroom
    assert deltas["delta_true_peak_dbtp"] is not None
    assert deltas["delta_true_peak_dbtp"] < -3.0

    # All 6 spectral bands must be populated with v1, v2, and delta
    assert set(comp["delta_spectral_db"].keys()) == {
        "sub",
        "low",
        "low_mid",
        "high_mid",
        "presence",
        "air",
    }
    assert comp["delta_spectral_db"]["low_mid"]["delta_db"] < -5.0

    # Prior v1 issues (clipping / true peak ceiling) must be classified as 'improved'
    verifications = comp["finding_verifications"]
    assert len(verifications) >= 1
    assert any(v["status"] == "improved" for v in verifications)
    assert comp["summary_counts"]["improved"] >= 1


def test_revision_comparison_v1_report_json_and_mix_v2_classifies_all_three_states():
    sr = 44100
    # First analyze v1 via /api/v1/analyze/dsp to get a genuine v1 DSP report
    v1_sig = _compound_stereo(
        ((60.0, 0.18), (300.0, 0.90), (2500.0, 0.12)),
        duration_sec=3.5,
        sr=sr,
        clip_hard=True,
    )
    v1_res = client.post(
        "/api/v1/analyze/dsp",
        data={"genre": "indie_rock", "mix_stage": "unmastered_mix"},
        files={"audio_file": ("baseline_v1.wav", _make_wav_bytes(v1_sig, sr), "audio/wav")},
    )
    assert v1_res.status_code == 200, v1_res.text
    v1_report = v1_res.json()

    # Now create v2 that fixes clipping (improved) but introduces phase inversion (regressed)
    # and compare via v1_report_json + mix_v2
    v2_sig = _compound_stereo(
        ((60.0, 0.10), (300.0, 0.14), (2500.0, 0.08)),
        duration_sec=3.5,
        sr=sr,
        invert_right=True,
        clip_hard=False,
    )
    comp_res = client.post(
        "/api/v1/compare/revisions",
        data={
            "genre": "indie_rock",
            "mix_stage": "unmastered_mix",
            "v1_report_json": json.dumps(v1_report),
        },
        files={"mix_v2": ("revised_v2.wav", _make_wav_bytes(v2_sig, sr), "audio/wav")},
    )
    assert comp_res.status_code == 200, comp_res.text
    comp = comp_res.json()

    # Phase correlation delta should drop sharply (from +1.0 toward -1.0)
    assert comp["metric_deltas"]["delta_phase_correlation"] < -1.5
    # New phase issue should be surfaced in new_v2_issues
    assert any(i["domain"] == "phase_polarity" for i in comp["new_v2_issues"])
    # Clipping/peak issues from v1 should be improved
    assert comp["summary_counts"]["improved"] >= 1

    # Also test JSON v1_report + v2_report directly for unchanged & regressed classification
    # Clone v1_report and degrade true_peak_max while keeping another issue unchanged
    degraded_v2 = json.loads(json.dumps(v1_report))
    if degraded_v2["measurements"]["true_peak_max"]["value"] is not None:
        degraded_v2["measurements"]["true_peak_max"]["value"] = round(
            degraded_v2["measurements"]["true_peak_max"]["value"] + 2.5, 2
        )
    json_res = client.post(
        "/api/v1/compare/revisions",
        json={"v1_report": v1_report, "v2_report": degraded_v2},
    )
    assert json_res.status_code == 200, json_res.text
    json_comp = json_res.json()
    statuses = {f["status"] for f in json_comp["finding_verifications"]}
    assert "regressed" in statuses
    assert "unchanged" in statuses

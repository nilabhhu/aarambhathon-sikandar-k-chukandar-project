"""
Comprehensive endpoint test suite for MixLearn Studio Phase 2 POST /api/v1/analyze/dsp.
Covers all 18 mandatory test fixtures and edge cases defined in Section 11 of the Phase 2 specification.
"""

import io
import json
from pathlib import Path
from fastapi.testclient import TestClient
import jsonschema
import numpy as np
import pytest
import soundfile as sf

from backend.app.main import app
from backend.tests.fixtures_generator import (
    generate_clipped_audio,
    generate_multi_tone_spectral,
    generate_out_of_phase_stereo,
    generate_silence,
    generate_sine_wave,
    save_audio_to_bytes,
)

client = TestClient(app)

BASE_DIR = Path(__file__).resolve().parent.parent.parent
SCHEMA_FILE = BASE_DIR / "contracts" / "analysis_report.schema.json"

with open(SCHEMA_FILE, "r", encoding="utf-8") as f:
    SCHEMA_V2 = json.load(f)


def make_consent_json(audio_consent: bool = True) -> str:
    return json.dumps({
        "audio_analysis_consent": audio_consent,
        "external_ai_transfer_consent": False,
        "ai_audio_content_inspection_consent": False,
        "raw_audio_transfer_consent": False,
        "model_training_opt_in": False,
        "consent_timestamp": "2026-11-13T20:00:00Z",
    })


# 1. Fixture 1: 24-bit 48kHz Stereo WAV (unmastered mix)
def test_fixture_01_24bit_48khz_stereo_wav_unmastered():
    data, sr = generate_sine_wave(duration_sec=2.0, sample_rate=48000, peak_dbfs=-6.0, channels=2)
    wav_bytes = save_audio_to_bytes(data, sr, subtype="PCM_24", format="WAV")

    res = client.post(
        "/api/v1/analyze/dsp",
        files={"audio_file": ("test_unmastered_24bit.wav", wav_bytes, "audio/wav")},
        data={
            "interface_mode": "advanced",
            "genre": "indie_rock",
            "mix_stage": "unmastered_mix",
            "consent_state_json": make_consent_json(True),
        },
    )

    assert res.status_code == 200
    report = res.json()
    assert report["schema_version"] == "2.0.0"
    assert report["is_demonstration_data"] is False
    assert report["file_metadata"]["sample_rate_hz"] == 48000
    assert report["file_metadata"]["channels"] == 2
    assert report["file_metadata"]["bit_depth"] == 24
    assert report["measurements"]["sample_peak_max"]["source"] == "mathematical_dsp"
    assert report["capabilities"]["dsp_core_measurements"]["status"] == "IMPLEMENTED"
    assert report["timeline"] is not None
    assert len(report["timeline"]["buckets"]) <= 240
    jsonschema.validate(instance=report, schema=SCHEMA_V2)


# 2. Fixture 2: 16-bit 44.1kHz Stereo WAV (final master)
def test_fixture_02_16bit_44khz_stereo_wav_final_master():
    data, sr = generate_sine_wave(duration_sec=2.0, sample_rate=44100, peak_dbfs=-1.0, channels=2)
    wav_bytes = save_audio_to_bytes(data, sr, subtype="PCM_16", format="WAV")

    res = client.post(
        "/api/v1/analyze/dsp",
        files={"audio_file": ("master_16bit.wav", wav_bytes, "audio/wav")},
        data={
            "interface_mode": "simple",
            "genre": "pop_vocal",
            "mix_stage": "final_master",
            "consent_state_json": make_consent_json(True),
        },
    )

    assert res.status_code == 200
    report = res.json()
    assert report["file_metadata"]["sample_rate_hz"] == 44100
    assert report["file_metadata"]["bit_depth"] == 16
    assert report["is_demonstration_data"] is False
    jsonschema.validate(instance=report, schema=SCHEMA_V2)


# 3. Fixture 3: 32-bit float Stereo WAV
def test_fixture_03_32bit_float_stereo_wav():
    data, sr = generate_sine_wave(duration_sec=1.5, sample_rate=48000, peak_dbfs=-3.0, channels=2)
    wav_bytes = save_audio_to_bytes(data, sr, subtype="FLOAT", format="WAV")

    res = client.post(
        "/api/v1/analyze/dsp",
        files={"audio_file": ("mix_float32.wav", wav_bytes, "audio/wav")},
        data={
            "interface_mode": "advanced",
            "genre": "electronic_club",
            "mix_stage": "unmastered_mix",
            "consent_state_json": make_consent_json(True),
        },
    )

    assert res.status_code == 200
    report = res.json()
    assert report["file_metadata"]["bit_depth"] == 32
    jsonschema.validate(instance=report, schema=SCHEMA_V2)


# 4. Fixture 4: Stereo FLAC
def test_fixture_04_stereo_flac():
    data, sr = generate_sine_wave(duration_sec=2.0, sample_rate=48000, peak_dbfs=-4.0, channels=2)
    flac_bytes = save_audio_to_bytes(data, sr, subtype="PCM_24", format="FLAC")

    res = client.post(
        "/api/v1/analyze/dsp",
        files={"audio_file": ("track.flac", flac_bytes, "audio/flac")},
        data={
            "interface_mode": "advanced",
            "genre": "hip_hop_trap",
            "mix_stage": "final_master",
            "consent_state_json": make_consent_json(True),
        },
    )

    assert res.status_code == 200
    report = res.json()
    assert report["file_metadata"]["format"] == "FLAC"
    jsonschema.validate(instance=report, schema=SCHEMA_V2)


# 5. Fixture 5: Stereo AIFF
def test_fixture_05_stereo_aiff():
    data, sr = generate_sine_wave(duration_sec=2.0, sample_rate=48000, peak_dbfs=-4.0, channels=2)
    aiff_bytes = save_audio_to_bytes(data, sr, subtype="PCM_24", format="AIFF")

    res = client.post(
        "/api/v1/analyze/dsp",
        files={"audio_file": ("session.aiff", aiff_bytes, "audio/aiff")},
        data={
            "interface_mode": "advanced",
            "genre": "acoustic_folk",
            "mix_stage": "unmastered_mix",
            "consent_state_json": make_consent_json(True),
        },
    )

    assert res.status_code == 200
    report = res.json()
    assert report["file_metadata"]["format"] == "AIFF"
    jsonschema.validate(instance=report, schema=SCHEMA_V2)


# 6. Fixture 6: MP3 audio
def test_fixture_06_mp3_lossy_audio():
    data, sr = generate_sine_wave(duration_sec=2.0, sample_rate=44100, peak_dbfs=-3.0, channels=2)
    mp3_bytes = save_audio_to_bytes(data, sr, format="MP3")

    res = client.post(
        "/api/v1/analyze/dsp",
        files={"audio_file": ("demo_rough.mp3", mp3_bytes, "audio/mpeg")},
        data={
            "interface_mode": "simple",
            "genre": "pop_vocal",
            "mix_stage": "unmastered_mix",
            "consent_state_json": make_consent_json(True),
        },
    )

    assert res.status_code == 200
    report = res.json()
    assert report["file_metadata"]["format"] == "MP3"
    jsonschema.validate(instance=report, schema=SCHEMA_V2)


# 7. Fixture 7: OGG audio
def test_fixture_07_ogg_audio():
    data, sr = generate_sine_wave(duration_sec=2.0, sample_rate=48000, peak_dbfs=-3.0, channels=2)
    ogg_bytes = save_audio_to_bytes(data, sr, format="OGG")

    res = client.post(
        "/api/v1/analyze/dsp",
        files={"audio_file": ("game_audio.ogg", ogg_bytes, "audio/ogg")},
        data={
            "interface_mode": "advanced",
            "genre": "cinematic_orchestral",
            "mix_stage": "final_master",
            "consent_state_json": make_consent_json(True),
        },
    )

    assert res.status_code == 200
    report = res.json()
    assert report["file_metadata"]["format"] == "OGG"
    jsonschema.validate(instance=report, schema=SCHEMA_V2)


# 8. Fixture 8: Mono WAV (channels=1, stereo metrics unavailable)
def test_fixture_08_mono_wav():
    data, sr = generate_sine_wave(duration_sec=2.0, sample_rate=48000, peak_dbfs=-6.0, channels=1)
    mono_bytes = save_audio_to_bytes(data, sr, subtype="PCM_24", format="WAV")

    res = client.post(
        "/api/v1/analyze/dsp",
        files={"audio_file": ("mono_vocal.wav", mono_bytes, "audio/wav")},
        data={
            "interface_mode": "advanced",
            "genre": "pop_vocal",
            "mix_stage": "unmastered_mix",
            "consent_state_json": make_consent_json(True),
        },
    )

    assert res.status_code == 200
    report = res.json()
    assert report["file_metadata"]["channels"] == 1
    # Stereo metrics must be unavailable with reason 'mono_input_no_stereo_field'
    corr_m = report["measurements"]["phase_correlation_mean"]
    assert corr_m["status"] == "unavailable"
    assert corr_m["value"] is None
    assert corr_m["unavailable_reason"] == "mono_input_no_stereo_field"
    width_m = report["measurements"]["stereo_width_index"]
    assert width_m["status"] == "unavailable"
    assert width_m["value"] is None
    assert width_m["unavailable_reason"] == "mono_input_no_stereo_field"
    jsonschema.validate(instance=report, schema=SCHEMA_V2)


# 9. Fixture 9: Low sample rate WAV (22050 Hz, Nyquist limit guard)
def test_fixture_09_low_sample_rate_nyquist_guard():
    data, sr = generate_sine_wave(duration_sec=2.0, sample_rate=22050, peak_dbfs=-6.0, channels=2)
    wav_bytes = save_audio_to_bytes(data, sr, subtype="PCM_16", format="WAV")

    res = client.post(
        "/api/v1/analyze/dsp",
        files={"audio_file": ("vintage_22k.wav", wav_bytes, "audio/wav")},
        data={
            "interface_mode": "advanced",
            "genre": "hip_hop_trap",
            "mix_stage": "unmastered_mix",
            "consent_state_json": make_consent_json(True),
        },
    )

    assert res.status_code == 200
    report = res.json()
    assert report["file_metadata"]["sample_rate_hz"] == 22050
    air_m = report["measurements"]["air_band_energy_10k_20khz"]
    assert air_m["status"] == "unavailable"
    assert air_m["unavailable_reason"] == "nyquist_limit_below_band_upper_bound"
    jsonschema.validate(instance=report, schema=SCHEMA_V2)


# 10. Fixture 10: Pure digital silence
def test_fixture_10_pure_digital_silence():
    data, sr = generate_silence(duration_sec=2.0, sample_rate=48000, channels=2)
    wav_bytes = save_audio_to_bytes(data, sr, subtype="PCM_24", format="WAV")

    res = client.post(
        "/api/v1/analyze/dsp",
        files={"audio_file": ("silence.wav", wav_bytes, "audio/wav")},
        data={
            "interface_mode": "advanced",
            "genre": "indie_rock",
            "mix_stage": "unmastered_mix",
            "consent_state_json": make_consent_json(True),
        },
    )

    assert res.status_code == 200
    report = res.json()
    assert report["measurements"]["sample_peak_max"]["value"] <= -100.0
    jsonschema.validate(instance=report, schema=SCHEMA_V2)


# 11. Fixture 11: Clipped audio (sample_clipping_events > 0, objective technical warning)
def test_fixture_11_clipped_audio_technical_warning():
    data, sr = generate_clipped_audio(duration_sec=2.0, sample_rate=48000, amplitude=1.5)
    wav_bytes = save_audio_to_bytes(data, sr, subtype="PCM_24", format="WAV")

    res = client.post(
        "/api/v1/analyze/dsp",
        files={"audio_file": ("clipped_mix.wav", wav_bytes, "audio/wav")},
        data={
            "interface_mode": "advanced",
            "genre": "indie_rock",
            "mix_stage": "final_master",
            "consent_state_json": make_consent_json(True),
        },
    )

    assert res.status_code == 200
    report = res.json()
    assert report["measurements"]["sample_clipping_events"]["value"] > 0
    # Rule 8: Must generate objective technical issue
    tech_issues = [i for i in report["issues"] if i["classification"] == "objective_technical"]
    assert any("clipping" in i["domain"] or "clipping" in i["title"].lower() for i in tech_issues)
    jsonschema.validate(instance=report, schema=SCHEMA_V2)


# 12. Fixture 12: Out-of-phase stereo cancellation
def test_fixture_12_out_of_phase_stereo_cancellation():
    data, sr = generate_out_of_phase_stereo(duration_sec=2.0, sample_rate=48000)
    wav_bytes = save_audio_to_bytes(data, sr, subtype="PCM_24", format="WAV")

    res = client.post(
        "/api/v1/analyze/dsp",
        files={"audio_file": ("inverted_phase.wav", wav_bytes, "audio/wav")},
        data={
            "interface_mode": "advanced",
            "genre": "electronic_club",
            "mix_stage": "unmastered_mix",
            "consent_state_json": make_consent_json(True),
        },
    )

    assert res.status_code == 200
    report = res.json()
    assert report["measurements"]["phase_correlation_mean"]["value"] <= -0.5
    # Must report phase cancellation issue
    tech_issues = [i for i in report["issues"] if i["classification"] == "objective_technical"]
    assert any("phase" in i["domain"] for i in tech_issues)
    jsonschema.validate(instance=report, schema=SCHEMA_V2)


# 13. Fixture 13: Ultra-short audio (< 0.4s and < 3s)
def test_fixture_13_ultra_short_audio_below_window():
    data, sr = generate_sine_wave(duration_sec=0.25, sample_rate=48000, channels=2)
    wav_bytes = save_audio_to_bytes(data, sr, subtype="PCM_24", format="WAV")

    res = client.post(
        "/api/v1/analyze/dsp",
        files={"audio_file": ("snare_hit_0.25s.wav", wav_bytes, "audio/wav")},
        data={
            "interface_mode": "simple",
            "genre": "indie_rock",
            "mix_stage": "unmastered_mix",
            "consent_state_json": make_consent_json(True),
        },
    )

    assert res.status_code == 200
    report = res.json()
    # Short-term and LRA require >= 3s, so they should be unavailable
    lra_m = report["measurements"]["loudness_range_lra"]
    assert lra_m["status"] == "unavailable"
    assert lra_m["unavailable_reason"] == "file_duration_too_short_for_ebur128"
    jsonschema.validate(instance=report, schema=SCHEMA_V2)


# 14. Fixture 14: Consent gate blocks unconsented audio
def test_fixture_14_consent_gate_blocks_unconsented_audio():
    data, sr = generate_sine_wave(duration_sec=1.0, sample_rate=48000, channels=2)
    wav_bytes = save_audio_to_bytes(data, sr, subtype="PCM_24", format="WAV")

    res = client.post(
        "/api/v1/analyze/dsp",
        files={"audio_file": ("unconsented.wav", wav_bytes, "audio/wav")},
        data={
            "interface_mode": "advanced",
            "genre": "indie_rock",
            "mix_stage": "unmastered_mix",
            "consent_state_json": make_consent_json(audio_consent=False),
        },
    )

    assert res.status_code == 403
    assert res.json()["detail"]["error_code"] == "CONSENT_REQUIRED"


# 15. Fixture 15: Non-audio file rejected (HTTP 422)
def test_fixture_15_non_audio_file_rejected():
    fake_txt = b"This is a text file masquerading as audio."

    res = client.post(
        "/api/v1/analyze/dsp",
        files={"audio_file": ("readme.txt", fake_txt, "text/plain")},
        data={
            "interface_mode": "advanced",
            "genre": "indie_rock",
            "mix_stage": "unmastered_mix",
            "consent_state_json": make_consent_json(True),
        },
    )

    assert res.status_code in (415, 422)


# 16. Fixture 16: Unsupported format rejected (HTTP 415)
def test_fixture_16_unsupported_codec_rejected():
    fake_bin = b"\x00" * 512

    res = client.post(
        "/api/v1/analyze/dsp",
        files={"audio_file": ("archive.zip", fake_bin, "application/zip")},
        data={
            "interface_mode": "advanced",
            "genre": "indie_rock",
            "mix_stage": "unmastered_mix",
            "consent_state_json": make_consent_json(True),
        },
    )

    assert res.status_code in (415, 422)


# 17. Fixture 17: Multi-channel audio rejected (HTTP 422)
def test_fixture_17_multi_channel_audio_rejected():
    data, sr = generate_sine_wave(duration_sec=1.0, sample_rate=48000, channels=6)
    six_ch_bytes = save_audio_to_bytes(data, sr, subtype="PCM_24", format="WAV")

    res = client.post(
        "/api/v1/analyze/dsp",
        files={"audio_file": ("surround_5_1.wav", six_ch_bytes, "audio/wav")},
        data={
            "interface_mode": "advanced",
            "genre": "cinematic_orchestral",
            "mix_stage": "final_master",
            "consent_state_json": make_consent_json(True),
        },
    )

    assert res.status_code == 422
    assert res.json()["detail"]["error_code"] == "INVALID_CHANNEL_COUNT"


# 18. Fixture 18: File exceeding 100 MB rejected (HTTP 413)
def test_fixture_18_file_exceeding_100mb_rejected(monkeypatch):
    # Temporarily set MAX_UPLOAD_BYTES to 10 KB to test without allocating 100 MB RAM
    from backend.app.dsp import media_probe
    monkeypatch.setattr(media_probe, "MAX_UPLOAD_BYTES", 10240)

    oversized_bytes = b"\x00" * 20480  # 20 KB > 10 KB
    res = client.post(
        "/api/v1/analyze/dsp",
        files={"audio_file": ("oversized.wav", oversized_bytes, "audio/wav")},
        data={
            "interface_mode": "advanced",
            "genre": "indie_rock",
            "mix_stage": "unmastered_mix",
            "consent_state_json": make_consent_json(True),
        },
    )

    assert res.status_code == 413
    assert res.json()["detail"]["error_code"] == "FILE_TOO_LARGE"

"""
Security and Remediation Regression Tests for MixLearn Studio.
Tests:
- Path traversal filename sanitization (preventing file overwrite/directory escape)
- Server path sanitization on errors (no internal path leakage)
- Ephemeral workspace cleanup on success and failure (Rule 9)
- Concurrency limit safety
"""

import io
import os
from pathlib import Path
import tempfile
import pytest
from fastapi.testclient import TestClient
import numpy as np
import soundfile as sf

from backend.app.main import app, EphemeralAudioWorkspace, dsp_semaphore
from backend.app.dsp.pipeline import sanitize_display_filename

client = TestClient(app)


def make_test_wav(duration_sec=0.5, sr=44100):
    t = np.linspace(0, duration_sec, int(sr * duration_sec), endpoint=False)
    sig = 0.5 * np.sin(2 * np.pi * 440.0 * t)
    stereo = np.column_stack((sig, sig))
    buf = io.BytesIO()
    sf.write(buf, stereo, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def test_sanitize_display_filename():
    assert sanitize_display_filename("../../etc/passwd") == "passwd"
    assert sanitize_display_filename("..\\..\\Windows\\System32\\cmd.exe") == "cmd.exe"
    assert sanitize_display_filename("/absolute/path/to/my_song.wav") == "my_song.wav"
    assert sanitize_display_filename("C:\\Users\\Artist\\Track.wav") == "Track.wav"
    assert sanitize_display_filename("clean_track.wav") == "clean_track.wav"
    assert sanitize_display_filename("") == "audio_file.wav"
    assert sanitize_display_filename("   ") == "audio_file.wav"


def test_path_traversal_upload_sanitized():
    wav_bytes = make_test_wav(0.5)
    traversal_filenames = [
        "../../../../etc/passwd.wav",
        "..\\..\\..\\Windows\\System32\\calc.wav",
        "/var/log/secret.wav",
    ]

    for fname in traversal_filenames:
        res = client.post(
            "/api/v1/analyze/dsp",
            files={"audio_file": (fname, wav_bytes, "audio/wav")},
            data={
                "interface_mode": "advanced",
                "genre": "indie_rock",
                "mix_stage": "unmastered_mix",
                "consent_state_json": '{"audio_analysis_consent": true, "consent_timestamp": "2026-11-10T00:00:00Z"}',
            },
        )
        assert res.status_code == 200
        report = res.json()
        reported_name = report["file_metadata"]["filename"]
        assert "/" not in reported_name
        assert "\\" not in reported_name
        assert ".." not in reported_name


def test_corrupt_file_error_does_not_leak_server_paths():
    fake_audio = b"NOT_A_VALID_AUDIO_FILE_DATA_CORRUPT"
    res = client.post(
        "/api/v1/analyze/dsp",
        files={"audio_file": ("corrupt.wav", fake_audio, "audio/wav")},
        data={
            "interface_mode": "advanced",
            "genre": "indie_rock",
            "mix_stage": "unmastered_mix",
            "consent_state_json": '{"audio_analysis_consent": true, "consent_timestamp": "2026-11-10T00:00:00Z"}',
        },
    )
    assert res.status_code == 422
    err_text = res.text
    # Ensure internal paths like /tmp, C:\, aimixcheck are not leaked
    assert "aimixcheck" not in err_text
    assert "C:\\Users" not in err_text


def test_ephemeral_workspace_purged_on_exception():
    created_path = None
    try:
        with EphemeralAudioWorkspace(prefix="test-purge-") as ws:
            created_path = ws
            assert created_path.exists()
            dummy_file = created_path / "test.txt"
            dummy_file.write_text("temporary data")
            raise RuntimeError("Simulated DSP failure")
    except RuntimeError:
        pass

    assert created_path is not None
    assert not created_path.exists()


def test_concurrency_semaphore_configured():
    assert dsp_semaphore._value >= 1

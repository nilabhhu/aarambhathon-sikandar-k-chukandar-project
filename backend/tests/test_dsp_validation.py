"""
Numerical DSP validation and algorithmic accuracy tests for MixLearn Studio Phase 2.
Cross-validates measurement formulas against analytical ground truth and pyloudnorm.
"""

import math
from pathlib import Path
import tempfile

import numpy as np
import pyloudnorm as pyln
import pytest
import soundfile as sf

from backend.app.dsp.loudness import measure_loudness_ebur128
from backend.app.dsp.spectral import compute_spectral_metrics
from backend.app.dsp.waveform_metrics import compute_waveform_metrics
from backend.tests.fixtures_generator import (
    generate_clipped_audio,
    generate_multi_tone_spectral,
    generate_out_of_phase_stereo,
    generate_silence,
    generate_sine_wave,
)


def test_sample_peak_accuracy_analytical():
    """Validates sample peak dBFS calculation matches analytical 20*log10(A)."""
    with tempfile.TemporaryDirectory() as td:
        wav_path = Path(td) / "sine_m6db.wav"
        data, sr = generate_sine_wave(duration_sec=1.0, sample_rate=48000, peak_dbfs=-6.02, channels=2)
        sf.write(str(wav_path), data, sr, subtype="PCM_24")

        metrics = compute_waveform_metrics(wav_path, duration_seconds=1.0, sample_rate_hz=48000, channels=2)
        # Expected peak is -6.02 dBFS within +/- 0.05 dB
        assert abs(metrics["sample_peak_max_dbfs"] - (-6.02)) < 0.05


def test_clipping_detection_contiguous_runs():
    """Validates that contiguous clipping runs (>= 3 consecutive samples >= 0.9999) are counted."""
    with tempfile.TemporaryDirectory() as td:
        wav_path = Path(td) / "clipped.wav"
        data, sr = generate_clipped_audio(duration_sec=1.0, sample_rate=48000, amplitude=1.5)
        sf.write(str(wav_path), data, sr, subtype="PCM_24")

        metrics = compute_waveform_metrics(wav_path, duration_seconds=1.0, sample_rate_hz=48000, channels=2)
        assert metrics["sample_clipping_events"] > 0
        assert metrics["sample_peak_max_dbfs"] >= -0.01


def test_silence_gated_phase_correlation():
    """Validates in-phase (+1.0) and out-of-phase (-1.0) correlation calculation."""
    with tempfile.TemporaryDirectory() as td:
        # In-phase stereo
        in_phase_path = Path(td) / "in_phase.wav"
        data_in, sr = generate_sine_wave(duration_sec=1.0, sample_rate=48000, channels=2)
        sf.write(str(in_phase_path), data_in, sr, subtype="PCM_24")
        m_in = compute_waveform_metrics(in_phase_path, duration_seconds=1.0, sample_rate_hz=48000, channels=2)
        assert m_in["phase_correlation_mean"] == 1.0
        assert m_in["phase_correlation_min"] == 1.0
        assert m_in["stereo_width_index"] == 0.0  # Dual mono has 0% stereo side width

        # Out-of-phase stereo
        out_phase_path = Path(td) / "out_phase.wav"
        data_out, sr = generate_out_of_phase_stereo(duration_sec=1.0, sample_rate=48000)
        sf.write(str(out_phase_path), data_out, sr, subtype="PCM_24")
        m_out = compute_waveform_metrics(out_phase_path, duration_seconds=1.0, sample_rate_hz=48000, channels=2)
        assert m_out["phase_correlation_mean"] == -1.0
        assert m_out["phase_correlation_min"] == -1.0
        assert m_out["stereo_width_index"] == 100.0  # 100% side energy


def test_mono_metrics_unavailability():
    """Validates mono audio returns None with reason 'mono_input_no_stereo_field' for stereo metrics."""
    with tempfile.TemporaryDirectory() as td:
        mono_path = Path(td) / "mono.wav"
        data_mono, sr = generate_sine_wave(duration_sec=1.0, sample_rate=48000, channels=1)
        sf.write(str(mono_path), data_mono, sr, subtype="PCM_24")

        metrics = compute_waveform_metrics(mono_path, duration_seconds=1.0, sample_rate_hz=48000, channels=1)
        assert metrics["phase_correlation_mean"] is None
        assert metrics["phase_correlation_min"] is None
        assert metrics["stereo_width_index"] is None
        assert metrics["unavailable_reasons"]["phase_correlation_mean"] == "mono_input_no_stereo_field"
        assert metrics["unavailable_reasons"]["stereo_width_index"] == "mono_input_no_stereo_field"


def test_spectral_nyquist_guard_at_low_sample_rate():
    """Validates that at 22050 Hz (Nyquist = 11025 Hz), High Air band (10-20 kHz) is unavailable."""
    with tempfile.TemporaryDirectory() as td:
        low_sr_path = Path(td) / "low_sr.wav"
        data, sr = generate_sine_wave(duration_sec=1.0, sample_rate=22050, channels=2)
        sf.write(str(low_sr_path), data, sr, subtype="PCM_16")

        spec = compute_spectral_metrics(low_sr_path, sample_rate_hz=22050, channels=2)
        assert spec["air_band_energy_10k_20khz"] is None
        assert spec["unavailable_reasons"]["air_band_energy_10k_20khz"] == "nyquist_limit_below_band_upper_bound"
        # Sub-bass and Low-mid should still be available
        assert spec["sub_bass_energy_20_60hz"] is not None
        assert spec["mud_band_energy_200_500hz"] is not None


def test_loudness_ebur128_vs_pyloudnorm_cross_validation():
    """Cross-validates integrated loudness calculation against pyloudnorm reference."""
    with tempfile.TemporaryDirectory() as td:
        wav_path = Path(td) / "loudness_test.wav"
        data, sr = generate_sine_wave(duration_sec=4.0, sample_rate=48000, peak_dbfs=-14.0, channels=2)
        sf.write(str(wav_path), data, sr, subtype="PCM_24")

        # pyloudnorm direct calculation
        meter = pyln.Meter(sr)
        expected_lufs = meter.integrated_loudness(data)

        # Engine measurement
        res = measure_loudness_ebur128(wav_path, duration_seconds=4.0, sample_rate_hz=sr)
        measured_lufs = res["integrated_lufs"]

        assert measured_lufs is not None
        # Should match pyloudnorm within +/- 1.0 LUFS
        assert abs(measured_lufs - expected_lufs) < 1.0

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

from backend.app.dsp.loudness import (
    compute_true_peak_4x_polyphase_dbtp,
    measure_loudness_ebur128,
)
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


def test_synthetic_itu_bs1770_lufs_and_4x_polyphase_true_peak():
    """
    Fast deterministic verification of ITU-R BS.1770 Integrated LUFS and
    4x polyphase True Peak (dBTP) using generated NumPy sine and clipped signals.
    """
    sr = 48000
    # 1. Clean 1 kHz stereo sine at -6.0 dBFS peak
    sine_data, _ = generate_sine_wave(
        duration_sec=2.0, sample_rate=sr, frequency=1000.0, peak_dbfs=-6.0, channels=2
    )
    sine_tp = compute_true_peak_4x_polyphase_dbtp(sine_data)
    assert sine_tp is not None
    assert abs(sine_tp - (-6.0)) < 0.15, f"Expected ~-6.0 dBTP for -6 dBFS sine, got {sine_tp}"

    # 2. Clipped / inter-sample overshoot signal (hard-clipped high-frequency burst & 45-deg fs/4 tone)
    # A fs/4 (12 kHz at 48 kHz) sine sampled at pi/4 + k*pi/2 hits +/-0.7071 digitally,
    # so scaled to 1.0 digital peak its reconstructed analog peak is +3.01 dBTP!
    n_samples = int(1.0 * sr)
    k = np.arange(n_samples)
    isp_mono = np.clip(
        np.sqrt(2.0) * np.sin((np.pi / 2.0) * k + (np.pi / 4.0)),
        -1.0,
        1.0,
    ).astype(np.float32)
    isp_stereo = np.column_stack((isp_mono, isp_mono))

    # Digital sample peak is <= 0.0 dBFS, but 4x polyphase True Peak must detect > +1.5 dBTP overshoot
    digital_peak_dbfs = 20.0 * math.log10(float(np.max(np.abs(isp_stereo))))
    polyphase_tp_dbtp = compute_true_peak_4x_polyphase_dbtp(isp_stereo)
    assert digital_peak_dbfs <= 0.01
    assert polyphase_tp_dbtp is not None
    assert polyphase_tp_dbtp > 1.5, f"4x polyphase True Peak failed to detect inter-sample overshoot: {polyphase_tp_dbtp} dBTP"

    # 3. Verify end-to-end measure_loudness_ebur128 on both synthetic sine and clipped signals
    with tempfile.TemporaryDirectory() as td:
        clipped_path = Path(td) / "synthetic_clipped_isp.wav"
        clipped_data, _ = generate_clipped_audio(duration_sec=2.0, sample_rate=sr, amplitude=1.5)
        sf.write(str(clipped_path), clipped_data, sr, subtype="PCM_24")

        res = measure_loudness_ebur128(clipped_path, duration_seconds=2.0, sample_rate_hz=sr)
        assert res["integrated_lufs"] is not None
        assert res["integrated_lufs"] > -6.0  # Hard-clipped 200Hz stereo signal is very loud
        assert res["true_peak_dbtp"] is not None
        assert res["true_peak_dbtp"] >= 0.0  # Hard-clipped signal produces >= 0.0 dBTP true peak


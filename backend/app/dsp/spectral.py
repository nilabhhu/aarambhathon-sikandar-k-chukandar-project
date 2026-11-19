"""
Spectral analysis module for MixLearn Studio Phase 2 DSP Engine.
Computes per-channel Welch PSD (Hann window, nperseg=8192, 50% overlap),
averages linear PSD across channels, and numerically integrates band power
for Sub-Bass (20-60 Hz), Low-Mid (200-500 Hz), Presence (2-5 kHz), and High Air (10-20 kHz).
Guards against Nyquist violations for reduced sample rates.
"""

import math
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import numpy as np
import scipy.signal
import soundfile as sf

try:
    from scipy.integrate import trapezoid
except ImportError:
    from numpy import trapz as trapezoid  # type: ignore

FREQUENCY_BANDS = {
    "sub_bass_energy_20_60hz": (20.0, 60.0),
    "mud_band_energy_200_500hz": (200.0, 500.0),
    "presence_band_energy_2k_5khz": (2000.0, 5000.0),
    "air_band_energy_10k_20khz": (10000.0, 20000.0),
}


def compute_spectral_metrics(
    decoded_wav_path: Path,
    sample_rate_hz: int,
    channels: int,
) -> Dict[str, Any]:
    """
    Computes spectral metrics across standard frequency bands using Welch PSD.
    """
    # Read audio into memory for spectral analysis (max 600s pcm float is ~100MB)
    data, sr = sf.read(str(decoded_wav_path), dtype="float32", always_2d=True)
    n_frames = data.shape[0]

    # Handle silence or very short data
    if n_frames < 64:
        return {
            "sub_bass_energy_20_60hz": None,
            "mud_band_energy_200_500hz": None,
            "presence_band_energy_2k_5khz": None,
            "air_band_energy_10k_20khz": None,
            "unavailable_reasons": {
                k: "short_file_below_minimum_window" for k in FREQUENCY_BANDS
            },
        }

    nperseg = min(8192, n_frames)
    noverlap = nperseg // 2
    nyquist = sr / 2.0

    # Per-channel Welch PSD (never pre-sum audio)
    psd_channels = []
    freqs = None
    for ch in range(channels):
        f, pxx = scipy.signal.welch(
            data[:, ch],
            fs=sr,
            window="hann",
            nperseg=nperseg,
            noverlap=noverlap,
            scaling="density",
        )
        freqs = f
        psd_channels.append(pxx)

    # Average linear PSD across channels
    avg_psd = np.mean(psd_channels, axis=0)

    # Broadband total power
    total_power = float(trapezoid(avg_psd, freqs))

    results: Dict[str, Optional[float]] = {}
    unavailable_reasons: Dict[str, str] = {}

    for band_key, (low_hz, high_hz) in FREQUENCY_BANDS.items():
        # Nyquist guard
        if nyquist < high_hz:
            results[band_key] = None
            unavailable_reasons[band_key] = "nyquist_limit_below_band_upper_bound"
            continue

        # Band mask
        mask = (freqs >= low_hz) & (freqs <= high_hz)
        if not np.any(mask) or len(freqs[mask]) < 2:
            results[band_key] = None
            unavailable_reasons[band_key] = "short_file_below_minimum_window"
            continue

        band_power = float(trapezoid(avg_psd[mask], freqs[mask]))

        # Convert to dBFS (1.0 full scale sine power is 0.5, reference 1.0)
        if band_power <= 1e-12:
            results[band_key] = -120.0
        else:
            dbfs_val = 10.0 * math.log10(band_power)
            results[band_key] = round(float(dbfs_val), 1)

    return {
        **results,
        "total_broadband_power": total_power,
        "unavailable_reasons": unavailable_reasons,
    }

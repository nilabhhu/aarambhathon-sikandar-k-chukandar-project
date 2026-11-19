"""
Deterministic test audio fixtures generator for MixLearn Studio Phase 2 tests.
Generates synthetic WAV files without external dependencies.
"""

import io
import math
from pathlib import Path
from typing import Tuple

import numpy as np
import soundfile as sf


def generate_sine_wave(
    duration_sec: float = 2.0,
    sample_rate: int = 48000,
    frequency: float = 1000.0,
    peak_dbfs: float = -3.0,
    channels: int = 2,
) -> Tuple[np.ndarray, int]:
    """Generates pure sine wave at specified peak dBFS."""
    num_samples = int(duration_sec * sample_rate)
    t = np.arange(num_samples) / float(sample_rate)
    amplitude = 10.0 ** (peak_dbfs / 20.0)
    mono = amplitude * np.sin(2.0 * np.pi * frequency * t).astype(np.float32)

    if channels == 1:
        return mono, sample_rate
    elif channels == 2:
        stereo = np.column_stack((mono, mono))
        return stereo, sample_rate
    else:
        multi = np.column_stack([mono] * channels)
        return multi, sample_rate


def generate_clipped_audio(
    duration_sec: float = 2.0,
    sample_rate: int = 48000,
    amplitude: float = 1.5,
) -> Tuple[np.ndarray, int]:
    """Generates audio with contiguous sample clipping runs (>= 3 consecutive samples >= 0.9999)."""
    num_samples = int(duration_sec * sample_rate)
    t = np.arange(num_samples) / float(sample_rate)
    # 200 Hz sine boosted to 1.5 amplitude
    raw = amplitude * np.sin(2.0 * np.pi * 200.0 * t).astype(np.float32)
    # Hard clip at 1.0
    clipped = np.clip(raw, -1.0, 1.0)
    stereo = np.column_stack((clipped, clipped))
    return stereo, sample_rate


def generate_silence(
    duration_sec: float = 2.0,
    sample_rate: int = 48000,
    channels: int = 2,
) -> Tuple[np.ndarray, int]:
    """Generates pure digital silence."""
    num_samples = int(duration_sec * sample_rate)
    if channels == 1:
        return np.zeros(num_samples, dtype=np.float32), sample_rate
    return np.zeros((num_samples, channels), dtype=np.float32), sample_rate


def generate_out_of_phase_stereo(
    duration_sec: float = 2.0,
    sample_rate: int = 48000,
    frequency: float = 440.0,
    peak_dbfs: float = -6.0,
) -> Tuple[np.ndarray, int]:
    """Generates completely out-of-phase stereo (Left = sine, Right = -sine; correlation = -1.0)."""
    num_samples = int(duration_sec * sample_rate)
    t = np.arange(num_samples) / float(sample_rate)
    amplitude = 10.0 ** (peak_dbfs / 20.0)
    left = amplitude * np.sin(2.0 * np.pi * frequency * t).astype(np.float32)
    right = -left
    stereo = np.column_stack((left, right))
    return stereo, sample_rate


def generate_multi_tone_spectral(
    duration_sec: float = 3.0,
    sample_rate: int = 48000,
) -> Tuple[np.ndarray, int]:
    """Generates audio containing tones in Sub-Bass, Low-Mid, Presence, and Air bands."""
    num_samples = int(duration_sec * sample_rate)
    t = np.arange(num_samples) / float(sample_rate)
    # Sub-Bass: 40 Hz
    s_sub = 0.3 * np.sin(2.0 * np.pi * 40.0 * t)
    # Low-Mid: 300 Hz
    s_mid = 0.3 * np.sin(2.0 * np.pi * 300.0 * t)
    # Presence: 3000 Hz
    s_pres = 0.2 * np.sin(2.0 * np.pi * 3000.0 * t)
    # Air: 12000 Hz
    s_air = 0.1 * np.sin(2.0 * np.pi * 12000.0 * t)

    mix = (s_sub + s_mid + s_pres + s_air).astype(np.float32)
    stereo = np.column_stack((mix, mix))
    return stereo, sample_rate


def save_audio_to_bytes(
    data: np.ndarray,
    sample_rate: int,
    subtype: str = None,
    format: str = "WAV",
) -> bytes:
    """Encodes numpy audio data to in-memory bytes."""
    buf = io.BytesIO()
    if subtype is None:
        if format in ("WAV", "AIFF"):
            subtype = "PCM_24"
        elif format == "FLAC":
            subtype = "PCM_24"
        elif format == "OGG":
            subtype = "VORBIS"
    if subtype:
        sf.write(buf, data, sample_rate, format=format, subtype=subtype)
    else:
        sf.write(buf, data, sample_rate, format=format)
    buf.seek(0)
    return buf.read()

"""
Media probe and container inspection for MixLearn Studio Phase 2 DSP Engine.
Handles streaming uploads with strict 100 MB hard limit, SHA-256 calculation,
ffprobe metadata inspection, format validation (WAV, FLAC, AIFF, MP3, OGG),
and ffmpeg 32-bit float PCM decoding.
"""

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
from typing import Any, Dict, Optional, Tuple

from fastapi import HTTPException, status

MAX_UPLOAD_BYTES = 104_857_600  # 100 MiB
CHUNK_SIZE = 65536  # 64 KiB
SUPPORTED_FORMATS = {"WAV", "FLAC", "AIFF", "MP3", "OGG"}


def resolve_binary(binary_name: str) -> str:
    """
    Locates ffmpeg/ffprobe executable across PATH and known Windows WinGet paths.
    """
    found = shutil.which(binary_name)
    if found:
        return found

    known_dirs = [
        r"C:\Users\NILABH\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.1-essentials_build\bin"
    ]
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        winget_root = Path(local_app_data) / "Microsoft" / "WinGet" / "Packages"
        if winget_root.exists():
            for p in winget_root.glob("*ffmpeg*/**/bin"):
                if (p / f"{binary_name}.exe").exists():
                    known_dirs.append(str(p))

    for d in known_dirs:
        candidate = Path(d) / f"{binary_name}.exe"
        if candidate.exists():
            if d not in os.environ.get("PATH", ""):
                os.environ["PATH"] = f"{d};{os.environ.get('PATH', '')}"
            return str(candidate)

    # Fallback to binary_name in current PATH
    return binary_name


def stream_upload_and_hash(upload_file, dest_path: Path) -> Tuple[int, str]:
    """
    Streams file in chunks to dest_path, enforcing MAX_UPLOAD_BYTES and computing SHA-256.
    Aborts with HTTP 413 if upload exceeds 100 MB.
    """
    hasher = hashlib.sha256()
    total_bytes = 0

    try:
        with open(dest_path, "wb") as f:
            while True:
                chunk = upload_file.file.read(CHUNK_SIZE)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail={
                            "error_code": "FILE_TOO_LARGE",
                            "message": f"Upload exceeds maximum allowable limit of 100 MB ({MAX_UPLOAD_BYTES} bytes).",
                        },
                    )
                hasher.update(chunk)
                f.write(chunk)
    except HTTPException:
        if dest_path.exists():
            dest_path.unlink(missing_ok=True)
        raise

    return total_bytes, hasher.hexdigest()


def probe_media_file(raw_path: Path) -> Dict[str, Any]:
    """
    Executes ffprobe -v error -print_format json -show_format -show_streams.
    Validates container, stream presence, duration, channels, and codec.
    """
    ffprobe_bin = resolve_binary("ffprobe")
    cmd = [
        ffprobe_bin,
        "-v", "error",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        str(raw_path),
    ]

    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=10, shell=False)
    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error_code": "PROBE_TIMEOUT",
                "message": "Media inspection timed out after 10 seconds.",
            },
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error_code": "PROBE_EXECUTION_ERROR",
                "message": f"Could not execute ffprobe: {str(e)}",
            },
        )

    if res.returncode != 0 or not res.stdout.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error_code": "CORRUPT_OR_UNREADABLE_MEDIA",
                "message": "Failed to inspect container; file is corrupt or unreadable.",
            },
        )

    try:
        data = json.loads(res.stdout)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error_code": "INVALID_PROBE_JSON",
                "message": "ffprobe output could not be parsed as JSON.",
            },
        )

    streams = [s for s in data.get("streams", []) if s.get("codec_type") == "audio"]
    if not streams:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error_code": "NO_AUDIO_STREAM_FOUND",
                "message": "Uploaded file contains no valid audio stream.",
            },
        )

    audio_stream = streams[0]
    fmt_info = data.get("format", {})

    # Validate channel count
    channels = int(audio_stream.get("channels", 0))
    if channels not in (1, 2):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error_code": "INVALID_CHANNEL_COUNT",
                "message": f"Only mono (1) or stereo (2) audio files are supported. Received {channels} channels.",
            },
        )

    # Format detection and validation
    format_name = fmt_info.get("format_name", "").lower()
    codec_name = audio_stream.get("codec_name", "").lower()

    detected_format: Optional[str] = None
    if "aiff" in format_name:
        detected_format = "AIFF"
    elif "flac" in format_name or codec_name == "flac":
        detected_format = "FLAC"
    elif "wav" in format_name or codec_name.startswith("pcm"):
        detected_format = "WAV"
    elif "mp3" in format_name or codec_name == "mp3":
        detected_format = "MP3"
    elif "ogg" in format_name or codec_name in ("vorbis", "opus"):
        detected_format = "OGG"

    if not detected_format or detected_format not in SUPPORTED_FORMATS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={
                "error_code": "UNSUPPORTED_MEDIA_TYPE",
                "message": f"Unsupported media format '{format_name}'. MixLearn Studio accepts WAV, FLAC, AIFF, MP3, and OGG files.",
            },
        )

    # Duration extraction and validation
    duration_str = fmt_info.get("duration") or audio_stream.get("duration")
    if not duration_str:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error_code": "UNKNOWN_DURATION",
                "message": "Could not determine audio duration from container metadata.",
            },
        )

    try:
        duration_seconds = float(duration_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error_code": "INVALID_DURATION",
                "message": f"Invalid duration value '{duration_str}'.",
            },
        )

    if duration_seconds <= 0.0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error_code": "ZERO_DURATION_AUDIO",
                "message": "Audio duration must be greater than zero.",
            },
        )

    if duration_seconds > 600.0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error_code": "DURATION_LIMIT_EXCEEDED",
                "message": f"Audio duration ({duration_seconds:.1f}s) exceeds maximum allowed limit of 10 minutes (600 seconds).",
            },
        )

    # Sample rate
    sample_rate_hz = int(audio_stream.get("sample_rate", 44100))
    if sample_rate_hz < 8000 or sample_rate_hz > 384000:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error_code": "INVALID_SAMPLE_RATE",
                "message": f"Sample rate {sample_rate_hz} Hz is outside supported range (8000 - 384000 Hz).",
            },
        )

    # Bit depth
    raw_bits = audio_stream.get("bits_per_raw_sample") or audio_stream.get("bits_per_sample")
    bit_depth: Optional[int] = None
    if raw_bits and str(raw_bits).isdigit():
        val = int(raw_bits)
        if val in (16, 24, 32):
            bit_depth = val

    bit_depth_note = None
    if bit_depth:
        bit_depth_note = f"{bit_depth}-bit fixed-point PCM"
    elif "float" in codec_name or "f32" in codec_name:
        bit_depth = 32
        bit_depth_note = "32-bit floating-point PCM"
    elif detected_format in ("MP3", "OGG"):
        bit_depth_note = f"Perceptual lossy stream ({detected_format})"

    return {
        "format": detected_format,
        "duration_seconds": duration_seconds,
        "sample_rate_hz": sample_rate_hz,
        "bit_depth": bit_depth,
        "channels": channels,
        "codec": codec_name or format_name,
        "bit_depth_note": bit_depth_note,
    }


def decode_to_pcm_f32le(raw_path: Path, decoded_wav_path: Path) -> Path:
    """
    Decodes arbitrary audio into canonical pcm_f32le WAV at native sample rate.
    """
    ffmpeg_bin = resolve_binary("ffmpeg")
    cmd = [
        ffmpeg_bin,
        "-nostdin",
        "-hide_banner",
        "-y",
        "-i", str(raw_path),
        "-c:a", "pcm_f32le",
        str(decoded_wav_path),
    ]

    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=45, shell=False)
    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error_code": "DECODE_TIMEOUT",
                "message": "Audio decoding timed out after 45 seconds.",
            },
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error_code": "DECODE_EXECUTION_ERROR",
                "message": f"Could not execute ffmpeg decode: {str(e)}",
            },
        )

    if res.returncode != 0 or not decoded_wav_path.exists() or decoded_wav_path.stat().st_size == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error_code": "DECODE_FAILED",
                "message": f"FFmpeg failed to decode audio into PCM float32: {res.stderr[:300]}",
            },
        )

    return decoded_wav_path

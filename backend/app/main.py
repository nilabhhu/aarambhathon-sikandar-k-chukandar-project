"""
Phase 2 FastAPI Backend for MixLearn Studio.
Exposes operational health, capabilities, shared schema contract (v2.0.0),
Phase 1 demonstration endpoints, and real mathematical DSP analysis engine (POST /api/v1/analyze/dsp).

Enforces Product Rules:
- Rule 1: Forbidden AI stem separation / automatic stem splitting.
- Rule 2: Mathematical DSP as sole measurement source of truth.
- Rule 4 & 5: Three-tier granular consent and no model training default.
- Rule 8: Separation of objective technical defects from subjective stylistic notes.
- Rule 9: Zero unnecessary infrastructure, ephemeral stateless processing with auto-purge.

Phases 3-6 endpoints return HTTP 501 Not Implemented with structured phase metadata.
"""

import asyncio
from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import shutil
import tempfile
from typing import Any, Dict, List, Literal, Optional, Union
import uuid

import anyio
from fastapi import Body, FastAPI, File, Form, HTTPException, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from backend.app.dsp.loudness import compute_streaming_normalization_estimates
from backend.app.dsp.media_probe import stream_upload_and_hash
from backend.app.dsp.pipeline import analyze_audio_workspace
from backend.app.dsp.revisions import compare_revision_reports
from backend.app.dsp.stems import (
    PROHIBITED_STEM_DETAIL,
    analyze_stems_workspace,
    compute_streaming_spectral_and_peak,
    decode_stem_to_pcm_f32le,
)

logger = logging.getLogger("mixlearn.main")

BASE_DIR = Path(__file__).resolve().parent.parent.parent
CONTRACTS_DIR = BASE_DIR / "contracts"
FIXTURES_DIR = CONTRACTS_DIR / "fixtures"
SCHEMA_FILE = CONTRACTS_DIR / "analysis_report.schema.json"
DEMO_REPORT_FILE = FIXTURES_DIR / "demo_report.json"

app = FastAPI(
    title="MixLearn Studio API — Phase 4 Mathematical DSP, Stems & Revision Deltas",
    version="4.0.0-phase4",
    description="Privacy-first audio mixing & mastering educational backend with mathematical DSP, original stem overlap diagnostics, and mix revision delta verification.",
)

# Concurrency Guard: Bounded concurrent DSP executions to prevent OOM
MAX_CONCURRENT_DSP = int(os.environ.get("MAX_CONCURRENT_DSP_TASKS", "2"))
dsp_semaphore = asyncio.Semaphore(MAX_CONCURRENT_DSP)

# Safe CORS configuration supporting local dev and Vercel production domains
allowed_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://aarambhathon-sikandar-k-chukandar-p-rho.vercel.app",
    "https://aarambhathon-sikandar-k-chukandar-project-nilabh1.vercel.app",
    "https://aarambhathon-sikandar-k-chukandar-project-git-dev-nilabh1.vercel.app",
]
custom_cors = os.environ.get("CORS_ALLOWED_ORIGINS")
if custom_cors:
    for o in custom_cors.split(","):
        cleaned = o.strip()
        if cleaned and cleaned not in allowed_origins:
            allowed_origins.append(cleaned)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https:\/\/.*\.vercel\.app$",
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


class ConsentState(BaseModel):
    audio_analysis_consent: bool = Field(
        ...,
        description="Permission 1: Local/server mathematical DSP audio analysis.",
    )
    external_ai_transfer_consent: bool = Field(
        False,
        description="Permission 2: Explicit permission for external AI to receive structured numerical measurements.",
    )
    ai_numerical_metrics_transfer_consent: Optional[bool] = Field(
        False,
        description="Permission 2 (Semantic Alias): Explicit permission for external AI to receive numerical measurements.",
    )
    ai_audio_content_inspection_consent: Optional[bool] = Field(
        False,
        description="Permission 3: Explicit permission for AI to inspect audio spectrograms/waveforms.",
    )
    raw_audio_transfer_consent: Optional[bool] = Field(
        False,
        description="Permission 4: Explicit permission to transfer raw audio off-device.",
    )
    model_training_opt_in: bool = Field(
        False,
        description="Permission 5: Default false (Rule 5). Automatic training on user audio is prohibited.",
    )
    consent_timestamp: Optional[str] = Field(
        None,
        description="ISO 8601 UTC timestamp of consent grant.",
    )


class StemUploadMeta(BaseModel):
    stem_name: str
    stem_source_type: Literal["user_uploaded_original", "ai_separated", "pseudo_stem"]
    stem_role: Optional[str] = "other"


class StemSubmission(BaseModel):
    stem_source_type: str = Field(
        ...,
        description="Must be 'user_uploaded_original'. AI stem separation is forbidden under Rule 1.",
    )
    stem_count: int = Field(..., ge=1, le=16)
    stems: List[Dict[str, Any]] = Field(default_factory=list)


class DemoAnalysisRequest(BaseModel):
    interface_mode: Literal["simple", "advanced"] = "advanced"
    genre: Literal[
        "indie_rock",
        "electronic_club",
        "hip_hop_trap",
        "pop_vocal",
        "acoustic_folk",
        "cinematic_orchestral",
    ] = "indie_rock"
    mix_stage: Literal["unmastered_mix", "final_master"] = "unmastered_mix"
    consent_state: ConsentState


class ExternalAiInterpretationRequest(BaseModel):
    report_id: Optional[str] = None
    consent_state: ConsentState


class StreamingEstimateRequest(BaseModel):
    integrated_lufs: Optional[float] = Field(
        None,
        description="Measured ITU-R BS.1770-4 / EBU R128 integrated loudness in LUFS.",
    )
    true_peak_dbtp: Optional[float] = Field(
        None,
        description="Measured 4x oversampled inter-sample True Peak in dBTP.",
    )


class EphemeralAudioWorkspace:
    """
    Context manager creating an isolated temporary directory for audio DSP processing.
    Guarantees recursive deletion upon exit, fulfilling Rule 9 (Zero retention).
    """
    def __init__(self, prefix: str = "mixlearn-"):
        self.prefix = prefix
        self.path: Optional[Path] = None

    def __enter__(self) -> Path:
        self.path = Path(tempfile.mkdtemp(prefix=self.prefix))
        return self.path

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.path and self.path.exists():
            shutil.rmtree(self.path, ignore_errors=True)


# --- Core Operational & Contract Endpoints ---

@app.get("/health")
def get_health():
    """Operational health check returning phase status and active contract version."""
    return {
        "status": "online",
        "state": "ok",
        "service": "mixlearn-studio-api",
        "phase": 4,
        "mode": "mathematical_dsp_active",
        "is_demonstration_mode": False,
        "active_contract_version": "2.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/v1/health")
def get_api_v1_health():
    """Detailed health endpoint for frontend proxy & gateway verification."""
    return {
        "status": "online",
        "state": "ok",
        "service": "mixlearn-studio-api",
        "phase": 4,
        "mode": "mathematical_dsp_active",
        "is_demonstration_mode": False,
        "active_contract_version": "2.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/v1/capabilities")
def get_capabilities():
    """
    Returns platform capability matrix matching schema v2.0.0.
    Identifies implemented vs. scheduled capabilities and prohibited features (Rule 1).
    """
    return {
        "phase": 4,
        "analyze_dsp": True,
        "analyze_stems": True,
        "compare_revisions": True,
        "rules_enforced": {
            "no_ai_stem_separation": True,
            "dsp_is_sole_measurement_source": True,
            "separate_three_tier_consent": True,
            "default_no_model_training": True,
            "objective_vs_subjective_separated": True,
            "zero_unnecessary_infrastructure": True,
            "rule_1_no_ai_stem_separation": True,
            "rule_2_dsp_sole_source_of_truth": True,
            "rule_3_technical_integrity_uncompromised": True,
            "rule_4_granular_consent_gate": True,
            "rule_5_zero_model_training_default": True,
            "rule_8_objective_vs_stylistic_split": True,
            "rule_9_ephemeral_zero_retention_workspace": True,
        },
        "capabilities_status": {
            "analyze_dsp": "IMPLEMENTED",
            "dsp_core_measurements": "IMPLEMENTED",
            "ai_stem_separation": "PROHIBITED_BY_PRODUCT_RULE",
            "streaming_normalization_estimates": "IMPLEMENTED",
            "original_stem_multitrack_analysis": "IMPLEMENTED",
            "mix_revision_comparison": "IMPLEMENTED",
            "ai_educational_interpretation": "NOT_IMPLEMENTED_PHASE_5",
        },
        "capabilities": {
            "analyze_dsp": {
                "status": "IMPLEMENTED",
                "phase_target": 2,
                "enabled": True,
                "disclosure": "Mathematical DSP engine active: Real-time loudness, true peak, crest factor, phase correlation, and Welch PSD.",
            },
            "dsp_core_measurements": {
                "status": "IMPLEMENTED",
                "phase_target": 2,
                "disclosure": "Mathematical DSP engine active: Real-time loudness, true peak, crest factor, phase correlation, and Welch PSD.",
            },
            "streaming_normalization_estimates": {
                "status": "IMPLEMENTED",
                "phase_target": 3,
                "disclosure": "Rule 7: Deterministic streaming normalization estimates for Spotify Normal, Apple Music Sound Check, and YouTube.",
            },
            "reference_track_comparison": {
                "status": "IMPLEMENTED",
                "phase_target": 3,
                "disclosure": "Client-side loudness-matched A/B reference audition and 6-band spectral curve comparison active.",
            },
            "original_stem_multitrack_analysis": {
                "status": "IMPLEMENTED",
                "phase_target": 4,
                "enabled": True,
                "disclosure": "Rule 1: Streaming multitrack diagnostics on 2–8 genuine user-uploaded original stems with 50 ms alignment checks and 6-band pairwise overlap matrix.",
            },
            "device_translation_preview": {
                "status": "IMPLEMENTED",
                "phase_target": 3,
                "disclosure": "Rule 6: Real-time Web Audio biquad playback translation approximations (Studio Flat, Phone, Laptop, Car, Club Sub).",
            },
            "mix_revision_comparison": {
                "status": "IMPLEMENTED",
                "phase_target": 4,
                "enabled": True,
                "disclosure": "Deterministic v1 vs. v2 mix revision deltas (LUFS, True Peak, LRA, Phase, 6-band spectral shifts) with improved/unchanged/regressed finding verification.",
            },
            "ai_educational_interpretation": {
                "status": "NOT_IMPLEMENTED",
                "phase_target": 5,
                "disclosure": "Consent-gated Gemini educational interpretation scheduled for Phase 5.",
            },
            "ai_stem_separation": {
                "status": "PROHIBITED_BY_PRODUCT_RULE",
                "phase_target": None,
                "disclosure": "Rule 1: AI stem separation is permanently prohibited.",
            },
        },
    }


@app.get("/api/v1/contracts/schema")
def get_canonical_schema():
    """Serves the canonical JSON Schema (Draft 2020-12) for runtime verification."""
    if not SCHEMA_FILE.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Canonical schema file not found.",
        )
    with open(SCHEMA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


@app.get("/api/v1/demo/report")
def get_demo_report():
    """Returns the canonical demonstration report fixture."""
    if not DEMO_REPORT_FILE.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Demonstration report fixture not found.",
        )
    with open(DEMO_REPORT_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


@app.post("/api/v1/analyze/demo")
async def post_analyze_demo(request: Request):
    """
    Demonstration analysis endpoint.
    Accepts both JSON bodies and multipart/form-data.
    Returns labeled demo report matching input parameters.
    Never misrepresents demonstration measurements as real audio DSP.
    """
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            body = await request.json()
            req_obj = DemoAnalysisRequest(**body)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid JSON demo request: {str(e)}",
            )
    else:
        form = await request.form()
        consent_state_raw = form.get("consent_state_json")
        try:
            consent_dict = json.loads(consent_state_raw) if consent_state_raw else {}
            consent = ConsentState(**consent_dict)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid consent payload: {str(e)}",
            )
        req_obj = DemoAnalysisRequest(
            interface_mode=form.get("interface_mode", "simple"),
            genre=form.get("genre", "indie_rock"),
            mix_stage=form.get("mix_stage", "unmastered_mix"),
            consent_state=consent,
        )

    if not req_obj.consent_state.audio_analysis_consent:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error_code": "CONSENT_REQUIRED",
                "message": "Permission 1 (audio_analysis_consent) is required to view analysis report.",
            },
        )

    if not DEMO_REPORT_FILE.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Demonstration report fixture not found.",
        )

    with open(DEMO_REPORT_FILE, "r", encoding="utf-8") as f:
        report = json.load(f)

    report["input_context"]["interface_mode"] = req_obj.interface_mode
    report["input_context"]["genre"] = req_obj.genre
    report["input_context"]["mix_stage"] = req_obj.mix_stage
    report["consent_state"] = req_obj.consent_state.model_dump()
    report["created_at"] = datetime.now(timezone.utc).isoformat()
    report["report_id"] = f"demo-p1-{req_obj.genre}-{req_obj.mix_stage}"
    report["is_demonstration_data"] = True

    return JSONResponse(content=report)


# --- Phase 2 Mathematical DSP Pipeline Execution Helper ---

def _run_ephemeral_analysis(
    upload_file: UploadFile,
    interface_mode: str,
    genre: str,
    mix_stage: str,
    consent_dict: Dict[str, Any],
    user_notes: Optional[str],
    plugin_chain_meta: Optional[List[Dict[str, Any]]],
) -> Dict[str, Any]:
    """
    Synchronous worker running inside a threadpool worker.
    Guarantees ephemeral workspace isolation and cleanup.
    """
    raw_filename = upload_file.filename or "uploaded_audio.wav"

    with EphemeralAudioWorkspace(prefix="mixlearn-dsp-") as workspace:
        # Determine internal extension safely
        ext = Path(raw_filename).suffix.lower()
        if not ext or len(ext) > 8 or not ext[1:].isalnum():
            ext = ".bin"

        # Internally generated safe filename strictly inside workspace
        safe_internal_name = f"upload_{uuid.uuid4().hex}{ext}"
        dest_raw_path = workspace / safe_internal_name

        # Stream chunked upload with hard 100 MB cap and incremental SHA-256
        file_size, sha256_hash = stream_upload_and_hash(upload_file, dest_raw_path)

        # Run mathematical DSP pipeline
        report = analyze_audio_workspace(
            raw_audio_path=dest_raw_path,
            original_filename=raw_filename,
            file_size_bytes=file_size,
            sha256_hash=sha256_hash,
            interface_mode=interface_mode,
            genre=genre,
            mix_stage=mix_stage,
            consent_state=consent_dict,
            user_notes=user_notes,
            plugin_chain_metadata=plugin_chain_meta,
        )

        return report


GENRE_NORMALIZATION = {
    "indie_rock": "indie_rock",
    "indie rock": "indie_rock",
    "indie rock / alternative": "indie_rock",
    "indie rock/alternative": "indie_rock",
    "alternative": "indie_rock",
    "electronic_club": "electronic_club",
    "electronic club": "electronic_club",
    "electronic / club": "electronic_club",
    "electronic / club / dance": "electronic_club",
    "electronic / dance": "electronic_club",
    "electronic": "electronic_club",
    "dance": "electronic_club",
    "hip_hop_trap": "hip_hop_trap",
    "hip hop trap": "hip_hop_trap",
    "hip hop / trap": "hip_hop_trap",
    "hip-hop / trap": "hip_hop_trap",
    "hip-hop": "hip_hop_trap",
    "hip hop": "hip_hop_trap",
    "trap": "hip_hop_trap",
    "pop_vocal": "pop_vocal",
    "pop vocal": "pop_vocal",
    "pop / vocal": "pop_vocal",
    "pop": "pop_vocal",
    "vocal": "pop_vocal",
    "acoustic_folk": "acoustic_folk",
    "acoustic folk": "acoustic_folk",
    "acoustic / folk": "acoustic_folk",
    "acoustic": "acoustic_folk",
    "folk": "acoustic_folk",
    "cinematic_orchestral": "cinematic_orchestral",
    "cinematic orchestral": "cinematic_orchestral",
    "cinematic / orchestral": "cinematic_orchestral",
    "cinematic": "cinematic_orchestral",
    "orchestral": "cinematic_orchestral",
}
VALID_GENRES = set(GENRE_NORMALIZATION.values())


# --- Phase 2 Implemented Mathematical DSP Endpoint ---

@app.post("/api/v1/analyze/dsp")
async def post_analyze_dsp(
    audio_file: Optional[UploadFile] = File(None),
    file: Optional[UploadFile] = File(None),
    interface_mode: str = Form("advanced"),
    genre: str = Form("indie_rock"),
    mix_stage: Optional[str] = Form(None),
    stage: Optional[str] = Form(None),
    consent_state_json: Optional[str] = Form(None),
    consent_state: Optional[str] = Form(None),
    user_notes: Optional[str] = Form(None),
    plugin_chain_metadata_json: Optional[str] = Form(None),
):
    """
    Phase 2 Core Mathematical DSP Analysis Endpoint.
    Streams upload with 100 MB hard limit, inspects media, decodes to Float32 PCM,
    executes real DSP (FFmpeg ebur128, waveform, Welch PSD, diagnostics),
    validates against schema v2.0.0, and returns genuine AudioMixAnalysisReport.
    Guarded by asyncio.Semaphore(MAX_CONCURRENT_DSP) to protect server memory.
    Supports field aliases: 'audio_file' or 'file', 'mix_stage' or 'stage',
    normalized genre strings, and defaults consent if omitted.
    """
    target_file = audio_file or file
    if target_file is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error_code": "MISSING_AUDIO_FILE",
                "message": "An audio file ('file' or 'audio_file') must be provided as multipart/form-data.",
            },
        )

    # Genre normalization
    genre_clean = genre.lower().strip()
    norm_genre = GENRE_NORMALIZATION.get(genre_clean)
    if not norm_genre:
        norm_genre = GENRE_NORMALIZATION.get(
            genre_clean.replace(" ", "_").replace("-", "_").replace("/", "_"),
            "indie_rock",
        )

    # Mix stage normalization
    raw_stage = (mix_stage or stage or "unmastered_mix").lower().strip()
    if "master" in raw_stage and "unmaster" not in raw_stage:
        norm_stage = "final_master"
    else:
        norm_stage = "unmastered_mix"

    # Interface mode normalization
    norm_mode = "simple" if "simple" in interface_mode.lower() else "advanced"

    # 1. Parse and validate consent state (defaults to true if omitted)
    target_consent_str = consent_state_json or consent_state
    if target_consent_str and target_consent_str.strip():
        try:
            consent_dict = json.loads(target_consent_str)
            consent_obj = ConsentState(**consent_dict)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "error_code": "INVALID_CONSENT_PAYLOAD",
                    "message": f"Malformed consent state JSON: {str(e)}",
                },
            )

        # Enforce Rule 4: Explicit Permission 1 (audio_analysis_consent) required
        if not consent_obj.audio_analysis_consent:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error_code": "CONSENT_REQUIRED",
                    "message": "Permission 1 (audio_analysis_consent) is required before examining or measuring audio with mathematical DSP.",
                },
            )
    else:
        consent_obj = ConsentState(
            audio_analysis_consent=True,
            external_ai_transfer_consent=False,
            model_training_opt_in=False,
            consent_timestamp=datetime.now(timezone.utc).isoformat(),
        )

    # 2. Parse optional plugin chain metadata
    plugin_chain_meta = None
    if plugin_chain_metadata_json and plugin_chain_metadata_json.strip():
        try:
            plugin_chain_meta = json.loads(plugin_chain_metadata_json)
        except Exception:
            plugin_chain_meta = None

    # 3. Concurrency-guarded execution
    try:
        async with asyncio.timeout(60.0):
            async with dsp_semaphore:
                report = await anyio.to_thread.run_sync(
                    _run_ephemeral_analysis,
                    target_file,
                    norm_mode,
                    norm_genre,
                    norm_stage,
                    consent_obj.model_dump(),
                    user_notes,
                    plugin_chain_meta,
                )
    except TimeoutError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error_code": "SERVER_CONCURRENCY_LIMIT_REACHED",
                "message": "The server is currently processing the maximum number of concurrent audio analysis jobs. Please retry in a few moments.",
            },
            headers={"Retry-After": "5"},
        )

    return JSONResponse(content=report)


# --- Phase 3-6 Guarded Endpoints (HTTP 501 / 422 / 403) ---

@app.post("/api/v1/analyze/reference")
def post_analyze_reference():
    """Phase 3 boundary: Reference track loudness-matched comparison."""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail={
            "error_code": "PHASE_BOUNDARY_NOT_IMPLEMENTED",
            "target_phase": 3,
            "message": "Reference track loudness-matched comparison is scheduled for Phase 3.",
        },
    )


@app.post("/api/v1/analyze/streaming")
def post_analyze_streaming(
    payload: Optional[StreamingEstimateRequest] = Body(default=None),
):
    """
    Phase 3: Deterministic streaming loudness normalization estimates (Rule 7).
    Calculates estimated gain adjustments and limiter engagement warnings for
    Spotify Normal (-14 LUFS), Apple Music Sound Check (-16 LUFS), and YouTube (-14 LUFS, no upward gain).
    """
    integrated_lufs = payload.integrated_lufs if payload is not None else None
    true_peak_dbtp = payload.true_peak_dbtp if payload is not None else None
    estimates = compute_streaming_normalization_estimates(
        integrated_lufs=integrated_lufs,
        true_peak_dbtp=true_peak_dbtp,
    )
    return JSONResponse(content=estimates)


def _parse_consent_from_string(raw_consent: Optional[str]) -> ConsentState:
    if raw_consent and raw_consent.strip():
        try:
            consent_dict = json.loads(raw_consent)
            consent_obj = ConsentState(**consent_dict)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "error_code": "INVALID_CONSENT_PAYLOAD",
                    "message": f"Malformed consent state JSON: {str(exc)}",
                },
            )
        if not consent_obj.audio_analysis_consent:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error_code": "CONSENT_REQUIRED",
                    "message": "Permission 1 (audio_analysis_consent) is required before examining or measuring audio with mathematical DSP.",
                },
            )
        return consent_obj

    return ConsentState(
        audio_analysis_consent=True,
        external_ai_transfer_consent=False,
        model_training_opt_in=False,
        consent_timestamp=datetime.now(timezone.utc).isoformat(),
    )


def _normalize_genre_and_stage(genre: str, mix_stage: Optional[str]) -> tuple[str, str]:
    genre_clean = (genre or "indie_rock").lower().strip()
    norm_genre = GENRE_NORMALIZATION.get(genre_clean)
    if not norm_genre:
        norm_genre = GENRE_NORMALIZATION.get(
            genre_clean.replace(" ", "_").replace("-", "_").replace("/", "_"),
            "indie_rock",
        )
    raw_stage = (mix_stage or "unmastered_mix").lower().strip()
    norm_stage = "final_master" if ("master" in raw_stage and "unmaster" not in raw_stage) else "unmastered_mix"
    return norm_genre, norm_stage


def _run_ephemeral_stems_analysis(
    stem_uploads: List[UploadFile],
    primary_mix_upload: Optional[UploadFile],
    stem_roles: Optional[List[str]],
) -> Dict[str, Any]:
    with EphemeralAudioWorkspace(prefix="mixlearn-stems-") as workspace:
        return analyze_stems_workspace(
            workspace=workspace,
            stem_uploads=stem_uploads,
            primary_mix_upload=primary_mix_upload,
            stem_roles=stem_roles,
        )


def _run_ephemeral_dsp_with_six_bands(
    upload_file: UploadFile,
    interface_mode: str,
    genre: str,
    mix_stage: str,
    consent_dict: Dict[str, Any],
) -> tuple[Dict[str, Any], Dict[str, Optional[float]]]:
    raw_filename = upload_file.filename or "uploaded_audio.wav"
    with EphemeralAudioWorkspace(prefix="mixlearn-rev-") as workspace:
        ext = Path(raw_filename).suffix.lower()
        if not ext or len(ext) > 8 or not ext[1:].isalnum():
            ext = ".bin"
        safe_internal_name = f"upload_{uuid.uuid4().hex}{ext}"
        dest_raw_path = workspace / safe_internal_name
        file_size, sha256_hash = stream_upload_and_hash(upload_file, dest_raw_path)

        report = analyze_audio_workspace(
            raw_audio_path=dest_raw_path,
            original_filename=raw_filename,
            file_size_bytes=file_size,
            sha256_hash=sha256_hash,
            interface_mode=interface_mode,
            genre=genre,
            mix_stage=mix_stage,
            consent_state=consent_dict,
        )

        # Compute exact 6-band Welch PSD via streaming read for accurate revision delta comparison
        decoded_six_band = workspace / f"sixband_{uuid.uuid4().hex[:8]}.wav"
        decode_stem_to_pcm_f32le(dest_raw_path, decoded_six_band)
        six_band_stats = compute_streaming_spectral_and_peak(decoded_six_band, compute_true_peak_fallback=False)
        decoded_six_band.unlink(missing_ok=True)
        return report, six_band_stats["six_band_energies_db"]


@app.post("/api/v1/analyze/stems")
async def post_analyze_stems(request: Request):
    """
    Phase 4 Original Multitrack Stem Diagnostics Endpoint.
    - Strictly enforces Rule 1: Rejects AI stem separation, pseudo-stems, or single
      stereo mixdown split attempts with HTTP 422 PROHIBITED_AI_STEM_SEPARATION.
    - Accepts multipart/form-data with 2–8 original DAW stems (<=100 MB each, <=350 MB total)
      plus optional primary_mix stereo bounce for stem-sum residual comparison.
    """
    content_type = (request.headers.get("content-type") or "").lower()

    # 1. JSON requests: enforce Rule 1 guardrail immediately
    if "multipart/form-data" not in content_type:
        try:
            body = await request.json()
        except Exception:
            body = {}

        stems_to_check = []
        if isinstance(body, list):
            stems_to_check = body
        elif isinstance(body, dict):
            if body.get("request_ai_separation") or body.get("ai_stem_separation"):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=PROHIBITED_STEM_DETAIL,
                )
            if "stem_source_type" in body and body["stem_source_type"] != "user_uploaded_original":
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=PROHIBITED_STEM_DETAIL,
                )
            stems_to_check = body.get("stems", [])

        for stem in stems_to_check:
            src = stem.get("stem_source_type") if isinstance(stem, dict) else getattr(stem, "stem_source_type", None)
            if src != "user_uploaded_original":
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=PROHIBITED_STEM_DETAIL,
                )

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error_code": "MULTIPART_ORIGINAL_STEMS_REQUIRED",
                "message": (
                    "Upload 2–8 genuine original DAW stem audio files as multipart/form-data "
                    "(field name 'stems' or 'files'). MixLearn Studio never generates AI stems."
                ),
            },
        )

    # 2. Multipart upload of genuine user-provided original stems
    form = await request.form()

    # Rule 1 form-level guardrails
    stem_source_type = str(form.get("stem_source_type") or "user_uploaded_original").strip().lower()
    request_ai_sep = str(form.get("request_ai_separation") or "false").strip().lower()
    if stem_source_type != "user_uploaded_original" or request_ai_sep in ("true", "1", "yes"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=PROHIBITED_STEM_DETAIL,
        )

    # Enforce Permission 1 consent gate
    consent_raw = form.get("consent_state_json") or form.get("consent_state")
    _parse_consent_from_string(str(consent_raw) if consent_raw is not None else None)

    # Collect uploaded stem files from 'stems', 'stem_files', or 'files'
    stem_uploads: List[UploadFile] = []
    for field_name in ("stems", "stem_files", "files"):
        for item in form.getlist(field_name):
            if hasattr(item, "file") and hasattr(item, "filename"):
                stem_uploads.append(item)  # type: ignore[arg-type]

    # Reject single stereo mixdown passed via primary_mix/audio_file without user stems
    if len(stem_uploads) == 0 and (form.get("audio_file") is not None or form.get("file") is not None or form.get("primary_mix") is not None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=PROHIBITED_STEM_DETAIL,
        )

    primary_mix_candidate = form.get("primary_mix")
    primary_mix_upload: Optional[UploadFile] = (
        primary_mix_candidate  # type: ignore[assignment]
        if primary_mix_candidate is not None and hasattr(primary_mix_candidate, "file")
        else None
    )

    stem_roles: Optional[List[str]] = None
    roles_raw = form.get("stem_roles_json")
    if roles_raw:
        try:
            parsed_roles = json.loads(str(roles_raw))
            if isinstance(parsed_roles, list):
                stem_roles = [str(r) for r in parsed_roles]
        except Exception:
            stem_roles = None

    try:
        async with asyncio.timeout(90.0):
            async with dsp_semaphore:
                result = await anyio.to_thread.run_sync(
                    _run_ephemeral_stems_analysis,
                    stem_uploads,
                    primary_mix_upload,
                    stem_roles,
                )
    except TimeoutError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error_code": "SERVER_CONCURRENCY_LIMIT_REACHED",
                "message": "The server is currently processing the maximum number of concurrent audio jobs. Please retry shortly.",
            },
            headers={"Retry-After": "5"},
        )

    return JSONResponse(content=result)


@app.post("/api/v1/simulate/device")
def post_simulate_device():
    """Playback translation runs real-time in the browser via Web Audio biquad filters."""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail={
            "error_code": "PHASE_BOUNDARY_NOT_IMPLEMENTED",
            "target_phase": 4,
            "message": "Device translation approximations are executed client-side in real time via Web Audio biquad filters.",
        },
    )


@app.post("/api/v1/analyze/revisions")
@app.post("/api/v1/compare/revisions")
async def post_compare_revisions(request: Request):
    """
    Phase 4 Mix Revision Delta Comparison (v1 vs. v2).
    Supports:
    - multipart/form-data with (mix_v1 + mix_v2) audio bounces, OR (v1_report_json + mix_v2)
    - application/json with (v1_report + v2_report) DSP reports
    Computes exact deterministic deltas and classifies prior v1 findings as
    improved, unchanged, or regressed.
    """
    content_type = (request.headers.get("content-type") or "").lower()

    # Option A: JSON comparison of two DSP reports
    if "application/json" in content_type:
        try:
            body = await request.json()
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "error_code": "INVALID_REVISION_PAYLOAD",
                    "message": f"Malformed JSON body for revision comparison: {str(exc)}",
                },
            )
        if not isinstance(body, dict) or not body.get("v1_report") or not body.get("v2_report"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "error_code": "MISSING_REVISION_REPORTS",
                    "message": "Provide both 'v1_report' and 'v2_report' objects (or upload multipart audio bounces 'mix_v1' and 'mix_v2').",
                },
            )
        consent_dict = body.get("consent_state")
        if isinstance(consent_dict, dict):
            consent_obj = ConsentState(**consent_dict)
            if not consent_obj.audio_analysis_consent:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={
                        "error_code": "CONSENT_REQUIRED",
                        "message": "Permission 1 (audio_analysis_consent) is required.",
                    },
                )
        comparison = compare_revision_reports(
            v1_report=body["v1_report"],
            v2_report=body["v2_report"],
            v1_six_bands=body.get("v1_six_bands"),
            v2_six_bands=body.get("v2_six_bands"),
        )
        return JSONResponse(content=comparison)

    # Option B: Multipart upload (mix_v1 + mix_v2) OR (v1_report_json + mix_v2)
    if "multipart/form-data" not in content_type:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error_code": "MISSING_REVISION_INPUTS",
                "message": "Upload multipart audio ('mix_v1' + 'mix_v2' or 'v1_report_json' + 'mix_v2') or send JSON ('v1_report' + 'v2_report').",
            },
        )

    form = await request.form()
    consent_raw = form.get("consent_state_json") or form.get("consent_state")
    consent_obj = _parse_consent_from_string(str(consent_raw) if consent_raw is not None else None)

    norm_genre, norm_stage = _normalize_genre_and_stage(
        str(form.get("genre") or "indie_rock"),
        str(form.get("mix_stage") or form.get("stage") or "unmastered_mix"),
    )
    interface_mode = "simple" if "simple" in str(form.get("interface_mode") or "advanced").lower() else "advanced"

    mix_v1_upload = form.get("mix_v1")
    mix_v2_upload = form.get("mix_v2") or form.get("file") or form.get("audio_file")
    v1_report_raw = form.get("v1_report_json")
    v1_six_bands_raw = form.get("v1_six_band_spectrum_json")

    if mix_v2_upload is None or not hasattr(mix_v2_upload, "file"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error_code": "MISSING_MIX_V2",
                "message": "A revised mix bounce ('mix_v2') is required to compute revision deltas.",
            },
        )

    has_v1_audio = mix_v1_upload is not None and hasattr(mix_v1_upload, "file")
    v1_report_parsed: Optional[Dict[str, Any]] = None
    if v1_report_raw:
        try:
            v1_report_parsed = json.loads(str(v1_report_raw))
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "error_code": "INVALID_V1_REPORT_JSON",
                    "message": f"Malformed v1_report_json payload: {str(exc)}",
                },
            )

    if not has_v1_audio and v1_report_parsed is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error_code": "MISSING_BASELINE_V1",
                "message": "Provide either baseline audio bounce ('mix_v1') or baseline DSP report ('v1_report_json').",
            },
        )

    v1_six_bands_parsed: Optional[Dict[str, Optional[float]]] = None
    if v1_six_bands_raw:
        try:
            parsed_sb = json.loads(str(v1_six_bands_raw))
            if isinstance(parsed_sb, dict):
                v1_six_bands_parsed = parsed_sb
        except Exception:
            v1_six_bands_parsed = None

    def _run_revision_worker() -> Dict[str, Any]:
        consent_dump = consent_obj.model_dump()
        if has_v1_audio:
            v1_rep, v1_sb = _run_ephemeral_dsp_with_six_bands(
                upload_file=mix_v1_upload,  # type: ignore[arg-type]
                interface_mode=interface_mode,
                genre=norm_genre,
                mix_stage=norm_stage,
                consent_dict=consent_dump,
            )
        else:
            v1_rep = v1_report_parsed  # type: ignore[assignment]
            v1_sb = v1_six_bands_parsed

        v2_rep, v2_sb = _run_ephemeral_dsp_with_six_bands(
            upload_file=mix_v2_upload,  # type: ignore[arg-type]
            interface_mode=interface_mode,
            genre=norm_genre,
            mix_stage=norm_stage,
            consent_dict=consent_dump,
        )
        return compare_revision_reports(
            v1_report=v1_rep,
            v2_report=v2_rep,
            v1_six_bands=v1_sb,
            v2_six_bands=v2_sb,
        )

    try:
        async with asyncio.timeout(90.0):
            async with dsp_semaphore:
                comparison = await anyio.to_thread.run_sync(_run_revision_worker)
    except TimeoutError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error_code": "SERVER_CONCURRENCY_LIMIT_REACHED",
                "message": "The server is currently processing the maximum number of concurrent audio jobs. Please retry shortly.",
            },
            headers={"Retry-After": "5"},
        )

    return JSONResponse(content=comparison)


@app.post("/api/v1/interpret/ai")
async def post_interpret_ai(request: Request):
    """
    Phase 5 boundary: Educational AI interpretation.
    Enforces Rule 4 consent gate and Rule 2 mathematical primacy.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    consent_dict = body.get("consent_state", body) if isinstance(body, dict) else {}
    has_ai_permission = bool(
        consent_dict.get("external_ai_transfer_consent", False) or
        consent_dict.get("ai_numerical_metrics_transfer_consent", False)
    )
    if not has_ai_permission:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error_code": "AI_TRANSFER_CONSENT_REQUIRED",
                "message": "Permission 2 (external_ai_transfer_consent) is required before transmitting measurements to external AI.",
            },
        )

    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail={
            "error_code": "PHASE_BOUNDARY_NOT_IMPLEMENTED",
            "target_phase": 5,
            "message": "Consent-gated Gemini API educational coaching on structured DSP measurements is scheduled for Phase 5.",
        },
    )

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
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from backend.app.dsp.media_probe import stream_upload_and_hash
from backend.app.dsp.pipeline import analyze_audio_workspace

logger = logging.getLogger("mixlearn.main")

BASE_DIR = Path(__file__).resolve().parent.parent.parent
CONTRACTS_DIR = BASE_DIR / "contracts"
FIXTURES_DIR = CONTRACTS_DIR / "fixtures"
SCHEMA_FILE = CONTRACTS_DIR / "analysis_report.schema.json"
DEMO_REPORT_FILE = FIXTURES_DIR / "demo_report.json"

app = FastAPI(
    title="MixLearn Studio API — Phase 2 Mathematical DSP",
    version="2.0.0-phase2",
    description="Privacy-first audio mixing & mastering educational backend with real mathematical DSP analysis.",
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
    allow_headers=["Content-Type", "Authorization", "Accept"],
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
        "status": "ok",
        "service": "mixlearn-studio-api",
        "phase": 2,
        "mode": "mathematical_dsp_active",
        "is_demonstration_mode": False,
        "active_contract_version": "2.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/v1/health")
def get_api_v1_health():
    """Detailed health endpoint for frontend proxy & gateway verification."""
    return {
        "status": "ok",
        "service": "mixlearn-studio-api",
        "phase": 2,
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
        "phase": 2,
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
            "dsp_core_measurements": "IMPLEMENTED",
            "ai_stem_separation": "PROHIBITED_BY_PRODUCT_RULE",
            "streaming_normalization_estimates": "NOT_IMPLEMENTED_PHASE_3",
            "original_stem_multitrack_analysis": "NOT_IMPLEMENTED_PHASE_4",
            "ai_educational_interpretation": "NOT_IMPLEMENTED_PHASE_5",
        },
        "capabilities": {
            "dsp_core_measurements": {
                "status": "IMPLEMENTED",
                "phase_target": 2,
                "disclosure": "Phase 2 Mathematical DSP engine active: Real-time loudness, true peak, crest factor, phase correlation, and Welch PSD.",
            },
            "streaming_normalization_estimates": {
                "status": "NOT_IMPLEMENTED",
                "phase_target": 3,
                "disclosure": "Streaming normalization predictions scheduled for Phase 3.",
            },
            "reference_track_comparison": {
                "status": "NOT_IMPLEMENTED",
                "phase_target": 3,
                "disclosure": "Reference track curve comparison scheduled for Phase 3.",
            },
            "original_stem_multitrack_analysis": {
                "status": "NOT_IMPLEMENTED",
                "phase_target": 4,
                "disclosure": "User-uploaded multitrack stem masking analysis scheduled for Phase 4.",
            },
            "device_translation_preview": {
                "status": "NOT_IMPLEMENTED",
                "phase_target": 4,
                "disclosure": "Linear filter translation approximations scheduled for Phase 4.",
            },
            "mix_revision_comparison": {
                "status": "NOT_IMPLEMENTED",
                "phase_target": 5,
                "disclosure": "Mix revision delta analysis scheduled for Phase 5.",
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


# --- Phase 2 Implemented Mathematical DSP Endpoint ---

@app.post("/api/v1/analyze/dsp")
async def post_analyze_dsp(
    audio_file: UploadFile = File(...),
    interface_mode: str = Form("advanced"),
    genre: str = Form("indie_rock"),
    mix_stage: str = Form("unmastered_mix"),
    consent_state_json: str = Form(...),
    user_notes: Optional[str] = Form(None),
    plugin_chain_metadata_json: Optional[str] = Form(None),
):
    """
    Phase 2 Core Mathematical DSP Analysis Endpoint.
    Streams upload with 100 MB hard limit, inspects media, decodes to Float32 PCM,
    executes real DSP (FFmpeg ebur128, waveform, Welch PSD, diagnostics),
    validates against schema v2.0.0, and returns genuine AudioMixAnalysisReport.
    Guarded by asyncio.Semaphore(MAX_CONCURRENT_DSP) to protect server memory.
    """
    # 1. Parse and validate consent state
    try:
        consent_dict = json.loads(consent_state_json)
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
                    audio_file,
                    interface_mode,
                    genre,
                    mix_stage,
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
def post_analyze_streaming():
    """Phase 3 boundary: Target platform normalization predictions."""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail={
            "error_code": "PHASE_BOUNDARY_NOT_IMPLEMENTED",
            "target_phase": 3,
            "message": "Streaming normalization predictions are scheduled for Phase 3.",
        },
    )


@app.post("/api/v1/analyze/stems")
async def post_analyze_stems(request: Request):
    """
    Phase 4 boundary: User-uploaded multitrack stems analysis.
    Strictly enforces Rule 1: Rejects any stem that is not user_uploaded_original with HTTP 422.
    """
    try:
        body = await request.json()
    except Exception:
        body = []

    # Check for Rule 1 violation
    stems_to_check = []
    if isinstance(body, list):
        stems_to_check = body
    elif isinstance(body, dict):
        if "stem_source_type" in body and body["stem_source_type"] != "user_uploaded_original":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "error_code": "PROHIBITED_AI_STEM_SEPARATION",
                    "message": "Product Rule 1 Violation: AI stem separation, automatic stem splitting, and pseudo-stems are strictly forbidden. Upload genuine original stems only.",
                },
            )
        stems_to_check = body.get("stems", [])

    for stem in stems_to_check:
        src = stem.get("stem_source_type") if isinstance(stem, dict) else getattr(stem, "stem_source_type", None)
        if src != "user_uploaded_original":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "error_code": "PROHIBITED_AI_STEM_SEPARATION",
                    "message": "Product Rule 1 Violation: AI stem separation, automatic stem splitting, and pseudo-stems are strictly forbidden. Upload genuine original stems only.",
                },
            )

    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail={
            "error_code": "PHASE_BOUNDARY_NOT_IMPLEMENTED",
            "target_phase": 4,
            "message": "Original user-uploaded stem & multitrack masking analysis is scheduled for Phase 4.",
        },
    )


@app.post("/api/v1/simulate/device")
def post_simulate_device():
    """Phase 4 boundary: Consumer playback device translation."""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail={
            "error_code": "PHASE_BOUNDARY_NOT_IMPLEMENTED",
            "target_phase": 4,
            "message": "Playback device translation filters are scheduled for Phase 4.",
        },
    )


@app.post("/api/v1/analyze/revisions")
@app.post("/api/v1/compare/revisions")
def post_compare_revisions():
    """Phase 5 boundary: Mix revision delta comparison."""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail={
            "error_code": "PHASE_BOUNDARY_NOT_IMPLEMENTED",
            "target_phase": 5,
            "message": "Before/after mix revision delta comparison is scheduled for Phase 5.",
        },
    )


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

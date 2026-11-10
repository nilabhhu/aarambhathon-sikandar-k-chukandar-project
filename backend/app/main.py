"""
Phase 1 FastAPI Backend Foundation for MixLearn Studio.
Exposes operational health, capabilities, shared schema contract, and explicitly labeled demonstration endpoints.
Enforces Product Rules:
- Rule 1: Forbidden AI stem separation / automatic stem splitting.
- Rule 2: Mathematical DSP as sole measurement source of truth.
- Rule 4 & 5: Three-tier granular consent and no model training default.
- Rule 8: Separation of objective technical defects from subjective stylistic notes.
- Rule 9: Zero unnecessary infrastructure, ephemeral stateless processing.

All Phase 2-6 endpoints return HTTP 501 Not Implemented with structured phase metadata.
"""

from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
import tempfile
from typing import Any, Dict, List, Literal, Optional
import uuid

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent.parent.parent
CONTRACTS_DIR = BASE_DIR / "contracts"
FIXTURES_DIR = CONTRACTS_DIR / "fixtures"
SCHEMA_FILE = CONTRACTS_DIR / "analysis_report.schema.json"
DEMO_REPORT_FILE = FIXTURES_DIR / "demo_report.json"

app = FastAPI(
    title="MixLearn Studio API — Phase 1 Foundation",
    version="1.0.0-phase1",
    description="Privacy-first audio mixing & mastering educational backend. Phase 1 contract foundation only.",
)

# Safe CORS configuration for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept"],
)


class ConsentState(BaseModel):
    audio_analysis_consent: bool = Field(
        ...,
        description="Permission 1: Local/server DSP analysis (required for audio inspection).",
    )
    external_ai_transfer_consent: bool = Field(
        False,
        description="Permission 2: External AI interpretation (default false; requires separate consent).",
    )
    model_training_opt_in: bool = Field(
        False,
        description="Permission 3: Model training (Default False; automatic training forbidden per Rule 5).",
    )
    consent_timestamp: str = Field(
        ...,
        description="ISO-8601 timestamp when consent preferences were explicitly confirmed.",
    )


class StemUploadMeta(BaseModel):
    stem_name: str
    stem_source_type: Literal["user_uploaded_original", "ai_separated", "pseudo_stem"]
    stem_role: Optional[str] = "other"


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
    report_id: str
    consent_state: ConsentState


# Ephemeral storage manager utility demonstrating Rule 9 (Zero Unnecessary Infrastructure)
class EphemeralAudioWorkspace:
    """
    Context manager for creating ephemeral temporary processing directories.
    Automatically purged in finally blocks; no persistent storage or cloud buckets.
    """
    def __init__(self, prefix: str = "mixlearn-"):
        self.session_id = str(uuid.uuid4())
        self.temp_dir: Optional[Path] = None
        self.prefix = prefix

    def __enter__(self) -> Path:
        self.temp_dir = Path(tempfile.mkdtemp(prefix=f"{self.prefix}{self.session_id}-"))
        return self.temp_dir

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.temp_dir and self.temp_dir.exists():
            shutil.rmtree(self.temp_dir, ignore_errors=True)


# --- Phase 1 Implemented Endpoints ---

@app.get("/health")
def get_operational_health():
    """Returns basic operational status."""
    return {
        "status": "ok",
        "service": "mixlearn-studio-api",
        "phase": 1,
        "is_demonstration_mode": True,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/v1/health")
def get_api_health():
    """Returns detailed Phase 1 API status and mode boundaries."""
    return {
        "status": "ok",
        "service": "mixlearn-studio-api",
        "phase": 1,
        "mode": "foundation_contracts_only",
        "is_demonstration_mode": True,
        "active_contract_version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/v1/capabilities")
def get_capabilities():
    """
    States which functionalities are actually implemented vs scheduled.
    Explicitly reports real DSP analysis, stem processing, and AI interpretation as unavailable in Phase 1.
    """
    return {
        "phase": 1,
        "service_version": "1.0.0-phase1",
        "rules_enforced": {
            "no_ai_stem_separation": True,
            "dsp_is_sole_measurement_source": True,
            "separate_three_tier_consent": True,
            "default_no_model_training": True,
            "objective_vs_subjective_separated": True,
            "zero_unnecessary_infrastructure": True,
        },
        "capabilities_status": {
            "dsp_core_measurements": "DEMO_FIXTURE_ONLY",
            "streaming_normalization_estimates": "NOT_IMPLEMENTED_PHASE_3",
            "reference_track_comparison": "NOT_IMPLEMENTED_PHASE_3",
            "original_stem_multitrack_analysis": "NOT_IMPLEMENTED_PHASE_4",
            "ai_stem_separation": "PROHIBITED_BY_PRODUCT_RULE",
            "device_translation_preview": "NOT_IMPLEMENTED_PHASE_4",
            "mix_revision_comparison": "NOT_IMPLEMENTED_PHASE_5",
            "ai_educational_interpretation": "NOT_IMPLEMENTED_PHASE_5",
        },
        "endpoints": {
            "/health": "IMPLEMENTED_PHASE_1",
            "/api/v1/health": "IMPLEMENTED_PHASE_1",
            "/api/v1/capabilities": "IMPLEMENTED_PHASE_1",
            "/api/v1/contracts/schema": "IMPLEMENTED_PHASE_1",
            "/api/v1/demo/report": "IMPLEMENTED_PHASE_1_DEMO_FIXTURE",
            "/api/v1/analyze/demo": "IMPLEMENTED_PHASE_1_DEMO_FIXTURE",
            "/api/v1/analyze/dsp": "NOT_IMPLEMENTED_PHASE_2",
            "/api/v1/analyze/reference": "NOT_IMPLEMENTED_PHASE_3",
            "/api/v1/analyze/streaming": "NOT_IMPLEMENTED_PHASE_3",
            "/api/v1/analyze/stems": "NOT_IMPLEMENTED_PHASE_4",
            "/api/v1/analyze/revisions": "NOT_IMPLEMENTED_PHASE_5",
            "/api/v1/interpret/ai": "NOT_IMPLEMENTED_PHASE_5",
        },
    }


@app.get("/api/v1/contracts/schema")
def get_canonical_schema():
    """Returns the canonical JSON Schema (Draft 2020-12) defining the AudioMixAnalysisReport contract."""
    if not SCHEMA_FILE.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Canonical analysis report schema file not found.",
        )
    with open(SCHEMA_FILE, "r", encoding="utf-8") as f:
        schema = json.load(f)
    return JSONResponse(content=schema)


def _load_or_create_demo_fixture() -> Dict[str, Any]:
    """Helper to load canonical demonstration report fixture."""
    if DEMO_REPORT_FILE.exists():
        with open(DEMO_REPORT_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Canonical demonstration fixture file not found.",
    )


@app.get("/api/v1/demo/report")
def get_demo_report():
    """
    Returns a sample report conforming to the shared analysis schema.
    Must clearly identify the result as demonstration data (is_demonstration_data: true).
    """
    report = _load_or_create_demo_fixture()
    if not report.get("is_demonstration_data"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Contract violation: Demonstration report missing is_demonstration_data: true flag.",
        )
    return JSONResponse(content=report)


@app.post("/api/v1/analyze/demo")
def post_analyze_demo(request: DemoAnalysisRequest):
    """
    Phase 1 demo analysis endpoint.
    Validates explicit consent state and returns an explicitly labeled demonstration fixture.
    """
    if not request.consent_state.audio_analysis_consent:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error_code": "CONSENT_REQUIRED",
                "message": "Permission 1 (audio_analysis_consent) is required to view analysis report.",
            },
        )

    report = _load_or_create_demo_fixture()
    report["input_context"]["interface_mode"] = request.interface_mode
    report["input_context"]["genre"] = request.genre
    report["input_context"]["mix_stage"] = request.mix_stage
    report["consent_state"] = request.consent_state.model_dump()
    report["report_id"] = f"demo-p1-{request.genre}-{request.mix_stage}"
    report["is_demonstration_data"] = True
    return JSONResponse(content=report)


# --- Phase 2-6 Guarded Endpoints (HTTP 501 / 422 / 403) ---

@app.post("/api/v1/analyze/dsp")
def post_analyze_dsp():
    """Phase 2 boundary: Core mathematical DSP analysis."""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail={
            "error_code": "PHASE_BOUNDARY_NOT_IMPLEMENTED",
            "target_phase": 2,
            "message": "Real mathematical DSP analysis (FFmpeg/libebur128, pyloudnorm, SciPy) is scheduled for Phase 2.",
        },
    )


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
    """Phase 3 boundary: Streaming normalization playback gain estimates."""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail={
            "error_code": "PHASE_BOUNDARY_NOT_IMPLEMENTED",
            "target_phase": 3,
            "message": "Streaming normalization estimates (Spotify, Apple Music, YouTube, Tidal) are scheduled for Phase 3.",
        },
    )


@app.post("/api/v1/analyze/stems")
def post_analyze_stems(stems: List[StemUploadMeta]):
    """
    Phase 4 boundary: Original user-uploaded stems & multitracks.
    Rule 1 Guard: Strictly rejects ai_separated and pseudo_stem with HTTP 422.
    """
    for stem in stems:
        if stem.stem_source_type != "user_uploaded_original":
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


@app.post("/api/v1/analyze/revisions")
def post_analyze_revisions():
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
def post_interpret_ai(request: ExternalAiInterpretationRequest):
    """
    Phase 5 boundary: AI educational coaching on structured DSP metrics.
    Rule 4 Guard: Strictly requires external_ai_transfer_consent=True.
    """
    if not request.consent_state.external_ai_transfer_consent:
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

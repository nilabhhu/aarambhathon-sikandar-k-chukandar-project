# MixLearn Studio — API Contracts & Schema Specification

## 1. Canonical Schema Overview

The shared canonical contract governing communication between the browser client (Next.js / React) and the backend (FastAPI) is defined in:
`contracts/analysis_report.schema.json`

- **JSON Schema Standard:** Draft 2020-12 (`https://json-schema.org/draft/2020-12/schema`).
- **Contract Version:** `1.0.0`.
- **Primary Type:** `AudioMixAnalysisReport` (object).

---

## 2. Mandatory Top-Level Schema Fields

```json
{
  "schema_version": "1.0.0",
  "report_id": "demo-p1-indie_rock-unmastered_mix",
  "created_at": "2026-11-10T18:00:00.000Z",
  "is_demonstration_data": true,
  "data_source_notice": "DEMONSTRATION DATA — PHASE 1 CONTRACT FIXTURE: All numeric values below are deterministic schema fixtures for architectural verification. Real FFmpeg/libebur128, pyloudnorm, and SciPy DSP execution begins in Phase 2.",
  "input_context": {
    "interface_mode": "advanced",
    "genre": "indie_rock",
    "mix_stage": "unmastered_mix"
  },
  "consent_state": {
    "audio_analysis_consent": true,
    "external_ai_transfer_consent": false,
    "ai_numerical_metrics_transfer_consent": false,
    "ai_audio_content_inspection_consent": false,
    "raw_audio_transfer_consent": false,
    "model_training_opt_in": false,
    "consent_timestamp": "2026-11-10T18:00:00Z"
  },
  "file_metadata": { ... },
  "capabilities": { ... },
  "measurements": { ... },
  "issues": [ ... ],
  "recommendations": [ ... ],
  "extensions": {
    "streaming_estimates": null,
    "reference_comparison": null,
    "stem_multitrack_report": null,
    "device_translation_profiles": null,
    "revision_comparison": null,
    "ai_interpretation": null
  }
}
```

### Invariants Enforced by Pure Validators:
1. `is_demonstration_data` MUST be `true` in all Phase 1 responses.
2. Every measurement in `measurements` must declare `source: "phase1_demo_fixture"` (Phase 1) or `"mathematical_dsp"` (Phase 2+). AI is forbidden as a source.
3. Every issue in `issues` must declare `classification: "objective_technical"` or `"subjective_stylistic"`.
4. All six slots in `extensions` MUST be strictly `null` in Phase 1.
5. All 5 consent properties must be present and boolean; `model_training_opt_in` default is strictly `false`.

---

## 3. Complete HTTP API Endpoint Reference

### Implemented Phase 1 Endpoints (HTTP 200 OK)

#### 1. `GET /health`
- **Purpose:** Operational health check.
- **Response:**
  ```json
  {
    "status": "ok",
    "service": "mixlearn-studio-api",
    "phase": 1,
    "is_demonstration_mode": true,
    "timestamp": "2026-11-10T18:00:00.000000+00:00"
  }
  ```

#### 2. `GET /api/v1/health`
- **Purpose:** Detailed service mode and contract version check.
- **Response:**
  ```json
  {
    "status": "ok",
    "service": "mixlearn-studio-api",
    "phase": 1,
    "mode": "foundation_contracts_only",
    "is_demonstration_mode": true,
    "active_contract_version": "1.0.0",
    "timestamp": "2026-11-10T18:00:00.000000+00:00"
  }
  ```

#### 3. `GET /api/v1/capabilities`
- **Purpose:** Reports implemented features vs. future scheduled phase boundaries.
- **Response:**
  ```json
  {
    "phase": 1,
    "rules_enforced": {
      "no_ai_stem_separation": true,
      "dsp_is_sole_measurement_source": true,
      "separate_three_tier_consent": true,
      "default_no_model_training": true,
      "objective_vs_subjective_separated": true,
      "zero_unnecessary_infrastructure": true
    },
    "capabilities_status": {
      "dsp_core_measurements": "DEMO_FIXTURE_ONLY",
      "streaming_normalization_estimates": "NOT_IMPLEMENTED_PHASE_3",
      "reference_track_comparison": "NOT_IMPLEMENTED_PHASE_3",
      "original_stem_multitrack_analysis": "NOT_IMPLEMENTED_PHASE_4",
      "ai_stem_separation": "PROHIBITED_BY_PRODUCT_RULE",
      "device_translation_preview": "NOT_IMPLEMENTED_PHASE_4",
      "mix_revision_comparison": "NOT_IMPLEMENTED_PHASE_5",
      "ai_educational_interpretation": "NOT_IMPLEMENTED_PHASE_5"
    }
  }
  ```

#### 4. `GET /api/v1/contracts/schema`
- **Purpose:** Serves the canonical JSON Schema (`contracts/analysis_report.schema.json`).

#### 5. `GET /api/v1/demo/report`
- **Purpose:** Returns a complete sample report conforming to the shared schema (`contracts/fixtures/demo_report.json`), labeled with `is_demonstration_data: true`.

#### 6. `POST /api/v1/analyze/demo`
- **Purpose:** Generates a canonical demonstration report reflecting the requested genre, mix stage, and 5-tier consent context.
- **Request Body:**
  ```json
  {
    "interface_mode": "advanced",
    "genre": "indie_rock",
    "mix_stage": "unmastered_mix",
    "consent_state": {
      "audio_analysis_consent": true,
      "external_ai_transfer_consent": false,
      "ai_numerical_metrics_transfer_consent": false,
      "ai_audio_content_inspection_consent": false,
      "raw_audio_transfer_consent": false,
      "model_training_opt_in": false,
      "consent_timestamp": "2026-11-10T18:00:00Z"
    }
  }
  ```
- **Error Behavior:** If `audio_analysis_consent: false`, returns `HTTP 403 Forbidden` (`CONSENT_REQUIRED`).

---

### Guarded Future Phase Endpoints (HTTP 501 / 422 / 403)

| Endpoint | Method | Target Phase | Condition / Guard Behavior |
| :--- | :--- | :--- | :--- |
| `/api/v1/analyze/dsp` | `POST` | Phase 2 | Returns `HTTP 501 Not Implemented`. |
| `/api/v1/analyze/reference` | `POST` | Phase 3 | Returns `HTTP 501 Not Implemented`. |
| `/api/v1/analyze/streaming` | `POST` | Phase 3 | Returns `HTTP 501 Not Implemented`. |
| `/api/v1/analyze/stems` | `POST` | Phase 4 | Returns `HTTP 422 Unprocessable Content` if `stem_source_type != "user_uploaded_original"`; returns `HTTP 501` for original stems. |
| `/api/v1/analyze/revisions` | `POST` | Phase 5 | Returns `HTTP 501 Not Implemented`. |
| `/api/v1/interpret/ai` | `POST` | Phase 5 | Returns `HTTP 403 Forbidden` if `external_ai_transfer_consent: false`; returns `HTTP 501` if consented. |

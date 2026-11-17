# MixLearn Studio — API Contracts & Schema Specification

## 1. Canonical Schema Overview

The shared canonical contract governing communication between the browser client (React 19 / Vite) and the backend (FastAPI) is defined in:
`contracts/analysis_report.schema.json`

- **JSON Schema Standard:** Draft 2020-12 (`https://json-schema.org/draft/2020-12/schema`).
- **Contract Version:** `2.0.0` (Migrated from `1.0.0` in Phase 2).
- **Primary Type:** `AudioMixAnalysisReport` (object).

---

## 2. Phase 2 Schema Migration Details (1.0.0 → 2.0.0)

| Schema Field / Structure | Phase 1 (`1.0.0`) | Phase 2 (`2.0.0`) | Architectural Reason |
| :--- | :--- | :--- | :--- |
| `schema_version` | `"1.0.0"` | `"2.0.0"` | Identifies real DSP contract capabilities. |
| `MeasurementValue.value` | `number` (strictly required) | `number \| null` (nullable) | Audio edge cases (e.g., mono input, Nyquist below band) cannot produce invalid numbers. |
| `MeasurementValue.status` | `"measured"` only | `"measured" \| "calculated" \| "estimated" \| "not_calculated" \| "unavailable"` | Reflects exact calculation state and availability. |
| `MeasurementValue.unavailable_reason` | *Not present* | `string \| null` | Transparently discloses why a metric could not be computed. |
| `MeasurementValue.algorithm_detail` | *Not present* | `string` | Fully documents the DSP algorithm (e.g. `ITU-R BS.1770-4`, `Welch Hann`). |
| `file_metadata.codec` | *Not present* | `string` (e.g., `"pcm_s24le"`, `"vorbis"`, `"flac"`) | Captured during `ffprobe` inspection. |
| `file_metadata.bit_depth_note` | *Not present* | `string \| null` | Distinguishes fixed-point integer vs. floating-point lossy representations. |
| `file_metadata.sample_rate_hz` | Restricted enum | `8000..384000` (integer range) | Accommodates studio rates from 8 kHz to 384 kHz. |
| `measurements.sample_peak_max` | *Not present* | `MeasurementValue` | Distinguishes raw sample peak from 4x oversampled true peak. |
| `timeline` | *Not present* | `TimelineSeries \| null` ($\le 240$ buckets) | Provides deterministic envelope curve for waveform visualization. |

---

## 3. Mandatory Top-Level Schema Fields

```json
{
  "schema_version": "2.0.0",
  "report_id": "dsp-f8e1a90c-4b3d-4c2a-9e1b-8d7e6f5a4b3c",
  "created_at": "2026-11-17T12:00:00.000Z",
  "is_demonstration_data": false,
  "data_source_notice": "MATHEMATICAL DSP ENGINE: Real-time digital signal processing executed via FFmpeg, pyloudnorm, and SciPy. Zero AI inference or synthetic fixtures.",
  "input_context": {
    "interface_mode": "advanced",
    "genre": "electronic_club",
    "mix_stage": "final_master"
  },
  "consent_state": {
    "audio_analysis_consent": true,
    "external_ai_transfer_consent": false,
    "ai_numerical_metrics_transfer_consent": false,
    "ai_audio_content_inspection_consent": false,
    "raw_audio_transfer_consent": false,
    "model_training_opt_in": false,
    "consent_timestamp": "2026-11-17T12:00:00Z"
  },
  "file_metadata": {
    "file_name": "track_master.wav",
    "file_size_bytes": 45120000,
    "sha256_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "duration_seconds": 214.5,
    "sample_rate_hz": 48000,
    "channels": 2,
    "bit_depth": 24,
    "format": "WAV",
    "codec": "pcm_s24le",
    "bit_depth_note": "24-bit linear PCM"
  },
  "capabilities": {
    "dsp_core_measurements": "IMPLEMENTED",
    "streaming_normalization_estimates": "NOT_IMPLEMENTED",
    "reference_target_comparison": "NOT_IMPLEMENTED",
    "genuine_stem_multitrack_analysis": "NOT_IMPLEMENTED",
    "playback_device_translation": "NOT_IMPLEMENTED",
    "historical_revision_tracking": "NOT_IMPLEMENTED",
    "ai_coaching_insights": "NOT_IMPLEMENTED"
  },
  "measurements": { ... },
  "timeline": {
    "bucket_count": 240,
    "bucket_duration_seconds": 0.89375,
    "buckets": [
      {
        "bucket_index": 0,
        "time_seconds": 0.0,
        "rms_dbfs": -18.4,
        "peak_dbfs": -3.2,
        "is_clipped": false
      }
    ]
  },
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

---

## 4. Complete HTTP API Endpoint Reference

### Implemented Endpoints (HTTP 200 OK)

#### 1. `POST /api/v1/analyze/dsp` (Phase 2 Real DSP Analysis)
- **Content-Type:** `multipart/form-data`
- **Parameters:**
  - `audio_file`: Binary file upload (WAV, FLAC, AIFF, MP3, OGG).
  - `interface_mode`: `"simple"` or `"advanced"`.
  - `genre`: `"indie_rock" | "electronic_club" | "hip_hop_trap" | "pop_vocal" | "acoustic_folk" | "cinematic_orchestral"`.
  - `mix_stage`: `"unmastered_mix" | "final_master"`.
  - `consent_state_json`: JSON string matching `ConsentState` schema (`audio_analysis_consent: true` required).
  - `user_notes` *(optional)*: String.
  - `plugin_chain_metadata_json` *(optional)*: JSON string.
- **Enforcement Rules:**
  - Hard file size cap: $\le 100$ MB (`104,857,600` bytes) $\to$ `HTTP 413 Payload Too Large`.
  - Supported format check: Must be WAV, FLAC, AIFF, MP3, or OGG $\to$ `HTTP 415 Unsupported Media Type`.
  - Channel check: $\le 2$ channels $\to$ `HTTP 422 Unprocessable Content` if $>2$.
  - Duration check: $0 < \text{duration} \le 600$s $\to$ `HTTP 422 Unprocessable Content`.
  - Consent check: `audio_analysis_consent == true` $\to$ `HTTP 403 Forbidden` if missing or false.
- **Response:** Canonical `AudioMixAnalysisReport` v2.0.0 JSON with `is_demonstration_data: false`.

#### 2. `GET /health` & `GET /api/v1/health`
- **Response:**
  ```json
  {
    "status": "ok",
    "service": "mixlearn-studio-api",
    "phase": 2,
    "mode": "mathematical_dsp_active",
    "is_demonstration_mode": false,
    "active_contract_version": "2.0.0",
    "timestamp": "..."
  }
  ```

#### 3. `GET /api/v1/capabilities`
- Reports capability matrix with `dsp_core_measurements: "IMPLEMENTED"`.

#### 4. `GET /api/v1/demo/report` & `POST /api/v1/analyze/demo`
- Preserved Phase 1 demonstration endpoints for offline and fallback testing (`is_demonstration_data: true`).

### Guarded / Future Phase Endpoints

- `POST /api/v1/analyze/stems` (Phase 4): Returns `HTTP 422` if `stem_source_type != "user_uploaded_original"` (Rule 1). Returns `HTTP 501 Not Implemented` for valid stem requests.
- `POST /api/v1/compare/reference` (Phase 3): Returns `HTTP 501 Not Implemented`.
- `POST /api/v1/simulate/streaming` (Phase 3): Returns `HTTP 501 Not Implemented`.
- `POST /api/v1/simulate/devices` (Phase 4): Returns `HTTP 501 Not Implemented`.
- `POST /api/v1/compare/revision` (Phase 5): Returns `HTTP 501 Not Implemented`.
- `POST /api/v1/interpret/ai` (Phase 5): Returns `HTTP 403` if unconsented, otherwise `HTTP 501 Not Implemented`.

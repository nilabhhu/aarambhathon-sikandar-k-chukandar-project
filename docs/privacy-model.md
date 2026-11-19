# MixLearn Studio — Privacy, Consent & Ephemeral Data Model

## 1. Core Privacy Commitments

MixLearn Studio was architected from Day 1 around the principle that **an artist's unreleased music is confidential intellectual property**.

### Three Immutable Privacy Invariants:
1. **No Silent Uploads:** Audio processing is triggered only upon user upload and explicit consent.
2. **Granular, Independent Permissions (Rule 4):** Audio analysis, AI numerical metric transfer, AI audio inspection, raw audio external transfer, and model training are governed by distinct permissions that cannot be bundled together.
3. **No Automatic Model Training (Rule 5):** `model_training_opt_in` defaults to `false`. MixLearn Studio has no automated training pipelines anywhere across Phases 1 through 6.
4. **Zero External AI Calls in Phase 2:** The Phase 2 mathematical DSP pipeline executes entirely on-box with FFmpeg, pyloudnorm, and SciPy. Zero audio bytes and zero measurements are transmitted to any external AI service or third-party cloud.

---

## 2. The Five-Tier Consent Architecture

| Permission Key | Default State | Technical Enforcement Boundary | User Impact When Revoked |
| :--- | :--- | :--- | :--- |
| `audio_analysis_consent` | `true` (explicitly toggleable) | Enforced before file decoding, metadata extraction, or DSP execution (`POST /api/v1/analyze/dsp`). | Analysis is blocked immediately with `HTTP 403 Forbidden`. Report findings and waveforms are suppressed. |
| `external_ai_transfer_consent` / `ai_numerical_metrics_transfer_consent` | `false` (opt-in required) | Enforced before transmitting any structured DSP measurements to external AI (`/api/v1/interpret/ai`). | Endpoint returns `HTTP 403 Forbidden`. Only local deterministic DSP guidance is shown. |
| `ai_audio_content_inspection_consent` | `false` (opt-in required) | Enforced before allowing external AI services to inspect audio files or spectrograms. | AI is strictly restricted to reviewing sanitized numerical measurements. |
| `raw_audio_transfer_consent` | `false` (opt-in required) | Enforced before any audio file or waveform data can leave the user's host/ephemeral server boundary. | Raw audio bytes are strictly confined to local ephemeral processing and never transmitted off-box. |
| `model_training_opt_in` | `false` (permanent default) | Enforced across all storage and processing scripts. | Audio data and derived metrics are never queued or used for model fine-tuning. |

---

## 3. Truthful Ephemeral Processing vs. False "Zero Retention" Claims

Many web services make dubious marketing claims of "Zero Data Retention" while secretly caching files in reverse proxies, logging payloads to cloud datastores, or accumulating files in `/tmp`.

MixLearn Studio provides an honest, verifiable ephemeral lifecycle:
- **Temporary Ingestion:** When an audio file is uploaded to `POST /api/v1/analyze/dsp`, it is streamed in 64 KB chunks to an isolated operating system temporary directory (`/tmp/mixlearn-<uuid>` on Unix, `%TEMP%\mixlearn-<uuid>` on Windows) managed by `EphemeralAudioWorkspace`.
- **Incremental Verification:** SHA-256 hash and byte length are computed incrementally in memory while streaming. If the file exceeds 100 MB (`104,857,600` bytes), ingestion terminates immediately and returns `HTTP 413 Payload Too Large`.
- **Execution Lifecycle:** The temporary directory exists solely for the duration of the synchronous DSP analysis request.
- **Context-Managed Auto-Purge:** The directory is wrapped in a Python context manager (`EphemeralAudioWorkspace`) that executes `shutil.rmtree(temp_dir, ignore_errors=True)` in a guaranteed `finally` block before the HTTP response is returned.
- **Zero Disk Residue:** Unit tests in `backend/tests/test_dsp_endpoint.py` explicitly verify that the temporary directory is completely deleted and no orphaned files remain on disk after every analysis run.
- **Stateless Responses:** No audio files or derived reports are stored in a database, S3 bucket, or persistent volume.

---

## 4. Forward-Compatible AI Data Transfer Boundary (Rule 2 & Rule 4)

In Phase 5, users may optionally consent to AI educational coaching powered by the Gemini API.

When `external_ai_transfer_consent: true` (or `ai_numerical_metrics_transfer_consent: true`):
1. **Raw Audio Is NOT Sent:** The system does not transmit raw audio waveforms to external AI APIs unless separate, explicit `raw_audio_transfer_consent` is granted.
2. **Only Sanitized Structured Numbers Are Transmitted:** The helper function `buildConsentGatedAiPayload()` extracts only:
   - Genre and mix stage context.
   - The 15 objective numerical DSP measurements (with units).
   - Detected issue timecodes and evidence summaries.
3. **AI Cannot Override Math (Rule 2):** The Gemini API is used solely for educational explanations (e.g., suggesting a 2.5 dB dip at 280 Hz to clear guitar mud). The AI model is strictly prohibited from inventing, altering, or recalculating any numerical DSP measurement.
4. **Separate Audio Content Inspection Consent:** Even when numerical metric transfer is authorized, audio content inspection by AI remains blocked unless `ai_audio_content_inspection_consent: true`.

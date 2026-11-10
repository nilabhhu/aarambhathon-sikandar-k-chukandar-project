# MixLearn Studio — Privacy, Consent & Ephemeral Data Model

## 1. Core Privacy Commitments

MixLearn Studio was architected from Day 1 around the principle that **an artist's unreleased music is confidential intellectual property**.

### Three Immutable Privacy Invariants:
1. **No Silent Uploads:** Merely viewing the Phase 1 demonstration transmits zero bytes of audio to any server.
2. **Three Granular, Independent Permissions (Rule 4):** Audio analysis, external AI coaching, and model training are governed by distinct permissions that cannot be bundled together.
3. **No Automatic Model Training (Rule 5):** `model_training_opt_in` defaults to `false`. MixLearn Studio has no automated training pipelines anywhere across Phases 1 through 6.

---

## 2. The Three-Tier Consent Architecture

| Permission Key | Default State | Technical Enforcement Boundary | User Impact When Revoked |
| :--- | :--- | :--- | :--- |
| `audio_analysis_consent` | `true` (explicitly toggleable) | Enforced before file decoding, metadata extraction, or DSP execution. | Analysis is blocked immediately. Report findings and waveforms are suppressed. |
| `external_ai_transfer_consent` | `false` (opt-in required) | Enforced before invoking any external AI API (`/api/v1/interpret/ai`). | Endpoint returns `HTTP 403 Forbidden`. Only local deterministic DSP guidance is shown. |
| `model_training_opt_in` | `false` (permanent default) | Enforced across all storage and processing scripts. | Audio data and derived metrics are never queued for model fine-tuning. |

---

## 3. Truthful Ephemeral Processing vs. False "Zero Retention" Claims

Many web services make dubious marketing claims of "Zero Data Retention" while secretly caching files in reverse proxies, logging payloads to cloud datastores, or accumulating files in `/tmp`.

MixLearn Studio provides an honest, verifiable ephemeral lifecycle:
- **Temporary Ingestion:** When an audio file is processed for DSP analysis, it is written to an ephemeral isolated operating system temporary directory (`/tmp/mixlearn-<uuid>` on Unix, `%TEMP%\mixlearn-<uuid>` on Windows).
- **Execution Lifecycle:** The temporary directory exists solely for the duration of the HTTP request.
- **Context-Managed Deletion:** The directory is wrapped in a Python context manager (`EphemeralAudioWorkspace`) that executes `shutil.rmtree(temp_dir, ignore_errors=True)` in a guaranteed `finally` block before the HTTP response is returned.
- **Stateless Responses:** No audio files or derived reports are stored in a database, S3 bucket, or persistent volume.

---

## 4. External AI Data Transfer Boundary (Rule 2 & Rule 4)

In Phase 5, users may optionally consent to AI educational coaching powered by the Gemini API.

When `external_ai_transfer_consent: true`:
1. **Raw Audio Is NOT Sent:** The system does not transmit raw audio waveforms to external AI APIs.
2. **Only Sanitized Structured Numbers Are Transmitted:** The helper function `buildConsentGatedAiPayload()` extracts only:
   - Genre and mix stage context.
   - The 14 objective numerical DSP measurements (with units).
   - Detected issue timecodes and evidence summaries.
3. **AI Cannot Override Math (Rule 2):** The Gemini API is used solely for educational explanations (e.g., suggesting a 2.5 dB dip at 280 Hz to clear guitar mud). The AI model is strictly prohibited from inventing, altering, or recalculating any numerical DSP measurement.

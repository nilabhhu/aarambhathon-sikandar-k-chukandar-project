# MixLearn Studio — System Architecture Specification (Phase 1 Foundation)

## 1. Architectural Philosophy & Mission

MixLearn Studio is built on a fundamental educational motto:
> **"Learn mixing and mastering by doing mixing and mastering, and receive meaningful insights through AI."**

The platform is designed to demystify audio engineering for independent producers and musicians by coupling deterministic, mathematically verifiable digital signal processing (DSP) with contextual educational coaching.

```mermaid
flowchart TD
    subgraph Browser Client [Browser Client: React 19 + TypeScript + Tailwind CSS]
        CG[Three-Tier Consent Gate<br/>Analysis=ON, AI=OFF, Training=OFF]
        SM[/simple: Simple Mix Check<br/>4-Step Beginner Action Plan]
        AM[/advanced: Advanced Mix Check<br/>14 DSP Metrics + Waveform]
        WI[Waveform Inspector<br/>Peak/RMS + Stereo/Mono Sum]
    end

    subgraph Backend API [FastAPI Backend: Python 3.12+]
        H[Health & Capabilities<br/>/api/v1/capabilities]
        CR[Canonical Contract Schema<br/>analysis_report.schema.json]
        DF[Phase 1 Demo Engine<br/>is_demonstration_data=true]
        DSP[Phase 2 Mathematical DSP<br/>FFmpeg + pyloudnorm + SciPy<br/>HTTP 501 in Phase 1]
        ST[Phase 4 Genuine Stems<br/>Rule 1 Guard: 422 if AI]
        AI[Phase 5 Consent-Gated AI<br/>Gemini API Coaching<br/>Rule 4 Guard: 403 if Unconsented]
        EW[(Ephemeral Temp Workspace<br/>Auto-purged in finally block)]
    end

    Browser Client -->|Multipart Audio + Consent State| Backend API
    Backend API -->|Canonical AudioMixAnalysisReport JSON| Browser Client
```

---

## 2. Shared Engine, Dual-Interface Architecture

Both interfaces consume the exact same canonical `AudioMixAnalysisReport` contract (`contracts/analysis_report.schema.json`):

1. **Simple Mix Check (`/simple`) — For Beginners & Songwriters:**
   - **Inputs:** Genre, Production Stage (`unmastered_mix` or `final_master`), and stereo audio bounce.
   - **Presentation:** Suppresses intimidating spectral graphs and dense DSP jargon. Delivers a prioritized, plain-language action checklist and 4-step learning cards:
     1. *What was detected* (plain-English description of the sound and timestamp).
     2. *Why it matters* (impact on real-world speaker translation or streaming playback).
     3. *What to try* (concrete fader, EQ, limiter, or width adjustment in the user's DAW).
     4. *How to verify* (what to listen for and target status on re-export).
   - **Rule 8 Enforcement:** Even in Simple Mode, Objective Technical Defects (clipping, insufficient headroom, phase cancellation) are visually and structurally isolated from Optional Stylistic Suggestions.

2. **Advanced Mix Check (`/advanced`) — For Intermediate Engineers:**
   - **Inputs:** Genre, Production Stage, Primary Stereo Bounce, Optional Genuine Original Stems (Phase 4), Plugin-Chain Metadata, and 3-Tier Consent.
   - **Presentation:**
     - 14 Standardized Mathematical DSP Metrics across 5 domains (Loudness, Peaks, Dynamics, Frequency, Stereo).
     - Functional SVG peak/RMS waveform with clickable timestamp region isolation.
     - Stereo vs. Mono Sum (`L+R`) audition toggle.
     - Dual-column diagnostic split: `objective_technical` warnings vs. `subjective_stylistic` observations.
     - Original User-Uploaded Stem Validator (Rule 1 enforcement).
     - Reserved forward-compatible slots for Phase 3–5 capabilities with explicit user disclosures.

---

## 3. Seamless Phase 2 DSP Replacement (Zero Frontend Rewrite)

In Phase 1, all responses carry `is_demonstration_data: true` and metrics have `source: "phase1_demo_fixture"`.

When Phase 2 begins:
- The backend replaces the deterministic fixture generator in `/api/v1/analyze/demo` with the real signal analysis pipeline in `/api/v1/analyze/dsp`.
- The real DSP pipeline computes:
  - Integrated Loudness, Short-Term Max, and Momentary Max via `pyloudnorm` / `libebur128`.
  - True Peak via 4x oversampled sinc interpolation (`scipy.signal.resample_poly`).
  - Frequency band power distributions via Welch Power Spectral Density (`scipy.signal.welch`).
  - Stereo phase correlation via windowed Pearson correlation coefficients (`numpy.corrcoef`).
- The backend outputs the **identical** `AudioMixAnalysisReport` schema, simply switching:
  - `is_demonstration_data: false`
  - `measurements.<key>.source: "mathematical_dsp"`
- **Result:** The frontend requires **zero component rewrites, zero interface changes, and zero schema migrations** to transition from Phase 1 to Phase 2.

---

## 4. Strict Exclusion of AI Stem Separation (Rule 1)

MixLearn Studio strictly forbids AI stem separation, automatic demixing, or pseudo-stem generation.

### Why AI Stem Splitting Is Permanently Prohibited:
1. **Phase Cancellation Artifacts:** Current neural stem separation models (Demucs, Spleeter, etc.) introduce time-frequency smearing, phase non-linearities, and spectral filtering artifacts.
2. **False Measurement Data:** Running mathematical phase correlation or dynamic masking analysis on AI-separated stems measures algorithmic artifacts rather than the producer's actual mix balance.
3. **Engineering Integrity:** Educational feedback must be based on genuine audio stems exported directly from the user's DAW.

Any stem upload with `stem_source_type != "user_uploaded_original"` is rejected at the API boundary with `HTTP 422 Unprocessable Content`.

---

## 5. Ephemeral Infrastructure & Privacy Boundary (Rule 9)

MixLearn Studio embraces lean, zero-unnecessary-infrastructure engineering:
- **No Database:** Reports are stateless and generated dynamically on request.
- **No Authentication Wall:** No accounts or email sign-ups required to learn.
- **No Persistent Cloud Audio Storage:** Uploaded files exist solely in an ephemeral local temporary directory (`/tmp/mixlearn-<uuid>` or OS temp directory) during DSP processing.
- **Auto-Purge Guarantee:** Temporary processing directories are wrapped in context managers with automatic recursive deletion in `finally` blocks.

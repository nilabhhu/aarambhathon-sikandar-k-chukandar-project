# MixLearn Studio — System Architecture Specification (Phase 1 Foundation)

## 1. Architectural Philosophy & Mission

MixLearn Studio is built on a fundamental educational motto:
> **"Learn mixing and mastering by doing mixing and mastering, and receive meaningful insights through AI."**

The platform is designed to demystify audio engineering for independent producers and musicians by coupling deterministic, mathematically verifiable digital signal processing (DSP) with contextual educational coaching.

```mermaid
flowchart TD
    subgraph Browser Client [Browser Client: React 19 + TypeScript + Tailwind CSS]
        CG[Five-Tier Consent Gate<br/>Analysis=ON, AI Metrics=OFF, Audio Inspect=OFF, Raw Audio=OFF, Training=OFF]
        SM[/simple: Simple Mix Check<br/>4-Step Beginner Action Plan]
        AM[/advanced: Advanced Mix Check<br/>14 DSP Metrics + Waveform]
        WI[Waveform Inspector<br/>Synthetic Visual Simulation<br/>Notice: No Phase 1 Audio Playback]
        APIS[apiService.ts<br/>Relative API URLs + Vite Proxy]
    end

    subgraph Backend API [FastAPI Backend: Python 3.12+]
        H[Health & Capabilities<br/>/api/v1/capabilities]
        CR[Canonical Contract Schema<br/>analysis_report.schema.json]
        DF[Phase 1 Demo Engine<br/>POST /api/v1/analyze/demo<br/>is_demonstration_data=true]
        DSP[Phase 2 Mathematical DSP<br/>FFmpeg + pyloudnorm + SciPy<br/>HTTP 501 in Phase 1]
        ST[Phase 4 Genuine Stems<br/>Rule 1 Guard: 422 if AI]
        AI[Phase 5 Consent-Gated AI<br/>Gemini API Coaching<br/>Rule 4 Guard: 403 if Unconsented]
        EW[(Ephemeral Temp Workspace<br/>Auto-purged in finally block)]
    end

    Browser Client -->|Relative /api/v1/analyze/demo Request| Backend API
    Backend API -->|Canonical AudioMixAnalysisReport JSON| Browser Client
    Browser Client -.->|Fallback if Backend Unreachable| OFFLINE[(Offline Local Fixture Generator)]
```

---

## 2. Frontend / Backend Communication & API Routing Architecture

### Development Environment (Vite Proxy)
In local development, the browser client makes requests to relative paths (e.g., `/api/v1/health`, `/api/v1/analyze/demo`).
The Vite development server (port 3000) automatically proxies these requests to the local FastAPI backend (port 8000) via `vite.config.ts`:
```ts
server: {
  port: 3000,
  proxy: {
    '/api': {
      target: 'http://127.0.0.1:8000',
      changeOrigin: true,
    },
    '/health': {
      target: 'http://127.0.0.1:8000',
      changeOrigin: true,
    },
  },
}
```
This guarantees zero hardcoded `127.0.0.1` addresses in browser client code and prevents CORS conflicts.

### Production Routing Configuration
In production environments, API routing is handled via either of two supported configurations:
1. **Unified Origin Reverse Proxy (Recommended):** An ingress controller or reverse proxy (Nginx, Caddy, Cloud Run Service, or AWS CloudFront/ALB) routes `/api/*` and `/health` to the FastAPI container and `/` to static Vite assets. All frontend calls use relative URLs without additional configuration.
2. **Dedicated API Domain (`VITE_API_BASE_URL`):** If frontend and backend are hosted on distinct hostnames (e.g., `https://app.mixlearn.studio` and `https://api.mixlearn.studio`), set `VITE_API_BASE_URL=https://api.mixlearn.studio` at build time. The helper `buildApiUrl()` in `src/services/apiService.ts` automatically prepends this base URL.

---

## 3. Actual Backend Report Integration & Offline Demonstration Fallback

The client application actively synchronizes with the backend:
- **Active Backend Consumption:** Whenever genre, production stage, file metadata, or consent changes, `fetchAnalysisReport()` issues a `POST /api/v1/analyze/demo` request. The backend returns a canonical `AudioMixAnalysisReport` fixture matching the requested context.
- **Contract Validation:** The frontend validates incoming payloads against `validatePhase1AnalysisReport()` before rendering.
- **Graceful Offline Fallback:** If the backend is offline, unreachable, or returns an invalid payload, the client automatically falls back to `generatePhase1DemoReport()` without crashing or stalling.
- **Transparent Provenance Badges:** Both Simple and Advanced views prominently display the data source:
  - `[DEMONSTRATION DATA · PHASE 1 FASTAPI BACKEND FIXTURE]` when connected to the backend API.
  - `[DEMONSTRATION DATA · PHASE 1 OFFLINE LOCAL FIXTURE]` when operating in offline client mode.
  - In all cases, demonstration data is explicitly disclosed and never misrepresented as genuine audio analysis.

---

## 4. Synthetic Visual Demonstration & Audio Auditioning Boundaries

In Phase 1:
- The `WaveformInspector` displays a **synthetic visualization** generated from an algorithmic envelope curve.
- It is explicitly labeled: `SYNTHETIC DEMO ENVELOPE (PHASE 1 VISUALIZATION)`.
- The Stereo vs. Mono toggle is labeled as `Simulated Visual Curve: Mono Sum Dip` vs. `Simulated Visual Curve: Stereo Profile`.
- The UI explicitly clarifies that **no audio playback engine, Web Audio decoding, or audio auditioning is active in Phase 1**.
- Real stereo playback, mono fold-down auditioning, and true peak/RMS waveform extraction are scheduled for Phase 2+.

---

## 5. Shared Engine, Dual-Interface Architecture

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
   - **Inputs:** Genre, Production Stage, Primary Stereo Bounce, Optional Genuine Original Stems (Phase 4), Plugin-Chain Metadata, and 5-Tier Consent.
   - **Presentation:**
     - 14 Standardized Mathematical DSP Metrics across 5 domains (Loudness, Peaks, Dynamics, Frequency, Stereo).
     - Functional SVG peak/RMS synthetic waveform with clickable timestamp region isolation.
     - Simulated stereo vs. mono curve toggle.
     - Dual-column diagnostic split: `objective_technical` warnings vs. `subjective_stylistic` observations.
     - Original User-Uploaded Stem Validator (Rule 1 enforcement).
     - Reserved forward-compatible slots for Phase 3–5 capabilities with explicit user disclosures.

---

## 6. Seamless Phase 2 DSP Replacement (Zero Frontend Rewrite)

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

## 7. Strict Exclusion of AI Stem Separation (Rule 1)

MixLearn Studio strictly forbids AI stem separation, automatic demixing, or pseudo-stem generation.

### Why AI Stem Splitting Is Permanently Prohibited:
1. **Phase Cancellation Artifacts:** Current neural stem separation models introduce time-frequency smearing, phase non-linearities, and spectral filtering artifacts.
2. **False Measurement Data:** Running mathematical phase correlation or dynamic masking analysis on AI-separated stems measures algorithmic artifacts rather than the producer's actual mix balance.
3. **Engineering Integrity:** Educational feedback must be based on genuine audio stems exported directly from the user's DAW.

Any stem upload with `stem_source_type != "user_uploaded_original"` is rejected at the API boundary with `HTTP 422 Unprocessable Content`.

---

## 8. Ephemeral Infrastructure & Privacy Boundary (Rule 9)

MixLearn Studio embraces lean, zero-unnecessary-infrastructure engineering:
- **No Database:** Reports are stateless and generated dynamically on request.
- **No Authentication Wall:** No accounts or email sign-ups required to learn.
- **No Persistent Cloud Audio Storage:** Uploaded files exist solely in an ephemeral local temporary directory during DSP processing.
- **Auto-Purge Guarantee:** Temporary processing directories are wrapped in context managers with automatic recursive deletion in `finally` blocks.

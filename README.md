# MixLearn Studio — Phase 2 Real Mathematical DSP Engine & Audio Engineering Platform

> **Project Motto:** *Learn mixing and mastering by doing mixing and mastering, and receive meaningful insights through AI.*

MixLearn Studio is a privacy-first educational audio engineering web platform that bridges the gap between raw DSP meter readouts and concrete musical adjustments in your digital audio workstation (DAW).

---

## What's New in Phase 2

Phase 2 transitions MixLearn Studio from Phase 1 demonstration fixtures to an **authentic, deterministic, mathematical DSP analysis engine**:
- **Real Audio File Analysis (`POST /api/v1/analyze/dsp`):** Upload your own mixes or masters (up to 100 MB, 10 minutes) and receive genuine, mathematically calculated measurements in seconds.
- **Supported Formats:** Uncompressed WAV (16/24/32-bit PCM integer and 32-bit float), FLAC, AIFF, MP3, and OGG Vorbis.
- **Rigorous Signal Processing Engine:**
  - **EBU R128 Loudness:** Integrated LUFS, Loudness Range (LRA), Momentary Max (400ms), Short-Term Max (3s), and 4x oversampled True Peak (dBTP) via FFmpeg `ebur128` filter and `pyloudnorm.Meter`.
  - **Waveform & Peak Analysis:** Contiguous clipping detection ($\ge 3$ consecutive samples $\ge 0.9999$), Sample Peak Max (dBFS), Global RMS (dBFS), and dynamic Crest Factor (dB) via chunked `soundfile.blocks`.
  - **Stereo Field Analysis:** Silence-gated Pearson stereo phase correlation (400ms windows gated at $-60$ dBFS) and orthonormal Mid/Side stereo width index ($0..100\%$).
  - **Spectral Distribution:** Per-channel Welch Power Spectral Density (`scipy.signal.welch`, Hann window, $n_{\text{perseg}}=8192$, 50% overlap) across Sub-Bass (20–60 Hz), Low-Mid / Mud (200–500 Hz), Presence (2–5 kHz), and High Air (10–20 kHz) with Nyquist guards.
  - **Waveform Envelope:** Up to 240 uniform timeline buckets for high-fidelity interactive SVG waveform rendering.
- **Canonical Schema Migration (1.0.0 → 2.0.0):** Nullable values for edge cases (e.g., mono files, high-frequency bands above Nyquist), detailed DSP algorithm attribution, unavailable reasons, and timeline series.
- **Dual-Interface Consumption:** Both Simple Mix Check (beginner 4-step action plans) and Advanced Mix Check (15 DSP metrics, SVG waveform timeline, and diagnostic split) consume the identical real DSP report.
- **Ephemeral Audio Lifecycle:** Uploaded files are written to isolated temporary directories (`EphemeralAudioWorkspace`) and permanently deleted in a guaranteed `finally` block upon request completion. Zero persistent storage; zero external AI transmission.

---

## Ten Non-Negotiable Product & Architectural Rules

1. **Rule 1 (No AI Stem Separation):** Never use AI stem separation or pseudo-stems. Analyze stems only when the user uploads genuine original multitracks. AI stem splitting requests are rejected with `HTTP 422`.
2. **Rule 2 (DSP Source of Truth):** Mathematical DSP measurements are the sole source of objective values. AI must never invent or override measurements.
3. **Rule 3 (Technical Integrity):** Artistic preferences may guide creative advice but never hide measurable technical issues.
4. **Rule 4 (Granular Consent Dimensions):** Audio analysis, AI numerical metric transfer, AI audio content inspection, raw audio external transfer, and model training require separate explicit permissions.
5. **Rule 5 (Zero Default Training):** Default is `model_training_opt_in: false`. Automatic training on user audio is strictly prohibited across all phases.
6. **Rule 6 (Honest Device Simulation):** Playback-device translation previews are presented strictly as linear filter approximations, not hardware replicas (Phase 4).
7. **Rule 7 (Honest Streaming Estimates):** Streaming loudness predictions are presented as estimates based on documented playback modes (Phase 3).
8. **Rule 8 (Objective vs. Stylistic Split):** Objective technical warnings (clipping, headroom overs, phase cancellation) are strictly separated from stylistic observations (spectral balance, loudness targets).
9. **Rule 9 (Lean Ephemeral Infrastructure):** Zero unnecessary databases, auth walls, or cloud queues. Temporary files are auto-purged immediately.
10. **Rule 10 (Maintainable & Testable):** Deterministic unit and integration tests validate every contract boundary and DSP algorithm.

---

## System Requirements & Prerequisites

- **Node.js**: v20+ or v22+ (`node -v`)
- **npm**: v10+ (`npm -v`)
- **Python**: v3.12+ (`python --version`)
- **FFmpeg & FFprobe**: Required for media decoding, probing, and EBU R128 loudness analysis:
  - **Windows:** `winget install Gyan.FFmpeg` (or download from [gyan.dev](https://www.gyan.dev/ffmpeg/builds/))
  - **macOS:** `brew install ffmpeg`
  - **Linux (Ubuntu/Debian):** `sudo apt update && sudo apt install -y ffmpeg`

---

## Quickstart Guide

### Step 1: Install Frontend Dependencies
```powershell
npm ci
```

### Step 2: Set Up Python Backend Virtual Environment
```powershell
# Create dedicated virtual environment
python -m venv backend\.venv

# Install backend dependencies
.\backend\.venv\Scripts\pip install -r backend\requirements.txt
```

### Step 3: Start the Backend API (FastAPI)
In a dedicated terminal:
```powershell
.\backend\.venv\Scripts\uvicorn backend.app.main:app --reload --port 8000
```
- API Health: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)
- API Docs (Swagger): [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- Capabilities Matrix: [http://127.0.0.1:8000/api/v1/capabilities](http://127.0.0.1:8000/api/v1/capabilities)
- Phase 1 Demo Report Fallback: [http://127.0.0.1:8000/api/v1/demo/report](http://127.0.0.1:8000/api/v1/demo/report)

### Step 4: Start the Frontend Application (Vite / React)
In a separate terminal:
```powershell
npm run dev
```
Open your browser to: [http://localhost:3000](http://localhost:3000)

**API Proxy:** In development, Vite automatically proxies `/api` and `/health` requests to `http://127.0.0.1:8000`.

---

## Verification & Testing Commands

To run all automated contract, schema, DSP, and backend boundary tests with a single command:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\validate_contracts.ps1
```

Or execute individual test suites:

### 1. Frontend Typecheck & Lint
```powershell
npm run lint
```

### 2. Frontend Contract, Consent & Integration Unit Tests (Node / Vitest)
```powershell
npm test
```
*(Executes all tests in `src/contracts/analysisContract.test.ts` and `src/contracts/backendIntegration.test.ts`)*

### 3. Canonical JSON Schema v2.0.0 Verification
```powershell
node scripts/validate_schema.js
```

### 4. Backend Pytest Suite (DSP Engine, Fixtures & Endpoints)
```powershell
.\backend\.venv\Scripts\pytest backend\tests\
```
*(Runs 37 automated tests across `test_dsp_endpoint.py`, `test_dsp_validation.py`, and `test_phase1_contracts.py`)*

### 5. Frontend Production Bundle Build
```powershell
npm run build
```

### 6. Live Backend & Proxy Endpoint Verification
```powershell
npm run test:live
```
*(Uploads audio through the live proxy to `POST /api/v1/analyze/dsp` and verifies `is_demonstration_data: false`)*

### 7. Automated Headless Browser Acceptance Suite (Edge CDP)
```powershell
npm run test:browser
```
*(26 assertions verifying real UI behavior, waveform rendering, consent gate, and diagnostic cards)*

---

## Repository Structure

```
aarambhathon-sikandar-k-chukandar-project/
├── contracts/
│   ├── analysis_report.schema.json       # Canonical JSON Schema v2.0.0 (Draft 2020-12)
│   └── fixtures/
│       └── demo_report.json              # Canonical demonstration fixture v2.0.0
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                       # FastAPI application & boundary guards
│   │   └── dsp/                          # Core Phase 2 Mathematical DSP Package
│   │       ├── __init__.py
│   │       ├── media_probe.py            # Stream ingestion, SHA-256, ffprobe, ffmpeg
│   │       ├── loudness.py               # EBU R128 LUFS, True Peak, LRA, pyloudnorm
│   │       ├── waveform_metrics.py       # Peak, RMS, clipping runs, phase corr, timeline
│   │       ├── spectral.py               # Welch PSD, 4 band powers, Nyquist guards
│   │       ├── diagnostics.py            # Rule 8 diagnostic engine & 4-step cards
│   │       └── pipeline.py               # Ephemeral workspace orchestrator & sanitization
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── test_dsp_endpoint.py          # 18 test fixtures and edge cases
│   │   ├── test_dsp_validation.py        # Numerical tolerance assertions
│   │   ├── test_phase1_contracts.py      # Contract boundary and rule guard tests
│   │   └── fixtures_generator.py         # Deterministic synthetic audio generator
│   ├── .venv/                            # Local Python virtual environment
│   ├── requirements.txt                  # Locked Python dependencies (numpy, scipy, pyloudnorm)
│   └── .env.example                      # Safe backend environment template
├── src/                                  # Frontend source (React 19 + TypeScript + Vite)
│   ├── contracts/
│   │   ├── analysisContract.ts           # Schema v2.0.0 TypeScript interfaces & validators
│   │   ├── demoFixtures.ts               # Labeled demonstration fixtures v2.0.0
│   │   ├── analysisContract.test.ts      # Unit tests for v2.0.0 contracts & pure validators
│   │   └── backendIntegration.test.ts   # Integration tests for live DSP & demo fallback
│   ├── services/
│   │   └── apiService.ts                 # API client with analyzeAudioWithDsp()
│   ├── components/
│   │   ├── ConsentGatePanel.tsx          # 5-tier granular privacy & permission gate
│   │   ├── WaveformInspector.tsx         # Real DSP timeline SVG rendering & demo notices
│   │   ├── SimpleMixCheckView.tsx        # Beginner 4-step learning interface
│   │   ├── AdvancedMixCheckView.tsx      # Intermediate DSP table, waveform & stem guard
│   │   └── ArchitectureHandoffView.tsx   # Contract, schema & endpoint probe view
│   ├── App.tsx                           # Application shell & real file upload handler
│   ├── main.tsx                          # React 19 entry point
│   └── index.css                         # Light-first design tokens & dark variant
├── docs/
│   ├── architecture.md                   # Full Phase 2 system architecture specification
│   ├── product-spec.md                   # Complete product specification & learning loop
│   ├── design-system.md                  # Design tokens, typography & WCAG AA rules
│   ├── privacy-model.md                  # Ephemeral data handling & 5-tier consent model
│   ├── api-contracts.md                  # API endpoints & JSON Schema v2.0.0 reference
│   ├── phase-gates.md                    # Six-phase roadmap & Phase 2 verification gate
│   ├── PHASE_2_DSP_ARCHITECTURE.md       # Comprehensive mathematical DSP specification
│   └── PHASE_1_ARCHITECTURE_HANDOFF.md   # Architectural handoff document
├── scripts/
│   ├── validate_contracts.sh             # Linux/macOS automated test runner
│   ├── validate_contracts.ps1            # Windows PowerShell automated test runner
│   └── validate_schema.js                # Cross-platform JSON Schema integrity verifier
├── .github/workflows/
│   └── ci.yml                            # GitHub Actions CI (Node 22 + Python 3.12, npm ci)
├── package.json                          # Node dependencies and npm scripts
├── tsconfig.json                         # TypeScript configuration
└── vite.config.ts                        # Vite configuration with backend proxy
```

---

## License & Intellectual Property

MixLearn Studio is built under a strict educational and open-source foundation. All user-uploaded audio is processed ephemerally on-box and is never retained, trained on, or transmitted to external parties without explicit consent.

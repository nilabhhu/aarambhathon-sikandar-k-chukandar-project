# MixLearn Studio — Phase 1 Architectural Foundation

> **Project Motto:** *Learn mixing and mastering by doing mixing and mastering, and receive meaningful insights through AI.*

MixLearn Studio is a privacy-first educational audio engineering web platform that bridges the gap between raw DSP meter readouts and concrete musical adjustments in your digital audio workstation (DAW).

---

## Architecture Overview

MixLearn Studio utilizes a **Shared Engine, Dual-Interface Architecture** consuming a canonical JSON Schema (`contracts/analysis_report.schema.json`):

1. **Simple Mix Check (`/simple`) — For Beginners:**
   - Plain-language action cards.
   - 4-part learning cycle: *What was detected*, *Why it matters*, *What to try in your DAW*, and *How to verify*.
   - Separates Objective Technical Defects from Optional Stylistic Notes without overwhelming graphs.
2. **Advanced Mix Check (`/advanced`) — For Intermediate Engineers:**
   - 14 Standardized Mathematical DSP measurements across 5 core domains.
   - Synthetic SVG peak/RMS waveform envelope simulation with clickable timestamp region highlighting.
   - Simulated Stereo vs. Mono Sum curve toggle.
   - Genuine Original Stem Origin Validator (Rule 1: AI stem splitting strictly prohibited).
   - Forward-compatible capability panels for Phases 3–5 with required product disclosures.
3. **Phase 1 Architecture & Live API Probe (`/architecture`):**
   - Live schema validator.
   - Interactive live backend endpoint probe testing communication between browser and FastAPI.

---

## Ten Non-Negotiable Product & Architectural Rules

1. **Rule 1 (No AI Stem Separation):** Never use AI stem separation or pseudo-stems. Analyze stems only when the user uploads genuine original multitracks.
2. **Rule 2 (DSP Source of Truth):** Mathematical DSP measurements are the sole source of objective values. AI must never invent measurements.
3. **Rule 3 (Technical Integrity):** Artistic preferences may guide creative advice but never hide measurable technical issues.
4. **Rule 4 (Granular Consent Dimensions):** Audio analysis, AI numerical metric transfer, AI audio content inspection, raw audio external transfer, and model training require separate explicit permissions.
5. **Rule 5 (Zero Default Training):** Default is `model_training_opt_in: false`. Automatic training on user audio is prohibited.
6. **Rule 6 (Honest Device Simulation):** Playback-device translation previews are presented strictly as linear filter approximations, not hardware replicas.
7. **Rule 7 (Honest Streaming Estimates):** Streaming loudness predictions are presented as estimates based on documented playback modes.
8. **Rule 8 (Objective vs. Stylistic Split):** Objective technical warnings are strictly separated from stylistic notes.
9. **Rule 9 (Lean Phase 1 Infrastructure):** Zero unnecessary databases, auth walls, or cloud queues in Phase 1.
10. **Rule 10 (Maintainable & Testable):** Deterministic unit tests (`node:test` + `pytest`) validate every contract boundary.

---

## Quickstart Guide (Windows 11 / 10 / Linux / macOS)

### Prerequisites
- **Node.js**: v20+ or v22+ (`node -v`)
- **npm**: v10+ (`npm -v`)
- **Python**: v3.12+ (`python --version`)

---

### Step 1: Install Frontend Dependencies
```powershell
npm ci
```
*(Reproducible clean install matching `package-lock.json`)*

---

### Step 2: Set Up Python Backend Virtual Environment
```powershell
# Create dedicated virtual environment
python -m venv backend\.venv

# Install backend dependencies
.\backend\.venv\Scripts\pip install -r backend\requirements.txt
```

---

### Step 3: Start the Backend API (FastAPI)
In a dedicated PowerShell window:
```powershell
.\backend\.venv\Scripts\uvicorn backend.app.main:app --reload --port 8000
```
- API Health: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)
- API Docs (Swagger): [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- Capabilities Matrix: [http://127.0.0.1:8000/api/v1/capabilities](http://127.0.0.1:8000/api/v1/capabilities)
- Demonstration Report: [http://127.0.0.1:8000/api/v1/demo/report](http://127.0.0.1:8000/api/v1/demo/report)

---

### Step 4: Start the Frontend Application (Vite / React)
In a separate PowerShell window:
```powershell
npm run dev
```
Open your browser to: [http://localhost:3000](http://localhost:3000)

**API Connection Routing:**
- During local development, the Vite dev server automatically proxies requests targeting `/api` and `/health` to `http://127.0.0.1:8000`. Browser client code strictly issues requests to relative URLs (`/api/v1/...`).
- In production, either configure your reverse proxy (Nginx, Caddy, Cloud Run) to forward `/api/` to the FastAPI backend service, or set `VITE_API_BASE_URL=https://api.yourdomain.com` at build time.

---

## Verification & Testing Commands

To run all contract, schema, and backend boundary tests with a single command on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\validate_contracts.ps1
```

Or run individual test suites:

### 1. Frontend Typecheck
```powershell
npm run lint
```

### 2. Frontend Contract, Privacy & Integration Unit Tests (Node.js)
```powershell
npm test
```
*(Executes both `analysisContract.test.ts` and `backendIntegration.test.ts`)*

### 3. Canonical JSON Schema Verification
```powershell
node scripts/validate_schema.js
```

### 4. Backend Pytest Suite
```powershell
.\backend\.venv\Scripts\pytest backend\tests\test_phase1_contracts.py
```

### 5. Frontend Production Bundle Build
```powershell
npm run build
```

### 6. Live Backend & Proxy Endpoint Verification
```powershell
npm run test:live
```

### 7. Automated Headless Browser Acceptance Suite (Edge CDP)
```powershell
npm run test:browser
```

---

## Repository Structure

```
aarambhathon-sikandar-k-chukandar-project/
├── contracts/
│   ├── analysis_report.schema.json       # Canonical JSON Schema (Draft 2020-12)
│   └── fixtures/
│       └── demo_report.json              # Canonical demonstration fixture (5-tier consent)
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   └── main.py                       # FastAPI application & boundary guards
│   ├── tests/
│   │   ├── __init__.py
│   │   └── test_phase1_contracts.py      # Pytest suite verifying Rules 1, 4, 5 & 501s
│   ├── .venv/                            # Local Python virtual environment
│   ├── requirements.txt                  # Locked Python dependencies
│   └── .env.example                      # Safe backend environment template
├── src/                                  # Frontend source
│   ├── contracts/
│   │   ├── analysisContract.ts           # Shared TypeScript interfaces & pure validators
│   │   ├── demoFixtures.ts               # Labeled demonstration fixtures
│   │   ├── analysisContract.test.ts      # Deterministic node:test unit test suite
│   │   └── backendIntegration.test.ts   # Integration tests for health, demo & error fallback
│   ├── services/
│   │   └── apiService.ts                 # Relative URL builder, Vite proxy & backend client
│   ├── components/
│   │   ├── ConsentGatePanel.tsx          # 5-tier granular privacy & permission gate
│   │   ├── WaveformInspector.tsx         # Synthetic SVG waveform envelope & notices
│   │   ├── SimpleMixCheckView.tsx        # Beginner 4-step learning interface
│   │   ├── AdvancedMixCheckView.tsx      # Intermediate DSP table, stem guard & states
│   │   └── ArchitectureHandoffView.tsx   # Live contract & endpoint probe view
│   ├── App.tsx                           # Application shell & route controller
│   ├── main.tsx                          # React 19 entry point
│   └── index.css                         # Light-first design tokens & dark variant
├── docs/
│   ├── architecture.md                   # Full system architecture specification
│   ├── product-spec.md                   # Complete product specification & learning loop
│   ├── design-system.md                  # Design tokens, typography & WCAG AA rules
│   ├── privacy-model.md                  # Ephemeral data handling & 5-tier consent model
│   ├── api-contracts.md                  # API endpoints & JSON Schema reference
│   ├── phase-gates.md                    # Six-phase roadmap & strict Phase 2 gate
│   └── PHASE_1_ARCHITECTURE_HANDOFF.md   # Architectural handoff document
├── scripts/
│   ├── validate_contracts.sh             # Linux/macOS automated test runner
│   ├── validate_contracts.ps1            # Windows PowerShell automated test runner
│   └── validate_schema.js                # Cross-platform JSON Schema integrity verifier
├── .github/workflows/
│   └── ci.yml                            # GitHub Actions CI (Node 22 + Python 3.12, npm ci)
├── .env.example                          # Safe environment template
├── .gitignore                            # Comprehensive ignore rules
├── package.json                          # Node dependencies and npm scripts
├── tsconfig.json                         # TypeScript configuration
└── vite.config.ts                        # Vite configuration with backend proxy
```

---

## Troubleshooting Guide (Windows)

- **PowerShell Script Execution Policy:**
  If running `validate_contracts.ps1` gives an execution policy error, run:
  ```powershell
  Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
  ```
- **Port 8000 or 3000 Already in Use:**
  Check running listeners:
  ```powershell
  Get-NetTCPConnection -LocalPort 8000,3000 -ErrorAction SilentlyContinue
  ```
- **Virtual Environment Activation:**
  If you prefer activating the virtual environment in PowerShell:
  ```powershell
  .\backend\.venv\Scripts\Activate.ps1
  ```

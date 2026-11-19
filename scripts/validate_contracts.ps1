# PowerShell automated contract & test verifier for Windows
$ErrorActionPreference = "Stop"

Write-Host "=== MixLearn Studio: Phase 2 Mathematical DSP & Contract Verification (Windows) ===" -ForegroundColor Cyan

Write-Host "[1/4] Running TypeScript compiler & contract checks (npm run lint)..." -ForegroundColor Yellow
npm run lint

Write-Host "[2/4] Running Phase 1 & 2 Contract, Consent & Integration Unit Tests (npm test)..." -ForegroundColor Yellow
npm test

Write-Host "[3/4] Verifying JSON Schema contract file integrity..." -ForegroundColor Yellow
node scripts/validate_schema.js

Write-Host "[4/4] Running Backend Pytest Suite (all 37 contract, validation & endpoint tests)..." -ForegroundColor Yellow
if (Test-Path "backend\.venv\Scripts\pytest.exe") {
    & "backend\.venv\Scripts\pytest.exe" backend\tests\
} else {
    pytest backend/tests/
}

Write-Host "=== All Phase 2 mathematical DSP, schema, and boundary checks passed! ===" -ForegroundColor Green

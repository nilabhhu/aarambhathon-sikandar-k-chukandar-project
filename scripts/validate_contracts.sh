#!/usr/bin/env bash
set -euo pipefail

echo "=== MixLearn Studio: Phase 1 Contract & Boundary Verification ==="
echo "[1/4] Running TypeScript compiler & contract checks (npm run lint)..."
npm run lint

echo "[2/4] Running Phase 1 Contract, Consent & Rule Unit Tests (node:test)..."
npx --yes tsx --test src/contracts/analysisContract.test.ts

echo "[3/4] Verifying JSON Schema contract file integrity..."
node scripts/validate_schema.js

echo "[4/4] Running Backend Pytest Suite..."
if [ -d "backend/.venv" ]; then
  backend/.venv/bin/pytest backend/tests/test_phase1_contracts.py || backend/.venv/Scripts/pytest backend/tests/test_phase1_contracts.py
else
  pytest backend/tests/test_phase1_contracts.py
fi

echo "=== All Phase 1 contract, schema, and boundary checks passed! ==="

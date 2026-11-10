#!/usr/bin/env bash
set -euo pipefail

echo "=== MixLearn Studio: Phase 1 Contract & Boundary Verification ==="
echo "[1/3] Running TypeScript compiler & contract checks..."
npm run lint

echo "[2/3] Running Phase 1 Contract, Consent & Rule Unit Tests..."
npx --yes tsx --test src/contracts/analysisContract.test.ts

echo "[3/3] Verifying JSON Schema file integrity..."
node -e '
const fs = require("fs");
const schema = JSON.parse(fs.readFileSync("contracts/analysis_report.schema.json", "utf8"));
if (schema.properties.schema_version.const !== "1.0.0") throw new Error("Invalid schema_version");
if (schema.properties.consent_state.properties.model_training_opt_in.default !== false) {
  throw new Error("Rule 5 violation: model_training_opt_in default must be false");
}
if (schema.properties.capabilities.properties.ai_stem_separation.properties.status.const !== "PROHIBITED_BY_PRODUCT_RULE") {
  throw new Error("Rule 1 violation: ai_stem_separation must be PROHIBITED_BY_PRODUCT_RULE");
}
console.log("JSON Schema contract verified successfully.");
'
echo "=== All Phase 1 checks passed! ==="

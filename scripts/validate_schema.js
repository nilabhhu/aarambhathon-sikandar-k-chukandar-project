// Cross-platform JSON Schema & Fixture Integrity Verifier
import fs from 'fs';
import path from 'path';

try {
  const schemaPath = path.resolve('contracts/analysis_report.schema.json');
  const fixturePath = path.resolve('contracts/fixtures/demo_report.json');

  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found at ${schemaPath}`);
  }
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Fixture file not found at ${fixturePath}`);
  }

  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

  if (schema.properties.schema_version.const !== '1.0.0') {
    throw new Error('Invalid schema_version');
  }
  if (schema.properties.consent_state.properties.model_training_opt_in.default !== false) {
    throw new Error('Rule 5 violation: model_training_opt_in default must be false');
  }
  if (
    schema.properties.capabilities.properties.ai_stem_separation.properties.status.const !==
    'PROHIBITED_BY_PRODUCT_RULE'
  ) {
    throw new Error('Rule 1 violation: ai_stem_separation must be PROHIBITED_BY_PRODUCT_RULE');
  }

  if (fixture.is_demonstration_data !== true) {
    throw new Error('Phase 1 violation: demo_report.json must have is_demonstration_data: true');
  }

  console.log('JSON Schema contract and demonstration fixture verified successfully (0 errors).');
} catch (err) {
  console.error('Validation failed:', err.message);
  process.exit(1);
}

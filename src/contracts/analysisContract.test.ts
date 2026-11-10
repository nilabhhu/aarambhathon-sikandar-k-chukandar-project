import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildConsentGatedAiPayload,
  createDefaultConsentState,
  validateConsentForAction,
  validatePhase1AnalysisReport,
  validateStemSubmissions,
} from './analysisContract';
import { generatePhase1DemoReport } from './demoFixtures';

test('Rule 4 & 5: Default consent state sets model_training_opt_in=false and all external AI/audio transfer=false', () => {
  const defaultConsent = createDefaultConsentState();
  assert.equal(defaultConsent.audio_analysis_consent, true);
  assert.equal(defaultConsent.external_ai_transfer_consent, false);
  assert.equal(defaultConsent.ai_audio_content_inspection_consent, false);
  assert.equal(defaultConsent.raw_audio_transfer_consent, false);
  assert.equal(defaultConsent.model_training_opt_in, false);
});

test('Rule 4: Separate permissions enforced for local analysis, AI metrics, audio inspection, raw transfer & model training', () => {
  const baseConsent = {
    audio_analysis_consent: false,
    external_ai_transfer_consent: false,
    ai_audio_content_inspection_consent: false,
    raw_audio_transfer_consent: false,
    model_training_opt_in: false,
    consent_timestamp: '2026-11-10T10:00:00Z',
  };

  // Local analysis check
  const localRes = validateConsentForAction(baseConsent, 'local_analysis');
  assert.equal(localRes.valid, false);
  assert.ok(localRes.errors[0].includes('audio_analysis_consent'));

  // Granted local analysis only
  const localOnly = { ...baseConsent, audio_analysis_consent: true };
  assert.equal(validateConsentForAction(localOnly, 'local_analysis').valid, true);
  assert.equal(validateConsentForAction(localOnly, 'external_ai_interpretation').valid, false);
  assert.equal(validateConsentForAction(localOnly, 'ai_audio_inspection').valid, false);
  assert.equal(validateConsentForAction(localOnly, 'raw_audio_transfer').valid, false);
  assert.equal(validateConsentForAction(localOnly, 'model_training').valid, false);

  // External AI inspection check
  const aiInspectionConsent = { ...localOnly, ai_audio_content_inspection_consent: true };
  assert.equal(validateConsentForAction(aiInspectionConsent, 'ai_audio_inspection').valid, true);
  assert.equal(validateConsentForAction(aiInspectionConsent, 'raw_audio_transfer').valid, false);

  // Raw audio transfer check
  const rawTransferConsent = { ...localOnly, raw_audio_transfer_consent: true };
  assert.equal(validateConsentForAction(rawTransferConsent, 'raw_audio_transfer').valid, true);
});

test('Rule 1: AI stem separation and pseudo-stem generation are strictly rejected', () => {
  const validStems = validateStemSubmissions([
    { filename: 'drums_bus.wav', stem_role: 'drums', stem_source_type: 'user_uploaded_original' },
    { filename: 'lead_vox.wav', stem_role: 'vocals', stem_source_type: 'user_uploaded_original' },
  ]);
  assert.equal(validStems.valid, true);

  const invalidAiStems = validateStemSubmissions([
    { filename: 'demucs_vocals.wav', stem_role: 'vocals', stem_source_type: 'ai_separated' },
  ]);
  assert.equal(invalidAiStems.valid, false);
  assert.ok(invalidAiStems.errors[0].includes('Rule 1 Violation'));
});

test('Phase 1 Demo Report passes full contract validation and enforces Rule 2 & Rule 8', () => {
  const report = generatePhase1DemoReport({
    interface_mode: 'advanced',
    genre: 'indie_rock',
    mix_stage: 'unmastered_mix',
    consent_state: createDefaultConsentState(),
  });

  const validation = validatePhase1AnalysisReport(report);
  assert.equal(validation.valid, true, `Validation errors: ${validation.errors.join('; ')}`);
  assert.equal(report.is_demonstration_data, true);

  const objectiveIssues = report.issues.filter((i) => i.classification === 'objective_technical');
  const subjectiveIssues = report.issues.filter((i) => i.classification === 'subjective_stylistic');
  assert.ok(objectiveIssues.length >= 2, 'Expected at least 2 objective technical issues');
  assert.ok(subjectiveIssues.length >= 2, 'Expected at least 2 subjective stylistic issues');
});

test('Phase 1 Boundary: Report with is_demonstration_data=false is rejected in Phase 1', () => {
  const report = generatePhase1DemoReport({
    interface_mode: 'simple',
    genre: 'pop_vocal',
    mix_stage: 'final_master',
    consent_state: createDefaultConsentState(),
  });
  report.is_demonstration_data = false;

  const validation = validatePhase1AnalysisReport(report);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((e) => e.includes('is_demonstration_data MUST be true')));
});

test('Rule 2 & 4: AI payload builder blocks unconsented transfer and sends only structured DSP measurements when consented', () => {
  const reportBlocked = generatePhase1DemoReport({
    interface_mode: 'advanced',
    genre: 'electronic_club',
    mix_stage: 'final_master',
    consent_state: createDefaultConsentState(), // external_ai_transfer_consent = false
  });

  const blockedRes = buildConsentGatedAiPayload(reportBlocked);
  assert.equal(blockedRes.allowed, false);
  assert.equal(blockedRes.sanitizedPayload, null);

  const reportConsented = generatePhase1DemoReport({
    interface_mode: 'advanced',
    genre: 'electronic_club',
    mix_stage: 'final_master',
    consent_state: {
      ...createDefaultConsentState(),
      external_ai_transfer_consent: true,
    },
  });

  const allowedRes = buildConsentGatedAiPayload(reportConsented);
  assert.equal(allowedRes.allowed, true);
  assert.ok(allowedRes.sanitizedPayload !== null);
  assert.equal(allowedRes.sanitizedPayload?.objective_measurements.true_peak_max.unit, 'dBTP');
});

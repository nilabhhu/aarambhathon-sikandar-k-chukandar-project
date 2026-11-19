import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeterministicClientMentorResponse,
  buildSanitizedAiMentorRequest,
} from './phase5MentorLogic';
import { generatePhase1DemoReport } from '../contracts/demoFixtures';
import { createDefaultConsentState } from '../contracts/analysisContract';

describe('Phase 5 AI Mentor Sanitization & Deterministic Fallback Logic', () => {
  it('blocks external AI by default when Toggle A is OFF and transmits zero audio bytes', () => {
    const consent = createDefaultConsentState();
    const report = generatePhase1DemoReport({
      interface_mode: 'simple',
      genre: 'indie_rock',
      mix_stage: 'unmastered_mix',
      consent_state: consent,
    });

    const payload = buildSanitizedAiMentorRequest({
      report,
      genre: 'indie_rock',
      mixStage: 'unmastered_mix',
      interfaceMode: 'simple',
      artistVision: ['Punchy'],
      consent,
    });

    assert.equal(payload.allow_ai_interpretation, false);
    assert.equal(payload.allow_direct_audio_inspection, false);
    assert.equal(payload.allow_model_training, false);
    assert.equal('raw_audio' in payload, false);
    assert.equal('audio_bytes' in payload, false);
    assert.equal(payload.user_reported_context, null);
  });

  it('includes sanitized user_reported_context only when DAW notes are populated and keeps Toggle B & C false', () => {
    const consent = {
      ...createDefaultConsentState(),
      external_ai_transfer_consent: true,
      ai_numerical_metrics_transfer_consent: true,
    };
    const report = generatePhase1DemoReport({
      interface_mode: 'advanced',
      genre: 'electronic_club',
      mix_stage: 'final_master',
      consent_state: consent,
    });

    const payload = buildSanitizedAiMentorRequest({
      report,
      genre: 'electronic_club',
      mixStage: 'final_master',
      interfaceMode: 'advanced',
      artistVision: ['Aggressive', 'Wide'],
      consent,
      dawContext: {
        source_tag: 'user_reported_context',
        daw_name: 'Ableton Live',
        bus_routing: 'Drum Bus -> Master',
        plugin_chain_notes: 'Pro-L2 -1.0 dBTP',
        updated_at: '2026-01-01T00:00:00Z',
      },
    });

    assert.equal(payload.allow_ai_interpretation, true);
    assert.equal(payload.allow_direct_audio_inspection, false);
    assert.equal(payload.allow_model_training, false);
    assert.deepEqual(payload.artist_vision, ['Aggressive', 'Wide']);
    assert.equal(payload.user_reported_context?.source_tag, 'user_reported_context');
    assert.equal(payload.user_reported_context?.daw_name, 'Ableton Live');
  });

  it('cites only real DSP evidence_ids and guarantees raw_audio_sent_to_ai is false in offline fallback', () => {
    const consent = {
      ...createDefaultConsentState(),
      external_ai_transfer_consent: true,
      ai_numerical_metrics_transfer_consent: true,
    };
    const report = generatePhase1DemoReport({
      interface_mode: 'simple',
      genre: 'indie_rock',
      mix_stage: 'unmastered_mix',
      consent_state: consent,
    });

    const validIds = new Set(report.issues.map((i) => i.issue_id));
    const response = buildDeterministicClientMentorResponse({
      report,
      genre: 'indie_rock',
      mixStage: 'unmastered_mix',
      artistVision: ['Warm'],
      consent,
      fallbackReason: 'Unit test deterministic fallback',
    });

    assert.equal(response.mentor_mode, 'deterministic_fallback');
    assert.equal(response.privacy_audit.raw_audio_sent_to_ai, false);
    assert.equal(response.privacy_audit.external_ai_enabled, true);
    assert.equal(response.privacy_audit.training_opt_in, false);
    assert.ok(response.coaching_steps.length >= 1);
    for (const step of response.coaching_steps) {
      assert.ok(
        validIds.has(step.evidence_id) || step.evidence_id === 'dsp_true_peak_overshoot',
        `Unexpected evidence_id: ${step.evidence_id}`
      );
      assert.ok(step.what_happened.length > 0);
      assert.ok(step.listen_prompt.length > 0);
      assert.ok(step.what_to_try.length > 0);
      assert.ok(step.recheck_target.length > 0);
    }
  });

  it('Rule 3: NEVER suppresses objective true_peak_dbtp > -0.1 warnings under Aggressive Artist Vision', () => {
    const consent = {
      ...createDefaultConsentState(),
      external_ai_transfer_consent: true,
      ai_numerical_metrics_transfer_consent: true,
    };
    const report = generatePhase1DemoReport({
      interface_mode: 'advanced',
      genre: 'electronic_club',
      mix_stage: 'final_master',
      consent_state: consent,
    });

    // Simulate a hot master (+0.45 dBTP) even if issues list omitted true_peak_max
    report.measurements.true_peak_max.value = 0.45;
    report.measurements.true_peak_max.status = 'critical';
    report.issues = report.issues.filter((i) => i.domain !== 'true_peak_clipping');

    const response = buildDeterministicClientMentorResponse({
      report,
      genre: 'electronic_club',
      mixStage: 'final_master',
      artistVision: ['Aggressive'],
      consent,
      fallbackReason: 'Rule 3 aggressive vision safety check',
    });

    assert.equal(response.objective_warnings_preserved, true);
    const tpStep = response.coaching_steps.find(
      (s) =>
        s.classification === 'objective_technical' &&
        (s.evidence_id === 'dsp_true_peak_overshoot' ||
          s.title.toLowerCase().includes('true peak'))
    );
    assert.ok(tpStep, 'Expected objective True Peak warning step to be preserved under Aggressive vision');
    assert.match(tpStep.what_to_try, /Aggressive/i);
    assert.match(response.vision_alignment_note, /Rule 3/i);
  });
});

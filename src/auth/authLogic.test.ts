import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isProtectedRoute,
  parseAppRoute,
  sanitizeReturnTo,
  validateAuthForm,
} from './authLogic.ts';
import { generatePhase1DemoReport } from '../contracts/demoFixtures.ts';

test('parseAppRoute classifies all public and protected routes accurately', () => {
  assert.equal(parseAppRoute('/'), '/');
  assert.equal(parseAppRoute('/auth'), '/auth');
  assert.equal(parseAppRoute('/privacy'), '/privacy');
  assert.equal(parseAppRoute('/terms'), '/terms');
  assert.equal(parseAppRoute('/cookies'), '/cookies');
  assert.equal(parseAppRoute('/simple'), '/simple');
  assert.equal(parseAppRoute('/advanced'), '/advanced');
  assert.equal(parseAppRoute('/architecture'), '/architecture');

  assert.equal(isProtectedRoute('/'), false);
  assert.equal(isProtectedRoute('/auth'), false);
  assert.equal(isProtectedRoute('/privacy'), false);
  assert.equal(isProtectedRoute('/terms'), false);
  assert.equal(isProtectedRoute('/cookies'), false);
  assert.equal(isProtectedRoute('/simple'), true);
  assert.equal(isProtectedRoute('/advanced'), true);
  assert.equal(isProtectedRoute('/architecture'), true);
});

test('sanitizeReturnTo prevents open redirects and blocks /auth loops', () => {
  assert.equal(sanitizeReturnTo('/advanced'), '/advanced');
  assert.equal(sanitizeReturnTo('/simple'), '/simple');
  assert.equal(sanitizeReturnTo('/architecture'), '/architecture');
  assert.equal(sanitizeReturnTo('/auth'), '/simple');
  assert.equal(sanitizeReturnTo('https://evil.example.com'), '/simple');
  assert.equal(sanitizeReturnTo('//evil.example.com/steal'), '/simple');
  assert.equal(sanitizeReturnTo(null), '/simple');
});

test('validateAuthForm enforces valid email, password length, and explicit signup consent checkbox', () => {
  assert.equal(
    validateAuthForm({ mode: 'login', email: 'bad-email', password: 'password123' }).valid,
    false
  );
  assert.equal(
    validateAuthForm({ mode: 'login', email: 'mix@studio.dev', password: 'short' }).valid,
    false
  );
  assert.equal(
    validateAuthForm({ mode: 'login', email: 'mix@studio.dev', password: 'password123' }).valid,
    true
  );

  // Sign-up strictly requires legalConsentAccepted === true
  const missingConsent = validateAuthForm({
    mode: 'signup',
    email: 'mix@studio.dev',
    password: 'password123',
    displayName: 'Alex',
    legalConsentAccepted: false,
  });
  assert.equal(missingConsent.valid, false);
  assert.match(missingConsent.error || '', /Privacy Policy/i);

  const validSignup = validateAuthForm({
    mode: 'signup',
    email: 'mix@studio.dev',
    password: 'password123',
    displayName: 'Alex',
    legalConsentAccepted: true,
  });
  assert.equal(validSignup.valid, true);
});

test('4.0s demo fixture scrubs all legacy 00:42 / 00:58 / 00:18 / 01:48 prose timestamps', () => {
  const report = generatePhase1DemoReport({
    interface_mode: 'advanced',
    genre: 'indie_rock',
    mix_stage: 'unmastered_mix',
    consent_state: {
      audio_analysis_consent: true,
      external_ai_transfer_consent: false,
      ai_numerical_metrics_transfer_consent: false,
      ai_audio_content_inspection_consent: false,
      raw_audio_transfer_consent: false,
      model_training_opt_in: false,
      consent_timestamp: '2026-11-19T00:00:00Z',
    },
    custom_filename: 'checkmix_demo_track_24bit.wav',
    custom_duration_sec: 4.0,
  });

  const serialized = JSON.stringify({
    issues: report.issues,
    recommendations: report.recommendations,
  });

  for (const forbidden of ['00:42', '00:58', '00:18', '01:48', '02:04', '00:34', '00:50', '00:44', '01:01']) {
    assert.equal(
      serialized.includes(forbidden),
      false,
      `Found stale out-of-range timestamp "${forbidden}" in 4.0s demo report prose`
    );
  }

  for (const iss of report.issues) {
    for (const ts of iss.timestamps) {
      assert.ok(ts.start_sec >= 0 && ts.start_sec <= 4.0);
      assert.ok(ts.end_sec >= ts.start_sec && ts.end_sec <= 4.0);
    }
  }
});

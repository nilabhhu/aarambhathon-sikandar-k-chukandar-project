import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkBackendHealth,
  fetchAnalysisReport,
} from '../services/apiService';
import { createDefaultConsentState } from './analysisContract';
import { generatePhase1DemoReport } from './demoFixtures';

test('Backend Integration: checkBackendHealth successfully detects online backend', async () => {
  const mockFetch = async () => {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ok',
        phase: 1,
        mode: 'foundation_contracts_only',
        is_demonstration_mode: true,
      }),
    } as unknown as Response;
  };

  const res = await checkBackendHealth(mockFetch as unknown as typeof fetch);
  assert.equal(res.online, true);
  assert.equal(res.data?.phase, 1);
});

test('Backend Integration: checkBackendHealth handles backend offline gracefully', async () => {
  const failingFetch = async () => {
    throw new Error('fetch failed: Connection refused');
  };

  const res = await checkBackendHealth(failingFetch as unknown as typeof fetch);
  assert.equal(res.online, false);
  assert.ok(res.errorMessage?.includes('Connection refused'));
});

test('Backend Integration: fetchAnalysisReport successfully consumes valid backend report', async () => {
  const mockReport = generatePhase1DemoReport({
    interface_mode: 'advanced',
    genre: 'hip_hop_trap',
    mix_stage: 'final_master',
    consent_state: createDefaultConsentState(),
  });

  const mockFetch = async () => {
    return {
      ok: true,
      status: 200,
      json: async () => mockReport,
    } as unknown as Response;
  };

  const result = await fetchAnalysisReport(
    {
      interface_mode: 'advanced',
      genre: 'hip_hop_trap',
      mix_stage: 'final_master',
      consent_state: createDefaultConsentState(),
    },
    mockFetch as unknown as typeof fetch
  );

  assert.equal(result.success, true);
  assert.equal(result.source, 'backend');
  assert.equal(result.report.input_context.genre, 'hip_hop_trap');
  assert.equal(result.report.is_demonstration_data, true);
});

test('Backend Integration: fetchAnalysisReport falls back to local fixture when backend is unavailable', async () => {
  const failingFetch = async () => {
    throw new Error('Network error: ECONNREFUSED');
  };

  const result = await fetchAnalysisReport(
    {
      interface_mode: 'simple',
      genre: 'electronic_club',
      mix_stage: 'unmastered_mix',
      consent_state: createDefaultConsentState(),
    },
    failingFetch as unknown as typeof fetch
  );

  // Must fall back cleanly to offline local fixture with proper source label
  assert.equal(result.source, 'offline_fallback');
  assert.equal(result.report.input_context.genre, 'electronic_club');
  assert.equal(result.report.is_demonstration_data, true);
  assert.ok(result.errorMessage?.includes('Backend offline'));
});

test('Backend Integration: fetchAnalysisReport rejects invalid backend report (missing is_demonstration_data)', async () => {
  const invalidReport = generatePhase1DemoReport({
    interface_mode: 'advanced',
    genre: 'indie_rock',
    mix_stage: 'unmastered_mix',
    consent_state: createDefaultConsentState(),
  });
  // Violate Phase 1 contract boundary
  invalidReport.is_demonstration_data = false;

  const mockFetch = async () => {
    return {
      ok: true,
      status: 200,
      json: async () => invalidReport,
    } as unknown as Response;
  };

  const result = await fetchAnalysisReport(
    {
      interface_mode: 'advanced',
      genre: 'indie_rock',
      mix_stage: 'unmastered_mix',
      consent_state: createDefaultConsentState(),
    },
    mockFetch as unknown as typeof fetch
  );

  // Must detect schema failure and fall back safely with an error message
  assert.equal(result.success, false);
  assert.equal(result.source, 'offline_fallback');
  assert.ok(result.errorMessage?.includes('failed schema validation'));
  assert.equal(result.report.is_demonstration_data, true);
});

test('Backend Integration: fetchAnalysisReport blocks analysis immediately when audio_analysis_consent is false', async () => {
  const revokedConsent = {
    ...createDefaultConsentState(),
    audio_analysis_consent: false,
  };

  const result = await fetchAnalysisReport({
    interface_mode: 'advanced',
    genre: 'indie_rock',
    mix_stage: 'unmastered_mix',
    consent_state: revokedConsent,
  });

  assert.equal(result.success, false);
  assert.equal(result.statusCode, 403);
  assert.ok(result.errorMessage?.includes('Permission 1'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildApiUrl,
  checkBackendHealth,
  fetchAnalysisReport,
  analyzeAudioWithDsp,
  validateAudioUploadFile,
  MAX_UPLOAD_FILE_BYTES,
} from '../services/apiService';
import { analyzePcmBuffersLocally } from '../services/clientWebAudioDsp';
import {
  createDefaultConsentState,
  validateAnalysisReport,
} from './analysisContract';
import { generatePhase1DemoReport } from './demoFixtures';

test('Upload Routing: buildApiUrl uses direct HTTPS VITE_API_BASE_URL when configured (bypassing Vercel 4.5MB limit)', () => {
  assert.equal(
    buildApiUrl('/api/v1/analyze/dsp', 'https://mixlearn-api.onrender.com/'),
    'https://mixlearn-api.onrender.com/api/v1/analyze/dsp'
  );
  assert.equal(
    buildApiUrl('/api/v1/analyze/dsp', ''),
    '/api/v1/analyze/dsp'
  );
});

test('Upload Guard: validateAudioUploadFile enforces 100 MB limit and allowed audio formats (.wav, .flac, .aiff, .mp3, .ogg)', () => {
  // Valid formats within size limit
  for (const ext of ['.wav', '.flac', '.aiff', '.mp3', '.ogg', '.WAV']) {
    const res = validateAudioUploadFile({ name: `mix_v1${ext}`, size: 12 * 1024 * 1024 });
    assert.equal(res.valid, true, `Expected ${ext} to be accepted`);
  }

  // Invalid extension rejected
  const badExt = validateAudioUploadFile({ name: 'notes.txt', size: 1024 });
  assert.equal(badExt.valid, false);
  assert.ok(badExt.error?.includes('Unsupported file format'));

  // Unsupported audio extension (.m4a) rejected
  const badM4a = validateAudioUploadFile({ name: 'voice_memo.m4a', size: 1024 * 1024 });
  assert.equal(badM4a.valid, false);
  assert.ok(badM4a.error?.includes('.wav, .flac, .aiff, .mp3, .ogg'));

  // Empty 0-byte file rejected
  const emptyFile = validateAudioUploadFile({ name: 'empty.wav', size: 0 });
  assert.equal(emptyFile.valid, false);
  assert.ok(emptyFile.error?.includes('empty'));

  // Oversized file (> 100 MB) rejected
  const oversized = validateAudioUploadFile({
    name: 'huge_session.wav',
    size: MAX_UPLOAD_FILE_BYTES + 1,
  });
  assert.equal(oversized.valid, false);
  assert.ok(oversized.error?.includes('100 MB'));
});

test('Backend Integration: checkBackendHealth successfully detects online Phase 2 backend', async () => {
  const mockFetch = async () => {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ok',
        phase: 2,
        mode: 'mathematical_dsp_active',
        is_demonstration_mode: false,
      }),
    } as unknown as Response;
  };

  const res = await checkBackendHealth(mockFetch as unknown as typeof fetch);
  assert.equal(res.online, true);
  assert.equal(res.data?.phase, 2);
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

test('Backend Integration: fetchAnalysisReport falls back cleanly when backend is unavailable', async () => {
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

  assert.equal(result.source, 'offline_fallback');
  assert.equal(result.report.input_context.genre, 'electronic_club');
  assert.equal(result.report.is_demonstration_data, true);
  assert.ok(result.errorMessage?.includes('Backend offline'));
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

test('Backend Integration: analyzeAudioWithDsp posts directly to VITE_API_BASE_URL and validates live DSP report', async () => {
  const baseReport = generatePhase1DemoReport({
    interface_mode: 'advanced',
    genre: 'indie_rock',
    mix_stage: 'unmastered_mix',
    consent_state: createDefaultConsentState(),
  });

  const mockDspReport = {
    ...baseReport,
    is_demonstration_data: false,
    data_source_notice: 'MATHEMATICAL DSP ANALYSIS — REAL AUDIO MEASUREMENTS',
    measurements: Object.fromEntries(
      Object.entries(baseReport.measurements).map(([k, m]) => [
        k,
        { ...m, source: 'mathematical_dsp' },
      ])
    ),
  };

  let requestedUrl = '';
  const mockFetch = async (url: string | URL | Request) => {
    requestedUrl = String(url);
    return {
      ok: true,
      status: 200,
      json: async () => mockDspReport,
    } as unknown as Response;
  };

  const fd = new FormData();
  fd.append('interface_mode', 'advanced');
  fd.append('genre', 'indie_rock');
  fd.append('mix_stage', 'unmastered_mix');
  fd.append('consent_state_json', JSON.stringify(createDefaultConsentState()));

  const result = await analyzeAudioWithDsp(fd, mockFetch as unknown as typeof fetch, {
    baseOverride: 'https://mixlearn-api.onrender.com',
  });
  assert.equal(requestedUrl, 'https://mixlearn-api.onrender.com/api/v1/analyze/dsp');
  assert.equal(result.success, true);
  assert.equal(result.source, 'backend');
  assert.equal(result.report?.is_demonstration_data, false);
});

test('Backend Integration: analyzeAudioWithDsp falls back to local Web Audio DSP ONLY when backend is unreachable', async () => {
  const failingFetch = async () => {
    throw new Error('Failed to fetch');
  };

  // Build synthetic 1-second 48kHz stereo sine PCM for local analyzer stub
  const sampleRate = 48000;
  const n = sampleRate;
  const ch = new Float32Array(n);
  const amp = Math.pow(10, -6 / 20);
  for (let i = 0; i < n; i++) {
    ch[i] = amp * Math.sin((2 * Math.PI * 1000 * i) / sampleRate);
  }

  const fakeFile = new File([new Uint8Array(1024)], 'test_mix.wav', { type: 'audio/wav' });
  const fd = new FormData();
  fd.append('audio_file', fakeFile);
  fd.append('interface_mode', 'simple');
  fd.append('genre', 'indie_rock');
  fd.append('mix_stage', 'unmastered_mix');
  fd.append('consent_state_json', JSON.stringify(createDefaultConsentState()));

  const result = await analyzeAudioWithDsp(fd, failingFetch as unknown as typeof fetch, {
    localAnalyzer: async (file, opts) =>
      analyzePcmBuffersLocally({
        channels: [ch, ch],
        sampleRate,
        filename: file.name,
        fileSizeBytes: file.size,
        options: opts,
      }),
  });

  assert.equal(result.success, true);
  assert.equal(result.source, 'local_web_audio');
  assert.ok(result.report !== null);
  assert.equal(result.report!.is_demonstration_data, false);
  const validation = validateAnalysisReport(result.report!, { expectedMode: 'dsp' });
  assert.equal(validation.valid, true, `Validation errors: ${validation.errors.join('; ')}`);
  assert.ok(
    Math.abs((result.report!.measurements.sample_peak_max.value ?? 0) - -6.0) < 0.1,
    `Expected ~-6.0 dBFS peak, got ${result.report!.measurements.sample_peak_max.value}`
  );
});

test('Local Web Audio DSP: analyzePcmBuffersLocally produces valid schema v2.0.0 report and detects clipping', () => {
  const sampleRate = 48000;
  const n = sampleRate * 2;
  const clipped = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const raw = 1.5 * Math.sin((2 * Math.PI * 200 * i) / sampleRate);
    clipped[i] = Math.max(-1.0, Math.min(1.0, raw));
  }

  const report = analyzePcmBuffersLocally({
    channels: [clipped, clipped],
    sampleRate,
    filename: 'clipped_bounce.wav',
    fileSizeBytes: n * 4,
    options: {
      interface_mode: 'simple',
      genre: 'pop_vocal',
      mix_stage: 'final_master',
      consent_state: createDefaultConsentState(),
    },
  });

  const validation = validateAnalysisReport(report, { expectedMode: 'dsp' });
  assert.equal(validation.valid, true, `Validation errors: ${validation.errors.join('; ')}`);
  assert.ok((report.measurements.sample_clipping_events.value ?? 0) > 0);
  assert.ok(
    report.issues.some((i) => i.classification === 'objective_technical' && i.domain === 'true_peak_clipping')
  );
});

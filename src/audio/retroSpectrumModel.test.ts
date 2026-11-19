import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRetroSpectrumModel,
  mapAnalysisIssueToRetroBand,
  RETRO_BAND_DEFINITIONS,
  TOTAL_RETRO_BARS,
} from './retroSpectrumModel';
import { createDefaultConsentState } from '../contracts/analysisContract';
import { generatePhase1DemoReport } from '../contracts/demoFixtures';

describe('2D Retro Spectrum Analyzer Problem-Zone Model', () => {
  it('divides 20Hz-20kHz into the exact 6 retro bands and 48 pixel bars', () => {
    assert.equal(RETRO_BAND_DEFINITIONS.length, 6);
    assert.deepEqual(
      RETRO_BAND_DEFINITIONS.map((b) => `${b.label} ${b.axisRange}`),
      [
        'Sub 20–60Hz',
        'Bass 60–250Hz',
        'Low-Mids 250–500Hz',
        'Mids 500Hz–2kHz',
        'High-Mids 2–6kHz',
        'Air 6–20kHz',
      ]
    );

    const report = generatePhase1DemoReport({
      interface_mode: 'simple',
      genre: 'indie_rock',
      mix_stage: 'unmastered_mix',
      consent_state: createDefaultConsentState(),
    });
    const model = buildRetroSpectrumModel({
      report,
      genre: 'indie_rock',
      mixStage: 'unmastered_mix',
    });

    assert.equal(model.bars.length, TOTAL_RETRO_BARS);
    assert.equal(model.bands.length, 6);
  });

  it('triggers at least 2 clear highlighted problem zones (Low-Mid mud + 4kHz harsh peak) for demo track scans', () => {
    const demoReport = generatePhase1DemoReport({
      interface_mode: 'simple',
      genre: 'indie_rock',
      mix_stage: 'unmastered_mix',
      consent_state: createDefaultConsentState(),
    });

    const model = buildRetroSpectrumModel({
      report: demoReport,
      genre: 'indie_rock',
      mixStage: 'unmastered_mix',
    });

    assert.ok(
      model.problemZones.length >= 2,
      `Expected >= 2 highlighted problem zones on demo scan, got ${model.problemZones.length}`
    );

    const lowMidZone = model.problemZones.find((z) => z.bandId === 'low_mids');
    const highMidZone = model.problemZones.find((z) => z.bandId === 'high_mids');

    assert.ok(lowMidZone, 'Expected Low-Mids (250–500Hz) problem zone to be highlighted');
    assert.ok(highMidZone, 'Expected High-Mids (2–6kHz / 4kHz) problem zone to be highlighted');
    assert.match(lowMidZone.headline, /250Hz/i);
    assert.match(lowMidZone.actionableTip, /^Tip:/);
    assert.match(highMidZone.headline, /4\.0kHz|HARSH/i);
    assert.match(highMidZone.actionableTip, /^Tip:/);
  });

  it('dynamically flags uploaded FFT bands exceeding target reference curve or hitting clipping thresholds', () => {
    const cleanReport = generatePhase1DemoReport({
      interface_mode: 'advanced',
      genre: 'pop_vocal',
      mix_stage: 'final_master',
      consent_state: createDefaultConsentState(),
    });
    // Remove all issues and set clean headroom to verify pure FFT-driven flagging
    cleanReport.issues = [];
    cleanReport.measurements.true_peak_max.value = -1.2;
    cleanReport.measurements.sample_clipping_events.value = 0;

    // Synthesize 48 FFT bins: clean everywhere except Sub (bars 0..7) exceeding target (-16.5 ceiling -> -11.0 dBFS)
    // and High-Mids (bars 32..39) spiking to -12.0 dBFS (above -16.5 ceiling)
    const fftBins = new Array<number>(TOTAL_RETRO_BARS).fill(-26.0);
    for (let i = 0; i <= 7; i++) fftBins[i] = -11.0;
    for (let i = 32; i <= 39; i++) fftBins[i] = -12.0;

    const model = buildRetroSpectrumModel({
      report: cleanReport,
      genre: 'pop_vocal',
      mixStage: 'final_master',
      spectrumBins: fftBins,
    });

    const flaggedIds = model.problemZones.map((z) => z.bandId);
    assert.ok(flaggedIds.includes('sub'), 'Expected Sub band exceeding reference ceiling to be flagged');
    assert.ok(flaggedIds.includes('high_mids'), 'Expected High-Mids band exceeding reference ceiling to be flagged');
    assert.equal(flaggedIds.includes('mids'), false, 'Clean Mids band should NOT be flagged');
  });

  it('maps diagnostic issue IDs back to their corresponding retro frequency band for click-to-focus sync', () => {
    const demoReport = generatePhase1DemoReport({
      interface_mode: 'advanced',
      genre: 'indie_rock',
      mix_stage: 'unmastered_mix',
      consent_state: createDefaultConsentState(),
    });

    const lowMidIssue = demoReport.issues.find((i) => i.issue_id === 'iss-stylistic-low-mid-density')!;
    const harshIssue = demoReport.issues.find((i) => i.issue_id === 'iss-harsh-presence-peak')!;

    assert.equal(mapAnalysisIssueToRetroBand(lowMidIssue), 'low_mids');
    assert.equal(mapAnalysisIssueToRetroBand(harshIssue), 'high_mids');
  });
});

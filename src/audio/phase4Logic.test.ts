import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPairwiseOverlapMatrixPure,
  checkStemDurationAlignment,
  compareRevisionReportsPure,
  computePairwiseBandOverlap,
  MAX_STEM_DURATION_MISMATCH_MS,
  MAX_STEM_FILE_BYTES,
  MAX_TOTAL_STEMS_BYTES,
  validateOriginalStemFiles,
} from './phase4Logic';
import {
  AnalysisReport,
  createDefaultConsentState,
  StemAnalysisItem,
} from '../contracts/analysisContract';
import { generatePhase1DemoReport } from '../contracts/demoFixtures';

function makeMockStem(
  id: string,
  name: string,
  sixBands: StemAnalysisItem['six_band_energies_db']
): StemAnalysisItem {
  return {
    stem_id: id,
    stem_name: name,
    stem_role: 'other',
    stem_source_type: 'user_uploaded_original',
    duration_seconds: 12.0,
    sample_rate_hz: 44100,
    channels: 2,
    file_size_bytes: 2_000_000,
    integrated_lufs: -18.0,
    sample_peak_dbfs: -4.2,
    true_peak_dbtp: -4.0,
    headroom_db: 4.0,
    rms_dbfs: -18.5,
    spectral_centroid_hz: 850,
    six_band_energies_db: sixBands,
  };
}

function makeReport(overrides: {
  filename: string;
  lufs: number;
  truePeak: number;
  lra: number;
  phaseMean: number;
  phaseMin: number;
  crest: number;
  clipping: number;
  subDb: number;
  mudDb: number;
  presenceDb: number;
  airDb: number;
}): AnalysisReport {
  const base = generatePhase1DemoReport({
    interface_mode: 'advanced',
    genre: 'indie_rock',
    mix_stage: 'unmastered_mix',
    consent_state: createDefaultConsentState(),
  });
  return {
    ...base,
    is_demonstration_data: false,
    report_id: `rep_${overrides.filename}`,
    file_metadata: {
      ...base.file_metadata,
      filename: overrides.filename,
    },
    measurements: {
      ...base.measurements,
      integrated_loudness: { ...base.measurements.integrated_loudness, value: overrides.lufs },
      true_peak_max: {
        ...base.measurements.true_peak_max,
        value: overrides.truePeak,
        status: overrides.truePeak > -1.0 ? 'critical' : 'optimal',
      },
      loudness_range_lra: { ...base.measurements.loudness_range_lra, value: overrides.lra },
      phase_correlation_mean: {
        ...base.measurements.phase_correlation_mean,
        value: overrides.phaseMean,
      },
      phase_correlation_min: {
        ...base.measurements.phase_correlation_min,
        value: overrides.phaseMin,
        status: overrides.phaseMin < 0 ? 'critical' : 'optimal',
      },
      crest_factor: { ...base.measurements.crest_factor, value: overrides.crest },
      sample_clipping_events: {
        ...base.measurements.sample_clipping_events,
        value: overrides.clipping,
      },
      sub_bass_energy_20_60hz: {
        ...base.measurements.sub_bass_energy_20_60hz,
        value: overrides.subDb,
      },
      mud_band_energy_200_500hz: {
        ...base.measurements.mud_band_energy_200_500hz,
        value: overrides.mudDb,
      },
      presence_band_energy_2k_5khz: {
        ...base.measurements.presence_band_energy_2k_5khz,
        value: overrides.presenceDb,
      },
      air_band_energy_10k_20khz: {
        ...base.measurements.air_band_energy_10k_20khz,
        value: overrides.airDb,
      },
    },
  };
}

describe('Phase 4 Pure Logic: Original Stem Validation & Alignment (Rule 1)', () => {
  it('rejects a single stereo mixdown with PROHIBITED_AI_STEM_SEPARATION', () => {
    const res = validateOriginalStemFiles([{ name: 'FullMix.wav', size: 12_000_000 }]);
    assert.equal(res.valid, false);
    assert.equal(res.errorCode, 'PROHIBITED_AI_STEM_SEPARATION');
  });

  it('rejects more than 8 stems and oversized uploads cleanly', () => {
    const nineFiles = Array.from({ length: 9 }, (_, i) => ({
      name: `Stem_${i + 1}.wav`,
      size: 1_000_000,
    }));
    const tooMany = validateOriginalStemFiles(nineFiles);
    assert.equal(tooMany.valid, false);
    assert.equal(tooMany.errorCode, 'INVALID_STEM_COUNT');

    const singleOversize = validateOriginalStemFiles([
      { name: 'Kick.wav', size: MAX_STEM_FILE_BYTES + 1 },
      { name: 'Bass.wav', size: 1_000_000 },
    ]);
    assert.equal(singleOversize.valid, false);
    assert.equal(singleOversize.errorCode, 'STEM_FILE_TOO_LARGE');

    const totalOversize = validateOriginalStemFiles([
      { name: 'S1.wav', size: 95 * 1024 * 1024 },
      { name: 'S2.wav', size: 95 * 1024 * 1024 },
      { name: 'S3.wav', size: 95 * 1024 * 1024 },
      { name: 'S4.wav', size: 95 * 1024 * 1024 },
    ]);
    assert.equal(totalOversize.valid, false);
    assert.equal(totalOversize.errorCode, 'TOTAL_STEM_UPLOAD_TOO_LARGE');
    assert.ok(4 * 95 * 1024 * 1024 > MAX_TOTAL_STEMS_BYTES);
  });

  it('accepts 2 to 8 valid original stems', () => {
    const res = validateOriginalStemFiles([
      { name: 'Kick.wav', size: 4_000_000 },
      { name: 'Bass.wav', size: 4_000_000 },
      { name: 'Vocals.wav', size: 4_000_000 },
    ]);
    assert.equal(res.valid, true);
    assert.equal(res.errorCode, null);
  });

  it('enforces the 50 ms duration alignment tolerance', () => {
    const aligned = checkStemDurationAlignment([
      { name: 'Kick.wav', durationSec: 10.0 },
      { name: 'Bass.wav', durationSec: 10.03 },
    ]);
    assert.equal(aligned.aligned, true);
    assert.ok(aligned.maxDiffMs <= MAX_STEM_DURATION_MISMATCH_MS);

    const misaligned = checkStemDurationAlignment([
      { name: 'Kick.wav', durationSec: 10.0 },
      { name: 'Misaligned.wav', durationSec: 10.25 },
    ]);
    assert.equal(misaligned.aligned, false);
    assert.ok(misaligned.maxDiffMs > MAX_STEM_DURATION_MISMATCH_MS);
    assert.ok(misaligned.errorMessage?.includes('50'));
  });
});

describe('Phase 4 Pure Logic: Pairwise 6-Band Potential Spectral Masking Matrix', () => {
  it('flags strong shared low-band energy between Kick and Bass as potential spectral masking while keeping separated bands low', () => {
    const kick = makeMockStem('stem_1', 'Kick.wav', {
      sub: -24.0,
      low: -14.0,
      low_mid: -36.0,
      high_mid: -48.0,
      presence: -55.0,
      air: -60.0,
    });
    const bass = makeMockStem('stem_2', 'Bass.wav', {
      sub: -23.0,
      low: -14.8,
      low_mid: -32.0,
      high_mid: -50.0,
      presence: -58.0,
      air: -62.0,
    });
    const vocals = makeMockStem('stem_3', 'Vocals.wav', {
      sub: -65.0,
      low: -52.0,
      low_mid: -28.0,
      high_mid: -17.0,
      presence: -16.0,
      air: -26.0,
    });

    const lowPair = computePairwiseBandOverlap(-14.0, -14.8, -14.0, -14.8);
    assert.equal(lowPair.severity, 'high');
    assert.ok(lowPair.overlap_score >= 0.62);

    const matrix = buildPairwiseOverlapMatrixPure([kick, bass, vocals]);
    assert.equal(matrix.pairs.length, 3);
    assert.match(matrix.methodology_note, /potential spectral masking/i);

    const kickBass = matrix.pairs.find(
      (p) => p.stem_a_name === 'Kick.wav' && p.stem_b_name === 'Bass.wav'
    );
    const kickVocals = matrix.pairs.find(
      (p) => p.stem_a_name === 'Kick.wav' && p.stem_b_name === 'Vocals.wav'
    );
    assert.ok(kickBass);
    assert.ok(kickVocals);
    assert.equal(kickBass.peak_overlap_band, 'low');
    assert.equal(kickBass.severity, 'high');
    assert.equal(kickVocals.severity, 'low');
    assert.ok(kickBass.peak_overlap_score > kickVocals.peak_overlap_score);
  });
});

describe('Phase 4 Pure Logic: Revision Delta Comparison (v1 -> v2)', () => {
  it('computes exact metric/spectral deltas and classifies prior v1 findings as improved, unchanged, or regressed', () => {
    const v1 = makeReport({
      filename: 'song_v1.wav',
      lufs: -15.2,
      truePeak: 0.45,
      lra: 6.4,
      phaseMean: 0.62,
      phaseMin: -0.22,
      crest: 11.0,
      clipping: 14,
      subDb: -22.0,
      mudDb: -12.0,
      presenceDb: -24.0,
      airDb: -32.0,
    });

    v1.issues = [
      {
        issue_id: 'iss_tp',
        classification: 'objective_technical',
        domain: 'true_peak_clipping',
        severity: 'critical',
        confidence: 0.99,
        title: 'True Peak Overshoot',
        timestamps: [],
        evidence: [
          {
            metric_key: 'true_peak_max',
            measured_value: 0.45,
            unit: 'dBTP',
            target_range: '-6.0 to -3.0',
            method: '4x polyphase ISP',
          },
        ],
        learning_guide: {
          what_was_detected: 'True peak overshoot',
          why_it_matters: 'Clipping risk',
          what_to_try: 'Lower mix bus fader',
          how_to_verify: 'Check true peak meter',
        },
      },
      {
        issue_id: 'iss_phase',
        classification: 'objective_technical',
        domain: 'phase_polarity',
        severity: 'critical',
        confidence: 0.95,
        title: 'Negative Phase Correlation',
        timestamps: [],
        evidence: [
          {
            metric_key: 'phase_correlation_min',
            measured_value: -0.22,
            unit: 'correlation',
            target_range: '0.2 to 1.0',
            method: 'IEC 60268',
          },
        ],
        learning_guide: {
          what_was_detected: 'Phase drop',
          why_it_matters: 'Mono cancellation',
          what_to_try: 'Narrow stereo widener',
          how_to_verify: 'Fold to mono',
        },
      },
      {
        issue_id: 'iss_mud',
        classification: 'subjective_stylistic',
        domain: 'frequency_balance',
        severity: 'warning',
        confidence: 0.82,
        title: 'Low-Mid Buildup (200-500 Hz)',
        timestamps: [],
        evidence: [
          {
            metric_key: 'mud_band_energy_200_500hz',
            measured_value: -12.0,
            unit: 'dBFS',
            target_range: '-22.0 to -16.0',
            method: 'Welch PSD',
          },
        ],
        learning_guide: {
          what_was_detected: 'Mud buildup',
          why_it_matters: 'Masks vocals',
          what_to_try: 'Cut 250-350 Hz',
          how_to_verify: 'A/B vocal clarity',
        },
      },
    ];

    const v2 = makeReport({
      filename: 'song_v2.wav',
      lufs: -17.0,
      truePeak: -3.2,
      lra: 7.4,
      phaseMean: 0.5,
      phaseMin: -0.45,
      crest: 12.2,
      clipping: 0,
      subDb: -23.0,
      mudDb: -12.05,
      presenceDb: -22.5,
      airDb: -31.0,
    });
    v2.issues = [v1.issues[1], v1.issues[2]];

    const delta = compareRevisionReportsPure(v1, v2);

    assert.equal(delta.metric_deltas.delta_integrated_lufs, -1.8);
    assert.equal(delta.metric_deltas.delta_true_peak_dbtp, -3.65);
    assert.equal(delta.metric_deltas.delta_lra_lu, 1.0);
    assert.equal(delta.metric_deltas.delta_phase_correlation, -0.12);
    assert.equal(delta.metric_deltas.delta_sample_clipping_events, -14);

    assert.equal(delta.delta_spectral_db.sub.delta_db, -1.0);
    // Derived 6-band Presence (4–10 kHz) weights 2–5 kHz (+1.5) and 10–20 kHz (+1.0) -> +1.3 dB
    assert.equal(delta.delta_spectral_db.presence.delta_db, 1.3);
    assert.equal(delta.delta_spectral_db.air.delta_db, 1.0);

    // Direct measured 6-band Welch/FFT inputs produce exact 1:1 deltas
    const directDelta = compareRevisionReportsPure(
      v1,
      v2,
      { sub: -22.0, low: -18.0, low_mid: -14.0, high_mid: -19.0, presence: -24.0, air: -32.0 },
      { sub: -23.0, low: -19.5, low_mid: -16.5, high_mid: -18.0, presence: -22.5, air: -31.0 }
    );
    assert.equal(directDelta.delta_spectral_db.low_mid.delta_db, -2.5);
    assert.equal(directDelta.delta_spectral_db.presence.delta_db, 1.5);

    const byId = new Map(delta.finding_verifications.map((f) => [f.issue_id, f.status]));
    assert.equal(byId.get('iss_tp'), 'improved');
    assert.equal(byId.get('iss_phase'), 'regressed');
    assert.equal(byId.get('iss_mud'), 'unchanged');

    assert.equal(delta.summary_counts.improved, 1);
    assert.equal(delta.summary_counts.unchanged, 1);
    assert.equal(delta.summary_counts.regressed, 1);
  });
});

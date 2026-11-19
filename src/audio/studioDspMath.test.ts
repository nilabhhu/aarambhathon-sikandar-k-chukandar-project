import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSixBandSpectralProfile,
  computeLoudnessMatchGainOffsetDb,
  dbToLinearGain,
  foldStereoToEqualPowerMono,
  getGenreTargetEnvelope,
  SIX_BAND_DEFINITIONS,
} from './spectralProfile';
import { createDefaultConsentState } from '../contracts/analysisContract';
import { generatePhase1DemoReport } from '../contracts/demoFixtures';

test('Spectral Envelope: returns all 6 required bands and applies -3.5 dB unmastered stage offset', () => {
  const masterEnv = getGenreTargetEnvelope('electronic_club', 'final_master');
  const unmasteredEnv = getGenreTargetEnvelope('electronic_club', 'unmastered_mix');

  assert.equal(masterEnv.length, 6);
  assert.deepEqual(
    masterEnv.map((b) => b.rangeLabel),
    ['20–60 Hz', '60–250 Hz', '250–800 Hz', '800–4 kHz', '4–10 kHz', '10–20 kHz']
  );

  for (let i = 0; i < 6; i++) {
    assert.equal(
      Math.round((unmasteredEnv[i].targetMinDbfs - masterEnv[i].targetMinDbfs) * 10) / 10,
      -3.5
    );
    assert.equal(
      Math.round((unmasteredEnv[i].targetMaxDbfs - masterEnv[i].targetMaxDbfs) * 10) / 10,
      -3.5
    );
  }
});

test('Spectral Profile: maps real DSP measurements, flags Action Plan bands, and calculates exact deltas', () => {
  const report = generatePhase1DemoReport({
    interface_mode: 'simple',
    genre: 'indie_rock',
    mix_stage: 'unmastered_mix',
    consent_state: createDefaultConsentState(),
  });

  const profile = buildSixBandSpectralProfile({
    report,
    genre: 'indie_rock',
    mixStage: 'unmastered_mix',
    measuredSixBands: {
      sub: -24.0,
      low: -19.0,
      low_mid: -13.2, // Above target (-24.5 to -19.0) & linked to mud_band_energy_200_500hz
      high_mid: -21.0,
      presence: -25.0,
      air: -31.5,
    },
  });

  assert.equal(profile.length, SIX_BAND_DEFINITIONS.length);
  const lowMid = profile.find((b) => b.id === 'low_mid')!;
  assert.equal(lowMid.measuredDbfs, -13.2);
  assert.equal(lowMid.status, 'above_target');
  assert.equal(lowMid.flaggedByActionPlan, true);
  assert.ok(lowMid.deltaFromTargetDb !== null && lowMid.deltaFromTargetDb > 0);
});

test('Loudness-Matched Reference A/B: computes exact LUFS offset in dB and clamps safely', () => {
  // Mix A is -14.0 LUFS, commercial Reference B is -8.5 LUFS -> attenuate Ref B by -5.5 dB
  const offset = computeLoudnessMatchGainOffsetDb(-14.0, -8.5);
  assert.equal(offset, -5.5);
  assert.ok(Math.abs(dbToLinearGain(-6.0) - 0.5012) < 0.002);

  // Safety clamp check
  assert.equal(computeLoudnessMatchGainOffsetDb(-40.0, -6.0), -24.0);
  assert.equal(computeLoudnessMatchGainOffsetDb(-6.0, -40.0), 18.0);
  assert.equal(computeLoudnessMatchGainOffsetDb(null, -10.0), null);
});

test('Equal-Power Mono Folding: computes 0.5 * L + 0.5 * R without clipping full-scale correlated signals', () => {
  // Identical full-scale L=1.0, R=1.0 must stay 1.0 (not 2.0!)
  assert.equal(foldStereoToEqualPowerMono(1.0, 1.0), 1.0);
  // Inverted phase cancels cleanly to 0.0
  assert.equal(foldStereoToEqualPowerMono(0.8, -0.8), 0.0);
  // Hard-panned signal drops by -6 dB (0.5)
  assert.equal(foldStereoToEqualPowerMono(1.0, 0.0), 0.5);
});

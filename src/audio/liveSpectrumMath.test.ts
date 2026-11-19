import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIVE_SPECTRUM_ZONES,
  SPECTRUM_MAX_DB,
  SPECTRUM_MAX_HZ,
  SPECTRUM_MIN_DB,
  SPECTRUM_MIN_HZ,
  aggregateFftToLogBars,
  computeHeroHarmonicWave,
  findZoneAtFreq,
  formatFreqHz,
  freqToLogRatio,
  logRatioToFreq,
  mapStaticSpectrumToLogBars,
  spectrumDbToNorm,
  updatePeakHolds,
} from './liveSpectrumMath';

test('logarithmic frequency mapping round-trips cleanly across 20 Hz – 20 kHz', () => {
  assert.equal(freqToLogRatio(SPECTRUM_MIN_HZ), 0);
  assert.equal(freqToLogRatio(SPECTRUM_MAX_HZ), 1);

  for (const hz of [20, 60, 250, 1000, 4000, 16000, 20000]) {
    const ratio = freqToLogRatio(hz);
    const back = logRatioToFreq(ratio);
    assert.ok(Math.abs(back - hz) / hz < 1e-6, `Expected ${hz}, got ${back}`);
  }
});

test('zone lookup maps frequencies to all 6 canonical Swiss spectrum zones', () => {
  assert.equal(LIVE_SPECTRUM_ZONES.length, 6);
  assert.equal(findZoneAtFreq(35).code, 'SUB');
  assert.equal(findZoneAtFreq(120).code, 'LOW');
  assert.equal(findZoneAtFreq(420).code, 'LOW-MID');
  assert.equal(findZoneAtFreq(1800).code, 'HIGH-MID');
  assert.equal(findZoneAtFreq(6500).code, 'PRESENCE');
  assert.equal(findZoneAtFreq(14000).code, 'AIR');
});

test('formatFreqHz renders tabular Hz and kHz strings accurately', () => {
  assert.equal(formatFreqHz(42.4), '42 Hz');
  assert.equal(formatFreqHz(1250), '1.25 kHz');
  assert.equal(formatFreqHz(16420), '16.4 kHz');
});

test('aggregateFftToLogBars locates a pure 1 kHz FFT tone peak cleanly', () => {
  const sampleRate = 48000;
  const binCount = 1024; // fftSize = 2048
  const hzPerBin = sampleRate / (binCount * 2);
  const fftBins = new Float32Array(binCount).fill(-90);

  const bin1k = Math.round(1000 / hzPerBin);
  fftBins[bin1k] = -10;
  fftBins[bin1k - 1] = -14;
  fftBins[bin1k + 1] = -14;

  const bars = new Float32Array(64);
  aggregateFftToLogBars(fftBins, sampleRate, bars);

  let maxIdx = 0;
  for (let i = 1; i < bars.length; i++) {
    if (bars[i] > bars[maxIdx]) maxIdx = i;
  }

  const peakHz = logRatioToFreq((maxIdx + 0.5) / bars.length);
  assert.ok(peakHz >= 800 && peakHz <= 1250, `Expected peak near 1 kHz, got ${peakHz} Hz`);
  assert.ok(bars[maxIdx] > -25, `Expected strong peak level, got ${bars[maxIdx]} dB`);
});

test('updatePeakHolds holds peak briefly then decays smoothly toward current bar level', () => {
  const cur = new Float32Array([-20, -40]);
  const hold = new Float32Array([-60, -60]);
  const timer = new Float32Array([0, 0]);

  updatePeakHolds(cur, hold, timer, 0.016);
  assert.equal(hold[0], -20);
  assert.equal(hold[1], -40);

  // Drop current signal
  cur[0] = -70;
  cur[1] = -70;

  // During hold window (0.1s), cap stays pinned
  updatePeakHolds(cur, hold, timer, 0.1);
  assert.equal(hold[0], -20);

  // After hold window expires, cap falls smoothly
  for (let i = 0; i < 12; i++) {
    updatePeakHolds(cur, hold, timer, 0.08);
  }
  assert.ok(hold[0] < -20 && hold[0] >= -70);
});

test('computeHeroHarmonicWave produces bounded dB bars and reacts to pointer X', () => {
  const noHover = new Float32Array(48);
  const hovered = new Float32Array(48);

  computeHeroHarmonicWave(noHover, 1.5, null, false);
  computeHeroHarmonicWave(hovered, 1.5, 0.5, false);

  for (let i = 0; i < 48; i++) {
    assert.ok(noHover[i] >= SPECTRUM_MIN_DB && noHover[i] <= SPECTRUM_MAX_DB);
    assert.ok(hovered[i] >= SPECTRUM_MIN_DB && hovered[i] <= SPECTRUM_MAX_DB);
  }

  // Center bar (u ≈ 0.5) must be boosted when pointer hovers at 0.5
  assert.ok(hovered[24] > noHover[24] + 5);
});

test('mapStaticSpectrumToLogBars maps 48 Welch bins and 6-band summaries cleanly', () => {
  const out = new Float32Array(48);
  const fakeBins = Array.from({ length: 48 }, (_, i) => -22 - i * 0.2);
  assert.equal(mapStaticSpectrumToLogBars(out, fakeBins, null), true);
  assert.ok(spectrumDbToNorm(out[0]) > 0.2);

  const out2 = new Float32Array(48);
  assert.equal(
    mapStaticSpectrumToLogBars(out2, null, {
      sub: -20,
      low: -16,
      low_mid: -18,
      high_mid: -19,
      presence: -22,
      air: -28,
    }),
    true
  );
  assert.ok(out2[0] > SPECTRUM_MIN_DB);
});

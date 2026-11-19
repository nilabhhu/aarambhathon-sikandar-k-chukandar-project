import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LiveLoudnessPeakTracker,
  METER_SILENCE_FLOOR_DB,
  computeLiveStereoTelemetry,
  dbToMeterRatio,
  formatLufs,
  formatPeakDb,
  formatStereoBalance,
} from './realtimeMeters';

function makeSine(length: number, freqHz: number, sampleRate: number, amp: number, phaseRad = 0): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = amp * Math.sin((2 * Math.PI * freqHz * i) / sampleRate + phaseRad);
  }
  return out;
}

test('LiveLoudnessPeakTracker returns silence floor when paused or silent', () => {
  const tracker = new LiveLoudnessPeakTracker(48000);
  const silence = new Float32Array(1024);

  const paused = tracker.update(silence, silence, 1000, false);
  assert.equal(paused.isPlaying, false);
  assert.equal(paused.peakL, -Infinity);
  assert.equal(paused.peakR, -Infinity);
  assert.equal(paused.momentaryLufs, METER_SILENCE_FLOOR_DB);
  assert.equal(paused.shortTermLufs, METER_SILENCE_FLOOR_DB);
  assert.equal(paused.isClipping, false);

  const silentPlay = tracker.update(silence, silence, 1016, true);
  assert.equal(silentPlay.isPlaying, true);
  assert.equal(silentPlay.momentaryLufs, METER_SILENCE_FLOOR_DB);
  assert.equal(silentPlay.shortTermLufs, METER_SILENCE_FLOOR_DB);
  assert.equal(silentPlay.isClipping, false);
});

test('LiveLoudnessPeakTracker accurately measures 1 kHz stereo sine peaks, clip latch, and ITU-R BS.1770-4 LUFS', () => {
  const sr = 48000;
  const tracker = new LiveLoudnessPeakTracker(sr);
  // Full-scale 1 kHz stereo sine (0 dBFS peak on L & R):
  // K-weighting has +0.691 dB gain at 1 kHz, canceling the -0.691 offset -> 0.00 LUFS per ITU-R BS.1770-4!
  const sineFull = makeSine(1024, 1000, sr, 1.0);

  let latest = tracker.update(sineFull, sineFull, 100, true);
  for (let t = 116; t <= 600; t += 16) {
    latest = tracker.update(sineFull, sineFull, t, true);
  }

  assert.ok(Math.abs(latest.peakL - 0.0) < 0.05, `Expected ~0 dBFS peakL, got ${latest.peakL}`);
  assert.ok(Math.abs(latest.peakR - 0.0) < 0.05, `Expected ~0 dBFS peakR, got ${latest.peakR}`);
  assert.equal(latest.isClipping, true);
  assert.ok(
    Math.abs(latest.momentaryLufs - 0.0) < 0.1,
    `Expected Momentary LUFS near 0.00, got ${latest.momentaryLufs}`
  );
  assert.ok(
    Math.abs(latest.shortTermLufs - 0.0) < 0.1,
    `Expected Short-Term LUFS near 0.00, got ${latest.shortTermLufs}`
  );
});

test('LiveLoudnessPeakTracker holds peaks for 1.5s then decays smoothly and resets on command', () => {
  const sr = 48000;
  const tracker = new LiveLoudnessPeakTracker(sr);
  const loud = makeSine(1024, 1000, sr, 0.995); // ~-0.04 dBFS -> triggers clip latch
  const quiet = makeSine(1024, 1000, sr, 0.1); // -20 dBFS

  // Hit peak at t = 1000 ms
  const hit = tracker.update(loud, loud, 1000, true);
  assert.equal(hit.isClipping, true);
  const heldValue = hit.holdL;
  assert.ok(heldValue > -0.2);

  // Within 1.5s hold window (t = 2000 ms), holdL should stay pinned
  const duringHold = tracker.update(quiet, quiet, 2000, true);
  assert.equal(duringHold.holdL, heldValue);

  // Past 1.5s hold window, tick forward so decay drops smoothly
  let decayed = tracker.update(quiet, quiet, 2600, true);
  decayed = tracker.update(quiet, quiet, 2800, true);
  assert.ok(decayed.holdL < heldValue, `Expected holdL to decay below ${heldValue}, got ${decayed.holdL}`);

  // Reset clears hold & clip latch
  tracker.resetPeakHold();
  const afterReset = tracker.update(quiet, quiet, 2820, true);
  assert.equal(afterReset.isClipping, false);
  assert.ok(afterReset.holdL < -19.0, `Expected holdL near -20 dBFS after reset, got ${afterReset.holdL}`);
});

test('computeLiveStereoTelemetry distinguishes Mono, Anti-Phase, and Hard-Panned signals', () => {
  const sr = 48000;
  const sig = makeSine(1024, 440, sr, 0.5);
  const negSig = new Float32Array(sig.length);
  for (let i = 0; i < sig.length; i++) negSig[i] = -sig[i];
  const zero = new Float32Array(sig.length);

  // 1. Pure Mono (L == R) -> correlation +1.0, width 0%, balance 0
  const mono = computeLiveStereoTelemetry(sig, sig);
  assert.equal(mono.hasSignal, true);
  assert.ok(Math.abs(mono.correlation - 1.0) < 1e-4);
  assert.ok(mono.widthPct < 0.1);
  assert.ok(Math.abs(mono.balance) < 1e-4);

  // 2. Pure Anti-Phase (L == -R) -> correlation -1.0, width 100%
  const anti = computeLiveStereoTelemetry(sig, negSig);
  assert.ok(Math.abs(anti.correlation - -1.0) < 1e-4);
  assert.ok(Math.abs(anti.widthPct - 100) < 0.1);

  // 3. Hard Left -> balance -1.0; Hard Right -> balance +1.0
  const hardLeft = computeLiveStereoTelemetry(sig, zero);
  assert.ok(Math.abs(hardLeft.balance - -1.0) < 1e-4);
  const hardRight = computeLiveStereoTelemetry(zero, sig);
  assert.ok(Math.abs(hardRight.balance - 1.0) < 1e-4);
});

test('Formatting and meter ratio helpers handle edge cases cleanly', () => {
  assert.equal(formatPeakDb(-Infinity), '-∞ dBFS');
  assert.equal(formatPeakDb(-3.24), '-3.2 dBFS');
  assert.equal(formatLufs(-70.0), '-∞ LUFS');
  assert.equal(formatLufs(-13.84), '-13.8 LUFS');
  assert.equal(formatStereoBalance(0.005), 'C (0%)');
  assert.equal(formatStereoBalance(-0.25), '25% L');
  assert.equal(formatStereoBalance(0.42), '42% R');
  assert.equal(dbToMeterRatio(-60, -60, 0), 0);
  assert.equal(dbToMeterRatio(0, -60, 0), 1);
  assert.ok(Math.abs(dbToMeterRatio(-30, -60, 0) - 0.5) < 1e-6);
});

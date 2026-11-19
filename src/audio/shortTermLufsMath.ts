/**
 * Pure ITU-R BS.1770-4 K-Weighting, Sliding-Window Short-Term LUFS Timeline,
 * and Timestamp Clamping Utilities.
 *
 * Decoupled from Web Audio DOM globals so all DSP math is 100% unit-testable in Node.
 */

import { TimelineBucket, TimelineSeries } from '../contracts/analysisContract';

export interface ShortTermTimelineComputation {
  timeline: TimelineSeries | null;
  shortTermMaxLufs: number | null;
  momentaryMaxLufs: number | null;
  integratedLufs: number | null;
}

/**
 * Strictly clamps a [startSec, endSec] cue marker into [0, durationSeconds].
 */
export function clampTimestampRange(
  startSec: number,
  endSec: number,
  durationSeconds: number
): { start_sec: number; end_sec: number } {
  const safeDur = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0.1;
  const rawStart = Number.isFinite(startSec) ? startSec : 0;
  const rawEnd = Number.isFinite(endSec) ? endSec : rawStart;

  const clampedStart = Math.max(0, Math.min(safeDur, rawStart));
  const clampedEnd = Math.max(clampedStart, Math.min(safeDur, rawEnd));

  return {
    start_sec: Math.round(clampedStart * 100) / 100,
    end_sec: Math.round(clampedEnd * 100) / 100,
  };
}

/**
 * Scales a canonical reference timestamp into an actual track duration while
 * guaranteeing 0 <= start_sec <= end_sec <= actualDurationSec.
 */
export function scaleAndClampTimestamp(
  startSec: number,
  endSec: number,
  referenceDurationSec: number,
  actualDurationSec: number
): { start_sec: number; end_sec: number } {
  const safeActual = Number.isFinite(actualDurationSec) && actualDurationSec > 0 ? actualDurationSec : 0.1;
  const safeRef = Number.isFinite(referenceDurationSec) && referenceDurationSec > 0 ? referenceDurationSec : safeActual;

  if (Math.abs(safeActual - safeRef) < 0.01) {
    return clampTimestampRange(startSec, endSec, safeActual);
  }

  const ratio = safeActual / safeRef;
  let scaledStart = Math.max(0, Math.min(safeActual, startSec * ratio));
  let scaledEnd = Math.max(scaledStart, Math.min(safeActual, endSec * ratio));

  // Ensure visible minimum cue width on short clips while staying strictly inside [0, safeActual]
  const minSpan = Math.min(0.4, safeActual * 0.15);
  if (scaledEnd - scaledStart < minSpan) {
    if (scaledStart + minSpan <= safeActual) {
      scaledEnd = scaledStart + minSpan;
    } else {
      scaledEnd = safeActual;
      scaledStart = Math.max(0, safeActual - minSpan);
    }
  }

  return clampTimestampRange(scaledStart, scaledEnd, safeActual);
}

/**
 * Applies ITU-R BS.1770-4 Stage 1 (High-Shelf) + Stage 2 (High-Pass) K-weighting filter.
 */
export function applyItuKWeighting(samples: Float32Array, sampleRate: number): Float32Array {
  const n = samples.length;
  const out = new Float32Array(n);
  if (n === 0 || sampleRate <= 0) return out;

  // Stage 1: High shelf (f0 = 1681.974 Hz, G = +3.9998 dB)
  const f0Shelf = 1681.9744509555319;
  const gDb = 3.99984380697;
  const kShelf = Math.tan((Math.PI * f0Shelf) / sampleRate);
  const vh = Math.pow(10, gDb / 20.0);
  const vb = Math.pow(vh, 0.499666774155);
  const a0s = 1.0 + kShelf / 0.7071752369554193 + kShelf * kShelf;
  const b0s = (vh + vb * Math.SQRT2 * kShelf + kShelf * kShelf) / a0s;
  const b1s = (2.0 * (kShelf * kShelf - vh)) / a0s;
  const b2s = (vh - vb * Math.SQRT2 * kShelf + kShelf * kShelf) / a0s;
  const a1s = (2.0 * (kShelf * kShelf - 1.0)) / a0s;
  const a2s = (1.0 - kShelf / 0.7071752369554193 + kShelf * kShelf) / a0s;

  // Stage 2: High pass (f0 = 38.135 Hz, Q = 0.5003)
  const f0Hp = 38.13547087602444;
  const kHp = Math.tan((Math.PI * f0Hp) / sampleRate);
  const qHp = 0.5003270373253953;
  const a0hp = 1.0 + kHp / qHp + kHp * kHp;
  const b0hp = 1.0 / a0hp;
  const b1hp = -2.0 / a0hp;
  const b2hp = 1.0 / a0hp;
  const a1hp = (2.0 * (kHp * kHp - 1.0)) / a0hp;
  const a2hp = (1.0 - kHp / qHp + kHp * kHp) / a0hp;

  let s1s = 0;
  let s2s = 0;
  let s1hp = 0;
  let s2hp = 0;

  for (let i = 0; i < n; i++) {
    const x = samples[i];
    const ys = b0s * x + s1s;
    s1s = b1s * x - a1s * ys + s2s;
    s2s = b2s * x - a2s * ys;
    const yhp = b0hp * ys + s1hp;
    s1hp = b1hp * ys - a1hp * yhp + s2hp;
    s2hp = b2hp * ys - a2hp * yhp;
    out[i] = yhp;
  }

  return out;
}

/**
 * Computes real ITU-R BS.1770-4 K-weighted sliding-window Short-Term (3.0s)
 * and Momentary (400ms) LUFS timeline buckets directly from raw PCM channel arrays.
 *
 * Uses a 0.25s hop for clips <= 10s (and 0.5s–1.0s hop for longer tracks, capped at 240 buckets)
 * so even a 4.0s clip produces a dense, accurate EBU R128 Short-Term LUFS trajectory and Max ST.
 */
export function computeShortTermLufsTimelineFromChannels(
  channels: Float32Array[],
  sampleRate: number
): ShortTermTimelineComputation {
  if (!channels.length || sampleRate <= 0) {
    return { timeline: null, shortTermMaxLufs: null, momentaryMaxLufs: null, integratedLufs: null };
  }

  const numChannels = channels.length;
  const totalSamples = channels[0].length;
  if (totalSamples < Math.round(0.4 * sampleRate)) {
    return { timeline: null, shortTermMaxLufs: null, momentaryMaxLufs: null, integratedLufs: null };
  }

  const durationSec = totalSamples / sampleRate;

  // Apply ITU-R BS.1770-4 K-weighting and build a prefix-sum of total squared K-weighted energy
  // across all channels so every sliding window mean power is O(1).
  const kPrefix = new Float64Array(totalSamples + 1);
  const rawPeakPrefixCheck = { globalMax: 0 };

  for (let c = 0; c < numChannels; c++) {
    const raw = channels[c];
    const kw = applyItuKWeighting(raw, sampleRate);
    for (let i = 0; i < totalSamples; i++) {
      const s = kw[i];
      kPrefix[i + 1] += s * s;
      const a = Math.abs(raw[i]);
      if (a > rawPeakPrefixCheck.globalMax) rawPeakPrefixCheck.globalMax = a;
    }
  }

  if (rawPeakPrefixCheck.globalMax <= 1e-9) {
    return { timeline: null, shortTermMaxLufs: null, momentaryMaxLufs: null, integratedLufs: null };
  }

  for (let i = 1; i <= totalSamples; i++) {
    kPrefix[i] += kPrefix[i - 1];
  }

  const powerToLufs = (sumMeanSquareAcrossChannels: number): number | null => {
    if (sumMeanSquareAcrossChannels <= 1e-12) return null;
    const lufs = -0.691 + 10.0 * Math.log10(sumMeanSquareAcrossChannels);
    if (!Number.isFinite(lufs) || lufs <= -99.0) return null;
    return Math.round(lufs * 100) / 100;
  };

  // Integrated LUFS (400ms blocks, 100ms hop, ITU-R BS.1770-4 absolute + relative gating)
  const block400 = Math.max(1, Math.round(0.4 * sampleRate));
  const hop100 = Math.max(1, Math.round(0.1 * sampleRate));
  const blockPowers: number[] = [];
  for (let start = 0; start + block400 <= totalSamples; start += hop100) {
    const meanSq = (kPrefix[start + block400] - kPrefix[start]) / block400;
    blockPowers.push(meanSq);
  }
  let integratedLufs: number | null = null;
  const absThresh = Math.pow(10, (-70.0 + 0.691) / 10.0);
  const nonSilent = blockPowers.filter((p) => p > absThresh);
  if (nonSilent.length > 0) {
    const avgUngated = nonSilent.reduce((a, b) => a + b, 0) / nonSilent.length;
    const ungatedLufs = -0.691 + 10.0 * Math.log10(avgUngated);
    const relThresh = Math.pow(10, (ungatedLufs - 10.0 + 0.691) / 10.0);
    const gated = nonSilent.filter((p) => p > relThresh);
    if (gated.length > 0) {
      const avgGated = gated.reduce((a, b) => a + b, 0) / gated.length;
      integratedLufs = powerToLufs(avgGated);
    }
  }

  // Choose hop duration: 0.25s for clips <= 10s, 0.5s for medium clips, capped at 240 buckets
  let hopSec = durationSec <= 10.0 ? 0.25 : 0.5;
  let numBuckets = Math.max(8, Math.round(durationSec / hopSec));
  if (numBuckets > 240) {
    numBuckets = 240;
    hopSec = durationSec / numBuckets;
  } else {
    hopSec = durationSec / numBuckets;
  }

  const winShortSamples = Math.min(totalSamples, Math.max(1, Math.round(3.0 * sampleRate)));
  const winMomSamples = Math.min(totalSamples, Math.max(1, Math.round(0.4 * sampleRate)));

  const buckets: TimelineBucket[] = [];
  let shortTermMaxLufs: number | null = null;
  let momentaryMaxLufs: number | null = null;

  for (let b = 0; b < numBuckets; b++) {
    const startSec = b * hopSec;
    const endSec = Math.min(durationSec, (b + 1) * hopSec);
    const midSec = (startSec + endSec) * 0.5;
    const centerSample = Math.min(totalSamples - 1, Math.max(0, Math.round(midSec * sampleRate)));

    // Bucket raw peak/rms/clipped
    const bStart = Math.min(totalSamples - 1, Math.floor(startSec * sampleRate));
    const bEnd = Math.min(totalSamples, Math.max(bStart + 1, Math.floor(endSec * sampleRate)));
    let bPeak = 0;
    let bSumSq = 0;
    let bClipped = false;
    const stride = Math.max(1, Math.floor((bEnd - bStart) / 600));
    let sampleCount = 0;
    for (let c = 0; c < numChannels; c++) {
      const ch = channels[c];
      for (let i = bStart; i < bEnd; i += stride) {
        const v = ch[i];
        const a = Math.abs(v);
        if (a > bPeak) bPeak = a;
        if (a >= 0.9999) bClipped = true;
        bSumSq += v * v;
        sampleCount++;
      }
    }
    const peakDbfs = bPeak <= 1e-6 ? -120.0 : Math.round(20.0 * Math.log10(bPeak) * 10) / 10;
    const rmsLinear = sampleCount > 0 ? Math.sqrt(bSumSq / sampleCount) : 0;
    const rmsDbfs = rmsLinear <= 1e-6 ? -120.0 : Math.round(20.0 * Math.log10(rmsLinear) * 10) / 10;

    // Centered/clamped 3.0s Short-Term window
    let stStart = centerSample - Math.floor(winShortSamples / 2);
    if (stStart < 0) stStart = 0;
    if (stStart + winShortSamples > totalSamples) stStart = Math.max(0, totalSamples - winShortSamples);
    const stEnd = Math.min(totalSamples, stStart + winShortSamples);
    const stLen = Math.max(1, stEnd - stStart);
    const stMeanSq = (kPrefix[stEnd] - kPrefix[stStart]) / stLen;
    const stLufs = powerToLufs(stMeanSq);

    // Centered/clamped 400ms Momentary window
    let mStart = centerSample - Math.floor(winMomSamples / 2);
    if (mStart < 0) mStart = 0;
    if (mStart + winMomSamples > totalSamples) mStart = Math.max(0, totalSamples - winMomSamples);
    const mEnd = Math.min(totalSamples, mStart + winMomSamples);
    const mLen = Math.max(1, mEnd - mStart);
    const mMeanSq = (kPrefix[mEnd] - kPrefix[mStart]) / mLen;
    const mLufs = powerToLufs(mMeanSq);

    if (stLufs !== null && (shortTermMaxLufs === null || stLufs > shortTermMaxLufs)) {
      shortTermMaxLufs = stLufs;
    }
    if (mLufs !== null && (momentaryMaxLufs === null || mLufs > momentaryMaxLufs)) {
      momentaryMaxLufs = mLufs;
    }

    buckets.push({
      start_sec: Math.round(startSec * 100) / 100,
      end_sec: Math.round(endSec * 100) / 100,
      peak_dbfs: peakDbfs,
      rms_dbfs: rmsDbfs,
      momentary_lufs: mLufs !== null ? Math.round(mLufs * 10) / 10 : null,
      short_term_lufs: stLufs !== null ? Math.round(stLufs * 10) / 10 : null,
      phase_correlation: null,
      clipped: bClipped,
    });
  }

  return {
    timeline: {
      bucket_duration_sec: Math.round(hopSec * 1000) / 1000,
      total_duration_sec: Math.round(durationSec * 100) / 100,
      buckets,
    },
    shortTermMaxLufs: shortTermMaxLufs !== null ? Math.round(shortTermMaxLufs * 10) / 10 : null,
    momentaryMaxLufs: momentaryMaxLufs !== null ? Math.round(momentaryMaxLufs * 10) / 10 : null,
    integratedLufs,
  };
}

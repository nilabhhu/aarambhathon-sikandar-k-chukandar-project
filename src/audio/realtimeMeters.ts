/**
 * MixLearn Studio — Real-Time 60fps Audio Metering Math Engine
 *
 * Pure, zero-GC-per-frame metering logic shared by:
 * - StudioAudioEngine.getLiveLoudnessAndPeaks()
 * - StudioAudioEngine.getLiveStereoSamples()
 * - RealtimeLoudnessPeakMeter (<canvas> 60fps rAF)
 * - StereoImagerVectorscope (<canvas> 60fps rAF)
 */

export interface LiveLoudnessAndPeaks {
  peakL: number;
  peakR: number;
  holdL: number;
  holdR: number;
  momentaryLufs: number;
  shortTermLufs: number;
  isClipping: boolean;
  isPlaying: boolean;
}

export interface LiveStereoTelemetry {
  widthPct: number;
  balance: number; // -1.0 (Full Left) .. 0.0 (Center) .. +1.0 (Full Right)
  correlation: number; // -1.0 .. +1.0
  hasSignal: boolean;
}

export const METER_SILENCE_FLOOR_DB = -70.0;
export const PEAK_CLIP_THRESHOLD_DBFS = -0.1;
export const PEAK_HOLD_DURATION_MS = 1500;
export const PEAK_HOLD_DECAY_DB_PER_SEC = 18.0;
export const MOMENTARY_WINDOW_MS = 400;
export const SHORT_TERM_WINDOW_MS = 3000;

const LINEAR_SILENCE_EPS = 1e-7; // -140 dBFS linear floor

/**
 * Convert linear amplitude [0..inf] to dBFS (returns -Infinity on silence).
 */
export function linearToDbfs(amp: number): number {
  if (!Number.isFinite(amp) || amp <= LINEAR_SILENCE_EPS) {
    return -Infinity;
  }
  return 20.0 * Math.log10(amp);
}

/**
 * Map a dB value in [minDb, maxDb] to normalized [0..1] bar ratio.
 */
export function dbToMeterRatio(db: number, minDb: number = -60, maxDb: number = 0): number {
  if (!Number.isFinite(db) || db <= minDb) return 0;
  if (db >= maxDb) return 1;
  return (db - minDb) / (maxDb - minDb);
}

/**
 * Format peak dBFS cleanly with tabular sign alignment.
 */
export function formatPeakDb(db: number): string {
  if (!Number.isFinite(db) || db <= -69.95) return '-∞ dBFS';
  const clamped = Math.max(-69.9, Math.min(6.0, db));
  const prefix = clamped > 0.04 ? '+' : '';
  return `${prefix}${clamped.toFixed(1)} dBFS`;
}

/**
 * Format LUFS value cleanly with silence floor handling.
 */
export function formatLufs(lufs: number): string {
  if (!Number.isFinite(lufs) || lufs <= METER_SILENCE_FLOOR_DB + 0.05) {
    return '-∞ LUFS';
  }
  return `${lufs.toFixed(1)} LUFS`;
}

/**
 * Format L/R stereo balance [-1..+1] into studio shorthand (e.g., "C", "14% L", "8% R").
 */
export function formatStereoBalance(balance: number): string {
  if (!Number.isFinite(balance)) return 'C';
  const pct = Math.round(Math.abs(balance) * 100);
  if (pct < 2) return 'C (0%)';
  return balance < 0 ? `${pct}% L` : `${pct}% R`;
}

/**
 * Compute zero-allocation K-weighting biquad coefficients for ITU-R BS.1770-4
 * at any arbitrary sample rate.
 */
interface KWeightCoeffs {
  sampleRate: number;
  b0s: number;
  b1s: number;
  b2s: number;
  a1s: number;
  a2s: number;
  b0hp: number;
  b1hp: number;
  b2hp: number;
  a1hp: number;
  a2hp: number;
}

function buildKWeightCoeffs(sampleRate: number): KWeightCoeffs {
  const sr = Math.max(8000, sampleRate || 48000);

  // Stage 1: High shelf (f0 = 1681.974 Hz, G = +3.9998 dB)
  const f0Shelf = 1681.9744509555319;
  const gDb = 3.99984380697;
  const kShelf = Math.tan((Math.PI * f0Shelf) / sr);
  const vh = Math.pow(10, gDb / 20.0);
  const vb = Math.pow(vh, 0.499666774155);
  const a0s = 1.0 + kShelf / 0.7071752369554193 + kShelf * kShelf;

  // Stage 2: High pass (f0 = 38.135 Hz, Q = 0.5003)
  const f0Hp = 38.13547087602444;
  const kHp = Math.tan((Math.PI * f0Hp) / sr);
  const qHp = 0.5003270373253953;
  const a0hp = 1.0 + kHp / qHp + kHp * kHp;

  return {
    sampleRate: sr,
    b0s: (vh + vb * Math.SQRT2 * kShelf + kShelf * kShelf) / a0s,
    b1s: (2.0 * (kShelf * kShelf - vh)) / a0s,
    b2s: (vh - vb * Math.SQRT2 * kShelf + kShelf * kShelf) / a0s,
    a1s: (2.0 * (kShelf * kShelf - 1.0)) / a0s,
    a2s: (1.0 - kShelf / 0.7071752369554193 + kShelf * kShelf) / a0s,
    b0hp: 1.0 / a0hp,
    b1hp: -2.0 / a0hp,
    b2hp: 1.0 / a0hp,
    a1hp: (2.0 * (kHp * kHp - 1.0)) / a0hp,
    a2hp: (1.0 - kHp / qHp + kHp * kHp) / a0hp,
  };
}

/**
 * Compute K-weighted mean-square power for a single channel time-domain frame
 * with zero heap allocations. Skips a short 24-sample filter warm-up when n >= 128.
 */
function computeKWeightedFramePower(samples: Float32Array, c: KWeightCoeffs): number {
  const n = samples.length;
  if (n === 0) return 0;

  let s1s = 0;
  let s2s = 0;
  let s1hp = 0;
  let s2hp = 0;
  const warmup = n >= 128 ? 24 : 0;
  let sumSq = 0;
  let count = 0;

  const { b0s, b1s, b2s, a1s, a2s, b0hp, b1hp, b2hp, a1hp, a2hp } = c;

  for (let i = 0; i < n; i++) {
    const x = samples[i];
    const ys = b0s * x + s1s;
    s1s = b1s * x - a1s * ys + s2s;
    s2s = b2s * x - a2s * ys;

    const yhp = b0hp * ys + s1hp;
    s1hp = b1hp * ys - a1hp * yhp + s2hp;
    s2hp = b2hp * ys - a2hp * yhp;

    if (i >= warmup) {
      sumSq += yhp * yhp;
      count++;
    }
  }

  return count > 0 ? sumSq / count : 0;
}

/**
 * Zero-allocation real-time tracker for L/R Sample Peaks (with 1.5s peak-hold + smooth decay),
 * Clip Latch, 400ms Momentary LUFS, and 3.0s Short-Term LUFS ring buffer.
 */
export class LiveLoudnessPeakTracker {
  private static readonly RING_CAPACITY = 256; // > 4.2s at 60Hz

  private ringTimeMs: Float64Array = new Float64Array(LiveLoudnessPeakTracker.RING_CAPACITY);
  private ringPower: Float64Array = new Float64Array(LiveLoudnessPeakTracker.RING_CAPACITY);
  private ringHead = 0;
  private ringCount = 0;

  private kCoeffs: KWeightCoeffs;

  private holdLDb = -Infinity;
  private holdRDb = -Infinity;
  private holdLTimestampMs = 0;
  private holdRTimestampMs = 0;
  private lastTickMs = 0;
  private clipLatched = false;

  // Reusable output object to guarantee zero GC allocations per 60Hz frame
  private result: LiveLoudnessAndPeaks = {
    peakL: -Infinity,
    peakR: -Infinity,
    holdL: -Infinity,
    holdR: -Infinity,
    momentaryLufs: METER_SILENCE_FLOOR_DB,
    shortTermLufs: METER_SILENCE_FLOOR_DB,
    isClipping: false,
    isPlaying: false,
  };

  constructor(sampleRate: number = 48000) {
    this.kCoeffs = buildKWeightCoeffs(sampleRate);
  }

  public setSampleRate(sampleRate: number): void {
    if (sampleRate > 0 && Math.abs(sampleRate - this.kCoeffs.sampleRate) > 1) {
      this.kCoeffs = buildKWeightCoeffs(sampleRate);
    }
  }

  /**
   * Reset latched peak holds and clip indicator without resetting audio playback.
   */
  public resetPeakHold(): void {
    this.holdLDb = -Infinity;
    this.holdRDb = -Infinity;
    this.holdLTimestampMs = 0;
    this.holdRTimestampMs = 0;
    this.clipLatched = false;
  }

  /**
   * Clear loudness history ring buffers (e.g., when switching tracks or clearing audio).
   */
  public resetAll(): void {
    this.resetPeakHold();
    this.ringHead = 0;
    this.ringCount = 0;
    this.lastTickMs = 0;
    this.ringTimeMs.fill(0);
    this.ringPower.fill(0);
  }

  /**
   * Process one L/R stereo time-domain frame (zero heap allocations).
   */
  public update(
    bufL: Float32Array,
    bufR: Float32Array,
    nowMs: number,
    isPlaying: boolean
  ): LiveLoudnessAndPeaks {
    const dtSec =
      this.lastTickMs > 0 && nowMs >= this.lastTickMs
        ? Math.min(0.25, (nowMs - this.lastTickMs) / 1000)
        : 0;
    this.lastTickMs = nowMs;

    if (!isPlaying) {
      this.result.peakL = -Infinity;
      this.result.peakR = -Infinity;
      this.result.holdL = this.holdLDb;
      this.result.holdR = this.holdRDb;
      this.result.momentaryLufs = METER_SILENCE_FLOOR_DB;
      this.result.shortTermLufs = METER_SILENCE_FLOOR_DB;
      this.result.isClipping = this.clipLatched;
      this.result.isPlaying = false;
      return this.result;
    }

    const n = Math.min(bufL.length, bufR.length);
    let maxL = 0;
    let maxR = 0;
    for (let i = 0; i < n; i++) {
      const al = Math.abs(bufL[i]);
      const ar = Math.abs(bufR[i]);
      if (al > maxL) maxL = al;
      if (ar > maxR) maxR = ar;
    }

    const peakLDb = linearToDbfs(maxL);
    const peakRDb = linearToDbfs(maxR);

    // Update L Peak Hold (1.5s hold + smooth ballistic decay)
    if (peakLDb >= this.holdLDb) {
      this.holdLDb = peakLDb;
      this.holdLTimestampMs = nowMs;
    } else if (
      Number.isFinite(this.holdLDb) &&
      nowMs - this.holdLTimestampMs > PEAK_HOLD_DURATION_MS
    ) {
      this.holdLDb -= PEAK_HOLD_DECAY_DB_PER_SEC * dtSec;
      if (this.holdLDb < peakLDb) this.holdLDb = peakLDb;
      if (this.holdLDb < METER_SILENCE_FLOOR_DB) this.holdLDb = -Infinity;
    }

    // Update R Peak Hold (1.5s hold + smooth ballistic decay)
    if (peakRDb >= this.holdRDb) {
      this.holdRDb = peakRDb;
      this.holdRTimestampMs = nowMs;
    } else if (
      Number.isFinite(this.holdRDb) &&
      nowMs - this.holdRTimestampMs > PEAK_HOLD_DURATION_MS
    ) {
      this.holdRDb -= PEAK_HOLD_DECAY_DB_PER_SEC * dtSec;
      if (this.holdRDb < peakRDb) this.holdRDb = peakRDb;
      if (this.holdRDb < METER_SILENCE_FLOOR_DB) this.holdRDb = -Infinity;
    }

    // Latch clip indicator whenever either channel reaches >= -0.1 dBFS
    if (peakLDb >= PEAK_CLIP_THRESHOLD_DBFS || peakRDb >= PEAK_CLIP_THRESHOLD_DBFS) {
      this.clipLatched = true;
    }

    // K-weighted stereo power sum (ITU-R BS.1770-4 channel weights G_L = 1.0, G_R = 1.0)
    const powerL = computeKWeightedFramePower(bufL, this.kCoeffs);
    const powerR = computeKWeightedFramePower(bufR, this.kCoeffs);
    const stereoPower = powerL + powerR;

    // Push into ring buffer
    const cap = LiveLoudnessPeakTracker.RING_CAPACITY;
    this.ringTimeMs[this.ringHead] = nowMs;
    this.ringPower[this.ringHead] = stereoPower;
    this.ringHead = (this.ringHead + 1) % cap;
    if (this.ringCount < cap) {
      this.ringCount++;
    }

    // Aggregate 400ms Momentary & 3.0s Short-Term windows from ring buffer
    let momSum = 0;
    let momCount = 0;
    let stSum = 0;
    let stCount = 0;

    for (let k = 0; k < this.ringCount; k++) {
      const idx = (this.ringHead - 1 - k + cap) % cap;
      const ageMs = nowMs - this.ringTimeMs[idx];
      if (ageMs < 0) continue;
      if (ageMs > SHORT_TERM_WINDOW_MS) break;

      const p = this.ringPower[idx];
      stSum += p;
      stCount++;

      if (ageMs <= MOMENTARY_WINDOW_MS) {
        momSum += p;
        momCount++;
      }
    }

    const momPower = momCount > 0 ? momSum / momCount : 0;
    const stPower = stCount > 0 ? stSum / stCount : 0;

    const momentaryLufs =
      momPower > 1e-10
        ? Math.max(METER_SILENCE_FLOOR_DB, -0.691 + 10.0 * Math.log10(momPower))
        : METER_SILENCE_FLOOR_DB;

    const shortTermLufs =
      stPower > 1e-10
        ? Math.max(METER_SILENCE_FLOOR_DB, -0.691 + 10.0 * Math.log10(stPower))
        : METER_SILENCE_FLOOR_DB;

    this.result.peakL = peakLDb;
    this.result.peakR = peakRDb;
    this.result.holdL = this.holdLDb;
    this.result.holdR = this.holdRDb;
    this.result.momentaryLufs = momentaryLufs;
    this.result.shortTermLufs = shortTermLufs;
    this.result.isClipping = this.clipLatched;
    this.result.isPlaying = true;

    return this.result;
  }
}

/**
 * Compute live stereo width (%), L/R balance [-1..+1], and phase correlation [-1..+1]
 * directly from caller-provided L/R sample buffers (zero allocations when `out` is passed).
 */
export function computeLiveStereoTelemetry(
  bufL: Float32Array,
  bufR: Float32Array,
  out?: LiveStereoTelemetry
): LiveStereoTelemetry {
  const target: LiveStereoTelemetry = out ?? {
    widthPct: 0,
    balance: 0,
    correlation: 1,
    hasSignal: false,
  };

  const n = Math.min(bufL.length, bufR.length);
  if (n === 0) {
    target.widthPct = 0;
    target.balance = 0;
    target.correlation = 1;
    target.hasSignal = false;
    return target;
  }

  let sumLL = 0;
  let sumRR = 0;
  let sumLR = 0;
  let sumMid2 = 0;
  let sumSide2 = 0;
  const SQRT1_2 = Math.SQRT1_2;

  for (let i = 0; i < n; i++) {
    const l = bufL[i];
    const r = bufR[i];
    sumLL += l * l;
    sumRR += r * r;
    sumLR += l * r;
    const mid = (l + r) * SQRT1_2;
    const side = (l - r) * SQRT1_2;
    sumMid2 += mid * mid;
    sumSide2 += side * side;
  }

  const totalEnergy = sumLL + sumRR;
  if (totalEnergy < 1e-10) {
    target.widthPct = 0;
    target.balance = 0;
    target.correlation = 1;
    target.hasSignal = false;
    return target;
  }

  const rmsL = Math.sqrt(sumLL / n);
  const rmsR = Math.sqrt(sumRR / n);
  const rmsMid = Math.sqrt(sumMid2 / n);
  const rmsSide = Math.sqrt(sumSide2 / n);

  const corrDenom = Math.sqrt(sumLL * sumRR);
  const correlation =
    corrDenom > 1e-10 ? Math.max(-1, Math.min(1, sumLR / corrDenom)) : 0;

  // Width percentage: 0% for pure Mono (Side = 0), ~50% for uncorrelated stereo, 100% for pure Side
  const msTotal = rmsMid + rmsSide;
  const widthPct = msTotal > 1e-10 ? Math.max(0, Math.min(100, (rmsSide / msTotal) * 200)) : 0;

  // L/R Balance: -1.0 (Full Left), 0.0 (Center), +1.0 (Full Right)
  const lrTotal = rmsL + rmsR;
  const balance = lrTotal > 1e-10 ? Math.max(-1, Math.min(1, (rmsR - rmsL) / lrTotal)) : 0;

  target.widthPct = widthPct;
  target.balance = balance;
  target.correlation = correlation;
  target.hasSignal = true;
  return target;
}

/**
 * Pure Logarithmic Spectrum Analyzer Math Engine (20 Hz – 20 kHz)
 * Decoupled from DOM/Canvas/WebAudio for fast deterministic node:test verification
 * and zero-allocation 60fps requestAnimationFrame rendering.
 */

import { AnalysisIssue } from '../contracts/analysisContract';
import { SixBandMeasurements } from './spectralProfile';

export type LiveSpectrumZoneId =
  | 'sub'
  | 'low'
  | 'low_mid'
  | 'high_mid'
  | 'presence'
  | 'air';

export interface LiveSpectrumZoneDef {
  id: LiveSpectrumZoneId;
  code: string;
  label: string;
  rangeLabel: string;
  minHz: number;
  maxHz: number;
}

export const SPECTRUM_MIN_HZ = 20;
export const SPECTRUM_MAX_HZ = 20000;
export const SPECTRUM_MIN_DB = -84;
export const SPECTRUM_MAX_DB = -6;

export const SPECTRUM_GRID_FREQS: ReadonlyArray<{ hz: number; label: string }> = [
  { hz: 30, label: '30' },
  { hz: 60, label: '60' },
  { hz: 125, label: '125' },
  { hz: 250, label: '250' },
  { hz: 500, label: '500' },
  { hz: 1000, label: '1k' },
  { hz: 2000, label: '2k' },
  { hz: 4000, label: '4k' },
  { hz: 8000, label: '8k' },
  { hz: 16000, label: '16k' },
];

export const LIVE_SPECTRUM_ZONES: ReadonlyArray<LiveSpectrumZoneDef> = [
  { id: 'sub', code: 'SUB', label: 'Sub', rangeLabel: '20–60 Hz', minHz: 20, maxHz: 60 },
  { id: 'low', code: 'LOW', label: 'Low', rangeLabel: '60–250 Hz', minHz: 60, maxHz: 250 },
  { id: 'low_mid', code: 'LOW-MID', label: 'Low-Mid', rangeLabel: '250–800 Hz', minHz: 250, maxHz: 800 },
  { id: 'high_mid', code: 'HIGH-MID', label: 'High-Mid', rangeLabel: '800–4k Hz', minHz: 800, maxHz: 4000 },
  { id: 'presence', code: 'PRESENCE', label: 'Presence', rangeLabel: '4k–10k Hz', minHz: 4000, maxHz: 10000 },
  { id: 'air', code: 'AIR', label: 'Air', rangeLabel: '10k–20k Hz', minHz: 10000, maxHz: 20000 },
];

const LOG_MIN = Math.log10(SPECTRUM_MIN_HZ);
const LOG_MAX = Math.log10(SPECTRUM_MAX_HZ);
const LOG_SPAN = LOG_MAX - LOG_MIN;

/**
 * Convert frequency (Hz) to normalized logarithmic horizontal ratio [0..1].
 */
export function freqToLogRatio(hz: number): number {
  const clamped = Math.max(SPECTRUM_MIN_HZ, Math.min(SPECTRUM_MAX_HZ, hz));
  return (Math.log10(clamped) - LOG_MIN) / LOG_SPAN;
}

/**
 * Convert normalized logarithmic horizontal ratio [0..1] back to frequency (Hz).
 */
export function logRatioToFreq(ratio: number): number {
  const clamped = Math.max(0, Math.min(1, ratio));
  return Math.pow(10, LOG_MIN + clamped * LOG_SPAN);
}

/**
 * Convert dBFS value to normalized vertical bar height [0..1].
 */
export function spectrumDbToNorm(
  db: number,
  minDb: number = SPECTRUM_MIN_DB,
  maxDb: number = SPECTRUM_MAX_DB
): number {
  if (!Number.isFinite(db) || db <= minDb) return 0;
  if (db >= maxDb) return 1;
  return (db - minDb) / (maxDb - minDb);
}

/**
 * Format frequency nicely in Hz or kHz for crisp tabular telemetry.
 */
export function formatFreqHz(hz: number): string {
  if (!Number.isFinite(hz)) return '— Hz';
  if (hz >= 10000) return `${(hz / 1000).toFixed(1)} kHz`;
  if (hz >= 1000) return `${(hz / 1000).toFixed(2)} kHz`;
  return `${Math.round(hz)} Hz`;
}

/**
 * Identify which of the 6 canonical frequency zones contains `hz`.
 */
export function findZoneAtFreq(hz: number): LiveSpectrumZoneDef {
  for (let i = 0; i < LIVE_SPECTRUM_ZONES.length; i++) {
    const z = LIVE_SPECTRUM_ZONES[i];
    if (hz >= z.minHz && hz < z.maxHz) {
      return z;
    }
  }
  return hz < SPECTRUM_MIN_HZ
    ? LIVE_SPECTRUM_ZONES[0]
    : LIVE_SPECTRUM_ZONES[LIVE_SPECTRUM_ZONES.length - 1];
}

/**
 * Maps an AnalysisIssue to one of the 6 canonical live spectrum zones.
 */
export function mapIssueToLiveZone(issue: AnalysisIssue): LiveSpectrumZoneId {
  for (const ev of issue.evidence || []) {
    if (ev.metric_key === 'sub_bass_energy_20_60hz') return 'sub';
    if (ev.metric_key === 'mud_band_energy_200_500hz') return 'low_mid';
    if (ev.metric_key === 'presence_band_energy_2k_5khz') return 'presence';
    if (ev.metric_key === 'air_band_energy_10k_20khz') return 'air';
  }
  const text = `${issue.title} ${issue.learning_guide?.what_was_detected || ''}`.toLowerCase();
  if (text.includes('sub') || text.includes('20–60') || text.includes('20-60')) return 'sub';
  if (text.includes('bass') || text.includes('140 hz') || text.includes('phase')) return 'low';
  if (text.includes('mud') || text.includes('200–500') || text.includes('200-500') || text.includes('320') || text.includes('low-mid')) return 'low_mid';
  if (text.includes('harsh') || text.includes('4khz') || text.includes('4 khz') || text.includes('presence') || text.includes('sibilan') || text.includes('2–5') || text.includes('2-5')) return 'presence';
  if (text.includes('air') || text.includes('10–20') || text.includes('10-20')) return 'air';
  if (issue.domain === 'true_peak_clipping') return 'presence';
  if (issue.domain === 'phase_polarity' || issue.domain === 'stereo_field') return 'low';
  return 'high_mid';
}

/**
 * Zero-allocation aggregation of linear FFT dBFS bins (e.g., 1024 bins from fftSize=2048)
 * into `barCount` logarithmically spaced bars from 20 Hz to 20 kHz.
 */
export function aggregateFftToLogBars(
  fftDbBins: Float32Array,
  sampleRate: number,
  outBarDb: Float32Array
): void {
  const barCount = outBarDb.length;
  const binCount = fftDbBins.length;
  if (barCount === 0 || binCount === 0 || sampleRate <= 0) return;

  const fftSize = binCount * 2;
  const hzPerBin = sampleRate / fftSize;

  for (let i = 0; i < barCount; i++) {
    const fLo = logRatioToFreq(i / barCount);
    const fHi = logRatioToFreq((i + 1) / barCount);
    const bLo = Math.max(1, Math.floor(fLo / hzPerBin));
    const bHi = Math.min(binCount - 1, Math.max(bLo, Math.ceil(fHi / hzPerBin)));

    let peakDb = SPECTRUM_MIN_DB;
    let sumPower = 0;
    let count = 0;
    for (let b = bLo; b <= bHi; b++) {
      const v = fftDbBins[b];
      if (Number.isFinite(v)) {
        if (v > peakDb) peakDb = v;
        if (v > SPECTRUM_MIN_DB - 12) {
          sumPower += Math.pow(10, v / 10);
        }
        count++;
      }
    }

    if (count === 0) {
      outBarDb[i] = SPECTRUM_MIN_DB;
    } else {
      // Blend peak & power-domain mean so narrow tones and high-frequency transients read accurately
      const meanPower = sumPower / count;
      const powerMeanDb = meanPower > 1e-12 ? 10 * Math.log10(meanPower) : SPECTRUM_MIN_DB;
      outBarDb[i] = Math.max(
        SPECTRUM_MIN_DB,
        Math.min(SPECTRUM_MAX_DB, peakDb * 0.65 + powerMeanDb * 0.35)
      );
    }
  }
}

/**
 * Zero-allocation mapping of a track's static 48 Welch PSD bins (or 6-band averages)
 * onto `outBarDb` so paused tracks on /simple and /advanced display their real measured spectrum.
 */
export function mapStaticSpectrumToLogBars(
  outBarDb: Float32Array,
  spectrumBins48?: number[] | null,
  sixBands?: SixBandMeasurements | null
): boolean {
  const barCount = outBarDb.length;
  if (barCount === 0) return false;

  if (spectrumBins48 && spectrumBins48.length >= 48) {
    // Source 48 bins span 6 ranges of 8 bins each:
    // [20-60, 60-250, 250-500, 500-2000, 2000-6000, 6000-20000]
    const ranges: ReadonlyArray<[number, number]> = [
      [20, 60],
      [60, 250],
      [250, 500],
      [500, 2000],
      [2000, 6000],
      [6000, 20000],
    ];

    for (let i = 0; i < barCount; i++) {
      const centerHz = logRatioToFreq((i + 0.5) / barCount);
      let bandIdx = ranges.length - 1;
      for (let r = 0; r < ranges.length; r++) {
        if (centerHz >= ranges[r][0] && centerHz < ranges[r][1]) {
          bandIdx = r;
          break;
        }
      }
      const [rLo, rHi] = ranges[bandIdx];
      const frac = Math.max(0, Math.min(0.9999, Math.log(centerHz / rLo) / Math.log(rHi / rLo)));
      const srcFloat = bandIdx * 8 + frac * 7.99;
      const idx0 = Math.min(47, Math.max(0, Math.floor(srcFloat)));
      const idx1 = Math.min(47, idx0 + 1);
      const t = srcFloat - idx0;
      const v0 = Number.isFinite(spectrumBins48[idx0]) ? spectrumBins48[idx0] : -54;
      const v1 = Number.isFinite(spectrumBins48[idx1]) ? spectrumBins48[idx1] : v0;
      // Shift Welch PSD band-sum dB cleanly into the [-84..-6] visualizer dynamic window
      const db = (v0 * (1 - t) + v1 * t) - 10;
      outBarDb[i] = Math.max(SPECTRUM_MIN_DB, Math.min(SPECTRUM_MAX_DB, db));
    }
    return true;
  }

  if (sixBands) {
    const vals: number[] = [
      sixBands.sub ?? -34,
      sixBands.low ?? -26,
      sixBands.low_mid ?? -25,
      sixBands.high_mid ?? -24,
      sixBands.presence ?? -27,
      sixBands.air ?? -36,
    ];
    for (let i = 0; i < barCount; i++) {
      const centerHz = logRatioToFreq((i + 0.5) / barCount);
      const zIdx = LIVE_SPECTRUM_ZONES.findIndex((z) => centerHz >= z.minHz && centerHz < z.maxHz);
      const idx = zIdx === -1 ? 5 : zIdx;
      const base = vals[idx] - 10;
      const ripple = Math.sin(i * 0.72) * 1.4;
      outBarDb[i] = Math.max(SPECTRUM_MIN_DB, Math.min(SPECTRUM_MAX_DB, base + ripple));
    }
    return true;
  }

  return false;
}

/**
 * Zero-allocation subtle pointer-reactive harmonic wave for the Hero idle state on `/`.
 */
export function computeHeroHarmonicWave(
  outBarDb: Float32Array,
  timeSec: number,
  pointerRatioX: number | null,
  reducedMotion: boolean
): void {
  const n = outBarDb.length;
  const t = reducedMotion ? 1.4 : timeSec;

  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n; // 0..1 across 20Hz..20kHz
    // Natural pink-noise-like musical tilt (stronger lows/mids, gentle high roll-off)
    const tilt = -18 - Math.pow(u, 1.35) * 26;
    const subBump = Math.exp(-Math.pow((u - 0.14) / 0.11, 2)) * 12;
    const midBody = Math.exp(-Math.pow((u - 0.44) / 0.18, 2)) * 9;
    const airLift = Math.exp(-Math.pow((u - 0.78) / 0.14, 2)) * 5;

    const wave1 = Math.sin(u * 13.0 - t * 2.1) * 5.2;
    const wave2 = Math.cos(u * 23.0 + t * 1.45) * 3.1;
    const pulse = Math.sin(t * 2.8 + u * 4.0) * 2.4;

    let pointerBoost = 0;
    if (pointerRatioX !== null && pointerRatioX >= 0 && pointerRatioX <= 1) {
      const dist = Math.abs(u - pointerRatioX);
      pointerBoost = Math.exp(-Math.pow(dist / 0.085, 2)) * 14.5;
    }

    const db = tilt + subBump + midBody + airLift + wave1 + wave2 + pulse + pointerBoost;
    outBarDb[i] = Math.max(SPECTRUM_MIN_DB + 4, Math.min(SPECTRUM_MAX_DB - 2, db));
  }
}

/**
 * Updates falling vermilion peak-hold caps cleanly in-place (zero allocations).
 */
export function updatePeakHolds(
  currentDb: Float32Array,
  peakHoldDb: Float32Array,
  holdTimerSec: Float32Array,
  dtSec: number
): void {
  const n = Math.min(currentDb.length, peakHoldDb.length, holdTimerSec.length);
  const dt = Math.min(0.1, Math.max(0.001, dtSec));
  const HOLD_DURATION_SEC = 0.42;
  const FALL_DB_PER_SEC = 26.0;

  for (let i = 0; i < n; i++) {
    const cur = currentDb[i];
    if (cur >= peakHoldDb[i]) {
      peakHoldDb[i] = cur;
      holdTimerSec[i] = HOLD_DURATION_SEC;
    } else if (holdTimerSec[i] > 0) {
      holdTimerSec[i] = Math.max(0, holdTimerSec[i] - dt);
    } else {
      peakHoldDb[i] = Math.max(cur, peakHoldDb[i] - FALL_DB_PER_SEC * dt);
    }
  }
}

/**
 * MixLearn Studio — Web Audio Studio Engine (Phase 3)
 *
 * Singleton Web Audio engine lifted above routes so switching between
 * /simple and /advanced preserves loaded buffers and playback position.
 *
 * Features:
 * - Sample-locked dual-buffer playback (Primary Mix A + optional Reference Track B)
 * - Loudness-matched Reference A/B via real ITU-R BS.1770-4 K-weighted integrated LUFS
 * - Zero audio clicks/pops: 15ms exponential GainNode ramps (setTargetAtTime, tau = 0.015s)
 *   on Play/Pause, A/B switch, Stereo/Mono fold, and Translation Lab filter switches
 * - Equal-power mono folding: 0.5 * L + 0.5 * R (never naive L + R)
 * - Mix Translation Lab (BiquadFilterNode chains):
 *     - Full Range (bypass)
 *     - Smartphone Approx. (HPF 280 Hz, +2.5 dB peaking @ 2.2 kHz, LPF 11 kHz, equal-power mono)
 *     - Laptop Approx. (HPF 160 Hz, LPF 14 kHz, narrowed stereo width via Mid/Side gain matrix)
 * - Cached waveform peak extraction & 6-band Welch FFT measurements directly from AudioBuffer
 * - Real-time stereo phase correlation readout from paired L/R AnalyserNodes
 */

import {
  computeLoudnessMatchGainOffsetDb,
  dbToLinearGain,
  SixBandMeasurements,
} from './spectralProfile';
import {
  LiveLoudnessAndPeaks,
  LiveLoudnessPeakTracker,
} from './realtimeMeters';

export type { LiveLoudnessAndPeaks };

export type ActiveDeck = 'A' | 'B' | 'V2';
export type TranslationMode = 'full' | 'phone' | 'laptop';

export interface LoopRegion {
  startSec: number;
  endSec: number;
  label?: string;
}

export interface WaveformPeakBucket {
  peak: number;
  rms: number;
  clipped: boolean;
}

export interface StudioEngineSnapshot {
  hasPrimaryMix: boolean;
  primaryFileName: string | null;
  primaryDurationSec: number;
  primarySampleRate: number;
  primaryChannels: number;
  primaryLufs: number | null;
  primarySixBands: SixBandMeasurements | null;
  primarySpectrumBins: number[] | null;

  hasReferenceTrack: boolean;
  referenceFileName: string | null;
  referenceDurationSec: number;
  referenceLufs: number | null;
  referenceSixBands: SixBandMeasurements | null;
  referenceMatchOffsetDb: number | null;
  loudnessMatchEnabled: boolean;
  loadingReference: boolean;

  hasRevisionV2: boolean;
  revisionV2FileName: string | null;
  revisionV2DurationSec: number;
  revisionV2Lufs: number | null;
  revisionV2SixBands: SixBandMeasurements | null;
  revisionV2MatchOffsetDb: number | null;
  loadingRevisionV2: boolean;

  isPlaying: boolean;
  activeDeck: ActiveDeck;
  monoMode: boolean;
  translationMode: TranslationMode;
  loopRegion: LoopRegion | null;
  isLooping: boolean;
  playbackError: string | null;
}

export const TRANSLATION_PROFILES: Record<
  TranslationMode,
  {
    label: string;
    shortLabel: string;
    isApproximation: boolean;
    disclosure: string;
    filterSummary: string;
  }
> = {
  full: {
    label: 'Full Range',
    shortLabel: 'Full',
    isApproximation: false,
    disclosure: 'Direct studio monitoring bypass — flat frequency response with unmodified stereo field.',
    filterSummary: 'Flat bypass · Full stereo',
  },
  phone: {
    label: 'Smartphone Approx.',
    shortLabel: 'Phone',
    isApproximation: true,
    disclosure:
      'Educational linear-filter approximation (not a physical speaker replica): HPF 280 Hz, +2.5 dB midrange peaking @ 2.2 kHz, LPF 11 kHz, summed to equal-power mono.',
    filterSummary: 'HPF 280 Hz · +2.5 dB @ 2.2 kHz · LPF 11 kHz · Equal-power mono',
  },
  laptop: {
    label: 'Laptop Approx.',
    shortLabel: 'Laptop',
    isApproximation: true,
    disclosure:
      'Educational linear-filter approximation (not a physical speaker replica): HPF 160 Hz, LPF 14 kHz, narrowed stereo width (45% side energy).',
    filterSummary: 'HPF 160 Hz · LPF 14 kHz · Narrowed stereo width',
  },
};

const RAMP_TAU_SEC = 0.015; // 15ms exponential time constant for click-free transitions

/**
 * Computes real ITU-R BS.1770-4 K-weighted integrated LUFS directly on an AudioBuffer.
 */
function measureIntegratedLufsFromBuffer(buffer: AudioBuffer): number | null {
  const sampleRate = buffer.sampleRate;
  const channels = buffer.numberOfChannels;
  const n = buffer.length;
  if (n < Math.round(0.4 * sampleRate)) return null;

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

  const kWeighted: Float32Array[] = [];
  for (let c = 0; c < channels; c++) {
    const src = buffer.getChannelData(c);
    const out = new Float32Array(n);
    let s1s = 0, s2s = 0, s1hp = 0, s2hp = 0;
    for (let i = 0; i < n; i++) {
      const x = src[i];
      const ys = b0s * x + s1s;
      s1s = b1s * x - a1s * ys + s2s;
      s2s = b2s * x - a2s * ys;
      const yhp = b0hp * ys + s1hp;
      s1hp = b1hp * ys - a1hp * yhp + s2hp;
      s2hp = b2hp * ys - a2hp * yhp;
      out[i] = yhp;
    }
    kWeighted.push(out);
  }

  const blockSize = Math.round(0.4 * sampleRate);
  const hopSize = Math.max(1, Math.round(0.1 * sampleRate));
  const blockPowers: number[] = [];

  for (let start = 0; start + blockSize <= n; start += hopSize) {
    let blockSum = 0;
    for (let c = 0; c < channels; c++) {
      const ch = kWeighted[c];
      let chSum = 0;
      for (let j = 0; j < blockSize; j++) {
        const s = ch[start + j];
        chSum += s * s;
      }
      blockSum += chSum / blockSize;
    }
    blockPowers.push(blockSum);
  }

  const absThreshold = Math.pow(10, (-70.0 + 0.691) / 10.0);
  const nonSilent = blockPowers.filter((p) => p > absThreshold);
  if (nonSilent.length === 0) return null;

  const avgUngated = nonSilent.reduce((a, b) => a + b, 0) / nonSilent.length;
  const ungatedLufs = -0.691 + 10.0 * Math.log10(avgUngated);
  const relThreshold = Math.pow(10, (ungatedLufs - 10.0 + 0.691) / 10.0);
  const gated = nonSilent.filter((p) => p > relThreshold);
  if (gated.length === 0) return null;

  const avgGated = gated.reduce((a, b) => a + b, 0) / gated.length;
  return Math.round((-0.691 + 10.0 * Math.log10(avgGated)) * 100) / 100;
}

/**
 * In-place Radix-2 Cooley-Tukey FFT for fast, exact 6-band Welch PSD computation.
 */
function fftRadix2(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  let j = 0;
  for (let i = 0; i < n; i++) {
    if (i < j) {
      const tr = real[i];
      real[i] = real[j];
      real[j] = tr;
      const ti = imag[i];
      imag[i] = imag[j];
      imag[j] = ti;
    }
    let m = n >> 1;
    while (m >= 1 && j >= m) {
      j -= m;
      m >>= 1;
    }
    j += m;
  }

  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angleStep = (-2.0 * Math.PI) / len;
    const wStepR = Math.cos(angleStep);
    const wStepI = Math.sin(angleStep);
    for (let i = 0; i < n; i += len) {
      let wr = 1.0;
      let wi = 0.0;
      for (let k = 0; k < halfLen; k++) {
        const idx1 = i + k;
        const idx2 = idx1 + halfLen;
        const tr = wr * real[idx2] - wi * imag[idx2];
        const ti = wr * imag[idx2] + wi * real[idx2];
        real[idx2] = real[idx1] - tr;
        imag[idx2] = imag[idx1] - ti;
        real[idx1] += tr;
        imag[idx1] += ti;
        const nextWr = wr * wStepR - wi * wStepI;
        wi = wr * wStepI + wi * wStepR;
        wr = nextWr;
      }
    }
  }
}

/**
 * Computes exact 6-band Welch PSD energy (dBFS) across:
 * Sub (20–60), Low (60–250), Low-Mid (250–800), High-Mid (800–4k), Presence (4k–10k), Air (10k–20k).
 */
function measureFullSpectrumFromBuffer(buffer: AudioBuffer): {
  sixBands: SixBandMeasurements;
  bins48: number[] | null;
} {
  const sr = buffer.sampleRate;
  const nyquist = sr / 2;
  const channels = buffer.numberOfChannels;
  const n = buffer.length;
  const fftSize = Math.min(4096, Math.max(512, Math.pow(2, Math.floor(Math.log2(Math.max(512, n))))));

  if (n < fftSize) {
    return {
      sixBands: { sub: null, low: null, low_mid: null, high_mid: null, presence: null, air: null },
      bins48: null,
    };
  }

  const hann = new Float32Array(fftSize);
  let windowNorm = 0;
  for (let i = 0; i < fftSize; i++) {
    const w = 0.5 * (1.0 - Math.cos((2.0 * Math.PI * i) / (fftSize - 1)));
    hann[i] = w;
    windowNorm += w * w;
  }

  const hop = fftSize >> 1;
  const numBlocks = Math.max(1, Math.floor((n - fftSize) / hop) + 1);
  const blockStep = Math.max(1, Math.floor(numBlocks / 36));
  const halfBins = fftSize >> 1;
  const avgPower = new Float64Array(halfBins);
  const real = new Float32Array(fftSize);
  const imag = new Float32Array(fftSize);
  let counted = 0;

  for (let c = 0; c < channels; c++) {
    const ch = buffer.getChannelData(c);
    for (let blk = 0; blk < numBlocks; blk += blockStep) {
      const start = blk * hop;
      for (let i = 0; i < fftSize; i++) {
        real[i] = ch[start + i] * hann[i];
        imag[i] = 0;
      }
      fftRadix2(real, imag);
      for (let k = 1; k < halfBins; k++) {
        // Two-sided -> one-sided power scaling (factor 2) normalized by window energy
        const magSq = real[k] * real[k] + imag[k] * imag[k];
        avgPower[k] += (2.0 * magSq) / (fftSize * windowNorm);
      }
      counted++;
    }
  }

  const hzPerBin = sr / fftSize;
  const bandPower = (minHz: number, maxHz: number): number | null => {
    if (nyquist < maxHz && maxHz >= 18000) {
      return null;
    }
    const b0 = Math.max(1, Math.floor(minHz / hzPerBin));
    const b1 = Math.min(halfBins - 1, Math.ceil(Math.min(maxHz, nyquist) / hzPerBin));
    if (b1 < b0) return null;
    let sum = 0;
    for (let k = b0; k <= b1; k++) {
      sum += avgPower[k] / Math.max(1, counted);
    }
    if (sum <= 1e-12) return -96.0;
    return Math.round(10.0 * Math.log10(sum) * 10) / 10;
  };

  const sixBands: SixBandMeasurements = {
    sub: bandPower(20, 60),
    low: bandPower(60, 250),
    low_mid: bandPower(250, 800),
    high_mid: bandPower(800, 4000),
    presence: bandPower(4000, 10000),
    air: bandPower(10000, 20000),
  };

  // Extract 48 log-spaced bins (8 per retro band: 20-60, 60-250, 250-500, 500-2k, 2k-6k, 6k-20k)
  const retroRanges: Array<[number, number]> = [
    [20, 60],
    [60, 250],
    [250, 500],
    [500, 2000],
    [2000, 6000],
    [6000, 20000],
  ];
  const bins48: number[] = [];
  for (const [fMin, fMax] of retroRanges) {
    for (let k = 0; k < 8; k++) {
      const subLo = fMin * Math.pow(fMax / fMin, k / 8);
      const subHi = fMin * Math.pow(fMax / fMin, (k + 1) / 8);
      const val = bandPower(subLo, subHi);
      bins48.push(val !== null ? val : -54.0);
    }
  }

  return { sixBands, bins48 };
}

function measureSixBandSpectrumFromBuffer(buffer: AudioBuffer): SixBandMeasurements {
  return measureFullSpectrumFromBuffer(buffer).sixBands;
}

function extractWaveformPeaks(buffer: AudioBuffer, bucketCount: number = 220): WaveformPeakBucket[] {
  const totalSamples = buffer.length;
  const channels = buffer.numberOfChannels;
  const samplesPerBucket = Math.max(1, Math.floor(totalSamples / bucketCount));
  const result: WaveformPeakBucket[] = [];

  for (let b = 0; b < bucketCount; b++) {
    const start = b * samplesPerBucket;
    const end = Math.min(totalSamples, start + samplesPerBucket);
    let peak = 0;
    let sumSq = 0;
    let clipped = false;
    let count = 0;
    // Subsample large buckets slightly for instant extraction while preserving peaks
    const stride = Math.max(1, Math.floor((end - start) / 1200));

    for (let c = 0; c < channels; c++) {
      const ch = buffer.getChannelData(c);
      for (let i = start; i < end; i += stride) {
        const a = Math.abs(ch[i]);
        if (a > peak) peak = a;
        if (a >= 0.999) clipped = true;
        sumSq += a * a;
        count++;
      }
    }
    const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
    result.push({
      peak: Math.min(1, peak),
      rms: Math.min(peak, rms),
      clipped,
    });
  }

  return result;
}

export class StudioAudioEngine {
  private ctx: AudioContext | null = null;
  private graphReady = false;

  // Buffers & metadata
  private primaryBuffer: AudioBuffer | null = null;
  private primaryFile: File | null = null;
  private primaryLufs: number | null = null;
  private primarySixBands: SixBandMeasurements | null = null;
  private primarySpectrumBins: number[] | null = null;
  private primaryPeaksCache: WaveformPeakBucket[] | null = null;

  private referenceBuffer: AudioBuffer | null = null;
  private referenceFileName: string | null = null;
  private referenceLufs: number | null = null;
  private referenceSixBands: SixBandMeasurements | null = null;
  private referenceMatchOffsetDb: number | null = null;
  private loudnessMatchEnabled = true;
  private loadingReference = false;

  private revisionV2Buffer: AudioBuffer | null = null;
  private revisionV2FileName: string | null = null;
  private revisionV2Lufs: number | null = null;
  private revisionV2SixBands: SixBandMeasurements | null = null;
  private revisionV2MatchOffsetDb: number | null = null;
  private loadingRevisionV2 = false;

  // Active sources (sample-locked)
  private sourceANode: AudioBufferSourceNode | null = null;
  private sourceBNode: AudioBufferSourceNode | null = null;
  private sourceV2Node: AudioBufferSourceNode | null = null;

  // Persistent Audio Graph Nodes
  private deckAGain: GainNode | null = null;
  private deckBGain: GainNode | null = null;
  private refMatchGain: GainNode | null = null;
  private deckV2Gain: GainNode | null = null;
  private v2MatchGain: GainNode | null = null;
  private deckBus: GainNode | null = null;

  // Stereo / Equal-Power Mono Fold stage
  private stereoPathGain: GainNode | null = null;
  private monoPathGain: GainNode | null = null;
  private monoBusOut: GainNode | null = null;

  // Translation Lab parallel branches
  private fullRangeGain: GainNode | null = null;
  private phoneBranchGain: GainNode | null = null;
  private laptopBranchGain: GainNode | null = null;
  private masterGain: GainNode | null = null;

  // Real-time stereo correlation & 60fps studio metering analysers (pre-allocated, zero GC)
  private analyserL: AnalyserNode | null = null;
  private analyserR: AnalyserNode | null = null;
  private corrBufL: Float32Array<ArrayBuffer> = new Float32Array(1024);
  private corrBufR: Float32Array<ArrayBuffer> = new Float32Array(1024);
  private meterBufL: Float32Array<ArrayBuffer> = new Float32Array(1024);
  private meterBufR: Float32Array<ArrayBuffer> = new Float32Array(1024);
  private liveLoudnessTracker = new LiveLoudnessPeakTracker(48000);

  // Playback timing state (AudioContext clock driven)
  private isPlaying = false;
  private startCtxTime = 0;
  private offsetSec = 0;
  private activeDeck: ActiveDeck = 'A';
  private monoMode = false;
  private translationMode: TranslationMode = 'full';
  private loopRegion: LoopRegion | null = null;
  private isLooping = false;
  private playbackError: string | null = null;
  private pauseStopTimer: ReturnType<typeof setTimeout> | null = null;
  private loopCheckInterval: ReturnType<typeof setInterval> | null = null;

  // Snapshot subscription
  private listeners = new Set<() => void>();
  private cachedSnapshot: StudioEngineSnapshot;

  constructor() {
    this.cachedSnapshot = this.buildSnapshot();
  }

  private emit(): void {
    this.cachedSnapshot = this.buildSnapshot();
    for (const listener of this.listeners) {
      listener();
    }
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public getSnapshot = (): StudioEngineSnapshot => {
    return this.cachedSnapshot;
  };

  private buildSnapshot(): StudioEngineSnapshot {
    return {
      hasPrimaryMix: Boolean(this.primaryBuffer),
      primaryFileName: this.primaryFile?.name ?? null,
      primaryDurationSec: this.primaryBuffer?.duration ?? 0,
      primarySampleRate: this.primaryBuffer?.sampleRate ?? 0,
      primaryChannels: this.primaryBuffer?.numberOfChannels ?? 0,
      primaryLufs: this.primaryLufs,
      primarySixBands: this.primarySixBands,
      primarySpectrumBins: this.primarySpectrumBins,

      hasReferenceTrack: Boolean(this.referenceBuffer),
      referenceFileName: this.referenceFileName,
      referenceDurationSec: this.referenceBuffer?.duration ?? 0,
      referenceLufs: this.referenceLufs,
      referenceSixBands: this.referenceSixBands,
      referenceMatchOffsetDb: this.referenceMatchOffsetDb,
      loudnessMatchEnabled: this.loudnessMatchEnabled,
      loadingReference: this.loadingReference,

      hasRevisionV2: Boolean(this.revisionV2Buffer),
      revisionV2FileName: this.revisionV2FileName,
      revisionV2DurationSec: this.revisionV2Buffer?.duration ?? 0,
      revisionV2Lufs: this.revisionV2Lufs,
      revisionV2SixBands: this.revisionV2SixBands,
      revisionV2MatchOffsetDb: this.revisionV2MatchOffsetDb,
      loadingRevisionV2: this.loadingRevisionV2,

      isPlaying: this.isPlaying,
      activeDeck: this.activeDeck,
      monoMode: this.monoMode,
      translationMode: this.translationMode,
      loopRegion: this.loopRegion,
      isLooping: this.isLooping,
      playbackError: this.playbackError,
    };
  }

  private ensureAudioGraph(): AudioContext {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) {
        throw new Error('Web Audio API is unavailable in this browser.');
      }
      this.ctx = new AudioCtx();
    }

    if (this.graphReady) {
      return this.ctx;
    }

    const ctx = this.ctx;

    // 1. Tri-Deck A / B / Revision V2 Inputs + Loudness Match Gain on B and V2
    const deckAGain = ctx.createGain();
    const refMatchGain = ctx.createGain();
    const deckBGain = ctx.createGain();
    const v2MatchGain = ctx.createGain();
    const deckV2Gain = ctx.createGain();
    const deckBus = ctx.createGain();

    deckAGain.gain.value = this.activeDeck === 'A' ? 1.0 : 0.0;
    refMatchGain.gain.value = this.getEffectiveRefMatchLinear();
    deckBGain.gain.value = this.activeDeck === 'B' ? 1.0 : 0.0;
    v2MatchGain.gain.value = this.getEffectiveV2MatchLinear();
    deckV2Gain.gain.value = this.activeDeck === 'V2' ? 1.0 : 0.0;

    deckAGain.connect(deckBus);
    refMatchGain.connect(deckBGain);
    deckBGain.connect(deckBus);
    v2MatchGain.connect(deckV2Gain);
    deckV2Gain.connect(deckBus);

    // 2. Stereo vs. Equal-Power Mono Fold Stage (0.5 * L + 0.5 * R)
    const stereoPathGain = ctx.createGain();
    const monoPathGain = ctx.createGain();
    const monoBusOut = ctx.createGain();

    stereoPathGain.gain.value = this.monoMode ? 0.0 : 1.0;
    monoPathGain.gain.value = this.monoMode ? 1.0 : 0.0;

    // Stereo direct branch
    deckBus.connect(stereoPathGain);
    stereoPathGain.connect(monoBusOut);

    // Equal-power Mono branch: explicit 0.5*L + 0.5*R
    const monoSplitter = ctx.createChannelSplitter(2);
    const monoLeftHalf = ctx.createGain();
    const monoRightHalf = ctx.createGain();
    monoLeftHalf.gain.value = 0.5;
    monoRightHalf.gain.value = 0.5;
    const monoSumNode = ctx.createGain();
    const monoMerger = ctx.createChannelMerger(2);

    deckBus.connect(monoSplitter);
    monoSplitter.connect(monoLeftHalf, 0);
    monoSplitter.connect(monoRightHalf, 1);
    monoLeftHalf.connect(monoSumNode);
    monoRightHalf.connect(monoSumNode);
    monoSumNode.connect(monoMerger, 0, 0);
    monoSumNode.connect(monoMerger, 0, 1);
    monoMerger.connect(monoPathGain);
    monoPathGain.connect(monoBusOut);

    // 3. Mix Translation Lab (3 Parallel Click-Free Branches)
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.0; // Starts silent; ramps smoothly to 1.0 on play

    // Branch A: Full Range (flat bypass)
    const fullRangeGain = ctx.createGain();
    fullRangeGain.gain.value = this.translationMode === 'full' ? 1.0 : 0.0;
    monoBusOut.connect(fullRangeGain);
    fullRangeGain.connect(masterGain);

    // Branch B: Smartphone Approx. (HPF 280 Hz, +2.5 dB peaking @ 2.2 kHz, LPF 11 kHz, equal-power mono)
    const phoneHpf = ctx.createBiquadFilter();
    phoneHpf.type = 'highpass';
    phoneHpf.frequency.value = 280;
    phoneHpf.Q.value = 0.707;

    const phonePeak = ctx.createBiquadFilter();
    phonePeak.type = 'peaking';
    phonePeak.frequency.value = 2200;
    phonePeak.Q.value = 1.1;
    phonePeak.gain.value = 2.5;

    const phoneLpf = ctx.createBiquadFilter();
    phoneLpf.type = 'lowpass';
    phoneLpf.frequency.value = 11000;
    phoneLpf.Q.value = 0.707;

    const phoneSplit = ctx.createChannelSplitter(2);
    const phoneHalfL = ctx.createGain();
    const phoneHalfR = ctx.createGain();
    phoneHalfL.gain.value = 0.5;
    phoneHalfR.gain.value = 0.5;
    const phoneMonoSum = ctx.createGain();
    const phoneMerge = ctx.createChannelMerger(2);
    const phoneBranchGain = ctx.createGain();
    phoneBranchGain.gain.value = this.translationMode === 'phone' ? 1.0 : 0.0;

    monoBusOut.connect(phoneHpf);
    phoneHpf.connect(phonePeak);
    phonePeak.connect(phoneLpf);
    phoneLpf.connect(phoneSplit);
    phoneSplit.connect(phoneHalfL, 0);
    phoneSplit.connect(phoneHalfR, 1);
    phoneHalfL.connect(phoneMonoSum);
    phoneHalfR.connect(phoneMonoSum);
    phoneMonoSum.connect(phoneMerge, 0, 0);
    phoneMonoSum.connect(phoneMerge, 0, 1);
    phoneMerge.connect(phoneBranchGain);
    phoneBranchGain.connect(masterGain);

    // Branch C: Laptop Approx. (HPF 160 Hz, LPF 14 kHz, narrowed stereo width 45% side)
    // L' = 0.725 * L + 0.275 * R, R' = 0.275 * L + 0.725 * R
    const laptopHpf = ctx.createBiquadFilter();
    laptopHpf.type = 'highpass';
    laptopHpf.frequency.value = 160;
    laptopHpf.Q.value = 0.707;

    const laptopLpf = ctx.createBiquadFilter();
    laptopLpf.type = 'lowpass';
    laptopLpf.frequency.value = 14000;
    laptopLpf.Q.value = 0.707;

    const laptopSplit = ctx.createChannelSplitter(2);
    const lToL = ctx.createGain();
    const rToL = ctx.createGain();
    const lToR = ctx.createGain();
    const rToR = ctx.createGain();
    lToL.gain.value = 0.725;
    rToL.gain.value = 0.275;
    lToR.gain.value = 0.275;
    rToR.gain.value = 0.725;

    const laptopOutL = ctx.createGain();
    const laptopOutR = ctx.createGain();
    const laptopMerge = ctx.createChannelMerger(2);
    const laptopBranchGain = ctx.createGain();
    laptopBranchGain.gain.value = this.translationMode === 'laptop' ? 1.0 : 0.0;

    monoBusOut.connect(laptopHpf);
    laptopHpf.connect(laptopLpf);
    laptopLpf.connect(laptopSplit);
    laptopSplit.connect(lToL, 0);
    laptopSplit.connect(rToL, 1);
    laptopSplit.connect(lToR, 0);
    laptopSplit.connect(rToR, 1);
    lToL.connect(laptopOutL);
    rToL.connect(laptopOutL);
    lToR.connect(laptopOutR);
    rToR.connect(laptopOutR);
    laptopOutL.connect(laptopMerge, 0, 0);
    laptopOutR.connect(laptopMerge, 0, 1);
    laptopMerge.connect(laptopBranchGain);
    laptopBranchGain.connect(masterGain);

    // 4. Master Output + Real-Time Stereo Phase Correlation Analysers
    masterGain.connect(ctx.destination);

    const meterSplit = ctx.createChannelSplitter(2);
    const analyserL = ctx.createAnalyser();
    const analyserR = ctx.createAnalyser();
    analyserL.fftSize = 1024;
    analyserR.fftSize = 1024;
    masterGain.connect(meterSplit);
    meterSplit.connect(analyserL, 0);
    meterSplit.connect(analyserR, 1);

    this.deckAGain = deckAGain;
    this.deckBGain = deckBGain;
    this.refMatchGain = refMatchGain;
    this.deckV2Gain = deckV2Gain;
    this.v2MatchGain = v2MatchGain;
    this.deckBus = deckBus;
    this.stereoPathGain = stereoPathGain;
    this.monoPathGain = monoPathGain;
    this.monoBusOut = monoBusOut;
    this.fullRangeGain = fullRangeGain;
    this.phoneBranchGain = phoneBranchGain;
    this.laptopBranchGain = laptopBranchGain;
    this.masterGain = masterGain;
    this.analyserL = analyserL;
    this.analyserR = analyserR;
    this.liveLoudnessTracker.setSampleRate(ctx.sampleRate);
    this.graphReady = true;

    return ctx;
  }

  private getEffectiveRefMatchLinear(): number {
    if (!this.loudnessMatchEnabled || this.referenceMatchOffsetDb === null) {
      return 1.0;
    }
    return dbToLinearGain(this.referenceMatchOffsetDb);
  }

  private getEffectiveV2MatchLinear(): number {
    if (!this.loudnessMatchEnabled || this.revisionV2MatchOffsetDb === null) {
      return 1.0;
    }
    return dbToLinearGain(this.revisionV2MatchOffsetDb);
  }

  private rampGain(node: GainNode | null, target: number): void {
    if (!node || !this.ctx) return;
    const now = this.ctx.currentTime;
    node.gain.cancelScheduledValues(now);
    node.gain.setTargetAtTime(target, now, RAMP_TAU_SEC);
  }

  private updateReferenceMatchOffset(): void {
    this.referenceMatchOffsetDb = computeLoudnessMatchGainOffsetDb(
      this.primaryLufs,
      this.referenceLufs
    );
    this.rampGain(this.refMatchGain, this.getEffectiveRefMatchLinear());
  }

  private updateRevisionV2MatchOffset(): void {
    this.revisionV2MatchOffsetDb = computeLoudnessMatchGainOffsetDb(
      this.primaryLufs,
      this.revisionV2Lufs
    );
    this.rampGain(this.v2MatchGain, this.getEffectiveV2MatchLinear());
  }

  public syncPrimaryLufsFromReport(reportLufs: number | null | undefined): void {
    if (reportLufs !== null && reportLufs !== undefined && Number.isFinite(reportLufs)) {
      this.primaryLufs = reportLufs;
      this.updateReferenceMatchOffset();
      this.updateRevisionV2MatchOffset();
      this.emit();
    }
  }

  public syncRevisionV2LufsFromReport(reportLufs: number | null | undefined): void {
    if (reportLufs !== null && reportLufs !== undefined && Number.isFinite(reportLufs)) {
      this.revisionV2Lufs = reportLufs;
      this.updateRevisionV2MatchOffset();
      this.emit();
    }
  }

  public async loadPrimaryFile(file: File, knownIntegratedLufs?: number | null): Promise<void> {
    // Avoid re-decoding the exact same File object if already loaded
    if (this.primaryFile === file && this.primaryBuffer) {
      if (knownIntegratedLufs !== undefined && knownIntegratedLufs !== null) {
        this.syncPrimaryLufsFromReport(knownIntegratedLufs);
      }
      return;
    }

    this.stopSourcesImmediate();
    this.isPlaying = false;
    this.offsetSec = 0;
    this.activeDeck = 'A';
    this.loopRegion = null;
    this.isLooping = false;
    this.playbackError = null;
    this.primaryFile = file;
    this.liveLoudnessTracker.resetAll();

    try {
      const ctx = this.ensureAudioGraph();
      const arrayBuffer = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));

      this.primaryBuffer = decoded;
      this.primaryPeaksCache = extractWaveformPeaks(decoded, 220);
      const spec = measureFullSpectrumFromBuffer(decoded);
      this.primarySixBands = spec.sixBands;
      this.primarySpectrumBins = spec.bins48;
      this.primaryLufs =
        knownIntegratedLufs !== undefined && knownIntegratedLufs !== null
          ? knownIntegratedLufs
          : measureIntegratedLufsFromBuffer(decoded);

      this.updateReferenceMatchOffset();
      this.updateRevisionV2MatchOffset();
      this.rampGain(this.deckAGain, 1.0);
      this.rampGain(this.deckBGain, 0.0);
      this.rampGain(this.deckV2Gain, 0.0);
      this.emit();
    } catch (err: any) {
      const isAiff =
        file.name.toLowerCase().endsWith('.aiff') || file.name.toLowerCase().endsWith('.aif');
      this.primaryBuffer = null;
      this.primaryPeaksCache = null;
      this.primarySixBands = null;
      this.primarySpectrumBins = null;
      this.playbackError = isAiff
        ? 'Browser Web Audio cannot natively decode AIFF streams. Mathematical DSP measurements from the server remain active.'
        : err?.message || 'Unable to decode this audio file in Web Audio.';
      this.emit();
    }
  }

  public async loadReferenceFile(file: File): Promise<void> {
    this.loadingReference = true;
    this.playbackError = null;
    this.emit();

    try {
      const ctx = this.ensureAudioGraph();
      const arrayBuffer = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));

      this.referenceBuffer = decoded;
      this.referenceFileName = file.name;
      this.referenceLufs = measureIntegratedLufsFromBuffer(decoded);
      this.referenceSixBands = measureSixBandSpectrumFromBuffer(decoded);
      this.updateReferenceMatchOffset();
      this.loadingReference = false;

      // If currently playing, re-lock all sources at the exact current offset
      if (this.isPlaying) {
        const currentPos = this.getCurrentTime();
        this.startSampleLockedSources(currentPos);
      }

      this.emit();
    } catch (err: any) {
      this.loadingReference = false;
      this.playbackError = `Reference track decode error: ${err?.message || 'Unsupported audio format.'}`;
      this.emit();
    }
  }

  public async loadRevisionV2File(file: File, knownIntegratedLufs?: number | null): Promise<void> {
    this.loadingRevisionV2 = true;
    this.playbackError = null;
    this.emit();

    try {
      const ctx = this.ensureAudioGraph();
      const arrayBuffer = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));

      this.revisionV2Buffer = decoded;
      this.revisionV2FileName = file.name;
      this.revisionV2Lufs =
        knownIntegratedLufs !== undefined && knownIntegratedLufs !== null
          ? knownIntegratedLufs
          : measureIntegratedLufsFromBuffer(decoded);
      this.revisionV2SixBands = measureSixBandSpectrumFromBuffer(decoded);
      this.updateRevisionV2MatchOffset();
      this.loadingRevisionV2 = false;

      if (this.isPlaying) {
        const currentPos = this.getCurrentTime();
        this.startSampleLockedSources(currentPos);
      }

      this.emit();
    } catch (err: any) {
      this.loadingRevisionV2 = false;
      this.playbackError = `Revision v2 decode error: ${err?.message || 'Unsupported audio format.'}`;
      this.emit();
    }
  }

  public clearRevisionV2(): void {
    if (this.sourceV2Node) {
      try {
        this.sourceV2Node.stop();
        this.sourceV2Node.disconnect();
      } catch {
        // ignore
      }
      this.sourceV2Node = null;
    }
    this.revisionV2Buffer = null;
    this.revisionV2FileName = null;
    this.revisionV2Lufs = null;
    this.revisionV2SixBands = null;
    this.revisionV2MatchOffsetDb = null;
    this.loadingRevisionV2 = false;
    if (this.activeDeck === 'V2') {
      this.activeDeck = 'A';
      this.rampGain(this.deckAGain, 1.0);
      this.rampGain(this.deckBGain, 0.0);
      this.rampGain(this.deckV2Gain, 0.0);
    }
    this.emit();
  }

  public clearReferenceTrack(): void {
    if (this.sourceBNode) {
      try {
        this.sourceBNode.stop();
        this.sourceBNode.disconnect();
      } catch {
        // ignore
      }
      this.sourceBNode = null;
    }
    this.referenceBuffer = null;
    this.referenceFileName = null;
    this.referenceLufs = null;
    this.referenceSixBands = null;
    this.referenceMatchOffsetDb = null;
    if (this.activeDeck === 'B') {
      this.activeDeck = 'A';
      this.rampGain(this.deckAGain, 1.0);
      this.rampGain(this.deckBGain, 0.0);
      this.rampGain(this.deckV2Gain, 0.0);
    }
    this.emit();
  }

  public clearPrimaryMix(): void {
    this.stopSourcesImmediate();
    this.primaryBuffer = null;
    this.primaryFile = null;
    this.primaryLufs = null;
    this.primarySixBands = null;
    this.primarySpectrumBins = null;
    this.primaryPeaksCache = null;
    this.revisionV2Buffer = null;
    this.revisionV2FileName = null;
    this.revisionV2Lufs = null;
    this.revisionV2SixBands = null;
    this.revisionV2MatchOffsetDb = null;
    this.activeDeck = 'A';
    this.isPlaying = false;
    this.offsetSec = 0;
    this.loopRegion = null;
    this.isLooping = false;
    this.playbackError = null;
    this.liveLoudnessTracker.resetAll();
    this.updateReferenceMatchOffset();
    this.updateRevisionV2MatchOffset();
    this.emit();
  }

  private stopSourcesImmediate(): void {
    if (this.pauseStopTimer) {
      clearTimeout(this.pauseStopTimer);
      this.pauseStopTimer = null;
    }
    if (this.loopCheckInterval) {
      clearInterval(this.loopCheckInterval);
      this.loopCheckInterval = null;
    }
    if (this.sourceANode) {
      this.sourceANode.onended = null;
      try {
        this.sourceANode.stop();
        this.sourceANode.disconnect();
      } catch {
        // ignore
      }
      this.sourceANode = null;
    }
    if (this.sourceBNode) {
      this.sourceBNode.onended = null;
      try {
        this.sourceBNode.stop();
        this.sourceBNode.disconnect();
      } catch {
        // ignore
      }
      this.sourceBNode = null;
    }
    if (this.sourceV2Node) {
      this.sourceV2Node.onended = null;
      try {
        this.sourceV2Node.stop();
        this.sourceV2Node.disconnect();
      } catch {
        // ignore
      }
      this.sourceV2Node = null;
    }
  }

  private startSampleLockedSources(fromOffsetSec: number): void {
    if (!this.primaryBuffer) return;
    const ctx = this.ensureAudioGraph();
    this.stopSourcesImmediate();

    const duration = this.primaryBuffer.duration;
    const clampedOffset = Math.max(0, Math.min(duration - 0.01, fromOffsetSec));
    const syncStartTime = ctx.currentTime + 0.005;

    const srcA = ctx.createBufferSource();
    srcA.buffer = this.primaryBuffer;
    srcA.connect(this.deckAGain!);
    srcA.onended = () => {
      // Only handle natural track end if this is still the active source and not looping
      if (this.sourceANode === srcA && this.isPlaying) {
        if (this.isLooping && this.loopRegion) {
          this.startSampleLockedSources(this.loopRegion.startSec);
        } else {
          this.isPlaying = false;
          this.offsetSec = 0;
          this.stopSourcesImmediate();
          this.emit();
        }
      }
    };
    srcA.start(syncStartTime, clampedOffset);
    this.sourceANode = srcA;

    if (this.referenceBuffer && this.refMatchGain) {
      const srcB = ctx.createBufferSource();
      srcB.buffer = this.referenceBuffer;
      srcB.loop = true;
      srcB.connect(this.refMatchGain);
      const refOffset =
        this.referenceBuffer.duration > 0.05
          ? clampedOffset % this.referenceBuffer.duration
          : 0;
      srcB.start(syncStartTime, refOffset);
      this.sourceBNode = srcB;
    }

    if (this.revisionV2Buffer && this.v2MatchGain) {
      const srcV2 = ctx.createBufferSource();
      srcV2.buffer = this.revisionV2Buffer;
      srcV2.loop = false;
      srcV2.connect(this.v2MatchGain);
      if (clampedOffset < this.revisionV2Buffer.duration - 0.01) {
        srcV2.start(syncStartTime, clampedOffset);
        this.sourceV2Node = srcV2;
      }
    }

    this.startCtxTime = syncStartTime;
    this.offsetSec = clampedOffset;
    this.isPlaying = true;

    // Schedule 15ms click-free fade-in on masterGain
    this.rampGain(this.masterGain, 1.0);

    // Lightweight loop-region guardian (checks every 30ms without triggering React state)
    this.loopCheckInterval = setInterval(() => {
      if (!this.isPlaying || !this.isLooping || !this.loopRegion) return;
      const cur = this.getCurrentTime();
      if (cur >= this.loopRegion.endSec) {
        this.seek(this.loopRegion.startSec, true);
      }
    }, 30);
  }

  public async play(): Promise<void> {
    if (!this.primaryBuffer) return;
    const ctx = this.ensureAudioGraph();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    if (this.isPlaying) return;

    const startPos =
      this.isLooping && this.loopRegion
        ? this.offsetSec >= this.loopRegion.startSec && this.offsetSec < this.loopRegion.endSec
          ? this.offsetSec
          : this.loopRegion.startSec
        : this.offsetSec >= this.primaryBuffer.duration - 0.05
        ? 0
        : this.offsetSec;

    this.startSampleLockedSources(startPos);
    this.emit();
  }

  public pause(): void {
    if (!this.isPlaying || !this.ctx) return;

    this.offsetSec = this.getCurrentTime();
    this.isPlaying = false;

    // 15ms exponential ramp to 0 before stopping sources (zero click/pop)
    this.rampGain(this.masterGain, 0.0);

    if (this.pauseStopTimer) clearTimeout(this.pauseStopTimer);
    this.pauseStopTimer = setTimeout(() => {
      if (!this.isPlaying) {
        this.stopSourcesImmediate();
      }
    }, 65);

    this.emit();
  }

  public async togglePlay(): Promise<void> {
    if (this.isPlaying) {
      this.pause();
    } else {
      await this.play();
    }
  }

  public seek(targetSec: number, keepPlayingState = true): void {
    const duration = this.primaryBuffer?.duration ?? 0;
    const clamped = duration > 0 ? Math.max(0, Math.min(duration, targetSec)) : Math.max(0, targetSec);
    this.offsetSec = clamped;

    if (this.isPlaying && keepPlayingState && this.ctx && this.primaryBuffer) {
      // Micro-fade out, re-anchor sources sample-locked, fade in
      this.rampGain(this.masterGain, 0.001);
      this.startSampleLockedSources(clamped);
    }
    this.emit();
  }

  public async seekAndPlay(targetSec: number): Promise<void> {
    this.offsetSec = Math.max(0, targetSec);
    if (!this.primaryBuffer) {
      this.emit();
      return;
    }
    const ctx = this.ensureAudioGraph();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    this.startSampleLockedSources(this.offsetSec);
    this.emit();
  }

  public setActiveDeck(deck: ActiveDeck): void {
    if (deck === 'B' && !this.referenceBuffer) return;
    if (deck === 'V2' && !this.revisionV2Buffer) return;
    if (this.activeDeck === deck) return;
    this.activeDeck = deck;

    // 15ms click-free exponential crossfade across sample-locked Mix v1 (A), Reference B, and Revision V2 decks
    this.rampGain(this.deckAGain, deck === 'A' ? 1.0 : 0.0);
    this.rampGain(this.deckBGain, deck === 'B' ? 1.0 : 0.0);
    this.rampGain(this.deckV2Gain, deck === 'V2' ? 1.0 : 0.0);
    this.emit();
  }

  public setLoudnessMatchEnabled(enabled: boolean): void {
    if (this.loudnessMatchEnabled === enabled) return;
    this.loudnessMatchEnabled = enabled;
    this.rampGain(this.refMatchGain, this.getEffectiveRefMatchLinear());
    this.rampGain(this.v2MatchGain, this.getEffectiveV2MatchLinear());
    this.emit();
  }

  public setMonoMode(mono: boolean): void {
    if (this.monoMode === mono) return;
    this.monoMode = mono;

    // 15ms click-free exponential crossfade between Stereo and Equal-Power Mono (0.5*L + 0.5*R)
    this.rampGain(this.stereoPathGain, mono ? 0.0 : 1.0);
    this.rampGain(this.monoPathGain, mono ? 1.0 : 0.0);
    this.emit();
  }

  public toggleMono(): void {
    this.setMonoMode(!this.monoMode);
  }

  public setTranslationMode(mode: TranslationMode): void {
    if (this.translationMode === mode) return;
    this.translationMode = mode;

    // 15ms click-free exponential crossfade across Full Range / Phone / Laptop branches
    this.rampGain(this.fullRangeGain, mode === 'full' ? 1.0 : 0.0);
    this.rampGain(this.phoneBranchGain, mode === 'phone' ? 1.0 : 0.0);
    this.rampGain(this.laptopBranchGain, mode === 'laptop' ? 1.0 : 0.0);
    this.emit();
  }

  public setLoopRegion(region: LoopRegion | null, enableLoop?: boolean): void {
    this.loopRegion = region;
    if (enableLoop !== undefined) {
      this.isLooping = Boolean(region) && enableLoop;
    } else if (!region) {
      this.isLooping = false;
    }
    this.emit();
  }

  public toggleLooping(): void {
    if (!this.loopRegion) return;
    this.isLooping = !this.isLooping;
    if (this.isLooping && this.isPlaying) {
      const cur = this.getCurrentTime();
      if (cur < this.loopRegion.startSec || cur >= this.loopRegion.endSec) {
        this.seek(this.loopRegion.startSec, true);
      }
    }
    this.emit();
  }

  /**
   * Direct AudioContext.currentTime clock read for 60fps requestAnimationFrame loops
   * (zero React state re-renders!).
   */
  public getCurrentTime(): number {
    if (!this.isPlaying || !this.ctx) {
      return this.offsetSec;
    }
    const elapsed = Math.max(0, this.ctx.currentTime - this.startCtxTime);
    const pos = this.offsetSec + elapsed;
    const duration = this.primaryBuffer?.duration ?? 0;
    if (duration > 0) {
      return Math.min(duration, pos);
    }
    return pos;
  }

  public getWaveformPeaks(): WaveformPeakBucket[] | null {
    return this.primaryPeaksCache;
  }

  /**
   * Reads real-time instantaneous L/R stereo phase correlation [-1.0, +1.0]
   * directly from the post-processing AnalyserNodes during playback (60fps rAF safe).
   */
  public getLivePhaseCorrelation(): number | null {
    if (!this.isPlaying || !this.analyserL || !this.analyserR) return null;

    this.analyserL.getFloatTimeDomainData(this.corrBufL);
    this.analyserR.getFloatTimeDomainData(this.corrBufR);

    let sumLL = 0;
    let sumRR = 0;
    let sumLR = 0;
    for (let i = 0; i < this.corrBufL.length; i++) {
      const l = this.corrBufL[i];
      const r = this.corrBufR[i];
      sumLL += l * l;
      sumRR += r * r;
      sumLR += l * r;
    }

    const denom = Math.sqrt(sumLL * sumRR);
    if (denom < 1e-8) return null;
    return Math.max(-1, Math.min(1, sumLR / denom));
  }

  /**
   * Real-time 60fps Sample Peak (with 1.5s peak-hold + smooth decay), Clip latch,
   * 400ms Momentary LUFS, and 3s Short-Term LUFS directly from paired analyserL/analyserR.
   * Zero heap allocations per frame.
   */
  public getLiveLoudnessAndPeaks(): LiveLoudnessAndPeaks {
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!this.isPlaying || !this.analyserL || !this.analyserR) {
      return this.liveLoudnessTracker.update(this.meterBufL, this.meterBufR, nowMs, false);
    }

    this.analyserL.getFloatTimeDomainData(this.meterBufL);
    this.analyserR.getFloatTimeDomainData(this.meterBufR);
    return this.liveLoudnessTracker.update(this.meterBufL, this.meterBufR, nowMs, true);
  }

  /**
   * Clears peak-hold bars and clip indicator latch on demand.
   */
  public resetLivePeakHold(): void {
    this.liveLoudnessTracker.resetPeakHold();
  }

  /**
   * Copies current post-processing L/R time-domain samples into caller-provided buffers
   * for the 60fps 2D Goniometer/Vectorscope (zero GC allocations).
   * Returns false when paused or silent.
   */
  public getLiveStereoSamples(
    targetBufferL: Float32Array,
    targetBufferR: Float32Array
  ): boolean {
    if (!this.isPlaying || !this.analyserL || !this.analyserR) {
      return false;
    }

    this.analyserL.getFloatTimeDomainData(this.meterBufL);
    this.analyserR.getFloatTimeDomainData(this.meterBufR);

    const n = Math.min(targetBufferL.length, targetBufferR.length, this.meterBufL.length);
    let maxAbs = 0;
    for (let i = 0; i < n; i++) {
      const l = this.meterBufL[i];
      const r = this.meterBufR[i];
      targetBufferL[i] = l;
      targetBufferR[i] = r;
      const al = Math.abs(l);
      const ar = Math.abs(r);
      if (al > maxAbs) maxAbs = al;
      if (ar > maxAbs) maxAbs = ar;
    }

    return maxAbs > 1e-6;
  }
}

// App-level singleton instance preserved across all route transitions
export const studioAudioEngine = new StudioAudioEngine();

/**
 * Local Web Audio API Mathematical DSP Fallback Engine (Phase 2)
 *
 * Used ONLY when the FastAPI backend (/api/v1/analyze/dsp) is unreachable.
 * Decodes real user-uploaded audio samples in the browser via AudioContext.decodeAudioData()
 * and computes genuine mathematical DSP measurements conforming strictly to Schema v2.0.0.
 */

import {
  AnalysisIssue,
  AnalysisReport,
  ConsentState,
  FileMetadata,
  GenreId,
  InterfaceMode,
  MeasurementStatus,
  MeasurementUnit,
  MeasurementValue,
  MixRecommendation,
  MixStage,
  TimelineBucket,
} from '../contracts/analysisContract';

export interface LocalDspOptions {
  interface_mode: InterfaceMode;
  genre: GenreId;
  mix_stage: MixStage;
  consent_state: ConsentState;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function linToDbfs(v: number): number {
  if (v <= 1e-12) return -120.0;
  return 20 * Math.log10(v);
}

function inferAudioFormat(filename: string): FileMetadata['format'] {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.flac')) return 'FLAC';
  if (lower.endsWith('.aiff')) return 'AIFF';
  if (lower.endsWith('.mp3')) return 'MP3';
  if (lower.endsWith('.ogg')) return 'OGG';
  return 'WAV';
}

/**
 * Simple K-weighting pre-filter approximation (Stage 1 shelf + Stage 2 high-pass)
 * matching ITU-R BS.1770-4 at 48 kHz (scaled gently for other sample rates).
 */
function applyKWeightingFilter(samples: Float32Array, sampleRate: number): Float32Array {
  const n = samples.length;
  const stage1 = new Float32Array(n);
  const stage2 = new Float32Array(n);

  // Stage 1: High-shelf +4 dB above ~1.68 kHz (BS.1770-4 coefficients at 48 kHz)
  const b0 = 1.53512485958697;
  const b1 = -2.69169618940638;
  const b2 = 1.19839281085285;
  const a1 = -1.69065929318241;
  const a2 = 0.73248077421585;

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < n; i++) {
    const x0 = samples[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    stage1[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }

  // Stage 2: 2nd-order Butterworth high-pass at ~38 Hz
  const fc = 38.13547087602444;
  const w0 = (2 * Math.PI * fc) / Math.max(8000, sampleRate);
  const cosW0 = Math.cos(w0);
  const alpha = Math.sin(w0) / Math.SQRT2;
  const norm = 1 / (1 + alpha);
  const hb0 = ((1 + cosW0) / 2) * norm;
  const hb1 = -(1 + cosW0) * norm;
  const hb2 = ((1 + cosW0) / 2) * norm;
  const ha1 = -2 * cosW0 * norm;
  const ha2 = (1 - alpha) * norm;

  x1 = 0; x2 = 0; y1 = 0; y2 = 0;
  for (let i = 0; i < n; i++) {
    const x0 = stage1[i];
    const y0 = hb0 * x0 + hb1 * x1 + hb2 * x2 - ha1 * y1 - ha2 * y2;
    stage2[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }

  return stage2;
}

/**
 * 4x oversampled cubic Catmull-Rom inter-sample peak estimation (dBTP).
 */
function estimate4xTruePeakDbtp(channels: Float32Array[]): number {
  let maxAbs = 0;
  for (const ch of channels) {
    const len = ch.length;
    for (let i = 0; i < len; i++) {
      const abs0 = Math.abs(ch[i]);
      if (abs0 > maxAbs) maxAbs = abs0;
      if (i >= 1 && i + 2 < len) {
        const y0 = ch[i - 1];
        const y1 = ch[i];
        const y2 = ch[i + 1];
        const y3 = ch[i + 2];
        // Evaluate at t = 0.25, 0.5, 0.75
        for (let k = 1; k <= 3; k++) {
          const t = k * 0.25;
          const t2 = t * t;
          const t3 = t2 * t;
          const interp =
            0.5 *
            (2 * y1 +
              (-y0 + y2) * t +
              (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 +
              (-y0 + 3 * y1 - 3 * y2 + y3) * t3);
          const absI = Math.abs(interp);
          if (absI > maxAbs) maxAbs = absI;
        }
      }
    }
  }
  return round2(linToDbfs(maxAbs));
}

/**
 * In-place iterative radix-2 Cooley-Tukey FFT for real spectral estimation.
 */
function fftRadix2(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      const half = len >> 1;
      for (let j = 0; j < half; j++) {
        const uRe = re[i + j];
        const uIm = im[i + j];
        const vRe = re[i + j + half] * wRe - im[i + j + half] * wIm;
        const vIm = re[i + j + half] * wIm + im[i + j + half] * wRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + half] = uRe - vRe;
        im[i + j + half] = uIm - vIm;
        const nextRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextRe;
      }
    }
  }
}

function computeSpectralBandsLocal(
  channels: Float32Array[],
  sampleRate: number
): {
  sub_bass_energy_20_60hz: number | null;
  mud_band_energy_200_500hz: number | null;
  presence_band_energy_2k_5khz: number | null;
  air_band_energy_10k_20khz: number | null;
  unavailable_reasons: Record<string, string>;
} {
  const nFrames = channels[0]?.length ?? 0;
  const bands: Record<string, [number, number]> = {
    sub_bass_energy_20_60hz: [20, 60],
    mud_band_energy_200_500hz: [200, 500],
    presence_band_energy_2k_5khz: [2000, 5000],
    air_band_energy_10k_20khz: [10000, 20000],
  };

  if (nFrames < 256) {
    return {
      sub_bass_energy_20_60hz: null,
      mud_band_energy_200_500hz: null,
      presence_band_energy_2k_5khz: null,
      air_band_energy_10k_20khz: null,
      unavailable_reasons: {
        sub_bass_energy_20_60hz: 'short_file_below_minimum_window',
        mud_band_energy_200_500hz: 'short_file_below_minimum_window',
        presence_band_energy_2k_5khz: 'short_file_below_minimum_window',
        air_band_energy_10k_20khz: 'short_file_below_minimum_window',
      },
    };
  }

  let fftSize = 4096;
  while (fftSize > nFrames && fftSize > 256) fftSize >>= 1;
  const half = fftSize / 2;
  const psd = new Float64Array(half + 1);
  const hann = new Float64Array(fftSize);
  let windowNorm = 0;
  for (let i = 0; i < fftSize; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
    hann[i] = w;
    windowNorm += w * w;
  }

  const maxWindows = 24;
  const stride = Math.max(fftSize >> 1, Math.floor((nFrames - fftSize) / Math.max(1, maxWindows - 1)));
  let totalWindows = 0;

  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);

  for (const ch of channels) {
    let windowsForCh = 0;
    for (let offset = 0; offset + fftSize <= nFrames && windowsForCh < maxWindows; offset += Math.max(1, stride)) {
      for (let i = 0; i < fftSize; i++) {
        re[i] = ch[offset + i] * hann[i];
        im[i] = 0;
      }
      fftRadix2(re, im);
      for (let bin = 0; bin <= half; bin++) {
        const magSq = re[bin] * re[bin] + im[bin] * im[bin];
        const scale = bin === 0 || bin === half ? 1 : 2;
        psd[bin] += (scale * magSq) / (sampleRate * windowNorm);
      }
      windowsForCh++;
      totalWindows++;
    }
  }

  if (totalWindows > 0) {
    for (let bin = 0; bin <= half; bin++) {
      psd[bin] /= totalWindows;
    }
  }

  const df = sampleRate / fftSize;
  const nyquist = sampleRate / 2;
  const results: Record<string, number | null> = {};
  const unavailable_reasons: Record<string, string> = {};

  for (const [key, [lo, hi]] of Object.entries(bands)) {
    if (nyquist < hi) {
      results[key] = null;
      unavailable_reasons[key] = 'nyquist_limit_below_band_upper_bound';
      continue;
    }
    const startBin = Math.max(1, Math.floor(lo / df));
    const endBin = Math.min(half, Math.ceil(hi / df));
    let bandPower = 0;
    for (let b = startBin; b <= endBin; b++) {
      bandPower += psd[b] * df;
    }
    results[key] = bandPower <= 1e-12 ? -120.0 : round1(10 * Math.log10(bandPower));
  }

  return {
    sub_bass_energy_20_60hz: results.sub_bass_energy_20_60hz,
    mud_band_energy_200_500hz: results.mud_band_energy_200_500hz,
    presence_band_energy_2k_5khz: results.presence_band_energy_2k_5khz,
    air_band_energy_10k_20khz: results.air_band_energy_10k_20khz,
    unavailable_reasons,
  };
}

function buildMeasurement(
  value: number | null,
  unit: MeasurementUnit,
  standard: string,
  targetMin: number | null,
  targetMax: number | null,
  algorithmDetail: string,
  unavailableReason?: string
): MeasurementValue {
  if (value === null || Number.isNaN(value) || !Number.isFinite(value)) {
    return {
      value: null,
      unit,
      standard,
      target_min: targetMin,
      target_max: targetMax,
      status: 'unavailable',
      source: 'mathematical_dsp',
      unavailable_reason: unavailableReason || 'metric_unavailable',
      algorithm_detail: algorithmDetail,
    };
  }
  let status: MeasurementStatus = 'optimal';
  if (targetMin !== null && value < targetMin) status = 'warning';
  if (targetMax !== null && value > targetMax) status = 'warning';
  return {
    value: unit === 'count' ? Math.round(value) : round2(value),
    unit,
    standard,
    target_min: targetMin,
    target_max: targetMax,
    status,
    source: 'mathematical_dsp',
    unavailable_reason: null,
    algorithm_detail: algorithmDetail,
  };
}

/**
 * Pure PCM buffer mathematical DSP analyzer (testable in Node.js without AudioContext).
 */
export function analyzePcmBuffersLocally(params: {
  channels: Float32Array[];
  sampleRate: number;
  filename: string;
  fileSizeBytes: number;
  options: LocalDspOptions;
}): AnalysisReport {
  const { channels, sampleRate, filename, fileSizeBytes, options } = params;
  const numChannels = (channels.length >= 2 ? 2 : 1) as 1 | 2;
  const activeChannels = channels.slice(0, numChannels);
  const totalSamples = activeChannels[0]?.length ?? 0;
  const durationSeconds = Math.max(0.01, totalSamples / Math.max(8000, sampleRate));
  const isUnmastered = options.mix_stage === 'unmastered_mix';

  // 1. Sample Peak, Global RMS, Contiguous Clipping Runs (>=3 samples >= 0.9999)
  let maxAbs = 0;
  let sumSqTotal = 0;
  let clippingEvents = 0;
  for (let c = 0; c < numChannels; c++) {
    const ch = activeChannels[c];
    let run = 0;
    for (let i = 0; i < totalSamples; i++) {
      const s = ch[i];
      const a = Math.abs(s);
      if (a > maxAbs) maxAbs = a;
      sumSqTotal += s * s;
      if (a >= 0.9999) {
        run++;
        if (run === 3) clippingEvents++;
      } else {
        run = 0;
      }
    }
  }

  const samplePeakDbfs = round2(linToDbfs(maxAbs));
  const globalRmsLin = Math.sqrt(Math.max(1e-12, sumSqTotal / Math.max(1, totalSamples * numChannels)));
  const globalRmsDbfs = round2(linToDbfs(globalRmsLin));
  const crestFactorDb = round2(Math.max(0, samplePeakDbfs - globalRmsDbfs));
  const truePeakDbtp = estimate4xTruePeakDbtp(activeChannels);

  // 2. K-Weighted Loudness (Integrated, Momentary 400ms, Short-Term 3s, LRA)
  const kChannels = activeChannels.map((ch) => applyKWeightingFilter(ch, sampleRate));
  const block400 = Math.max(1, Math.round(0.4 * sampleRate));
  const hop100 = Math.max(1, Math.round(0.1 * sampleRate));
  const blockPowers: number[] = [];

  for (let start = 0; start + block400 <= totalSamples; start += hop100) {
    let power = 0;
    for (let c = 0; c < numChannels; c++) {
      const kc = kChannels[c];
      let sum = 0;
      for (let i = start; i < start + block400; i++) {
        sum += kc[i] * kc[i];
      }
      power += sum / block400;
    }
    blockPowers.push(power);
  }

  const blockLufs = blockPowers.map((p) => (p <= 1e-12 ? -120.0 : -0.691 + 10 * Math.log10(p)));
  const absGated = blockPowers.filter((_, idx) => blockLufs[idx] > -70.0);
  let integratedLufs: number | null = null;
  if (absGated.length > 0) {
    const meanAbsPower = absGated.reduce((a, b) => a + b, 0) / absGated.length;
    const relThreshold = -0.691 + 10 * Math.log10(Math.max(1e-12, meanAbsPower)) - 10.0;
    const relGated = blockPowers.filter((_, idx) => blockLufs[idx] > -70.0 && blockLufs[idx] > relThreshold);
    const finalPower =
      relGated.length > 0
        ? relGated.reduce((a, b) => a + b, 0) / relGated.length
        : meanAbsPower;
    integratedLufs = round2(-0.691 + 10 * Math.log10(Math.max(1e-12, finalPower)));
  } else {
    integratedLufs = -70.0;
  }

  const validMomentary = blockLufs.filter((v) => v > -100.0);
  const momentaryMaxLufs =
    durationSeconds >= 0.4 && validMomentary.length > 0
      ? round2(Math.max(...validMomentary))
      : durationSeconds >= 0.4
      ? integratedLufs
      : null;

  let shortTermMaxLufs: number | null = null;
  let lraLu: number | null = null;
  if (durationSeconds >= 3.0) {
    const block3s = Math.max(1, Math.round(3.0 * sampleRate));
    const stHop = Math.max(1, Math.round(0.5 * sampleRate));
    const stValues: number[] = [];
    for (let start = 0; start + block3s <= totalSamples; start += stHop) {
      let power = 0;
      for (let c = 0; c < numChannels; c++) {
        const kc = kChannels[c];
        let sum = 0;
        for (let i = start; i < start + block3s; i++) {
          sum += kc[i] * kc[i];
        }
        power += sum / block3s;
      }
      const l = power <= 1e-12 ? -120.0 : -0.691 + 10 * Math.log10(power);
      if (l > -70.0) stValues.push(l);
    }
    if (stValues.length > 0) {
      shortTermMaxLufs = round2(Math.max(...stValues));
      stValues.sort((a, b) => a - b);
      const p10 = stValues[Math.floor(stValues.length * 0.1)];
      const p95 = stValues[Math.min(stValues.length - 1, Math.floor(stValues.length * 0.95))];
      lraLu = round2(Math.max(0, p95 - p10));
    } else {
      shortTermMaxLufs = integratedLufs;
      lraLu = 0.0;
    }
  }

  // 3. Timeline Buckets (<= 120 buckets, strictly <= 240) + Stereo Correlation & Width
  const numBuckets = Math.min(120, Math.max(12, Math.floor(durationSeconds)));
  const bucketDur = durationSeconds / numBuckets;
  const samplesPerBucket = Math.max(1, Math.floor(totalSamples / numBuckets));

  const buckets: TimelineBucket[] = [];
  const activeCorrs: number[] = [];
  let sumSqMid = 0;
  let sumSqSide = 0;

  if (numChannels === 2) {
    const L = activeChannels[0];
    const R = activeChannels[1];
    for (let i = 0; i < totalSamples; i++) {
      const m = (L[i] + R[i]) * Math.SQRT1_2;
      const s = (L[i] - R[i]) * Math.SQRT1_2;
      sumSqMid += m * m;
      sumSqSide += s * s;
    }
  }

  for (let b = 0; b < numBuckets; b++) {
    const sStart = b * samplesPerBucket;
    const sEnd = b === numBuckets - 1 ? totalSamples : Math.min(totalSamples, (b + 1) * samplesPerBucket);
    const count = Math.max(1, sEnd - sStart);
    let bPeak = 0;
    let bSumSq = 0;
    let bClipped = false;
    let sumLL = 0;
    let sumRR = 0;
    let sumLR = 0;

    for (let i = sStart; i < sEnd; i++) {
      for (let c = 0; c < numChannels; c++) {
        const v = activeChannels[c][i];
        const a = Math.abs(v);
        if (a > bPeak) bPeak = a;
        if (a >= 0.9999) bClipped = true;
        bSumSq += v * v;
      }
      if (numChannels === 2) {
        const lv = activeChannels[0][i];
        const rv = activeChannels[1][i];
        sumLL += lv * lv;
        sumRR += rv * rv;
        sumLR += lv * rv;
      }
    }

    const bRms = Math.sqrt(Math.max(1e-12, bSumSq / (count * numChannels)));
    const bRmsDbfs = round1(linToDbfs(bRms));
    const bPeakDbfs = round1(linToDbfs(bPeak));

    let bCorr: number | null = null;
    if (numChannels === 2 && bRmsDbfs >= -60.0) {
      const denom = Math.sqrt(Math.max(1e-12, sumLL * sumRR));
      const cVal = Math.max(-1.0, Math.min(1.0, sumLR / denom));
      bCorr = round2(cVal);
      activeCorrs.push(cVal);
    }

    buckets.push({
      start_sec: round2(b * bucketDur),
      end_sec: round2(Math.min(durationSeconds, (b + 1) * bucketDur)),
      peak_dbfs: bPeakDbfs,
      rms_dbfs: bRmsDbfs,
      momentary_lufs: momentaryMaxLufs,
      short_term_lufs: shortTermMaxLufs,
      phase_correlation: bCorr,
      clipped: bClipped,
    });
  }

  let phaseCorrMean: number | null = null;
  let phaseCorrMin: number | null = null;
  let stereoWidthIndex: number | null = null;
  const stereoUnavail = numChannels === 1 ? 'mono_input_no_stereo_field' : undefined;

  if (numChannels === 2) {
    if (activeCorrs.length > 0) {
      phaseCorrMean = round2(activeCorrs.reduce((a, b) => a + b, 0) / activeCorrs.length);
      phaseCorrMin = round2(Math.min(...activeCorrs));
    } else {
      phaseCorrMean = 1.0;
      phaseCorrMin = 1.0;
    }
    const rmsMid = Math.sqrt(Math.max(1e-12, sumSqMid / Math.max(1, totalSamples)));
    const rmsSide = Math.sqrt(Math.max(1e-12, sumSqSide / Math.max(1, totalSamples)));
    stereoWidthIndex = round1(
      Math.min(100, Math.max(0, ((Math.SQRT2 * rmsSide) / (rmsMid + rmsSide + 1e-12)) * 100))
    );
  }

  // 4. Spectral Bands
  const spectral = computeSpectralBandsLocal(activeChannels, sampleRate);

  const measurements: AnalysisReport['measurements'] = {
    sample_peak_max: buildMeasurement(
      samplePeakDbfs,
      'dBFS',
      'AES17 / IEC 60268-10',
      null,
      -0.5,
      'Local Web Audio PCM sample peak 20*log10(max|x|)'
    ),
    integrated_loudness: buildMeasurement(
      integratedLufs,
      'LUFS',
      'ITU-R BS.1770-4 (Local Web Audio Approximation)',
      isUnmastered ? -18.0 : -14.0,
      isUnmastered ? -14.0 : -9.0,
      'Client-side K-weighted gated loudness measurement'
    ),
    short_term_max_loudness: buildMeasurement(
      shortTermMaxLufs,
      'LUFS',
      'EBU R128 (3s window)',
      -16.0,
      isUnmastered ? -11.0 : -7.5,
      'Maximum 3-second sliding K-weighted loudness window',
      durationSeconds < 3.0 ? 'file_duration_too_short_for_ebur128' : undefined
    ),
    momentary_max_loudness: buildMeasurement(
      momentaryMaxLufs,
      'LUFS',
      'EBU R128 (400ms window)',
      -14.0,
      isUnmastered ? -9.0 : -6.0,
      'Maximum 400ms sliding K-weighted loudness window',
      durationSeconds < 0.4 ? 'file_duration_too_short_for_ebur128' : undefined
    ),
    true_peak_max: buildMeasurement(
      truePeakDbtp,
      'dBTP',
      '4x Cubic Interpolated True Peak (Local Fallback)',
      null,
      isUnmastered ? -3.0 : -1.0,
      '4x Catmull-Rom inter-sample peak estimation in Web Audio fallback'
    ),
    sample_clipping_events: buildMeasurement(
      clippingEvents,
      'count',
      'AES Recommended Practice (>=3 consecutive samples >= 0.9999 FS)',
      0,
      0,
      'Contiguous full-scale clipping run counter'
    ),
    loudness_range_lra: buildMeasurement(
      lraLu,
      'LU',
      'EBU R128 Loudness Range',
      4.0,
      isUnmastered ? 12.0 : 9.0,
      '10th to 95th percentile 3-second K-weighted loudness spread',
      durationSeconds < 3.0 ? 'file_duration_too_short_for_ebur128' : undefined
    ),
    crest_factor: buildMeasurement(
      crestFactorDb,
      'dB',
      'IEC 60268 Dynamic Peak-to-RMS Ratio',
      8.0,
      isUnmastered ? 18.0 : 14.0,
      'Sample peak dBFS minus global RMS dBFS'
    ),
    phase_correlation_mean: buildMeasurement(
      phaseCorrMean,
      'correlation',
      'Normalized Cross-Correlation [-1.0, +1.0]',
      0.2,
      1.0,
      'Mean silence-gated stereo cross-correlation',
      stereoUnavail
    ),
    phase_correlation_min: buildMeasurement(
      phaseCorrMin,
      'correlation',
      'Minimum Stereo Phase Correlation',
      0.0,
      1.0,
      'Worst-case silence-gated stereo cross-correlation bucket',
      stereoUnavail
    ),
    stereo_width_index: buildMeasurement(
      stereoWidthIndex,
      'percent',
      'Orthonormal Mid/Side Energy Ratio',
      20.0,
      85.0,
      'Orthonormal Side-to-Mid RMS energy ratio',
      stereoUnavail
    ),
    sub_bass_energy_20_60hz: buildMeasurement(
      spectral.sub_bass_energy_20_60hz,
      'dBFS',
      'Windowed FFT PSD Band Integral (20–60 Hz)',
      -35.0,
      -18.0,
      'Hann-windowed FFT band integration (20–60 Hz)',
      spectral.unavailable_reasons.sub_bass_energy_20_60hz
    ),
    mud_band_energy_200_500hz: buildMeasurement(
      spectral.mud_band_energy_200_500hz,
      'dBFS',
      'Windowed FFT PSD Band Integral (200–500 Hz)',
      -26.0,
      -16.0,
      'Hann-windowed FFT band integration (200–500 Hz)',
      spectral.unavailable_reasons.mud_band_energy_200_500hz
    ),
    presence_band_energy_2k_5khz: buildMeasurement(
      spectral.presence_band_energy_2k_5khz,
      'dBFS',
      'Windowed FFT PSD Band Integral (2–5 kHz)',
      -30.0,
      -18.0,
      'Hann-windowed FFT band integration (2–5 kHz)',
      spectral.unavailable_reasons.presence_band_energy_2k_5khz
    ),
    air_band_energy_10k_20khz: buildMeasurement(
      spectral.air_band_energy_10k_20khz,
      'dBFS',
      'Windowed FFT PSD Band Integral (10–20 kHz)',
      -40.0,
      -24.0,
      'Hann-windowed FFT band integration (10–20 kHz)',
      spectral.unavailable_reasons.air_band_energy_10k_20khz
    ),
  };

  // 5. Rule-8 Separated Issues & Prioritized Recommendations
  const issues: AnalysisIssue[] = [];
  const recommendations: MixRecommendation[] = [];
  let rank = 1;

  // Locate loudest bucket for accurate audition timestamp
  const loudestBucket = buckets.reduce(
    (best, cur) => (cur.peak_dbfs > best.peak_dbfs ? cur : best),
    buckets[0]
  );
  const loudestTs = {
    start_sec: Math.max(0, round2(loudestBucket.start_sec)),
    end_sec: Math.min(round2(durationSeconds), round2(Math.max(loudestBucket.end_sec, loudestBucket.start_sec + 4.0))),
    label: 'Loudest transient section',
  };

  if (clippingEvents > 0) {
    const clippedTs = buckets
      .filter((b) => b.clipped)
      .slice(0, 3)
      .map((b) => ({
        start_sec: b.start_sec,
        end_sec: Math.min(round2(durationSeconds), Math.max(b.end_sec, round2(b.start_sec + 3.0))),
        label: `Sample clipping around ${b.start_sec.toFixed(1)}s`,
      }));
    issues.push({
      issue_id: 'iss-tech-sample-clipping',
      classification: 'objective_technical',
      domain: 'true_peak_clipping',
      severity: 'critical',
      confidence: 1.0,
      title: `${clippingEvents} Contiguous Sample Clipping Run(s) Detected`,
      timestamps: clippedTs.length > 0 ? clippedTs : [loudestTs],
      evidence: [
        {
          metric_key: 'sample_clipping_events',
          measured_value: clippingEvents,
          unit: 'count',
          target_range: '0',
          method: 'Contiguous runs >= 3 consecutive samples >= 0.9999 FS',
        },
      ],
      learning_guide: {
        what_was_detected: `Detected ${clippingEvents} flat-topped clipping run(s) where 3 or more consecutive samples hit full scale (0 dBFS).`,
        why_it_matters:
          'Digital clipping introduces harsh distortion and crackling that cannot be repaired after export.',
        what_to_try:
          'Lower your mix bus fader or pre-limiter input trim by 2.0 dB so transients stop hitting 0 dBFS.',
        how_to_verify:
          'Export a revised bounce, re-upload it here, and confirm sample clipping events drop to 0.',
      },
    });
    recommendations.push({
      recommendation_id: `rec-${rank}-clipping`,
      priority_rank: rank++,
      linked_issue_id: 'iss-tech-sample-clipping',
      classification: 'objective_technical',
      action_title: 'Eliminate Digital Sample Clipping',
      beginner_summary: 'Turn down your master fader by ~2 dB so the loudest hits stop distorting.',
      advanced_dsp_guidance: 'Attenuate mix bus input gain by 2.0 dB before limiting so zero consecutive samples reach >= 0.9999 FS.',
      verification_check: 'Re-upload revised bounce and confirm sample_clipping_events === 0.',
    });
  }

  const targetTp = isUnmastered ? -3.0 : -1.0;
  if (truePeakDbtp > targetTp) {
    issues.push({
      issue_id: 'iss-tech-true-peak-headroom',
      classification: 'objective_technical',
      domain: 'true_peak_clipping',
      severity: truePeakDbtp > 0 ? 'critical' : 'warning',
      confidence: 0.94,
      title: `True Peak (${truePeakDbtp.toFixed(2)} dBTP) Exceeds ${targetTp.toFixed(1)} dBTP Target`,
      timestamps: [loudestTs],
      evidence: [
        {
          metric_key: 'true_peak_max',
          measured_value: truePeakDbtp,
          unit: 'dBTP',
          target_range: `<= ${targetTp.toFixed(1)} dBTP`,
          method: '4x oversampled inter-sample peak estimation',
        },
      ],
      learning_guide: {
        what_was_detected: `Your loudest peaks reach ${truePeakDbtp.toFixed(2)} dBTP, which is above the recommended ${targetTp.toFixed(1)} dBTP ceiling for ${isUnmastered ? 'an unmastered mix' : 'a final master'}.`,
        why_it_matters: isUnmastered
          ? 'Leaving at least 3 dB of headroom gives mastering EQ and limiting room to work cleanly without distortion.'
          : 'Streaming encoders (AAC, OGG, MP3) reconstruct peaks above 0 dBFS as audible crunch when True Peak exceeds -1.0 dBTP.',
        what_to_try: isUnmastered
          ? 'Bypass any master bus limiter and lower your mix bus trim so peaks stay around -4 to -3 dBTP.'
          : 'Enable True-Peak limiting on your final limiter and set the output ceiling to -1.0 dBTP.',
        how_to_verify: `Re-upload your updated bounce and confirm True Peak reads at or below ${targetTp.toFixed(1)} dBTP.`,
      },
    });
    recommendations.push({
      recommendation_id: `rec-${rank}-true-peak`,
      priority_rank: rank++,
      linked_issue_id: 'iss-tech-true-peak-headroom',
      classification: 'objective_technical',
      action_title: `Bring True Peak Ceiling Below ${targetTp.toFixed(1)} dBTP`,
      beginner_summary: isUnmastered
        ? 'Lower your overall mix level slightly so mastering has clean breathing room.'
        : 'Set your final limiter ceiling to -1.0 dB with True Peak mode enabled.',
      advanced_dsp_guidance: `Reduce output ceiling to ${targetTp.toFixed(1)} dBTP with 4x ISP oversampling enabled.`,
      verification_check: `Re-upload bounce and verify true_peak_max <= ${targetTp.toFixed(1)} dBTP.`,
    });
  }

  if (phaseCorrMin !== null && phaseCorrMin < -0.2) {
    const worstPhaseBucket = buckets.reduce(
      (best, cur) =>
        (cur.phase_correlation ?? 1) < (best.phase_correlation ?? 1) ? cur : best,
      buckets[0]
    );
    issues.push({
      issue_id: 'iss-tech-phase-cancellation',
      classification: 'objective_technical',
      domain: 'phase_polarity',
      severity: phaseCorrMin < -0.6 ? 'critical' : 'warning',
      confidence: 0.9,
      title: `Stereo Phase Dip Detected (${phaseCorrMin.toFixed(2)} Correlation)`,
      timestamps: [
        {
          start_sec: worstPhaseBucket.start_sec,
          end_sec: Math.min(round2(durationSeconds), Math.max(worstPhaseBucket.end_sec, round2(worstPhaseBucket.start_sec + 4.0))),
          label: 'Out-of-phase stereo section',
        },
      ],
      evidence: [
        {
          metric_key: 'phase_correlation_min',
          measured_value: phaseCorrMin,
          unit: 'correlation',
          target_range: '>= 0.00',
          method: 'Silence-gated stereo cross-correlation',
        },
      ],
      learning_guide: {
        what_was_detected: `Left and right channels drop to ${phaseCorrMin.toFixed(2)} correlation during the highlighted section.`,
        why_it_matters:
          'When played on phones, Bluetooth speakers, or club mono systems, out-of-phase instruments cancel out and lose punch.',
        what_to_try:
          'Make bass frequencies below 140 Hz mono and dial back stereo widener plugins on wide pads or guitars.',
        how_to_verify:
          'Toggle mono playback in your DAW over this section and re-upload to verify minimum phase stays above 0.00.',
      },
    });
    recommendations.push({
      recommendation_id: `rec-${rank}-phase`,
      priority_rank: rank++,
      linked_issue_id: 'iss-tech-phase-cancellation',
      classification: 'objective_technical',
      action_title: 'Tighten Stereo Phase for Mono Compatibility',
      beginner_summary: 'Keep low bass centered in mono and reduce extreme stereo wideners.',
      advanced_dsp_guidance: 'Apply Side-channel HPF at 140 Hz (12 dB/oct) and audit chorus/widener plugins.',
      verification_check: 'Re-upload revised bounce and confirm phase_correlation_min >= 0.00.',
    });
  }

  // Always include structured stylistic observations (Rule 8 separated)
  if (spectral.mud_band_energy_200_500hz !== null) {
    const mudVal = spectral.mud_band_energy_200_500hz;
    const descriptor = mudVal > -20 ? 'Warm & Dense' : 'Clean & Open';
    issues.push({
      issue_id: 'iss-stylistic-low-mid-density',
      classification: 'subjective_stylistic',
      domain: 'frequency_balance',
      severity: 'notice',
      confidence: 0.82,
      title: `Low-Mid Balance (200–500 Hz): ${descriptor} (${mudVal.toFixed(1)} dBFS)`,
      timestamps: [
        {
          start_sec: 0,
          end_sec: Math.min(round2(durationSeconds), 8.0),
          label: 'Low-mid tonal balance check',
        },
      ],
      evidence: [
        {
          metric_key: 'mud_band_energy_200_500hz',
          measured_value: mudVal,
          unit: 'dBFS',
          target_range: '-26.0 to -16.0 dBFS',
          method: 'Hann-windowed FFT band integration (200–500 Hz)',
        },
      ],
      learning_guide: {
        what_was_detected: `Your lower midrange (200–500 Hz) averages ${mudVal.toFixed(1)} dBFS.`,
        why_it_matters:
          'This frequency area adds warmth and body, though heavy buildup here can make vocals feel slightly muffled.',
        what_to_try:
          'If vocals feel covered, try a gentle -1.5 dB dip around 300 Hz on rhythm guitars or keys rather than on the vocal itself.',
        how_to_verify:
          'Compare at matched volume to make sure clarity improves without losing warmth, then re-upload to recheck.',
      },
    });
    recommendations.push({
      recommendation_id: `rec-${rank}-low-mid`,
      priority_rank: rank++,
      linked_issue_id: 'iss-stylistic-low-mid-density',
      classification: 'subjective_stylistic',
      action_title: 'Optional: Refine Low-Mid Warmth Around 300 Hz',
      beginner_summary: 'Evaluate by ear: if guitars or keys crowd the vocal, gently dip 250–400 Hz on backing tracks.',
      advanced_dsp_guidance: 'Optional -1.5 dB bell (Q=1.2) around 320 Hz on rhythm bus; evaluate by ear.',
      verification_check: 'Check vocal clarity at matched loudness and re-upload your revised bounce.',
    });
  }

  if (integratedLufs !== null) {
    const targetMin = isUnmastered ? -18.0 : -14.0;
    const targetMax = isUnmastered ? -14.0 : -9.0;
    issues.push({
      issue_id: 'iss-stylistic-loudness-context',
      classification: 'subjective_stylistic',
      domain: 'loudness',
      severity: 'notice',
      confidence: 0.85,
      title: `Overall Loudness Context (${integratedLufs.toFixed(1)} LUFS)`,
      timestamps: [loudestTs],
      evidence: [
        {
          metric_key: 'integrated_loudness',
          measured_value: integratedLufs,
          unit: 'LUFS',
          target_range: `${targetMin.toFixed(1)} to ${targetMax.toFixed(1)} LUFS`,
          method: 'K-weighted gated loudness measurement',
        },
      ],
      learning_guide: {
        what_was_detected: `Your track averages ${integratedLufs.toFixed(1)} LUFS integrated loudness.`,
        why_it_matters: isUnmastered
          ? 'Unmastered mixes do not need to be loud yet — preserving dynamic contrast makes mastering cleaner.'
          : 'Streaming platforms normalize playback loudness, so pushing loudness at the expense of punch often backfires.',
        what_to_try:
          'Focus on clean balance and steady chorus energy rather than chasing extreme loudness numbers.',
        how_to_verify:
          'Listen to your loudest chorus next to your verse and re-upload after any level adjustments.',
      },
    });
    recommendations.push({
      recommendation_id: `rec-${rank}-loudness`,
      priority_rank: rank++,
      linked_issue_id: 'iss-stylistic-loudness-context',
      classification: 'subjective_stylistic',
      action_title: 'Verify Overall Loudness & Dynamic Contrast',
      beginner_summary: `Your track measures ${integratedLufs.toFixed(1)} LUFS (typical ${isUnmastered ? 'unmastered mix' : 'final master'} window: ${targetMin} to ${targetMax} LUFS).`,
      advanced_dsp_guidance: `Target integrated loudness window ${targetMin.toFixed(1)} to ${targetMax.toFixed(1)} LUFS with crest factor >= 8 dB.`,
      verification_check: 'Audition verse-to-chorus lift and re-upload to compare loudness metrics.',
    });
  }

  return {
    schema_version: '2.0.0',
    report_id: `local-dsp-${Date.now().toString(36)}`,
    created_at: new Date().toISOString(),
    is_demonstration_data: false,
    data_source_notice:
      'LOCAL WEB AUDIO FALLBACK — BROWSER MATHEMATICAL DSP: FastAPI backend was unreachable; real signal measurements computed locally in your browser via Web Audio API.',
    input_context: {
      interface_mode: options.interface_mode,
      genre: options.genre,
      mix_stage: options.mix_stage,
      user_notes: null,
      plugin_chain_metadata: null,
    },
    consent_state: options.consent_state,
    file_metadata: {
      filename,
      format: inferAudioFormat(filename),
      duration_seconds: round2(durationSeconds),
      sample_rate_hz: Math.round(sampleRate),
      bit_depth: null,
      channels: numChannels,
      file_size_bytes: Math.max(1, fileSizeBytes),
      sha256_checksum: 'local-browser-session',
      codec: 'web_audio_float32_pcm',
      bit_depth_note: 'Decoded locally via Web Audio API (32-bit float PCM)',
    },
    capabilities: {
      dsp_core_measurements: {
        status: 'IMPLEMENTED',
        phase_target: 2,
        disclosure:
          'Computed locally via browser Web Audio API mathematical DSP fallback while FastAPI backend is offline.',
      },
      streaming_normalization_estimates: {
        status: 'NOT_IMPLEMENTED',
        phase_target: 3,
        disclosure: 'Rule 7: Streaming loudness predictions scheduled for Phase 3.',
      },
      reference_track_comparison: {
        status: 'NOT_IMPLEMENTED',
        phase_target: 3,
        disclosure: 'Loudness-matched reference track delta analysis scheduled for Phase 3.',
      },
      original_stem_multitrack_analysis: {
        status: 'NOT_IMPLEMENTED',
        phase_target: 4,
        disclosure:
          'Rule 1: Analyzes genuine user-uploaded original stems only (Phase 4). AI stem splitting is permanently prohibited.',
      },
      device_translation_preview: {
        status: 'NOT_IMPLEMENTED',
        phase_target: 4,
        disclosure: 'Rule 6: Playback-device translation previews scheduled for Phase 4.',
      },
      mix_revision_comparison: {
        status: 'NOT_IMPLEMENTED',
        phase_target: 5,
        disclosure: 'Before/after mix revision delta comparison scheduled for Phase 5.',
      },
      ai_educational_interpretation: {
        status: 'NOT_IMPLEMENTED',
        phase_target: 5,
        disclosure:
          'Rule 2 & 4: Consent-gated Gemini educational interpretation scheduled for Phase 5.',
      },
      ai_stem_separation: {
        status: 'PROHIBITED_BY_PRODUCT_RULE',
        phase_target: null,
        disclosure:
          'Rule 1: AI stem separation, automatic stem splitting, and pseudo-stem generation are permanently forbidden. Only genuine user-uploaded original stems are accepted.',
      },
    },
    measurements,
    issues,
    recommendations,
    extensions: {
      streaming_estimates: null,
      reference_comparison: null,
      stem_multitrack_report: null,
      device_translation_profiles: null,
      revision_comparison: null,
      ai_interpretation: null,
    },
    timeline: {
      bucket_duration_sec: round2(bucketDur),
      total_duration_sec: round2(durationSeconds),
      buckets,
    },
  };
}

/**
 * Decodes an uploaded File using browser AudioContext and runs local mathematical DSP analysis.
 */
export async function analyzeAudioLocallyWithWebAudio(
  file: File,
  options: LocalDspOptions
): Promise<AnalysisReport> {
  const AudioCtx =
    typeof window !== 'undefined'
      ? window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;

  if (!AudioCtx) {
    throw new Error('Browser Web Audio API is unavailable in this environment.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const ctx = new AudioCtx();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const numChannels = Math.min(2, audioBuffer.numberOfChannels);
    const channels: Float32Array[] = [];
    for (let c = 0; c < numChannels; c++) {
      channels.push(audioBuffer.getChannelData(c));
    }
    return analyzePcmBuffersLocally({
      channels,
      sampleRate: audioBuffer.sampleRate,
      filename: file.name,
      fileSizeBytes: file.size,
      options,
    });
  } finally {
    await ctx.close().catch(() => {});
  }
}

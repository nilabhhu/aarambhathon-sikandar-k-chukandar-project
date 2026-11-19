/**
 * Pure 2D Retro Spectrum Analyzer Model for CHECKMIX / MixLearn Studio.
 * Decoupled from DOM/Canvas/WebAudio so it can be unit-tested directly with node:test.
 *
 * Divides 20 Hz – 20 kHz into 6 canonical studio bands:
 *   Sub (20–60Hz), Bass (60–250Hz), Low-Mids (250–500Hz),
 *   Mids (500Hz–2kHz), High-Mids (2–6kHz), Air (6–20kHz)
 * with 8 log-spaced pixel LED bars per band (48 total bars).
 */

import {
  AnalysisIssue,
  AnalysisReport,
  GenreId,
  MixStage,
} from '../contracts/analysisContract';
import { SixBandMeasurements } from './spectralProfile';

export type RetroBandId =
  | 'sub'
  | 'bass'
  | 'low_mids'
  | 'mids'
  | 'high_mids'
  | 'air';

export interface RetroBandDefinition {
  id: RetroBandId;
  label: string;
  axisRange: string;
  minHz: number;
  maxHz: number;
  startBarIndex: number;
  endBarIndex: number; // inclusive
}

export const BARS_PER_BAND = 8;
export const TOTAL_RETRO_BARS = BARS_PER_BAND * 6; // 48 crisp pixel bars

export const RETRO_BAND_DEFINITIONS: ReadonlyArray<RetroBandDefinition> = [
  { id: 'sub', label: 'Sub', axisRange: '20–60Hz', minHz: 20, maxHz: 60, startBarIndex: 0, endBarIndex: 7 },
  { id: 'bass', label: 'Bass', axisRange: '60–250Hz', minHz: 60, maxHz: 250, startBarIndex: 8, endBarIndex: 15 },
  { id: 'low_mids', label: 'Low-Mids', axisRange: '250–500Hz', minHz: 250, maxHz: 500, startBarIndex: 16, endBarIndex: 23 },
  { id: 'mids', label: 'Mids', axisRange: '500Hz–2kHz', minHz: 500, maxHz: 2000, startBarIndex: 24, endBarIndex: 31 },
  { id: 'high_mids', label: 'High-Mids', axisRange: '2–6kHz', minHz: 2000, maxHz: 6000, startBarIndex: 32, endBarIndex: 39 },
  { id: 'air', label: 'Air', axisRange: '6–20kHz', minHz: 6000, maxHz: 20000, startBarIndex: 40, endBarIndex: 47 },
];

export interface RetroBarDatum {
  index: number;
  bandId: RetroBandId;
  centerHz: number;
  dbfs: number;
  targetMaxDbfs: number;
  targetMinDbfs: number;
  referenceDbfs: number | null;
  exceedsTarget: boolean;
}

export interface RetroProblemZone {
  zoneId: string;
  bandId: RetroBandId;
  bandLabel: string;
  severity: 'critical' | 'warning';
  rangeLabel: string;
  headline: string; // e.g., "250Hz – 480Hz: LOW-MID MUD (+4.2 dB)"
  shortTag: string; // e.g., "LOW-MID MUD"
  deltaDb: number;
  measuredDbfs: number;
  targetMaxDbfs: number;
  actionableTip: string; // e.g., "Tip: Try a -2.5 dB bell cut around 320Hz"
  linkedIssueId: string | null;
  startBarIndex: number;
  endBarIndex: number;
  peakBarIndex: number;
  peakDbfs: number;
  isClippingTriggered: boolean;
}

export interface RetroSpectrumModel {
  bands: Array<
    RetroBandDefinition & {
      measuredDbfs: number;
      targetMinDbfs: number;
      targetMaxDbfs: number;
      deltaFromMaxDb: number;
      problemZone: RetroProblemZone | null;
    }
  >;
  bars: RetroBarDatum[];
  problemZones: RetroProblemZone[];
  issueToBandMap: Record<string, RetroBandId>;
}

/**
 * Calibrated Final Master ceiling & floor envelopes (dBFS) for the 6 retro analyzer bands.
 * Unmastered Mix shifts by -3.5 dB for pre-limiter headroom.
 */
const RETRO_GENRE_TARGETS: Record<GenreId, Record<RetroBandId, [number, number]>> = {
  indie_rock: {
    sub: [-27.0, -19.5],
    bass: [-20.5, -14.0],
    low_mids: [-21.5, -15.5],
    mids: [-21.0, -15.5],
    high_mids: [-23.0, -16.5],
    air: [-32.0, -23.5],
  },
  electronic_club: {
    sub: [-20.5, -14.0],
    bass: [-18.5, -12.5],
    low_mids: [-23.0, -17.0],
    mids: [-22.5, -16.5],
    high_mids: [-23.5, -17.0],
    air: [-29.5, -21.5],
  },
  hip_hop_trap: {
    sub: [-19.0, -13.0],
    bass: [-19.5, -13.5],
    low_mids: [-24.5, -18.0],
    mids: [-22.0, -16.5],
    high_mids: [-23.5, -17.0],
    air: [-30.0, -22.0],
  },
  pop_vocal: {
    sub: [-23.0, -16.5],
    bass: [-19.5, -13.5],
    low_mids: [-22.5, -16.5],
    mids: [-20.5, -15.0],
    high_mids: [-22.5, -16.5],
    air: [-29.0, -21.0],
  },
  acoustic_folk: {
    sub: [-32.0, -24.5],
    bass: [-22.5, -16.5],
    low_mids: [-21.5, -16.0],
    mids: [-21.0, -15.5],
    high_mids: [-24.0, -17.5],
    air: [-33.0, -24.5],
  },
  cinematic_orchestral: {
    sub: [-26.0, -18.5],
    bass: [-21.5, -15.0],
    low_mids: [-21.0, -15.0],
    mids: [-22.5, -16.5],
    high_mids: [-25.5, -19.0],
    air: [-35.0, -26.5],
  },
};

const BAND_DIAGNOSTIC_META: Record<
  RetroBandId,
  {
    rangePretty: string;
    shortTag: string;
    defaultTip: string;
    clippingTag: string;
    clippingTip: string;
  }
> = {
  sub: {
    rangePretty: '20Hz – 60Hz',
    shortTag: 'SUB RUMBLE',
    defaultTip: 'Tip: High-pass non-bass tracks at 30–35Hz and tighten sub synth sustain',
    clippingTag: 'SUB OVERLOAD',
    clippingTip: 'Tip: Roll off sub-30Hz DC rumble and trim sub bass by -2.0 dB before limiting',
  },
  bass: {
    rangePretty: '60Hz – 250Hz',
    shortTag: 'BASS BOOM',
    defaultTip: 'Tip: Carve -2.0 dB around 110–140Hz on bass guitar to clear kick punch',
    clippingTag: 'LOW-END CLIPPING',
    clippingTip: 'Tip: Pull down kick/bass bus by -2.5 dB to stop low-end limiter pumping',
  },
  low_mids: {
    rangePretty: '250Hz – 480Hz',
    shortTag: 'LOW-MID MUD',
    defaultTip: 'Tip: Try a -2.5 dB bell cut around 320Hz on guitars, keys, or pads',
    clippingTag: 'MUD BUILDUP',
    clippingTip: 'Tip: Apply a -3.0 dB dynamic bell cut at 300–360Hz to unmask vocals',
  },
  mids: {
    rangePretty: '500Hz – 2.0kHz',
    shortTag: 'MIDRANGE BOXINESS',
    defaultTip: 'Tip: Try a gentle -1.8 dB cut around 800Hz–1.2kHz to open up vocal depth',
    clippingTag: 'MID TRANSIENT CLIP',
    clippingTip: 'Tip: Soft-clip or tame snare/vocal peaks near 1.0kHz before the master bus',
  },
  high_mids: {
    rangePretty: '3.2kHz – 4.8kHz',
    shortTag: 'HARSH PEAK',
    defaultTip: 'Tip: Apply a -2.0 dB dynamic bell cut around 4.0kHz on vocals or cymbals',
    clippingTag: 'HARSH SIBILANCE / CLIP',
    clippingTip: 'Tip: De-ess or dip 3.5–4.5kHz by -2.5 dB and set True Peak ceiling to -1.0 dBTP',
  },
  air: {
    rangePretty: '6.0kHz – 20kHz',
    shortTag: 'BRITTLE AIR',
    defaultTip: 'Tip: Gently tame the 10–14kHz shelf by -1.5 dB to reduce listening fatigue',
    clippingTag: 'HIGH-FREQ SPLASH',
    clippingTip: 'Tip: Reduce high-shelf boost and enable 4x oversampling on your limiter',
  },
};

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function getRetroBandTargets(
  genre: GenreId,
  mixStage: MixStage
): Record<RetroBandId, { min: number; max: number }> {
  const base = RETRO_GENRE_TARGETS[genre] || RETRO_GENRE_TARGETS.indie_rock;
  const offset = mixStage === 'unmastered_mix' ? -3.5 : 0;
  return {
    sub: { min: round1(base.sub[0] + offset), max: round1(base.sub[1] + offset) },
    bass: { min: round1(base.bass[0] + offset), max: round1(base.bass[1] + offset) },
    low_mids: { min: round1(base.low_mids[0] + offset), max: round1(base.low_mids[1] + offset) },
    mids: { min: round1(base.mids[0] + offset), max: round1(base.mids[1] + offset) },
    high_mids: { min: round1(base.high_mids[0] + offset), max: round1(base.high_mids[1] + offset) },
    air: { min: round1(base.air[0] + offset), max: round1(base.air[1] + offset) },
  };
}

/**
 * Maps an AnalysisIssue to its primary retro frequency band (used for bidirectional card -> spectrum focus).
 */
export function mapAnalysisIssueToRetroBand(issue: AnalysisIssue): RetroBandId {
  for (const ev of issue.evidence || []) {
    if (ev.metric_key === 'sub_bass_energy_20_60hz') return 'sub';
    if (ev.metric_key === 'mud_band_energy_200_500hz') return 'low_mids';
    if (ev.metric_key === 'presence_band_energy_2k_5khz') return 'high_mids';
    if (ev.metric_key === 'air_band_energy_10k_20khz') return 'air';
  }

  const text = `${issue.title} ${issue.learning_guide?.what_was_detected || ''}`.toLowerCase();
  if (text.includes('sub') || text.includes('20–60') || text.includes('20-60')) return 'sub';
  if (text.includes('phase') || text.includes('140 hz') || text.includes('bass')) return 'bass';
  if (text.includes('mud') || text.includes('200–500') || text.includes('200-500') || text.includes('250') || text.includes('320') || text.includes('low-mid')) {
    return 'low_mids';
  }
  if (text.includes('4khz') || text.includes('4 khz') || text.includes('4.0khz') || text.includes('3.2') || text.includes('harsh') || text.includes('presence') || text.includes('2–5') || text.includes('2-5') || text.includes('sibilan')) {
    return 'high_mids';
  }
  if (text.includes('air') || text.includes('10–20') || text.includes('10-20')) return 'air';
  if (issue.domain === 'true_peak_clipping') return 'high_mids';
  if (issue.domain === 'phase_polarity' || issue.domain === 'stereo_field') return 'bass';
  return 'mids';
}

function deriveBandAverages(
  report: AnalysisReport,
  measuredSixBands?: SixBandMeasurements | null,
  spectrumBins?: number[] | null
): Record<RetroBandId, number> {
  // If we have genuine 48-bin FFT data from AudioBuffer, average each 8-bar zone directly
  if (spectrumBins && spectrumBins.length === TOTAL_RETRO_BARS) {
    const avgSlice = (start: number, end: number) => {
      let sum = 0;
      let count = 0;
      for (let i = start; i <= end; i++) {
        const v = spectrumBins[i];
        if (Number.isFinite(v)) {
          sum += v;
          count++;
        }
      }
      return count > 0 ? round1(sum / count) : -42.0;
    };
    return {
      sub: avgSlice(0, 7),
      bass: avgSlice(8, 15),
      low_mids: avgSlice(16, 23),
      mids: avgSlice(24, 31),
      high_mids: avgSlice(32, 39),
      air: avgSlice(40, 47),
    };
  }

  const m = report.measurements;
  const sub = measuredSixBands?.sub ?? m.sub_bass_energy_20_60hz.value ?? -24.0;
  const mud = m.mud_band_energy_200_500hz.value ?? measuredSixBands?.low_mid ?? -18.0;
  const pres = m.presence_band_energy_2k_5khz.value ?? measuredSixBands?.presence ?? -20.0;
  const air = measuredSixBands?.air ?? m.air_band_energy_10k_20khz.value ?? -28.0;

  const bass = measuredSixBands?.low ?? round1(sub * 0.35 + mud * 0.65);
  const lowMids = round1(mud);
  const mids = measuredSixBands?.high_mid ?? round1(mud * 0.42 + pres * 0.58);
  const highMids = round1(pres);

  return {
    sub: round1(sub),
    bass: round1(bass),
    low_mids: lowMids,
    mids: round1(mids),
    high_mids: highMids,
    air: round1(air),
  };
}

function buildOneLineTip(issue: AnalysisIssue | null, fallbackTip: string): string {
  if (!issue?.learning_guide?.what_to_try) return fallbackTip;
  const firstSentence = issue.learning_guide.what_to_try.split(/(?<=[.!?])\s+/)[0]?.trim();
  if (!firstSentence) return fallbackTip;
  const cleaned = firstSentence.replace(/^Tip:\s*/i, '');
  const compact = cleaned.length > 132 ? `${cleaned.slice(0, 128).trimEnd()}...` : cleaned;
  return `Tip: ${compact}`;
}

/**
 * Builds the complete 48-bar 2D Retro Spectrum Analyzer model, dynamically flagging:
 * 1) Any frequency band whose average energy exceeds the genre/stage target ceiling,
 * 2) Any band mapped to a detected DSP frequency_balance / clipping issue,
 * 3) Clipping/True-Peak threshold violations (> -0.1 dBTP or clipping events > 0) on the hottest band.
 */
export function buildRetroSpectrumModel(params: {
  report: AnalysisReport;
  genre: GenreId;
  mixStage: MixStage;
  measuredSixBands?: SixBandMeasurements | null;
  referenceSixBands?: SixBandMeasurements | null;
  spectrumBins?: number[] | null;
}): RetroSpectrumModel {
  const { report, genre, mixStage, measuredSixBands, referenceSixBands, spectrumBins } = params;
  const targets = getRetroBandTargets(genre, mixStage);
  const bandAvgs = deriveBandAverages(report, measuredSixBands, spectrumBins);

  const hasExactBins = Boolean(spectrumBins && spectrumBins.length === TOTAL_RETRO_BARS);

  // Map every report issue to a retro band for bidirectional card -> spectrum focus
  const issueToBandMap: Record<string, RetroBandId> = {};
  const bandPrimaryIssue = new Map<RetroBandId, AnalysisIssue>();
  const severityRank: Record<string, number> = { critical: 3, warning: 2, notice: 1, pass: 0 };

  for (const issue of report.issues || []) {
    const targetBand = mapAnalysisIssueToRetroBand(issue);
    issueToBandMap[issue.issue_id] = targetBand;

    // Prioritize dedicated frequency_balance issues over global true_peak_clipping on the same band
    if (
      issue.domain === 'frequency_balance' ||
      issue.domain === 'true_peak_clipping' ||
      issue.domain === 'phase_polarity'
    ) {
      const existing = bandPrimaryIssue.get(targetBand);
      const issuePriority =
        (issue.domain === 'frequency_balance' ? 10 : 0) + (severityRank[issue.severity] ?? 0);
      const existingPriority = existing
        ? (existing.domain === 'frequency_balance' ? 10 : 0) + (severityRank[existing.severity] ?? 0)
        : -1;
      if (!existing || issuePriority > existingPriority) {
        bandPrimaryIssue.set(targetBand, issue);
      }
    }
  }

  // Optional Reference B band values
  const refMap: Record<RetroBandId, number | null> = {
    sub: referenceSixBands?.sub ?? null,
    bass: referenceSixBands?.low ?? null,
    low_mids: referenceSixBands?.low_mid ?? null,
    mids: referenceSixBands?.high_mid ?? null,
    high_mids: referenceSixBands?.presence ?? null,
    air: referenceSixBands?.air ?? null,
  };

  // Build 48 crisp log-spaced bars
  const bars: RetroBarDatum[] = [];
  const bandOrder: RetroBandId[] = ['sub', 'bass', 'low_mids', 'mids', 'high_mids', 'air'];

  for (let bIdx = 0; bIdx < RETRO_BAND_DEFINITIONS.length; bIdx++) {
    const def = RETRO_BAND_DEFINITIONS[bIdx];
    const prevAvg = bIdx > 0 ? bandAvgs[bandOrder[bIdx - 1]] : bandAvgs[def.id];
    const curAvg = bandAvgs[def.id];
    const nextAvg = bIdx < bandOrder.length - 1 ? bandAvgs[bandOrder[bIdx + 1]] : bandAvgs[def.id];
    const t = targets[def.id];
    const refVal = refMap[def.id];

    for (let k = 0; k < BARS_PER_BAND; k++) {
      const barIndex = def.startBarIndex + k;
      const frac = (k + 0.5) / BARS_PER_BAND;
      const centerHz = Math.round(def.minHz * Math.pow(def.maxHz / def.minHz, frac));

      let barDb: number;
      if (hasExactBins && spectrumBins && Number.isFinite(spectrumBins[barIndex])) {
        barDb = round1(clamp(spectrumBins[barIndex], -54, -2));
      } else {
        // Smooth deterministic interpolation anchored strictly at curAvg with subtle musical peak contour
        const edgeBlend =
          k < 2
            ? prevAvg * (0.28 - k * 0.12) + curAvg * (0.72 + k * 0.12)
            : k > 5
            ? nextAvg * ((k - 5) * 0.14) + curAvg * (1 - (k - 5) * 0.14)
            : curAvg;
        // Center-peaked bell shape (+1.6 dB near center of flagged resonant band) so peak markers sit cleanly
        const centerDist = Math.abs(frac - 0.52);
        const contour = (0.38 - centerDist) * 3.4 + Math.sin(barIndex * 1.85) * 0.7;
        barDb = round1(clamp(edgeBlend + contour, -52, -3));
      }

      bars.push({
        index: barIndex,
        bandId: def.id,
        centerHz,
        dbfs: barDb,
        targetMaxDbfs: t.max,
        targetMinDbfs: t.min,
        referenceDbfs: refVal !== null ? round1(clamp(refVal + Math.sin(barIndex * 1.4) * 0.6, -52, -3)) : null,
        exceedsTarget: barDb > t.max,
      });
    }
  }

  // Detect global clipping state
  const tpVal = report.measurements?.true_peak_max?.value;
  const clipRuns = report.measurements?.sample_clipping_events?.value;
  const hasGlobalClipping =
    (typeof tpVal === 'number' && tpVal > -0.1) || (typeof clipRuns === 'number' && clipRuns > 0);

  // Identify hottest band (in case clipping happens even when spectral average is within envelope)
  let hottestBandId: RetroBandId = 'low_mids';
  let maxDelta = -999;
  for (const def of RETRO_BAND_DEFINITIONS) {
    const d = bandAvgs[def.id] - targets[def.id].max;
    if (d > maxDelta) {
      maxDelta = d;
      hottestBandId = def.id;
    }
  }

  const problemZones: RetroProblemZone[] = [];
  const bandSummaries = RETRO_BAND_DEFINITIONS.map((def) => {
    const measured = bandAvgs[def.id];
    const t = targets[def.id];
    const deltaFromMax = round1(measured - t.max);
    const bandBars = bars.slice(def.startBarIndex, def.endBarIndex + 1);
    let peakBar = bandBars[0];
    for (const b of bandBars) {
      if (b.dbfs > peakBar.dbfs) peakBar = b;
    }

    const linkedIssue = bandPrimaryIssue.get(def.id) ?? null;
    const issueText = `${linkedIssue?.title ?? ''} ${linkedIssue?.learning_guide?.what_was_detected ?? ''}`.toLowerCase();
    const isDeficiencyIssue =
      issueText.includes('lack') ||
      issueText.includes('thin') ||
      issueText.includes('hollow') ||
      issueText.includes('deficien') ||
      issueText.includes('under-represented') ||
      issueText.includes('below target') ||
      issueText.includes('low energy');
    const isSpectralExcessIssue =
      linkedIssue?.domain === 'frequency_balance' &&
      !isDeficiencyIssue &&
      peakBar.dbfs >= t.min - 4.0;
    const isClippingIssue = linkedIssue?.domain === 'true_peak_clipping';
    const exceedsCeiling = deltaFromMax > 0.6;
    const peakOverTarget = round1(peakBar.dbfs - t.max);
    const bandPeakExceeds = peakOverTarget >= 2.2;
    const peakExceedsClipping =
      peakBar.dbfs >= -3.5 ||
      (hasGlobalClipping && isClippingIssue) ||
      (hasGlobalClipping && !isSpectralExcessIssue && def.id === hottestBandId);

    let zone: RetroProblemZone | null = null;
    if (exceedsCeiling || isSpectralExcessIssue || bandPeakExceeds || peakExceedsClipping) {
      const meta = BAND_DIAGNOSTIC_META[def.id];
      const effectiveDelta = round1(
        deltaFromMax > 0.5
          ? deltaFromMax
          : Math.max(1.2, peakOverTarget)
      );

      const isCrit =
        peakExceedsClipping ||
        linkedIssue?.severity === 'critical' ||
        deltaFromMax >= 4.2 ||
        (def.id === 'high_mids' && effectiveDelta >= 4.0) ||
        peakBar.dbfs >= -13.5;

      const shortTag =
        isClippingIssue && !isSpectralExcessIssue && deltaFromMax <= 0.6
          ? meta.clippingTag
          : meta.shortTag;

      const signDelta = `+${effectiveDelta.toFixed(1)} dB`;
      const headline =
        def.id === 'high_mids'
          ? `4.0kHz: ${shortTag} (${signDelta})`
          : `${meta.rangePretty}: ${shortTag} (${signDelta})`;

      zone = {
        zoneId: `zone-${def.id}`,
        bandId: def.id,
        bandLabel: def.label,
        severity: isCrit ? 'critical' : 'warning',
        rangeLabel: meta.rangePretty,
        headline,
        shortTag,
        deltaDb: effectiveDelta,
        measuredDbfs: measured,
        targetMaxDbfs: t.max,
        actionableTip: buildOneLineTip(
          linkedIssue,
          isCrit ? meta.clippingTip : meta.defaultTip
        ),
        linkedIssueId: linkedIssue?.issue_id ?? null,
        startBarIndex: def.startBarIndex,
        endBarIndex: def.endBarIndex,
        peakBarIndex: peakBar.index,
        peakDbfs: peakBar.dbfs,
        isClippingTriggered: peakExceedsClipping,
      };
      problemZones.push(zone);
    }

    return {
      ...def,
      measuredDbfs: measured,
      targetMinDbfs: t.min,
      targetMaxDbfs: t.max,
      deltaFromMaxDb: deltaFromMax,
      problemZone: zone,
    };
  });

  return {
    bands: bandSummaries,
    bars,
    problemZones,
    issueToBandMap,
  };
}

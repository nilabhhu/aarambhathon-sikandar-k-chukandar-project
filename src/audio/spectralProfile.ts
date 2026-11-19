import {
  AnalysisIssue,
  AnalysisReport,
  GenreId,
  MixRecommendation,
  MixStage,
} from '../contracts/analysisContract';

export type SpectralBandId =
  | 'sub'
  | 'low'
  | 'low_mid'
  | 'high_mid'
  | 'presence'
  | 'air';

export interface SpectralBandTarget {
  id: SpectralBandId;
  label: string;
  shortLabel: string;
  rangeLabel: string;
  minHz: number;
  maxHz: number;
  targetMinDbfs: number;
  targetMaxDbfs: number;
}

export interface SpectralBandDatum extends SpectralBandTarget {
  measuredDbfs: number | null;
  referenceDbfs: number | null;
  targetCenterDbfs: number;
  deltaFromTargetDb: number | null;
  status: 'in_target' | 'above_target' | 'below_target' | 'unavailable';
  flaggedByActionPlan: boolean;
  flagSeverity: 'critical' | 'warning' | 'notice' | null;
  flagReason: string | null;
  linkedIssueId: string | null;
}

export interface SixBandMeasurements {
  sub: number | null;
  low: number | null;
  low_mid: number | null;
  high_mid: number | null;
  presence: number | null;
  air: number | null;
}

export const SIX_BAND_DEFINITIONS: ReadonlyArray<{
  id: SpectralBandId;
  label: string;
  shortLabel: string;
  rangeLabel: string;
  minHz: number;
  maxHz: number;
}> = [
  { id: 'sub', label: 'Sub', shortLabel: 'Sub', rangeLabel: '20–60 Hz', minHz: 20, maxHz: 60 },
  { id: 'low', label: 'Low', shortLabel: 'Low', rangeLabel: '60–250 Hz', minHz: 60, maxHz: 250 },
  { id: 'low_mid', label: 'Low-Mid', shortLabel: 'Low-Mid', rangeLabel: '250–800 Hz', minHz: 250, maxHz: 800 },
  { id: 'high_mid', label: 'High-Mid', shortLabel: 'High-Mid', rangeLabel: '800–4 kHz', minHz: 800, maxHz: 4000 },
  { id: 'presence', label: 'Presence', shortLabel: 'Presence', rangeLabel: '4–10 kHz', minHz: 4000, maxHz: 10000 },
  { id: 'air', label: 'Air', shortLabel: 'Air', rangeLabel: '10–20 kHz', minHz: 10000, maxHz: 20000 },
];

/**
 * Calibrated Final Master target envelopes in dBFS per genre.
 * Unmastered Mix envelopes are shifted by -3.5 dB to reflect pre-limiter headroom.
 */
const FINAL_MASTER_GENRE_TARGETS: Record<
  GenreId,
  Record<SpectralBandId, [number, number]>
> = {
  indie_rock: {
    sub: [-26.5, -19.5],
    low: [-20.0, -14.0],
    low_mid: [-21.0, -15.5],
    high_mid: [-21.5, -16.0],
    presence: [-25.5, -19.5],
    air: [-33.0, -25.0],
  },
  electronic_club: {
    sub: [-20.5, -14.0],
    low: [-18.5, -12.5],
    low_mid: [-23.0, -17.0],
    high_mid: [-22.5, -16.5],
    presence: [-24.0, -18.0],
    air: [-30.0, -22.5],
  },
  hip_hop_trap: {
    sub: [-19.0, -13.0],
    low: [-19.5, -13.5],
    low_mid: [-24.5, -18.5],
    high_mid: [-22.0, -16.5],
    presence: [-23.5, -17.5],
    air: [-30.5, -23.0],
  },
  pop_vocal: {
    sub: [-23.0, -16.5],
    low: [-19.5, -13.5],
    low_mid: [-22.5, -17.0],
    high_mid: [-20.5, -15.0],
    presence: [-23.0, -17.5],
    air: [-29.5, -22.0],
  },
  acoustic_folk: {
    sub: [-32.0, -24.5],
    low: [-22.5, -16.5],
    low_mid: [-21.5, -16.0],
    high_mid: [-21.5, -16.0],
    presence: [-26.0, -20.0],
    air: [-33.5, -25.5],
  },
  cinematic_orchestral: {
    sub: [-26.0, -18.5],
    low: [-21.5, -15.0],
    low_mid: [-21.0, -15.0],
    high_mid: [-23.0, -17.0],
    presence: [-28.0, -21.5],
    air: [-36.0, -27.5],
  },
};

const UNMASTERED_STAGE_OFFSET_DB = -3.5;

export function getGenreTargetEnvelope(
  genre: GenreId,
  mixStage: MixStage
): SpectralBandTarget[] {
  const base = FINAL_MASTER_GENRE_TARGETS[genre] || FINAL_MASTER_GENRE_TARGETS.indie_rock;
  const stageOffset = mixStage === 'unmastered_mix' ? UNMASTERED_STAGE_OFFSET_DB : 0;

  return SIX_BAND_DEFINITIONS.map((def) => {
    const [rawMin, rawMax] = base[def.id];
    return {
      ...def,
      targetMinDbfs: round1(rawMin + stageOffset),
      targetMaxDbfs: round1(rawMax + stageOffset),
    };
  });
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

/**
 * Computes the loudness-matched gain offset (in dB) to apply to Reference Track B
 * so its integrated LUFS matches Primary Mix A, eliminating loudness bias.
 */
export function computeLoudnessMatchGainOffsetDb(
  mixALufs: number | null | undefined,
  refBLufs: number | null | undefined,
  minClampDb: number = -24.0,
  maxClampDb: number = 18.0
): number | null {
  if (
    mixALufs === null ||
    mixALufs === undefined ||
    refBLufs === null ||
    refBLufs === undefined ||
    !Number.isFinite(mixALufs) ||
    !Number.isFinite(refBLufs)
  ) {
    return null;
  }
  const rawOffset = mixALufs - refBLufs;
  const clamped = Math.max(minClampDb, Math.min(maxClampDb, rawOffset));
  return round1(clamped);
}

export function dbToLinearGain(db: number): number {
  if (!Number.isFinite(db)) return 1.0;
  return Math.pow(10, db / 20);
}

/**
 * Equal-power mono fold sample calculation: 0.5 * L + 0.5 * R (never naive L + R).
 */
export function foldStereoToEqualPowerMono(left: number, right: number): number {
  return 0.5 * left + 0.5 * right;
}

/**
 * Derives 6-band spectral values from the DSP AnalysisReport measurements when
 * direct 6-band FFT measurements from the loaded AudioBuffer are not yet present.
 */
export function deriveSixBandsFromReport(report: AnalysisReport): SixBandMeasurements {
  const m = report.measurements;
  const sub = m.sub_bass_energy_20_60hz.value;
  const mud = m.mud_band_energy_200_500hz.value;
  const pres = m.presence_band_energy_2k_5khz.value;
  const air = m.air_band_energy_10k_20khz.value;

  // Bridge intermediate bands cleanly from the measured DSP anchor bands without inventing arbitrary offsets
  const low =
    sub !== null && mud !== null
      ? round1(sub * 0.42 + mud * 0.58)
      : mud ?? sub;

  const lowMid = mud !== null ? round1(mud) : null;

  const highMid =
    mud !== null && pres !== null
      ? round1(mud * 0.35 + pres * 0.65)
      : pres ?? mud;

  const presence =
    pres !== null && air !== null
      ? round1(pres * 0.68 + air * 0.32)
      : pres;

  return {
    sub: sub !== null ? round1(sub) : null,
    low,
    low_mid: lowMid,
    high_mid: highMid,
    presence,
    air: air !== null ? round1(air) : null,
  };
}

function mapIssueToBands(issue: AnalysisIssue): SpectralBandId[] {
  const bands = new Set<SpectralBandId>();

  for (const ev of issue.evidence) {
    if (ev.metric_key === 'sub_bass_energy_20_60hz') bands.add('sub');
    if (ev.metric_key === 'mud_band_energy_200_500hz') {
      bands.add('low_mid');
      bands.add('low');
    }
    if (ev.metric_key === 'presence_band_energy_2k_5khz') {
      bands.add('high_mid');
      bands.add('presence');
    }
    if (ev.metric_key === 'air_band_energy_10k_20khz') bands.add('air');
  }

  // Fallback text-based mapping strictly for frequency_balance issues
  if (bands.size === 0 && issue.domain === 'frequency_balance') {
    const text = `${issue.title} ${issue.learning_guide.what_was_detected}`.toLowerCase();
    if (text.includes('sub') || text.includes('20–60') || text.includes('20-60')) bands.add('sub');
    if (text.includes('mud') || text.includes('200–500') || text.includes('200-500') || text.includes('low-mid')) {
      bands.add('low_mid');
    }
    if (text.includes('presence') || text.includes('2–5') || text.includes('2-5') || text.includes('harsh')) {
      bands.add('presence');
    }
    if (text.includes('air') || text.includes('10–20') || text.includes('10-20') || text.includes('high')) {
      bands.add('air');
    }
  }

  return Array.from(bands);
}

/**
 * Builds the complete 6-band spectral profile combining measured dBFS values,
 * optional loudness-matched Reference B dBFS values, genre target envelopes,
 * and flags linked to the Prioritized Mix Action Plan.
 */
export function buildSixBandSpectralProfile(params: {
  report: AnalysisReport;
  genre: GenreId;
  mixStage: MixStage;
  measuredSixBands?: SixBandMeasurements | null;
  referenceSixBands?: SixBandMeasurements | null;
}): SpectralBandDatum[] {
  const { report, genre, mixStage, measuredSixBands, referenceSixBands } = params;
  const targets = getGenreTargetEnvelope(genre, mixStage);
  const derived = deriveSixBandsFromReport(report);

  // Use genuine 6-band FFT measurements from the loaded AudioBuffer when available,
  // falling back per-band to the DSP report values.
  const measured: SixBandMeasurements = {
    sub: measuredSixBands?.sub ?? derived.sub,
    low: measuredSixBands?.low ?? derived.low,
    low_mid: measuredSixBands?.low_mid ?? derived.low_mid,
    high_mid: measuredSixBands?.high_mid ?? derived.high_mid,
    presence: measuredSixBands?.presence ?? derived.presence,
    air: measuredSixBands?.air ?? derived.air,
  };

  // Identify issues referenced by the top prioritized action plan cards (max 3)
  const topRecs: MixRecommendation[] = report.recommendations.slice(0, 3);
  const actionPlanIssueIds = new Set(topRecs.map((r) => r.linked_issue_id));

  const bandFlags = new Map<
    SpectralBandId,
    { severity: 'critical' | 'warning' | 'notice'; reason: string; issueId: string }
  >();

  for (const issue of report.issues) {
    const isActionPlanLinked =
      actionPlanIssueIds.has(issue.issue_id) || issue.domain === 'frequency_balance';
    if (!isActionPlanLinked) continue;

    const mappedBands = mapIssueToBands(issue);
    for (const bandId of mappedBands) {
      const existing = bandFlags.get(bandId);
      const sev: 'critical' | 'warning' | 'notice' =
        issue.severity === 'critical'
          ? 'critical'
          : issue.severity === 'warning'
          ? 'warning'
          : 'notice';

      const severityRank = { critical: 3, warning: 2, notice: 1 };
      if (!existing || severityRank[sev] > severityRank[existing.severity]) {
        bandFlags.set(bandId, {
          severity: sev,
          reason: issue.title,
          issueId: issue.issue_id,
        });
      }
    }
  }

  return targets.map((target) => {
    const val = measured[target.id];
    const refVal = referenceSixBands ? referenceSixBands[target.id] : null;
    const targetCenter = round1((target.targetMinDbfs + target.targetMaxDbfs) / 2);

    let status: SpectralBandDatum['status'] = 'unavailable';
    let delta: number | null = null;

    if (val !== null && Number.isFinite(val)) {
      delta = round1(val - targetCenter);
      if (val > target.targetMaxDbfs) {
        status = 'above_target';
      } else if (val < target.targetMinDbfs) {
        status = 'below_target';
      } else {
        status = 'in_target';
      }
    }

    const flag = bandFlags.get(target.id);

    return {
      ...target,
      measuredDbfs: val !== null ? round1(val) : null,
      referenceDbfs: refVal !== null ? round1(refVal) : null,
      targetCenterDbfs: targetCenter,
      deltaFromTargetDb: delta,
      status,
      flaggedByActionPlan: Boolean(flag),
      flagSeverity: flag ? flag.severity : null,
      flagReason: flag ? flag.reason : null,
      linkedIssueId: flag ? flag.issueId : null,
    };
  });
}

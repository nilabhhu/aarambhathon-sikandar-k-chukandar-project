/**
 * Pure deterministic Phase 4 DSP & validation logic for MixLearn Studio.
 * Decoupled from DOM/Web Audio so it can be unit-tested directly with node:test.
 *
 * Mirrors backend/app/dsp/stems.py and backend/app/dsp/revisions.py 1:1.
 */

import {
  AnalysisIssue,
  AnalysisReport,
  OverlapSeverity,
  PairwiseBandOverlap,
  RevisionDeltaReport,
  RevisionFindingStatus,
  RevisionFindingVerification,
  RevisionSpectralBandDelta,
  StemAnalysisItem,
  StemBandKey,
  StemMultitrackReport,
  StemOverlapHighlight,
  StemPairOverlap,
} from '../contracts/analysisContract';

export const MIN_ORIGINAL_STEMS = 2;
export const MAX_ORIGINAL_STEMS = 8;
export const MAX_STEM_FILE_BYTES = 104_857_600; // 100 MiB
export const MAX_TOTAL_STEMS_BYTES = 367_001_600; // 350 MiB
export const MAX_STEM_DURATION_MISMATCH_MS = 50.0;

export const SIX_OCTAVE_BAND_DEFS: ReadonlyArray<{
  key: StemBandKey;
  label: string;
  shortLabel: string;
  low_hz: number;
  high_hz: number;
}> = [
  { key: 'sub', label: 'Sub (20–60 Hz)', shortLabel: 'Sub', low_hz: 20, high_hz: 60 },
  { key: 'low', label: 'Low (60–250 Hz)', shortLabel: 'Low', low_hz: 60, high_hz: 250 },
  { key: 'low_mid', label: 'Low-Mid (250–800 Hz)', shortLabel: 'Low-Mid', low_hz: 250, high_hz: 800 },
  { key: 'high_mid', label: 'High-Mid (800–4k Hz)', shortLabel: 'High-Mid', low_hz: 800, high_hz: 4000 },
  { key: 'presence', label: 'Presence (4–10k Hz)', shortLabel: 'Presence', low_hz: 4000, high_hz: 10000 },
  { key: 'air', label: 'Air (10–20k Hz)', shortLabel: 'Air', low_hz: 10000, high_hz: 20000 },
];

export interface StemFileValidationResult {
  valid: boolean;
  errorCode:
    | 'PROHIBITED_AI_STEM_SEPARATION'
    | 'INVALID_STEM_COUNT'
    | 'STEM_FILE_TOO_LARGE'
    | 'TOTAL_STEM_UPLOAD_TOO_LARGE'
    | null;
  errorMessage: string | null;
  totalBytes: number;
}

export function validateOriginalStemFiles(
  files: ReadonlyArray<{ name: string; size: number }>
): StemFileValidationResult {
  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);

  if (files.length === 1) {
    return {
      valid: false,
      errorCode: 'PROHIBITED_AI_STEM_SEPARATION',
      errorMessage:
        'Upload 2–8 original DAW stems to inspect pairwise frequency overlap—MixLearn Studio never fabricates AI stems from a single stereo mixdown.',
      totalBytes,
    };
  }

  if (files.length < MIN_ORIGINAL_STEMS || files.length > MAX_ORIGINAL_STEMS) {
    return {
      valid: false,
      errorCode: 'INVALID_STEM_COUNT',
      errorMessage: `Please select between ${MIN_ORIGINAL_STEMS} and ${MAX_ORIGINAL_STEMS} original stem files (selected ${files.length}).`,
      totalBytes,
    };
  }

  for (const f of files) {
    if (f.size > MAX_STEM_FILE_BYTES) {
      return {
        valid: false,
        errorCode: 'STEM_FILE_TOO_LARGE',
        errorMessage: `"${f.name}" exceeds the 100 MB per-stem upload limit.`,
        totalBytes,
      };
    }
  }

  if (totalBytes > MAX_TOTAL_STEMS_BYTES) {
    return {
      valid: false,
      errorCode: 'TOTAL_STEM_UPLOAD_TOO_LARGE',
      errorMessage: `Combined stem size (${(totalBytes / (1024 * 1024)).toFixed(1)} MB) exceeds the 350 MB session limit.`,
      totalBytes,
    };
  }

  return { valid: true, errorCode: null, errorMessage: null, totalBytes };
}

export function checkStemDurationAlignment(
  stems: ReadonlyArray<{ name: string; durationSec: number }>
): { aligned: boolean; maxDiffMs: number; referenceDurationSec: number; errorMessage: string | null } {
  if (stems.length < 2) {
    return {
      aligned: false,
      maxDiffMs: 0,
      referenceDurationSec: stems[0]?.durationSec ?? 0,
      errorMessage: 'At least 2 stems are required to check alignment.',
    };
  }
  const durations = stems.map((s) => s.durationSec);
  const minDur = Math.min(...durations);
  const maxDur = Math.max(...durations);
  const maxDiffMs = Math.round((maxDur - minDur) * 1000 * 100) / 100;

  if (maxDiffMs > MAX_STEM_DURATION_MISMATCH_MS) {
    return {
      aligned: false,
      maxDiffMs,
      referenceDurationSec: minDur,
      errorMessage: `Uploaded stems are misaligned by ${maxDiffMs.toFixed(1)} ms (max allowed tolerance is ${MAX_STEM_DURATION_MISMATCH_MS} ms). Export all stems from the exact same DAW start and end locators.`,
    };
  }

  return {
    aligned: true,
    maxDiffMs,
    referenceDurationSec: minDur,
    errorMessage: null,
  };
}

export function computePairwiseBandOverlap(
  dbA: number | null,
  dbB: number | null,
  peakBandA: number,
  peakBandB: number
): PairwiseBandOverlap {
  if (dbA === null || dbB === null || dbA <= -60.0 || dbB <= -60.0) {
    return {
      stem_a_db: dbA,
      stem_b_db: dbB,
      level_diff_db: null,
      overlap_score: 0,
      severity: 'low',
    };
  }

  const promA = Math.max(0, Math.min(1, (dbA - (peakBandA - 24.0)) / 24.0));
  const promB = Math.max(0, Math.min(1, (dbB - (peakBandB - 24.0)) / 24.0));
  const absFloor = Math.min(dbA, dbB);
  const absFactor = Math.max(0, Math.min(1, (absFloor + 52.0) / 34.0));
  const levelDiff = Math.abs(dbA - dbB);
  const proximity = Math.max(0, 1.0 - levelDiff / 18.0);
  const score = Math.round(Math.sqrt(promA * promB) * (0.45 + 0.55 * proximity) * absFactor * 1000) / 1000;

  const severity: OverlapSeverity = score >= 0.62 ? 'high' : score >= 0.36 ? 'moderate' : 'low';

  return {
    stem_a_db: Math.round(dbA * 10) / 10,
    stem_b_db: Math.round(dbB * 10) / 10,
    level_diff_db: Math.round(levelDiff * 10) / 10,
    overlap_score: score,
    severity,
  };
}

export function buildPairwiseOverlapMatrixPure(
  stems: StemAnalysisItem[]
): StemMultitrackReport['overlap_matrix'] {
  const peakBandMap = new Map<string, number>();
  for (const stem of stems) {
    const vals = Object.values(stem.six_band_energies_db).filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v) && v > -110
    );
    peakBandMap.set(stem.stem_id, vals.length > 0 ? Math.max(...vals) : -60);
  }

  const pairs: StemPairOverlap[] = [];
  const highlights: StemOverlapHighlight[] = [];

  for (let i = 0; i < stems.length; i++) {
    for (let j = i + 1; j < stems.length; j++) {
      const sA = stems[i];
      const sB = stems[j];
      const bands = {} as Record<StemBandKey, PairwiseBandOverlap>;
      let maxScore = 0;
      let dominantBand: StemBandKey = 'low';
      let dominantLabel = 'Low (60–250 Hz)';

      for (const bandDef of SIX_OCTAVE_BAND_DEFS) {
        const ov = computePairwiseBandOverlap(
          sA.six_band_energies_db[bandDef.key],
          sB.six_band_energies_db[bandDef.key],
          peakBandMap.get(sA.stem_id) ?? -60,
          peakBandMap.get(sB.stem_id) ?? -60
        );
        bands[bandDef.key] = ov;
        if (ov.overlap_score > maxScore) {
          maxScore = ov.overlap_score;
          dominantBand = bandDef.key;
          dominantLabel = bandDef.label;
        }
        if (ov.severity === 'high' || ov.severity === 'moderate') {
          highlights.push({
            stem_a: sA.stem_name,
            stem_b: sB.stem_name,
            band_key: bandDef.key,
            band_label: bandDef.label,
            severity: ov.severity,
            overlap_score: ov.overlap_score,
            stem_a_db: ov.stem_a_db,
            stem_b_db: ov.stem_b_db,
            note: `Potential spectral masking between "${sA.stem_name}" (${ov.stem_a_db} dBFS) and "${sB.stem_name}" (${ov.stem_b_db} dBFS) in ${bandDef.label}. Verify with solo/mute and complementary EQ carving.`,
          });
        }
      }

      const overallSeverity: OverlapSeverity =
        maxScore >= 0.62 ? 'high' : maxScore >= 0.36 ? 'moderate' : 'low';

      pairs.push({
        stem_a_id: sA.stem_id,
        stem_a_name: sA.stem_name,
        stem_b_id: sB.stem_id,
        stem_b_name: sB.stem_name,
        peak_overlap_band: dominantBand,
        peak_overlap_band_label: dominantLabel,
        peak_overlap_score: Math.round(maxScore * 1000) / 1000,
        severity: overallSeverity,
        bands,
        summary: `Highest shared energy in ${dominantLabel} (potential spectral masking: ${overallSeverity}).`,
      });
    }
  }

  highlights.sort((a, b) => b.overlap_score - a.overlap_score);

  return {
    bands: SIX_OCTAVE_BAND_DEFS.map((b) => ({
      key: b.key,
      label: b.label,
      low_hz: b.low_hz,
      high_hz: b.high_hz,
    })),
    pairs,
    highlights: highlights.slice(0, 12),
    methodology_note:
      'Measured via Hann-windowed Welch PSD across 6 octave bands on genuine user-uploaded stems. Overlap values flag potential spectral masking zones—not definitive psychoacoustic masking—and should be verified by ear.',
  };
}

const METRIC_EPSILONS: Record<string, number> = {
  sample_clipping_events: 0.5,
  true_peak_max: 0.15,
  sample_peak_max: 0.15,
  integrated_loudness: 0.25,
  short_term_max_loudness: 0.25,
  momentary_max_loudness: 0.25,
  loudness_range_lra: 0.25,
  crest_factor: 0.25,
  phase_correlation_mean: 0.03,
  phase_correlation_min: 0.03,
  stereo_width_index: 1.5,
  sub_bass_energy_20_60hz: 0.4,
  mud_band_energy_200_500hz: 0.4,
  presence_band_energy_2k_5khz: 0.4,
  air_band_energy_10k_20khz: 0.4,
};

function safeDelta(v1: number | null | undefined, v2: number | null | undefined, decimals = 2): number | null {
  if (v1 === null || v1 === undefined || v2 === null || v2 === undefined) return null;
  if (!Number.isFinite(v1) || !Number.isFinite(v2)) return null;
  const factor = Math.pow(10, decimals);
  const res = Math.round((v2 - v1) * factor) / factor;
  return Object.is(res, -0) ? 0 : res;
}

function distanceToTarget(
  val: number | null,
  targetMin: number | null,
  targetMax: number | null
): number | null {
  if (val === null || !Number.isFinite(val)) return null;
  if (targetMin !== null && val < targetMin) return targetMin - val;
  if (targetMax !== null && val > targetMax) return val - targetMax;
  return 0;
}

export function extractSixBandsFromReportPure(
  report: AnalysisReport
): { bands: Record<StemBandKey, number | null>; source: string } {
  const m = report.measurements;
  const sub = m.sub_bass_energy_20_60hz?.value ?? null;
  const mud = m.mud_band_energy_200_500hz?.value ?? null;
  const pres = m.presence_band_energy_2k_5khz?.value ?? null;
  const air = m.air_band_energy_10k_20khz?.value ?? null;

  const avg = (a: number | null, b: number | null): number | null => {
    if (a !== null && b !== null) return Math.round(((a + b) / 2) * 10) / 10;
    return a ?? b;
  };

  return {
    bands: {
      sub,
      low: avg(sub, mud),
      low_mid: mud,
      high_mid: pres,
      presence: avg(pres, air),
      air,
    },
    source: 'derived_from_canonical_4_band_psd',
  };
}

function classifyPriorIssuePure(
  issue: AnalysisIssue,
  v1Report: AnalysisReport,
  v2Report: AnalysisReport
): RevisionFindingVerification {
  const primaryEv = issue.evidence?.[0];
  const metricKey = primaryEv?.metric_key ?? null;
  const m1 = metricKey ? (v1Report.measurements as Record<string, any>)[metricKey] : undefined;
  const m2 = metricKey ? (v2Report.measurements as Record<string, any>)[metricKey] : undefined;

  const v1Val: number | null =
    m1?.value !== undefined && m1?.value !== null
      ? m1.value
      : primaryEv?.measured_value ?? null;
  const v2Val: number | null = m2?.value ?? null;
  const unit = m1?.unit ?? primaryEv?.unit ?? '';
  const targetMin: number | null = m1?.target_min ?? null;
  const targetMax: number | null = m1?.target_max ?? null;
  const targetRange =
    primaryEv?.target_range ||
    (targetMin !== null || targetMax !== null
      ? `${targetMin ?? '—'} to ${targetMax ?? '—'} ${unit}`.trim()
      : 'target range');

  const eps = (metricKey && METRIC_EPSILONS[metricKey]) ?? 0.2;
  const deltaVal = safeDelta(v1Val, v2Val, 2);

  let status: RevisionFindingStatus = 'unchanged';
  let summary = 'Measured value remained effectively unchanged between v1 and v2.';

  if (v1Val === null || v2Val === null) {
    status = 'unchanged';
    summary = 'Could not compare metric because one revision lacked a valid DSP measurement.';
  } else if (metricKey === 'sample_clipping_events') {
    if (v2Val < v1Val) {
      status = 'improved';
      summary =
        v2Val === 0
          ? `Sample clipping completely resolved (${Math.round(v1Val)} → 0 events).`
          : `Sample clipping events reduced from ${Math.round(v1Val)} to ${Math.round(v2Val)}.`;
    } else if (v2Val > v1Val) {
      status = 'regressed';
      summary = `Sample clipping events increased from ${Math.round(v1Val)} to ${Math.round(v2Val)}.`;
    } else {
      summary = `Sample clipping count remained at ${Math.round(v2Val)}.`;
    }
  } else {
    const d1 = distanceToTarget(v1Val, targetMin, targetMax);
    const d2 = distanceToTarget(v2Val, targetMin, targetMax);
    if (d1 !== null && d2 !== null) {
      if (d2 < d1 - eps) {
        status = 'improved';
        summary =
          d2 === 0
            ? `Resolved into target range (${targetRange}): ${v1Val} → ${v2Val} ${unit}.`
            : `Moved closer to target range (${targetRange}): ${v1Val} → ${v2Val} ${unit}.`;
      } else if (d2 > d1 + eps) {
        status = 'regressed';
        summary = `Moved further from target range (${targetRange}): ${v1Val} → ${v2Val} ${unit}.`;
      } else if (d1 === 0 && d2 === 0 && deltaVal !== null) {
        if (metricKey === 'phase_correlation_min' || metricKey === 'phase_correlation_mean') {
          if (deltaVal > eps) {
            status = 'improved';
            summary = `Phase correlation improved from ${v1Val} to ${v2Val}.`;
          } else if (deltaVal < -eps) {
            status = 'regressed';
            summary = `Phase correlation declined from ${v1Val} to ${v2Val}.`;
          }
        } else if (metricKey === 'true_peak_max' || metricKey === 'sample_peak_max') {
          if (deltaVal < -eps) {
            status = 'improved';
            summary = `Peak headroom improved from ${v1Val} to ${v2Val} ${unit}.`;
          } else if (deltaVal > eps) {
            status = 'regressed';
            summary = `Peak level rose from ${v1Val} to ${v2Val} ${unit}.`;
          }
        }
      }
    }
  }

  return {
    issue_id: issue.issue_id,
    title: issue.title,
    domain: issue.domain,
    classification: issue.classification,
    original_severity: issue.severity,
    metric_key: metricKey,
    unit,
    target_range: targetRange,
    before_value: v1Val,
    after_value: v2Val,
    delta_value: deltaVal,
    status,
    summary,
  };
}

export function compareRevisionReportsPure(
  v1Report: AnalysisReport,
  v2Report: AnalysisReport,
  v1SixBands?: Record<StemBandKey, number | null> | null,
  v2SixBands?: Record<StemBandKey, number | null> | null
): RevisionDeltaReport {
  const m1 = v1Report.measurements;
  const m2 = v2Report.measurements;

  const v1BandsExtracted = v1SixBands
    ? { bands: v1SixBands, source: 'direct_six_band_welch_psd' }
    : extractSixBandsFromReportPure(v1Report);
  const v2BandsExtracted = v2SixBands
    ? { bands: v2SixBands, source: 'direct_six_band_welch_psd' }
    : extractSixBandsFromReportPure(v2Report);

  const deltaSpectral = {} as Record<StemBandKey, RevisionSpectralBandDelta>;
  for (const band of SIX_OCTAVE_BAND_DEFS) {
    const b1 = v1BandsExtracted.bands[band.key] ?? null;
    const b2 = v2BandsExtracted.bands[band.key] ?? null;
    deltaSpectral[band.key] = {
      label: band.label,
      low_hz: band.low_hz,
      high_hz: band.high_hz,
      v1_db: b1,
      v2_db: b2,
      delta_db: safeDelta(b1, b2, 1),
    };
  }

  const findingVerifications = (v1Report.issues || []).map((issue) =>
    classifyPriorIssuePure(issue, v1Report, v2Report)
  );

  const v1Domains = new Set((v1Report.issues || []).map((i) => i.domain));
  const newV2Issues = (v2Report.issues || [])
    .filter((i) => !v1Domains.has(i.domain))
    .map((i) => ({
      issue_id: i.issue_id,
      title: i.title,
      domain: i.domain,
      classification: i.classification,
      severity: i.severity,
    }));

  const improved = findingVerifications.filter((f) => f.status === 'improved').length;
  const unchanged = findingVerifications.filter((f) => f.status === 'unchanged').length;
  const regressed = findingVerifications.filter((f) => f.status === 'regressed').length;

  return {
    schema_version: '2.0.0',
    comparison_id: `rev-${Date.now()}`,
    created_at: new Date().toISOString(),
    v1_metadata: {
      report_id: v1Report.report_id,
      filename: v1Report.file_metadata.filename,
      duration_seconds: v1Report.file_metadata.duration_seconds,
      sample_rate_hz: v1Report.file_metadata.sample_rate_hz,
    },
    v2_metadata: {
      report_id: v2Report.report_id,
      filename: v2Report.file_metadata.filename,
      duration_seconds: v2Report.file_metadata.duration_seconds,
      sample_rate_hz: v2Report.file_metadata.sample_rate_hz,
    },
    metric_deltas: {
      delta_integrated_lufs: safeDelta(m1.integrated_loudness.value, m2.integrated_loudness.value, 2),
      delta_true_peak_dbtp: safeDelta(m1.true_peak_max.value, m2.true_peak_max.value, 2),
      delta_lra_lu: safeDelta(m1.loudness_range_lra.value, m2.loudness_range_lra.value, 2),
      delta_phase_correlation: safeDelta(
        m1.phase_correlation_mean.value,
        m2.phase_correlation_mean.value,
        2
      ),
      delta_phase_correlation_min: safeDelta(
        m1.phase_correlation_min.value,
        m2.phase_correlation_min.value,
        2
      ),
      delta_crest_factor_db: safeDelta(m1.crest_factor.value, m2.crest_factor.value, 2),
      delta_sample_clipping_events: safeDelta(
        m1.sample_clipping_events.value,
        m2.sample_clipping_events.value,
        0
      ),
      before_after: {
        integrated_lufs: {
          v1: m1.integrated_loudness.value,
          v2: m2.integrated_loudness.value,
          unit: 'LUFS',
        },
        true_peak_dbtp: {
          v1: m1.true_peak_max.value,
          v2: m2.true_peak_max.value,
          unit: 'dBTP',
        },
        lra_lu: {
          v1: m1.loudness_range_lra.value,
          v2: m2.loudness_range_lra.value,
          unit: 'LU',
        },
        phase_correlation_mean: {
          v1: m1.phase_correlation_mean.value,
          v2: m2.phase_correlation_mean.value,
          unit: 'correlation',
        },
        phase_correlation_min: {
          v1: m1.phase_correlation_min.value,
          v2: m2.phase_correlation_min.value,
          unit: 'correlation',
        },
        crest_factor_db: {
          v1: m1.crest_factor.value,
          v2: m2.crest_factor.value,
          unit: 'dB',
        },
        sample_clipping_events: {
          v1: m1.sample_clipping_events.value,
          v2: m2.sample_clipping_events.value,
          unit: 'count',
        },
      },
    },
    delta_spectral_db: deltaSpectral,
    spectral_band_sources: {
      v1: v1BandsExtracted.source,
      v2: v2BandsExtracted.source,
    },
    finding_verifications: findingVerifications,
    new_v2_issues: newV2Issues,
    summary_counts: {
      total_prior_findings: findingVerifications.length,
      improved,
      unchanged,
      regressed,
      new_issues_in_v2: newV2Issues.length,
    },
    v2_report: v2Report,
  };
}

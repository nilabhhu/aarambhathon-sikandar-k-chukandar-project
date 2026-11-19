import React, { useState } from 'react';
import {
  AnalysisReport,
  ConsentState,
  GenreId,
  MixStage,
  RevisionDeltaReport,
  RevisionFindingStatus,
  StemBandKey,
} from '../contracts/analysisContract';
import { SIX_OCTAVE_BAND_DEFS } from '../audio/phase4Logic';
import { compareRevisionsWithDsp } from '../services/apiService';
import { useStudioAudioEngine, useStudioAudioState } from '../audio/StudioAudioContext';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  GitCompare,
  Minus,
  Pause,
  Play,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';

interface RevisionDeltaPanelProps {
  v1Report: AnalysisReport;
  v1File?: File | null;
  genre: GenreId;
  mixStage: MixStage;
  consent: ConsentState;
  comparison: RevisionDeltaReport | null;
  onComparisonChange: (comparison: RevisionDeltaReport | null) => void;
}

function fmtSigned(val: number | null | undefined, unit: string, decimals = 2): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return 'N/A';
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(decimals)}${unit ? ` ${unit}` : ''}`;
}

function fmtVal(val: number | null | undefined, unit: string, decimals = 1): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return 'N/A';
  return `${val.toFixed(decimals)}${unit ? ` ${unit}` : ''}`;
}

function statusStyle(status: RevisionFindingStatus): {
  badge: string;
  label: string;
  icon: React.ReactNode;
} {
  if (status === 'improved') {
    return {
      badge:
        'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70',
      label: 'Improved',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />,
    };
  }
  if (status === 'regressed') {
    return {
      badge:
        'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800/70',
      label: 'Regressed',
      icon: <ArrowUpRight className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />,
    };
  }
  return {
    badge:
      'bg-amber-50 dark:bg-amber-950/35 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/70',
    label: 'Unchanged',
    icon: <Minus className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />,
  };
}

export const RevisionDeltaPanel: React.FC<RevisionDeltaPanelProps> = ({
  v1Report,
  v1File = null,
  genre,
  mixStage,
  consent,
  comparison,
  onComparisonChange,
}) => {
  const engine = useStudioAudioEngine();
  const audioState = useStudioAudioState();

  const [isComparing, setIsComparing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleUploadV2 = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setIsComparing(true);
    setErrorMsg(null);

    try {
      // Decode v2 into StudioAudioEngine in parallel for loudness-matched v1/v2 A/B auditioning
      const decodePromise = engine.loadRevisionV2File(file);
      const comparePromise = compareRevisionsWithDsp({
        v1Report,
        v2File: file,
        v1File,
        v1SixBands: audioState.primarySixBands,
        genre,
        mixStage,
        consent,
        interfaceMode: 'advanced',
      });

      const [result] = await Promise.all([comparePromise, decodePromise]);

      if (result.success && result.comparison) {
        onComparisonChange(result.comparison);
        const v2Lufs = result.comparison.v2_report?.measurements?.integrated_loudness?.value;
        if (v2Lufs !== null && v2Lufs !== undefined) {
          engine.syncRevisionV2LufsFromReport(v2Lufs);
        }
      } else {
        setErrorMsg(result.errorMessage || 'Failed to compare Revision v2 against Mix v1.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unexpected error during revision comparison.');
    } finally {
      setIsComparing(false);
    }
  };

  const handleClearV2 = () => {
    engine.clearRevisionV2();
    onComparisonChange(null);
    setErrorMsg(null);
  };

  return (
    <section
      aria-label="Mix Revision Delta Verification"
      data-testid="revision-delta-panel"
      className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-6 space-y-5"
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-[#3A7269] dark:text-teal-400">
            <GitCompare className="w-3.5 h-3.5" />
            <span>MIX REVISION DELTA TRACKING (v1 → v2)</span>
          </div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
            Before / After Mix Revision Verification
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Upload your revised bounce (v2) to verify exact LUFS, True Peak, LRA, phase, and 6-band shifts—and audition v1 vs. v2 loudness-matched.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor="adv-revision-v2-upload"
            data-testid="upload-v2-label"
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              isComparing
                ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500 cursor-wait'
                : 'bg-[#3A7269] hover:bg-[#2F5E56] text-white'
            }`}
          >
            {isComparing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            <span>
              {isComparing
                ? 'Computing v1 → v2 Deltas...'
                : comparison
                ? 'Replace Revised Mix (v2)'
                : 'Upload Revised Mix (v2) to Verify Fixes'}
            </span>
          </label>
          <input
            id="adv-revision-v2-upload"
            data-testid="upload-v2-input"
            type="file"
            accept=".wav,.flac,.aiff,.mp3,.ogg,audio/*"
            onChange={handleUploadV2}
            disabled={isComparing}
            className="sr-only"
          />

          {comparison && (
            <button
              type="button"
              onClick={handleClearV2}
              disabled={isComparing}
              className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear v2</span>
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 dark:border-rose-800/80 bg-rose-50 dark:bg-rose-950/35 p-3.5 flex items-center justify-between gap-3 text-xs text-rose-900 dark:text-rose-200"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="font-mono text-[11px] hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {!comparison ? (
        <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 bg-[#FAFAFA] dark:bg-zinc-950/60 p-5 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="space-y-1">
            <div className="font-medium text-zinc-800 dark:text-zinc-200">
              Baseline Mix (v1):{' '}
              <span className="font-mono text-[#3A7269] dark:text-teal-400">
                {v1Report.file_metadata.filename}
              </span>
            </div>
            <p className="text-zinc-500 dark:text-zinc-400">
              Apply your DAW fixes, bounce Revised Mix (v2), and upload it above to verify every prior finding as Improved, Unchanged, or Regressed.
            </p>
          </div>
          <span className="font-mono tabular-nums text-[11px] text-zinc-500 dark:text-zinc-400">
            {v1Report.issues.length} baseline findings tracked
          </span>
        </div>
      ) : (
        <div className="space-y-6" data-testid="revision-delta-results">
          {/* 1. Loudness-Matched v1 / v2 Audition Switcher */}
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[#F5F5F7] dark:bg-zinc-950 p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => engine.togglePlay()}
                disabled={!audioState.hasPrimaryMix}
                aria-label={audioState.isPlaying ? 'Pause revision A/B playback' : 'Play revision A/B comparison'}
                className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-[#3A7269] hover:bg-[#2F5E56] text-white transition-colors disabled:opacity-45 shrink-0"
              >
                {audioState.isPlaying ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4 ml-0.5" />
                )}
              </button>

              <div
                role="group"
                aria-label="Loudness-Matched v1 vs v2 Audition Switcher"
                className="inline-flex items-center p-1 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700"
              >
                <button
                  type="button"
                  data-testid="audition-v1-btn"
                  aria-pressed={audioState.activeDeck === 'A'}
                  onClick={() => engine.setActiveDeck('A')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                    audioState.activeDeck === 'A'
                      ? 'bg-[#3A7269] text-white'
                      : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  Mix v1 (Baseline)
                </button>
                <button
                  type="button"
                  data-testid="audition-v2-btn"
                  disabled={!audioState.hasRevisionV2}
                  aria-pressed={audioState.activeDeck === 'V2'}
                  onClick={() => engine.setActiveDeck('V2')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-40 ${
                    audioState.activeDeck === 'V2'
                      ? 'bg-[#3A7269] text-white'
                      : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  Revision v2
                </button>
              </div>

              <div className="text-xs font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                <span className="font-semibold text-[#3A7269] dark:text-teal-400" data-testid="v2-loudness-match-offset">
                  Loudness Match:{' '}
                  {audioState.revisionV2MatchOffsetDb !== null
                    ? `${audioState.revisionV2MatchOffsetDb >= 0 ? '+' : ''}${audioState.revisionV2MatchOffsetDb.toFixed(1)} dB`
                    : '0.0 dB'}
                </span>
                <span className="mx-1.5">·</span>
                <button
                  type="button"
                  onClick={() => engine.setLoudnessMatchEnabled(!audioState.loudnessMatchEnabled)}
                  className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  {audioState.loudnessMatchEnabled ? 'Matched (15ms click-free)' : 'Match Bypassed'}
                </button>
              </div>
            </div>

            <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
              <span className="truncate max-w-[140px]">{comparison.v1_metadata.filename}</span>
              <ArrowRight className="w-3 h-3 shrink-0" />
              <span className="truncate max-w-[140px] font-semibold text-zinc-800 dark:text-zinc-200">
                {comparison.v2_metadata.filename}
              </span>
            </div>
          </div>

          {/* 2. Core Metric Delta Cards (v1 -> v2, tabular-nums) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                label: 'Integrated Loudness',
                v1: fmtVal(comparison.metric_deltas.before_after.integrated_lufs?.v1, 'LUFS', 1),
                v2: fmtVal(comparison.metric_deltas.before_after.integrated_lufs?.v2, 'LUFS', 1),
                delta: fmtSigned(comparison.metric_deltas.delta_integrated_lufs, 'LUFS', 2),
                rawDelta: comparison.metric_deltas.delta_integrated_lufs,
              },
              {
                label: 'True Peak (4x ISP)',
                v1: fmtVal(comparison.metric_deltas.before_after.true_peak_dbtp?.v1, 'dBTP', 2),
                v2: fmtVal(comparison.metric_deltas.before_after.true_peak_dbtp?.v2, 'dBTP', 2),
                delta: fmtSigned(comparison.metric_deltas.delta_true_peak_dbtp, 'dB', 2),
                rawDelta: comparison.metric_deltas.delta_true_peak_dbtp,
              },
              {
                label: 'Loudness Range (LRA)',
                v1: fmtVal(comparison.metric_deltas.before_after.lra_lu?.v1, 'LU', 1),
                v2: fmtVal(comparison.metric_deltas.before_after.lra_lu?.v2, 'LU', 1),
                delta: fmtSigned(comparison.metric_deltas.delta_lra_lu, 'LU', 2),
                rawDelta: comparison.metric_deltas.delta_lra_lu,
              },
              {
                label: 'Phase Correlation (Mean)',
                v1: fmtVal(comparison.metric_deltas.before_after.phase_correlation_mean?.v1, '', 2),
                v2: fmtVal(comparison.metric_deltas.before_after.phase_correlation_mean?.v2, '', 2),
                delta: fmtSigned(comparison.metric_deltas.delta_phase_correlation, '', 2),
                rawDelta: comparison.metric_deltas.delta_phase_correlation,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-[#FAFAFA] dark:bg-zinc-950/60 p-3.5 space-y-1"
              >
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{item.label}</div>
                <div className="text-base font-bold font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                  {item.delta}
                </div>
                <div className="text-[11px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                  {item.v1} → {item.v2}
                </div>
              </div>
            ))}
          </div>

          {/* 3. 6-Band Spectral Shift Readout */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              6-Band Spectral Energy Shift (v1 → v2)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {SIX_OCTAVE_BAND_DEFS.map((band) => {
                const entry = comparison.delta_spectral_db[band.key as StemBandKey];
                const d = entry?.delta_db ?? null;
                const clampedPct = d !== null ? Math.min(100, Math.abs(d) * 10) : 0;
                const toneClass =
                  d === null || Math.abs(d) < 0.4
                    ? 'text-zinc-600 dark:text-zinc-400'
                    : d > 0
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-[#3A7269] dark:text-teal-400';

                return (
                  <div
                    key={band.key}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[#FAFAFA] dark:bg-zinc-950/60 p-3 font-mono tabular-nums"
                  >
                    <div className="font-sans text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                      {band.shortLabel}
                    </div>
                    <div className="text-[10px] text-zinc-400">
                      {band.low_hz >= 1000 ? `${band.low_hz / 1000}k` : band.low_hz}–
                      {band.high_hz >= 1000 ? `${band.high_hz / 1000}k` : band.high_hz} Hz
                    </div>
                    <div className={`text-sm font-bold mt-1.5 flex items-center gap-0.5 ${toneClass}`}>
                      {d !== null && d > 0.3 && <ArrowUpRight className="w-3.5 h-3.5" />}
                      {d !== null && d < -0.3 && <ArrowDownRight className="w-3.5 h-3.5" />}
                      <span>{fmtSigned(d, 'dB', 1)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          d !== null && d > 0 ? 'bg-amber-500' : 'bg-[#3A7269] dark:bg-teal-400'
                        }`}
                        style={{ width: `${clampedPct}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1.5">
                      {entry?.v1_db ?? '—'} → {entry?.v2_db ?? '—'} dBFS
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. Prior v1 Finding Verification List */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Prior v1 Finding Verification
              </h3>
              <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
                <span className="px-2 py-0.5 rounded border bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
                  {comparison.summary_counts.improved} Improved
                </span>
                <span className="px-2 py-0.5 rounded border bg-amber-50 dark:bg-amber-950/35 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800">
                  {comparison.summary_counts.unchanged} Unchanged
                </span>
                <span className="px-2 py-0.5 rounded border bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800">
                  {comparison.summary_counts.regressed} Regressed
                </span>
              </div>
            </div>

            {comparison.finding_verifications.length === 0 ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 py-2">
                No prior v1 issues were flagged for comparison.
              </p>
            ) : (
              <div className="divide-y divide-zinc-200/80 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                {comparison.finding_verifications.map((finding) => {
                  const st = statusStyle(finding.status);
                  return (
                    <div
                      key={finding.issue_id}
                      data-testid={`finding-status-${finding.status}`}
                      className="p-3.5 bg-white dark:bg-zinc-900 flex flex-wrap items-start justify-between gap-3"
                    >
                      <div className="space-y-1 max-w-2xl">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-semibold ${st.badge}`}
                          >
                            {st.icon}
                            <span>{st.label}</span>
                          </span>
                          <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                            {finding.title}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400">{finding.summary}</p>
                      </div>

                      <div className="text-right font-mono tabular-nums text-xs shrink-0">
                        <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                          {finding.before_value ?? 'N/A'} → {finding.after_value ?? 'N/A'}{' '}
                          {finding.unit}
                        </div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          Target: {finding.target_range}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {comparison.new_v2_issues.length > 0 && (
              <div className="rounded-lg border border-rose-200 dark:border-rose-800/70 bg-rose-50/70 dark:bg-rose-950/30 p-3.5 space-y-1.5 text-xs">
                <div className="font-semibold text-rose-800 dark:text-rose-300">
                  Newly Flagged in Revision v2 ({comparison.new_v2_issues.length})
                </div>
                <ul className="space-y-1 text-rose-900/90 dark:text-rose-200">
                  {comparison.new_v2_issues.map((ni) => (
                    <li key={ni.issue_id} className="font-mono text-[11px]">
                      [{ni.severity.toUpperCase()}] {ni.title} ({ni.domain})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

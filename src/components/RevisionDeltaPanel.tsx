import React, { useState } from 'react';
import { motion } from 'motion/react';
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
import { STUDIO_SPRING, TACTILE_TAP } from '../lib/motion';
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
        'bg-[var(--accent-soft)] text-[var(--status-safe)] border-[var(--status-safe)]/30',
      label: 'Improved',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-[var(--status-safe)]" />,
    };
  }
  if (status === 'regressed') {
    return {
      badge:
        'bg-rose-50/80 dark:bg-rose-950/40 text-[var(--status-alert)] border-[var(--status-alert)]/35',
      label: 'Regressed',
      icon: <ArrowUpRight className="w-3.5 h-3.5 text-[var(--status-alert)]" />,
    };
  }
  return {
    badge:
      'bg-amber-50/80 dark:bg-amber-950/35 text-[var(--status-caution)] border-[var(--status-caution)]/35',
    label: 'Unchanged',
    icon: <Minus className="w-3.5 h-3.5 text-[var(--status-caution)]" />,
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
      className="studio-elevated squircle-outer p-6 space-y-5"
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 studio-hairline-b">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-[var(--accent-primary)] font-medium">
            <GitCompare className="w-3.5 h-3.5" />
            <span>Mix Revision Delta Tracking (v1 → v2)</span>
          </div>
          <h2 className="text-base font-bold text-[var(--text-primary)] mt-1">
            Before / After Mix Revision Verification
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Upload your revised bounce (v2) to verify exact LUFS, True Peak, LRA, phase, and 6-band shifts—and audition v1 vs. v2 loudness-matched.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor="adv-revision-v2-upload"
            data-testid="upload-v2-label"
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 squircle-inner text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              isComparing
                ? 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline-color)] cursor-wait'
                : 'bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white'
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
            <motion.button
              type="button"
              whileTap={TACTILE_TAP}
              onClick={handleClearV2}
              disabled={isComparing}
              className="inline-flex items-center gap-1 px-2.5 py-2 squircle-inner border border-[var(--border-hairline-color)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-primary)] hover:border-[var(--border-active-color)] transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear v2</span>
            </motion.button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="squircle-inner border border-[var(--status-alert)]/35 bg-rose-50/80 dark:bg-rose-950/35 p-3.5 flex items-center justify-between gap-3 text-xs text-rose-900 dark:text-rose-200"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-[var(--status-alert)]" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="font-mono text-[11px] hover:underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {!comparison ? (
        <div className="squircle-inner border border-dashed border-[var(--border-hairline-color)] bg-[var(--bg-surface)] p-5 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="space-y-1">
            <div className="font-medium text-[var(--text-primary)]">
              Baseline Mix (v1):{' '}
              <span className="font-mono text-[var(--accent-primary)]">
                {v1Report.file_metadata.filename}
              </span>
            </div>
            <p className="text-[var(--text-secondary)]">
              Apply your DAW fixes, bounce Revised Mix (v2), and upload it above to verify every prior finding as Improved, Unchanged, or Regressed.
            </p>
          </div>
          <span className="font-mono tabular-nums text-[11px] text-[var(--text-secondary)]">
            {v1Report.issues.length} baseline findings tracked
          </span>
        </div>
      ) : (
        <div className="space-y-6" data-testid="revision-delta-results">
          {/* 1. Loudness-Matched v1 / v2 Audition Switcher */}
          <div className="squircle-inner studio-surface p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <motion.button
                type="button"
                whileTap={TACTILE_TAP}
                onClick={() => engine.togglePlay()}
                disabled={!audioState.hasPrimaryMix}
                aria-label={audioState.isPlaying ? 'Pause revision A/B playback' : 'Play revision A/B comparison'}
                className="inline-flex items-center justify-center w-9 h-9 squircle-inner bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white transition-colors disabled:opacity-45 shrink-0 cursor-pointer"
              >
                {audioState.isPlaying ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4 ml-0.5" />
                )}
              </motion.button>

              <div
                role="group"
                aria-label="Loudness-Matched v1 vs v2 Audition Switcher"
                className="inline-flex items-center p-1 squircle-inner bg-[var(--bg-elevated)] border border-[var(--border-hairline-color)]"
              >
                {[
                  { deck: 'A' as const, label: 'Mix v1 (Baseline)', testId: 'audition-v1-btn', disabled: false },
                  { deck: 'V2' as const, label: 'Revision v2', testId: 'audition-v2-btn', disabled: !audioState.hasRevisionV2 },
                ].map((opt) => {
                  const active = audioState.activeDeck === opt.deck;
                  return (
                    <motion.button
                      key={opt.deck}
                      type="button"
                      whileTap={opt.disabled ? undefined : TACTILE_TAP}
                      data-testid={opt.testId}
                      disabled={opt.disabled}
                      aria-pressed={active}
                      onClick={() => engine.setActiveDeck(opt.deck)}
                      className={`relative px-3 py-1.5 squircle-inner text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-40 cursor-pointer ${
                        active
                          ? 'text-white'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="revision-v1v2-pill"
                          transition={STUDIO_SPRING}
                          className="absolute inset-0 squircle-inner bg-[var(--accent-primary)]"
                        />
                      )}
                      <span className="relative z-10">{opt.label}</span>
                    </motion.button>
                  );
                })}
              </div>

              <div className="text-xs font-mono tabular-nums text-[var(--text-secondary)]">
                <span className="font-semibold text-[var(--accent-primary)]" data-testid="v2-loudness-match-offset">
                  Loudness Match:{' '}
                  {audioState.revisionV2MatchOffsetDb !== null
                    ? `${audioState.revisionV2MatchOffsetDb >= 0 ? '+' : ''}${audioState.revisionV2MatchOffsetDb.toFixed(1)} dB`
                    : '0.0 dB'}
                </span>
                <span className="mx-1.5 opacity-40">·</span>
                <button
                  type="button"
                  onClick={() => engine.setLoudnessMatchEnabled(!audioState.loudnessMatchEnabled)}
                  className="underline underline-offset-2 hover:text-[var(--text-primary)] cursor-pointer"
                >
                  {audioState.loudnessMatchEnabled ? 'Matched (15ms click-free)' : 'Match Bypassed'}
                </button>
              </div>
            </div>

            <div className="text-[11px] font-mono text-[var(--text-secondary)] flex items-center gap-1.5">
              <span className="truncate max-w-[140px]">{comparison.v1_metadata.filename}</span>
              <ArrowRight className="w-3 h-3 shrink-0" />
              <span className="truncate max-w-[140px] font-semibold text-[var(--text-primary)]">
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
              },
              {
                label: 'True Peak (4x ISP)',
                v1: fmtVal(comparison.metric_deltas.before_after.true_peak_dbtp?.v1, 'dBTP', 2),
                v2: fmtVal(comparison.metric_deltas.before_after.true_peak_dbtp?.v2, 'dBTP', 2),
                delta: fmtSigned(comparison.metric_deltas.delta_true_peak_dbtp, 'dB', 2),
              },
              {
                label: 'Loudness Range (LRA)',
                v1: fmtVal(comparison.metric_deltas.before_after.lra_lu?.v1, 'LU', 1),
                v2: fmtVal(comparison.metric_deltas.before_after.lra_lu?.v2, 'LU', 1),
                delta: fmtSigned(comparison.metric_deltas.delta_lra_lu, 'LU', 2),
              },
              {
                label: 'Phase Correlation (Mean)',
                v1: fmtVal(comparison.metric_deltas.before_after.phase_correlation_mean?.v1, '', 2),
                v2: fmtVal(comparison.metric_deltas.before_after.phase_correlation_mean?.v2, '', 2),
                delta: fmtSigned(comparison.metric_deltas.delta_phase_correlation, '', 2),
              },
            ].map((item) => (
              <div
                key={item.label}
                className="squircle-inner studio-surface p-3.5 space-y-1"
              >
                <div className="text-[11px] text-[var(--text-secondary)]">{item.label}</div>
                <div className="text-base font-bold font-mono tabular-nums text-[var(--text-primary)]">
                  {item.delta}
                </div>
                <div className="text-[11px] font-mono tabular-nums text-[var(--text-secondary)]">
                  {item.v1} → {item.v2}
                </div>
              </div>
            ))}
          </div>

          {/* 3. 6-Band Spectral Shift Readout */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
              6-Band Spectral Energy Shift (v1 → v2)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {SIX_OCTAVE_BAND_DEFS.map((band) => {
                const entry = comparison.delta_spectral_db[band.key as StemBandKey];
                const d = entry?.delta_db ?? null;
                const clampedPct = d !== null ? Math.min(100, Math.abs(d) * 10) : 0;
                const toneClass =
                  d === null || Math.abs(d) < 0.4
                    ? 'text-[var(--text-secondary)]'
                    : d > 0
                    ? 'text-[var(--status-caution)]'
                    : 'text-[var(--accent-primary)]';

                return (
                  <div
                    key={band.key}
                    className="squircle-inner studio-surface p-3 font-mono tabular-nums"
                  >
                    <div className="font-sans text-xs font-semibold text-[var(--text-primary)]">
                      {band.shortLabel}
                    </div>
                    <div className="text-[10px] text-[var(--text-secondary)]">
                      {band.low_hz >= 1000 ? `${band.low_hz / 1000}k` : band.low_hz}–
                      {band.high_hz >= 1000 ? `${band.high_hz / 1000}k` : band.high_hz} Hz
                    </div>
                    <div className={`text-sm font-bold mt-1.5 flex items-center gap-0.5 ${toneClass}`}>
                      {d !== null && d > 0.3 && <ArrowUpRight className="w-3.5 h-3.5" />}
                      {d !== null && d < -0.3 && <ArrowDownRight className="w-3.5 h-3.5" />}
                      <span>{fmtSigned(d, 'dB', 1)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-hairline-color)] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          d !== null && d > 0 ? 'bg-[var(--status-caution)]' : 'bg-[var(--accent-primary)]'
                        }`}
                        style={{ width: `${clampedPct}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-[var(--text-secondary)] mt-1.5">
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
              <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
                Prior v1 Finding Verification
              </h3>
              <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
                <span className="px-2 py-0.5 squircle-inner border bg-[var(--accent-soft)] text-[var(--status-safe)] border-[var(--status-safe)]/30">
                  {comparison.summary_counts.improved} Improved
                </span>
                <span className="px-2 py-0.5 squircle-inner border bg-amber-50/80 dark:bg-amber-950/35 text-[var(--status-caution)] border-[var(--status-caution)]/35">
                  {comparison.summary_counts.unchanged} Unchanged
                </span>
                <span className="px-2 py-0.5 squircle-inner border bg-rose-50/80 dark:bg-rose-950/40 text-[var(--status-alert)] border-[var(--status-alert)]/35">
                  {comparison.summary_counts.regressed} Regressed
                </span>
              </div>
            </div>

            {comparison.finding_verifications.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)] py-2">
                No prior v1 issues were flagged for comparison.
              </p>
            ) : (
              <div className="divide-y divide-[var(--border-hairline-color)] border border-[var(--border-hairline-color)] squircle-inner overflow-hidden">
                {comparison.finding_verifications.map((finding) => {
                  const st = statusStyle(finding.status);
                  return (
                    <div
                      key={finding.issue_id}
                      data-testid={`finding-status-${finding.status}`}
                      className="p-3.5 bg-[var(--bg-elevated)] flex flex-wrap items-start justify-between gap-3"
                    >
                      <div className="space-y-1 max-w-2xl">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 squircle-inner border text-[11px] font-semibold ${st.badge}`}
                          >
                            {st.icon}
                            <span>{st.label}</span>
                          </span>
                          <span className="text-xs font-semibold text-[var(--text-primary)]">
                            {finding.title}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--text-secondary)]">{finding.summary}</p>
                      </div>

                      <div className="text-right font-mono tabular-nums text-xs shrink-0">
                        <div className="font-semibold text-[var(--text-primary)]">
                          {finding.before_value ?? 'N/A'} → {finding.after_value ?? 'N/A'}{' '}
                          {finding.unit}
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)]">
                          Target: {finding.target_range}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {comparison.new_v2_issues.length > 0 && (
              <div className="squircle-inner border border-[var(--status-alert)]/35 bg-rose-50/75 dark:bg-rose-950/30 p-3.5 space-y-1.5 text-xs">
                <div className="font-semibold text-[var(--status-alert)]">
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

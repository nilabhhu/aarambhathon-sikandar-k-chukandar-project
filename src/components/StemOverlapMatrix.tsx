import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  ConsentState,
  OverlapSeverity,
  StemBandKey,
  StemMultitrackReport,
} from '../contracts/analysisContract';
import { SIX_OCTAVE_BAND_DEFS } from '../audio/phase4Logic';
import { analyzeStemsWithDsp } from '../services/apiService';
import { TACTILE_TAP } from '../lib/motion';
import {
  AlertCircle,
  CheckCircle2,
  Info,
  Layers,
  Lock,
  RefreshCw,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';

interface StemOverlapMatrixProps {
  consent: ConsentState;
  primaryMixFile?: File | null;
  stemReport: StemMultitrackReport | null;
  onStemReportChange: (report: StemMultitrackReport | null) => void;
}

function fmtNum(val: number | null | undefined, unit: string, decimals = 1, showPlus = false): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return 'N/A';
  const prefix = showPlus && val > 0 ? '+' : '';
  return `${prefix}${val.toFixed(decimals)}${unit ? ` ${unit}` : ''}`;
}

function severityCellClasses(severity: OverlapSeverity): string {
  if (severity === 'high') {
    return 'bg-rose-50/85 dark:bg-rose-950/35 border-[var(--status-alert)]/35 text-[var(--status-alert)]';
  }
  if (severity === 'moderate') {
    return 'bg-amber-50/85 dark:bg-amber-950/35 border-[var(--status-caution)]/35 text-[var(--status-caution)]';
  }
  return 'bg-[var(--bg-surface)] border-[var(--border-hairline-color)] text-[var(--text-secondary)]';
}

export const StemOverlapMatrix: React.FC<StemOverlapMatrixProps> = ({
  consent,
  primaryMixFile = null,
  stemReport,
  onStemReportChange,
}) => {
  const [isAnalyzingStems, setIsAnalyzingStems] = useState(false);
  const [stemError, setStemError] = useState<string | null>(null);
  const [stemErrorCode, setStemErrorCode] = useState<string | null>(null);
  const [engineSource, setEngineSource] = useState<'backend' | 'client_webaudio' | null>(null);

  const hasUserStems = Boolean(stemReport && stemReport.has_user_stems);

  const handleStemsSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    e.target.value = '';

    setStemError(null);
    setStemErrorCode(null);
    setIsAnalyzingStems(true);

    try {
      const result = await analyzeStemsWithDsp({
        stemFiles: files,
        primaryMixFile,
        consent,
      });

      if (result.success && result.report) {
        onStemReportChange(result.report);
        setEngineSource(result.source);
        setStemError(null);
        setStemErrorCode(null);
      } else {
        setStemError(result.errorMessage || 'Failed to analyze uploaded stems.');
        setStemErrorCode(result.errorCode || null);
      }
    } catch (err: any) {
      setStemError(err?.message || 'Unexpected error while analyzing stems.');
      setStemErrorCode(null);
    } finally {
      setIsAnalyzingStems(false);
    }
  };

  const handleClearStems = () => {
    onStemReportChange(null);
    setStemError(null);
    setStemErrorCode(null);
    setEngineSource(null);
  };

  return (
    <section
      aria-label="Original Stem Multitrack Diagnostics"
      data-testid="stem-diagnostics-section"
      className="studio-elevated squircle-outer p-6 space-y-5"
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 studio-hairline-b">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-[var(--accent-primary)] font-medium">
            <Layers className="w-3.5 h-3.5" />
            <span>Original Multitrack Stem Diagnostics · Rule 1 Compliant</span>
          </div>
          <h2 className="text-base font-bold text-[var(--text-primary)] mt-1">
            Pairwise 6-Band Frequency Overlap Matrix
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Inspect per-stem loudness, headroom, spectral centroid, and potential spectral masking across 2–8 genuine DAW stems.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor="adv-stems-upload"
            data-testid="upload-original-stems-label"
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 squircle-inner text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              isAnalyzingStems
                ? 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline-color)] cursor-wait'
                : 'bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white'
            }`}
          >
            {isAnalyzingStems ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            <span>
              {isAnalyzingStems
                ? 'Analyzing Original Stems...'
                : hasUserStems
                ? 'Replace Original Stems (2–8)'
                : 'Upload Original Stems (2–8 files)'}
            </span>
          </label>
          <input
            id="adv-stems-upload"
            data-testid="upload-original-stems-input"
            type="file"
            multiple
            accept=".wav,.flac,.aiff,.mp3,.ogg,audio/*"
            onChange={handleStemsSelected}
            disabled={isAnalyzingStems}
            className="sr-only"
          />

          {hasUserStems && (
            <motion.button
              type="button"
              whileTap={TACTILE_TAP}
              onClick={handleClearStems}
              disabled={isAnalyzingStems}
              className="inline-flex items-center gap-1 px-2.5 py-2 squircle-inner border border-[var(--border-hairline-color)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-primary)] hover:border-[var(--border-active-color)] transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear Stems</span>
            </motion.button>
          )}
        </div>
      </div>

      {/* Inline Validation / Alignment Error Banner */}
      {stemError && (
        <div
          role="alert"
          data-testid="stem-error-banner"
          className="squircle-inner border border-[var(--status-alert)]/35 bg-rose-50/80 dark:bg-rose-950/35 p-3.5 flex items-start justify-between gap-3 text-xs text-rose-900 dark:text-rose-200"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-[var(--status-alert)] shrink-0 mt-0.5" />
            <div>
              {stemErrorCode && (
                <div className="font-mono text-[11px] font-semibold text-[var(--status-alert)] mb-0.5">
                  {stemErrorCode}
                </div>
              )}
              <p className="leading-relaxed">{stemError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setStemError(null);
              setStemErrorCode(null);
            }}
            className="text-[var(--status-alert)] hover:underline font-mono text-[11px] shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* HARD LOCK STATE when has_user_stems === false */}
      {!hasUserStems ? (
        <div
          data-testid="stem-hard-lock-state"
          className="squircle-inner border border-dashed border-[var(--border-hairline-color)] bg-[var(--bg-surface)] p-8 text-center space-y-3"
        >
          <div className="w-11 h-11 squircle-inner bg-[var(--bg-elevated)] border border-[var(--border-hairline-color)] text-[var(--text-secondary)] mx-auto flex items-center justify-center">
            <Lock className="w-5 h-5" />
          </div>
          <div className="max-w-lg mx-auto space-y-1.5">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              Stem Diagnostics Locked — Original DAW Stems Required
            </h3>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Upload 2–8 original DAW stems to inspect pairwise frequency overlap—MixLearn Studio never fabricates AI stems from a stereo mixdown.
            </p>
            <p className="text-[11px] font-mono tabular-nums text-[var(--text-secondary)] pt-1">
              Limits: 2–8 files · ≤ 100 MB per stem · ≤ 350 MB combined · ≤ 50 ms duration alignment tolerance
            </p>
          </div>
        </div>
      ) : (
        stemReport && (
          <div className="space-y-6" data-testid="stem-diagnostics-results">
            {/* Alignment & Rule 1 Verification Strip */}
            <div className="flex flex-wrap items-center justify-between gap-3 squircle-inner border border-[var(--border-active-color)] bg-[var(--accent-soft)] px-4 py-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-3 text-[var(--text-primary)]">
                <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--accent-primary)]">
                  <ShieldCheck className="w-4 h-4" />
                  <span>{stemReport.stem_count} Original Stems Verified</span>
                </span>
                <span className="font-mono tabular-nums text-[var(--text-secondary)]">
                  Alignment Spread: {stemReport.alignment.max_duration_diff_ms.toFixed(1)} ms (≤{' '}
                  {stemReport.alignment.tolerance_ms} ms)
                </span>
                <span className="font-mono tabular-nums text-[var(--text-secondary)]">
                  Length: {stemReport.alignment.reference_duration_seconds.toFixed(2)}s
                </span>
              </div>
              <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                {engineSource === 'backend' ? 'FastAPI Streaming DSP' : 'Local Web Audio DSP'}
              </span>
            </div>

            {stemReport.alignment.warnings.length > 0 && (
              <div className="squircle-inner border border-[var(--status-caution)]/35 bg-amber-50/70 dark:bg-amber-950/30 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                {stemReport.alignment.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[var(--status-caution)]" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 1. Per-Stem Telemetry Table */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
                Per-Stem Loudness, Headroom &amp; Spectral Centroid
              </h3>
              <div className="overflow-x-auto squircle-inner border border-[var(--border-hairline-color)]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[var(--bg-surface)] studio-hairline-b text-[11px] text-[var(--text-secondary)] font-semibold">
                      <th className="py-2.5 px-3.5">Original Stem</th>
                      <th className="py-2.5 px-3 text-right">Integrated LUFS</th>
                      <th className="py-2.5 px-3 text-right">Sample Peak</th>
                      <th className="py-2.5 px-3 text-right">True Peak</th>
                      <th className="py-2.5 px-3 text-right">Headroom</th>
                      <th className="py-2.5 px-3 text-right">Spectral Centroid</th>
                      <th className="py-2.5 px-3.5 text-right">Format</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-hairline-color)] font-mono tabular-nums">
                    {stemReport.stems.map((stem) => (
                      <tr key={stem.stem_id} className="hover:bg-[var(--bg-surface)]/70 transition-colors">
                        <td className="py-2.5 px-3.5 font-sans font-medium text-[var(--text-primary)]">
                          {stem.stem_name}
                        </td>
                        <td className="py-2.5 px-3 text-right text-[var(--text-primary)]">
                          {fmtNum(stem.integrated_lufs, 'LUFS', 1)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-[var(--text-secondary)]">
                          {fmtNum(stem.sample_peak_dbfs, 'dBFS', 2)}
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-semibold ${
                            stem.true_peak_dbtp !== null && stem.true_peak_dbtp > -1.0
                              ? 'text-[var(--status-alert)]'
                              : 'text-[var(--text-primary)]'
                          }`}
                        >
                          {fmtNum(stem.true_peak_dbtp, 'dBTP', 2, true)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-[var(--accent-primary)]">
                          {fmtNum(stem.headroom_db, 'dB', 1)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-[var(--text-primary)]">
                          {stem.spectral_centroid_hz !== null
                            ? `${Math.round(stem.spectral_centroid_hz)} Hz`
                            : 'N/A'}
                        </td>
                        <td className="py-2.5 px-3.5 text-right text-[var(--text-secondary)]">
                          {stem.sample_rate_hz / 1000} kHz · {stem.channels === 1 ? 'Mono' : 'Stereo'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 2. Pairwise 6-Band Frequency Overlap Matrix */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
                  Pairwise 6-Band Potential Spectral Masking Matrix
                </h3>
                <div className="flex items-center gap-3 text-[11px] font-mono">
                  <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                    <span className="w-2.5 h-2.5 rounded-[3px] bg-[var(--bg-surface)] border border-[var(--border-hairline-color)]" />
                    Low
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[var(--status-caution)]">
                    <span className="w-2.5 h-2.5 rounded-[3px] bg-amber-100 dark:bg-amber-900/50 border border-[var(--status-caution)]/45" />
                    Moderate
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[var(--status-alert)]">
                    <span className="w-2.5 h-2.5 rounded-[3px] bg-rose-100 dark:bg-rose-900/50 border border-[var(--status-alert)]/45" />
                    High Potential Masking
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto squircle-inner border border-[var(--border-hairline-color)]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[var(--bg-surface)] studio-hairline-b text-[11px] text-[var(--text-secondary)] font-semibold">
                      <th className="py-2.5 px-3.5">Stem Pair</th>
                      {SIX_OCTAVE_BAND_DEFS.map((b) => (
                        <th key={b.key} className="py-2.5 px-2 text-center whitespace-nowrap">
                          <div>{b.shortLabel}</div>
                          <div className="font-mono text-[10px] font-normal opacity-75">
                            {b.low_hz >= 1000 ? `${b.low_hz / 1000}k` : b.low_hz}–
                            {b.high_hz >= 1000 ? `${b.high_hz / 1000}k` : b.high_hz}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-hairline-color)]">
                    {stemReport.overlap_matrix.pairs.map((pair) => (
                      <tr key={`${pair.stem_a_id}-${pair.stem_b_id}`}>
                        <td className="py-2.5 px-3.5 font-medium text-[var(--text-primary)] whitespace-nowrap">
                          <span>{pair.stem_a_name}</span>
                          <span className="opacity-35 mx-1.5">×</span>
                          <span>{pair.stem_b_name}</span>
                        </td>
                        {SIX_OCTAVE_BAND_DEFS.map((b) => {
                          const cell = pair.bands[b.key as StemBandKey];
                          return (
                            <td key={b.key} className="p-1.5 text-center">
                              <div
                                className={`squircle-inner border px-2 py-1.5 font-mono tabular-nums ${severityCellClasses(
                                  cell.severity
                                )}`}
                                title={`${pair.stem_a_name}: ${cell.stem_a_db ?? 'N/A'} dBFS | ${
                                  pair.stem_b_name
                                }: ${cell.stem_b_db ?? 'N/A'} dBFS | Δ ${
                                  cell.level_diff_db ?? 'N/A'
                                } dB`}
                              >
                                <div className="text-[11px] font-semibold capitalize">
                                  {cell.severity}
                                </div>
                                <div className="text-[10px] opacity-80">
                                  {cell.level_diff_db !== null
                                    ? `Δ ${cell.level_diff_db.toFixed(1)} dB`
                                    : '—'}
                                </div>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Potential Spectral Masking Highlights */}
              {stemReport.overlap_matrix.highlights.length > 0 && (
                <div className="squircle-inner studio-surface p-4 space-y-2">
                  <div className="text-xs font-semibold text-[var(--text-primary)]">
                    Key Potential Spectral Masking Zones
                  </div>
                  <ul className="space-y-1.5 text-xs text-[var(--text-secondary)]">
                    {stemReport.overlap_matrix.highlights.slice(0, 5).map((h, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span
                          className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                            h.severity === 'high'
                              ? 'bg-[var(--status-alert)]'
                              : 'bg-[var(--status-caution)]'
                          }`}
                        />
                        <span>{h.note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-[11px] text-[var(--text-secondary)] flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[var(--accent-primary)]" />
                <span>{stemReport.overlap_matrix.methodology_note}</span>
              </p>
            </div>

            {/* 3. Optional Stem-Sum vs. Primary Stereo Mix Residual Summary */}
            {stemReport.primary_mix_residual && (
              <div
                data-testid="stem-primary-residual-card"
                className="squircle-inner studio-surface p-4 space-y-3"
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                  <CheckCircle2 className="w-4 h-4 text-[var(--accent-primary)]" />
                  <span>
                    Linear Stem Sum vs. Primary Stereo Mix Residual
                    {stemReport.primary_mix_residual.primary_mix_filename
                      ? ` (${stemReport.primary_mix_residual.primary_mix_filename})`
                      : ''}
                  </span>
                </div>

                {stemReport.primary_mix_residual.available ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono tabular-nums text-xs">
                    <div className="squircle-inner studio-elevated px-3 py-2.5">
                      <div className="text-[10px] font-sans text-[var(--text-secondary)]">Stereo Mix RMS</div>
                      <div className="font-semibold text-[var(--text-primary)] mt-0.5">
                        {fmtNum(stemReport.primary_mix_residual.primary_mix_rms_dbfs, 'dBFS', 2)}
                      </div>
                    </div>
                    <div className="squircle-inner studio-elevated px-3 py-2.5">
                      <div className="text-[10px] font-sans text-[var(--text-secondary)]">Linear Stem Sum RMS</div>
                      <div className="font-semibold text-[var(--text-primary)] mt-0.5">
                        {fmtNum(stemReport.primary_mix_residual.stem_sum_rms_dbfs, 'dBFS', 2)}
                      </div>
                    </div>
                    <div className="squircle-inner studio-elevated px-3 py-2.5">
                      <div className="text-[10px] font-sans text-[var(--text-secondary)]">RMS Difference</div>
                      <div className="font-semibold text-[var(--text-primary)] mt-0.5">
                        {fmtNum(stemReport.primary_mix_residual.rms_difference_db, 'dB', 2, true)}
                      </div>
                    </div>
                    <div className="squircle-inner studio-elevated px-3 py-2.5">
                      <div className="text-[10px] font-sans text-[var(--text-secondary)]">Residual RMS</div>
                      <div className="font-semibold text-[var(--text-primary)] mt-0.5">
                        {fmtNum(stemReport.primary_mix_residual.residual_rms_dbfs, 'dBFS', 1)}
                      </div>
                    </div>
                  </div>
                ) : null}

                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  {stemReport.primary_mix_residual.interpretation_note}
                </p>
              </div>
            )}
          </div>
        )
      )}
    </section>
  );
};

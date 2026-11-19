import React, { useState } from 'react';
import {
  ConsentState,
  OverlapSeverity,
  StemBandKey,
  StemMultitrackReport,
} from '../contracts/analysisContract';
import { SIX_OCTAVE_BAND_DEFS } from '../audio/phase4Logic';
import { analyzeStemsWithDsp } from '../services/apiService';
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
    return 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/70 text-rose-800 dark:text-rose-300';
  }
  if (severity === 'moderate') {
    return 'bg-amber-50/90 dark:bg-amber-950/35 border-amber-200 dark:border-amber-800/70 text-amber-800 dark:text-amber-300';
  }
  return 'bg-[#FAFAFA] dark:bg-zinc-950/60 border-zinc-200/80 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400';
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
      className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-6 space-y-5"
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-[#3A7269] dark:text-teal-400">
            <Layers className="w-3.5 h-3.5" />
            <span>ORIGINAL MULTITRACK STEM DIAGNOSTICS · RULE 1 COMPLIANT</span>
          </div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
            Pairwise 6-Band Frequency Overlap Matrix
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Inspect per-stem loudness, headroom, spectral centroid, and potential spectral masking across 2–8 genuine DAW stems.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor="adv-stems-upload"
            data-testid="upload-original-stems-label"
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              isAnalyzingStems
                ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500 cursor-wait'
                : 'bg-[#3A7269] hover:bg-[#2F5E56] text-white'
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
            <button
              type="button"
              onClick={handleClearStems}
              disabled={isAnalyzingStems}
              className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear Stems</span>
            </button>
          )}
        </div>
      </div>

      {/* Inline Validation / Alignment Error Banner */}
      {stemError && (
        <div
          role="alert"
          data-testid="stem-error-banner"
          className="rounded-lg border border-rose-200 dark:border-rose-800/80 bg-rose-50 dark:bg-rose-950/35 p-3.5 flex items-start justify-between gap-3 text-xs text-rose-900 dark:text-rose-200"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div>
              {stemErrorCode && (
                <div className="font-mono text-[11px] font-semibold text-rose-700 dark:text-rose-300 mb-0.5">
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
            className="text-rose-700 dark:text-rose-300 hover:underline font-mono text-[11px] shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* HARD LOCK STATE when has_user_stems === false */}
      {!hasUserStems ? (
        <div
          data-testid="stem-hard-lock-state"
          className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 bg-[#FAFAFA] dark:bg-zinc-950/60 p-8 text-center space-y-3"
        >
          <div className="w-11 h-11 rounded-full bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 mx-auto flex items-center justify-center">
            <Lock className="w-5 h-5" />
          </div>
          <div className="max-w-lg mx-auto space-y-1.5">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Stem Diagnostics Locked — Original DAW Stems Required
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Upload 2–8 original DAW stems to inspect pairwise frequency overlap—MixLearn Studio never fabricates AI stems from a stereo mixdown.
            </p>
            <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-500 pt-1">
              Limits: 2–8 files · ≤ 100 MB per stem · ≤ 350 MB combined · ≤ 50 ms duration alignment tolerance
            </p>
          </div>
        </div>
      ) : (
        stemReport && (
          <div className="space-y-6" data-testid="stem-diagnostics-results">
            {/* Alignment & Rule 1 Verification Strip */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#3A7269]/25 dark:border-teal-800/60 bg-[#3A7269]/[0.05] dark:bg-teal-950/25 px-4 py-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-3 text-zinc-800 dark:text-zinc-200">
                <span className="inline-flex items-center gap-1.5 font-semibold text-[#3A7269] dark:text-teal-400">
                  <ShieldCheck className="w-4 h-4" />
                  <span>{stemReport.stem_count} Original Stems Verified</span>
                </span>
                <span className="font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                  Alignment Spread: {stemReport.alignment.max_duration_diff_ms.toFixed(1)} ms (≤{' '}
                  {stemReport.alignment.tolerance_ms} ms)
                </span>
                <span className="font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                  Length: {stemReport.alignment.reference_duration_seconds.toFixed(2)}s
                </span>
              </div>
              <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                {engineSource === 'backend' ? 'FastAPI Streaming DSP' : 'Local Web Audio DSP'}
              </span>
            </div>

            {stemReport.alignment.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/30 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                {stemReport.alignment.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 1. Per-Stem Telemetry Table */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Per-Stem Loudness, Headroom &amp; Spectral Centroid
              </h3>
              <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#FAFAFA] dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
                      <th className="py-2.5 px-3.5">Original Stem</th>
                      <th className="py-2.5 px-3 text-right">Integrated LUFS</th>
                      <th className="py-2.5 px-3 text-right">Sample Peak</th>
                      <th className="py-2.5 px-3 text-right">True Peak</th>
                      <th className="py-2.5 px-3 text-right">Headroom</th>
                      <th className="py-2.5 px-3 text-right">Spectral Centroid</th>
                      <th className="py-2.5 px-3.5 text-right">Format</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-800/80 font-mono tabular-nums">
                    {stemReport.stems.map((stem) => (
                      <tr key={stem.stem_id} className="hover:bg-[#FAFAFA] dark:hover:bg-zinc-800/40">
                        <td className="py-2.5 px-3.5 font-sans font-medium text-zinc-900 dark:text-zinc-100">
                          {stem.stem_name}
                        </td>
                        <td className="py-2.5 px-3 text-right text-zinc-800 dark:text-zinc-200">
                          {fmtNum(stem.integrated_lufs, 'LUFS', 1)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-zinc-700 dark:text-zinc-300">
                          {fmtNum(stem.sample_peak_dbfs, 'dBFS', 2)}
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-semibold ${
                            stem.true_peak_dbtp !== null && stem.true_peak_dbtp > -1.0
                              ? 'text-rose-700 dark:text-rose-400'
                              : 'text-zinc-800 dark:text-zinc-200'
                          }`}
                        >
                          {fmtNum(stem.true_peak_dbtp, 'dBTP', 2, true)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-[#3A7269] dark:text-teal-400">
                          {fmtNum(stem.headroom_db, 'dB', 1)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-zinc-800 dark:text-zinc-200">
                          {stem.spectral_centroid_hz !== null
                            ? `${Math.round(stem.spectral_centroid_hz)} Hz`
                            : 'N/A'}
                        </td>
                        <td className="py-2.5 px-3.5 text-right text-zinc-500 dark:text-zinc-400">
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
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Pairwise 6-Band Potential Spectral Masking Matrix
                </h3>
                <div className="flex items-center gap-3 text-[11px] font-mono">
                  <span className="inline-flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                    <span className="w-2.5 h-2.5 rounded-xs bg-zinc-200 dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600" />
                    Low
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                    <span className="w-2.5 h-2.5 rounded-xs bg-amber-100 dark:bg-amber-900/60 border border-amber-300 dark:border-amber-700" />
                    Moderate
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-rose-800 dark:text-rose-300">
                    <span className="w-2.5 h-2.5 rounded-xs bg-rose-100 dark:bg-rose-900/60 border border-rose-300 dark:border-rose-700" />
                    High Potential Masking
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#FAFAFA] dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
                      <th className="py-2.5 px-3.5">Stem Pair</th>
                      {SIX_OCTAVE_BAND_DEFS.map((b) => (
                        <th key={b.key} className="py-2.5 px-2 text-center whitespace-nowrap">
                          <div>{b.shortLabel}</div>
                          <div className="font-mono text-[10px] font-normal text-zinc-400">
                            {b.low_hz >= 1000 ? `${b.low_hz / 1000}k` : b.low_hz}–
                            {b.high_hz >= 1000 ? `${b.high_hz / 1000}k` : b.high_hz}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-800/80">
                    {stemReport.overlap_matrix.pairs.map((pair) => (
                      <tr key={`${pair.stem_a_id}-${pair.stem_b_id}`}>
                        <td className="py-2.5 px-3.5 font-medium text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                          <span>{pair.stem_a_name}</span>
                          <span className="text-zinc-400 mx-1.5">×</span>
                          <span>{pair.stem_b_name}</span>
                        </td>
                        {SIX_OCTAVE_BAND_DEFS.map((b) => {
                          const cell = pair.bands[b.key as StemBandKey];
                          return (
                            <td key={b.key} className="p-1.5 text-center">
                              <div
                                className={`rounded border px-2 py-1.5 font-mono tabular-nums ${severityCellClasses(
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
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[#FAFAFA] dark:bg-zinc-950/60 p-4 space-y-2">
                  <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                    Key Potential Spectral Masking Zones
                  </div>
                  <ul className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                    {stemReport.overlap_matrix.highlights.slice(0, 5).map((h, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span
                          className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                            h.severity === 'high' ? 'bg-rose-500' : 'bg-amber-500'
                          }`}
                        />
                        <span>{h.note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{stemReport.overlap_matrix.methodology_note}</span>
              </p>
            </div>

            {/* 3. Optional Stem-Sum vs. Primary Stereo Mix Residual Summary */}
            {stemReport.primary_mix_residual && (
              <div
                data-testid="stem-primary-residual-card"
                className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[#F5F5F7]/70 dark:bg-zinc-950/70 p-4 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    <CheckCircle2 className="w-4 h-4 text-[#3A7269] dark:text-teal-400" />
                    <span>
                      Linear Stem Sum vs. Primary Stereo Mix Residual
                      {stemReport.primary_mix_residual.primary_mix_filename
                        ? ` (${stemReport.primary_mix_residual.primary_mix_filename})`
                        : ''}
                    </span>
                  </div>
                </div>

                {stemReport.primary_mix_residual.available ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono tabular-nums text-xs">
                    <div className="rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2">
                      <div className="text-[10px] font-sans text-zinc-500">Stereo Mix RMS</div>
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">
                        {fmtNum(stemReport.primary_mix_residual.primary_mix_rms_dbfs, 'dBFS', 2)}
                      </div>
                    </div>
                    <div className="rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2">
                      <div className="text-[10px] font-sans text-zinc-500">Linear Stem Sum RMS</div>
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">
                        {fmtNum(stemReport.primary_mix_residual.stem_sum_rms_dbfs, 'dBFS', 2)}
                      </div>
                    </div>
                    <div className="rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2">
                      <div className="text-[10px] font-sans text-zinc-500">RMS Difference</div>
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">
                        {fmtNum(stemReport.primary_mix_residual.rms_difference_db, 'dB', 2, true)}
                      </div>
                    </div>
                    <div className="rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2">
                      <div className="text-[10px] font-sans text-zinc-500">Residual RMS</div>
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">
                        {fmtNum(stemReport.primary_mix_residual.residual_rms_dbfs, 'dBFS', 1)}
                      </div>
                    </div>
                  </div>
                ) : null}

                <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
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

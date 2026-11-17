import React, { useState } from 'react';
import {
  AnalysisReport,
  ConsentState,
  GenreId,
  MixStage,
} from '../contracts/analysisContract';
import { GENRE_LABELS, MIX_STAGE_LABELS } from '../contracts/demoFixtures';
import { WaveformInspector } from './WaveformInspector';
import { DspAnalysisLoadingScreen } from './DspAnalysisLoadingScreen';
import {
  Upload,
  ArrowRight,
  Shield,
  Volume2,
  Activity,
  Layers,
  Sliders,
  RotateCcw,
} from 'lucide-react';

interface SimpleMixCheckViewProps {
  report: AnalysisReport;
  reportSource?: 'backend' | 'offline_fallback';
  genre: GenreId;
  mixStage: MixStage;
  consent: ConsentState;
  onChangeGenre: (genre: GenreId) => void;
  onChangeMixStage: (stage: MixStage) => void;
  onAnalyzeAudioFile?: (file: File) => void;
  onSwitchToAdvanced: () => void;
  selectedFile?: File | null;
  onSelectFile?: (file: File) => void;
  onClearFile?: () => void;
  isAnalyzing?: boolean;
  analysisProgress?: number;
  analysisStageIndex?: number;
  errorMessage?: string | null;
  onCancelAnalysis?: () => void;
  onLoadDemonstration?: () => void;
}

export const SimpleMixCheckView: React.FC<SimpleMixCheckViewProps> = ({
  report,
  reportSource,
  genre,
  mixStage,
  consent,
  onChangeGenre,
  onChangeMixStage,
  onAnalyzeAudioFile,
  onSwitchToAdvanced,
  selectedFile = null,
  onSelectFile,
  isAnalyzing = false,
  analysisProgress = 0,
  analysisStageIndex = 0,
  errorMessage = null,
  onLoadDemonstration,
}) => {
  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({});
  const [activeIssueId, setActiveIssueId] = useState<string | null>(
    report.issues[0]?.issue_id ?? null
  );
  const [activeTimestamp, setActiveTimestamp] = useState<{
    start_sec: number;
    end_sec: number;
    label: string;
  } | null>(report.issues[0]?.timestamps[0] ?? null);
  const [monoMode, setMonoMode] = useState(false);

  // Auto-start analysis immediately when file is picked
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (onSelectFile) {
      onSelectFile(file);
    } else if (onAnalyzeAudioFile) {
      onAnalyzeAudioFile(file);
    }
  };

  const handleReAnalyze = () => {
    if (selectedFile && onAnalyzeAudioFile) {
      onAnalyzeAudioFile(selectedFile);
    }
  };

  const toggleVerificationStep = (id: string) => {
    setCheckedSteps((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const isUnmastered = mixStage === 'unmastered_mix';

  // --- Metric 1: Loudness (LUFS) ---
  const lufsVal = report.measurements?.integrated_loudness?.value;
  const lufsMin = isUnmastered ? -18.0 : -14.0;
  const lufsMax = isUnmastered ? -14.0 : -9.0;
  const lufsBadge =
    lufsVal === null || lufsVal === undefined
      ? { label: 'NO SIGNAL', color: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' }
      : lufsVal >= lufsMin && lufsVal <= lufsMax
      ? { label: 'PASS', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' }
      : lufsVal > lufsMax
      ? { label: 'TOO LOUD', color: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' }
      : { label: 'TOO QUIET', color: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' };

  // --- Metric 2: True Peak Headroom (dBTP) ---
  const tpVal = report.measurements?.true_peak_max?.value;
  const tpTarget = isUnmastered ? -3.0 : -1.0;
  const tpBadge =
    tpVal === null || tpVal === undefined
      ? { label: 'NO SIGNAL', color: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' }
      : tpVal <= tpTarget
      ? { label: 'PASS', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' }
      : { label: 'CLIPPING RISK', color: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' };

  // --- Metric 3: Mono & Phase Safety ---
  const isMono = report.file_metadata.channels === 1;
  const phaseCorr = report.measurements?.phase_correlation_mean?.value;
  const phaseMin = report.measurements?.phase_correlation_min?.value;
  const phaseBadge = isMono
    ? { label: 'MONO SAFE', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' }
    : phaseMin !== null && phaseMin !== undefined && phaseMin < 0.0
    ? { label: 'PHASE ISSUE', color: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' }
    : phaseCorr !== null && phaseCorr !== undefined && phaseCorr >= 0.2
    ? { label: 'MONO SAFE', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' }
    : { label: 'CHECK PHASE', color: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' };

  // --- Metric 4: Crest / Dynamics ---
  const crestVal = report.measurements?.crest_factor?.value;
  const crestBadge =
    crestVal === null || crestVal === undefined
      ? { label: 'NO SIGNAL', color: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' }
      : crestVal >= 8.0 && crestVal <= 18.0
      ? { label: 'BALANCED', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' }
      : crestVal < 8.0
      ? { label: 'OVER-COMPRESSED', color: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' }
      : { label: 'VERY DYNAMIC', color: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300' };

  // Max 3 prioritized action cards
  const topRecommendations = report.recommendations.slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Demonstration Banner only rendered when viewing unanalyzed demonstration fixture */}
      {report.is_demonstration_data && (
        <div
          role="status"
          data-testid="demo-data-banner-simple"
          className="border border-teal-800/30 dark:border-teal-500/30 bg-teal-50/70 dark:bg-teal-950/30 rounded-lg px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-800 dark:text-zinc-200"
        >
          <div>
            <span className="font-semibold text-teal-900 dark:text-teal-300 font-mono mr-1.5">
              {reportSource === 'backend'
                ? '[DEMONSTRATION DATA · FASTAPI BACKEND]'
                : '[DEMONSTRATION DATA · OFFLINE]'}
            </span>
            <span>Upload your own song to run real in-browser mathematical DSP analysis.</span>
          </div>
        </div>
      )}

      {/* Header & Controls Section */}
      <section
        aria-label="Simple Mix Check Configuration"
        className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-6 shadow-xs"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              Simple Mix Check
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Upload your mix or master bounce to get instant plain-language DAW action steps.
            </p>
          </div>
          <button
            type="button"
            onClick={onSwitchToAdvanced}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-800 dark:text-teal-400 hover:underline shrink-0"
          >
            <span>Switch to Advanced Mix Check (Full Meters &amp; Stems)</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-5">
          {/* 1. Select Genre */}
          <div>
            <label
              htmlFor="simple-genre-select"
              className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5"
            >
              1. Genre
            </label>
            <select
              id="simple-genre-select"
              value={genre}
              onChange={(e) => onChangeGenre(e.target.value as GenreId)}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-700"
            >
              {(Object.keys(GENRE_LABELS) as GenreId[]).map((gKey) => (
                <option key={gKey} value={gKey}>
                  {GENRE_LABELS[gKey]}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Select Mix Stage */}
          <div>
            <span className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5">
              2. Stage
            </span>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Select Stage">
              {(['unmastered_mix', 'final_master'] as MixStage[]).map((stage) => {
                const active = mixStage === stage;
                return (
                  <button
                    key={stage}
                    type="button"
                    onClick={() => onChangeMixStage(stage)}
                    aria-pressed={active}
                    className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors text-center ${
                      active
                        ? 'border-teal-800 bg-teal-800 text-white dark:border-teal-600 dark:bg-teal-700 font-semibold'
                        : 'border-zinc-300 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300'
                    }`}
                  >
                    {MIX_STAGE_LABELS[stage].title}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Audio File Selector & Re-Analyze Mix Trigger */}
          <div>
            <label
              htmlFor="simple-audio-upload"
              className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5"
            >
              3. Audio Bounce (WAV, FLAC, AIFF, MP3)
            </label>
            <div className="flex items-center gap-2">
              <label
                htmlFor="simple-audio-upload"
                className="flex-1 flex items-center justify-between gap-2 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300 hover:border-teal-700 cursor-pointer transition-colors truncate"
              >
                <span className="truncate font-mono">
                  {selectedFile ? selectedFile.name : report.file_metadata.filename}
                </span>
                <span className="inline-flex items-center gap-1 font-semibold text-teal-800 dark:text-teal-400 shrink-0">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Choose File</span>
                </span>
              </label>

              {selectedFile && (
                <button
                  type="button"
                  onClick={handleReAnalyze}
                  disabled={isAnalyzing}
                  className="px-3 py-2 rounded-lg bg-teal-800 hover:bg-teal-900 text-white text-xs font-semibold transition-colors disabled:opacity-50 shrink-0 inline-flex items-center gap-1"
                  title="Re-run DSP analysis with current genre/stage targets"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Re-Analyze</span>
                </button>
              )}
            </div>
            <input
              id="simple-audio-upload"
              type="file"
              accept=".wav,.flac,.aiff,.mp3,.ogg,audio/*"
              onChange={handleFileChange}
              className="sr-only"
              disabled={isAnalyzing}
            />
          </div>
        </div>
      </section>

      {/* STEP 3: Animated DSP Analysis Loading Screen */}
      {isAnalyzing && (
        <DspAnalysisLoadingScreen
          fileName={selectedFile?.name || report.file_metadata.filename}
          fileSizeBytes={selectedFile?.size || report.file_metadata.file_size_bytes}
          genre={genre}
          progressPercent={analysisProgress}
          stageIndex={analysisStageIndex}
        />
      )}

      {/* Main Analysis Results (Hidden while isAnalyzing) */}
      {!isAnalyzing && (
        <>
          {/* Audio Waveform Inspector */}
          <WaveformInspector
            durationSeconds={report.file_metadata.duration_seconds}
            issues={report.issues}
            activeIssueId={activeIssueId}
            activeTimestamp={activeTimestamp}
            onSelectTimestamp={(issueId, ts) => {
              setActiveIssueId(issueId);
              setActiveTimestamp(ts);
            }}
            monoMode={monoMode}
            onToggleMono={() => setMonoMode((m) => !m)}
            isUnmastered={isUnmastered}
            timeline={report.timeline}
            isDemonstrationData={report.is_demonstration_data}
            audioFile={selectedFile}
          />

          {/* SECTION A — 4-Metric Quick Scorecard (Top Row) */}
          <section
            aria-label="Mix Quick Diagnostics Scorecard"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {/* 1. Loudness */}
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span className="font-semibold uppercase tracking-wider text-[11px]">Loudness</span>
                <Volume2 className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              </div>
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-2 font-mono">
                {lufsVal !== null && lufsVal !== undefined ? `${lufsVal.toFixed(1)} LUFS` : '—'}
              </div>
              <div className="flex items-center justify-between text-xs mt-2 text-zinc-500">
                <span>Target: {lufsMin} to {lufsMax} LUFS</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${lufsBadge.color}`}>
                  {lufsBadge.label}
                </span>
              </div>
            </div>

            {/* 2. True Peak Headroom */}
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span className="font-semibold uppercase tracking-wider text-[11px]">True Peak Headroom</span>
                <Activity className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              </div>
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-2 font-mono">
                {tpVal !== null && tpVal !== undefined ? `${tpVal.toFixed(1)} dBTP` : '—'}
              </div>
              <div className="flex items-center justify-between text-xs mt-2 text-zinc-500">
                <span>Ceiling: ≤ {tpTarget.toFixed(1)} dBTP</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${tpBadge.color}`}>
                  {tpBadge.label}
                </span>
              </div>
            </div>

            {/* 3. Mono & Phase Safety */}
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span className="font-semibold uppercase tracking-wider text-[11px]">Mono &amp; Phase Safety</span>
                <Layers className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              </div>
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-2 font-mono">
                {isMono
                  ? 'Mono Track'
                  : phaseCorr !== null && phaseCorr !== undefined
                  ? `${phaseCorr >= 0 ? '+' : ''}${phaseCorr.toFixed(2)} Corr`
                  : '—'}
              </div>
              <div className="flex items-center justify-between text-xs mt-2 text-zinc-500">
                <span>Phase correlation</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${phaseBadge.color}`}>
                  {phaseBadge.label}
                </span>
              </div>
            </div>

            {/* 4. Crest / Dynamics */}
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span className="font-semibold uppercase tracking-wider text-[11px]">Crest / Dynamics</span>
                <Sliders className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              </div>
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-2 font-mono">
                {crestVal !== null && crestVal !== undefined ? `${crestVal.toFixed(1)} dB` : '—'}
              </div>
              <div className="flex items-center justify-between text-xs mt-2 text-zinc-500">
                <span>Dynamic range</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${crestBadge.color}`}>
                  {crestBadge.label}
                </span>
              </div>
            </div>
          </section>

          {/* SECTION B — Maximum 3 Concise Action Cards */}
          <section
            aria-label="Prioritized Mix Action Plan"
            className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-6 shadow-xs space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <div>
                <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  Prioritized Mix Action Plan ({topRecommendations.length} Key Steps)
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Follow these prioritized steps in your DAW before re-exporting.
                </p>
              </div>
              <div className="text-xs font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                Completed: {Object.values(checkedSteps).filter(Boolean).length} / {topRecommendations.length}
              </div>
            </div>

            <div className="space-y-4">
              {topRecommendations.map((rec, idx) => {
                const isDone = !!checkedSteps[rec.recommendation_id];
                const linkedIssue = report.issues.find((i) => i.issue_id === rec.linked_issue_id);

                const priorityLabel =
                  rec.priority_rank === 1
                    ? 'PRIORITY 01'
                    : rec.priority_rank === 2
                    ? 'PRIORITY 02'
                    : 'PRIORITY 03';

                const priorityPillColor =
                  rec.priority_rank === 1
                    ? 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-900'
                    : rec.priority_rank === 2
                    ? 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900'
                    : 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900';

                const detectedLine =
                  linkedIssue?.learning_guide.what_was_detected ||
                  `Detected: ${rec.beginner_summary}`;

                const dawFixLine =
                  linkedIssue?.learning_guide.what_to_try ||
                  rec.advanced_dsp_guidance ||
                  rec.beginner_summary;

                return (
                  <article
                    key={rec.recommendation_id}
                    className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 bg-zinc-50/40 dark:bg-zinc-950/30 space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded border ${priorityPillColor}`}>
                          {priorityLabel}
                        </span>
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                          {rec.action_title}
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleVerificationStep(rec.recommendation_id)}
                        aria-pressed={isDone}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                          isDone
                            ? 'bg-teal-800 text-white border-teal-800 dark:bg-teal-600 dark:border-teal-600'
                            : 'bg-white text-zinc-800 border-zinc-300 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-200 dark:border-zinc-700'
                        }`}
                      >
                        {isDone ? '✓ Verified in DAW' : 'Mark Verified'}
                      </button>
                    </div>

                    {/* Detected Metric (1 line) */}
                    <p className="text-xs text-zinc-700 dark:text-zinc-300">
                      <strong className="text-zinc-900 dark:text-zinc-100 font-semibold mr-1.5">
                        Detected:
                      </strong>
                      {detectedLine}
                    </p>

                    {/* DAW Fix (1 short sentence) */}
                    <p className="text-xs text-teal-900 dark:text-teal-200 font-medium bg-teal-50/70 dark:bg-teal-950/40 p-2.5 rounded border border-teal-200 dark:border-teal-900/60">
                      <strong className="text-teal-800 dark:text-teal-300 font-semibold mr-1.5">
                        DAW Fix:
                      </strong>
                      {dawFixLine}
                    </p>

                    {/* Collapsible Details: Why this matters & how to check */}
                    <details open={idx === 0} className="text-xs text-zinc-600 dark:text-zinc-400 pt-1 group">
                      <summary className="text-xs text-teal-800 dark:text-teal-400 hover:underline cursor-pointer font-medium select-none">
                        Why this matters &amp; how to check
                      </summary>
                      <div className="pt-2.5 space-y-2 border-t border-zinc-200 dark:border-zinc-800 mt-2 text-xs">
                        <p>
                          <strong className="text-zinc-800 dark:text-zinc-200">WHAT WAS DETECTED:</strong>{' '}
                          {detectedLine}
                        </p>
                        <p>
                          <strong className="text-zinc-800 dark:text-zinc-200">WHY IT MATTERS:</strong>{' '}
                          {linkedIssue?.learning_guide.why_it_matters ||
                            'Addressing this ensures clean translation across consumer listening systems.'}
                        </p>
                        <p>
                          <strong className="text-teal-700 dark:text-teal-400">WHAT TO TRY IN YOUR DAW:</strong>{' '}
                          {dawFixLine}
                        </p>
                        <p>
                          <strong className="text-zinc-800 dark:text-zinc-200">HOW TO VERIFY THE CHANGE:</strong>{' '}
                          {linkedIssue?.learning_guide.how_to_verify ||
                            rec.verification_check ||
                            'Re-export and verify that the metric clears.'}
                        </p>
                      </div>
                    </details>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
};

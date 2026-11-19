import React, { useEffect, useState } from 'react';
import {
  AnalysisReport,
  ConsentState,
  GenreId,
  MixStage,
} from '../contracts/analysisContract';
import { GENRE_LABELS, MIX_STAGE_LABELS } from '../contracts/demoFixtures';
import { useStudioAudioEngine, useStudioAudioState } from '../audio/StudioAudioContext';
import { WaveformInspector } from './WaveformInspector';
import { SpectralTonalBalanceGraph } from './SpectralTonalBalanceGraph';
import { DspAnalysisLoadingScreen } from './DspAnalysisLoadingScreen';
import {
  Upload,
  ArrowRight,
  Volume2,
  Activity,
  Layers,
  Sliders,
  RotateCcw,
  X,
  FileAudio,
} from 'lucide-react';

interface SimpleMixCheckViewProps {
  report: AnalysisReport | null;
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
}

export const SimpleMixCheckView: React.FC<SimpleMixCheckViewProps> = ({
  report,
  genre,
  mixStage,
  onChangeGenre,
  onChangeMixStage,
  onAnalyzeAudioFile,
  onSwitchToAdvanced,
  selectedFile = null,
  onSelectFile,
  onClearFile,
  isAnalyzing = false,
  analysisProgress = 0,
  analysisStageIndex = 0,
}) => {
  const engine = useStudioAudioEngine();
  const audioState = useStudioAudioState();

  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({});
  const [activeIssueId, setActiveIssueId] = useState<string | null>(
    report?.issues?.[0]?.issue_id ?? null
  );
  const [activeTimestamp, setActiveTimestamp] = useState<{
    start_sec: number;
    end_sec: number;
    label: string;
  } | null>(report?.issues?.[0]?.timestamps?.[0] ?? null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Sync initial active marker when a new report arrives
  useEffect(() => {
    const first = report?.issues?.[0];
    setActiveIssueId(first?.issue_id ?? null);
    setActiveTimestamp(first?.timestamps?.[0] ?? null);
  }, [report?.report_id]);

  // Auto-start analysis immediately when file is picked
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (onSelectFile) {
      onSelectFile(file);
    } else if (onAnalyzeAudioFile) {
      onAnalyzeAudioFile(file);
    }
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
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

  const handleFocusIssue = (issueId: string) => {
    setActiveIssueId(issueId);
    const found = report?.issues.find((i) => i.issue_id === issueId);
    if (found?.timestamps?.[0]) {
      const ts = found.timestamps[0];
      setActiveTimestamp(ts);
      engine.setLoopRegion({
        startSec: ts.start_sec,
        endSec: Math.max(ts.start_sec + 1.0, ts.end_sec),
        label: ts.label,
      });
      if (audioState.hasPrimaryMix) {
        engine.seek(ts.start_sec, true);
      }
    }
  };

  const isUnmastered = mixStage === 'unmastered_mix';

  // --- Metric 1: Loudness (LUFS) ---
  const lufsVal = report?.measurements?.integrated_loudness?.value;
  const lufsMin = isUnmastered ? -18.0 : -14.0;
  const lufsMax = isUnmastered ? -14.0 : -9.0;
  const lufsStatus =
    lufsVal === null || lufsVal === undefined
      ? { label: 'No Signal', color: 'text-zinc-500 dark:text-zinc-400' }
      : lufsVal >= lufsMin && lufsVal <= lufsMax
      ? { label: 'Within Target', color: 'text-[#3A7269] dark:text-teal-400' }
      : lufsVal > lufsMax
      ? { label: 'Too Loud', color: 'text-rose-700 dark:text-rose-400' }
      : { label: 'Too Quiet', color: 'text-amber-700 dark:text-amber-400' };

  // --- Metric 2: True Peak Headroom (dBTP) ---
  const tpVal = report?.measurements?.true_peak_max?.value;
  const tpTarget = isUnmastered ? -3.0 : -1.0;
  const tpStatus =
    tpVal === null || tpVal === undefined
      ? { label: 'No Signal', color: 'text-zinc-500 dark:text-zinc-400' }
      : tpVal <= tpTarget
      ? { label: 'Safe Ceiling', color: 'text-[#3A7269] dark:text-teal-400' }
      : { label: 'Clipping Risk', color: 'text-rose-700 dark:text-rose-400' };

  // --- Metric 3: Mono & Phase Safety ---
  const isMono = report ? report.file_metadata.channels === 1 : false;
  const phaseCorr = report?.measurements?.phase_correlation_mean?.value;
  const phaseMin = report?.measurements?.phase_correlation_min?.value;
  const phaseStatus = isMono
    ? { label: 'Mono Safe', color: 'text-[#3A7269] dark:text-teal-400' }
    : phaseMin !== null && phaseMin !== undefined && phaseMin < 0.0
    ? { label: 'Phase Cancellation', color: 'text-rose-700 dark:text-rose-400' }
    : phaseCorr !== null && phaseCorr !== undefined && phaseCorr >= 0.2
    ? { label: 'Mono Safe', color: 'text-[#3A7269] dark:text-teal-400' }
    : { label: 'Check Phase', color: 'text-amber-700 dark:text-amber-400' };

  // --- Metric 4: Crest / Dynamics ---
  const crestVal = report?.measurements?.crest_factor?.value;
  const crestStatus =
    crestVal === null || crestVal === undefined
      ? { label: 'No Signal', color: 'text-zinc-500 dark:text-zinc-400' }
      : crestVal >= 8.0 && crestVal <= 18.0
      ? { label: 'Balanced', color: 'text-[#3A7269] dark:text-teal-400' }
      : crestVal < 8.0
      ? { label: 'Compressed', color: 'text-amber-700 dark:text-amber-400' }
      : { label: 'Wide Dynamics', color: 'text-[#3A7269] dark:text-teal-400' };

  // Max 3 prioritized action cards
  const topRecommendations = report ? report.recommendations.slice(0, 3) : [];

  return (
    <div className="space-y-6">
      {/* Header & Controls Section */}
      <section
        aria-label="Simple Mix Check Configuration"
        className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-6"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              Simple Mix Check
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Upload your mix or master bounce for clear DSP metrics, spectral balance, and prioritized DAW steps.
            </p>
          </div>
          <button
            type="button"
            onClick={onSwitchToAdvanced}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#3A7269] dark:text-teal-400 hover:underline shrink-0 whitespace-nowrap"
          >
            <span>Open Advanced Workbench</span>
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
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-[#FAFAFA] dark:bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#3A7269]"
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
                    className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors text-center whitespace-nowrap ${
                      active
                        ? 'border-[#3A7269] bg-[#3A7269] text-white dark:border-teal-600 dark:bg-teal-700 font-semibold'
                        : 'border-zinc-300 bg-[#FAFAFA] text-zinc-700 hover:bg-[#F5F5F7] dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300'
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
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`flex-1 flex items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2 text-xs cursor-pointer transition-colors truncate ${
                  isDragOver
                    ? 'border-[#3A7269] bg-[#3A7269]/10 text-teal-900 dark:text-teal-200'
                    : selectedFile
                    ? 'border-[#3A7269] dark:border-teal-600 bg-[#FAFAFA] dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200'
                    : 'border-zinc-300 dark:border-zinc-700 bg-[#FAFAFA] dark:bg-zinc-950 text-zinc-500 hover:border-[#3A7269]'
                }`}
              >
                <span className="truncate font-mono">
                  {selectedFile ? selectedFile.name : 'Choose Audio File (.wav, .flac, .aiff, .mp3)'}
                </span>
                <span className="inline-flex items-center gap-1 font-semibold text-[#3A7269] dark:text-teal-400 shrink-0">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{selectedFile ? 'Change' : 'Browse'}</span>
                </span>
              </label>

              {selectedFile && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleReAnalyze}
                    disabled={isAnalyzing}
                    className="px-3 py-2 rounded-lg bg-[#3A7269] hover:bg-[#2F5E56] text-white text-xs font-semibold transition-colors disabled:opacity-50 inline-flex items-center gap-1 whitespace-nowrap"
                    title="Re-run DSP analysis with current genre/stage targets"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Re-Analyze</span>
                  </button>
                  {onClearFile && (
                    <button
                      type="button"
                      onClick={onClearFile}
                      disabled={isAnalyzing}
                      className="px-2.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium transition-colors inline-flex items-center gap-1 whitespace-nowrap"
                      title="Clear and upload another track"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Clear</span>
                    </button>
                  )}
                </div>
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

      {/* Animated DSP Analysis Loading Screen */}
      {isAnalyzing && (
        <DspAnalysisLoadingScreen
          fileName={selectedFile?.name || 'Uploaded Audio'}
          fileSizeBytes={selectedFile?.size || 0}
          genre={genre}
          progressPercent={analysisProgress}
          stageIndex={analysisStageIndex}
        />
      )}

      {/* Clean Empty State Prompt Card (When no audio file has been analyzed yet) */}
      {!report && !isAnalyzing && (
        <section
          role="region"
          aria-label="No Audio Loaded"
          data-testid="simple-empty-state"
          className="border border-dashed border-zinc-300 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900/60 p-12 text-center space-y-4"
        >
          <div className="w-14 h-14 rounded-full bg-[#3A7269]/10 dark:bg-teal-950/60 text-[#3A7269] dark:text-teal-400 mx-auto flex items-center justify-center">
            <Volume2 className="w-7 h-7" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              No Audio Loaded Yet
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Select your genre, choose Unmastered Mix or Final Master, and upload your audio bounce (.WAV, .FLAC, .AIFF, or .MP3) above to run real mathematical DSP analysis.
            </p>
          </div>
        </section>
      )}

      {/* Main Analysis Results */}
      {report && !isAnalyzing && (
        <>
          {/* Active Track Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-[#F5F5F7] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs">
            <div className="flex flex-wrap items-center gap-2 text-zinc-800 dark:text-zinc-200 font-mono tabular-nums">
              <FileAudio className="w-4 h-4 text-[#3A7269] dark:text-teal-400 shrink-0" />
              <span className="font-semibold">{report.file_metadata.filename}</span>
              <span className="text-zinc-400" aria-hidden="true">·</span>
              <span className="text-zinc-500 dark:text-zinc-400">
                {report.file_metadata.duration_seconds.toFixed(1)}s ·{' '}
                {(report.file_metadata.file_size_bytes / (1024 * 1024)).toFixed(1)} MB ·{' '}
                {report.file_metadata.sample_rate_hz} Hz ·{' '}
                {report.file_metadata.channels === 1 ? 'Mono' : 'Stereo'}
              </span>
            </div>
            {onClearFile && (
              <button
                type="button"
                onClick={onClearFile}
                className="px-2.5 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium transition-colors inline-flex items-center gap-1 shrink-0 whitespace-nowrap"
              >
                <X className="w-3 h-3" />
                <span>Clear Track</span>
              </button>
            )}
          </div>

          {/* 60fps Canvas Waveform & Clickable Issue Markers */}
          <WaveformInspector
            durationSeconds={report.file_metadata.duration_seconds}
            issues={report.issues}
            activeIssueId={activeIssueId}
            activeTimestamp={activeTimestamp}
            onSelectTimestamp={(issueId, ts) => {
              setActiveIssueId(issueId);
              setActiveTimestamp(ts);
            }}
            timeline={report.timeline}
            showTransportBar
          />

          {/* SECTION A — 4-Metric Quick Scorecard */}
          <section
            aria-label="Mix Quick Diagnostics Scorecard"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {/* 1. Loudness */}
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-4">
              <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span className="font-medium">Integrated Loudness</span>
                <Volume2 className="w-4 h-4 text-[#3A7269] dark:text-teal-400" />
              </div>
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-2 font-mono tabular-nums">
                {lufsVal !== null && lufsVal !== undefined ? `${lufsVal.toFixed(1)} LUFS` : '—'}
              </div>
              <div className="flex items-center justify-between text-xs mt-2 text-zinc-500 dark:text-zinc-400">
                <span className="font-mono tabular-nums">Target {lufsMin} to {lufsMax}</span>
                <span className={`font-semibold ${lufsStatus.color}`}>{lufsStatus.label}</span>
              </div>
            </div>

            {/* 2. True Peak Headroom */}
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-4">
              <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span className="font-medium">True Peak Headroom</span>
                <Activity className="w-4 h-4 text-[#3A7269] dark:text-teal-400" />
              </div>
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-2 font-mono tabular-nums">
                {tpVal !== null && tpVal !== undefined ? `${tpVal.toFixed(1)} dBTP` : '—'}
              </div>
              <div className="flex items-center justify-between text-xs mt-2 text-zinc-500 dark:text-zinc-400">
                <span className="font-mono tabular-nums">Ceiling ≤ {tpTarget.toFixed(1)}</span>
                <span className={`font-semibold ${tpStatus.color}`}>{tpStatus.label}</span>
              </div>
            </div>

            {/* 3. Mono & Phase Safety */}
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-4">
              <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span className="font-medium">Mono &amp; Phase Safety</span>
                <Layers className="w-4 h-4 text-[#3A7269] dark:text-teal-400" />
              </div>
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-2 font-mono tabular-nums">
                {isMono
                  ? 'Mono'
                  : phaseCorr !== null && phaseCorr !== undefined
                  ? `${phaseCorr >= 0 ? '+' : ''}${phaseCorr.toFixed(2)}`
                  : '—'}
              </div>
              <div className="flex items-center justify-between text-xs mt-2 text-zinc-500 dark:text-zinc-400">
                <span>Phase correlation</span>
                <span className={`font-semibold ${phaseStatus.color}`}>{phaseStatus.label}</span>
              </div>
            </div>

            {/* 4. Crest / Dynamics */}
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-4">
              <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span className="font-medium">Crest / Dynamics</span>
                <Sliders className="w-4 h-4 text-[#3A7269] dark:text-teal-400" />
              </div>
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-2 font-mono tabular-nums">
                {crestVal !== null && crestVal !== undefined ? `${crestVal.toFixed(1)} dB` : '—'}
              </div>
              <div className="flex items-center justify-between text-xs mt-2 text-zinc-500 dark:text-zinc-400">
                <span>Peak-to-RMS ratio</span>
                <span className={`font-semibold ${crestStatus.color}`}>{crestStatus.label}</span>
              </div>
            </div>
          </section>

          {/* SECTION B — Spectral Tonal Balance Graph (Directly between Scorecard & Action Plan) */}
          <SpectralTonalBalanceGraph
            report={report}
            genre={genre}
            mixStage={mixStage}
            measuredSixBands={audioState.primarySixBands}
            variant="simple"
            onSelectFlaggedIssue={handleFocusIssue}
          />

          {/* SECTION C — Prioritized Mix Action Plan (Max 3 Cards) */}
          <section
            aria-label="Prioritized Mix Action Plan"
            className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-6 space-y-4"
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
                const isHighlighted = activeIssueId === rec.linked_issue_id;

                const priorityLabel =
                  rec.priority_rank === 1
                    ? 'Priority 01'
                    : rec.priority_rank === 2
                    ? 'Priority 02'
                    : 'Priority 03';

                const priorityTextColor =
                  rec.priority_rank === 1
                    ? 'text-rose-700 dark:text-rose-400'
                    : rec.priority_rank === 2
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-[#3A7269] dark:text-teal-400';

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
                    className={`border rounded-lg p-5 transition-colors space-y-3 ${
                      isHighlighted
                        ? 'border-[#3A7269] dark:border-teal-500 bg-[#3A7269]/[0.03] dark:bg-teal-950/20'
                        : 'border-zinc-200 dark:border-zinc-800 bg-[#FAFAFA] dark:bg-zinc-950/30'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className={`font-mono font-semibold ${priorityTextColor}`}>
                            {priorityLabel}
                          </span>
                          <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">·</span>
                          <span className="text-zinc-500 dark:text-zinc-400">
                            {rec.classification === 'objective_technical'
                              ? 'Technical Warning'
                              : 'Stylistic Suggestion'}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-1">
                          {rec.action_title}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {linkedIssue?.timestamps?.[0] && (
                          <button
                            type="button"
                            onClick={() => handleFocusIssue(linkedIssue.issue_id)}
                            className="px-2.5 py-1.5 rounded-md text-xs font-medium border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap"
                          >
                            Audition Cue
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleVerificationStep(rec.recommendation_id)}
                          aria-pressed={isDone}
                          className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                            isDone
                              ? 'bg-[#3A7269] text-white border-[#3A7269] dark:bg-teal-600 dark:border-teal-600'
                              : 'bg-white text-zinc-800 border-zinc-300 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-200 dark:border-zinc-700'
                          }`}
                        >
                          {isDone ? 'Verified in DAW' : 'Mark Verified'}
                        </button>
                      </div>
                    </div>

                    {/* Detected Metric (1 line) */}
                    <p className="text-xs text-zinc-700 dark:text-zinc-300">
                      <strong className="text-zinc-900 dark:text-zinc-100 font-semibold mr-1.5">
                        Detected:
                      </strong>
                      {detectedLine}
                    </p>

                    {/* DAW Fix (1 short sentence) */}
                    <p className="text-xs text-teal-950 dark:text-teal-200 font-medium bg-[#3A7269]/[0.07] dark:bg-teal-950/40 p-2.5 rounded-md border border-[#3A7269]/20 dark:border-teal-900/60">
                      <strong className="text-[#3A7269] dark:text-teal-300 font-semibold mr-1.5">
                        DAW Fix:
                      </strong>
                      {dawFixLine}
                    </p>

                    {/* Collapsible Details: Why this matters & how to check */}
                    <details open={idx === 0} className="text-xs text-zinc-600 dark:text-zinc-400 pt-1 group">
                      <summary className="text-xs text-[#3A7269] dark:text-teal-400 hover:underline cursor-pointer font-medium select-none">
                        Why this matters &amp; how to check
                      </summary>
                      <div className="pt-2.5 space-y-2 border-t border-zinc-200 dark:border-zinc-800 mt-2 text-xs">
                        <p>
                          <strong className="text-zinc-800 dark:text-zinc-200">What was detected:</strong>{' '}
                          {detectedLine}
                        </p>
                        <p>
                          <strong className="text-zinc-800 dark:text-zinc-200">Why it matters:</strong>{' '}
                          {linkedIssue?.learning_guide.why_it_matters ||
                            'Addressing this ensures clean translation across consumer listening systems.'}
                        </p>
                        <p>
                          <strong className="text-[#3A7269] dark:text-teal-400">What to try in your DAW:</strong>{' '}
                          {dawFixLine}
                        </p>
                        <p>
                          <strong className="text-zinc-800 dark:text-zinc-200">How to verify the change:</strong>{' '}
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

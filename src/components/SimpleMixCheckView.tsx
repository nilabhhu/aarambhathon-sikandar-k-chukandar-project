import React, { useState } from 'react';
import {
  AnalysisReport,
  ConsentState,
  GenreId,
  MixStage,
} from '../contracts/analysisContract';
import { GENRE_LABELS, MIX_STAGE_LABELS } from '../contracts/demoFixtures';
import { WaveformInspector, formatTimecode } from './WaveformInspector';
import {
  Upload,
  CheckCircle2,
  AlertCircle,
  Sliders,
  ArrowRight,
  Shield,
  X,
  Volume2,
  Activity,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface SimpleMixCheckViewProps {
  report: AnalysisReport;
  reportSource?: 'backend' | 'offline_fallback';
  genre: GenreId;
  mixStage: MixStage;
  consent: ConsentState;
  onChangeGenre: (genre: GenreId) => void;
  onChangeMixStage: (stage: MixStage) => void;
  onUploadFileMetadata?: (meta: {
    filename: string;
    fileSize: number;
    durationSec?: number;
    sampleRate?: 44100 | 48000 | 88200 | 96000 | 192000;
  }) => void;
  onAnalyzeAudioFile?: (file: File) => void;
  onSwitchToAdvanced: () => void;
  audioFile?: File | null;
  selectedFile?: File | null;
  onSelectFile?: (file: File) => void;
  onClearFile?: () => void;
  analysisStage?: 'idle' | 'selected' | 'uploading' | 'analyzing' | 'complete' | 'failed';
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
  audioFile = null,
  selectedFile = null,
  onSelectFile,
  onClearFile,
  analysisStage = 'idle',
  errorMessage = null,
  onCancelAnalysis,
  onLoadDemonstration,
}) => {
  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({});
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({
    '0': true, // Keep first card open by default for learning flow
  });
  const [showStylisticNotes, setShowStylisticNotes] = useState<boolean>(false);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(
    report.issues[0]?.issue_id ?? null
  );
  const [activeTimestamp, setActiveTimestamp] = useState<{
    start_sec: number;
    end_sec: number;
    label: string;
  } | null>(report.issues[0]?.timestamps[0] ?? null);
  const [monoMode, setMonoMode] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (onSelectFile) {
      onSelectFile(file);
    } else if (onAnalyzeAudioFile) {
      onAnalyzeAudioFile(file);
    }
  };

  const handleTriggerAnalysis = () => {
    const fileToAnalyze = selectedFile || audioFile;
    if (fileToAnalyze && onAnalyzeAudioFile) {
      onAnalyzeAudioFile(fileToAnalyze);
    }
  };

  const toggleVerificationStep = (id: string) => {
    setCheckedSteps((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleCardExpansion = (indexStr: string) => {
    setExpandedCards((prev) => ({ ...prev, [indexStr]: !prev[indexStr] }));
  };

  const isProcessing = analysisStage === 'uploading' || analysisStage === 'analyzing';
  const isUnmastered = mixStage === 'unmastered_mix';

  // Extract Key 4 Summary Metrics
  const integratedLufs = report.measurements?.integrated_loudness?.value;
  const targetLufsText = isUnmastered ? '-18.0 to -14.0 LUFS' : '-14.0 to -9.0 LUFS';
  const lufsStatus =
    integratedLufs === null
      ? 'No Signal'
      : isUnmastered
      ? integratedLufs >= -18.0 && integratedLufs <= -14.0
        ? 'Optimal'
        : integratedLufs > -14.0
        ? 'Hot Mix'
        : 'Low Level'
      : integratedLufs >= -14.0 && integratedLufs <= -9.0
      ? 'Optimal'
      : integratedLufs > -9.0
      ? 'Very Loud'
      : 'Quiet Master';

  const truePeak = report.measurements?.true_peak_max?.value;
  const targetTp = isUnmastered ? -3.0 : -1.0;
  const truePeakStatus =
    truePeak === null
      ? 'No Signal'
      : truePeak <= targetTp
      ? 'Safe Headroom'
      : truePeak > 0.0
      ? 'Inter-sample Clipping'
      : 'Ceiling Exceeded';

  const phaseCorr = report.measurements?.phase_correlation_mean?.value;
  const phaseMin = report.measurements?.phase_correlation_min?.value;
  const isMono = report.file_metadata.channels === 1;
  const monoSafetyText = isMono
    ? 'Mono Signal (Safe)'
    : phaseMin !== null && phaseMin < 0.0
    ? `Phase Risk (${phaseMin.toFixed(2)})`
    : phaseCorr !== null && phaseCorr >= 0.2
    ? `Mono Safe (+${phaseCorr.toFixed(2)})`
    : 'Check Polarity';

  const mudBand = report.measurements?.mud_band_energy_200_500hz?.value;
  const subBass = report.measurements?.sub_bass_energy_20_60hz?.value;
  const tonalStatus =
    mudBand !== null && mudBand > -20.0
      ? 'Low-Mid Mud Detected'
      : subBass !== null && subBass > -20.0
      ? 'Heavy Low-End'
      : 'Balanced Spectrum';

  // Limit action plan to max 3 prioritized cards
  const topRecommendations = report.recommendations.slice(0, 3);
  const stylisticIssues = report.issues.filter(
    (i) => i.classification === 'subjective_stylistic'
  );

  return (
    <div className="space-y-8">
      {/* Clean Educational Disclosure Banner */}
      <div
        role="status"
        data-testid="demo-data-banner-simple"
        className={`border rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3 ${
          !report.is_demonstration_data
            ? 'border-emerald-700/30 bg-emerald-50/70 dark:bg-emerald-950/30 dark:border-emerald-500/30'
            : 'border-teal-800/30 dark:border-teal-500/30 bg-teal-50/70 dark:bg-teal-950/30'
        }`}
      >
        <div className="text-xs text-zinc-800 dark:text-zinc-200">
          <span
            className={`font-semibold ${
              !report.is_demonstration_data
                ? 'text-emerald-900 dark:text-emerald-300 font-mono'
                : 'text-teal-900 dark:text-teal-300 font-mono'
            }`}
          >
            {!report.is_demonstration_data
              ? '[LIVE AUDIO ANALYSIS · MATHEMATICAL DSP]'
              : reportSource === 'backend'
              ? '[DEMONSTRATION DATA · PHASE 1 FASTAPI BACKEND FIXTURE]'
              : '[DEMONSTRATION DATA · PHASE 1 OFFLINE LOCAL FIXTURE]'}
          </span>{' '}
          {!report.is_demonstration_data
            ? 'Real digital signal processing calculated directly from your uploaded song. Zero artificial estimation.'
            : report.data_source_notice}
        </div>
      </div>

      {/* Step 1 & 2 & 3: Input Context Controls */}
      <section
        aria-label="Simple Mix Check Configuration"
        className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-6 shadow-xs"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-4 pb-5 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <p className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
              INTERFACE 01 · BEGINNER LEARNING WORKFLOW
            </p>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
              Simple Mix Check
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
              Select your genre and mix stage, choose your audio bounce, and receive plain-language guidance without confusing graphs.
            </p>
          </div>
          <button
            type="button"
            onClick={onSwitchToAdvanced}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-800 dark:text-teal-400 hover:underline whitespace-nowrap shrink-0"
          >
            <span>Need full LUFS, true peak & spectral meters? Switch to Advanced Mix Check</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          {/* 1. Select Music Genre */}
          <div>
            <label
              htmlFor="simple-genre-select"
              className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-2"
            >
              1. Select Music Genre
            </label>
            <select
              id="simple-genre-select"
              value={genre}
              onChange={(e) => onChangeGenre(e.target.value as GenreId)}
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-700"
            >
              {(Object.keys(GENRE_LABELS) as GenreId[]).map((gKey) => (
                <option key={gKey} value={gKey}>
                  {GENRE_LABELS[gKey]}
                </option>
              ))}
            </select>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
              Sets tonal and dynamic targets without masking technical clipping or phase defects.
            </p>
          </div>

          {/* 2. Select Unmastered Mix or Final Master */}
          <div>
            <span className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-2">
              2. Select Audio Stage
            </span>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Select Audio Stage">
              {(['unmastered_mix', 'final_master'] as MixStage[]).map((stage) => {
                const active = mixStage === stage;
                return (
                  <button
                    key={stage}
                    type="button"
                    onClick={() => onChangeMixStage(stage)}
                    aria-pressed={active}
                    className={`px-3 py-2.5 rounded-md border text-left transition-colors ${
                      active
                        ? 'border-teal-800 bg-teal-800 text-white dark:border-teal-600 dark:bg-teal-700'
                        : 'border-zinc-300 bg-zinc-50 text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200'
                    }`}
                  >
                    <div className="text-xs font-semibold whitespace-nowrap">
                      {MIX_STAGE_LABELS[stage].title}
                    </div>
                    <div
                      className={`text-[11px] mt-0.5 line-clamp-1 ${
                        active ? 'text-teal-100' : 'text-zinc-500 dark:text-zinc-400'
                      }`}
                    >
                      {stage === 'unmastered_mix' ? 'Pre-limiter bounce' : 'Release-ready master'}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 font-mono tabular-nums">
              Headroom target: {MIX_STAGE_LABELS[mixStage].headroomTarget}
            </p>
          </div>

          {/* 3. Upload Song & Separate Analyze Step */}
          <div>
            <label
              htmlFor="simple-audio-upload"
              className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-2"
            >
              3. Select Audio File (WAV, FLAC, AIFF, MP3, OGG)
            </label>

            <label
              htmlFor="simple-audio-upload"
              className="flex items-center justify-between gap-3 w-full rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3.5 py-2.5 text-xs text-zinc-700 dark:text-zinc-300 hover:border-teal-700 cursor-pointer transition-colors"
            >
              <span className="truncate font-mono">
                {selectedFile ? selectedFile.name : report.file_metadata.filename}
              </span>
              <span className="inline-flex items-center gap-1 font-medium text-teal-800 dark:text-teal-400 shrink-0">
                <Upload className="w-3.5 h-3.5" />
                <span>{selectedFile ? 'Change File' : 'Choose File'}</span>
              </span>
            </label>
            <input
              id="simple-audio-upload"
              type="file"
              accept=".wav,.flac,.aiff,.mp3,.ogg,audio/*"
              onChange={handleFileChange}
              className="sr-only"
              disabled={isProcessing}
            />

            {/* File Selected State */}
            {selectedFile && (
              <div className="mt-3 p-3 rounded bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate max-w-[180px]">
                    {selectedFile.name}
                  </span>
                  <span className="text-zinc-500 shrink-0">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </div>

                <div className="flex items-start gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-400">
                  <Shield className="w-3.5 h-3.5 text-teal-700 shrink-0 mt-0.5" />
                  <span>
                    <strong>Privacy Notice:</strong> Audio is processed ephemerally using client Web Audio & server DSP and is never used for training.
                  </span>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleTriggerAnalysis}
                    disabled={isProcessing}
                    className="flex-1 px-3 py-2 rounded bg-teal-800 hover:bg-teal-900 text-white text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {isProcessing ? 'Analyzing...' : 'Analyze with Mathematical DSP'}
                  </button>

                  {onClearFile && (
                    <button
                      type="button"
                      onClick={onClearFile}
                      disabled={isProcessing}
                      className="p-2 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors"
                      title="Clear selected file"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* In-flight Analysis Progress */}
            {isProcessing && (
              <div className="mt-3 p-3 rounded bg-teal-50/80 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 space-y-2">
                <div className="flex items-center justify-between text-xs text-teal-900 dark:text-teal-200">
                  <span className="font-semibold">
                    {analysisStage === 'uploading' ? 'Streaming audio upload...' : 'Running Phase 2 DSP Analysis...'}
                  </span>
                  {onCancelAnalysis && (
                    <button
                      type="button"
                      onClick={onCancelAnalysis}
                      className="text-xs text-red-700 dark:text-red-400 hover:underline font-mono"
                    >
                      Cancel
                    </button>
                  )}
                </div>
                <div className="w-full bg-teal-200 dark:bg-teal-900 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-teal-700 h-full w-2/3 animate-pulse rounded-full" />
                </div>
              </div>
            )}

            {/* Beginner-friendly Error Message */}
            {errorMessage && (
              <div className="mt-3 p-2.5 rounded bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-800 dark:text-red-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Audio analysis issue: {errorMessage}</span>
              </div>
            )}

            {/* Option to load demonstration data */}
            {onLoadDemonstration && !selectedFile && (
              <div className="mt-2 text-right">
                <button
                  type="button"
                  onClick={onLoadDemonstration}
                  className="text-[11px] text-teal-800 dark:text-teal-400 hover:underline font-mono"
                >
                  View demonstration fixture instead →
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Audio Waveform & Cue Player Section */}
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
        isUnmastered={mixStage === 'unmastered_mix'}
        timeline={report.timeline}
        isDemonstrationData={report.is_demonstration_data}
        audioFile={audioFile || selectedFile}
      />

      {/* Clean 4-Metric Top Summary Strip */}
      <section
        aria-label="Mix Quick Diagnostics Summary"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {/* 1. Loudness */}
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-semibold uppercase tracking-wider">Loudness (LUFS)</span>
            <Volume2 className="w-4 h-4 text-teal-700 dark:text-teal-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-2 font-mono">
            {integratedLufs !== null && integratedLufs !== undefined ? `${integratedLufs.toFixed(1)} LUFS` : '—'}
          </div>
          <div className="flex items-center justify-between text-xs mt-2 text-zinc-600 dark:text-zinc-400">
            <span>Target: {targetLufsText}</span>
            <span
              className={`font-semibold ${
                lufsStatus === 'Optimal'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-amber-700 dark:text-amber-400'
              }`}
            >
              {lufsStatus}
            </span>
          </div>
        </div>

        {/* 2. Headroom / True Peak */}
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-semibold uppercase tracking-wider">Headroom / True Peak</span>
            <Activity className="w-4 h-4 text-teal-700 dark:text-teal-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-2 font-mono">
            {truePeak !== null && truePeak !== undefined ? `${truePeak.toFixed(1)} dBTP` : '—'}
          </div>
          <div className="flex items-center justify-between text-xs mt-2 text-zinc-600 dark:text-zinc-400">
            <span>Ceiling: &lt; {targetTp.toFixed(1)} dBTP</span>
            <span
              className={`font-semibold ${
                truePeakStatus === 'Safe Headroom'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-red-700 dark:text-red-400'
              }`}
            >
              {truePeakStatus}
            </span>
          </div>
        </div>

        {/* 3. Low-End Mono Safety */}
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-semibold uppercase tracking-wider">Mono Compatibility</span>
            <Layers className="w-4 h-4 text-teal-700 dark:text-teal-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-2 font-mono">
            {monoSafetyText}
          </div>
          <div className="flex items-center justify-between text-xs mt-2 text-zinc-600 dark:text-zinc-400">
            <span>Phase correlation</span>
            <span
              className={`font-semibold ${
                monoSafetyText.includes('Safe')
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-amber-700 dark:text-amber-400'
              }`}
            >
              {monoSafetyText.includes('Safe') ? 'Passed' : 'Needs Check'}
            </span>
          </div>
        </div>

        {/* 4. Tonal Balance */}
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-semibold uppercase tracking-wider">Tonal Balance</span>
            <Sliders className="w-4 h-4 text-teal-700 dark:text-teal-400" />
          </div>
          <div className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-2">
            {tonalStatus}
          </div>
          <div className="flex items-center justify-between text-xs mt-2 text-zinc-600 dark:text-zinc-400">
            <span>Genre: {GENRE_LABELS[genre]}</span>
            <span
              className={`font-semibold ${
                tonalStatus === 'Balanced Spectrum'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-amber-700 dark:text-amber-400'
              }`}
            >
              {tonalStatus === 'Balanced Spectrum' ? 'Good' : 'Review'}
            </span>
          </div>
        </div>
      </section>

      {!consent.audio_analysis_consent ? (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-8 text-center bg-zinc-50 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Audio Analysis Permission is currently disabled. Enable Permission 1 in the Privacy Gate to view mix findings.
          </p>
        </div>
      ) : (
        <>
          {/* Streamlined Prioritized Action Plan (Max 3 Cards) */}
          <section
            aria-label="Prioritized Plain-Language Action Plan"
            className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-6 shadow-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-zinc-200 dark:border-zinc-800">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  Prioritized Action Plan ({topRecommendations.length} Key Steps)
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Top technical recommendations ranked by impact. Complete each step in your DAW bounce.
                </p>
              </div>
              <div className="text-xs font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                Completed: {Object.values(checkedSteps).filter(Boolean).length} / {topRecommendations.length}
              </div>
            </div>

            <div className="space-y-4 mt-4">
              {topRecommendations.map((rec, idx) => {
                const isDone = !!checkedSteps[rec.recommendation_id];
                const isExpanded = !!expandedCards[idx.toString()];
                const linkedIssue = report.issues.find((i) => i.issue_id === rec.linked_issue_id);

                // Priority Badge Color
                const badgeLabel =
                  rec.priority_rank === 1
                    ? '🔴 High Priority'
                    : rec.priority_rank === 2
                    ? '🟡 Medium Priority'
                    : '🟢 Optimization';

                return (
                  <article
                    key={rec.recommendation_id}
                    className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 bg-zinc-50/50 dark:bg-zinc-950/40 transition-colors"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2 text-xs font-mono">
                          <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                            {badgeLabel}
                          </span>
                          <span aria-hidden="true" className="text-zinc-400">·</span>
                          <span className="text-zinc-500 dark:text-zinc-400">
                            {rec.classification === 'objective_technical'
                              ? 'Technical Defect'
                              : 'Stylistic Suggestion'}
                          </span>
                        </div>
                        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                          {rec.action_title}
                        </h3>

                        {/* 1. What was detected */}
                        <div className="text-xs text-zinc-700 dark:text-zinc-300">
                          <span className="font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider text-[10px] mr-1">
                            WHAT WAS DETECTED:
                          </span>
                          <span>
                            {linkedIssue?.learning_guide.what_was_detected || rec.beginner_summary}
                          </span>
                        </div>

                        {/* 3. What to try in your DAW */}
                        <div className="text-xs text-teal-800 dark:text-teal-300 font-medium">
                          <span className="font-semibold text-teal-600 dark:text-teal-400 uppercase tracking-wider text-[10px] mr-1">
                            WHAT TO TRY IN YOUR DAW:
                          </span>
                          <span>
                            {linkedIssue?.learning_guide.what_to_try || rec.advanced_dsp_guidance}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-row md:flex-col items-end gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleVerificationStep(rec.recommendation_id)}
                          aria-pressed={isDone}
                          className={`px-3.5 py-2 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                            isDone
                              ? 'bg-teal-800 text-white border-teal-800 dark:bg-teal-600 dark:border-teal-600'
                              : 'bg-white text-zinc-800 border-zinc-300 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-200 dark:border-zinc-700'
                          }`}
                        >
                          {isDone ? '✓ Verified in Revised Bounce' : 'Mark Change Verified'}
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleCardExpansion(idx.toString())}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-800 dark:text-teal-400 hover:underline"
                        >
                          <span>{isExpanded ? 'Hide Details' : 'Show Why & How to Verify'}</span>
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Collapsible Accordion: Why It Matters & How to Verify */}
                    {isExpanded && linkedIssue && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 mt-4 border-t border-zinc-200 dark:border-zinc-800 text-xs">
                        <div className="bg-white dark:bg-zinc-900 p-3.5 rounded border border-zinc-200 dark:border-zinc-800">
                          <h4 className="font-semibold uppercase tracking-wider text-[10px] text-zinc-500 dark:text-zinc-400">
                            2. WHY IT MATTERS
                          </h4>
                          <p className="text-zinc-800 dark:text-zinc-200 mt-1 leading-relaxed">
                            {linkedIssue.learning_guide.why_it_matters}
                          </p>
                        </div>

                        <div className="bg-white dark:bg-zinc-900 p-3.5 rounded border border-zinc-200 dark:border-zinc-800">
                          <h4 className="font-semibold uppercase tracking-wider text-[10px] text-teal-700 dark:text-teal-400">
                            4. HOW TO VERIFY THE CHANGE
                          </h4>
                          <p className="text-zinc-800 dark:text-zinc-200 mt-1 leading-relaxed">
                            {linkedIssue.learning_guide.how_to_verify}
                          </p>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          {/* Collapsible Drawer: Optional Genre & Stylistic Notes */}
          {stylisticIssues.length > 0 && (
            <section
              aria-label="Optional Stylistic Notes"
              className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 shadow-xs overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setShowStylisticNotes((s) => !s)}
                className="w-full flex items-center justify-between p-5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Sliders className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    View Optional Genre &amp; Stylistic Notes for {GENRE_LABELS[genre]} ({stylisticIssues.length})
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <span>{showStylisticNotes ? 'Collapse' : 'Expand'}</span>
                  {showStylisticNotes ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </div>
              </button>

              {showStylisticNotes && (
                <div className="p-5 pt-0 border-t border-zinc-200 dark:border-zinc-800 space-y-4">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Rule 8: Subjective creative observations. These are optional artistic choices to evaluate by ear rather than technical mix defects.
                  </p>
                  <div className="grid grid-cols-1 gap-4">
                    {stylisticIssues.map((issue) => (
                      <div
                        key={issue.issue_id}
                        className="p-4 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">
                            {issue.title}
                          </h4>
                          <span className="font-mono text-[11px] text-zinc-500">
                            {issue.timestamps
                              .map((t) => `${formatTimecode(t.start_sec)}–${formatTimecode(t.end_sec)}`)
                              .join(', ')}
                          </span>
                        </div>
                        <p className="text-zinc-700 dark:text-zinc-300">
                          <strong>Observation:</strong> {issue.learning_guide.what_was_detected}
                        </p>
                        <p className="text-teal-800 dark:text-teal-300">
                          <strong>Artistic Alternative:</strong> {issue.learning_guide.what_to_try}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
};

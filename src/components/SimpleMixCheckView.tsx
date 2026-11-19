import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AnalysisReport,
  ArtistVisionTag,
  ConsentState,
  GenreId,
  MixStage,
} from '../contracts/analysisContract';
import { GENRE_LABELS, MIX_STAGE_LABELS } from '../contracts/demoFixtures';
import { useStudioAudioEngine, useStudioAudioState } from '../audio/StudioAudioContext';
import { WaveformInspector } from './WaveformInspector';
import { SpectralTonalBalanceGraph } from './SpectralTonalBalanceGraph';
import { DspAnalysisLoadingScreen } from './DspAnalysisLoadingScreen';
import { AiMentorPanel } from './AiMentorPanel';
import {
  STUDIO_EASE,
  STUDIO_SPRING,
  TACTILE_TAP,
} from '../lib/motion';
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
  ChevronDown,
} from 'lucide-react';

interface SimpleMixCheckViewProps {
  report: AnalysisReport | null;
  reportSource?: 'backend' | 'offline_fallback';
  genre: GenreId;
  mixStage: MixStage;
  consent: ConsentState;
  onChangeConsent?: (next: ConsentState) => void;
  artistVision?: ArtistVisionTag[];
  onChangeArtistVision?: (next: ArtistVisionTag[]) => void;
  onChangeGenre: (genre: GenreId) => void;
  onChangeMixStage: (stage: MixStage) => void;
  onAnalyzeAudioFile?: (file: File) => void;
  onLoadDemoTrack?: () => void;
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
  consent,
  onChangeConsent,
  artistVision: controlledArtistVision,
  onChangeArtistVision,
  onChangeGenre,
  onChangeMixStage,
  onAnalyzeAudioFile,
  onLoadDemoTrack,
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

  const [localArtistVision, setLocalArtistVision] = useState<ArtistVisionTag[]>([]);
  const artistVision = controlledArtistVision ?? localArtistVision;
  const setArtistVision = (next: ArtistVisionTag[]) => {
    if (onChangeArtistVision) {
      onChangeArtistVision(next);
    } else {
      setLocalArtistVision(next);
    }
  };

  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({});
  const [expandedGuides, setExpandedGuides] = useState<Record<string, boolean>>({});
  const [activeIssueId, setActiveIssueId] = useState<string | null>(
    report?.issues?.[0]?.issue_id ?? null
  );
  const [spectrumFlashNonce, setSpectrumFlashNonce] = useState<number>(0);
  const [activeTimestamp, setActiveTimestamp] = useState<{
    start_sec: number;
    end_sec: number;
    label: string;
  } | null>(report?.issues?.[0]?.timestamps?.[0] ?? null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Sync initial active marker & default open guide for the first recommendation
  useEffect(() => {
    const first = report?.issues?.[0];
    setActiveIssueId(first?.issue_id ?? null);
    setActiveTimestamp(first?.timestamps?.[0] ?? null);
    const firstRecId = report?.recommendations?.[0]?.recommendation_id;
    setExpandedGuides(firstRecId ? { [firstRecId]: true } : {});
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

  const toggleGuide = (id: string) => {
    setExpandedGuides((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleFocusIssue = (issueId: string) => {
    setActiveIssueId(issueId);
    setSpectrumFlashNonce((n) => n + 1);
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
      ? { label: 'No Signal', color: 'text-[var(--text-secondary)]' }
      : lufsVal >= lufsMin && lufsVal <= lufsMax
      ? { label: 'Within Target', color: 'text-[var(--status-safe)]' }
      : lufsVal > lufsMax
      ? { label: 'Too Loud', color: 'text-[var(--status-alert)]' }
      : { label: 'Too Quiet', color: 'text-[var(--status-caution)]' };

  // --- Metric 2: True Peak Headroom (dBTP) ---
  const tpVal = report?.measurements?.true_peak_max?.value;
  const tpTarget = isUnmastered ? -3.0 : -1.0;
  const tpStatus =
    tpVal === null || tpVal === undefined
      ? { label: 'No Signal', color: 'text-[var(--text-secondary)]' }
      : tpVal <= tpTarget
      ? { label: 'Safe Ceiling', color: 'text-[var(--status-safe)]' }
      : { label: 'Clipping Risk', color: 'text-[var(--status-alert)]' };

  // --- Metric 3: Mono & Phase Safety ---
  const isMono = report ? report.file_metadata.channels === 1 : false;
  const phaseCorr = report?.measurements?.phase_correlation_mean?.value;
  const phaseMin = report?.measurements?.phase_correlation_min?.value;
  const phaseStatus = isMono
    ? { label: 'Mono Safe', color: 'text-[var(--status-safe)]' }
    : phaseMin !== null && phaseMin !== undefined && phaseMin < 0.0
    ? { label: 'Phase Cancellation', color: 'text-[var(--status-alert)]' }
    : phaseCorr !== null && phaseCorr !== undefined && phaseCorr >= 0.2
    ? { label: 'Mono Safe', color: 'text-[var(--status-safe)]' }
    : { label: 'Check Phase', color: 'text-[var(--status-caution)]' };

  // --- Metric 4: Crest / Dynamics ---
  const crestVal = report?.measurements?.crest_factor?.value;
  const crestStatus =
    crestVal === null || crestVal === undefined
      ? { label: 'No Signal', color: 'text-[var(--text-secondary)]' }
      : crestVal >= 8.0 && crestVal <= 18.0
      ? { label: 'Balanced', color: 'text-[var(--status-safe)]' }
      : crestVal < 8.0
      ? { label: 'Compressed', color: 'text-[var(--status-caution)]' }
      : { label: 'Wide Dynamics', color: 'text-[var(--status-safe)]' };

  // Max 3 prioritized action cards
  const topRecommendations = report ? report.recommendations.slice(0, 3) : [];

  const viewStateKey = isAnalyzing ? 'analyzing' : report ? `report-${report.report_id}` : 'empty';

  return (
    <div className="space-y-6">
      {/* Header & Controls Section */}
      <section
        aria-label="Simple Mix Check Configuration"
        className="studio-elevated squircle-outer p-6"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-4 pb-4 studio-hairline-b">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              Simple Mix Check
            </h1>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Upload your mix or master bounce for clear DSP metrics, spectral balance, and prioritized DAW steps.
            </p>
          </div>
          <button
            type="button"
            onClick={onSwitchToAdvanced}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-primary)] hover:underline underline-offset-4 shrink-0 whitespace-nowrap cursor-pointer"
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
              className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5"
            >
              1. Genre
            </label>
            <select
              id="simple-genre-select"
              value={genre}
              onChange={(e) => onChangeGenre(e.target.value as GenreId)}
              className="w-full squircle-inner border border-[var(--border-hairline-color)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
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
            <span className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
              2. Stage
            </span>
            <div
              className="grid grid-cols-2 gap-1 p-1 bg-[var(--bg-surface)] squircle-inner border border-[var(--border-hairline-color)]"
              role="group"
              aria-label="Select Stage"
            >
              {(['unmastered_mix', 'final_master'] as MixStage[]).map((stage) => {
                const active = mixStage === stage;
                return (
                  <motion.button
                    key={stage}
                    type="button"
                    whileTap={TACTILE_TAP}
                    onClick={() => onChangeMixStage(stage)}
                    aria-pressed={active}
                    className={`relative px-3 py-1.5 squircle-inner text-xs font-medium transition-colors text-center whitespace-nowrap cursor-pointer ${
                      active
                        ? 'text-white font-semibold'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="simple-stage-pill"
                        transition={STUDIO_SPRING}
                        className="absolute inset-0 bg-[var(--accent-primary)] squircle-inner"
                      />
                    )}
                    <span className="relative z-10">{MIX_STAGE_LABELS[stage].title}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* 3. Audio File Selector & Re-Analyze Mix Trigger */}
          <div>
            <label
              htmlFor="simple-audio-upload"
              className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5"
            >
              3. Audio Bounce (WAV, FLAC, AIFF, MP3)
            </label>
            <div className="flex items-center gap-2">
              <label
                htmlFor="simple-audio-upload"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`flex-1 flex items-center justify-between gap-2 squircle-inner border border-dashed px-3 py-2 text-xs cursor-pointer transition-colors truncate ${
                  isDragOver
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                    : selectedFile
                    ? 'border-[var(--border-active-color)] bg-[var(--bg-surface)] text-[var(--text-primary)]'
                    : 'border-[var(--border-hairline-color)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--border-active-color)]'
                }`}
              >
                <span className="truncate font-mono">
                  {selectedFile ? selectedFile.name : 'Choose Audio File (.wav, .flac, .aiff, .mp3)'}
                </span>
                <span className="inline-flex items-center gap-1 font-semibold text-[var(--accent-primary)] shrink-0">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{selectedFile ? 'Change' : 'Browse'}</span>
                </span>
              </label>

              {selectedFile && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <motion.button
                    type="button"
                    whileTap={TACTILE_TAP}
                    onClick={handleReAnalyze}
                    disabled={isAnalyzing}
                    className="px-3 py-2 squircle-inner bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white text-xs font-semibold transition-colors disabled:opacity-50 inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                    title="Re-run DSP analysis with current genre/stage targets"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Re-Analyze</span>
                  </motion.button>
                  {onClearFile && (
                    <motion.button
                      type="button"
                      whileTap={TACTILE_TAP}
                      onClick={onClearFile}
                      disabled={isAnalyzing}
                      className="px-2.5 py-2 squircle-inner border border-[var(--border-hairline-color)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--border-active-color)] text-xs font-medium transition-colors inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                      title="Clear and upload another track"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Clear</span>
                    </motion.button>
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

      {/* AnimatePresence Transition: Empty Dropzone -> DSP Loading Scanner -> Populated Results */}
      <AnimatePresence mode="wait">
        {isAnalyzing && (
          <DspAnalysisLoadingScreen
            key={viewStateKey}
            fileName={selectedFile?.name || 'Uploaded Audio'}
            fileSizeBytes={selectedFile?.size || 0}
            genre={genre}
            progressPercent={analysisProgress}
            stageIndex={analysisStageIndex}
          />
        )}

        {!report && !isAnalyzing && (
          <motion.section
            key={viewStateKey}
            role="region"
            aria-label="No Audio Loaded"
            data-testid="simple-empty-state"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            initial={{ opacity: 0, y: 8 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: isDragOver ? 1.008 : 1,
            }}
            exit={{ opacity: 0, y: -4 }}
            transition={isDragOver ? STUDIO_SPRING : { duration: 0.28, ease: STUDIO_EASE }}
            className={`squircle-outer border border-dashed p-12 text-center space-y-4 transition-colors ${
              isDragOver
                ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]'
                : 'border-[var(--border-hairline-color)] bg-[var(--bg-elevated)]'
            }`}
          >
            <div className="w-14 h-14 squircle-inner bg-[var(--accent-soft)] border border-[var(--border-active-color)] text-[var(--accent-primary)] mx-auto flex items-center justify-center">
              <Volume2 className="w-6 h-6" />
            </div>
            <div className="max-w-md mx-auto space-y-2">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                No Audio Loaded Yet
              </h2>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Drop an audio bounce here or pick a file (.WAV, .FLAC, .AIFF, or .MP3) above to run real mathematical DSP analysis against your selected genre and stage.
              </p>
              <div className="pt-3 flex flex-wrap items-center justify-center gap-2.5">
                <label
                  htmlFor="simple-audio-upload"
                  className="inline-flex items-center gap-2 px-4 py-2 squircle-inner border border-[var(--border-hairline-color)] bg-[var(--bg-surface)] hover:border-[var(--border-active-color)] text-[var(--text-primary)] text-xs font-semibold cursor-pointer transition-colors"
                >
                  <Upload className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                  <span>Choose Audio Bounce</span>
                </label>
                {onLoadDemoTrack && (
                  <motion.button
                    type="button"
                    whileTap={TACTILE_TAP}
                    onClick={onLoadDemoTrack}
                    data-testid="load-demo-track-btn"
                    className="inline-flex items-center gap-2 px-4 py-2 squircle-inner bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white font-mono text-xs font-semibold tracking-wide transition-colors cursor-pointer"
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>LOAD DEMO TRACK</span>
                  </motion.button>
                )}
              </div>
            </div>
          </motion.section>
        )}

        {report && !isAnalyzing && (
          <motion.div
            key={viewStateKey}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3, ease: STUDIO_EASE }}
            className="space-y-6"
          >
            {/* Active Track Strip */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 squircle-inner studio-surface text-xs">
              <div className="flex flex-wrap items-center gap-2 text-[var(--text-primary)] font-mono tabular-nums">
                <FileAudio className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                <span className="font-semibold">{report.file_metadata.filename}</span>
                <span className="opacity-35" aria-hidden="true">·</span>
                <span className="text-[var(--text-secondary)]">
                  {report.file_metadata.duration_seconds.toFixed(1)}s ·{' '}
                  {(report.file_metadata.file_size_bytes / (1024 * 1024)).toFixed(1)} MB ·{' '}
                  {report.file_metadata.sample_rate_hz} Hz ·{' '}
                  {report.file_metadata.channels === 1 ? 'Mono' : 'Stereo'}
                </span>
              </div>
              {onClearFile && (
                <motion.button
                  type="button"
                  whileTap={TACTILE_TAP}
                  onClick={onClearFile}
                  className="px-2.5 py-1 squircle-inner border border-[var(--border-hairline-color)] bg-[var(--bg-elevated)] hover:border-[var(--border-active-color)] text-[var(--text-primary)] font-medium transition-colors inline-flex items-center gap-1 shrink-0 whitespace-nowrap cursor-pointer"
                >
                  <X className="w-3 h-3" />
                  <span>Clear Track</span>
                </motion.button>
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

            {/* SECTION A — 4-Metric Quick Scorecard (Zero Drop Shadows, Hairline Borders, Tabular Nums) */}
            <section
              aria-label="Mix Quick Diagnostics Scorecard"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
            >
              {/* 1. Loudness */}
              <div className="studio-elevated squircle-inner p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                  <span className="font-medium">Integrated Loudness</span>
                  <Volume2 className="w-4 h-4 text-[var(--accent-primary)]" />
                </div>
                <div className="text-2xl font-bold text-[var(--text-primary)] font-mono tabular-nums">
                  {lufsVal !== null && lufsVal !== undefined ? `${lufsVal.toFixed(1)} LUFS` : '—'}
                </div>
                <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] pt-1 studio-hairline-t">
                  <span className="font-mono tabular-nums">Target {lufsMin} to {lufsMax}</span>
                  <span className={`font-semibold ${lufsStatus.color}`}>{lufsStatus.label}</span>
                </div>
              </div>

              {/* 2. True Peak Headroom */}
              <div className="studio-elevated squircle-inner p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                  <span className="font-medium">True Peak Headroom</span>
                  <Activity className="w-4 h-4 text-[var(--accent-primary)]" />
                </div>
                <div className="text-2xl font-bold text-[var(--text-primary)] font-mono tabular-nums">
                  {tpVal !== null && tpVal !== undefined ? `${tpVal.toFixed(1)} dBTP` : '—'}
                </div>
                <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] pt-1 studio-hairline-t">
                  <span className="font-mono tabular-nums">Ceiling ≤ {tpTarget.toFixed(1)}</span>
                  <span className={`font-semibold ${tpStatus.color}`}>{tpStatus.label}</span>
                </div>
              </div>

              {/* 3. Mono & Phase Safety */}
              <div className="studio-elevated squircle-inner p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                  <span className="font-medium">Mono &amp; Phase Safety</span>
                  <Layers className="w-4 h-4 text-[var(--accent-primary)]" />
                </div>
                <div className="text-2xl font-bold text-[var(--text-primary)] font-mono tabular-nums">
                  {isMono
                    ? 'Mono'
                    : phaseCorr !== null && phaseCorr !== undefined
                    ? `${phaseCorr >= 0 ? '+' : ''}${phaseCorr.toFixed(2)}`
                    : '—'}
                </div>
                <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] pt-1 studio-hairline-t">
                  <span>Phase correlation</span>
                  <span className={`font-semibold ${phaseStatus.color}`}>{phaseStatus.label}</span>
                </div>
              </div>

              {/* 4. Crest / Dynamics */}
              <div className="studio-elevated squircle-inner p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                  <span className="font-medium">Crest / Dynamics</span>
                  <Sliders className="w-4 h-4 text-[var(--accent-primary)]" />
                </div>
                <div className="text-2xl font-bold text-[var(--text-primary)] font-mono tabular-nums">
                  {crestVal !== null && crestVal !== undefined ? `${crestVal.toFixed(1)} dB` : '—'}
                </div>
                <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] pt-1 studio-hairline-t">
                  <span>Peak-to-RMS ratio</span>
                  <span className={`font-semibold ${crestStatus.color}`}>{crestStatus.label}</span>
                </div>
              </div>
            </section>

            {/* SECTION B — Daylight Spectral Tonal Balance Graph */}
            <SpectralTonalBalanceGraph
              report={report}
              genre={genre}
              mixStage={mixStage}
              measuredSixBands={audioState.primarySixBands}
              spectrumBins={audioState.primarySpectrumBins}
              variant="simple"
              focusedIssueId={activeIssueId}
              flashNonce={spectrumFlashNonce}
              onSelectFlaggedIssue={handleFocusIssue}
            />

            {/* SECTION C — Prioritized Mix Action Plan (Max 3 Cards with Staggered Reveal + Smooth Accordions) */}
            <section
              aria-label="Prioritized Mix Action Plan"
              className="studio-elevated squircle-outer p-6 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3.5 studio-hairline-b">
                <div>
                  <h2 className="text-lg font-bold text-[var(--text-primary)]">
                    Prioritized Mix Action Plan ({topRecommendations.length} Key Steps)
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Follow these prioritized steps in your DAW before re-exporting.
                  </p>
                </div>
                <div className="text-xs font-mono tabular-nums text-[var(--text-secondary)]">
                  Completed: {Object.values(checkedSteps).filter(Boolean).length} / {topRecommendations.length}
                </div>
              </div>

              <div className="space-y-4">
                {topRecommendations.map((rec, idx) => {
                  const isDone = !!checkedSteps[rec.recommendation_id];
                  const isGuideOpen = !!expandedGuides[rec.recommendation_id];
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
                      ? 'text-[var(--status-alert)]'
                      : rec.priority_rank === 2
                      ? 'text-[var(--status-caution)]'
                      : 'text-[var(--accent-primary)]';

                  const detectedLine =
                    linkedIssue?.learning_guide.what_was_detected ||
                    `Detected: ${rec.beginner_summary}`;

                  const dawFixLine =
                    linkedIssue?.learning_guide.what_to_try ||
                    rec.advanced_dsp_guidance ||
                    rec.beginner_summary;

                  return (
                    <motion.article
                      key={rec.recommendation_id}
                      data-testid={`diagnostic-card-${rec.linked_issue_id}`}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.32, delay: idx * 0.06, ease: STUDIO_EASE }}
                      onClick={() => {
                        if (linkedIssue) handleFocusIssue(linkedIssue.issue_id);
                      }}
                      className={`relative squircle-inner border p-5 transition-colors space-y-3 cursor-pointer ${
                        isHighlighted
                          ? 'border-[var(--border-active-color)] bg-[var(--accent-soft)]/50'
                          : 'border-[var(--border-hairline-color)] bg-[var(--bg-surface)] hover:border-[var(--border-active-color)]'
                      }`}
                    >
                      {isHighlighted && (
                        <motion.span
                          layoutId="active-issue-indicator"
                          transition={STUDIO_SPRING}
                          aria-hidden="true"
                          className="absolute left-0 top-4 bottom-4 w-1 rounded-r-full bg-[var(--accent-primary)]"
                        />
                      )}

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className={`font-mono tabular-nums font-semibold ${priorityTextColor}`}>
                              {priorityLabel}
                            </span>
                            <span aria-hidden="true" className="opacity-35">·</span>
                            <span className="text-[var(--text-secondary)]">
                              {rec.classification === 'objective_technical'
                                ? 'Technical Warning'
                                : 'Stylistic Suggestion'}
                            </span>
                          </div>
                          <h3 className="text-sm font-bold text-[var(--text-primary)] mt-1">
                            {rec.action_title}
                          </h3>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {linkedIssue?.timestamps?.[0] && (
                            <motion.button
                              type="button"
                              whileTap={TACTILE_TAP}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleFocusIssue(linkedIssue.issue_id);
                              }}
                              className="px-2.5 py-1.5 squircle-inner text-xs font-medium border border-[var(--border-hairline-color)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:border-[var(--border-active-color)] transition-colors whitespace-nowrap cursor-pointer"
                            >
                              Audition Cue
                            </motion.button>
                          )}
                          <motion.button
                            type="button"
                            whileTap={TACTILE_TAP}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleVerificationStep(rec.recommendation_id);
                            }}
                            aria-pressed={isDone}
                            className={`px-3 py-1.5 squircle-inner text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              isDone
                                ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                                : 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border-hairline-color)] hover:border-[var(--border-active-color)]'
                            }`}
                          >
                            {isDone ? 'Verified in DAW' : 'Mark Verified'}
                          </motion.button>
                        </div>
                      </div>

                      {/* Detected Metric */}
                      <p className="text-xs text-[var(--text-secondary)]">
                        <strong className="text-[var(--text-primary)] font-semibold mr-1.5">
                          Detected:
                        </strong>
                        {detectedLine}
                      </p>

                      {/* DAW Fix */}
                      <p className="text-xs text-[var(--text-primary)] font-medium bg-[var(--accent-soft)] p-3 squircle-inner border border-[var(--border-active-color)]">
                        <strong className="text-[var(--accent-primary)] font-semibold mr-1.5">
                          DAW Fix:
                        </strong>
                        {dawFixLine}
                      </p>

                      {/* Smooth Animated Collapsible Learning Guide */}
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleGuide(rec.recommendation_id);
                          }}
                          aria-expanded={isGuideOpen}
                          className="inline-flex items-center gap-1.5 text-xs text-[var(--accent-primary)] hover:underline underline-offset-4 cursor-pointer font-semibold select-none"
                        >
                          <span>Why this matters &amp; how to check</span>
                          <ChevronDown
                            className={`w-3.5 h-3.5 transition-transform duration-200 ${
                              isGuideOpen ? 'rotate-180' : ''
                            }`}
                          />
                        </button>

                        <AnimatePresence initial={false}>
                          {isGuideOpen && (
                            <motion.div
                              key="guide-body"
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.24, ease: STUDIO_EASE }}
                              className="overflow-hidden"
                            >
                              <div className="pt-3 mt-2.5 space-y-2 studio-hairline-t text-xs text-[var(--text-secondary)] leading-relaxed">
                                <p>
                                  <strong className="text-[var(--text-primary)]">What was detected:</strong>{' '}
                                  {detectedLine}
                                </p>
                                <p>
                                  <strong className="text-[var(--text-primary)]">Why it matters:</strong>{' '}
                                  {linkedIssue?.learning_guide.why_it_matters ||
                                    'Addressing this ensures clean translation across consumer listening systems.'}
                                </p>
                                <p>
                                  <strong className="text-[var(--accent-primary)]">What to try in your DAW:</strong>{' '}
                                  {dawFixLine}
                                </p>
                                <p>
                                  <strong className="text-[var(--text-primary)]">How to verify the change:</strong>{' '}
                                  {linkedIssue?.learning_guide.how_to_verify ||
                                    rec.verification_check ||
                                    'Re-export and verify that the metric clears.'}
                                </p>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.article>
                  );
                })}
              </div>
            </section>

            {/* SECTION D — Evidence-Bound AI Mix Mentor & Artist Vision */}
            <AiMentorPanel
              report={report}
              genre={genre}
              mixStage={mixStage}
              interfaceMode="simple"
              consent={consent}
              onChangeConsent={(next) => onChangeConsent?.(next)}
              artistVision={artistVision}
              onChangeArtistVision={setArtistVision}
              onSelectEvidenceId={handleFocusIssue}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

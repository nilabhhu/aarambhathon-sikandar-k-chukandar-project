import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AnalysisReport,
  ArtistVisionTag,
  ConsentState,
  GenreId,
  MixStage,
  RevisionDeltaReport,
  StemMultitrackReport,
  UserReportedDawContext,
} from '../contracts/analysisContract';
import { GENRE_LABELS, MIX_STAGE_LABELS } from '../contracts/demoFixtures';
import { useStudioAudioEngine, useStudioAudioState } from '../audio/StudioAudioContext';
import {
  ActiveDeck,
  TRANSLATION_PROFILES,
  TranslationMode,
} from '../audio/StudioAudioEngine';
import { WaveformInspector, formatTimecode } from './WaveformInspector';
import { SpectralTonalBalanceGraph } from './SpectralTonalBalanceGraph';
import { ShortTermLufsTimeline } from './ShortTermLufsTimeline';
import { PhaseCorrelationMeter } from './PhaseCorrelationMeter';
import { RealtimeLoudnessPeakMeter } from './RealtimeLoudnessPeakMeter';
import { StereoImagerVectorscope } from './StereoImagerVectorscope';
import { DspAnalysisLoadingScreen } from './DspAnalysisLoadingScreen';
import { StemOverlapMatrix } from './StemOverlapMatrix';
import { RevisionDeltaPanel } from './RevisionDeltaPanel';
import { AiMentorPanel } from './AiMentorPanel';
import { STUDIO_EASE, STUDIO_SPRING, TACTILE_TAP } from '../lib/motion';
import {
  Activity,
  ChevronDown,
  FileAudio,
  Info,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  SlidersHorizontal,
  Upload,
  X,
} from 'lucide-react';

interface AdvancedMixCheckViewProps {
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
  audioFile?: File | null;
  selectedFile?: File | null;
  onSelectFile?: (file: File) => void;
  onClearFile?: () => void;
  isAnalyzing?: boolean;
  analysisProgress?: number;
  analysisStageIndex?: number;
  analysisStage?: 'idle' | 'selected' | 'uploading' | 'analyzing' | 'complete' | 'failed';
  errorMessage?: string | null;
  onCancelAnalysis?: () => void;
  onLoadDemonstration?: () => void;
  onLoadDemoTrack?: () => void;
  stemReport?: StemMultitrackReport | null;
  onStemReportChange?: (report: StemMultitrackReport | null) => void;
  revisionComparison?: RevisionDeltaReport | null;
  onRevisionComparisonChange?: (comparison: RevisionDeltaReport | null) => void;
  dawContext?: UserReportedDawContext;
  onDawContextChange?: (ctx: UserReportedDawContext) => void;
}

const DAW_OPTIONS = [
  '',
  'Ableton Live',
  'Logic Pro',
  'Pro Tools',
  'FL Studio',
  'REAPER',
  'Cubase / Nuendo',
  'Studio One',
  'Bitwig Studio',
  'Other DAW',
];

const DEFAULT_DAW_CONTEXT: UserReportedDawContext = {
  source_tag: 'user_reported_context',
  daw_name: '',
  bus_routing: '',
  plugin_chain_notes: '',
  updated_at: null,
};

function formatMeasurement(
  val: number | null | undefined,
  unit: string,
  decimals = 1,
  showPlus = false
): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return 'N/A';
  const prefix = showPlus && val > 0 ? '+' : '';
  return `${prefix}${val.toFixed(decimals)}${unit ? ` ${unit}` : ''}`;
}

export const AdvancedMixCheckView: React.FC<AdvancedMixCheckViewProps> = ({
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
  selectedFile = null,
  onSelectFile,
  onClearFile,
  isAnalyzing = false,
  analysisProgress = 0,
  analysisStageIndex = 0,
  onLoadDemonstration,
  onLoadDemoTrack,
  stemReport: controlledStemReport,
  onStemReportChange,
  revisionComparison: controlledRevisionComparison,
  onRevisionComparisonChange,
  dawContext: controlledDawContext,
  onDawContextChange,
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

  const [localStemReport, setLocalStemReport] = useState<StemMultitrackReport | null>(null);
  const [localRevisionComparison, setLocalRevisionComparison] =
    useState<RevisionDeltaReport | null>(null);
  const [localDawContext, setLocalDawContext] =
    useState<UserReportedDawContext>(DEFAULT_DAW_CONTEXT);
  const [dawDrawerOpen, setDawDrawerOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const stemReport =
    controlledStemReport !== undefined ? controlledStemReport : localStemReport;
  const setStemReport = (next: StemMultitrackReport | null) => {
    if (onStemReportChange) {
      onStemReportChange(next);
    } else {
      setLocalStemReport(next);
    }
  };

  const revisionComparison =
    controlledRevisionComparison !== undefined
      ? controlledRevisionComparison
      : localRevisionComparison;
  const setRevisionComparison = (next: RevisionDeltaReport | null) => {
    if (onRevisionComparisonChange) {
      onRevisionComparisonChange(next);
    } else {
      setLocalRevisionComparison(next);
    }
  };

  const dawContext = controlledDawContext ?? localDawContext;
  const updateDawContext = (patch: Partial<Omit<UserReportedDawContext, 'source_tag'>>) => {
    const next: UserReportedDawContext = {
      ...dawContext,
      ...patch,
      source_tag: 'user_reported_context',
      updated_at: new Date().toISOString(),
    };
    if (onDawContextChange) {
      onDawContextChange(next);
    } else {
      setLocalDawContext(next);
    }
  };

  const hasDawNotes = Boolean(
    dawContext.daw_name.trim() ||
      dawContext.bus_routing.trim() ||
      dawContext.plugin_chain_notes.trim()
  );

  const [activeIssueId, setActiveIssueId] = useState<string | null>(
    report?.issues?.[0]?.issue_id ?? null
  );
  const [spectrumFlashNonce, setSpectrumFlashNonce] = useState<number>(0);
  const [activeTimestamp, setActiveTimestamp] = useState<{
    start_sec: number;
    end_sec: number;
    label: string;
  } | null>(report?.issues?.[0]?.timestamps?.[0] ?? null);

  const deckTimecodeRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const first = report?.issues?.[0];
    setActiveIssueId(first?.issue_id ?? null);
    setActiveTimestamp(first?.timestamps?.[0] ?? null);
  }, [report?.report_id]);

  // 60fps live timecode sync for the Transport Deck without React re-renders
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      if (deckTimecodeRef.current) {
        deckTimecodeRef.current.textContent = formatTimecode(engine.getCurrentTime());
      }
      if (audioState.isPlaying) {
        rafId = requestAnimationFrame(tick);
      }
    };
    tick();
    return () => cancelAnimationFrame(rafId);
  }, [engine, audioState.isPlaying, audioState.hasPrimaryMix, audioState.primaryFileName]);

  const handlePrimaryFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const handleReferenceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    engine.loadReferenceFile(file);
    e.target.value = '';
  };

  const handleReAnalyze = () => {
    if (selectedFile && onAnalyzeAudioFile) {
      onAnalyzeAudioFile(selectedFile);
    }
  };

  const handleFocusIssue = (issueId: string) => {
    setActiveIssueId(issueId);
    setSpectrumFlashNonce((n) => n + 1);
    const issue = report?.issues.find((i) => i.issue_id === issueId);
    if (issue?.timestamps?.[0]) {
      const ts = issue.timestamps[0];
      setActiveTimestamp(ts);
      engine.setLoopRegion({
        startSec: ts.start_sec,
        endSec: Math.max(ts.start_sec + 1.0, ts.end_sec),
        label: ts.label,
      });
      if (audioState.hasPrimaryMix) {
        engine.seekAndPlay(ts.start_sec).catch(() => {});
      }
    }
  };

  const objectiveIssues =
    report?.issues?.filter((i) => i.classification === 'objective_technical') || [];
  const stylisticIssues =
    report?.issues?.filter((i) => i.classification === 'subjective_stylistic') || [];

  const activeTranslationProfile = TRANSLATION_PROFILES[audioState.translationMode];
  const effectiveDuration =
    audioState.primaryDurationSec > 0
      ? audioState.primaryDurationSec
      : report?.file_metadata.duration_seconds ?? 0;

  const viewStateKey = isAnalyzing ? 'analyzing' : report ? `report-${report.report_id}` : 'empty';

  return (
    <div className="space-y-6">
      {/* Workbench Header & Upload Controls */}
      <section
        aria-label="Advanced Mix Check Context Controls"
        className="studio-elevated squircle-outer p-5 md:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              Advanced Mix Check Workbench
            </h1>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Loudness-matched A/B auditioning, translation filter lab, original multitrack stem overlap, and v1 → v2 revision delta tracking.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div>
              <label htmlFor="adv-genre-select" className="sr-only">
                Music Genre
              </label>
              <select
                id="adv-genre-select"
                value={genre}
                onChange={(e) => onChangeGenre(e.target.value as GenreId)}
                className="squircle-inner border border-[var(--border-hairline-color)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              >
                {(Object.keys(GENRE_LABELS) as GenreId[]).map((g) => (
                  <option key={g} value={g}>
                    {GENRE_LABELS[g]}
                  </option>
                ))}
              </select>
            </div>

            <div
              className="flex items-center gap-1 p-1 bg-[var(--bg-surface)] squircle-inner border border-[var(--border-hairline-color)]"
              role="group"
              aria-label="Mix Stage"
            >
              {(['unmastered_mix', 'final_master'] as MixStage[]).map((st) => {
                const active = mixStage === st;
                return (
                  <motion.button
                    key={st}
                    type="button"
                    whileTap={TACTILE_TAP}
                    onClick={() => onChangeMixStage(st)}
                    aria-pressed={active}
                    className={`relative px-3 py-1.5 text-xs font-medium squircle-inner transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'text-[var(--text-primary)] font-semibold'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="adv-stage-pill"
                        transition={STUDIO_SPRING}
                        className="absolute inset-0 squircle-inner bg-[var(--bg-elevated)] border border-[var(--border-hairline-color)]"
                      />
                    )}
                    <span className="relative z-10">{MIX_STAGE_LABELS[st].title}</span>
                  </motion.button>
                );
              })}
            </div>

            {/* Primary Audio Bounce Upload */}
            <div className="flex flex-wrap items-center gap-1.5">
              <label
                htmlFor="adv-audio-upload"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`flex items-center gap-1.5 px-3 py-2 squircle-inner border border-dashed text-xs font-medium cursor-pointer transition-colors shrink-0 whitespace-nowrap ${
                  isDragOver
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                    : 'border-[var(--border-hairline-color)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--border-active-color)]'
                }`}
              >
                <Upload className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                <span className="truncate max-w-[150px] font-mono">
                  {selectedFile ? selectedFile.name : 'Upload Mix (A)'}
                </span>
              </label>
              <input
                id="adv-audio-upload"
                type="file"
                accept=".wav,.flac,.aiff,.mp3,.ogg,audio/*"
                onChange={handlePrimaryFileChange}
                className="sr-only"
                disabled={isAnalyzing}
              />

              {selectedFile && (
                <>
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
                      className="px-2.5 py-2 squircle-inner border border-[var(--border-hairline-color)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--border-active-color)] text-xs font-medium transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Clear
                    </motion.button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* File Metadata Strip */}
        {report && (
          <div className="mt-4 pt-3.5 studio-hairline-t flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs font-mono tabular-nums text-[var(--text-secondary)]">
            <span className="inline-flex items-center gap-1.5 text-[var(--text-primary)] font-semibold">
              <FileAudio className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              {report.file_metadata.filename}
            </span>
            <span>{report.file_metadata.format}</span>
            <span>{report.file_metadata.sample_rate_hz} Hz</span>
            <span>
              {report.file_metadata.bit_depth ? `${report.file_metadata.bit_depth}-bit` : 'Float32'}
            </span>
            <span>{report.file_metadata.channels === 1 ? 'Mono' : 'Stereo'}</span>
            <span>{formatTimecode(report.file_metadata.duration_seconds)}</span>
          </div>
        )}
      </section>

      {/* AnimatePresence Transition: Empty Dropzone -> DSP Loading Scanner -> Populated Workbench */}
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
            data-testid="advanced-empty-state"
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
              <Activity className="w-6 h-6" />
            </div>
            <div className="max-w-md mx-auto space-y-2">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                No Audio Loaded Yet
              </h2>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Drop Mix (A) here or choose a bounce (.WAV, .FLAC, .AIFF, or .MP3) above to open the Advanced Mix Check Workbench.
              </p>
              <p className="text-[11px] text-[var(--text-secondary)]/85 leading-relaxed">
                Once loaded, optionally add a Reference Track (B) for loudness-matched A/B comparison and translation filter checks.
              </p>
              <div className="pt-3 flex flex-wrap items-center justify-center gap-2.5">
                <label
                  htmlFor="adv-audio-upload"
                  className="inline-flex items-center gap-2 px-4 py-2 squircle-inner border border-[var(--border-hairline-color)] bg-[var(--bg-surface)] hover:border-[var(--border-active-color)] text-[var(--text-primary)] text-xs font-semibold cursor-pointer transition-colors"
                >
                  <Upload className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                  <span>Upload Mix (A)</span>
                </label>
                {(onLoadDemoTrack || onLoadDemonstration) && (
                  <motion.button
                    type="button"
                    whileTap={TACTILE_TAP}
                    onClick={onLoadDemoTrack || onLoadDemonstration}
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

        {!isAnalyzing && report && (
          <motion.div
            key={viewStateKey}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3, ease: STUDIO_EASE }}
            className="space-y-6"
          >
            {/* 1. Tactile Transport & Translation Deck */}
            <section
              aria-label="Tactile Transport and Translation Deck"
              data-testid="tactile-transport-deck"
              className="studio-elevated squircle-outer p-5 md:p-6 space-y-4"
            >
              {/* Primary Controls Row */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                {/* Left: Transport Play/Pause + Restart + Live Timecode */}
                <div className="flex items-center gap-3">
                  <motion.button
                    type="button"
                    whileTap={TACTILE_TAP}
                    onClick={() => engine.togglePlay()}
                    disabled={!audioState.hasPrimaryMix}
                    aria-label={audioState.isPlaying ? 'Pause playback' : 'Start playback'}
                    data-testid="deck-play-toggle"
                    className="inline-flex items-center justify-center w-10 h-10 squircle-inner bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white transition-colors disabled:opacity-45 shrink-0 cursor-pointer"
                  >
                    {audioState.isPlaying ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4 ml-0.5" />
                    )}
                  </motion.button>

                  <motion.button
                    type="button"
                    whileTap={TACTILE_TAP}
                    onClick={() => engine.seek(0, true)}
                    disabled={!audioState.hasPrimaryMix}
                    aria-label="Restart from beginning"
                    className="p-2.5 squircle-inner border border-[var(--border-hairline-color)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--border-active-color)] transition-colors disabled:opacity-45 cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </motion.button>

                  <div className="font-mono tabular-nums">
                    <div className="text-base font-bold text-[var(--text-primary)] leading-none">
                      <span ref={deckTimecodeRef}>
                        {formatTimecode(engine.getCurrentTime())}
                      </span>
                      <span className="opacity-35 font-normal text-xs mx-1.5">/</span>
                      <span className="text-[var(--text-secondary)] font-normal text-xs">
                        {formatTimecode(effectiveDuration)}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)] mt-1 flex items-center gap-2">
                      <span>
                        Deck {audioState.activeDeck}
                        {audioState.isLooping && audioState.loopRegion ? ' · Loop Active' : ''}
                      </span>
                      {audioState.loopRegion && (
                        <button
                          type="button"
                          onClick={() => engine.toggleLooping()}
                          className={`inline-flex items-center gap-1 font-medium transition-colors cursor-pointer ${
                            audioState.isLooping
                              ? 'text-[var(--accent-primary)]'
                              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          <Repeat className="w-3 h-3" />
                          <span>{audioState.isLooping ? 'Loop On' : 'Loop Off'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Three Segmented Tactile Pill Wells (STUDIO_SPRING + TACTILE_TAP) */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Segmented 1: Mix A / Reference B / Revision v2 */}
                  <div
                    role="group"
                    aria-label="Active Deck A/B/v2 Switcher"
                    className="inline-flex items-center p-1 squircle-inner bg-[var(--bg-surface)] border border-[var(--border-hairline-color)]"
                  >
                    {(
                      audioState.hasRevisionV2
                        ? (['A', 'V2', 'B'] as ActiveDeck[])
                        : (['A', 'B'] as ActiveDeck[])
                    ).map((deck) => {
                      const active = audioState.activeDeck === deck;
                      const disabled = deck === 'B' && !audioState.hasReferenceTrack;
                      const deckLabel =
                        deck === 'A'
                          ? audioState.hasRevisionV2
                            ? 'Mix v1'
                            : 'Mix A'
                          : deck === 'V2'
                          ? 'Rev v2'
                          : 'Reference B';
                      return (
                        <motion.button
                          key={deck}
                          type="button"
                          whileTap={disabled ? undefined : TACTILE_TAP}
                          disabled={disabled}
                          onClick={() => engine.setActiveDeck(deck)}
                          aria-pressed={active}
                          data-testid={`deck-switch-${deck}`}
                          className={`relative px-3 py-1.5 text-xs font-medium squircle-inner transition-colors whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${
                            active
                              ? 'text-white font-semibold'
                              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="adv-ab-pill"
                              transition={STUDIO_SPRING}
                              className="absolute inset-0 squircle-inner bg-[var(--accent-primary)]"
                            />
                          )}
                          <span className="relative z-10">{deckLabel}</span>
                        </motion.button>
                      );
                    })}
                  </div>

                  {/* Segmented 2: Stereo / Mono */}
                  <div
                    role="group"
                    aria-label="Stereo or Equal-Power Mono Folding"
                    className="inline-flex items-center p-1 squircle-inner bg-[var(--bg-surface)] border border-[var(--border-hairline-color)]"
                  >
                    {[
                      { id: false, label: 'Stereo' },
                      { id: true, label: 'Mono' },
                    ].map((opt) => {
                      const active = audioState.monoMode === opt.id;
                      return (
                        <motion.button
                          key={opt.label}
                          type="button"
                          whileTap={TACTILE_TAP}
                          onClick={() => engine.setMonoMode(opt.id)}
                          aria-pressed={active}
                          data-testid={`monitoring-${opt.label.toLowerCase()}`}
                          className={`relative px-3 py-1.5 text-xs font-medium squircle-inner transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            active
                              ? 'text-[var(--text-primary)] font-semibold'
                              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="adv-mono-pill"
                              transition={STUDIO_SPRING}
                              className="absolute inset-0 squircle-inner bg-[var(--bg-elevated)] border border-[var(--border-hairline-color)]"
                            />
                          )}
                          <span className="relative z-10">{opt.label}</span>
                        </motion.button>
                      );
                    })}
                  </div>

                  {/* Segmented 3: Mix Translation Lab (Full / Phone / Laptop) */}
                  <div
                    role="group"
                    aria-label="Mix Translation Lab Filter Profile"
                    className="inline-flex items-center p-1 squircle-inner bg-[var(--bg-surface)] border border-[var(--border-hairline-color)]"
                  >
                    {(['full', 'phone', 'laptop'] as TranslationMode[]).map((mode) => {
                      const active = audioState.translationMode === mode;
                      return (
                        <motion.button
                          key={mode}
                          type="button"
                          whileTap={TACTILE_TAP}
                          onClick={() => engine.setTranslationMode(mode)}
                          aria-pressed={active}
                          data-testid={`translation-${mode}`}
                          className={`relative px-3 py-1.5 text-xs font-medium squircle-inner transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            active
                              ? 'text-[var(--text-primary)] font-semibold'
                              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="adv-translation-pill"
                              transition={STUDIO_SPRING}
                              className="absolute inset-0 squircle-inner bg-[var(--bg-elevated)] border border-[var(--border-hairline-color)]"
                            />
                          )}
                          <span className="relative z-10">
                            {TRANSLATION_PROFILES[mode].shortLabel}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Reference Track B Upload + Loudness Match Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3.5 studio-hairline-t text-xs">
                <div className="flex flex-wrap items-center gap-2.5">
                  <label
                    htmlFor="adv-ref-upload"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 squircle-inner border border-[var(--border-hairline-color)] bg-[var(--bg-surface)] hover:border-[var(--border-active-color)] text-[var(--text-primary)] font-medium cursor-pointer transition-colors whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                    <span>
                      {audioState.loadingReference
                        ? 'Decoding Reference B...'
                        : audioState.hasReferenceTrack
                        ? 'Change Reference B'
                        : 'Load Reference Track (B)'}
                    </span>
                  </label>
                  <input
                    id="adv-ref-upload"
                    type="file"
                    accept=".wav,.flac,.aiff,.mp3,.ogg,audio/*"
                    onChange={handleReferenceFileChange}
                    className="sr-only"
                  />

                  {audioState.hasReferenceTrack && (
                    <>
                      <span className="font-mono text-[var(--text-primary)] truncate max-w-[200px]">
                        {audioState.referenceFileName}
                      </span>
                      <span aria-hidden="true" className="opacity-35">·</span>
                      <span
                        data-testid="reference-loudness-offset"
                        className="font-mono tabular-nums text-[var(--accent-primary)] font-semibold"
                      >
                        Loudness Match:{' '}
                        {audioState.referenceMatchOffsetDb !== null
                          ? `${audioState.referenceMatchOffsetDb >= 0 ? '+' : ''}${audioState.referenceMatchOffsetDb.toFixed(1)} dB`
                          : '0.0 dB'}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          engine.setLoudnessMatchEnabled(!audioState.loudnessMatchEnabled)
                        }
                        aria-pressed={audioState.loudnessMatchEnabled}
                        className="text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline underline-offset-2 whitespace-nowrap cursor-pointer"
                      >
                        {audioState.loudnessMatchEnabled ? 'Matched (Click to Bypass)' : 'Match Bypassed'}
                      </button>
                      <button
                        type="button"
                        onClick={() => engine.clearReferenceTrack()}
                        aria-label="Remove Reference Track B"
                        className="p-1 squircle-inner hover:bg-[var(--bg-surface)] text-[var(--text-secondary)] cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>

                {/* Explicit Educational Approximation Disclosure (Rule 6) */}
                <div
                  data-testid="translation-disclosure"
                  className={`flex items-center gap-1.5 text-[11px] ${
                    activeTranslationProfile.isApproximation
                      ? 'text-[var(--status-caution)] font-medium'
                      : 'text-[var(--text-secondary)]'
                  }`}
                >
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    <strong>{activeTranslationProfile.label}:</strong>{' '}
                    {activeTranslationProfile.disclosure}
                  </span>
                </div>
              </div>

              {/* Key Telemetry Strip (Tabular-Nums) */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-3.5 studio-hairline-t">
                <div className="squircle-inner studio-surface px-3.5 py-2.5">
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    Integrated Loudness
                  </div>
                  <div className="text-lg font-bold font-mono tabular-nums text-[var(--text-primary)] mt-0.5">
                    {formatMeasurement(report.measurements.integrated_loudness.value, 'LUFS')}
                  </div>
                </div>

                <div className="squircle-inner studio-surface px-3.5 py-2.5">
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    True Peak Max
                  </div>
                  <div
                    className={`text-lg font-bold font-mono tabular-nums mt-0.5 ${
                      report.measurements.true_peak_max.status === 'critical'
                        ? 'text-[var(--status-alert)]'
                        : 'text-[var(--text-primary)]'
                    }`}
                  >
                    {formatMeasurement(report.measurements.true_peak_max.value, 'dBTP', 2, true)}
                  </div>
                </div>

                <div className="squircle-inner studio-surface px-3.5 py-2.5">
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    Loudness Range (LRA)
                  </div>
                  <div className="text-lg font-bold font-mono tabular-nums text-[var(--text-primary)] mt-0.5">
                    {formatMeasurement(report.measurements.loudness_range_lra.value, 'LU')}
                  </div>
                </div>

                <div className="squircle-inner studio-surface px-3.5 py-2.5">
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    Phase Correlation (Mean / Min)
                  </div>
                  <div className="text-lg font-bold font-mono tabular-nums text-[var(--text-primary)] mt-0.5">
                    {report.file_metadata.channels === 1
                      ? '+1.00 / +1.00'
                      : `${formatMeasurement(
                          report.measurements.phase_correlation_mean.value,
                          '',
                          2,
                          true
                        )} / ${formatMeasurement(
                          report.measurements.phase_correlation_min.value,
                          '',
                          2,
                          true
                        )}`}
                  </div>
                </div>
              </div>
            </section>

            {/* 2. 60fps Canvas Waveform & Clickable Issue Markers */}
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
              showTransportBar={false}
            />

            {/* 2B. Real-Time 60fps Studio Output Metering Row (Peak/LUFS + 2D Goniometer) */}
            <div
              data-testid="live-studio-metering-row"
              className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch"
            >
              <div className="lg:col-span-7 flex flex-col">
                <div className="flex-1">
                  <RealtimeLoudnessPeakMeter
                    genre={genre}
                    mixStage={mixStage}
                    targetMinLufs={report.measurements.integrated_loudness.target_min}
                    targetMaxLufs={report.measurements.integrated_loudness.target_max}
                  />
                </div>
              </div>
              <div className="lg:col-span-5 flex flex-col">
                <div className="flex-1">
                  <StereoImagerVectorscope />
                </div>
              </div>
            </div>

            {/* 3. Three Clean Diagnostic Visualizations (Asymmetric Studio Grid) */}
            <div className="space-y-6">
              <SpectralTonalBalanceGraph
                report={report}
                genre={genre}
                mixStage={mixStage}
                measuredSixBands={audioState.primarySixBands}
                referenceSixBands={audioState.referenceSixBands}
                referenceFileName={audioState.referenceFileName}
                spectrumBins={audioState.primarySpectrumBins}
                variant="advanced"
                focusedIssueId={activeIssueId}
                flashNonce={spectrumFlashNonce}
                onSelectFlaggedIssue={handleFocusIssue}
              />

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                <div className="lg:col-span-7 flex flex-col">
                  <div className="flex-1">
                    <ShortTermLufsTimeline
                      timeline={report.timeline}
                      durationSeconds={effectiveDuration}
                      mixStage={mixStage}
                      integratedLufs={report.measurements.integrated_loudness.value}
                      shortTermMaxLufs={report.measurements.short_term_max_loudness.value}
                    />
                  </div>
                </div>
                <div className="lg:col-span-5 flex flex-col">
                  <div className="flex-1">
                    <PhaseCorrelationMeter
                      meanCorrelation={report.measurements.phase_correlation_mean.value}
                      minCorrelation={report.measurements.phase_correlation_min.value}
                      stereoWidthIndex={report.measurements.stereo_width_index.value}
                      channels={report.file_metadata.channels}
                      timeline={report.timeline}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 4. Objective Technical Warnings vs. Subjective Stylistic Notes (Rule 8) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Objective Technical Warnings */}
              <section
                aria-label="Objective Technical Warnings"
                className="studio-elevated squircle-outer p-6 space-y-4"
              >
                <div className="pb-3.5 studio-hairline-b">
                  <h2 className="text-base font-bold text-[var(--text-primary)]">
                    Objective Technical Warnings ({objectiveIssues.length})
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Deterministic boundary violations (true-peak overshoots, clipping, negative phase correlation).
                  </p>
                </div>

                {objectiveIssues.length === 0 ? (
                  <p className="text-xs text-[var(--status-safe)] font-medium py-4">
                    No objective technical boundary violations detected for this stage.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {objectiveIssues.map((issue) => {
                      const isSelected = activeIssueId === issue.issue_id;
                      return (
                        <article
                          key={issue.issue_id}
                          data-testid={`diagnostic-card-${issue.issue_id}`}
                          onClick={() => handleFocusIssue(issue.issue_id)}
                          className={`relative p-4 squircle-inner border cursor-pointer transition-colors ${
                            isSelected
                              ? 'border-[var(--border-active-color)] bg-[var(--accent-soft)]/55'
                              : 'border-[var(--border-hairline-color)] bg-[var(--bg-surface)] hover:border-[var(--border-active-color)]'
                          }`}
                        >
                          {isSelected && (
                            <motion.span
                              layoutId="active-issue-indicator"
                              transition={STUDIO_SPRING}
                              aria-hidden="true"
                              className="absolute left-0 top-3.5 bottom-3.5 w-1 rounded-r-full bg-[var(--accent-primary)]"
                            />
                          )}

                          <div className="flex items-center justify-between gap-2 text-xs font-mono tabular-nums text-[var(--text-secondary)]">
                            <span
                              className={`font-semibold ${
                                issue.severity === 'critical'
                                  ? 'text-[var(--status-alert)]'
                                  : 'text-[var(--status-caution)]'
                              }`}
                            >
                              {issue.severity} · {(issue.confidence * 100).toFixed(0)}% confidence
                            </span>
                            <span>{issue.domain}</span>
                          </div>
                          <h3 className="text-sm font-bold text-[var(--text-primary)] mt-1">
                            {issue.title}
                          </h3>
                          <div className="mt-2 space-y-1 text-xs font-mono tabular-nums text-[var(--text-primary)]">
                            {issue.evidence.map((ev) => (
                              <div key={ev.metric_key} className="flex justify-between gap-2">
                                <span className="text-[var(--text-secondary)]">
                                  {ev.metric_key}
                                </span>
                                <span className="font-semibold">
                                  {ev.measured_value} {ev.unit} (Target {ev.target_range})
                                </span>
                              </div>
                            ))}
                          </div>
                          <p className="mt-2.5 text-xs text-[var(--text-secondary)] leading-relaxed">
                            <strong className="text-[var(--text-primary)]">Fix: </strong>
                            {issue.learning_guide.what_to_try}
                          </p>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Subjective Stylistic Differences */}
              <section
                aria-label="Subjective Stylistic Differences"
                className="studio-elevated squircle-outer p-6 space-y-4"
              >
                <div className="pb-3.5 studio-hairline-b">
                  <h2 className="text-base font-bold text-[var(--text-primary)]">
                    Stylistic &amp; Genre Context Notes ({stylisticIssues.length})
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Tonal and macrodynamic traits compared against {GENRE_LABELS[genre]} conventions. Judge by ear.
                  </p>
                </div>

                {stylisticIssues.length === 0 ? (
                  <p className="text-xs text-[var(--text-secondary)] py-4">
                    No notable tonal or macrodynamic deviations flagged for {GENRE_LABELS[genre]}.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {stylisticIssues.map((issue) => {
                      const isSelected = activeIssueId === issue.issue_id;
                      return (
                        <article
                          key={issue.issue_id}
                          data-testid={`diagnostic-card-${issue.issue_id}`}
                          onClick={() => handleFocusIssue(issue.issue_id)}
                          className={`relative p-4 squircle-inner border cursor-pointer transition-colors ${
                            isSelected
                              ? 'border-[var(--border-active-color)] bg-[var(--accent-soft)]/55'
                              : 'border-[var(--border-hairline-color)] bg-[var(--bg-surface)] hover:border-[var(--border-active-color)]'
                          }`}
                        >
                          {isSelected && (
                            <motion.span
                              layoutId="active-issue-indicator"
                              transition={STUDIO_SPRING}
                              aria-hidden="true"
                              className="absolute left-0 top-3.5 bottom-3.5 w-1 rounded-r-full bg-[var(--accent-primary)]"
                            />
                          )}

                          <div className="flex items-center justify-between gap-2 text-xs font-mono tabular-nums text-[var(--text-secondary)]">
                            <span className="font-semibold text-[var(--accent-primary)]">
                              stylistic · {(issue.confidence * 100).toFixed(0)}% confidence
                            </span>
                            <span>{issue.domain}</span>
                          </div>
                          <h3 className="text-sm font-bold text-[var(--text-primary)] mt-1">
                            {issue.title}
                          </h3>
                          <div className="mt-2 space-y-1 text-xs font-mono tabular-nums text-[var(--text-primary)]">
                            {issue.evidence.map((ev) => (
                              <div key={ev.metric_key} className="flex justify-between gap-2">
                                <span className="text-[var(--text-secondary)]">
                                  {ev.metric_key}
                                </span>
                                <span className="font-semibold">
                                  {ev.measured_value} {ev.unit} ({ev.target_range})
                                </span>
                              </div>
                            ))}
                          </div>
                          <p className="mt-2.5 text-xs text-[var(--text-secondary)] leading-relaxed">
                            <strong className="text-[var(--text-primary)]">Experiment: </strong>
                            {issue.learning_guide.what_to_try}
                          </p>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>

            {/* 4b. Evidence-Bound AI Mix Mentor & Artist Vision */}
            <AiMentorPanel
              report={report}
              genre={genre}
              mixStage={mixStage}
              interfaceMode="advanced"
              consent={consent}
              onChangeConsent={(next) => onChangeConsent?.(next)}
              artistVision={artistVision}
              onChangeArtistVision={setArtistVision}
              dawContext={dawContext}
              onSelectEvidenceId={handleFocusIssue}
            />

            {/* 5. Full Standardized DSP Parameter Table */}
            <section
              aria-label="Standardized Mathematical DSP Measurements Table"
              className="studio-elevated squircle-outer p-6 space-y-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 pb-3.5 studio-hairline-b">
                <div>
                  <h2 className="text-base font-bold text-[var(--text-primary)]">
                    Complete Mathematical DSP Telemetry
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    ITU-R BS.1770-4, EBU R128, IEC 60268, and Welch PSD measurements (sole source of truth).
                  </p>
                </div>
                <span className="text-xs font-mono text-[var(--accent-primary)]">
                  Source: {report.measurements.integrated_loudness.source}
                </span>
              </div>

              <div className="overflow-x-auto squircle-inner border border-[var(--border-hairline-color)]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[var(--bg-surface)] studio-hairline-b text-[var(--text-secondary)] font-semibold">
                      <th className="py-2.5 px-4">Parameter</th>
                      <th className="py-2.5 px-4">Standard</th>
                      <th className="py-2.5 px-4 text-right">Measured</th>
                      <th className="py-2.5 px-4 text-right">Target Range</th>
                      <th className="py-2.5 px-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-hairline-color)]">
                    {(
                      [
                        ['Integrated Loudness', report.measurements.integrated_loudness, 'LUFS', 1],
                        ['Short-Term Max (3s)', report.measurements.short_term_max_loudness, 'LUFS', 1],
                        ['Momentary Max (400ms)', report.measurements.momentary_max_loudness, 'LUFS', 1],
                        ['True Peak Max (4x ISP)', report.measurements.true_peak_max, 'dBTP', 2],
                        ['Sample Peak Max', report.measurements.sample_peak_max, 'dBFS', 2],
                        ['Sample Clipping Events', report.measurements.sample_clipping_events, 'runs', 0],
                        ['Loudness Range (LRA)', report.measurements.loudness_range_lra, 'LU', 1],
                        ['Dynamic Crest Factor', report.measurements.crest_factor, 'dB', 1],
                        ['Phase Correlation (Mean)', report.measurements.phase_correlation_mean, '', 2],
                        ['Phase Correlation (Min)', report.measurements.phase_correlation_min, '', 2],
                        ['Stereo Width Index', report.measurements.stereo_width_index, '%', 0],
                        ['Sub-Bass (20–60 Hz)', report.measurements.sub_bass_energy_20_60hz, 'dBFS', 1],
                        ['Low-Mid / Mud (200–500 Hz)', report.measurements.mud_band_energy_200_500hz, 'dBFS', 1],
                        ['Presence (2–5 kHz)', report.measurements.presence_band_energy_2k_5khz, 'dBFS', 1],
                        ['High Air (10–20 kHz)', report.measurements.air_band_energy_10k_20khz, 'dBFS', 1],
                      ] as const
                    ).map(([label, m, unit, dec]) => {
                      const targetStr =
                        m.target_min !== null && m.target_max !== null
                          ? `${m.target_min} to ${m.target_max}`
                          : m.target_max !== null
                          ? `≤ ${m.target_max}`
                          : m.target_min !== null
                          ? `≥ ${m.target_min}`
                          : '—';

                      const statusCls =
                        m.status === 'critical'
                          ? 'text-[var(--status-alert)] font-semibold'
                          : m.status === 'warning'
                          ? 'text-[var(--status-caution)] font-semibold'
                          : m.status === 'unavailable'
                          ? 'text-[var(--text-secondary)] opacity-60'
                          : 'text-[var(--status-safe)] font-medium';

                      return (
                        <tr
                          key={label}
                          className="hover:bg-[var(--bg-surface)]/70 transition-colors"
                        >
                          <td className="py-2.5 px-4 font-medium text-[var(--text-primary)]">
                            {label}
                          </td>
                          <td className="py-2.5 px-4 text-[var(--text-secondary)]">
                            {m.standard}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-[var(--text-primary)]">
                            {m.status === 'unavailable' || m.value === null
                              ? 'N/A'
                              : formatMeasurement(m.value, unit, dec)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                            {targetStr}
                          </td>
                          <td className={`py-2.5 px-4 text-right capitalize ${statusCls}`}>
                            {m.status}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 6. Before / After Mix Revision Verification (v1 vs. v2) */}
            <RevisionDeltaPanel
              v1Report={report}
              v1File={selectedFile}
              genre={genre}
              mixStage={mixStage}
              consent={consent}
              comparison={revisionComparison}
              onComparisonChange={setRevisionComparison}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Original Multitrack Stem Overlap Matrix (Rule 1 Hard-Locked when has_user_stems === false) */}
      <StemOverlapMatrix
        consent={consent}
        primaryMixFile={selectedFile}
        stemReport={stemReport}
        onStemReportChange={setStemReport}
      />

      {/* Optional Collapsible DAW / Plugin Chain Context Drawer (Strictly user_reported_context) */}
      <section
        aria-label="Optional DAW and Plugin Chain Context"
        data-testid="daw-context-drawer"
        className="studio-elevated squircle-outer overflow-hidden"
      >
        <button
          type="button"
          onClick={() => setDawDrawerOpen((open) => !open)}
          aria-expanded={dawDrawerOpen}
          data-testid="daw-context-toggle"
          className="w-full px-5 py-4 flex flex-wrap items-center justify-between gap-3 text-left hover:bg-[var(--bg-surface)]/70 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 squircle-inner studio-surface flex items-center justify-center shrink-0">
              <SlidersHorizontal className="w-4 h-4 text-[var(--accent-primary)]" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold text-[var(--text-primary)]">
                  DAW &amp; Plugin Chain Context (Optional)
                </h2>
                <span
                  data-testid="daw-context-source-tag"
                  className="inline-flex items-center px-2 py-0.5 squircle-inner border border-[var(--border-hairline-color)] bg-[var(--bg-surface)] text-[10px] font-mono text-[var(--text-secondary)]"
                >
                  user_reported_context
                </span>
                {hasDawNotes && (
                  <span className="text-[11px] font-mono text-[var(--accent-primary)]">
                    · Session notes recorded
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Log your DAW, mix-bus routing, or plugin chain notes. Kept strictly separate from measured DSP metrics.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] shrink-0">
            <span>{dawDrawerOpen ? 'Collapse' : 'Expand'}</span>
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 ${
                dawDrawerOpen ? 'rotate-180' : ''
              }`}
            />
          </span>
        </button>

        <AnimatePresence initial={false}>
          {dawDrawerOpen && (
            <motion.div
              key="daw-drawer-body"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.24, ease: STUDIO_EASE }}
              className="overflow-hidden"
            >
              <div className="px-5 pb-5 pt-4 studio-hairline-t bg-[var(--bg-surface)] space-y-4">
                <div className="squircle-inner studio-elevated px-3.5 py-2.5 flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                  <Info className="w-4 h-4 text-[var(--accent-primary)] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-mono text-[11px] font-semibold text-[var(--text-primary)]">
                      DATA PROVENANCE BOUNDARY (user_reported_context):
                    </span>{' '}
                    Entries below are self-reported session notes only. They never alter, override, or fabricate mathematical DSP measurements (Rule 2).
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="daw-name-select"
                      className="block text-xs font-medium text-[var(--text-primary)] mb-1.5"
                    >
                      DAW Environment
                    </label>
                    <select
                      id="daw-name-select"
                      data-testid="daw-name-select"
                      value={dawContext.daw_name}
                      onChange={(e) => updateDawContext({ daw_name: e.target.value })}
                      className="w-full squircle-inner border border-[var(--border-hairline-color)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                    >
                      <option value="">Select DAW (optional)...</option>
                      {DAW_OPTIONS.filter(Boolean).map((daw) => (
                        <option key={daw} value={daw}>
                          {daw}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="daw-bus-routing"
                      className="block text-xs font-medium text-[var(--text-primary)] mb-1.5"
                    >
                      Bus Routing / Gain Staging Notes
                    </label>
                    <input
                      id="daw-bus-routing"
                      data-testid="daw-bus-routing"
                      type="text"
                      value={dawContext.bus_routing}
                      onChange={(e) => updateDawContext({ bus_routing: e.target.value })}
                      placeholder="e.g., Drum Bus -> Glue Comp (-2 dB GR) -> Stereo Out"
                      className="w-full squircle-inner border border-[var(--border-hairline-color)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/65 focus:outline-none focus:border-[var(--accent-primary)]"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="daw-plugin-chain"
                    className="block text-xs font-medium text-[var(--text-primary)] mb-1.5"
                  >
                    Active Mix-Bus / Mastering Plugin Chain Notes
                  </label>
                  <textarea
                    id="daw-plugin-chain"
                    data-testid="daw-plugin-chain"
                    rows={2}
                    value={dawContext.plugin_chain_notes}
                    onChange={(e) => updateDawContext({ plugin_chain_notes: e.target.value })}
                    placeholder="e.g., Pro-Q3 high-pass 30 Hz -> SSL Bus Comp 4:1 -> Pro-L2 ceiling -1.0 dBTP (bypassed for mix check)"
                    className="w-full squircle-inner border border-[var(--border-hairline-color)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/65 focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] font-mono text-[var(--text-secondary)]">
                  <span>
                    Tag: <strong className="text-[var(--text-primary)]">{dawContext.source_tag}</strong>
                    {dawContext.updated_at ? ` · Updated in session` : ' · Empty'}
                  </span>
                  {hasDawNotes && (
                    <button
                      type="button"
                      onClick={() => {
                        if (onDawContextChange) {
                          onDawContextChange(DEFAULT_DAW_CONTEXT);
                        } else {
                          setLocalDawContext(DEFAULT_DAW_CONTEXT);
                        }
                      }}
                      className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline underline-offset-2 cursor-pointer"
                    >
                      Clear Session Notes
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import { motion, MotionConfig } from 'motion/react';
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
import { DspAnalysisLoadingScreen } from './DspAnalysisLoadingScreen';
import { StemOverlapMatrix } from './StemOverlapMatrix';
import { RevisionDeltaPanel } from './RevisionDeltaPanel';
import { AiMentorPanel } from './AiMentorPanel';
import {
  Activity,
  ChevronDown,
  ChevronUp,
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

const SPRING_TRANSITION = { type: 'spring' as const, stiffness: 380, damping: 30 };

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

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6">
        {/* Workbench Header & Upload Controls */}
        <section
          aria-label="Advanced Mix Check Context Controls"
          className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-5 md:p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                Advanced Mix Check Workbench
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
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
                  className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-[#FAFAFA] dark:bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#3A7269]"
                >
                  {(Object.keys(GENRE_LABELS) as GenreId[]).map((g) => (
                    <option key={g} value={g}>
                      {GENRE_LABELS[g]}
                    </option>
                  ))}
                </select>
              </div>

              <div
                className="flex items-center gap-1 p-1 bg-[#F5F5F7] dark:bg-zinc-800 rounded-lg border border-zinc-200/80 dark:border-zinc-700"
                role="group"
                aria-label="Mix Stage"
              >
                {(['unmastered_mix', 'final_master'] as MixStage[]).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => onChangeMixStage(st)}
                    aria-pressed={mixStage === st}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      mixStage === st
                        ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-950 dark:text-zinc-100 font-semibold'
                        : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                    }`}
                  >
                    {MIX_STAGE_LABELS[st].title}
                  </button>
                ))}
              </div>

              {/* Primary Audio Bounce Upload */}
              <div className="flex items-center gap-1.5">
                <label
                  htmlFor="adv-audio-upload"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 bg-[#FAFAFA] dark:bg-zinc-950 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:border-[#3A7269] cursor-pointer transition-colors shrink-0 whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5 text-[#3A7269] dark:text-teal-400" />
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
                        className="px-2.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium transition-colors whitespace-nowrap"
                      >
                        Clear
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* File Metadata Strip */}
          {report && (
            <div className="mt-4 pt-3.5 border-t border-zinc-200/80 dark:border-zinc-800 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
              <span className="inline-flex items-center gap-1.5 text-zinc-900 dark:text-zinc-100 font-semibold">
                <FileAudio className="w-3.5 h-3.5 text-[#3A7269] dark:text-teal-400" />
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

        {/* Clean Empty State Prompt Card (Zero Preloaded Dummy Audio) */}
        {!report && !isAnalyzing && (
          <section
            role="region"
            aria-label="No Audio Loaded"
            data-testid="advanced-empty-state"
            className="border border-dashed border-zinc-300 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900/60 p-12 text-center space-y-4"
          >
            <div className="w-14 h-14 rounded-full bg-[#3A7269]/10 dark:bg-teal-950/60 text-[#3A7269] dark:text-teal-400 mx-auto flex items-center justify-center">
              <Activity className="w-7 h-7" />
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                No Audio Loaded Yet
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Select your genre, choose Unmastered Mix or Final Master, and upload your audio bounce (.WAV, .FLAC, .AIFF, or .MP3) above to open the Advanced Mix Check Workbench.
              </p>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed pt-1">
                Upload Mix (A) to start—once loaded, you can optionally add a Reference Track (B) for loudness-matched A/B comparison.
              </p>
            </div>
          </section>
        )}

        {/* Populated Asymmetric Studio Workbench */}
        {!isAnalyzing && report && (
          <>
            {/* 1. Tactile Transport & Translation Deck */}
            <section
              aria-label="Tactile Transport and Translation Deck"
              data-testid="tactile-transport-deck"
              className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-5 space-y-4"
            >
              {/* Primary Controls Row */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                {/* Left: Transport Play/Pause + Restart + Live Timecode */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => engine.togglePlay()}
                    disabled={!audioState.hasPrimaryMix}
                    aria-label={audioState.isPlaying ? 'Pause playback' : 'Start playback'}
                    data-testid="deck-play-toggle"
                    className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#3A7269] hover:bg-[#2F5E56] text-white transition-colors disabled:opacity-45 shrink-0"
                  >
                    {audioState.isPlaying ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4 ml-0.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => engine.seek(0, true)}
                    disabled={!audioState.hasPrimaryMix}
                    aria-label="Restart from beginning"
                    className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-[#FAFAFA] dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-45"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>

                  <div className="font-mono tabular-nums">
                    <div className="text-base font-bold text-zinc-900 dark:text-zinc-100 leading-none">
                      <span ref={deckTimecodeRef}>
                        {formatTimecode(engine.getCurrentTime())}
                      </span>
                      <span className="text-zinc-400 font-normal text-xs mx-1.5">/</span>
                      <span className="text-zinc-500 font-normal text-xs">
                        {formatTimecode(effectiveDuration)}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-2">
                      <span>
                        Deck {audioState.activeDeck}
                        {audioState.isLooping && audioState.loopRegion ? ' · Loop Active' : ''}
                      </span>
                      {audioState.loopRegion && (
                        <button
                          type="button"
                          onClick={() => engine.toggleLooping()}
                          className={`inline-flex items-center gap-1 font-medium transition-colors ${
                            audioState.isLooping
                              ? 'text-[#3A7269] dark:text-teal-400'
                              : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                          }`}
                        >
                          <Repeat className="w-3 h-3" />
                          <span>{audioState.isLooping ? 'Loop On' : 'Loop Off'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Three Segmented Tactile Pill Groups (motion/react layoutId) */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Segmented 1: Mix A / Reference B / Revision v2 */}
                  <div
                    role="group"
                    aria-label="Active Deck A/B/v2 Switcher"
                    className="inline-flex items-center p-1 rounded-lg bg-[#F5F5F7] dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800"
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
                        <button
                          key={deck}
                          type="button"
                          disabled={disabled}
                          onClick={() => engine.setActiveDeck(deck)}
                          aria-pressed={active}
                          data-testid={`deck-switch-${deck}`}
                          className={`relative px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                            active
                              ? 'text-white dark:text-white'
                              : 'text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white'
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="adv-ab-pill"
                              transition={SPRING_TRANSITION}
                              className="absolute inset-0 rounded-md bg-[#3A7269] dark:bg-teal-600"
                            />
                          )}
                          <span className="relative z-10">{deckLabel}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Segmented 2: Stereo / Mono (Equal-Power 0.5*L + 0.5*R) */}
                  <div
                    role="group"
                    aria-label="Stereo or Equal-Power Mono Folding"
                    className="inline-flex items-center p-1 rounded-lg bg-[#F5F5F7] dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800"
                  >
                    {[
                      { id: false, label: 'Stereo' },
                      { id: true, label: 'Mono' },
                    ].map((opt) => {
                      const active = audioState.monoMode === opt.id;
                      return (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => engine.setMonoMode(opt.id)}
                          aria-pressed={active}
                          data-testid={`monitoring-${opt.label.toLowerCase()}`}
                          className={`relative px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                            active
                              ? 'text-zinc-900 dark:text-zinc-100 font-semibold'
                              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="adv-mono-pill"
                              transition={SPRING_TRANSITION}
                              className="absolute inset-0 rounded-md bg-white dark:bg-zinc-800 shadow-xs border border-zinc-200/80 dark:border-zinc-700"
                            />
                          )}
                          <span className="relative z-10">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Segmented 3: Mix Translation Lab (Full / Phone / Laptop) */}
                  <div
                    role="group"
                    aria-label="Mix Translation Lab Filter Profile"
                    className="inline-flex items-center p-1 rounded-lg bg-[#F5F5F7] dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800"
                  >
                    {(['full', 'phone', 'laptop'] as TranslationMode[]).map((mode) => {
                      const active = audioState.translationMode === mode;
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => engine.setTranslationMode(mode)}
                          aria-pressed={active}
                          data-testid={`translation-${mode}`}
                          className={`relative px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                            active
                              ? 'text-zinc-900 dark:text-zinc-100 font-semibold'
                              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="adv-translation-pill"
                              transition={SPRING_TRANSITION}
                              className="absolute inset-0 rounded-md bg-white dark:bg-zinc-800 shadow-xs border border-zinc-200/80 dark:border-zinc-700"
                            />
                          )}
                          <span className="relative z-10">
                            {TRANSLATION_PROFILES[mode].shortLabel}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Reference Track B Upload + Loudness Match Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3.5 border-t border-zinc-200/80 dark:border-zinc-800 text-xs">
                <div className="flex flex-wrap items-center gap-2.5">
                  <label
                    htmlFor="adv-ref-upload"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-[#FAFAFA] dark:bg-zinc-950 hover:border-[#3A7269] text-zinc-700 dark:text-zinc-300 font-medium cursor-pointer transition-colors whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#3A7269] dark:text-teal-400" />
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
                      <span className="font-mono text-zinc-800 dark:text-zinc-200 truncate max-w-[200px]">
                        {audioState.referenceFileName}
                      </span>
                      <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">·</span>
                      <span
                        data-testid="reference-loudness-offset"
                        className="font-mono tabular-nums text-[#3A7269] dark:text-teal-400 font-semibold"
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
                        className="text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 underline underline-offset-2 whitespace-nowrap"
                      >
                        {audioState.loudnessMatchEnabled ? 'Matched (Click to Bypass)' : 'Match Bypassed'}
                      </button>
                      <button
                        type="button"
                        onClick={() => engine.clearReferenceTrack()}
                        aria-label="Remove Reference Track B"
                        className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
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
                      ? 'text-amber-800 dark:text-amber-300 font-medium'
                      : 'text-zinc-500 dark:text-zinc-400'
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
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-3.5 border-t border-zinc-200/80 dark:border-zinc-800">
                <div className="rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-[#FAFAFA] dark:bg-zinc-950/60 px-3.5 py-2.5">
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Integrated Loudness
                  </div>
                  <div className="text-lg font-bold font-mono tabular-nums text-zinc-900 dark:text-zinc-100 mt-0.5">
                    {formatMeasurement(report.measurements.integrated_loudness.value, 'LUFS')}
                  </div>
                </div>

                <div className="rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-[#FAFAFA] dark:bg-zinc-950/60 px-3.5 py-2.5">
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    True Peak Max
                  </div>
                  <div
                    className={`text-lg font-bold font-mono tabular-nums mt-0.5 ${
                      report.measurements.true_peak_max.status === 'critical'
                        ? 'text-rose-700 dark:text-rose-400'
                        : 'text-zinc-900 dark:text-zinc-100'
                    }`}
                  >
                    {formatMeasurement(report.measurements.true_peak_max.value, 'dBTP', 2, true)}
                  </div>
                </div>

                <div className="rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-[#FAFAFA] dark:bg-zinc-950/60 px-3.5 py-2.5">
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Loudness Range (LRA)
                  </div>
                  <div className="text-lg font-bold font-mono tabular-nums text-zinc-900 dark:text-zinc-100 mt-0.5">
                    {formatMeasurement(report.measurements.loudness_range_lra.value, 'LU')}
                  </div>
                </div>

                <div className="rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-[#FAFAFA] dark:bg-zinc-950/60 px-3.5 py-2.5">
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Phase Correlation (Mean / Min)
                  </div>
                  <div className="text-lg font-bold font-mono tabular-nums text-zinc-900 dark:text-zinc-100 mt-0.5">
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

            {/* 3. Three Clean Diagnostic Visualizations (Asymmetric Studio Grid) */}
            <div className="space-y-6">
              {/* Diagnostic 1: 6-Band Tonal Balance vs. Genre Target Envelope */}
              <SpectralTonalBalanceGraph
                report={report}
                genre={genre}
                mixStage={mixStage}
                measuredSixBands={audioState.primarySixBands}
                referenceSixBands={audioState.referenceSixBands}
                referenceFileName={audioState.referenceFileName}
                variant="advanced"
                onSelectFlaggedIssue={handleFocusIssue}
              />

              {/* Diagnostic 2 & 3: Asymmetric 7/5 Split — Short-Term LUFS Timeline + Phase Correlation Meter */}
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
                className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-6 space-y-4"
              >
                <div className="pb-3 border-b border-zinc-200 dark:border-zinc-800">
                  <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                    Objective Technical Warnings ({objectiveIssues.length})
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Deterministic boundary violations (true-peak overshoots, clipping, negative phase correlation).
                  </p>
                </div>

                {objectiveIssues.length === 0 ? (
                  <p className="text-xs text-[#3A7269] dark:text-teal-400 font-medium py-4">
                    No objective technical boundary violations detected for this stage.
                  </p>
                ) : (
                  <div className="divide-y divide-zinc-200/80 dark:divide-zinc-800">
                    {objectiveIssues.map((issue) => {
                      const isSelected = activeIssueId === issue.issue_id;
                      return (
                        <article
                          key={issue.issue_id}
                          onClick={() => handleFocusIssue(issue.issue_id)}
                          className={`py-4 first:pt-1 last:pb-1 cursor-pointer rounded-md transition-colors ${
                            isSelected
                              ? 'bg-[#3A7269]/[0.04] dark:bg-teal-950/25 px-3 -mx-3'
                              : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 text-xs font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                            <span
                              className={`font-semibold ${
                                issue.severity === 'critical'
                                  ? 'text-rose-700 dark:text-rose-400'
                                  : 'text-amber-700 dark:text-amber-400'
                              }`}
                            >
                              {issue.severity} · {(issue.confidence * 100).toFixed(0)}% confidence
                            </span>
                            <span>{issue.domain}</span>
                          </div>
                          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
                            {issue.title}
                          </h3>
                          <div className="mt-2 space-y-1 text-xs font-mono tabular-nums text-zinc-700 dark:text-zinc-300">
                            {issue.evidence.map((ev) => (
                              <div key={ev.metric_key} className="flex justify-between gap-2">
                                <span className="text-zinc-500 dark:text-zinc-400">
                                  {ev.metric_key}
                                </span>
                                <span className="font-semibold">
                                  {ev.measured_value} {ev.unit} (Target {ev.target_range})
                                </span>
                              </div>
                            ))}
                          </div>
                          <p className="mt-2.5 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                            <strong className="text-zinc-900 dark:text-zinc-200">Fix: </strong>
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
                className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-6 space-y-4"
              >
                <div className="pb-3 border-b border-zinc-200 dark:border-zinc-800">
                  <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                    Stylistic &amp; Genre Context Notes ({stylisticIssues.length})
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Tonal and macrodynamic traits compared against {GENRE_LABELS[genre]} conventions. Judge by ear.
                  </p>
                </div>

                {stylisticIssues.length === 0 ? (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 py-4">
                    No notable tonal or macrodynamic deviations flagged for {GENRE_LABELS[genre]}.
                  </p>
                ) : (
                  <div className="divide-y divide-zinc-200/80 dark:divide-zinc-800">
                    {stylisticIssues.map((issue) => {
                      const isSelected = activeIssueId === issue.issue_id;
                      return (
                        <article
                          key={issue.issue_id}
                          onClick={() => handleFocusIssue(issue.issue_id)}
                          className={`py-4 first:pt-1 last:pb-1 cursor-pointer rounded-md transition-colors ${
                            isSelected
                              ? 'bg-[#3A7269]/[0.04] dark:bg-teal-950/25 px-3 -mx-3'
                              : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 text-xs font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                            <span className="font-semibold text-[#3A7269] dark:text-teal-400">
                              stylistic · {(issue.confidence * 100).toFixed(0)}% confidence
                            </span>
                            <span>{issue.domain}</span>
                          </div>
                          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
                            {issue.title}
                          </h3>
                          <div className="mt-2 space-y-1 text-xs font-mono tabular-nums text-zinc-700 dark:text-zinc-300">
                            {issue.evidence.map((ev) => (
                              <div key={ev.metric_key} className="flex justify-between gap-2">
                                <span className="text-zinc-500 dark:text-zinc-400">
                                  {ev.metric_key}
                                </span>
                                <span className="font-semibold">
                                  {ev.measured_value} {ev.unit} ({ev.target_range})
                                </span>
                              </div>
                            ))}
                          </div>
                          <p className="mt-2.5 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                            <strong className="text-zinc-900 dark:text-zinc-200">Experiment: </strong>
                            {issue.learning_guide.what_to_try}
                          </p>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>

            {/* 4b. Phase 5: Evidence-Bound AI Mix Mentor & Artist Vision */}
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
              className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-6 space-y-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 pb-3 border-b border-zinc-200 dark:border-zinc-800">
                <div>
                  <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                    Complete Mathematical DSP Telemetry
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    ITU-R BS.1770-4, EBU R128, IEC 60268, and Welch PSD measurements (sole source of truth).
                  </p>
                </div>
                <span className="text-xs font-mono text-[#3A7269] dark:text-teal-400">
                  Source: {report.measurements.integrated_loudness.source}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 font-medium">
                      <th className="py-2.5 pr-4">Parameter</th>
                      <th className="py-2.5 px-4">Standard</th>
                      <th className="py-2.5 px-4 text-right">Measured</th>
                      <th className="py-2.5 px-4 text-right">Target Range</th>
                      <th className="py-2.5 pl-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-800/80">
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
                          ? 'text-rose-700 dark:text-rose-400 font-semibold'
                          : m.status === 'warning'
                          ? 'text-amber-700 dark:text-amber-400 font-semibold'
                          : m.status === 'unavailable'
                          ? 'text-zinc-400 dark:text-zinc-500'
                          : 'text-[#3A7269] dark:text-teal-400 font-medium';

                      return (
                        <tr
                          key={label}
                          className="hover:bg-[#FAFAFA] dark:hover:bg-zinc-950/50 transition-colors"
                        >
                          <td className="py-2.5 pr-4 font-medium text-zinc-900 dark:text-zinc-100">
                            {label}
                          </td>
                          <td className="py-2.5 px-4 text-zinc-500 dark:text-zinc-400">
                            {m.standard}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                            {m.status === 'unavailable' || m.value === null
                              ? 'N/A'
                              : formatMeasurement(m.value, unit, dec)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                            {targetStr}
                          </td>
                          <td className={`py-2.5 pl-4 text-right capitalize ${statusCls}`}>
                            {m.status}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 6. Phase 4: Before / After Mix Revision Verification (v1 vs. v2) */}
            <RevisionDeltaPanel
              v1Report={report}
              v1File={selectedFile}
              genre={genre}
              mixStage={mixStage}
              consent={consent}
              comparison={revisionComparison}
              onComparisonChange={setRevisionComparison}
            />
          </>
        )}

        {/* Phase 4: Original Multitrack Stem Overlap Matrix (Rule 1 Hard-Locked when has_user_stems === false) */}
        <StemOverlapMatrix
          consent={consent}
          primaryMixFile={selectedFile}
          stemReport={stemReport}
          onStemReportChange={setStemReport}
        />

        {/* Phase 4: Optional Collapsible DAW / Plugin Chain Context Drawer (Strictly user_reported_context) */}
        <section
          aria-label="Optional DAW and Plugin Chain Context"
          data-testid="daw-context-drawer"
          className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 overflow-hidden"
        >
          <button
            type="button"
            onClick={() => setDawDrawerOpen((open) => !open)}
            aria-expanded={dawDrawerOpen}
            data-testid="daw-context-toggle"
            className="w-full px-5 py-4 flex flex-wrap items-center justify-between gap-3 text-left hover:bg-[#FAFAFA] dark:hover:bg-zinc-950/60 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[#F5F5F7] dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shrink-0">
                <SlidersHorizontal className="w-4 h-4 text-zinc-600 dark:text-zinc-300" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    DAW &amp; Plugin Chain Context (Optional)
                  </h2>
                  <span
                    data-testid="daw-context-source-tag"
                    className="inline-flex items-center px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-[#F5F5F7] dark:bg-zinc-950 text-[10px] font-mono text-zinc-600 dark:text-zinc-400"
                  >
                    user_reported_context
                  </span>
                  {hasDawNotes && (
                    <span className="text-[11px] font-mono text-[#3A7269] dark:text-teal-400">
                      · Session notes recorded
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Log your DAW, mix-bus routing, or plugin chain notes. Kept strictly separate from measured DSP metrics.
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 shrink-0">
              <span>{dawDrawerOpen ? 'Collapse' : 'Expand'}</span>
              {dawDrawerOpen ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </span>
          </button>

          {dawDrawerOpen && (
            <div className="px-5 pb-5 pt-4 border-t border-zinc-200/80 dark:border-zinc-800 bg-[#FAFAFA] dark:bg-zinc-950/50 space-y-4">
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3.5 py-2.5 flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                <Info className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-mono text-[11px] font-semibold text-zinc-800 dark:text-zinc-200">
                    DATA PROVENANCE BOUNDARY (user_reported_context):
                  </span>{' '}
                  Entries below are self-reported session notes only. They never alter, override, or fabricate mathematical DSP measurements (Rule 2).
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="daw-name-select"
                    className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
                  >
                    DAW Environment
                  </label>
                  <select
                    id="daw-name-select"
                    data-testid="daw-name-select"
                    value={dawContext.daw_name}
                    onChange={(e) => updateDawContext({ daw_name: e.target.value })}
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#3A7269]"
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
                    className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
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
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#3A7269]"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="daw-plugin-chain"
                  className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
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
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#3A7269]"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                <span>
                  Tag: <strong className="text-zinc-800 dark:text-zinc-200">{dawContext.source_tag}</strong>
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
                    className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 underline underline-offset-2"
                  >
                    Clear Session Notes
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </MotionConfig>
  );
};

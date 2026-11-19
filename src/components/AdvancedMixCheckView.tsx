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
import { LiveSpectrumAnalyzer } from './LiveSpectrumAnalyzer';
import { SpectralTonalBalanceGraph } from './SpectralTonalBalanceGraph';
import { ShortTermLufsTimeline } from './ShortTermLufsTimeline';
import { PhaseCorrelationMeter } from './PhaseCorrelationMeter';
import { RealtimeLoudnessPeakMeter } from './RealtimeLoudnessPeakMeter';
import { StereoImagerVectorscope } from './StereoImagerVectorscope';
import { DspAnalysisLoadingScreen } from './DspAnalysisLoadingScreen';
import { StemOverlapMatrix } from './StemOverlapMatrix';
import { RevisionDeltaPanel } from './RevisionDeltaPanel';
import { AiMentorPanel } from './AiMentorPanel';
import { BRUT_EASE, BRUT_SPRING, TACTILE_TAP } from '../lib/motion';
import {
  Activity,
  FileAudio,
  Info,
  Pause,
  Play,
  Plus,
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

interface StreamingEstimateRow {
  platform: string;
  targetLufs: number;
  gainChangeDb: number | null;
  projectedPeakDbTp: number | null;
  note: string;
}

function computeStreamingEstimates(
  integratedLufs: number | null | undefined,
  truePeakDbTp: number | null | undefined
): StreamingEstimateRow[] {
  const platforms = [
    {
      platform: 'SPOTIFY (NORMAL)',
      targetLufs: -14.0,
      turnsUpQuiet: true,
      baseNote: 'Loudness normalization applies gain shift toward -14 LUFS.',
    },
    {
      platform: 'APPLE MUSIC (SOUND CHECK)',
      targetLufs: -16.0,
      turnsUpQuiet: true,
      baseNote: 'Sound Check targets approx. -16 LUFS album/track average.',
    },
    {
      platform: 'YOUTUBE',
      targetLufs: -14.0,
      turnsUpQuiet: false,
      baseNote: 'Attenuates mixes louder than -14 LUFS; does not boost quieter tracks.',
    },
  ];

  return platforms.map((p) => {
    if (integratedLufs === null || integratedLufs === undefined || !Number.isFinite(integratedLufs)) {
      return {
        platform: p.platform,
        targetLufs: p.targetLufs,
        gainChangeDb: null,
        projectedPeakDbTp: null,
        note: p.baseNote,
      };
    }
    const rawDelta = p.targetLufs - integratedLufs;
    const gainChangeDb = p.turnsUpQuiet ? rawDelta : Math.min(0, rawDelta);
    const projectedPeakDbTp =
      truePeakDbTp !== null && truePeakDbTp !== undefined && Number.isFinite(truePeakDbTp)
        ? truePeakDbTp + gainChangeDb
        : null;
    const note =
      gainChangeDb < -0.2
        ? `Estimated ${gainChangeDb.toFixed(1)} dB attenuation on playback.`
        : gainChangeDb > 0.2
        ? `Estimated +${gainChangeDb.toFixed(1)} dB playback boost (limiter-limited if near 0 dBTP).`
        : p.turnsUpQuiet
        ? 'Within ~0.2 dB of target normalization.'
        : 'No attenuation applied (below -14 LUFS threshold).';

    return {
      platform: p.platform,
      targetLufs: p.targetLufs,
      gainChangeDb,
      projectedPeakDbTp,
      note,
    };
  });
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

  // 60fps live timecode sync without React re-renders
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

  const streamingRows = report
    ? computeStreamingEstimates(
        report.measurements.integrated_loudness.value,
        report.measurements.true_peak_max.value
      )
    : [];

  const viewStateKey = isAnalyzing ? 'analyzing' : report ? `report-${report.report_id}` : 'empty';

  return (
    <div className="space-y-6">
      {/* WORKBENCH HEADER & UPLOAD CONTROLS */}
      <section
        aria-label="Advanced Mix Check Context Controls"
        className="border-2 border-[var(--border-ink)] bg-[var(--bg-canvas)]"
      >
        <div className="p-5 flex flex-wrap items-center justify-between gap-4 border-b-[1.5px] border-[var(--border-ink)] bg-[var(--bg-surface)]">
          <div>
            <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#FF3B1F]">
              02 · FULL MASTERING &amp; DIAGNOSTICS CONSOLE · /ADVANCED
            </div>
            <h1 className="font-display text-3xl sm:text-4xl uppercase text-[var(--ink)] mt-0.5">
              ADVANCED MIX WORKBENCH
            </h1>
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
                className="border-2 border-[var(--border-ink)] bg-[var(--bg-canvas)] px-3 py-2 text-xs font-bold uppercase text-[var(--ink)] focus:outline-none focus:bg-[#FFD600] focus:text-[#0A0A0A]"
              >
                {(Object.keys(GENRE_LABELS) as GenreId[]).map((g) => (
                  <option key={g} value={g}>
                    {GENRE_LABELS[g]}
                  </option>
                ))}
              </select>
            </div>

            <div
              className="inline-flex border-2 border-[var(--border-ink)] bg-[var(--bg-canvas)] divide-x-2 divide-[var(--border-ink)]"
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
                    className={`relative px-3 py-2 text-[11px] font-ui font-bold uppercase tracking-wider transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'text-[var(--bg-canvas)]'
                        : 'text-[var(--ink)] hover:bg-[var(--bg-surface)]'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="adv-stage-pill"
                        transition={BRUT_SPRING}
                        className="absolute inset-0 bg-[var(--ink)]"
                      />
                    )}
                    <span className="relative z-10">{MIX_STAGE_LABELS[st].title}</span>
                  </motion.button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <label
                htmlFor="adv-audio-upload"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`flex items-center gap-1.5 px-3 py-2 border-2 border-dashed border-[var(--border-ink)] text-xs font-mono font-bold uppercase cursor-pointer transition-colors shrink-0 whitespace-nowrap ${
                  isDragOver
                    ? 'bg-[#FFD600] text-[#0A0A0A]'
                    : 'bg-[var(--bg-canvas)] text-[var(--ink)] hover:bg-[#FFD600] hover:text-[#0A0A0A]'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span className="truncate max-w-[150px]">
                  {selectedFile ? selectedFile.name : 'UPLOAD MIX (A)'}
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
                    className="px-3 py-2 border-2 border-[var(--border-ink)] bg-[#FFD600] text-[#0A0A0A] hover:bg-[#0A0A0A] hover:text-[#FFD600] font-mono text-[11px] font-bold uppercase transition-colors disabled:opacity-50 inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>RE-RUN</span>
                  </motion.button>
                  {onClearFile && (
                    <motion.button
                      type="button"
                      whileTap={TACTILE_TAP}
                      onClick={onClearFile}
                      disabled={isAnalyzing}
                      className="px-2.5 py-2 border-2 border-[var(--border-ink)] bg-[var(--bg-canvas)] text-[var(--ink)] hover:bg-[#FF3B1F] hover:text-white font-mono text-[11px] font-bold uppercase transition-colors whitespace-nowrap cursor-pointer"
                    >
                      CLEAR
                    </motion.button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* File Metadata Strip */}
        {report && (
          <div className="px-5 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs font-mono tabular-nums text-[var(--ink-muted)] bg-[var(--bg-canvas)]">
            <span className="inline-flex items-center gap-1.5 text-[var(--ink)] font-bold">
              <FileAudio className="w-3.5 h-3.5" />
              {report.file_metadata.filename}
            </span>
            <span>{report.file_metadata.format}</span>
            <span>{report.file_metadata.sample_rate_hz} HZ</span>
            <span>
              {report.file_metadata.bit_depth ? `${report.file_metadata.bit_depth}-BIT` : 'FLOAT32'}
            </span>
            <span>{report.file_metadata.channels === 1 ? 'MONO' : 'STEREO'}</span>
            <span>{formatTimecode(report.file_metadata.duration_seconds)}</span>
          </div>
        )}
      </section>

      {/* BODY STATE TRANSITION */}
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
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.24, ease: BRUT_EASE }}
            className={`border-2 border-[var(--border-ink)] p-10 sm:p-14 text-center space-y-5 transition-colors ${
              isDragOver ? 'bg-[#FFD600] text-[#0A0A0A]' : 'bg-[var(--bg-canvas)]'
            }`}
          >
            <div className="w-16 h-16 border-2 border-[var(--border-ink)] bg-[#FF3B1F] text-white mx-auto flex items-center justify-center">
              <Activity className="w-7 h-7" />
            </div>
            <div className="max-w-lg mx-auto space-y-2">
              <h2 className="font-display text-3xl sm:text-4xl uppercase text-[var(--ink)]">
                NO AUDIO LOADED YET
              </h2>
              <p className="text-xs sm:text-sm text-[var(--ink-muted)] leading-relaxed">
                Drop Mix (A) here or choose a bounce (.WAV, .FLAC, .AIFF, .MP3) to launch the 60fps Live Spectrum, Waveform, Peak/LUFS, Goniometer, A/B Reference Deck, and Translation Lab.
              </p>
              <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
                <label
                  htmlFor="adv-audio-upload"
                  className="inline-flex items-center gap-2 px-5 py-3 border-2 border-[var(--border-ink)] bg-[var(--bg-canvas)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--bg-canvas)] font-ui text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  <span>UPLOAD MIX (A)</span>
                </label>
                {(onLoadDemoTrack || onLoadDemonstration) && (
                  <motion.button
                    type="button"
                    whileTap={TACTILE_TAP}
                    onClick={onLoadDemoTrack || onLoadDemonstration}
                    data-testid="load-demo-track-btn"
                    className="inline-flex items-center gap-2 px-5 py-3 border-2 border-[var(--border-ink)] bg-[#FFD600] text-[#0A0A0A] hover:bg-[#0A0A0A] hover:text-[#FFD600] font-mono text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    <Activity className="w-4 h-4" />
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
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.26, ease: BRUT_EASE }}
            className="space-y-6"
          >
            {/* 1. SHARP GRID TRANSPORT & TRANSLATION DECK */}
            <section
              aria-label="Tactile Transport and Translation Deck"
              data-testid="tactile-transport-deck"
              className="border-2 border-[var(--border-ink)] bg-[var(--bg-canvas)]"
            >
              {/* Controls Row */}
              <div className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 border-b-[1.5px] border-[var(--border-ink)]">
                {/* Transport Play/Pause + Restart + Live Timecode */}
                <div className="flex items-center gap-3">
                  <motion.button
                    type="button"
                    whileTap={TACTILE_TAP}
                    onClick={() => engine.togglePlay()}
                    disabled={!audioState.hasPrimaryMix}
                    aria-label={audioState.isPlaying ? 'Pause playback' : 'Start playback'}
                    data-testid="deck-play-toggle"
                    className={`inline-flex items-center justify-center w-11 h-11 border-2 border-[var(--border-ink)] transition-colors disabled:opacity-45 shrink-0 cursor-pointer ${
                      audioState.isPlaying
                        ? 'bg-[#FF3B1F] text-white'
                        : 'bg-[#FFD600] text-[#0A0A0A] hover:bg-[#0A0A0A] hover:text-[#FFD600]'
                    }`}
                  >
                    {audioState.isPlaying ? (
                      <Pause className="w-5 h-5" />
                    ) : (
                      <Play className="w-5 h-5 ml-0.5" />
                    )}
                  </motion.button>

                  <motion.button
                    type="button"
                    whileTap={TACTILE_TAP}
                    onClick={() => engine.seek(0, true)}
                    disabled={!audioState.hasPrimaryMix}
                    aria-label="Restart from beginning"
                    className="w-11 h-11 border-2 border-[var(--border-ink)] bg-[var(--bg-surface)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--bg-canvas)] flex items-center justify-center transition-colors disabled:opacity-45 cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </motion.button>

                  <div className="font-mono tabular-nums pl-1">
                    <div className="text-lg font-bold text-[var(--ink)] leading-none">
                      <span ref={deckTimecodeRef}>
                        {formatTimecode(engine.getCurrentTime())}
                      </span>
                      <span className="opacity-35 font-normal text-xs mx-1.5">/</span>
                      <span className="text-[var(--ink-muted)] font-normal text-xs">
                        {formatTimecode(effectiveDuration)}
                      </span>
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)] mt-1 flex items-center gap-2">
                      <span>DECK {audioState.activeDeck}</span>
                      {audioState.loopRegion && (
                        <button
                          type="button"
                          onClick={() => engine.toggleLooping()}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 border border-[var(--border-ink)] transition-colors cursor-pointer ${
                            audioState.isLooping
                              ? 'bg-[#FFD600] text-[#0A0A0A]'
                              : 'bg-[var(--bg-surface)] text-[var(--ink)]'
                          }`}
                        >
                          <Repeat className="w-3 h-3" />
                          <span>{audioState.isLooping ? 'LOOP ON' : 'LOOP OFF'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Mechanical Segmented Switches */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* MIX A / REF B / REV V2 */}
                  <div
                    role="group"
                    aria-label="Active Deck A/B/v2 Switcher"
                    className="inline-flex border-2 border-[var(--border-ink)] bg-[var(--bg-surface)] divide-x-2 divide-[var(--border-ink)]"
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
                            ? 'MIX V1'
                            : 'MIX A'
                          : deck === 'V2'
                          ? 'REV V2'
                          : 'REF B';
                      return (
                        <motion.button
                          key={deck}
                          type="button"
                          whileTap={disabled ? undefined : TACTILE_TAP}
                          disabled={disabled}
                          onClick={() => engine.setActiveDeck(deck)}
                          aria-pressed={active}
                          data-testid={`deck-switch-${deck}`}
                          className={`relative px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer ${
                            active
                              ? 'text-[#0A0A0A]'
                              : 'text-[var(--ink)] hover:bg-[var(--bg-canvas)]'
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="adv-ab-pill"
                              transition={BRUT_SPRING}
                              className="absolute inset-0 bg-[#FFD600]"
                            />
                          )}
                          <span className="relative z-10">{deckLabel}</span>
                        </motion.button>
                      );
                    })}
                  </div>

                  {/* STEREO / MONO */}
                  <div
                    role="group"
                    aria-label="Stereo or Equal-Power Mono Folding"
                    className="inline-flex border-2 border-[var(--border-ink)] bg-[var(--bg-surface)] divide-x-2 divide-[var(--border-ink)]"
                  >
                    {[
                      { id: false, label: 'STEREO' },
                      { id: true, label: 'MONO' },
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
                          className={`relative px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap cursor-pointer ${
                            active
                              ? 'text-[var(--bg-canvas)]'
                              : 'text-[var(--ink)] hover:bg-[var(--bg-canvas)]'
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="adv-mono-pill"
                              transition={BRUT_SPRING}
                              className="absolute inset-0 bg-[var(--ink)]"
                            />
                          )}
                          <span className="relative z-10">{opt.label}</span>
                        </motion.button>
                      );
                    })}
                  </div>

                  {/* FULL / PHONE / LAPTOP */}
                  <div
                    role="group"
                    aria-label="Mix Translation Lab Filter Profile"
                    className="inline-flex border-2 border-[var(--border-ink)] bg-[var(--bg-surface)] divide-x-2 divide-[var(--border-ink)]"
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
                          className={`relative px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap cursor-pointer ${
                            active
                              ? 'text-[var(--bg-canvas)]'
                              : 'text-[var(--ink)] hover:bg-[var(--bg-canvas)]'
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="adv-translation-pill"
                              transition={BRUT_SPRING}
                              className="absolute inset-0 bg-[var(--ink)]"
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

              {/* Reference B Loader + Rule 6 Disclosure */}
              <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 border-b-[1.5px] border-[var(--border-ink)] bg-[var(--bg-surface)] text-xs">
                <div className="flex flex-wrap items-center gap-2.5">
                  <label
                    htmlFor="adv-ref-upload"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border-[1.5px] border-[var(--border-ink)] bg-[var(--bg-canvas)] hover:bg-[#FFD600] hover:text-[#0A0A0A] font-mono text-[11px] font-bold uppercase cursor-pointer transition-colors whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>
                      {audioState.loadingReference
                        ? 'DECODING REF B...'
                        : audioState.hasReferenceTrack
                        ? 'CHANGE REF B'
                        : 'LOAD REFERENCE (B)'}
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
                      <span className="font-mono font-bold text-[var(--ink)] truncate max-w-[180px]">
                        {audioState.referenceFileName}
                      </span>
                      <span
                        data-testid="reference-loudness-offset"
                        className="px-2 py-0.5 border border-[var(--border-ink)] bg-[#FFD600] text-[#0A0A0A] font-mono text-[11px] font-bold tabular-nums"
                      >
                        MATCH:{' '}
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
                        className="font-mono text-[11px] font-bold uppercase underline underline-offset-2 text-[var(--ink)] cursor-pointer"
                      >
                        {audioState.loudnessMatchEnabled ? 'MATCH ON' : 'BYPASSED'}
                      </button>
                      <button
                        type="button"
                        onClick={() => engine.clearReferenceTrack()}
                        aria-label="Remove Reference Track B"
                        className="p-1 border border-[var(--border-ink)] hover:bg-[#FF3B1F] hover:text-white cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>

                <div
                  data-testid="translation-disclosure"
                  className={`flex items-center gap-1.5 font-mono text-[11px] ${
                    activeTranslationProfile.isApproximation
                      ? 'text-[#FF3B1F] font-bold'
                      : 'text-[var(--ink-muted)]'
                  }`}
                >
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    <strong>{activeTranslationProfile.label.toUpperCase()}:</strong>{' '}
                    {activeTranslationProfile.disclosure}
                  </span>
                </div>
              </div>

              {/* 4-Cell Key Telemetry Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 divide-x-[1.5px] divide-y-[1.5px] lg:divide-y-0 divide-[var(--border-ink)]">
                <div className="p-4 bg-[var(--bg-canvas)]">
                  <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">
                    INTEGRATED LOUDNESS
                  </div>
                  <div className="text-xl font-bold font-mono tabular-nums text-[var(--ink)] mt-1">
                    {formatMeasurement(report.measurements.integrated_loudness.value, 'LUFS')}
                  </div>
                </div>

                <div className="p-4 bg-[var(--bg-canvas)]">
                  <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">
                    TRUE PEAK MAX
                  </div>
                  <div
                    className={`text-xl font-bold font-mono tabular-nums mt-1 ${
                      report.measurements.true_peak_max.status === 'critical'
                        ? 'text-[#FF3B1F]'
                        : 'text-[var(--ink)]'
                    }`}
                  >
                    {formatMeasurement(report.measurements.true_peak_max.value, 'dBTP', 2, true)}
                  </div>
                </div>

                <div className="p-4 bg-[var(--bg-canvas)]">
                  <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">
                    LOUDNESS RANGE (LRA)
                  </div>
                  <div className="text-xl font-bold font-mono tabular-nums text-[var(--ink)] mt-1">
                    {formatMeasurement(report.measurements.loudness_range_lra.value, 'LU')}
                  </div>
                </div>

                <div className="p-4 bg-[var(--bg-canvas)]">
                  <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">
                    PHASE CORRELATION (MEAN / MIN)
                  </div>
                  <div className="text-xl font-bold font-mono tabular-nums text-[var(--ink)] mt-1">
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

            {/* 2. 60FPS WAVEFORM INSPECTOR */}
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

            {/* 3. LIVE STUDIO METERING GRID: FULL-WIDTH 60FPS SPECTRUM + SIDE-BY-SIDE PEAK/LUFS & VECTORSCOPE */}
            <LiveSpectrumAnalyzer
              mode="advanced"
              height={244}
              issues={report.issues}
              activeIssueId={activeIssueId}
              staticSpectrumBins={audioState.primarySpectrumBins}
              staticSixBands={audioState.primarySixBands}
              title="LIVE 60FPS FFT SPECTRUM ANALYZER · 20 HZ – 20 KHZ"
              subtitle={`DECK ${audioState.activeDeck} · ${audioState.monoMode ? 'MONO' : 'STEREO'}`}
              onSelectZone={(_zoneId, matchedIssueId) => {
                if (matchedIssueId) {
                  handleFocusIssue(matchedIssueId);
                }
              }}
            />

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

            {/* 4. DEEP ENGINEERING MODULES: 6-BAND GENRE ENVELOPE & STREAMING NORMALIZATION ESTIMATES */}
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

            {/* Streaming Normalization Estimates (Spotify / Apple Music / YouTube — Rule 7 Explicit Estimate Disclosure) */}
            <section
              aria-label="Streaming Normalization Estimates"
              data-testid="streaming-normalization-estimates"
              className="border-2 border-[var(--border-ink)] bg-[var(--bg-canvas)]"
            >
              <div className="px-5 py-4 border-b-2 border-[var(--border-ink)] bg-[var(--bg-surface)] flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--ink-muted)]">
                    RULE 7 · DOCUMENTED PLAYBACK ESTIMATES
                  </div>
                  <h2 className="font-display text-2xl uppercase text-[var(--ink)] mt-0.5">
                    STREAMING NORMALIZATION ESTIMATES
                  </h2>
                </div>
                <span className="px-2.5 py-1 border-[1.5px] border-[var(--border-ink)] bg-[var(--bg-canvas)] font-mono text-[10px] font-bold uppercase">
                  ESTIMATE · NOT PLATFORM CERTIFICATION
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 divide-y-[1.5px] md:divide-y-0 md:divide-x-[1.5px] divide-[var(--border-ink)]">
                {streamingRows.map((row) => (
                  <div key={row.platform} className="p-5 flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-center justify-between gap-2 font-mono text-[11px] font-bold uppercase">
                        <span className="text-[var(--ink)]">{row.platform}</span>
                        <span className="text-[var(--ink-muted)] tabular-nums">
                          TARGET {row.targetLufs.toFixed(1)} LUFS
                        </span>
                      </div>
                      <div className="mt-3 flex items-baseline justify-between gap-2 font-mono tabular-nums">
                        <span
                          className={`text-2xl font-bold ${
                            row.gainChangeDb !== null && row.gainChangeDb < -1.0
                              ? 'text-[#FF3B1F]'
                              : 'text-[var(--ink)]'
                          }`}
                        >
                          {row.gainChangeDb !== null
                            ? `${row.gainChangeDb >= 0 ? '+' : ''}${row.gainChangeDb.toFixed(1)} dB`
                            : 'N/A'}
                        </span>
                        <span className="text-[11px] text-[var(--ink-muted)]">
                          PROJ. PEAK:{' '}
                          <strong className="text-[var(--ink)]">
                            {row.projectedPeakDbTp !== null
                              ? `${row.projectedPeakDbTp.toFixed(1)} dBTP`
                              : 'N/A'}
                          </strong>
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-[var(--ink-muted)] pt-2.5 border-t border-[var(--border-ink)]/20 leading-relaxed">
                      {row.note}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* 5. OBJECTIVE TECHNICAL WARNINGS VS. SUBJECTIVE STYLISTIC NOTES (RULE 8) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section
                aria-label="Objective Technical Warnings"
                className="border-2 border-[var(--border-ink)] bg-[var(--bg-canvas)]"
              >
                <div className="px-5 py-4 border-b-2 border-[var(--border-ink)] bg-[#FF3B1F] text-white">
                  <div className="font-mono text-[10px] font-bold uppercase tracking-widest opacity-85">
                    RULE 8 · DETERMINISTIC BOUNDARY ALERTS
                  </div>
                  <h2 className="font-display text-2xl uppercase mt-0.5">
                    OBJECTIVE TECHNICAL WARNINGS ({objectiveIssues.length})
                  </h2>
                </div>

                {objectiveIssues.length === 0 ? (
                  <p className="p-5 font-mono text-xs font-bold uppercase text-[var(--ink)]">
                    NO OBJECTIVE TECHNICAL BOUNDARY VIOLATIONS DETECTED FOR THIS STAGE.
                  </p>
                ) : (
                  <div className="divide-y-[1.5px] divide-[var(--border-ink)]">
                    {objectiveIssues.map((issue) => {
                      const isSelected = activeIssueId === issue.issue_id;
                      return (
                        <article
                          key={issue.issue_id}
                          data-testid={`diagnostic-card-${issue.issue_id}`}
                          onClick={() => handleFocusIssue(issue.issue_id)}
                          className={`p-5 cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-[#FFD600]/20 border-l-4 border-l-[#FF3B1F]'
                              : 'bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface)]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 font-mono text-[10px] font-bold uppercase tabular-nums">
                            <span
                              className={`px-1.5 py-0.5 border border-[var(--border-ink)] ${
                                issue.severity === 'critical'
                                  ? 'bg-[#FF3B1F] text-white'
                                  : 'bg-[#FFD600] text-[#0A0A0A]'
                              }`}
                            >
                              {issue.severity} · {(issue.confidence * 100).toFixed(0)}%
                            </span>
                            <span className="text-[var(--ink-muted)]">{issue.domain}</span>
                          </div>
                          <h3 className="font-ui text-sm font-bold uppercase text-[var(--ink)] mt-2">
                            {issue.title}
                          </h3>
                          <div className="mt-2.5 space-y-1 font-mono text-[11px] tabular-nums border-y border-[var(--border-ink)]/20 py-2">
                            {issue.evidence.map((ev) => (
                              <div key={ev.metric_key} className="flex justify-between gap-2">
                                <span className="text-[var(--ink-muted)]">{ev.metric_key}</span>
                                <span className="font-bold text-[var(--ink)]">
                                  {ev.measured_value} {ev.unit} ({ev.target_range})
                                </span>
                              </div>
                            ))}
                          </div>
                          <p className="mt-2.5 text-xs text-[var(--ink-muted)] leading-relaxed">
                            <strong className="text-[var(--ink)] uppercase">FIX: </strong>
                            {issue.learning_guide.what_to_try}
                          </p>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <section
                aria-label="Subjective Stylistic Differences"
                className="border-2 border-[var(--border-ink)] bg-[var(--bg-canvas)]"
              >
                <div className="px-5 py-4 border-b-2 border-[var(--border-ink)] bg-[var(--ink)] text-[var(--bg-canvas)]">
                  <div className="font-mono text-[10px] font-bold uppercase tracking-widest opacity-75">
                    RULE 8 · {GENRE_LABELS[genre].toUpperCase()} CONTEXT · JUDGE BY EAR
                  </div>
                  <h2 className="font-display text-2xl uppercase mt-0.5">
                    STYLISTIC &amp; GENRE NOTES ({stylisticIssues.length})
                  </h2>
                </div>

                {stylisticIssues.length === 0 ? (
                  <p className="p-5 font-mono text-xs uppercase text-[var(--ink-muted)]">
                    NO NOTABLE TONAL OR MACRODYNAMIC DEVIATIONS FLAGGED FOR {GENRE_LABELS[genre]}.
                  </p>
                ) : (
                  <div className="divide-y-[1.5px] divide-[var(--border-ink)]">
                    {stylisticIssues.map((issue) => {
                      const isSelected = activeIssueId === issue.issue_id;
                      return (
                        <article
                          key={issue.issue_id}
                          data-testid={`diagnostic-card-${issue.issue_id}`}
                          onClick={() => handleFocusIssue(issue.issue_id)}
                          className={`p-5 cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-[#FFD600]/20 border-l-4 border-l-[#0A0A0A]'
                              : 'bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface)]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 font-mono text-[10px] font-bold uppercase tabular-nums">
                            <span className="px-1.5 py-0.5 border border-[var(--border-ink)] bg-[#FFD600] text-[#0A0A0A]">
                              STYLISTIC · {(issue.confidence * 100).toFixed(0)}%
                            </span>
                            <span className="text-[var(--ink-muted)]">{issue.domain}</span>
                          </div>
                          <h3 className="font-ui text-sm font-bold uppercase text-[var(--ink)] mt-2">
                            {issue.title}
                          </h3>
                          <div className="mt-2.5 space-y-1 font-mono text-[11px] tabular-nums border-y border-[var(--border-ink)]/20 py-2">
                            {issue.evidence.map((ev) => (
                              <div key={ev.metric_key} className="flex justify-between gap-2">
                                <span className="text-[var(--ink-muted)]">{ev.metric_key}</span>
                                <span className="font-bold text-[var(--ink)]">
                                  {ev.measured_value} {ev.unit} ({ev.target_range})
                                </span>
                              </div>
                            ))}
                          </div>
                          <p className="mt-2.5 text-xs text-[var(--ink-muted)] leading-relaxed">
                            <strong className="text-[var(--ink)] uppercase">EXPERIMENT: </strong>
                            {issue.learning_guide.what_to_try}
                          </p>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>

            {/* 6. EVIDENCE-CITED AI MENTOR */}
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

            {/* 7. COMPLETE MATHEMATICAL DSP TELEMETRY TABLE */}
            <section
              aria-label="Standardized Mathematical DSP Measurements Table"
              className="border-2 border-[var(--border-ink)] bg-[var(--bg-canvas)]"
            >
              <div className="px-5 py-4 border-b-2 border-[var(--border-ink)] bg-[var(--bg-surface)] flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--ink-muted)]">
                    RULE 2 · SOLE SOURCE OF TRUTH
                  </div>
                  <h2 className="font-display text-2xl uppercase text-[var(--ink)] mt-0.5">
                    COMPLETE MATHEMATICAL DSP TELEMETRY
                  </h2>
                </div>
                <span className="font-mono text-[11px] font-bold uppercase px-2.5 py-1 border-[1.5px] border-[var(--border-ink)] bg-[var(--bg-canvas)]">
                  SOURCE: {report.measurements.integrated_loudness.source}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[var(--ink)] text-[var(--bg-canvas)] font-mono text-[10px] uppercase tracking-wider">
                      <th className="py-2.5 px-4">PARAMETER</th>
                      <th className="py-2.5 px-4">STANDARD</th>
                      <th className="py-2.5 px-4 text-right">MEASURED</th>
                      <th className="py-2.5 px-4 text-right">TARGET</th>
                      <th className="py-2.5 px-4 text-right">STATUS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-ink)]/25">
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
                          ? 'bg-[#FF3B1F] text-white'
                          : m.status === 'warning'
                          ? 'bg-[#FFD600] text-[#0A0A0A]'
                          : m.status === 'unavailable'
                          ? 'bg-[var(--bg-surface)] text-[var(--ink-muted)]'
                          : 'bg-[var(--ink)] text-[var(--bg-canvas)]';

                      return (
                        <tr key={label} className="hover:bg-[var(--bg-surface)] transition-colors">
                          <td className="py-2.5 px-4 font-semibold text-[var(--ink)]">{label}</td>
                          <td className="py-2.5 px-4 font-mono text-[11px] text-[var(--ink-muted)]">
                            {m.standard}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-[var(--ink)]">
                            {m.status === 'unavailable' || m.value === null
                              ? 'N/A'
                              : formatMeasurement(m.value, unit, dec)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[var(--ink-muted)]">
                            {targetStr}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <span
                              className={`inline-block px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${statusCls}`}
                            >
                              {m.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 8. BEFORE / AFTER REVISION DELTA (v1 -> v2) */}
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

      {/* 9. ORIGINAL MULTITRACK STEM OVERLAP MATRIX (RULE 1 HARD-LOCK) */}
      <StemOverlapMatrix
        consent={consent}
        primaryMixFile={selectedFile}
        stemReport={stemReport}
        onStemReportChange={setStemReport}
      />

      {/* 10. OPTIONAL COLLAPSIBLE DAW / PLUGIN CONTEXT DRAWER */}
      <section
        aria-label="Optional DAW and Plugin Chain Context"
        data-testid="daw-context-drawer"
        className="border-2 border-[var(--border-ink)] bg-[var(--bg-canvas)]"
      >
        <button
          type="button"
          onClick={() => setDawDrawerOpen((open) => !open)}
          aria-expanded={dawDrawerOpen}
          data-testid="daw-context-toggle"
          className="w-full px-5 py-4 flex flex-wrap items-center justify-between gap-3 text-left bg-[var(--bg-surface)] hover:bg-[#FFD600]/20 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 border-2 border-[var(--border-ink)] bg-[var(--bg-canvas)] flex items-center justify-center shrink-0">
              <SlidersHorizontal className="w-4 h-4 text-[var(--ink)]" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-ui text-sm font-bold uppercase text-[var(--ink)]">
                  DAW &amp; PLUGIN CHAIN CONTEXT (OPTIONAL)
                </h2>
                <span
                  data-testid="daw-context-source-tag"
                  className="px-2 py-0.5 border border-[var(--border-ink)] bg-[var(--bg-canvas)] text-[10px] font-mono font-bold text-[var(--ink)]"
                >
                  user_reported_context
                </span>
                {hasDawNotes && (
                  <span className="px-2 py-0.5 bg-[#FFD600] text-[#0A0A0A] text-[10px] font-mono font-bold uppercase">
                    NOTES RECORDED
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                Log DAW, bus routing, or plugin chain notes. Strictly isolated from DSP metrics.
              </p>
            </div>
          </div>

          <span className="w-8 h-8 border-2 border-[var(--border-ink)] bg-[var(--bg-canvas)] flex items-center justify-center shrink-0">
            {dawDrawerOpen ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          </span>
        </button>

        <AnimatePresence initial={false}>
          {dawDrawerOpen && (
            <motion.div
              key="daw-drawer-body"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: BRUT_EASE }}
              className="overflow-hidden"
            >
              <div className="p-5 border-t-2 border-[var(--border-ink)] bg-[var(--bg-canvas)] space-y-4">
                <div className="border-[1.5px] border-[var(--border-ink)] bg-[var(--bg-surface)] px-3.5 py-2.5 flex items-start gap-2 text-xs text-[var(--ink-muted)]">
                  <Info className="w-4 h-4 text-[var(--ink)] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-mono text-[11px] font-bold text-[var(--ink)]">
                      DATA PROVENANCE BOUNDARY (user_reported_context):
                    </span>{' '}
                    Entries below are self-reported session notes only. They never alter or fabricate DSP measurements (Rule 2).
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="daw-name-select"
                      className="block font-mono text-[11px] font-bold uppercase text-[var(--ink)] mb-1.5"
                    >
                      DAW ENVIRONMENT
                    </label>
                    <select
                      id="daw-name-select"
                      data-testid="daw-name-select"
                      value={dawContext.daw_name}
                      onChange={(e) => updateDawContext({ daw_name: e.target.value })}
                      className="w-full border-2 border-[var(--border-ink)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--ink)] focus:outline-none"
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
                      className="block font-mono text-[11px] font-bold uppercase text-[var(--ink)] mb-1.5"
                    >
                      BUS ROUTING / GAIN STAGING NOTES
                    </label>
                    <input
                      id="daw-bus-routing"
                      data-testid="daw-bus-routing"
                      type="text"
                      value={dawContext.bus_routing}
                      onChange={(e) => updateDawContext({ bus_routing: e.target.value })}
                      placeholder="e.g., Drum Bus -> Glue Comp (-2 dB GR) -> Stereo Out"
                      className="w-full border-2 border-[var(--border-ink)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--ink)] placeholder:text-[var(--ink-muted)]/65 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="daw-plugin-chain"
                    className="block font-mono text-[11px] font-bold uppercase text-[var(--ink)] mb-1.5"
                  >
                    ACTIVE MIX-BUS / MASTERING PLUGIN CHAIN NOTES
                  </label>
                  <textarea
                    id="daw-plugin-chain"
                    data-testid="daw-plugin-chain"
                    rows={2}
                    value={dawContext.plugin_chain_notes}
                    onChange={(e) => updateDawContext({ plugin_chain_notes: e.target.value })}
                    placeholder="e.g., Pro-Q3 HPF 30 Hz -> SSL Bus Comp 4:1 -> Pro-L2 ceiling -1.0 dBTP"
                    className="w-full border-2 border-[var(--border-ink)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--ink)] placeholder:text-[var(--ink-muted)]/65 focus:outline-none"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 font-mono text-[11px] text-[var(--ink-muted)]">
                  <span>
                    TAG: <strong className="text-[var(--ink)]">{dawContext.source_tag}</strong>
                    {dawContext.updated_at ? ' · UPDATED IN SESSION' : ' · EMPTY'}
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
                      className="font-bold uppercase text-[var(--ink)] underline underline-offset-2 cursor-pointer"
                    >
                      CLEAR SESSION NOTES
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

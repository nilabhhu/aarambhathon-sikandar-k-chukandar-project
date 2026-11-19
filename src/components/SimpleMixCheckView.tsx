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
import { LiveSpectrumAnalyzer } from './LiveSpectrumAnalyzer';
import { DspAnalysisLoadingScreen } from './DspAnalysisLoadingScreen';
import { AiMentorPanel } from './AiMentorPanel';
import { BRUT_EASE, BRUT_SPRING, TACTILE_TAP } from '../lib/motion';
import {
  Upload,
  ArrowUpRight,
  Volume2,
  Activity,
  RotateCcw,
  X,
  FileAudio,
  Plus,
  Play,
  Check,
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

type TrafficLevel = 'pass' | 'caution' | 'alert' | 'neutral';

function trafficBadgeClasses(level: TrafficLevel): string {
  switch (level) {
    case 'pass':
      return 'bg-[#0A0A0A] text-[#FFD600] border-[#0A0A0A] dark:bg-[#FFD600] dark:text-[#0A0A0A] dark:border-[#FFD600]';
    case 'caution':
      return 'bg-[#FFD600] text-[#0A0A0A] border-[#0A0A0A]';
    case 'alert':
      return 'bg-[#FF3B1F] text-white border-[#0A0A0A] dark:border-white';
    default:
      return 'bg-[var(--bg-surface)] text-[var(--ink-muted)] border-[var(--border-ink)]';
  }
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
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    const first = report?.issues?.[0];
    setActiveIssueId(first?.issue_id ?? null);
    const firstRecId = report?.recommendations?.[0]?.recommendation_id;
    setExpandedGuides(firstRecId ? { [firstRecId]: true } : {});
  }, [report?.report_id]);

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

  const handleFocusIssue = (issueId: string, audition = false) => {
    setActiveIssueId(issueId);
    const matchingRec = report?.recommendations.find((r) => r.linked_issue_id === issueId);
    if (matchingRec) {
      setExpandedGuides((prev) => ({ ...prev, [matchingRec.recommendation_id]: true }));
    }
    const found = report?.issues.find((i) => i.issue_id === issueId);
    if (found?.timestamps?.[0]) {
      const ts = found.timestamps[0];
      engine.setLoopRegion({
        startSec: ts.start_sec,
        endSec: Math.max(ts.start_sec + 1.0, ts.end_sec),
        label: ts.label,
      });
      if (audition && audioState.hasPrimaryMix) {
        engine.seekAndPlay(ts.start_sec).catch(() => {});
      }
    } else if (audition && audioState.hasPrimaryMix) {
      engine.togglePlay();
    }
  };

  const isUnmastered = mixStage === 'unmastered_mix';

  // 1. VOLUME
  const lufsVal = report?.measurements?.integrated_loudness?.value;
  const lufsMin = isUnmastered ? -18.0 : -14.0;
  const lufsMax = isUnmastered ? -14.0 : -9.0;
  const volumeTile: {
    status: string;
    plain: string;
    level: TrafficLevel;
    metric: string;
    target: string;
  } =
    lufsVal === null || lufsVal === undefined
      ? {
          status: 'NO SIGNAL',
          plain: 'No audible loudness detected.',
          level: 'neutral',
          metric: '—',
          target: `${lufsMin} to ${lufsMax} LUFS`,
        }
      : lufsVal >= lufsMin && lufsVal <= lufsMax
      ? {
          status: 'ON TARGET',
          plain: isUnmastered
            ? 'Healthy mix volume with room for mastering.'
            : 'Competitive release volume for streaming.',
          level: 'pass',
          metric: `${lufsVal.toFixed(1)} LUFS`,
          target: `Target ${lufsMin} to ${lufsMax} LUFS`,
        }
      : lufsVal > lufsMax
      ? {
          status: 'TOO LOUD',
          plain: isUnmastered
            ? 'Pushing too hot for an unmastered bounce.'
            : 'Louder than streaming targets; may be turned down.',
          level: 'alert',
          metric: `${lufsVal.toFixed(1)} LUFS`,
          target: `Target ${lufsMin} to ${lufsMax} LUFS`,
        }
      : {
          status: 'A BIT QUIET',
          plain: 'Lower than typical target range for this stage.',
          level: 'caution',
          metric: `${lufsVal.toFixed(1)} LUFS`,
          target: `Target ${lufsMin} to ${lufsMax} LUFS`,
        };

  // 2. CLIPPING SAFETY
  const tpVal = report?.measurements?.true_peak_max?.value;
  const tpTarget = isUnmastered ? -3.0 : -1.0;
  const clippingTile: {
    status: string;
    plain: string;
    level: TrafficLevel;
    metric: string;
    target: string;
  } =
    tpVal === null || tpVal === undefined
      ? {
          status: 'NO SIGNAL',
          plain: 'True peak unavailable.',
          level: 'neutral',
          metric: '—',
          target: `Ceiling ≤ ${tpTarget.toFixed(1)} dBTP`,
        }
      : tpVal <= tpTarget
      ? {
          status: 'SAFE HEADROOM',
          plain: 'Clean peaks with zero digital distortion risk.',
          level: 'pass',
          metric: `${tpVal.toFixed(1)} dBTP`,
          target: `Ceiling ≤ ${tpTarget.toFixed(1)} dBTP`,
        }
      : {
          status: 'CLIPPING RISK',
          plain: 'Peaks exceed safe ceiling. Lower master fader or ceiling.',
          level: 'alert',
          metric: `${tpVal.toFixed(1)} dBTP`,
          target: `Ceiling ≤ ${tpTarget.toFixed(1)} dBTP`,
        };

  // 3. PHONE / MONO SAFETY
  const isMono = report ? report.file_metadata.channels === 1 : false;
  const phaseCorr = report?.measurements?.phase_correlation_mean?.value;
  const phaseMin = report?.measurements?.phase_correlation_min?.value;
  const monoTile: {
    status: string;
    plain: string;
    level: TrafficLevel;
    metric: string;
    target: string;
  } = isMono
    ? {
        status: 'MONO SAFE',
        plain: 'Single-channel bounce folds identically on phones.',
        level: 'pass',
        metric: 'MONO (+1.00)',
        target: 'Phase ≥ +0.20',
      }
    : phaseMin !== null && phaseMin !== undefined && phaseMin < 0.0
    ? {
        status: 'PHASE RISK',
        plain: 'Some wide elements may thin out on phone speakers.',
        level: 'alert',
        metric:
          phaseCorr !== null && phaseCorr !== undefined
            ? `${phaseCorr >= 0 ? '+' : ''}${phaseCorr.toFixed(2)} CORR`
            : '—',
        target: `Min ${phaseMin.toFixed(2)} (< 0.00)`,
      }
    : phaseCorr !== null && phaseCorr !== undefined && phaseCorr >= 0.2
    ? {
        status: 'MONO SAFE',
        plain: 'Stereo image holds together cleanly on phones & clubs.',
        level: 'pass',
        metric: `+${phaseCorr.toFixed(2)} CORR`,
        target: 'Phase ≥ +0.20',
      }
    : {
        status: 'CHECK MONO',
        plain: 'Borderline stereo width—double-check in mono.',
        level: 'caution',
        metric:
          phaseCorr !== null && phaseCorr !== undefined
            ? `${phaseCorr >= 0 ? '+' : ''}${phaseCorr.toFixed(2)} CORR`
            : '—',
        target: 'Phase ≥ +0.20',
      };

  // 4. PUNCH & DYNAMICS
  const crestVal = report?.measurements?.crest_factor?.value;
  const punchTile: {
    status: string;
    plain: string;
    level: TrafficLevel;
    metric: string;
    target: string;
  } =
    crestVal === null || crestVal === undefined
      ? {
          status: 'NO SIGNAL',
          plain: 'Dynamics measurement unavailable.',
          level: 'neutral',
          metric: '—',
          target: '8.0 to 18.0 dB',
        }
      : crestVal >= 8.0 && crestVal <= 18.0
      ? {
          status: 'BALANCED PUNCH',
          plain: 'Drums and transients breathe naturally.',
          level: 'pass',
          metric: `${crestVal.toFixed(1)} dB CREST`,
          target: 'Sweet spot 8–18 dB',
        }
      : crestVal < 8.0
      ? {
          status: 'OVER-COMPRESSED',
          plain: 'Transients are squashed—ease limiter or bus compression.',
          level: 'caution',
          metric: `${crestVal.toFixed(1)} dB CREST`,
          target: 'Sweet spot 8–18 dB',
        }
      : {
          status: 'WIDE DYNAMICS',
          plain: 'Very open peaks—gentle glue compression can help.',
          level: 'pass',
          metric: `${crestVal.toFixed(1)} dB CREST`,
          target: 'Sweet spot 8–18 dB',
        };

  const topRecommendations = report ? report.recommendations.slice(0, 3) : [];
  const viewStateKey = isAnalyzing ? 'analyzing' : report ? `report-${report.report_id}` : 'empty';

  return (
    <div className="space-y-6">
      {/* HEADER & UPLOAD CONFIGURATION GRID */}
      <section
        aria-label="Simple Mix Check Configuration"
        className="border-2 border-[var(--border-ink)] bg-[var(--bg-canvas)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 border-b-2 border-[var(--border-ink)] bg-[var(--bg-surface)]">
          <div>
            <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--ink-muted)]">
              01 · BEGINNER QUICK CHECK · /SIMPLE
            </div>
            <h1 className="font-display text-3xl sm:text-4xl uppercase text-[var(--ink)] mt-0.5">
              SIMPLE MIX CHECK
            </h1>
          </div>
          <motion.button
            type="button"
            whileTap={TACTILE_TAP}
            onClick={onSwitchToAdvanced}
            className="group inline-flex items-center gap-1.5 px-4 py-2 border-2 border-[var(--border-ink)] bg-[var(--bg-canvas)] hover:bg-[var(--ink)] hover:text-[var(--bg-canvas)] font-ui text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap"
          >
            <span>OPEN ADVANCED WORKBENCH</span>
            <ArrowUpRight className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-[3px] group-hover:-translate-y-[3px]" />
          </motion.button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 divide-y-[1.5px] md:divide-y-0 md:divide-x-[1.5px] divide-[var(--border-ink)]">
          {/* 1. Genre */}
          <div className="p-4 sm:p-5">
            <label
              htmlFor="simple-genre-select"
              className="block font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--ink)] mb-2"
            >
              01 / GENRE TARGET
            </label>
            <select
              id="simple-genre-select"
              value={genre}
              onChange={(e) => onChangeGenre(e.target.value as GenreId)}
              className="w-full border-2 border-[var(--border-ink)] bg-[var(--bg-surface)] px-3 py-2.5 text-xs font-bold uppercase text-[var(--ink)] focus:outline-none focus:bg-[#FFD600] focus:text-[#0A0A0A]"
            >
              {(Object.keys(GENRE_LABELS) as GenreId[]).map((gKey) => (
                <option key={gKey} value={gKey}>
                  {GENRE_LABELS[gKey]}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Stage */}
          <div className="p-4 sm:p-5">
            <span className="block font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--ink)] mb-2">
              02 / MIX STAGE
            </span>
            <div
              className="grid grid-cols-2 border-2 border-[var(--border-ink)] bg-[var(--bg-surface)] divide-x-2 divide-[var(--border-ink)]"
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
                    className={`relative px-2 py-2.5 text-[11px] font-ui font-bold uppercase tracking-wider text-center whitespace-nowrap transition-colors cursor-pointer ${
                      active
                        ? 'text-[var(--bg-canvas)]'
                        : 'text-[var(--ink)] hover:bg-[var(--bg-canvas)]'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="simple-stage-pill"
                        transition={BRUT_SPRING}
                        className="absolute inset-0 bg-[var(--ink)]"
                      />
                    )}
                    <span className="relative z-10">{MIX_STAGE_LABELS[stage].title}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* 3. Audio Bounce Upload */}
          <div className="p-4 sm:p-5">
            <label
              htmlFor="simple-audio-upload"
              className="block font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--ink)] mb-2"
            >
              03 / AUDIO BOUNCE (.WAV, .FLAC, .AIFF, .MP3)
            </label>
            <div className="flex items-stretch gap-2">
              <label
                htmlFor="simple-audio-upload"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`flex-1 flex items-center justify-between gap-2 border-2 border-dashed px-3 py-2 text-xs cursor-pointer transition-colors min-w-0 ${
                  isDragOver
                    ? 'border-[var(--border-ink)] bg-[#FFD600] text-[#0A0A0A]'
                    : 'border-[var(--border-ink)] bg-[var(--bg-surface)] text-[var(--ink)] hover:bg-[#FFD600] hover:text-[#0A0A0A]'
                }`}
              >
                <span className="truncate font-mono text-[11px]">
                  {selectedFile ? selectedFile.name : 'DROP OR BROWSE AUDIO...'}
                </span>
                <Upload className="w-3.5 h-3.5 shrink-0" />
              </label>

              {selectedFile && (
                <div className="flex items-stretch gap-1.5 shrink-0">
                  <motion.button
                    type="button"
                    whileTap={TACTILE_TAP}
                    onClick={handleReAnalyze}
                    disabled={isAnalyzing}
                    title="Re-run DSP analysis with current genre/stage targets"
                    className="px-3 py-2 border-2 border-[var(--border-ink)] bg-[#FFD600] text-[#0A0A0A] hover:bg-[#0A0A0A] hover:text-[#FFD600] font-mono text-[11px] font-bold uppercase transition-colors disabled:opacity-50 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span className="hidden sm:inline">RE-RUN</span>
                  </motion.button>
                  {onClearFile && (
                    <motion.button
                      type="button"
                      whileTap={TACTILE_TAP}
                      onClick={onClearFile}
                      disabled={isAnalyzing}
                      title="Clear and upload another track"
                      className="px-2.5 py-2 border-2 border-[var(--border-ink)] bg-[var(--bg-canvas)] text-[var(--ink)] hover:bg-[#FF3B1F] hover:text-white font-mono text-[11px] font-bold uppercase transition-colors inline-flex items-center cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
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

      {/* BODY STATE TRANSITION: LOADING -> EMPTY -> RESULTS */}
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
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.24, ease: BRUT_EASE }}
            className={`border-2 border-[var(--border-ink)] p-10 sm:p-14 text-center space-y-5 transition-colors ${
              isDragOver ? 'bg-[#FFD600] text-[#0A0A0A]' : 'bg-[var(--bg-canvas)]'
            }`}
          >
            <div className="w-16 h-16 border-2 border-[var(--border-ink)] bg-[#FFD600] text-[#0A0A0A] mx-auto flex items-center justify-center">
              <Volume2 className="w-7 h-7" />
            </div>
            <div className="max-w-lg mx-auto space-y-2">
              <h2 className="font-display text-3xl sm:text-4xl uppercase text-[var(--ink)]">
                NO AUDIO LOADED YET
              </h2>
              <p className="text-xs sm:text-sm text-[var(--ink-muted)] leading-relaxed">
                Drop your mix or master bounce (.WAV, .FLAC, .AIFF, .MP3) to run real mathematical DSP checks in plain English—or load a calibrated demo track to explore immediately.
              </p>
              <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
                <label
                  htmlFor="simple-audio-upload"
                  className="inline-flex items-center gap-2 px-5 py-3 border-2 border-[var(--border-ink)] bg-[var(--bg-canvas)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--bg-canvas)] font-ui text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  <span>CHOOSE AUDIO BOUNCE</span>
                </label>
                {onLoadDemoTrack && (
                  <motion.button
                    type="button"
                    whileTap={TACTILE_TAP}
                    onClick={onLoadDemoTrack}
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

        {report && !isAnalyzing && (
          <motion.div
            key={viewStateKey}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.26, ease: BRUT_EASE }}
            className="space-y-6"
          >
            {/* Active Track Strip */}
            <div className="border-2 border-[var(--border-ink)] bg-[var(--bg-surface)] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5 font-mono text-xs tabular-nums text-[var(--ink)]">
                <FileAudio className="w-4 h-4 shrink-0" />
                <span className="font-bold">{report.file_metadata.filename}</span>
                <span className="opacity-35">/</span>
                <span className="text-[var(--ink-muted)]">
                  {report.file_metadata.duration_seconds.toFixed(1)}s ·{' '}
                  {(report.file_metadata.file_size_bytes / (1024 * 1024)).toFixed(1)} MB ·{' '}
                  {report.file_metadata.sample_rate_hz} Hz ·{' '}
                  {report.file_metadata.channels === 1 ? 'MONO' : 'STEREO'}
                </span>
              </div>
              {onClearFile && (
                <motion.button
                  type="button"
                  whileTap={TACTILE_TAP}
                  onClick={onClearFile}
                  className="px-3 py-1 border-[1.5px] border-[var(--border-ink)] bg-[var(--bg-canvas)] hover:bg-[#FF3B1F] hover:text-white font-mono text-[11px] font-bold uppercase transition-colors inline-flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                  <span>CLEAR TRACK</span>
                </motion.button>
              )}
            </div>

            {/* 1. 4 TRAFFIC-LIGHT GRID CELLS (PLAIN ENGLISH FIRST, SMALL TABULAR NUMBERS UNDERNEATH) */}
            <section
              aria-label="Mix Quick Diagnostics Scorecard"
              data-testid="simple-traffic-light-grid"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-2 border-[var(--border-ink)] divide-y-2 sm:divide-y-0 sm:divide-x-2 divide-[var(--border-ink)] bg-[var(--bg-canvas)]"
            >
              {[
                { key: 'VOLUME', num: '01', data: volumeTile },
                { key: 'CLIPPING SAFETY', num: '02', data: clippingTile },
                { key: 'PHONE / MONO SAFETY', num: '03', data: monoTile },
                { key: 'PUNCH & DYNAMICS', num: '04', data: punchTile },
              ].map((cell, idx) => (
                <div
                  key={cell.key}
                  className={`p-5 flex flex-col justify-between gap-4 ${
                    idx < 2 ? 'sm:border-b-2 lg:border-b-0 border-[var(--border-ink)]' : ''
                  }`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--ink-muted)]">
                        {cell.num} / {cell.key}
                      </span>
                      <span
                        className={`px-2 py-0.5 border font-mono text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${trafficBadgeClasses(
                          cell.data.level
                        )}`}
                      >
                        {cell.data.status}
                      </span>
                    </div>
                    <p className="font-ui text-sm font-bold text-[var(--ink)] leading-snug">
                      {cell.data.plain}
                    </p>
                  </div>

                  <div className="pt-3 border-t-[1.5px] border-[var(--border-ink)]/25 flex items-baseline justify-between gap-2 font-mono tabular-nums">
                    <span className="text-base font-bold text-[var(--ink)]">
                      {cell.data.metric}
                    </span>
                    <span className="text-[10px] text-[var(--ink-muted)] uppercase">
                      {cell.data.target}
                    </span>
                  </div>
                </div>
              ))}
            </section>

            {/* 2. COMPACT LIVE 60FPS SPECTRUM ANALYZER (PLAY / PAUSE + 6-BAND CLICK TO HIGHLIGHT FINDINGS) */}
            <LiveSpectrumAnalyzer
              mode="simple"
              height={196}
              showControls
              issues={report.issues}
              activeIssueId={activeIssueId}
              staticSpectrumBins={audioState.primarySpectrumBins}
              staticSixBands={audioState.primarySixBands}
              title="LIVE SPECTRUM OVERVIEW · CLICK A BAND TO HIGHLIGHT FIX"
              onSelectZone={(_zoneId, matchedIssueId) => {
                if (matchedIssueId) {
                  handleFocusIssue(matchedIssueId, false);
                }
              }}
            />

            {/* 3. PRIORITIZED MIX ACTION PLAN — GIANT 01 / 02 / 03 SWISS ROWS */}
            <section
              aria-label="Prioritized Mix Action Plan"
              className="border-2 border-[var(--border-ink)] bg-[var(--bg-canvas)]"
            >
              <div className="px-5 py-4 border-b-2 border-[var(--border-ink)] bg-[var(--bg-surface)] flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--ink-muted)]">
                    STEP-BY-STEP DAW CHECKLIST
                  </div>
                  <h2 className="font-display text-2xl sm:text-3xl uppercase text-[var(--ink)] mt-0.5">
                    PRIORITIZED MIX ACTION PLAN ({topRecommendations.length} KEY STEPS)
                  </h2>
                </div>
                <div className="px-3 py-1 border-2 border-[var(--border-ink)] bg-[#FFD600] text-[#0A0A0A] font-mono text-xs font-bold tabular-nums uppercase">
                  VERIFIED: {Object.values(checkedSteps).filter(Boolean).length} /{' '}
                  {topRecommendations.length}
                </div>
              </div>

              <div className="divide-y-2 divide-[var(--border-ink)]">
                {topRecommendations.map((rec, idx) => {
                  const isDone = !!checkedSteps[rec.recommendation_id];
                  const isGuideOpen = !!expandedGuides[rec.recommendation_id];
                  const linkedIssue = report.issues.find((i) => i.issue_id === rec.linked_issue_id);
                  const isHighlighted = activeIssueId === rec.linked_issue_id;
                  const stepNum = `0${idx + 1}`;

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
                      data-testid={`diagnostic-card-${rec.linked_issue_id}`}
                      className={`transition-colors ${
                        isHighlighted ? 'bg-[var(--bg-surface)]' : 'bg-[var(--bg-canvas)]'
                      }`}
                    >
                      {/* Row Header */}
                      <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div
                          onClick={() => toggleGuide(rec.recommendation_id)}
                          className="flex items-start sm:items-center gap-4 sm:gap-6 cursor-pointer min-w-0 flex-1"
                        >
                          <span
                            className={`font-display text-5xl sm:text-6xl leading-none shrink-0 ${
                              idx === 0 && linkedIssue?.severity === 'critical'
                                ? 'text-[#FF3B1F]'
                                : 'text-[var(--ink)]'
                            }`}
                          >
                            {stepNum}
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-wider">
                              <span
                                className={`px-1.5 py-0.5 border border-[var(--border-ink)] ${
                                  rec.classification === 'objective_technical'
                                    ? 'bg-[#FF3B1F] text-white'
                                    : 'bg-[#FFD600] text-[#0A0A0A]'
                                }`}
                              >
                                {rec.classification === 'objective_technical'
                                  ? 'TECHNICAL WARNING'
                                  : 'TONAL SUGGESTION'}
                              </span>
                              {isHighlighted && (
                                <span className="px-1.5 py-0.5 bg-[var(--ink)] text-[var(--bg-canvas)]">
                                  SELECTED
                                </span>
                              )}
                            </div>
                            <h3 className="font-ui text-base sm:text-lg font-bold uppercase text-[var(--ink)] mt-1.5 leading-snug">
                              {rec.action_title}
                            </h3>
                            <p className="text-xs text-[var(--ink-muted)] mt-1 line-clamp-2">
                              {rec.beginner_summary}
                            </p>
                          </div>
                        </div>

                        {/* Inline Actions: Play/Audition, Mark Verified, Accordion +/- */}
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <motion.button
                            type="button"
                            whileTap={TACTILE_TAP}
                            onClick={() => handleFocusIssue(rec.linked_issue_id, true)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 border-2 border-[var(--border-ink)] bg-[var(--bg-canvas)] hover:bg-[#FFD600] hover:text-[#0A0A0A] font-mono text-[11px] font-bold uppercase transition-colors cursor-pointer"
                          >
                            <Play className="w-3 h-3" />
                            <span>AUDITION</span>
                          </motion.button>

                          <motion.button
                            type="button"
                            whileTap={TACTILE_TAP}
                            onClick={() => toggleVerificationStep(rec.recommendation_id)}
                            aria-pressed={isDone}
                            className={`inline-flex items-center gap-1.5 px-3 py-2 border-2 border-[var(--border-ink)] font-mono text-[11px] font-bold uppercase transition-colors cursor-pointer ${
                              isDone
                                ? 'bg-[var(--ink)] text-[var(--bg-canvas)]'
                                : 'bg-[var(--bg-canvas)] text-[var(--ink)] hover:bg-[var(--bg-surface)]'
                            }`}
                          >
                            {isDone && <Check className="w-3 h-3" />}
                            <span>{isDone ? 'VERIFIED' : 'MARK VERIFIED'}</span>
                          </motion.button>

                          <button
                            type="button"
                            onClick={() => toggleGuide(rec.recommendation_id)}
                            aria-expanded={isGuideOpen}
                            aria-label={isGuideOpen ? 'Collapse step details' : 'Expand step details'}
                            className="w-9 h-9 border-2 border-[var(--border-ink)] bg-[var(--bg-canvas)] hover:bg-[var(--ink)] hover:text-[var(--bg-canvas)] flex items-center justify-center transition-colors cursor-pointer"
                          >
                            {isGuideOpen ? (
                              <X className="w-4 h-4" />
                            ) : (
                              <Plus className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Expandable What happened -> Why it matters -> What to try -> Recheck */}
                      <AnimatePresence initial={false}>
                        {isGuideOpen && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.22, ease: BRUT_EASE }}
                            className="overflow-hidden"
                          >
                            <div className="border-t-[1.5px] border-[var(--border-ink)] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 divide-y-[1.5px] md:divide-y-0 md:divide-x-[1.5px] divide-[var(--border-ink)] bg-[var(--bg-surface)] text-xs">
                              <div className="p-4 space-y-1.5">
                                <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--ink-muted)]">
                                  01 · WHAT HAPPENED
                                </div>
                                <p className="text-[var(--ink)] leading-relaxed">{detectedLine}</p>
                              </div>
                              <div className="p-4 space-y-1.5">
                                <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--ink-muted)]">
                                  02 · WHY IT MATTERS
                                </div>
                                <p className="text-[var(--ink)] leading-relaxed">
                                  {linkedIssue?.learning_guide.why_it_matters ||
                                    'Fixing this keeps your mix consistent across earbuds, car stereos, and streaming.'}
                                </p>
                              </div>
                              <div className="p-4 space-y-1.5 bg-[#FFD600]/20">
                                <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--ink)]">
                                  03 · WHAT TO TRY IN YOUR DAW
                                </div>
                                <p className="font-semibold text-[var(--ink)] leading-relaxed">
                                  {dawFixLine}
                                </p>
                              </div>
                              <div className="p-4 space-y-1.5">
                                <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--ink-muted)]">
                                  04 · RECHECK
                                </div>
                                <p className="text-[var(--ink)] leading-relaxed">
                                  {linkedIssue?.learning_guide.how_to_verify ||
                                    rec.verification_check ||
                                    'Re-export your bounce and check that this warning clears.'}
                                </p>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </article>
                  );
                })}
              </div>
            </section>

            {/* 4. COMPACT BEGINNER AI MENTOR */}
            <AiMentorPanel
              report={report}
              genre={genre}
              mixStage={mixStage}
              interfaceMode="simple"
              consent={consent}
              onChangeConsent={(next) => onChangeConsent?.(next)}
              artistVision={artistVision}
              onChangeArtistVision={setArtistVision}
              onSelectEvidenceId={(id) => handleFocusIssue(id, true)}
            />

            {/* 5. SOLID #FFD600 YELLOW FOOTER CALLOUT BAR -> OPEN IN ADVANCED WORKBENCH */}
            <motion.button
              type="button"
              whileTap={TACTILE_TAP}
              onClick={onSwitchToAdvanced}
              data-testid="simple-to-advanced-cta"
              className="group w-full border-2 border-[var(--border-ink)] bg-[#FFD600] text-[#0A0A0A] hover:bg-[#0A0A0A] hover:text-[#FFD600] px-6 py-5 flex flex-wrap items-center justify-between gap-4 text-left transition-colors cursor-pointer"
            >
              <div>
                <div className="font-mono text-[10px] font-bold uppercase tracking-widest opacity-80">
                  SEAMLESS TRACK HANDOFF · AUDIO &amp; REPORT PRESERVED
                </div>
                <div className="font-display text-xl sm:text-2xl uppercase tracking-tight mt-0.5">
                  WANT LIVE METERS, A/B REFERENCE, PHONE/LAPTOP LAB &amp; STEMS?
                </div>
              </div>
              <span className="inline-flex items-center gap-2 px-4 py-2.5 border-2 border-current font-ui text-xs font-bold uppercase tracking-wider shrink-0">
                <span>OPEN IN ADVANCED WORKBENCH</span>
                <ArrowUpRight className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-[3px] group-hover:-translate-y-[3px]" />
              </span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

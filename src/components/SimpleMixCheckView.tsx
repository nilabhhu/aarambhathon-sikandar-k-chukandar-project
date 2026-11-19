import React, { useEffect, useRef, useState } from 'react';
import {
  AnalysisIssue,
  AnalysisReport,
  ConsentState,
  GenreId,
  MixStage,
} from '../contracts/analysisContract';
import { GENRE_LABELS, MIX_STAGE_LABELS } from '../contracts/demoFixtures';
import { formatTimecode } from './WaveformInspector';
import {
  Upload,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Play,
  Square,
  FileAudio,
  RefreshCw,
} from 'lucide-react';

interface SimpleMixCheckViewProps {
  report: AnalysisReport | null;
  reportSource?: 'backend' | 'local_web_audio' | null;
  audioUrl?: string | null;
  loading?: boolean;
  uploadError?: string | null;
  engineNotice?: string | null;
  genre: GenreId;
  mixStage: MixStage;
  consent: ConsentState;
  onChangeGenre: (genre: GenreId) => void;
  onChangeMixStage: (stage: MixStage) => void;
  onAnalyzeAudioFile: (file: File) => void;
  onSwitchToAdvanced: () => void;
  onClearUploadError?: () => void;
}

interface MetricCardItem {
  label: string;
  value: string;
  subtitle: string;
  status: 'optimal' | 'warning' | 'critical' | 'unavailable';
}

function buildFourMetricScorecard(report: AnalysisReport): MetricCardItem[] {
  const m = report.measurements;

  const loudnessVal =
    m.integrated_loudness.value !== null
      ? `${m.integrated_loudness.value.toFixed(1)} LUFS`
      : 'N/A';

  const tpVal =
    m.true_peak_max.value !== null
      ? `${m.true_peak_max.value > 0 ? '+' : ''}${m.true_peak_max.value.toFixed(2)} dBTP`
      : 'N/A';

  const useLra = m.loudness_range_lra.value !== null;
  const dynamicsVal = useLra
    ? `${m.loudness_range_lra.value!.toFixed(1)} LU`
    : m.crest_factor.value !== null
    ? `${m.crest_factor.value.toFixed(1)} dB`
    : 'N/A';
  const dynamicsSubtitle = useLra ? 'Loudness range (verse vs. chorus)' : 'Peak-to-average crest factor';
  const dynamicsStatus = useLra ? m.loudness_range_lra.status : m.crest_factor.status;

  const isMono = report.file_metadata.channels === 1;
  const monoVal = isMono
    ? 'Mono File'
    : m.phase_correlation_mean.value !== null
    ? `${m.phase_correlation_mean.value >= 0 ? '+' : ''}${m.phase_correlation_mean.value.toFixed(2)}`
    : 'N/A';
  const monoStatus: MetricCardItem['status'] = isMono
    ? 'optimal'
    : m.phase_correlation_min.value !== null && m.phase_correlation_min.value < -0.2
    ? 'warning'
    : m.phase_correlation_mean.status;

  return [
    {
      label: 'Overall Loudness',
      value: loudnessVal,
      subtitle:
        report.input_context.mix_stage === 'unmastered_mix'
          ? 'Target: -18 to -14 LUFS'
          : 'Target: -14 to -9 LUFS',
      status: m.integrated_loudness.status,
    },
    {
      label: 'Headroom (True Peak)',
      value: tpVal,
      subtitle:
        report.input_context.mix_stage === 'unmastered_mix'
          ? 'Keep <= -3.0 dBTP for mastering'
          : 'Keep <= -1.0 dBTP for streaming',
      status:
        m.true_peak_max.value !== null && m.true_peak_max.value > 0
          ? 'critical'
          : m.true_peak_max.status,
    },
    {
      label: 'Dynamics & Punch',
      value: dynamicsVal,
      subtitle: dynamicsSubtitle,
      status: dynamicsStatus,
    },
    {
      label: 'Mono Safety (Phase)',
      value: monoVal,
      subtitle: isMono ? 'Single-channel mono export' : 'Above +0.20 translates safely',
      status: monoStatus,
    },
  ];
}

function statusPillClasses(status: MetricCardItem['status']): string {
  if (status === 'critical') {
    return 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900';
  }
  if (status === 'warning') {
    return 'text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900';
  }
  if (status === 'optimal') {
    return 'text-teal-800 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-900';
  }
  return 'text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700';
}

function statusLabel(status: MetricCardItem['status']): string {
  if (status === 'critical') return 'Needs Fix';
  if (status === 'warning') return 'Check';
  if (status === 'optimal') return 'Good';
  return 'N/A';
}

export const SimpleMixCheckView: React.FC<SimpleMixCheckViewProps> = ({
  report,
  reportSource,
  audioUrl,
  loading = false,
  uploadError,
  engineNotice,
  genre,
  mixStage,
  consent,
  onChangeGenre,
  onChangeMixStage,
  onAnalyzeAudioFile,
  onSwitchToAdvanced,
  onClearUploadError,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({});
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [showAllFindings, setShowAllFindings] = useState<boolean>(false);

  // Inline audio audition state
  const [activeCueKey, setActiveCueKey] = useState<string | null>(null);
  const [activeCueEndSec, setActiveCueEndSec] = useState<number | null>(null);
  const [playbackTimeSec, setPlaybackTimeSec] = useState<number>(0);

  // Reset expanded/playback state when a new report loads
  useEffect(() => {
    if (report && report.issues.length > 0) {
      setExpandedCards({ [report.issues[0].issue_id]: true });
    } else {
      setExpandedCards({});
    }
    setCheckedSteps({});
    setShowAllFindings(false);
    setActiveCueKey(null);
    setActiveCueEndSec(null);
    if (audioRef.current) {
      audioRef.current.pause();
    }
  }, [report?.report_id]);

  // Monitor audio element time to stop cleanly at cue end_sec
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setPlaybackTimeSec(audio.currentTime);
      if (activeCueEndSec !== null && audio.currentTime >= activeCueEndSec) {
        audio.pause();
        setActiveCueKey(null);
        setActiveCueEndSec(null);
      }
    };
    const handleEnded = () => {
      setActiveCueKey(null);
      setActiveCueEndSec(null);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [activeCueEndSec]);

  const handleToggleCuePlayback = async (
    cueKey: string,
    startSec: number,
    endSec: number
  ) => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    if (activeCueKey === cueKey) {
      audio.pause();
      setActiveCueKey(null);
      setActiveCueEndSec(null);
      return;
    }

    try {
      audio.currentTime = Math.max(0, startSec);
      setActiveCueKey(cueKey);
      setActiveCueEndSec(endSec > startSec ? endSec : null);
      await audio.play();
    } catch {
      setActiveCueKey(null);
      setActiveCueEndSec(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset input value so re-uploading a revised file with the same filename still triggers onChange
    e.target.value = '';
    if (!file) return;
    if (onClearUploadError) onClearUploadError();
    onAnalyzeAudioFile(file);
  };

  const triggerRecheckUpload = () => {
    fileInputRef.current?.click();
  };

  const toggleCard = (issueId: string) => {
    setExpandedCards((prev) => ({ ...prev, [issueId]: !prev[issueId] }));
  };

  const toggleVerificationStep = (id: string) => {
    setCheckedSteps((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Prioritize objective technical findings first, then stylistic observations (Rule 8 preserved)
  const prioritizedIssues: AnalysisIssue[] = report
    ? [
        ...report.issues.filter((i) => i.classification === 'objective_technical'),
        ...report.issues.filter((i) => i.classification === 'subjective_stylistic'),
      ]
    : [];

  const visibleIssues = showAllFindings ? prioritizedIssues : prioritizedIssues.slice(0, 3);
  const scorecard = report ? buildFourMetricScorecard(report) : [];

  return (
    <div className="space-y-8">
      {/* Hidden managed HTML5 audio element for inline timestamp auditioning */}
      <audio ref={audioRef} src={audioUrl ?? undefined} preload="metadata" className="hidden" />

      {/* Step 1: Beginner Input Context & Upload Controls */}
      <section
        aria-label="Simple Mix Check Configuration"
        className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-6"
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
              Pick your genre and mix stage, upload your bounce, listen to affected sections, and fix your top 3 priorities step by step.
            </p>
          </div>
          <button
            type="button"
            onClick={onSwitchToAdvanced}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-800 dark:text-teal-400 hover:underline whitespace-nowrap shrink-0"
          >
            <span>Need full spectral & waveform metrics? Open Advanced Mix Check</span>
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
              Sets tonal context without hiding technical clipping or phase errors.
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
              Target: {MIX_STAGE_LABELS[mixStage].headroomTarget}
            </p>
          </div>

          {/* 3. Upload Song */}
          <div>
            <label
              htmlFor="simple-audio-upload"
              className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-2"
            >
              3. Upload Your Mix or Master
            </label>
            <label
              htmlFor="simple-audio-upload"
              className="flex items-center justify-between gap-3 w-full rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3.5 py-2.5 text-xs text-zinc-700 dark:text-zinc-300 hover:border-teal-700 cursor-pointer transition-colors"
            >
              <span className="truncate font-mono">
                {report ? report.file_metadata.filename : 'No audio file uploaded yet'}
              </span>
              <span className="inline-flex items-center gap-1 font-medium text-teal-800 dark:text-teal-400 shrink-0">
                <Upload className="w-3.5 h-3.5" />
                <span>{report ? 'Upload Revised Mix' : 'Choose Audio File'}</span>
              </span>
            </label>
            <input
              ref={fileInputRef}
              id="simple-audio-upload"
              type="file"
              accept=".wav,.flac,.aiff,.mp3,.ogg"
              onChange={handleFileChange}
              className="sr-only"
            />
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-2 font-mono">
              Allowed: .wav, .flac, .aiff, .mp3, .ogg · Max 100 MB
            </div>
            {report && (
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 font-mono tabular-nums">
                {report.file_metadata.format} · {(report.file_metadata.sample_rate_hz / 1000).toFixed(1)} kHz ·{' '}
                {formatTimecode(report.file_metadata.duration_seconds)}
              </div>
            )}
          </div>
        </div>

        {/* Inline Upload Validation Error Banner */}
        {uploadError && (
          <div
            role="alert"
            data-testid="simple-upload-error"
            className="mt-4 text-xs text-red-900 dark:text-red-200 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded-md px-3.5 py-2.5 flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
            <span>{uploadError}</span>
          </div>
        )}

        {/* Engine fallback info notice when computed locally via Web Audio */}
        {engineNotice && !uploadError && (
          <div
            role="status"
            className="mt-4 text-xs text-teal-900 dark:text-teal-200 bg-teal-50/80 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 rounded-md px-3.5 py-2"
          >
            {engineNotice}
          </div>
        )}
      </section>

      {/* Main Content Area: Consent Guard -> Loading -> Clean Empty State -> Real DSP Results */}
      {!consent.audio_analysis_consent ? (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-8 text-center bg-zinc-50 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Audio Analysis Permission is currently disabled. Enable Permission 1 in the Privacy Gate below to measure your mix.
          </p>
        </div>
      ) : loading ? (
        <section
          aria-label="Analyzing Audio"
          className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-12 text-center space-y-3"
        >
          <RefreshCw className="w-7 h-7 text-teal-700 dark:text-teal-400 animate-spin mx-auto" />
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Measuring Your Audio with Mathematical DSP...
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
            Calculating integrated LUFS loudness, 4x True Peak headroom, dynamics, stereo phase correlation, and tonal balance.
          </p>
        </section>
      ) : !report ? (
        /* Clean Empty State before upload — zero preloaded dummy fixture */
        <section
          aria-label="Upload Audio to Begin Simple Mix Check"
          data-testid="simple-empty-state"
          className="border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg bg-zinc-50/50 dark:bg-zinc-900/40 p-10 text-center space-y-4"
        >
          <FileAudio className="w-10 h-10 text-teal-700 dark:text-teal-400 mx-auto" />
          <div className="max-w-lg mx-auto space-y-1.5">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Upload a Track to Run Your Mix Check
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Your file stays private and ephemeral. Once analyzed, you will see a 4-metric health scorecard and your top 3 plain-language fixes with inline timestamp playback so you can hear each issue and recheck your revision.
            </p>
          </div>
          <button
            type="button"
            onClick={triggerRecheckUpload}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-teal-800 hover:bg-teal-900 text-white text-sm font-medium transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>Choose Audio File (.wav, .flac, .aiff, .mp3, .ogg)</span>
          </button>
          <p className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
            Max file size: 100 MB · Ephemeral processing only · Zero model training
          </p>
        </section>
      ) : (
        <>
          {/* Real DSP Provenance Banner */}
          <div
            role="status"
            data-testid="dsp-provenance-banner-simple"
            className="border border-teal-800/25 dark:border-teal-500/30 bg-teal-50/60 dark:bg-teal-950/30 rounded-lg px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
          >
            <div className="text-zinc-800 dark:text-zinc-200">
              <span className="font-mono font-semibold text-teal-900 dark:text-teal-300">
                {reportSource === 'backend'
                  ? '[FASTAPI EBU R128 DSP]'
                  : '[LOCAL WEB AUDIO DSP FALLBACK]'}
              </span>{' '}
              Real mathematical measurements for <strong>{report.file_metadata.filename}</strong>
            </div>
            <span className="font-mono text-zinc-500 dark:text-zinc-400">
              schema v{report.schema_version}
            </span>
          </div>

          {/* 4-Metric Summary Scorecard */}
          <section aria-label="Four-Metric Mix Summary Scorecard">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {scorecard.map((card) => (
                <div
                  key={card.label}
                  data-testid="simple-scorecard-card"
                  className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-5 flex flex-col justify-between gap-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      {card.label}
                    </span>
                    <span
                      className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded border ${statusPillClasses(card.status)}`}
                    >
                      {statusLabel(card.status)}
                    </span>
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-zinc-900 dark:text-zinc-100 mt-1">
                    {card.value}
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{card.subtitle}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Top 3 Prioritized Action Cards with Collapsible Details & 5-Step Learning Loop */}
          <section
            aria-label="Top Prioritized Action Cards"
            className="space-y-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  Top {Math.min(3, prioritizedIssues.length)} Prioritized Fixes ({prioritizedIssues.length} Detected)
                </h2>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                  Follow the 5-step loop on each card: What happened → Why it matters → Listen → What to try → Recheck.
                </p>
              </div>
              <div className="text-xs font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                Verified: {Object.values(checkedSteps).filter(Boolean).length} / {visibleIssues.length}
              </div>
            </div>

            <div className="space-y-4">
              {visibleIssues.map((issue, idx) => {
                const isExpanded = !!expandedCards[issue.issue_id];
                const isObjective = issue.classification === 'objective_technical';
                const isDone = !!checkedSteps[issue.issue_id];
                const linkedRec = report.recommendations.find(
                  (r) => r.linked_issue_id === issue.issue_id
                );

                return (
                  <article
                    key={issue.issue_id}
                    data-testid="simple-action-card"
                    className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 overflow-hidden"
                  >
                    {/* Collapsible Header */}
                    <div className="p-5 flex items-start justify-between gap-4">
                      <button
                        type="button"
                        onClick={() => toggleCard(issue.issue_id)}
                        aria-expanded={isExpanded}
                        className="flex-1 text-left group cursor-pointer"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                            PRIORITY 0{idx + 1}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              isObjective
                                ? 'text-amber-800 dark:text-amber-400 font-semibold'
                                : 'text-teal-800 dark:text-teal-400'
                            }
                          >
                            {isObjective ? 'Objective Technical' : 'Stylistic Suggestion'}
                          </span>
                          {isDone && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1 text-teal-800 dark:text-teal-400 font-semibold">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Verified
                              </span>
                            </>
                          )}
                        </div>
                        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mt-1 group-hover:text-teal-800 dark:group-hover:text-teal-400 transition-colors">
                          {linkedRec?.action_title ?? issue.title}
                        </h3>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                          {linkedRec?.beginner_summary ?? issue.learning_guide.what_was_detected}
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleCard(issue.issue_id)}
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? `Collapse details for ${issue.title}` : `Expand details for ${issue.title}`}
                        className="p-2 rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 shrink-0"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    {/* Collapsible 5-Step Learning Loop Details */}
                    {isExpanded && (
                      <div className="px-5 pb-5 pt-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 space-y-5">
                        {/* Step 1 & Step 2 */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                              1. What happened
                            </h4>
                            <p className="text-sm text-zinc-800 dark:text-zinc-200 mt-1.5 leading-relaxed">
                              {issue.learning_guide.what_was_detected}
                            </p>
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                              2. Why it matters
                            </h4>
                            <p className="text-sm text-zinc-800 dark:text-zinc-200 mt-1.5 leading-relaxed">
                              {issue.learning_guide.why_it_matters}
                            </p>
                          </div>
                        </div>

                        {/* Step 3: Listen (Inline Audio Playback / Audition) */}
                        <div className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-2.5">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-teal-800 dark:text-teal-400">
                            3. Listen to the Affected Section
                          </h4>
                          <div className="flex flex-wrap items-center gap-2.5">
                            {issue.timestamps.length > 0 ? (
                              issue.timestamps.map((ts, tIdx) => {
                                const cueKey = `${issue.issue_id}-${tIdx}`;
                                const isPlaying = activeCueKey === cueKey;
                                return (
                                  <button
                                    key={cueKey}
                                    type="button"
                                    disabled={!audioUrl}
                                    onClick={() =>
                                      handleToggleCuePlayback(cueKey, ts.start_sec, ts.end_sec)
                                    }
                                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono border transition-colors ${
                                      isPlaying
                                        ? 'bg-teal-800 text-white border-teal-800 dark:bg-teal-600 dark:border-teal-600'
                                        : 'bg-zinc-50 text-zinc-800 border-zinc-300 hover:border-teal-700 dark:bg-zinc-950 dark:text-zinc-200 dark:border-zinc-700 disabled:opacity-50'
                                    }`}
                                  >
                                    {isPlaying ? (
                                      <Square className="w-3.5 h-3.5 fill-current" />
                                    ) : (
                                      <Play className="w-3.5 h-3.5 fill-current" />
                                    )}
                                    <span>
                                      {isPlaying
                                        ? `Playing ${formatTimecode(playbackTimeSec)} / ${formatTimecode(ts.end_sec)}`
                                        : `Listen ${formatTimecode(ts.start_sec)}–${formatTimecode(ts.end_sec)}`}
                                    </span>
                                    <span className="font-sans text-[11px] opacity-80">
                                      ({ts.label})
                                    </span>
                                  </button>
                                );
                              })
                            ) : (
                              <span className="text-xs text-zinc-500">
                                Full-track measurement across the entire bounce.
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Step 4 & Step 5 */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-teal-800 dark:text-teal-400">
                              4. What to try in your DAW
                            </h4>
                            <p className="text-sm text-zinc-800 dark:text-zinc-200 mt-1.5 leading-relaxed">
                              {issue.learning_guide.what_to_try}
                            </p>
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-teal-800 dark:text-teal-400">
                              5. Recheck your revision
                            </h4>
                            <p className="text-sm text-zinc-800 dark:text-zinc-200 mt-1.5 leading-relaxed">
                              {issue.learning_guide.how_to_verify}
                            </p>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => toggleVerificationStep(issue.issue_id)}
                                aria-pressed={isDone}
                                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                                  isDone
                                    ? 'bg-teal-800 text-white border-teal-800 dark:bg-teal-600 dark:border-teal-600'
                                    : 'bg-white text-zinc-800 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-950 dark:text-zinc-200 dark:border-zinc-700'
                                }`}
                              >
                                {isDone ? 'Marked Verified' : 'Mark Change Verified'}
                              </button>
                              <button
                                type="button"
                                onClick={triggerRecheckUpload}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-teal-800 dark:text-teal-300 border border-teal-300 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-950/30 hover:bg-teal-100/80 dark:hover:bg-teal-950/60 transition-colors"
                              >
                                <Upload className="w-3.5 h-3.5" />
                                <span>Upload Revised Mix to Recheck</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            {prioritizedIssues.length > 3 && (
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => setShowAllFindings((s) => !s)}
                  className="text-xs font-medium text-teal-800 dark:text-teal-400 hover:underline"
                >
                  {showAllFindings
                    ? 'Show Top 3 Priorities Only'
                    : `Show ${prioritizedIssues.length - 3} Additional Observation(s)`}
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

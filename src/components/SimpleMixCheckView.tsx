import React, { useState } from 'react';
import {
  AnalysisReport,
  ConsentState,
  GenreId,
  MixStage,
} from '../contracts/analysisContract';
import { GENRE_LABELS, MIX_STAGE_LABELS } from '../contracts/demoFixtures';
import { formatTimecode } from './WaveformInspector';
import { Upload, CheckCircle2, AlertCircle, Sliders, ArrowRight } from 'lucide-react';

interface SimpleMixCheckViewProps {
  report: AnalysisReport;
  reportSource?: 'backend' | 'offline_fallback';
  genre: GenreId;
  mixStage: MixStage;
  consent: ConsentState;
  onChangeGenre: (genre: GenreId) => void;
  onChangeMixStage: (stage: MixStage) => void;
  onUploadFileMetadata: (meta: {
    filename: string;
    fileSize: number;
    durationSec?: number;
    sampleRate?: 44100 | 48000 | 88200 | 96000 | 192000;
  }) => void;
  onAnalyzeAudioFile?: (file: File) => void;
  onSwitchToAdvanced: () => void;
}

export const SimpleMixCheckView: React.FC<SimpleMixCheckViewProps> = ({
  report,
  reportSource,
  genre,
  mixStage,
  consent,
  onChangeGenre,
  onChangeMixStage,
  onUploadFileMetadata,
  onAnalyzeAudioFile,
  onSwitchToAdvanced,
}) => {
  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({});
  const [uploadStatusNote, setUploadStatusNote] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (onAnalyzeAudioFile) {
      setUploadStatusNote(`Analyzing "${file.name}" via real Mathematical DSP...`);
      onAnalyzeAudioFile(file);
      return;
    }

    onUploadFileMetadata({
      filename: file.name,
      fileSize: file.size,
    });
    setUploadStatusNote(
      `Loaded file metadata for "${file.name}" (${(file.size / (1024 * 1024)).toFixed(2)} MB). Audio was NOT analyzed (Real DSP analysis is scheduled for Phase 2). Displaying Phase 1 Demonstration Contract Findings.`
    );
  };

  const toggleVerificationStep = (id: string) => {
    setCheckedSteps((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const objectiveIssues = report.issues.filter(
    (i) => i.classification === 'objective_technical'
  );
  const stylisticIssues = report.issues.filter(
    (i) => i.classification === 'subjective_stylistic'
  );

  return (
    <div className="space-y-8">
      {/* Mandatory Demonstration Data Disclosure Banner */}
      <div
        role="status"
        data-testid="demo-data-banner-simple"
        className="border border-teal-800/30 dark:border-teal-500/30 bg-teal-50/70 dark:bg-teal-950/30 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3"
      >
        <div className="text-xs text-zinc-800 dark:text-zinc-200">
          <span className="font-mono font-semibold text-teal-900 dark:text-teal-300">
            {!report.is_demonstration_data
              ? '[MATHEMATICAL DSP ANALYSIS · REAL AUDIO MEASUREMENTS]'
              : reportSource === 'backend'
              ? '[DEMONSTRATION DATA · PHASE 1 FASTAPI BACKEND FIXTURE]'
              : '[DEMONSTRATION DATA · PHASE 1 OFFLINE LOCAL FIXTURE]'}
          </span>{' '}
          {report.data_source_notice}
        </div>
        <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-zinc-500 dark:text-zinc-400 shrink-0">
          <span>provenance: {reportSource === 'backend' ? 'fastapi' : 'offline-local'}</span>
          <span aria-hidden="true">·</span>
          <span>schema_version: {report.schema_version}</span>
        </div>
      </div>

      {/* Step 1: Beginner Input Context Controls */}
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
              Select your genre and mix stage, upload your bounce, and follow step-by-step plain-language fixes without complex graphs.
            </p>
          </div>
          <button
            type="button"
            onClick={onSwitchToAdvanced}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-800 dark:text-teal-400 hover:underline whitespace-nowrap shrink-0"
          >
            <span>Need full LUFS, phase & spectral metrics? Switch to Advanced Mix Check</span>
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
              Sets tonal and dynamic context for stylistic guidance without hiding technical clipping or phase errors.
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
              3. Select Audio Bounce (WAV / FLAC / AIFF / MP3)
            </label>
            <label
              htmlFor="simple-audio-upload"
              className="flex items-center justify-between gap-3 w-full rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3.5 py-2.5 text-xs text-zinc-700 dark:text-zinc-300 hover:border-teal-700 cursor-pointer transition-colors"
            >
              <span className="truncate font-mono">{report.file_metadata.filename}</span>
              <span className="inline-flex items-center gap-1 font-medium text-teal-800 dark:text-teal-400 shrink-0">
                <Upload className="w-3.5 h-3.5" />
                <span>Choose File</span>
              </span>
            </label>
            <input
              id="simple-audio-upload"
              type="file"
              accept=".wav,.flac,.aiff,.mp3,.ogg,audio/*"
              onChange={handleFileChange}
              className="sr-only"
            />
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed">
              <strong>Phase 1 Ingest Notice:</strong> Selecting a file reads local metadata only without performing real DSP. In Phase 2, this will stream to the FFmpeg/libebur128 math pipeline to calculate genuine LUFS and intersample clipping.
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 font-mono tabular-nums">
              {report.file_metadata.format} · {(report.file_metadata.sample_rate_hz / 1000).toFixed(1)} kHz ·{' '}
              {formatTimecode(report.file_metadata.duration_seconds)}
            </div>
          </div>
        </div>

        {uploadStatusNote && (
          <div className="mt-4 text-xs text-teal-900 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 rounded-md px-3.5 py-2">
            {uploadStatusNote}
          </div>
        )}
      </section>

      {!consent.audio_analysis_consent ? (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-8 text-center bg-zinc-50 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Audio Analysis Permission is currently disabled. Enable Permission 1 in the Privacy Gate to view mix findings.
          </p>
        </div>
      ) : (
        <>
          {/* Prioritized Action Summary for Beginners */}
          <section
            aria-label="Prioritized Plain-Language Action Plan"
            className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-zinc-200 dark:border-zinc-800">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  Prioritized Mix Action Plan ({report.recommendations.length} Steps)
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Start with #1. Check off each step after verifying the change in your DAW bounce.
                </p>
              </div>
              <div className="text-xs font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                Completed: {Object.values(checkedSteps).filter(Boolean).length} / {report.recommendations.length}
              </div>
            </div>

            <div className="divide-y divide-zinc-200 dark:divide-zinc-800 mt-2">
              {report.recommendations.map((rec) => {
                const isDone = !!checkedSteps[rec.recommendation_id];
                const isObjective = rec.classification === 'objective_technical';
                return (
                  <div
                    key={rec.recommendation_id}
                    className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                        <span>PRIORITY 0{rec.priority_rank}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            isObjective
                              ? 'text-amber-800 dark:text-amber-400 font-semibold'
                              : 'text-zinc-600 dark:text-zinc-400'
                          }
                        >
                          {isObjective ? 'Objective Technical Issue' : 'Optional Stylistic Suggestion'}
                        </span>
                      </div>
                      <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                        {rec.action_title}
                      </h3>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300">
                        {rec.beginner_summary}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleVerificationStep(rec.recommendation_id)}
                      aria-pressed={isDone}
                      className={`px-3.5 py-2 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                        isDone
                          ? 'bg-teal-800 text-white border-teal-800 dark:bg-teal-600 dark:border-teal-600'
                          : 'bg-white text-zinc-800 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-950 dark:text-zinc-200 dark:border-zinc-700'
                      }`}
                    >
                      {isDone ? 'Verified in Revised Bounce' : 'Mark Change Verified'}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Group 1: Objective Technical Findings (4-Part Learning Cards) */}
          <section aria-label="Objective Technical Findings" className="space-y-4">
            <div className="flex items-baseline justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                  <span>Objective Technical Findings ({objectiveIssues.length})</span>
                </h2>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                  Rule 3 & 8: Measurable technical issues (clipping, headroom, or phase cancellation) that should be corrected regardless of genre preference.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5">
              {objectiveIssues.map((issue) => (
                <article
                  key={issue.issue_id}
                  className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-zinc-100 dark:border-zinc-800">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 dark:text-zinc-400">
                        <span className="text-amber-800 dark:text-amber-400 font-semibold uppercase">
                          {issue.severity}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>OBJECTIVE TECHNICAL</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          AFFECTED TIME:{' '}
                          {issue.timestamps
                            .map((t) => `${formatTimecode(t.start_sec)}–${formatTimecode(t.end_sec)}`)
                            .join(', ')}
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
                        {issue.title}
                      </h3>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-5">
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        1. What was detected
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
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-teal-800 dark:text-teal-400">
                        3. What to try in your DAW
                      </h4>
                      <p className="text-sm text-zinc-800 dark:text-zinc-200 mt-1.5 leading-relaxed">
                        {issue.learning_guide.what_to_try}
                      </p>
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-teal-800 dark:text-teal-400">
                        4. How to verify the change
                      </h4>
                      <p className="text-sm text-zinc-800 dark:text-zinc-200 mt-1.5 leading-relaxed">
                        {issue.learning_guide.how_to_verify}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* Group 2: Subjective Stylistic Notes (Kept Strictly Separate per Rule 8) */}
          <section aria-label="Subjective Stylistic Considerations" className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                <span>Subjective Stylistic Notes for {GENRE_LABELS[genre]} ({stylisticIssues.length})</span>
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                Rule 8: Kept strictly separate from technical warnings. These are creative tonal/dynamic choices to evaluate by ear.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-5">
              {stylisticIssues.map((issue) => (
                <article
                  key={issue.issue_id}
                  className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-zinc-50/60 dark:bg-zinc-900/60 p-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-zinc-200 dark:border-zinc-800">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 dark:text-zinc-400">
                        <span>CREATIVE / STYLISTIC OBSERVATION</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          SECTION:{' '}
                          {issue.timestamps
                            .map((t) => `${formatTimecode(t.start_sec)}–${formatTimecode(t.end_sec)}`)
                            .join(', ')}
                        </span>
                      </div>
                      <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
                        {issue.title}
                      </h3>
                    </div>
                    <CheckCircle2 className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        What was detected & Why it matters
                      </h4>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 mt-1.5 leading-relaxed">
                        {issue.learning_guide.what_was_detected} {issue.learning_guide.why_it_matters}
                      </p>
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-teal-800 dark:text-teal-400">
                        What to try & How to verify
                      </h4>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 mt-1.5 leading-relaxed">
                        {issue.learning_guide.what_to_try} {issue.learning_guide.how_to_verify}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
};

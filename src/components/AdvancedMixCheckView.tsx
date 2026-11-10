import React, { useState } from 'react';
import {
  AnalysisReport,
  buildConsentGatedAiPayload,
  ConsentState,
  GenreId,
  MixStage,
  StemSourceType,
  StemSubmissionCandidate,
  validateStemSubmissions,
} from '../contracts/analysisContract';
import { GENRE_LABELS, MIX_STAGE_LABELS } from '../contracts/demoFixtures';
import { WaveformInspector, formatTimecode } from './WaveformInspector';
import { AlertTriangle, CheckCircle2, FileAudio, Layers, ShieldAlert } from 'lucide-react';

interface AdvancedMixCheckViewProps {
  report: AnalysisReport;
  genre: GenreId;
  mixStage: MixStage;
  consent: ConsentState;
  onChangeGenre: (genre: GenreId) => void;
  onChangeMixStage: (stage: MixStage) => void;
}

const MEASUREMENT_LABELS: Record<keyof AnalysisReport['measurements'], string> = {
  integrated_loudness: 'Integrated Loudness',
  short_term_max_loudness: 'Short-Term Max (3s)',
  momentary_max_loudness: 'Momentary Max (400ms)',
  true_peak_max: 'True Peak Max (4x ISP)',
  sample_clipping_events: 'Sample Clipping Events',
  loudness_range_lra: 'Loudness Range (LRA)',
  crest_factor: 'Dynamic Crest Factor',
  phase_correlation_mean: 'Phase Correlation (Mean)',
  phase_correlation_min: 'Phase Correlation (Min)',
  stereo_width_index: 'Stereo Width Index',
  sub_bass_energy_20_60hz: 'Sub-Bass (20–60 Hz)',
  mud_band_energy_200_500hz: 'Low-Mid / Mud (200–500 Hz)',
  presence_band_energy_2k_5khz: 'Presence (2–5 kHz)',
  air_band_energy_10k_20khz: 'High Air (10–20 kHz)',
};

export const AdvancedMixCheckView: React.FC<AdvancedMixCheckViewProps> = ({
  report,
  genre,
  mixStage,
  consent,
  onChangeGenre,
  onChangeMixStage,
}) => {
  const firstIssue = report.issues[0];
  const [activeIssueId, setActiveIssueId] = useState<string | null>(firstIssue?.issue_id ?? null);
  const [activeTimestamp, setActiveTimestamp] = useState<{
    start_sec: number;
    end_sec: number;
    label: string;
  } | null>(firstIssue?.timestamps[0] ?? null);
  const [monoMode, setMonoMode] = useState(false);

  // Interactive Rule 1 Stem Source Boundary Tester
  const [stemCandidates, setStemCandidates] = useState<StemSubmissionCandidate[]>([
    {
      filename: 'drums_bus_24bit.wav',
      stem_role: 'drums',
      stem_source_type: 'user_uploaded_original',
    },
    {
      filename: 'bass_di_and_amp.wav',
      stem_role: 'bass',
      stem_source_type: 'user_uploaded_original',
    },
  ]);
  const [newStemName, setNewStemName] = useState('lead_vocals_export.wav');
  const [newStemRole, setNewStemRole] = useState<StemSubmissionCandidate['stem_role']>('vocals');
  const [newStemSourceType, setNewStemSourceType] =
    useState<StemSourceType>('user_uploaded_original');

  const stemValidation = validateStemSubmissions(stemCandidates);
  const aiPayloadPreview = buildConsentGatedAiPayload(report);

  const handleAddStemCandidate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStemName.trim()) return;
    setStemCandidates((prev) => [
      ...prev,
      {
        filename: newStemName.trim(),
        stem_role: newStemRole,
        stem_source_type: newStemSourceType,
      },
    ]);
  };

  const handleResetStems = () => {
    setStemCandidates([
      {
        filename: 'drums_bus_24bit.wav',
        stem_role: 'drums',
        stem_source_type: 'user_uploaded_original',
      },
      {
        filename: 'bass_di_and_amp.wav',
        stem_role: 'bass',
        stem_source_type: 'user_uploaded_original',
      },
    ]);
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
        data-testid="demo-data-banner-advanced"
        className="border border-teal-800/30 dark:border-teal-500/30 bg-teal-50/70 dark:bg-teal-950/30 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3"
      >
        <div className="text-xs text-zinc-800 dark:text-zinc-200">
          <span className="font-mono font-semibold text-teal-900 dark:text-teal-300">
            [DEMONSTRATION DATA · PHASE 1 CONTRACT FIXTURE]
          </span>{' '}
          {report.data_source_notice}
        </div>
        <span className="text-xs font-mono tabular-nums text-zinc-500 dark:text-zinc-400 shrink-0">
          report_id: {report.report_id}
        </span>
      </div>

      {/* Header & Context Bar */}
      <section
        aria-label="Advanced Mix Check Context Controls"
        className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <p className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
              INTERFACE 02 · INTERMEDIATE ENGINEERING DIAGNOSTICS
            </p>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
              Advanced Mix Check
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
              Mathematical DSP measurement contract, clickable timestamp diagnostics, objective vs. stylistic separation, and Phase 2–5 capability boundaries.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label htmlFor="adv-genre-select" className="sr-only">
                Music Genre
              </label>
              <select
                id="adv-genre-select"
                value={genre}
                onChange={(e) => onChangeGenre(e.target.value as GenreId)}
                className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100"
              >
                {(Object.keys(GENRE_LABELS) as GenreId[]).map((g) => (
                  <option key={g} value={g}>
                    {GENRE_LABELS[g]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-md">
              {(['unmastered_mix', 'final_master'] as MixStage[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => onChangeMixStage(st)}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    mixStage === st
                      ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-950 dark:text-zinc-100'
                      : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                  }`}
                >
                  {MIX_STAGE_LABELS[st].title}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* File Metadata Strip */}
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
          <span className="inline-flex items-center gap-1.5 text-zinc-900 dark:text-zinc-100 font-medium">
            <FileAudio className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
            {report.file_metadata.filename}
          </span>
          <span>Format: {report.file_metadata.format}</span>
          <span>Sample Rate: {report.file_metadata.sample_rate_hz} Hz</span>
          <span>Bit Depth: {report.file_metadata.bit_depth}-bit</span>
          <span>Channels: {report.file_metadata.channels} (Stereo)</span>
          <span>Duration: {formatTimecode(report.file_metadata.duration_seconds)}</span>
        </div>
      </section>

      {/* Functional Waveform & Clickable Issue Timestamps */}
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
      />

      {/* Objective Mathematical DSP Measurements Table (Rule 2 Source of Truth) */}
      <section
        aria-label="Objective Mathematical DSP Measurements"
        className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-6"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2 pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Mathematical DSP Measurements Contract (Rule 2 Source of Truth)
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
              Every metric carries an explicit unit, standard, target window, and provenance (`phase1_demo_fixture` now; `mathematical_dsp` in Phase 2). AI is never permitted to invent or override these values.
            </p>
          </div>
          <span className="text-xs font-mono text-teal-800 dark:text-teal-400">
            14 Standardized Metrics
          </span>
        </div>

        <div className="overflow-x-auto mt-4">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-mono uppercase text-zinc-500 dark:text-zinc-400">
                <th className="py-2.5 pr-4">Parameter</th>
                <th className="py-2.5 px-4 text-right">Measured Value</th>
                <th className="py-2.5 px-4">Unit</th>
                <th className="py-2.5 px-4 text-right">Target Window</th>
                <th className="py-2.5 px-4">Standard / Method</th>
                <th className="py-2.5 pl-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-800 text-xs">
              {(Object.keys(report.measurements) as Array<keyof AnalysisReport['measurements']>).map(
                (mKey) => {
                  const m = report.measurements[mKey];
                  return (
                    <tr
                      key={mKey}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      <td className="py-2.5 pr-4 font-medium text-zinc-900 dark:text-zinc-100">
                        {MEASUREMENT_LABELS[mKey]}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                        {m.value > 0 && m.unit !== 'count' && m.unit !== 'percent'
                          ? `+${m.value}`
                          : m.value}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-zinc-600 dark:text-zinc-400">
                        {m.unit}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                        {m.target_min !== null && m.target_max !== null
                          ? `${m.target_min} to ${m.target_max} ${m.unit}`
                          : m.target_max !== null
                            ? `<= ${m.target_max} ${m.unit}`
                            : 'Context-dependent'}
                      </td>
                      <td className="py-2.5 px-4 text-zinc-500 dark:text-zinc-400">
                        {m.standard}
                      </td>
                      <td className="py-2.5 pl-4 font-mono">
                        <span
                          className={
                            m.status === 'critical'
                              ? 'text-red-700 dark:text-red-400 font-semibold'
                              : m.status === 'warning'
                                ? 'text-amber-700 dark:text-amber-400 font-medium'
                                : 'text-teal-800 dark:text-teal-400'
                          }
                        >
                          {m.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  );
                }
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Dual-Column Separation: Objective Technical Warnings vs. Subjective Stylistic Differences (Rule 8) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Column 1: Objective Technical Warnings */}
        <section
          aria-label="Objective Technical Warnings"
          className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-6 space-y-4"
        >
          <div className="pb-3 border-b border-zinc-200 dark:border-zinc-800">
            <div className="text-xs font-mono text-amber-800 dark:text-amber-400 font-semibold">
              RULE 3 & 8 · OBJECTIVE TECHNICAL WARNINGS
            </div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
              Measurable Engineering Defects ({objectiveIssues.length})
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
              Deterministic signal boundary violations (true-peak overshoots, sample clipping, negative phase correlation). Never masked by genre preference.
            </p>
          </div>

          <div className="space-y-4">
            {objectiveIssues.map((issue) => (
              <div
                key={issue.issue_id}
                className="border border-zinc-200 dark:border-zinc-800 rounded-md p-4 bg-zinc-50/50 dark:bg-zinc-950/60"
              >
                <div className="flex items-center justify-between gap-2 text-xs font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                  <span className="font-semibold text-red-700 dark:text-red-400 uppercase">
                    {issue.severity} · CONFIDENCE {(issue.confidence * 100).toFixed(0)}%
                  </span>
                  <span>{issue.domain}</span>
                </div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
                  {issue.title}
                </h3>

                {/* Evidence items */}
                <div className="mt-2.5 space-y-1 text-xs font-mono tabular-nums text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 p-2.5 rounded border border-zinc-200 dark:border-zinc-800">
                  {issue.evidence.map((ev) => (
                    <div key={ev.metric_key} className="flex justify-between gap-2">
                      <span>{ev.metric_key}:</span>
                      <span className="font-semibold">
                        {ev.measured_value} {ev.unit} (Target {ev.target_range})
                      </span>
                    </div>
                  ))}
                </div>

                <dl className="mt-3 space-y-2 text-xs text-zinc-700 dark:text-zinc-300">
                  <div>
                    <dt className="font-semibold text-zinc-900 dark:text-zinc-100">
                      Engineering Correction:
                    </dt>
                    <dd className="mt-0.5">{issue.learning_guide.what_to_try}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-zinc-900 dark:text-zinc-100">
                      Verification Check:
                    </dt>
                    <dd className="mt-0.5">{issue.learning_guide.how_to_verify}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </section>

        {/* Column 2: Subjective Stylistic Differences */}
        <section
          aria-label="Subjective Stylistic Differences"
          className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-6 space-y-4"
        >
          <div className="pb-3 border-b border-zinc-200 dark:border-zinc-800">
            <div className="text-xs font-mono text-teal-800 dark:text-teal-400 font-semibold">
              RULE 8 · SUBJECTIVE STYLISTIC DIFFERENCES
            </div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
              Genre & Aesthetic Context Notes ({stylisticIssues.length})
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
              Tonal balance and macrodynamic traits compared against {GENRE_LABELS[genre]} conventions. Evaluate by ear and artistic intent.
            </p>
          </div>

          <div className="space-y-4">
            {stylisticIssues.map((issue) => (
              <div
                key={issue.issue_id}
                className="border border-zinc-200 dark:border-zinc-800 rounded-md p-4 bg-zinc-50/50 dark:bg-zinc-950/60"
              >
                <div className="flex items-center justify-between gap-2 text-xs font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                  <span className="font-semibold text-teal-800 dark:text-teal-400 uppercase">
                    STYLISTIC {issue.severity} · CONFIDENCE {(issue.confidence * 100).toFixed(0)}%
                  </span>
                  <span>{issue.domain}</span>
                </div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
                  {issue.title}
                </h3>

                <div className="mt-2.5 space-y-1 text-xs font-mono tabular-nums text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 p-2.5 rounded border border-zinc-200 dark:border-zinc-800">
                  {issue.evidence.map((ev) => (
                    <div key={ev.metric_key} className="flex justify-between gap-2">
                      <span>{ev.metric_key}:</span>
                      <span>
                        {ev.measured_value} {ev.unit} ({ev.target_range})
                      </span>
                    </div>
                  ))}
                </div>

                <dl className="mt-3 space-y-2 text-xs text-zinc-700 dark:text-zinc-300">
                  <div>
                    <dt className="font-semibold text-zinc-900 dark:text-zinc-100">
                      Aesthetic Trade-Off:
                    </dt>
                    <dd className="mt-0.5">{issue.learning_guide.why_it_matters}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-zinc-900 dark:text-zinc-100">
                      Optional Experiment:
                    </dt>
                    <dd className="mt-0.5">{issue.learning_guide.what_to_try}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Optional Plugin-Chain Metadata Contract & Rule 1 Genuine Original Stem Validator */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Plugin Chain Metadata */}
        <section
          aria-label="Plugin Chain Metadata"
          className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-6"
        >
          <div className="pb-3 border-b border-zinc-200 dark:border-zinc-800">
            <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
              INPUT CONTEXT · OPTIONAL METADATA
            </span>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
              Reported DAW Mix Bus Plugin Chain
            </h2>
          </div>

          <div className="divide-y divide-zinc-200 dark:divide-zinc-800 mt-3 text-xs">
            {report.input_context.plugin_chain_metadata?.map((slot) => (
              <div key={slot.slot_index} className="py-3 flex items-start justify-between gap-4">
                <div>
                  <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                    Slot 0{slot.slot_index}: {slot.plugin_name}
                  </div>
                  <div className="text-zinc-600 dark:text-zinc-400 mt-0.5 font-mono">
                    {slot.settings_summary}
                  </div>
                </div>
                <span className="font-mono text-zinc-500 dark:text-zinc-400 uppercase shrink-0">
                  {slot.category}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Rule 1 Enforcement: Genuine Original Stems Only (No AI Stem Separation) */}
        <section
          aria-label="Rule 1 Stem Submission Boundary Validator"
          className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-6"
        >
          <div className="pb-3 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-1.5 text-xs font-mono text-teal-800 dark:text-teal-400 font-semibold">
              <Layers className="w-3.5 h-3.5" />
              <span>ABSOLUTE RULE 1 BOUNDARY CHECK · PHASE 4 CONTRACT</span>
            </div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
              Original User-Uploaded Stem Validator
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
              Never use AI stem separation, automatic stem splitting, or pseudo-stems. Test how the contract validates stem origin below:
            </p>
          </div>

          <form onSubmit={handleAddStemCandidate} className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label htmlFor="stem-filename-input" className="sr-only">
                Stem Filename
              </label>
              <input
                id="stem-filename-input"
                type="text"
                value={newStemName}
                onChange={(e) => setNewStemName(e.target.value)}
                placeholder="e.g. vocals_stem.wav"
                className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label htmlFor="stem-origin-select" className="sr-only">
                Stem Origin Type
              </label>
              <select
                id="stem-origin-select"
                value={newStemSourceType}
                onChange={(e) => setNewStemSourceType(e.target.value as StemSourceType)}
                className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-900 dark:text-zinc-100"
              >
                <option value="user_uploaded_original">user_uploaded_original (Allowed)</option>
                <option value="ai_separated">ai_separated (Rule 1 Forbidden)</option>
                <option value="pseudo_stem">pseudo_stem (Rule 1 Forbidden)</option>
              </select>
            </div>
            <div className="flex gap-1.5">
              <button
                type="submit"
                className="flex-1 px-3 py-1.5 rounded bg-teal-800 hover:bg-teal-900 text-white text-xs font-medium whitespace-nowrap"
              >
                Test Stem Rule
              </button>
              <button
                type="button"
                onClick={handleResetStems}
                className="px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-xs text-zinc-700 dark:text-zinc-300"
              >
                Reset
              </button>
            </div>
          </form>

          <div className="mt-3 space-y-1.5 text-xs font-mono">
            {stemCandidates.map((s, idx) => (
              <div
                key={`${s.filename}-${idx}`}
                className="flex items-center justify-between py-1 px-2.5 rounded bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800"
              >
                <span>
                  {s.filename} ({s.stem_role})
                </span>
                <span
                  className={
                    s.stem_source_type === 'user_uploaded_original'
                      ? 'text-teal-800 dark:text-teal-400'
                      : 'text-red-700 dark:text-red-400 font-semibold'
                  }
                >
                  {s.stem_source_type}
                </span>
              </div>
            ))}
          </div>

          {stemValidation.valid ? (
            <div className="mt-3 p-2.5 rounded border border-teal-200 dark:border-teal-900 bg-teal-50/60 dark:bg-teal-950/30 text-xs text-teal-900 dark:text-teal-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                Rule 1 Passed: All {stemCandidates.length} stem(s) are genuine user-uploaded original exports. (Phase 4 masking DSP status: NOT_IMPLEMENTED in Phase 1).
              </span>
            </div>
          ) : (
            <div
              role="alert"
              className="mt-3 p-2.5 rounded border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-xs text-red-900 dark:text-red-200 flex items-start gap-2"
            >
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong>HTTP 422 · PROHIBITED_AI_STEM_SEPARATION:</strong>{' '}
                {stemValidation.errors.join(' ')}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Phase 3-5 Forward-Compatible Capability Slots (Explicitly Marked NOT_IMPLEMENTED in Phase 1) */}
      <section
        aria-label="Phase 3 to 5 Future Architectural Capability Boundaries"
        className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-zinc-50/70 dark:bg-zinc-900/60 p-6"
      >
        <div className="pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
            CRITICAL PHASE BOUNDARY · FORWARD-COMPATIBLE EXTENSION SLOTS
          </div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
            Scheduled Phase 3–5 Capabilities (Unimplemented by Design in Phase 1)
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-950 p-4">
            <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
              PHASE 3 · HTTP 501 NOT_IMPLEMENTED
            </div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
              Streaming Playback Gain Estimates
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5 leading-relaxed">
              {report.capabilities.streaming_normalization_estimates.disclosure}
            </p>
          </div>

          <div className="border border-zinc-200 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-950 p-4">
            <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
              PHASE 4 · HTTP 501 NOT_IMPLEMENTED
            </div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
              Device Translation Approximation
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5 leading-relaxed">
              {report.capabilities.device_translation_preview.disclosure}
            </p>
          </div>

          <div className="border border-zinc-200 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-950 p-4">
            <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
              PHASE 5 · CONSENT GATE: {aiPayloadPreview.allowed ? 'OPTED IN' : 'BLOCKED'}
            </div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
              Consent-Controlled AI Interpretation
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5 leading-relaxed">
              {aiPayloadPreview.reason}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

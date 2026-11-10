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
import {
  AlertTriangle,
  CheckCircle2,
  FileAudio,
  Layers,
  ShieldAlert,
  Sliders,
  Volume2,
  Activity,
  Radio,
  FileText,
  Clock,
  Sparkles,
} from 'lucide-react';

interface AdvancedMixCheckViewProps {
  report: AnalysisReport;
  genre: GenreId;
  mixStage: MixStage;
  consent: ConsentState;
  onChangeGenre: (genre: GenreId) => void;
  onChangeMixStage: (stage: MixStage) => void;
}

type WorkbenchState = 'report' | 'empty' | 'loading' | 'error';

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
  const [workbenchState, setWorkbenchState] = useState<WorkbenchState>('report');
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

      {/* Header & Workbench Controls with UI State Switcher */}
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
              Advanced Mix Check Workbench
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
              Mathematical DSP measurement contract, clickable timestamp diagnostics, objective vs. stylistic separation, and Phase 2–5 capability boundaries.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* UI State Preview Switcher */}
            <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-md text-xs font-mono">
              <span className="px-2 text-zinc-500 text-[11px]">View State:</span>
              {(['report', 'empty', 'loading', 'error'] as WorkbenchState[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setWorkbenchState(st)}
                  className={`px-2.5 py-1 rounded capitalize transition-colors ${
                    workbenchState === st
                      ? 'bg-white dark:bg-zinc-950 text-teal-800 dark:text-teal-400 font-semibold shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

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
                      ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-950 dark:text-zinc-100 font-semibold'
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
          <span>Checksum: {report.file_metadata.sha256_checksum.slice(0, 12)}...</span>
        </div>
      </section>

      {/* Conditionally Render Empty, Loading, Error, or Full Report State */}
      {workbenchState === 'empty' && (
        <section className="border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg p-12 text-center bg-zinc-50/50 dark:bg-zinc-900/40">
          <FileAudio className="w-12 h-12 text-zinc-400 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            No Audio File Loaded
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1 max-w-md mx-auto">
            Drag and drop a 24-bit stereo WAV, FLAC, or AIFF bounce into the workspace, or click below to restore the demonstration report.
          </p>
          <button
            type="button"
            onClick={() => setWorkbenchState('report')}
            className="mt-4 px-4 py-2 rounded bg-teal-800 text-white text-xs font-medium hover:bg-teal-900 transition-colors"
          >
            Load Demonstration Contract Fixture
          </button>
        </section>
      )}

      {workbenchState === 'loading' && (
        <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-12 text-center bg-white dark:bg-zinc-900 space-y-4">
          <div className="w-8 h-8 border-2 border-teal-800 border-t-transparent rounded-full animate-spin mx-auto" />
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Simulating Phase 1 Contract Ingest & Verification...
          </h2>
          <p className="text-xs text-zinc-500 font-mono max-w-md mx-auto">
            Validating schema_version 1.0.0, checking consent state, calculating sha256 checksum. Real FFmpeg/libebur128 DSP runs in Phase 2.
          </p>
          <button
            type="button"
            onClick={() => setWorkbenchState('report')}
            className="text-xs text-teal-800 dark:text-teal-400 underline"
          >
            Return to Report
          </button>
        </section>
      )}

      {workbenchState === 'error' && (
        <section
          role="alert"
          className="border border-red-300 dark:border-red-800 rounded-lg p-6 bg-red-50/60 dark:bg-red-950/40 space-y-3"
        >
          <div className="flex items-center gap-2 text-red-800 dark:text-red-300 font-semibold text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>Inspection Error: Consent Revoked or Invalid Multi-Channel Configuration</span>
          </div>
          <p className="text-xs text-red-700 dark:text-red-300">
            Under Product Rule 4, audio analysis cannot execute when Permission 1 (audio_analysis_consent) is false. Enable audio analysis consent or provide a stereo bounce to continue.
          </p>
          <button
            type="button"
            onClick={() => setWorkbenchState('report')}
            className="px-3 py-1.5 rounded bg-red-800 text-white text-xs font-medium"
          >
            Reset to Demonstration Mode
          </button>
        </section>
      )}

      {workbenchState === 'report' && (
        <>
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

          {/* Categorized DSP Metric Sections (Loudness, Peaks, Dynamics, Frequency, Stereo) */}
          <section
            aria-label="Categorized Mathematical DSP Metric Domains"
            className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-6 space-y-6"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 pb-4 border-b border-zinc-200 dark:border-zinc-800">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  Standardized DSP Measurements (14 Standardized Parameters)
                </h2>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                  Grouped into 5 core engineering domains per ITU-R BS.1770-4, EBU R128, and Welch PSD. Mathematical DSP is the sole source of truth (Rule 2).
                </p>
              </div>
              <span className="text-xs font-mono text-teal-800 dark:text-teal-400">
                PROVENANCE: {report.measurements.integrated_loudness.source}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Domain 1: Loudness & Headroom */}
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-md p-4 bg-zinc-50/50 dark:bg-zinc-950/50 space-y-3">
                <div className="text-xs font-mono font-semibold text-teal-800 dark:text-teal-400 uppercase">
                  1. Loudness & Headroom
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center pb-1.5 border-b border-zinc-200/60 dark:border-zinc-800">
                    <span className="text-zinc-700 dark:text-zinc-300">Integrated Loudness:</span>
                    <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                      {report.measurements.integrated_loudness.value} LUFS
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-1.5 border-b border-zinc-200/60 dark:border-zinc-800">
                    <span className="text-zinc-700 dark:text-zinc-300">Short-Term Max (3s):</span>
                    <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                      {report.measurements.short_term_max_loudness.value} LUFS
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-1.5 border-b border-zinc-200/60 dark:border-zinc-800">
                    <span className="text-zinc-700 dark:text-zinc-300">Momentary Max (400ms):</span>
                    <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                      {report.measurements.momentary_max_loudness.value} LUFS
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-700 dark:text-zinc-300">Target Range:</span>
                    <span className="font-mono text-zinc-500">
                      {report.measurements.integrated_loudness.target_min} to{' '}
                      {report.measurements.integrated_loudness.target_max} LUFS
                    </span>
                  </div>
                </div>
              </div>

              {/* Domain 2: Peaks & Intersample Clipping */}
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-md p-4 bg-zinc-50/50 dark:bg-zinc-950/50 space-y-3">
                <div className="text-xs font-mono font-semibold text-red-700 dark:text-red-400 uppercase">
                  2. True Peak & Intersample Clipping
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center pb-1.5 border-b border-zinc-200/60 dark:border-zinc-800">
                    <span className="text-zinc-700 dark:text-zinc-300">True Peak Max (4x ISP):</span>
                    <span className="font-mono font-bold text-red-700 dark:text-red-400">
                      +{report.measurements.true_peak_max.value} dBTP
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-1.5 border-b border-zinc-200/60 dark:border-zinc-800">
                    <span className="text-zinc-700 dark:text-zinc-300">Sample Clipping Events:</span>
                    <span className="font-mono font-bold text-amber-700 dark:text-amber-400">
                      {report.measurements.sample_clipping_events.value} count
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-700 dark:text-zinc-300">Standard & Target:</span>
                    <span className="font-mono text-zinc-500">
                      ITU-R BS.1770-4 (&lt;= {report.measurements.true_peak_max.target_max} dBTP)
                    </span>
                  </div>
                </div>
              </div>

              {/* Domain 3: Dynamics & Crest Factor */}
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-md p-4 bg-zinc-50/50 dark:bg-zinc-950/50 space-y-3">
                <div className="text-xs font-mono font-semibold text-teal-800 dark:text-teal-400 uppercase">
                  3. Dynamics & Crest Factor
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center pb-1.5 border-b border-zinc-200/60 dark:border-zinc-800">
                    <span className="text-zinc-700 dark:text-zinc-300">Dynamic Crest Factor:</span>
                    <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                      {report.measurements.crest_factor.value} dB
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-1.5 border-b border-zinc-200/60 dark:border-zinc-800">
                    <span className="text-zinc-700 dark:text-zinc-300">Loudness Range (LRA):</span>
                    <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                      {report.measurements.loudness_range_lra.value} LU
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-700 dark:text-zinc-300">Measurement Standard:</span>
                    <span className="font-mono text-zinc-500">
                      EBU Tech 3342 (Dynamic spread)
                    </span>
                  </div>
                </div>
              </div>

              {/* Domain 4: Frequency Balance & Spectral Energy Bands */}
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-md p-4 bg-zinc-50/50 dark:bg-zinc-950/50 space-y-3">
                <div className="text-xs font-mono font-semibold text-teal-800 dark:text-teal-400 uppercase">
                  4. Frequency Balance (Welch PSD)
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center pb-1.5 border-b border-zinc-200/60 dark:border-zinc-800">
                    <span className="text-zinc-700 dark:text-zinc-300">Sub-Bass (20–60 Hz):</span>
                    <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                      {report.measurements.sub_bass_energy_20_60hz.value} dBFS
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-1.5 border-b border-zinc-200/60 dark:border-zinc-800">
                    <span className="text-zinc-700 dark:text-zinc-300">Low-Mid / Mud (200–500 Hz):</span>
                    <span className="font-mono font-bold text-amber-700 dark:text-amber-400">
                      {report.measurements.mud_band_energy_200_500hz.value} dBFS
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-1.5 border-b border-zinc-200/60 dark:border-zinc-800">
                    <span className="text-zinc-700 dark:text-zinc-300">Presence (2–5 kHz):</span>
                    <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                      {report.measurements.presence_band_energy_2k_5khz.value} dBFS
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-700 dark:text-zinc-300">High Air (10–20 kHz):</span>
                    <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                      {report.measurements.air_band_energy_10k_20khz.value} dBFS
                    </span>
                  </div>
                </div>
              </div>

              {/* Domain 5: Stereo Imaging & Phase Polarity */}
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-md p-4 bg-zinc-50/50 dark:bg-zinc-950/50 space-y-3">
                <div className="text-xs font-mono font-semibold text-teal-800 dark:text-teal-400 uppercase">
                  5. Stereo Imaging & Phase
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center pb-1.5 border-b border-zinc-200/60 dark:border-zinc-800">
                    <span className="text-zinc-700 dark:text-zinc-300">Phase Correlation (Mean):</span>
                    <span className="font-mono font-bold text-teal-800 dark:text-teal-400">
                      +{report.measurements.phase_correlation_mean.value}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-1.5 border-b border-zinc-200/60 dark:border-zinc-800">
                    <span className="text-zinc-700 dark:text-zinc-300">Worst-Case Dip (400ms):</span>
                    <span className="font-mono font-bold text-amber-700 dark:text-amber-400">
                      {report.measurements.phase_correlation_min.value}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-700 dark:text-zinc-300">Stereo Width Index:</span>
                    <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                      {report.measurements.stereo_width_index.value}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Domain 6: Phase 3 References & Playback Translation (Reserved) */}
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-md p-4 bg-zinc-50/50 dark:bg-zinc-950/50 space-y-3">
                <div className="text-xs font-mono font-semibold text-zinc-500 uppercase">
                  6. References & Translation (Reserved)
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Target for Phases 3–4: Loudness-matched reference track overlay and linear filter playback approximations (Club, Phone, Car).
                </p>
                <div className="pt-2 border-t border-zinc-200/60 dark:border-zinc-800 text-[11px] font-mono text-zinc-500">
                  Status: 501 NOT_IMPLEMENTED (Phase 3–4)
                </div>
              </div>
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

          {/* Reserved Capability Panels: References, Translation, Revisions & Opt-In AI */}
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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-950 p-4">
                <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                  PHASE 3 · HTTP 501 NOT_IMPLEMENTED
                </div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
                  Streaming Gain Estimates
                </h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5 leading-relaxed">
                  {report.capabilities.streaming_normalization_estimates.disclosure}
                </p>
              </div>

              <div className="border border-zinc-200 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-950 p-4">
                <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                  PHASE 3 · HTTP 501 NOT_IMPLEMENTED
                </div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
                  Reference Track Matching
                </h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5 leading-relaxed">
                  {report.capabilities.reference_track_comparison.disclosure}
                </p>
              </div>

              <div className="border border-zinc-200 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-950 p-4">
                <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                  PHASE 4 · HTTP 501 NOT_IMPLEMENTED
                </div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
                  Device Translation Profiles
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
                  Consent-Controlled AI
                </h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5 leading-relaxed">
                  {aiPayloadPreview.reason}
                </p>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

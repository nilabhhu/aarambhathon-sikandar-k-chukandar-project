/**
 * Canonical Shared Data Contract (Phase 1 Foundation)
 * Synchronized 1:1 with /contracts/analysis_report.schema.json
 */

export type InterfaceMode = 'simple' | 'advanced';

export type GenreId =
  | 'indie_rock'
  | 'electronic_club'
  | 'hip_hop_trap'
  | 'pop_vocal'
  | 'acoustic_folk'
  | 'cinematic_orchestral';

export type MixStage = 'unmastered_mix' | 'final_master';

export type MeasurementUnit =
  | 'LUFS'
  | 'dBTP'
  | 'LU'
  | 'dB'
  | 'dBFS'
  | 'Hz'
  | 'correlation'
  | 'percent'
  | 'count';

export type MeasurementSource = 'phase1_demo_fixture' | 'mathematical_dsp';

export type IssueClassification = 'objective_technical' | 'subjective_stylistic';

export type IssueDomain =
  | 'loudness'
  | 'true_peak_clipping'
  | 'dynamics'
  | 'phase_polarity'
  | 'stereo_field'
  | 'frequency_balance'
  | 'stem_masking';

export type IssueSeverity = 'critical' | 'warning' | 'notice' | 'pass';

export type CapabilityStatus =
  | 'DEMO_FIXTURE_ONLY'
  | 'NOT_IMPLEMENTED'
  | 'IMPLEMENTED'
  | 'PROHIBITED_BY_PRODUCT_RULE';

export type StemSourceType = 'user_uploaded_original' | 'ai_separated' | 'pseudo_stem';

export interface PluginChainItem {
  slot_index: number;
  plugin_name: string;
  category:
    | 'eq'
    | 'compression'
    | 'saturation'
    | 'limiting'
    | 'stereo_imaging'
    | 'reverb_delay'
    | 'other';
  settings_summary: string;
  bypassed: boolean;
}

export interface InputContext {
  interface_mode: InterfaceMode;
  genre: GenreId;
  mix_stage: MixStage;
  user_notes: string | null;
  plugin_chain_metadata: PluginChainItem[] | null;
}

export interface ConsentState {
  /** Permission 1: Required to inspect and analyze uploaded audio */
  audio_analysis_consent: boolean;
  /** Permission 2: Required before transferring structured metrics/audio context to external AI */
  external_ai_transfer_consent: boolean;
  /** Permission 3: Default MUST be false. Automatic training on user audio is prohibited. */
  model_training_opt_in: boolean;
  consent_timestamp: string;
}

export interface FileMetadata {
  filename: string;
  format: 'WAV' | 'FLAC' | 'AIFF' | 'MP3' | 'OGG';
  duration_seconds: number;
  sample_rate_hz: 44100 | 48000 | 88200 | 96000 | 192000;
  bit_depth: 16 | 24 | 32 | null;
  channels: 1 | 2;
  file_size_bytes: number;
  sha256_checksum: string;
}

export interface CapabilityDescriptor {
  status: CapabilityStatus;
  phase_target: number | null;
  disclosure: string;
}

export interface CapabilitiesMap {
  dsp_core_measurements: CapabilityDescriptor;
  streaming_normalization_estimates: CapabilityDescriptor;
  reference_track_comparison: CapabilityDescriptor;
  original_stem_multitrack_analysis: CapabilityDescriptor;
  device_translation_preview: CapabilityDescriptor;
  mix_revision_comparison: CapabilityDescriptor;
  ai_educational_interpretation: CapabilityDescriptor;
  ai_stem_separation: {
    status: 'PROHIBITED_BY_PRODUCT_RULE';
    phase_target: null;
    disclosure: string;
  };
}

export interface MeasurementValue {
  value: number;
  unit: MeasurementUnit;
  standard: string;
  target_min: number | null;
  target_max: number | null;
  status: 'optimal' | 'warning' | 'critical';
  source: MeasurementSource;
}

export interface MeasurementsMap {
  integrated_loudness: MeasurementValue;
  short_term_max_loudness: MeasurementValue;
  momentary_max_loudness: MeasurementValue;
  true_peak_max: MeasurementValue;
  sample_clipping_events: MeasurementValue;
  loudness_range_lra: MeasurementValue;
  crest_factor: MeasurementValue;
  phase_correlation_mean: MeasurementValue;
  phase_correlation_min: MeasurementValue;
  stereo_width_index: MeasurementValue;
  sub_bass_energy_20_60hz: MeasurementValue;
  mud_band_energy_200_500hz: MeasurementValue;
  presence_band_energy_2k_5khz: MeasurementValue;
  air_band_energy_10k_20khz: MeasurementValue;
}

export interface IssueTimestamp {
  start_sec: number;
  end_sec: number;
  label: string;
}

export interface IssueEvidence {
  metric_key: keyof MeasurementsMap;
  measured_value: number;
  unit: MeasurementUnit;
  target_range: string;
  method: string;
}

export interface LearningGuide {
  what_was_detected: string;
  why_it_matters: string;
  what_to_try: string;
  how_to_verify: string;
}

export interface AnalysisIssue {
  issue_id: string;
  classification: IssueClassification;
  domain: IssueDomain;
  severity: IssueSeverity;
  confidence: number;
  title: string;
  timestamps: IssueTimestamp[];
  evidence: IssueEvidence[];
  learning_guide: LearningGuide;
}

export interface AnalysisRecommendation {
  recommendation_id: string;
  priority_rank: number;
  linked_issue_id: string;
  classification: IssueClassification;
  action_title: string;
  beginner_summary: string;
  advanced_dsp_guidance: string;
  verification_check: string;
}

export interface AnalysisReport {
  schema_version: '1.0.0';
  report_id: string;
  created_at: string;
  is_demonstration_data: boolean;
  data_source_notice: string;
  input_context: InputContext;
  consent_state: ConsentState;
  file_metadata: FileMetadata;
  capabilities: CapabilitiesMap;
  measurements: MeasurementsMap;
  issues: AnalysisIssue[];
  recommendations: AnalysisRecommendation[];
  extensions: {
    streaming_estimates: null;
    reference_comparison: null;
    stem_multitrack_report: null;
    device_translation_profiles: null;
    revision_comparison: null;
    ai_interpretation: null;
  };
}

export interface StemSubmissionCandidate {
  filename: string;
  stem_role: 'drums' | 'bass' | 'vocals' | 'guitars_keys' | 'fx_aux';
  stem_source_type: StemSourceType;
}

export interface ContractValidationResult {
  valid: boolean;
  errors: string[];
}

export function createDefaultConsentState(): ConsentState {
  return {
    audio_analysis_consent: true,
    external_ai_transfer_consent: false,
    model_training_opt_in: false,
    consent_timestamp: new Date().toISOString(),
  };
}

export function validateConsentForAction(
  consent: ConsentState,
  action: 'local_analysis' | 'external_ai_interpretation'
): ContractValidationResult {
  const errors: string[] = [];

  if (!consent.audio_analysis_consent) {
    errors.push(
      'Rule 4 Violation: Explicit audio_analysis_consent is required before examining or measuring audio.'
    );
  }

  if (action === 'external_ai_interpretation' && !consent.external_ai_transfer_consent) {
    errors.push(
      'Rule 4 Violation: Separate external_ai_transfer_consent is required before sending measurements to an external AI service.'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateStemSubmissions(
  stems: StemSubmissionCandidate[]
): ContractValidationResult {
  const errors: string[] = [];

  for (const stem of stems) {
    if (stem.stem_source_type !== 'user_uploaded_original') {
      errors.push(
        `Rule 1 Violation on "${stem.filename}": stem_source_type="${stem.stem_source_type}" is prohibited. AI stem separation, automatic stem splitting, and pseudo-stems are never allowed.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

const VALID_UNITS: ReadonlySet<string> = new Set([
  'LUFS',
  'dBTP',
  'LU',
  'dB',
  'dBFS',
  'Hz',
  'correlation',
  'percent',
  'count',
]);

export function validatePhase1AnalysisReport(
  report: AnalysisReport
): ContractValidationResult {
  const errors: string[] = [];

  if (report.schema_version !== '1.0.0') {
    errors.push(`Unsupported schema_version: ${String(report.schema_version)}`);
  }

  if (!report.is_demonstration_data) {
    errors.push(
      'Phase 1 Boundary Violation: is_demonstration_data MUST be true in Phase 1 before Phase 2 DSP engine integration.'
    );
  }

  if (!report.data_source_notice || !report.data_source_notice.toUpperCase().includes('DEMONSTRATION')) {
    errors.push(
      'Phase 1 Boundary Violation: data_source_notice must visibly label payload as DEMONSTRATION data.'
    );
  }

  if (!report.consent_state.audio_analysis_consent) {
    errors.push('Rule 4 Violation: Report cannot exist without audio_analysis_consent=true.');
  }

  if (
    report.capabilities.ai_stem_separation.status !== 'PROHIBITED_BY_PRODUCT_RULE'
  ) {
    errors.push('Rule 1 Violation: ai_stem_separation capability must be PROHIBITED_BY_PRODUCT_RULE.');
  }

  // Verify every measurement has a valid unit and non-AI source (Rule 2)
  for (const [key, m] of Object.entries(report.measurements)) {
    if (!VALID_UNITS.has(m.unit)) {
      errors.push(`Invalid unit "${m.unit}" on measurement "${key}".`);
    }
    if (m.source !== 'phase1_demo_fixture' && m.source !== 'mathematical_dsp') {
      errors.push(
        `Rule 2 Violation on "${key}": Measurement source "${String(m.source)}" is invalid. AI must never invent measurements.`
      );
    }
  }

  // Verify issues keep objective technical warnings distinct from subjective stylistic notes (Rule 8)
  for (const issue of report.issues) {
    if (
      issue.classification !== 'objective_technical' &&
      issue.classification !== 'subjective_stylistic'
    ) {
      errors.push(`Rule 8 Violation: Issue "${issue.issue_id}" lacks valid classification.`);
    }
    if (issue.confidence < 0 || issue.confidence > 1) {
      errors.push(`Issue "${issue.issue_id}" confidence must be between 0.0 and 1.0.`);
    }
    if (issue.evidence.length === 0) {
      errors.push(`Rule 2 Violation: Issue "${issue.issue_id}" must cite at least one mathematical DSP evidence metric.`);
    }
    for (const ts of issue.timestamps) {
      if (ts.end_sec < ts.start_sec) {
        errors.push(`Issue "${issue.issue_id}" has invalid timestamp range ${ts.start_sec}..${ts.end_sec}.`);
      }
    }
  }

  // Verify Phase 1 extensions remain null (no premature Phase 3-6 implementation)
  for (const [extKey, extVal] of Object.entries(report.extensions)) {
    if (extVal !== null) {
      errors.push(
        `Phase 1 Boundary Violation: Extension slot "${extKey}" must be null in Phase 1.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function buildConsentGatedAiPayload(report: AnalysisReport): {
  allowed: boolean;
  reason: string;
  sanitizedPayload: {
    schema_version: string;
    genre: GenreId;
    mix_stage: MixStage;
    objective_measurements: MeasurementsMap;
    issue_Ids: string[];
    rule_reminder: string;
  } | null;
} {
  const check = validateConsentForAction(report.consent_state, 'external_ai_interpretation');
  if (!check.valid) {
    return {
      allowed: false,
      reason: check.errors.join(' '),
      sanitizedPayload: null,
    };
  }

  return {
    allowed: true,
    reason: 'External AI transfer permitted by explicit user consent. Only structured mathematical measurements are included.',
    sanitizedPayload: {
      schema_version: report.schema_version,
      genre: report.input_context.genre,
      mix_stage: report.input_context.mix_stage,
      objective_measurements: report.measurements,
      issue_Ids: report.issues.map((i) => i.issue_id),
      rule_reminder:
        'Rule 2 & 8: Do not invent or alter numerical measurements. Keep objective technical warnings separate from subjective stylistic advice.',
    },
  };
}

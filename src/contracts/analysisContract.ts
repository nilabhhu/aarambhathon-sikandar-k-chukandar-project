/**
 * Canonical Shared Data Contract (Phase 2 Real Mathematical DSP)
 * Synchronized 1:1 with /contracts/analysis_report.schema.json (v2.0.0)
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

export type MeasurementStatus = 'optimal' | 'warning' | 'critical' | 'unavailable';

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
  /** Permission 1: Required to inspect and analyze uploaded audio using mathematical DSP */
  audio_analysis_consent: boolean;
  /** Permission 2: Explicit permission for external AI to receive structured numerical measurements */
  external_ai_transfer_consent: boolean;
  /** Permission 2 Semantic Alias: Explicit permission for external AI to receive numerical metrics */
  ai_numerical_metrics_transfer_consent?: boolean;
  /** Permission 3: Separate explicit permission for external AI to inspect actual audio content/features */
  ai_audio_content_inspection_consent: boolean;
  /** Permission 4: Separate explicit permission for external transfer of raw audio bytes */
  raw_audio_transfer_consent: boolean;
  /** Permission 5: Separate explicit permission for model training. Default MUST be false. */
  model_training_opt_in: boolean;
  consent_timestamp: string;
}

export interface FileMetadata {
  filename: string;
  format: 'WAV' | 'FLAC' | 'AIFF' | 'MP3' | 'OGG';
  duration_seconds: number;
  sample_rate_hz: number;
  bit_depth: 16 | 24 | 32 | null;
  channels: 1 | 2;
  file_size_bytes: number;
  sha256_checksum: string;
  codec: string;
  bit_depth_note?: string | null;
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
  value: number | null;
  unit: MeasurementUnit;
  standard: string;
  target_min: number | null;
  target_max: number | null;
  status: MeasurementStatus;
  source: MeasurementSource;
  unavailable_reason?: string | null;
  algorithm_detail?: string | null;
}

export interface MeasurementsMap {
  sample_peak_max: MeasurementValue;
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

export interface TimelineBucket {
  start_sec: number;
  end_sec: number;
  peak_dbfs: number;
  rms_dbfs: number;
  momentary_lufs: number | null;
  short_term_lufs: number | null;
  phase_correlation: number | null;
  clipped: boolean;
}

export interface TimelineSeries {
  bucket_duration_sec: number;
  total_duration_sec: number;
  buckets: TimelineBucket[];
}

export interface IssueTimestamp {
  start_sec: number;
  end_sec: number;
  label: string;
}

export interface IssueEvidence {
  metric_key: string;
  measured_value: number;
  unit: string;
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

export interface MixRecommendation {
  recommendation_id: string;
  priority_rank: number;
  linked_issue_id: string;
  classification: IssueClassification;
  action_title: string;
  beginner_summary: string;
  advanced_dsp_guidance: string;
  verification_check: string;
}

export interface AnalysisExtensions {
  streaming_estimates: Record<string, unknown> | null;
  reference_comparison: Record<string, unknown> | null;
  stem_multitrack_report: Record<string, unknown> | null;
  device_translation_profiles: Record<string, unknown> | null;
  revision_comparison: Record<string, unknown> | null;
  ai_interpretation: Record<string, unknown> | null;
}

export interface AnalysisReport {
  schema_version: '2.0.0';
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
  recommendations: MixRecommendation[];
  extensions: AnalysisExtensions;
  timeline: TimelineSeries | null;
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
    ai_numerical_metrics_transfer_consent: false,
    ai_audio_content_inspection_consent: false,
    raw_audio_transfer_consent: false,
    model_training_opt_in: false,
    consent_timestamp: new Date().toISOString(),
  };
}

export function validateConsentForAction(
  consent: ConsentState,
  action:
    | 'local_analysis'
    | 'external_ai_interpretation'
    | 'ai_audio_inspection'
    | 'raw_audio_transfer'
    | 'model_training'
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

  if (action === 'ai_audio_inspection' && !consent.ai_audio_content_inspection_consent) {
    errors.push(
      'Rule 4 Violation: Separate explicit ai_audio_content_inspection_consent is required before AI can inspect actual audio content.'
    );
  }

  if (action === 'raw_audio_transfer' && !consent.raw_audio_transfer_consent) {
    errors.push(
      'Rule 4 Violation: Separate explicit raw_audio_transfer_consent is required before raw audio bytes can be transmitted externally.'
    );
  }

  if (action === 'model_training' && !consent.model_training_opt_in) {
    errors.push(
      'Rule 5 Violation: Model training is disabled by default. Explicit model_training_opt_in is required.'
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

const VALID_STATUSES: ReadonlySet<string> = new Set([
  'optimal',
  'warning',
  'critical',
  'unavailable',
]);

export function validateAnalysisReport(
  report: AnalysisReport,
  options?: { expectedMode?: 'dsp' | 'demo' | 'any' }
): ContractValidationResult {
  const errors: string[] = [];
  const expectedMode = options?.expectedMode ?? 'any';

  if (report.schema_version !== '2.0.0') {
    errors.push(`Invalid schema_version "${report.schema_version}". Expected "2.0.0".`);
  }

  if (expectedMode === 'dsp' && report.is_demonstration_data !== false) {
    errors.push('DSP Validation Error: is_demonstration_data must be false for live DSP analysis.');
  }

  if (expectedMode === 'demo' && report.is_demonstration_data !== true) {
    errors.push('Demo Validation Error: is_demonstration_data MUST be true for demonstration responses.');
  }

  if (!report.data_source_notice || report.data_source_notice.length < 10) {
    errors.push('Missing or incomplete data_source_notice string.');
  }

  // Verify Consent State
  if (typeof report.consent_state?.model_training_opt_in !== 'boolean') {
    errors.push('Rule 5 Violation: model_training_opt_in must be a boolean.');
  }
  if (typeof report.consent_state?.ai_audio_content_inspection_consent !== 'boolean') {
    errors.push('Rule 4 Violation: ai_audio_content_inspection_consent must be a boolean.');
  }
  if (typeof report.consent_state?.raw_audio_transfer_consent !== 'boolean') {
    errors.push('Rule 4 Violation: raw_audio_transfer_consent must be a boolean.');
  }

  // Verify Capabilities: ai_stem_separation must be permanently PROHIBITED_BY_PRODUCT_RULE (Rule 1)
  if (report.capabilities?.ai_stem_separation?.status !== 'PROHIBITED_BY_PRODUCT_RULE') {
    errors.push('Rule 1 Violation: ai_stem_separation capability must be PROHIBITED_BY_PRODUCT_RULE.');
  }

  // Verify measurements
  if (!report.measurements) {
    errors.push('Missing measurements object.');
  } else {
    for (const [key, m] of Object.entries(report.measurements)) {
      if (!VALID_UNITS.has(m.unit)) {
        errors.push(`Invalid unit "${m.unit}" on measurement "${key}".`);
      }
      if (!VALID_STATUSES.has(m.status)) {
        errors.push(`Invalid status "${m.status}" on measurement "${key}".`);
      }
      if (m.value === null && m.status !== 'unavailable') {
        errors.push(`Measurement "${key}" has null value but status is not "unavailable".`);
      }
      if (m.value !== null && typeof m.value !== 'number') {
        errors.push(`Measurement "${key}" value must be a number or null.`);
      }
      if (m.source !== 'phase1_demo_fixture' && m.source !== 'mathematical_dsp') {
        errors.push(
          `Rule 2 Violation on "${key}": Measurement source "${String(m.source)}" is invalid. AI must never invent measurements.`
        );
      }
      if (report.is_demonstration_data === false && m.source !== 'mathematical_dsp') {
        errors.push(
          `Source mismatch on "${key}": Live report must have source "mathematical_dsp", got "${m.source}".`
        );
      }
    }
  }

  // Verify issues keep objective technical warnings distinct from subjective stylistic notes (Rule 8)
  if (!Array.isArray(report.issues)) {
    errors.push('Missing or invalid issues array.');
  } else {
    for (const issue of report.issues) {
      if (
        issue.classification !== 'objective_technical' &&
        issue.classification !== 'subjective_stylistic'
      ) {
        errors.push(`Rule 8 Violation: Issue "${issue.issue_id}" lacks valid classification.`);
      }
      if (typeof issue.confidence !== 'number' || issue.confidence < 0 || issue.confidence > 1) {
        errors.push(`Issue "${issue.issue_id}" confidence must be between 0.0 and 1.0.`);
      }
      if (!Array.isArray(issue.evidence) || issue.evidence.length === 0) {
        errors.push(`Rule 2 Violation: Issue "${issue.issue_id}" must cite at least one mathematical DSP evidence metric.`);
      }
      if (Array.isArray(issue.timestamps)) {
        for (const ts of issue.timestamps) {
          if (ts.end_sec < ts.start_sec) {
            errors.push(`Issue "${issue.issue_id}" has invalid timestamp range ${ts.start_sec}..${ts.end_sec}.`);
          }
        }
      }
    }
  }

  // Timeline validation (when present)
  if (report.timeline !== null && report.timeline !== undefined) {
    if (!Array.isArray(report.timeline.buckets)) {
      errors.push('Timeline present but buckets is not an array.');
    } else if (report.timeline.buckets.length > 240) {
      errors.push(`Timeline buckets exceed limit of 240 (received ${report.timeline.buckets.length}).`);
    }
  }

  // Verify Phase 3-6 extensions remain null
  if (report.extensions) {
    for (const [extKey, extVal] of Object.entries(report.extensions)) {
      if (extVal !== null) {
        errors.push(
          `Phase Boundary Violation: Extension slot "${extKey}" must be null.`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Backward compatibility alias for Phase 1 tests / demo validator
 */
export function validatePhase1AnalysisReport(report: AnalysisReport): ContractValidationResult {
  return validateAnalysisReport(report, { expectedMode: 'demo' });
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

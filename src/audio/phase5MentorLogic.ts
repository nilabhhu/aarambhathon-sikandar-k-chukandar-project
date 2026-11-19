/**
 * Pure deterministic Phase 5 AI Mentor sanitization & offline fallback logic.
 * Decoupled from DOM/browser APIs so it can be unit-tested directly with node:test.
 *
 * Mirrors backend/app/ai/mentor.py 1:1:
 * - Never includes raw audio bytes when Toggle B is disabled (0 bytes sent).
 * - Cites ONLY real evidence_id values from measured DSP findings (Rule 2).
 * - Never suppresses objective technical warnings (e.g., true_peak_dbtp > -0.1)
 *   even when Aggressive Artist Vision is selected (Rule 3).
 */

import {
  AiCoachingStep,
  AiMentorResponse,
  AiPrivacyAudit,
  AnalysisIssue,
  AnalysisReport,
  ArtistVisionTag,
  ConsentState,
  GenreId,
  MixStage,
  UserReportedDawContext,
} from '../contracts/analysisContract';

export const ARTIST_VISION_OPTIONS: ReadonlyArray<{
  tag: ArtistVisionTag;
  shortHint: string;
}> = [
  { tag: 'Punchy', shortHint: 'Tight transient snap & controlled crest' },
  { tag: 'Warm', shortHint: 'Smooth upper-mids & cohesive low-mid body' },
  { tag: 'Aggressive', shortHint: 'Forward density via safe saturation' },
  { tag: 'Wide', shortHint: 'Spacious sides with mono-safe low end' },
  { tag: 'Dynamic', shortHint: 'Preserved LRA contrast & breathing room' },
];

export interface SanitizedAiMentorRequestPayload {
  allow_ai_interpretation: boolean;
  allow_direct_audio_inspection: boolean;
  allow_model_training: boolean;
  consent_state: ConsentState;
  interface_mode: 'simple' | 'advanced';
  genre: GenreId;
  mix_stage: MixStage;
  artist_vision: ArtistVisionTag[];
  report: {
    schema_version: '2.0.0';
    report_id: string;
    input_context: {
      interface_mode: 'simple' | 'advanced';
      genre: GenreId;
      mix_stage: MixStage;
    };
    measurements: AnalysisReport['measurements'];
    issues: AnalysisIssue[];
  };
  user_reported_context: UserReportedDawContext | null;
}

/**
 * Builds the strictly metrics-only JSON request payload for POST /api/v1/interpret/ai.
 * Guarantees zero raw audio bytes, zero PCM samples, and explicit consent flags.
 */
export function buildSanitizedAiMentorRequest(params: {
  report: AnalysisReport;
  genre: GenreId;
  mixStage: MixStage;
  interfaceMode: 'simple' | 'advanced';
  artistVision: ArtistVisionTag[];
  consent: ConsentState;
  dawContext?: UserReportedDawContext | null;
}): SanitizedAiMentorRequestPayload {
  const allowAi = Boolean(
    params.consent.external_ai_transfer_consent ||
      params.consent.ai_numerical_metrics_transfer_consent
  );
  const allowDirectAudio = Boolean(params.consent.ai_audio_content_inspection_consent);
  const allowTraining = Boolean(params.consent.model_training_opt_in);

  const hasUserContext = Boolean(
    params.dawContext &&
      (params.dawContext.daw_name.trim() ||
        params.dawContext.bus_routing.trim() ||
        params.dawContext.plugin_chain_notes.trim())
  );

  return {
    allow_ai_interpretation: allowAi,
    allow_direct_audio_inspection: allowDirectAudio,
    allow_model_training: allowTraining,
    consent_state: { ...params.consent },
    interface_mode: params.interfaceMode,
    genre: params.genre,
    mix_stage: params.mixStage,
    artist_vision: [...params.artistVision],
    report: {
      schema_version: '2.0.0',
      report_id: params.report.report_id,
      input_context: {
        interface_mode: params.interfaceMode,
        genre: params.genre,
        mix_stage: params.mixStage,
      },
      measurements: params.report.measurements,
      issues: params.report.issues,
    },
    user_reported_context: hasUserContext && params.dawContext
      ? {
          source_tag: 'user_reported_context',
          daw_name: params.dawContext.daw_name.trim(),
          bus_routing: params.dawContext.bus_routing.trim(),
          plugin_chain_notes: params.dawContext.plugin_chain_notes.trim(),
          updated_at: params.dawContext.updated_at,
        }
      : null,
  };
}

function buildVisionAlignmentNote(
  artistVision: ArtistVisionTag[],
  hasObjectiveWarning: boolean,
  genre: GenreId,
  mixStage: MixStage
): string {
  const stageLabel = mixStage === 'final_master' ? 'Final Master' : 'Unmastered Mix';
  const genreLabel = genre.replace(/_/g, ' ');

  const hints: Record<ArtistVisionTag, string> = {
    Punchy: 'tight transient impact (preserve crest factor and avoid over-compressing drum attacks)',
    Warm: 'controlled low-mid body without mud buildup and smooth upper-mid transitions',
    Aggressive:
      'forward harmonic density and perceived loudness via controlled saturation rather than digital clipping',
    Wide: 'expansive stereo side energy while keeping bass mono-centered and phase correlation positive',
    Dynamic: 'preserved macrodynamic contrast (healthy LRA and transient headroom without brickwall limiting)',
  };

  let base =
    artistVision.length === 0
      ? `Evaluated against ${genreLabel} (${stageLabel}) technical and tonal references with no custom Artist Vision tags selected.`
      : `Artist Vision (${artistVision.join(', ')}) prioritizes ${artistVision
          .map((t) => `${t}: ${hints[t]}`)
          .join('; ')}.`;

  if (hasObjectiveWarning) {
    base +=
      ' Rule 3 Technical Integrity: Objective boundary warnings (such as True Peak clipping or negative phase correlation) remain fully active and are never suppressed to match a creative vision.';
  }
  return base;
}

function issueToCoachingStep(
  issue: AnalysisIssue,
  artistVision: ArtistVisionTag[]
): AiCoachingStep {
  const evSnippets = issue.evidence
    .map((ev) => `${ev.metric_key}=${ev.measured_value} ${ev.unit}`.trim())
    .filter(Boolean);
  const targetSnippets = issue.evidence
    .map((ev) => (ev.target_range ? `${ev.metric_key} within ${ev.target_range}` : ''))
    .filter(Boolean);

  let whatHappened = issue.learning_guide.what_was_detected?.trim() || '';
  if (!whatHappened) {
    whatHappened =
      evSnippets.length > 0
        ? `Measured ${evSnippets.join(', ')}.`
        : `Flagged ${issue.title} from mathematical DSP analysis.`;
  }

  let listenPrompt =
    'Audition loudness-matched Mix A vs. Reference B—focus on transient punch, vocal anchor, and sustain density.';
  if (issue.domain === 'true_peak_clipping') {
    listenPrompt =
      'Audition the loudest snare/kick transients at unity gain—listen for brittle upper-mid crunch or fizz that worsens on streaming codecs.';
  } else if (issue.domain === 'phase_polarity' || issue.domain === 'stereo_field') {
    listenPrompt =
      'Toggle Mono vs. Stereo in the Translation Lab during the widest section—listen for guitars, synths, or bass thinning out in mono.';
  } else if (issue.domain === 'frequency_balance') {
    listenPrompt =
      'Switch between Studio Flat and Smartphone/Laptop preview—listen for vocal clarity and low-mid congestion around the flagged band.';
  }

  let whatToTry =
    issue.learning_guide.what_to_try?.trim() ||
    'Adjust gain staging, EQ, or dynamics incrementally in your DAW and verify loudness-matched.';
  if (
    issue.classification === 'objective_technical' &&
    artistVision.includes('Aggressive') &&
    issue.domain === 'true_peak_clipping'
  ) {
    whatToTry +=
      " To preserve your 'Aggressive' vision without inter-sample clipping, use controlled bus saturation or soft-clipping before a True Peak limiter capped at -1.0 dBTP (or -3.0 dBTP for unmastered mix).";
  }

  const recheckTarget =
    issue.learning_guide.how_to_verify?.trim() ||
    (targetSnippets.length > 0
      ? `Re-export Revision v2 and confirm ${targetSnippets.join('; ')}.`
      : 'Re-export Revision v2 and confirm the warning clears in Mix Revision Delta.');

  return {
    evidence_id: issue.issue_id,
    classification: issue.classification,
    title: issue.title,
    what_happened: whatHappened,
    why_it_matters:
      issue.learning_guide.why_it_matters?.trim() ||
      'Resolving this ensures clean playback translation across real listening systems.',
    listen_prompt: listenPrompt,
    what_to_try: whatToTry,
    recheck_target: recheckTarget,
  };
}

/**
 * Deterministic Offline Mentor Fallback (runs locally with zero network/API dependency).
 * Mirrors backend/app/ai/mentor.py so live demos never fail with HTTP 500 or offline errors.
 */
export function buildDeterministicClientMentorResponse(params: {
  report: AnalysisReport;
  genre: GenreId;
  mixStage: MixStage;
  artistVision: ArtistVisionTag[];
  consent: ConsentState;
  fallbackReason: string;
}): AiMentorResponse {
  const issues: AnalysisIssue[] = [...(params.report.issues || [])];
  const existingKeys = new Set<string>();
  for (const iss of issues) {
    for (const ev of iss.evidence || []) {
      if (ev.metric_key) existingKeys.add(ev.metric_key);
    }
  }

  // Rule 3 safety check: Guarantee true_peak_max > -0.1 dBTP is ALWAYS surfaced as objective_technical
  const tpVal = params.report.measurements?.true_peak_max?.value;
  if (typeof tpVal === 'number' && tpVal > -0.1 && !existingKeys.has('true_peak_max')) {
    issues.unshift({
      issue_id: 'dsp_true_peak_overshoot',
      classification: 'objective_technical',
      domain: 'true_peak_clipping',
      severity: 'critical',
      confidence: 0.99,
      title: `Inter-Sample True Peak Overshoot (${tpVal >= 0 ? '+' : ''}${tpVal.toFixed(2)} dBTP)`,
      timestamps: [],
      evidence: [
        {
          metric_key: 'true_peak_max',
          measured_value: Number(tpVal.toFixed(2)),
          unit: 'dBTP',
          target_range: '<= -1.0 dBTP',
          method: '4x oversampled True Peak',
        },
      ],
      learning_guide: {
        what_was_detected: `Measured 4x oversampled True Peak reached ${tpVal >= 0 ? '+' : ''}${tpVal.toFixed(2)} dBTP (above -0.1 dBTP).`,
        why_it_matters:
          'Peaks above -0.1 dBTP cause DAC inter-sample clipping and lossy codec distortion on Spotify, Apple Music, and YouTube.',
        what_to_try:
          'Enable True Peak limiting with a ceiling of -1.0 dBTP (final master) or pull down the master fader to <= -3.0 dBTP (unmastered mix).',
        how_to_verify: 'Re-bounce Revision v2 and confirm true_peak_max <= -1.0 dBTP.',
      },
    });
  }

  const sorted = issues.sort((a, b) => {
    const aObj = a.classification === 'objective_technical' ? 0 : 1;
    const bObj = b.classification === 'objective_technical' ? 0 : 1;
    if (aObj !== bObj) return aObj - bObj;
    const aCrit = a.severity === 'critical' ? 0 : 1;
    const bCrit = b.severity === 'critical' ? 0 : 1;
    return aCrit - bCrit;
  });

  const steps: AiCoachingStep[] = sorted
    .slice(0, 5)
    .map((iss) => issueToCoachingStep(iss, params.artistVision));

  if (steps.length === 0) {
    const lufs = params.report.measurements?.integrated_loudness?.value;
    const tp = params.report.measurements?.true_peak_max?.value;
    steps.push({
      evidence_id: 'dsp_overview',
      classification: 'subjective_stylistic',
      title: 'Technical Targets Met — Refine Translation by Ear',
      what_happened: `No objective technical violations were flagged (${
        typeof lufs === 'number' ? `${lufs.toFixed(1)} LUFS` : 'measured loudness'
      }, True Peak ${typeof tp === 'number' ? `${tp >= 0 ? '+' : ''}${tp.toFixed(2)} dBTP` : 'within range'}).`,
      why_it_matters:
        'Clean headroom and phase coherence provide a safe technical foundation for creative finishing.',
      listen_prompt:
        'Compare loudness-matched Mix A against Reference B across Studio Flat, Smartphone, and Mono preview modes.',
      what_to_try:
        'Make subtle 0.5–1.0 dB tonal adjustments only if ear-checks reveal vocal masking or tonal tilt.',
      recheck_target:
        'Confirm Revision v2 maintains safe True Peak ceiling and positive phase correlation.',
    });
  }

  const objectiveCount = steps.filter((s) => s.classification === 'objective_technical').length;
  const stylisticCount = steps.length - objectiveCount;
  const lufsVal = params.report.measurements?.integrated_loudness?.value;
  const metricBrief = [
    typeof lufsVal === 'number' ? `${lufsVal.toFixed(1)} LUFS integrated` : null,
    typeof tpVal === 'number' ? `${tpVal >= 0 ? '+' : ''}${tpVal.toFixed(2)} dBTP true peak` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const allowExternal = Boolean(
    params.consent.external_ai_transfer_consent ||
      params.consent.ai_numerical_metrics_transfer_consent
  );

  const privacyAudit: AiPrivacyAudit = {
    raw_audio_sent_to_ai: false,
    external_ai_enabled: allowExternal,
    direct_audio_inspection_enabled: Boolean(params.consent.ai_audio_content_inspection_consent),
    training_opt_in: Boolean(params.consent.model_training_opt_in),
    retention_policy: allowExternal
      ? 'Ephemeral API processing only (metrics-only JSON, 0 audio bytes sent). Zero server retention and zero model training.'
      : 'Local deterministic guidance only (0 bytes transmitted externally, 0 audio bytes sent, zero model training).',
  };

  return {
    schema_version: '2.0.0',
    mentor_mode: 'deterministic_fallback',
    model_name: null,
    fallback_reason: params.fallbackReason,
    artist_vision: [...params.artistVision],
    objective_warnings_preserved: true,
    summary: `Analyzed ${metricBrief || 'measured DSP metrics'} for ${params.genre.replace(/_/g, ' ')} (${params.mixStage.replace(/_/g, ' ')}): ${objectiveCount} objective technical warning(s) and ${stylisticCount} stylistic coaching note(s) identified. Resolve technical warnings first, then verify creative adjustments with Revision v2.`,
    vision_alignment_note: buildVisionAlignmentNote(
      params.artistVision,
      objectiveCount > 0,
      params.genre,
      params.mixStage
    ),
    coaching_steps: steps,
    privacy_audit: privacyAudit,
  };
}

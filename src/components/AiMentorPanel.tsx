import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  AiMentorResponse,
  AnalysisReport,
  ArtistVisionTag,
  ConsentState,
  GenreId,
  InterfaceMode,
  MixStage,
  UserReportedDawContext,
} from '../contracts/analysisContract';
import {
  ARTIST_VISION_OPTIONS,
  buildDeterministicClientMentorResponse,
} from '../audio/phase5MentorLogic';
import { requestAiMentorInterpretation } from '../services/apiService';
import { TACTILE_TAP } from '../lib/motion';
import {
  AlertTriangle,
  CheckCircle2,
  Compass,
  Headphones,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Wrench,
} from 'lucide-react';

interface AiMentorPanelProps {
  report: AnalysisReport;
  genre: GenreId;
  mixStage: MixStage;
  interfaceMode: InterfaceMode;
  consent: ConsentState;
  onChangeConsent: (next: ConsentState) => void;
  artistVision: ArtistVisionTag[];
  onChangeArtistVision: (next: ArtistVisionTag[]) => void;
  dawContext?: UserReportedDawContext | null;
  onSelectEvidenceId?: (issueId: string) => void;
}

export const AiMentorPanel: React.FC<AiMentorPanelProps> = ({
  report,
  genre,
  mixStage,
  interfaceMode,
  consent,
  onChangeConsent,
  artistVision,
  onChangeArtistVision,
  dawContext = null,
  onSelectEvidenceId,
}) => {
  const toggleAEnabled = Boolean(
    consent.external_ai_transfer_consent || consent.ai_numerical_metrics_transfer_consent
  );

  const [localOfflinePreview, setLocalOfflinePreview] = useState(false);
  const [mentor, setMentor] = useState<AiMentorResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);

  const validIssueIds = useMemo(
    () => new Set((report.issues || []).map((i) => i.issue_id)),
    [report.issues]
  );

  const visionKey = artistVision.join('|');
  const dawContextKey = dawContext
    ? `${dawContext.daw_name}|${dawContext.bus_routing}|${dawContext.plugin_chain_notes}`
    : '';

  const toggleVisionTag = (tag: ArtistVisionTag) => {
    if (artistVision.includes(tag)) {
      onChangeArtistVision(artistVision.filter((t) => t !== tag));
    } else {
      onChangeArtistVision([...artistVision, tag]);
    }
  };

  const handleEnableToggleA = () => {
    setLocalOfflinePreview(false);
    setErrorMessage(null);
    onChangeConsent({
      ...consent,
      external_ai_transfer_consent: true,
      ai_numerical_metrics_transfer_consent: true,
    });
  };

  const handleDisableToggleA = () => {
    setLocalOfflinePreview(false);
    setMentor(null);
    setErrorMessage(null);
    onChangeConsent({
      ...consent,
      external_ai_transfer_consent: false,
      ai_numerical_metrics_transfer_consent: false,
    });
  };

  const handleViewOfflineGuidance = () => {
    setErrorMessage(null);
    setLocalOfflinePreview(true);
  };

  const fetchLiveOrFallbackMentor = useCallback(async () => {
    if (!toggleAEnabled) return;
    setIsLoading(true);
    setErrorMessage(null);
    const result = await requestAiMentorInterpretation({
      report,
      genre,
      mixStage,
      interfaceMode,
      artistVision,
      consent,
      dawContext,
    });
    setIsLoading(false);
    if (result.success && result.mentor) {
      setMentor(result.mentor);
      setErrorMessage(null);
    } else {
      setErrorMessage(result.errorMessage || 'AI Mentor interpretation failed.');
    }
  }, [
    toggleAEnabled,
    report,
    genre,
    mixStage,
    interfaceMode,
    visionKey,
    consent.external_ai_transfer_consent,
    consent.ai_numerical_metrics_transfer_consent,
    consent.ai_audio_content_inspection_consent,
    consent.model_training_opt_in,
    dawContextKey,
  ]);

  // Automatically fetch when Toggle A is ON and inputs change
  useEffect(() => {
    let cancelled = false;
    if (toggleAEnabled) {
      setLocalOfflinePreview(false);
      setIsLoading(true);
      setErrorMessage(null);
      requestAiMentorInterpretation({
        report,
        genre,
        mixStage,
        interfaceMode,
        artistVision,
        consent,
        dawContext,
      }).then((result) => {
        if (cancelled) return;
        setIsLoading(false);
        if (result.success && result.mentor) {
          setMentor(result.mentor);
          setErrorMessage(null);
        } else {
          setErrorMessage(result.errorMessage || 'AI Mentor interpretation failed.');
        }
      });
    } else if (localOfflinePreview) {
      const localResponse = buildDeterministicClientMentorResponse({
        report,
        genre,
        mixStage,
        artistVision,
        consent,
        fallbackReason:
          'Viewing local Deterministic Offline Guidance with Toggle A OFF (0 bytes transmitted externally).',
      });
      setMentor(localResponse);
      setIsLoading(false);
      setErrorMessage(null);
    } else {
      setMentor(null);
      setIsLoading(false);
    }
    return () => {
      cancelled = true;
    };
  }, [
    toggleAEnabled,
    localOfflinePreview,
    report.report_id,
    genre,
    mixStage,
    interfaceMode,
    visionKey,
    consent.ai_audio_content_inspection_consent,
    consent.model_training_opt_in,
    dawContextKey,
  ]);

  const handleEvidenceClick = (evidenceId: string) => {
    setSelectedEvidenceId(evidenceId);
    if (onSelectEvidenceId && validIssueIds.has(evidenceId)) {
      onSelectEvidenceId(evidenceId);
    }
  };

  const isLiveGemini = mentor?.mentor_mode === 'gemini_live';

  return (
    <section
      aria-label="Evidence-Bound AI Mix Mentor and Artist Vision"
      data-testid="ai-mentor-panel"
      className="studio-elevated squircle-outer p-6 space-y-5"
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 studio-hairline-b">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-[var(--accent-primary)] font-medium">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>Evidence-Bound Mix Mentor (Rules 2 &amp; 3)</span>
          </div>
          <h2 className="text-lg font-bold text-[var(--text-primary)] mt-1">
            AI Mix Mentor &amp; Artist Vision Profile
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Every coaching step cites measured DSP evidence IDs. Objective technical warnings are never suppressed for creative style.
          </p>
        </div>

        {/* Active Mode Disclosure Badge */}
        {mentor && (
          <div className="flex flex-wrap items-center gap-2">
            <span
              data-testid="ai-mentor-mode-badge"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 squircle-inner text-xs font-mono border ${
                isLiveGemini
                  ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] border-[var(--border-active-color)]'
                  : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-hairline-color)]'
              }`}
            >
              {isLiveGemini ? (
                <>
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span>Gemini AI Mentor (Metrics-Only JSON)</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-[var(--accent-primary)]" />
                  <span>Deterministic Offline Fallback</span>
                </>
              )}
            </span>

            {toggleAEnabled && (
              <motion.button
                type="button"
                whileTap={TACTILE_TAP}
                onClick={fetchLiveOrFallbackMentor}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 squircle-inner border border-[var(--border-hairline-color)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-primary)] hover:border-[var(--border-active-color)] transition-colors disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </motion.button>
            )}
          </div>
        )}
      </div>

      {/* Artist Vision Profile Selector (Multi-select) */}
      <div className="squircle-inner studio-surface p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
            <Compass className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
            <span>Artist Vision Profile (Optional Multi-Select)</span>
          </div>
          {artistVision.length > 0 && (
            <button
              type="button"
              onClick={() => onChangeArtistVision([])}
              className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline underline-offset-2 cursor-pointer"
            >
              Clear Vision Tags
            </button>
          )}
        </div>

        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Artist Vision Profile Tags"
        >
          {ARTIST_VISION_OPTIONS.map((opt) => {
            const active = artistVision.includes(opt.tag);
            return (
              <motion.button
                key={opt.tag}
                type="button"
                whileTap={TACTILE_TAP}
                onClick={() => toggleVisionTag(opt.tag)}
                aria-pressed={active}
                data-testid={`vision-pill-${opt.tag.toLowerCase()}`}
                title={opt.shortHint}
                className={`px-3 py-1.5 squircle-inner text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-white font-semibold'
                    : 'border-[var(--border-hairline-color)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:border-[var(--border-active-color)]'
                }`}
              >
                {opt.tag}
              </motion.button>
            );
          })}
        </div>

        <p className="text-[11px] text-[var(--text-secondary)]">
          Guides creative trade-offs (e.g., density vs. transient snap).{' '}
          <strong className="text-[var(--text-primary)]">Rule 3:</strong> Objective technical warnings (True Peak &gt; -0.1 dBTP, clipping, negative phase) are never hidden.
        </p>
      </div>

      {/* Privacy Lock State (Toggle A OFF and Offline Preview not yet clicked) */}
      {!toggleAEnabled && !localOfflinePreview && (
        <div
          data-testid="ai-mentor-privacy-lock"
          className="squircle-inner studio-surface p-6 space-y-4"
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 squircle-inner studio-elevated flex items-center justify-center shrink-0 text-[var(--accent-primary)]">
              <Lock className="w-4 h-4" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                Privacy-First Lock: Zero Data Leaves Your Session by Default
              </h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-3xl">
                Toggle A (Metrics-Only AI Mentor) is currently <strong className="text-[var(--text-primary)]">OFF</strong>. When enabled, MixLearn Studio transmits <strong className="text-[var(--text-primary)]">only sanitized numerical DSP JSON</strong> (LUFS, True Peak, spectral bands, issue IDs, Artist Vision, and optional DAW notes)—<strong className="text-[var(--text-primary)]">0 raw audio bytes</strong>. Ephemeral API processing is strictly separate from model training (Toggle C remains <strong className="text-[var(--text-primary)]">OFF</strong> by default).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <motion.button
              type="button"
              whileTap={TACTILE_TAP}
              onClick={handleEnableToggleA}
              data-testid="enable-toggle-a-btn"
              className="inline-flex items-center gap-2 px-4 py-2 squircle-inner bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white text-xs font-semibold text-left transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>Enable Metrics-Only AI Mentor (JSON Only, Zero Audio)</span>
            </motion.button>

            <motion.button
              type="button"
              whileTap={TACTILE_TAP}
              onClick={handleViewOfflineGuidance}
              data-testid="view-offline-guidance-btn"
              className="inline-flex items-center gap-2 px-4 py-2 squircle-inner border border-[var(--border-hairline-color)] bg-[var(--bg-elevated)] hover:border-[var(--border-active-color)] text-[var(--text-primary)] text-xs font-medium text-left transition-colors cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-[var(--accent-primary)]" />
              <span>View Deterministic Offline Guidance</span>
            </motion.button>
          </div>
        </div>
      )}

      {/* Error State */}
      {errorMessage && (
        <div
          role="alert"
          className="squircle-inner border border-[var(--status-alert)]/35 bg-rose-50/80 dark:bg-rose-950/35 p-3.5 text-xs text-rose-900 dark:text-rose-200 flex items-start gap-2"
        >
          <AlertTriangle className="w-4 h-4 text-[var(--status-alert)] shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Loading Indicator */}
      {isLoading && (
        <div className="squircle-inner studio-surface p-6 flex items-center gap-3 text-xs text-[var(--text-secondary)]">
          <RefreshCw className="w-4 h-4 text-[var(--accent-primary)] animate-spin shrink-0" />
          <span>
            Generating evidence-bound coaching from sanitized DSP JSON (0 raw audio bytes transmitted)...
          </span>
        </div>
      )}

      {/* Rendered Mentor Coaching Output */}
      {!isLoading && mentor && (
        <div className="space-y-4">
          {/* Summary & Vision Alignment */}
          <div className="squircle-inner studio-surface p-4 space-y-2.5">
            <p className="text-xs text-[var(--text-primary)] leading-relaxed font-medium">
              {mentor.summary}
            </p>
            <p
              data-testid="ai-mentor-vision-note"
              className="text-xs text-[var(--text-secondary)] leading-relaxed pt-2.5 studio-hairline-t"
            >
              <strong className="text-[var(--text-primary)]">Vision Alignment: </strong>
              {mentor.vision_alignment_note}
            </p>
            {mentor.mentor_mode === 'deterministic_fallback' && mentor.fallback_reason && (
              <p className="text-[11px] font-mono text-[var(--text-secondary)] pt-1">
                Mode detail: {mentor.fallback_reason}
              </p>
            )}
          </div>

          {/* Evidence-Cited Coaching Step Cards */}
          <div className="space-y-3">
            {mentor.coaching_steps.map((step, index) => {
              const isObjective = step.classification === 'objective_technical';
              const canJumpToIssue = validIssueIds.has(step.evidence_id);
              const isSelected = selectedEvidenceId === step.evidence_id;

              return (
                <article
                  key={`${step.evidence_id}-${index}`}
                  data-testid="mentor-step-card"
                  className={`squircle-inner border p-4 space-y-3 transition-colors ${
                    isSelected
                      ? 'border-[var(--border-active-color)] bg-[var(--accent-soft)]/50'
                      : 'border-[var(--border-hairline-color)] bg-[var(--bg-elevated)]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-bold tabular-nums text-[var(--text-secondary)]">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span
                        className={`font-mono text-[11px] font-semibold px-2 py-0.5 squircle-inner border ${
                          isObjective
                            ? 'text-[var(--status-alert)] bg-rose-50/80 dark:bg-rose-950/40 border-[var(--status-alert)]/30'
                            : 'text-[var(--accent-primary)] bg-[var(--accent-soft)] border-[var(--border-active-color)]'
                        }`}
                      >
                        {isObjective ? 'Technical Warning' : 'Stylistic Note'}
                      </span>
                      <h3 className="text-sm font-bold text-[var(--text-primary)]">
                        {step.title}
                      </h3>
                    </div>

                    <motion.button
                      type="button"
                      whileTap={canJumpToIssue ? TACTILE_TAP : undefined}
                      onClick={() => handleEvidenceClick(step.evidence_id)}
                      data-testid={`mentor-evidence-${step.evidence_id}`}
                      title={
                        canJumpToIssue
                          ? 'Click to highlight this DSP issue and cue waveform marker'
                          : 'Measured DSP evidence identifier'
                      }
                      className={`inline-flex items-center gap-1 px-2.5 py-1 squircle-inner text-[11px] font-mono border transition-colors whitespace-nowrap ${
                        canJumpToIssue
                          ? 'border-[var(--border-active-color)] bg-[var(--accent-soft)] text-[var(--accent-primary)] hover:opacity-85 cursor-pointer'
                          : 'border-[var(--border-hairline-color)] bg-[var(--bg-surface)] text-[var(--text-secondary)] cursor-default'
                      }`}
                    >
                      <span>evidence: {step.evidence_id}</span>
                    </motion.button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
                    <div className="space-y-1.5">
                      <p className="text-[var(--text-secondary)] leading-relaxed">
                        <strong className="text-[var(--text-primary)]">What happened: </strong>
                        {step.what_happened}
                      </p>
                      <p className="text-[var(--text-secondary)] leading-relaxed">
                        <strong className="text-[var(--text-primary)]">Why it matters: </strong>
                        {step.why_it_matters}
                      </p>
                    </div>

                    <div className="space-y-2 squircle-inner studio-surface p-3.5">
                      <p className="text-[var(--text-secondary)] leading-relaxed flex items-start gap-1.5">
                        <Headphones className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0 mt-0.5" />
                        <span>
                          <strong className="text-[var(--text-primary)]">Listen for: </strong>
                          {step.listen_prompt}
                        </span>
                      </p>
                      <p className="text-[var(--text-primary)] leading-relaxed flex items-start gap-1.5">
                        <Wrench className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0 mt-0.5" />
                        <span>
                          <strong className="text-[var(--accent-primary)]">What to try: </strong>
                          {step.what_to_try}
                        </span>
                      </p>
                      <p className="text-[var(--text-secondary)] leading-relaxed flex items-start gap-1.5">
                        <Target className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0 mt-0.5" />
                        <span>
                          <strong className="text-[var(--text-primary)]">Recheck target: </strong>
                          {step.recheck_target}
                        </span>
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Transparent Privacy Audit Footer Strip */}
          <div
            data-testid="ai-privacy-audit-strip"
            className="squircle-inner studio-surface px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono tabular-nums text-[var(--text-secondary)]"
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1 text-[var(--status-safe)] font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Raw Audio Sent: {mentor.privacy_audit.raw_audio_sent_to_ai ? 'True' : '0 bytes (False)'}
                </span>
              </span>
              <span>
                Toggle A (Metrics JSON):{' '}
                <strong className="text-[var(--text-primary)]">
                  {mentor.privacy_audit.external_ai_enabled ? 'ON' : 'OFF'}
                </strong>
              </span>
              <span>
                Toggle B (Direct Audio):{' '}
                <strong className="text-[var(--text-primary)]">
                  {mentor.privacy_audit.direct_audio_inspection_enabled ? 'ON' : 'OFF'}
                </strong>
              </span>
              <span>
                Toggle C (Model Training):{' '}
                <strong className="text-[var(--text-primary)]">
                  {mentor.privacy_audit.training_opt_in ? 'True' : 'False'}
                </strong>
              </span>
            </div>

            <div className="flex items-center gap-3">
              {!toggleAEnabled ? (
                <button
                  type="button"
                  onClick={handleEnableToggleA}
                  className="text-[var(--accent-primary)] hover:underline font-semibold cursor-pointer"
                >
                  Enable Metrics-Only Gemini AI (Toggle A)
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleDisableToggleA}
                  className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline underline-offset-2 cursor-pointer"
                >
                  Lock &amp; Turn Toggle A Off
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

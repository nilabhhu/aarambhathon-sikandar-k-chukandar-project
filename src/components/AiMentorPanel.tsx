import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
      // Explicitly preserve Toggle B (direct audio) & Toggle C (training) as untouched/false
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
      className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-6 space-y-5"
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-[#3A7269] dark:text-teal-400 font-semibold">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>PHASE 5 · EVIDENCE-BOUND MIX MENTOR (RULE 2 &amp; RULE 3)</span>
          </div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mt-1">
            AI Mix Mentor &amp; Artist Vision Profile
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Every coaching step cites measured DSP evidence IDs. Objective technical warnings are never suppressed for creative style.
          </p>
        </div>

        {/* Active Mode Disclosure Badge */}
        {mentor && (
          <div className="flex flex-wrap items-center gap-2">
            <span
              data-testid="ai-mentor-mode-badge"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono border ${
                isLiveGemini
                  ? 'bg-[#3A7269]/10 text-[#3A7269] border-[#3A7269]/30 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-800'
                  : 'bg-[#F5F5F7] text-zinc-700 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700'
              }`}
            >
              {isLiveGemini ? (
                <>
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span>Gemini AI Mentor (Metrics-Only JSON)</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-[#3A7269] dark:text-teal-400" />
                  <span>Deterministic Offline Fallback</span>
                </>
              )}
            </span>

            {toggleAEnabled && (
              <button
                type="button"
                onClick={fetchLiveOrFallbackMentor}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Artist Vision Profile Selector (Multi-select) */}
      <div className="rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-[#FAFAFA] dark:bg-zinc-950/60 p-4 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            <Compass className="w-3.5 h-3.5 text-[#3A7269] dark:text-teal-400" />
            <span>Artist Vision Profile (Optional Multi-Select)</span>
          </div>
          {artistVision.length > 0 && (
            <button
              type="button"
              onClick={() => onChangeArtistVision([])}
              className="text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 underline underline-offset-2"
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
              <button
                key={opt.tag}
                type="button"
                onClick={() => toggleVisionTag(opt.tag)}
                aria-pressed={active}
                data-testid={`vision-pill-${opt.tag.toLowerCase()}`}
                title={opt.shortHint}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap ${
                  active
                    ? 'border-[#3A7269] bg-[#3A7269] text-white dark:border-teal-600 dark:bg-teal-700 font-semibold'
                    : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:border-[#3A7269]'
                }`}
              >
                {opt.tag}
              </button>
            );
          })}
        </div>

        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          Guides creative trade-offs (e.g., density vs. transient snap).{' '}
          <strong className="text-zinc-700 dark:text-zinc-300">Rule 3:</strong> Objective technical warnings (True Peak &gt; -0.1 dBTP, clipping, negative phase) are never hidden.
        </p>
      </div>

      {/* Privacy Lock State (Toggle A OFF and Offline Preview not yet clicked) */}
      {!toggleAEnabled && !localOfflinePreview && (
        <div
          data-testid="ai-mentor-privacy-lock"
          className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[#F5F5F7] dark:bg-zinc-950/70 p-6 space-y-4"
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shrink-0 text-[#3A7269] dark:text-teal-400">
              <Lock className="w-4 h-4" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Privacy-First Lock: Zero Data Leaves Your Session by Default
              </h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-3xl">
                Toggle A (Metrics-Only AI Mentor) is currently <strong>OFF</strong>. When enabled, MixLearn Studio transmits <strong>only sanitized numerical DSP JSON</strong> (LUFS, True Peak, spectral bands, issue IDs, Artist Vision, and optional DAW notes)—<strong>0 raw audio bytes</strong>. Ephemeral API processing is strictly separate from model training (Toggle C remains <strong>OFF</strong> by default).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleEnableToggleA}
              data-testid="enable-toggle-a-btn"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#3A7269] hover:bg-[#2F5E56] text-white text-xs font-semibold transition-colors whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Enable Metrics-Only AI Mentor (JSON Only, Zero Audio)</span>
            </button>

            <button
              type="button"
              onClick={handleViewOfflineGuidance}
              data-testid="view-offline-guidance-btn"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-medium transition-colors whitespace-nowrap"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#3A7269] dark:text-teal-400" />
              <span>View Deterministic Offline Guidance</span>
            </button>
          </div>
        </div>
      )}

      {/* Error State (e.g., Explicit HTTP 403 or HTTP 429 from FastAPI) */}
      {errorMessage && (
        <div
          role="alert"
          className="rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 p-3.5 text-xs text-rose-900 dark:text-rose-200 flex items-start gap-2"
        >
          <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Loading Indicator */}
      {isLoading && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[#FAFAFA] dark:bg-zinc-950/60 p-6 flex items-center gap-3 text-xs text-zinc-600 dark:text-zinc-400">
          <RefreshCw className="w-4 h-4 text-[#3A7269] dark:text-teal-400 animate-spin shrink-0" />
          <span>
            Generating evidence-bound coaching from sanitized DSP JSON (0 raw audio bytes transmitted)...
          </span>
        </div>
      )}

      {/* Rendered Mentor Coaching Output */}
      {!isLoading && mentor && (
        <div className="space-y-4">
          {/* Summary & Vision Alignment */}
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[#FAFAFA] dark:bg-zinc-950/60 p-4 space-y-2.5">
            <p className="text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed font-medium">
              {mentor.summary}
            </p>
            <p
              data-testid="ai-mentor-vision-note"
              className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed pt-2 border-t border-zinc-200/80 dark:border-zinc-800"
            >
              <strong className="text-zinc-800 dark:text-zinc-200">Vision Alignment: </strong>
              {mentor.vision_alignment_note}
            </p>
            {mentor.mentor_mode === 'deterministic_fallback' && mentor.fallback_reason && (
              <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 pt-1">
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
                  className={`rounded-lg border p-4 space-y-3 transition-colors ${
                    isSelected
                      ? 'border-[#3A7269] dark:border-teal-500 bg-[#3A7269]/[0.03] dark:bg-teal-950/20'
                      : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/40'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-bold tabular-nums text-zinc-500 dark:text-zinc-400">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span
                        className={`font-mono text-[11px] font-semibold px-2 py-0.5 rounded border ${
                          isObjective
                            ? 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900'
                            : 'text-[#3A7269] dark:text-teal-300 bg-[#3A7269]/10 dark:bg-teal-950/40 border-[#3A7269]/25 dark:border-teal-900'
                        }`}
                      >
                        {isObjective ? 'Technical Warning' : 'Stylistic Note'}
                      </span>
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                        {step.title}
                      </h3>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleEvidenceClick(step.evidence_id)}
                      data-testid={`mentor-evidence-${step.evidence_id}`}
                      title={
                        canJumpToIssue
                          ? 'Click to highlight this DSP issue and cue waveform marker'
                          : 'Measured DSP evidence identifier'
                      }
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono border transition-colors whitespace-nowrap ${
                        canJumpToIssue
                          ? 'border-[#3A7269]/40 bg-[#3A7269]/[0.06] text-[#3A7269] dark:text-teal-300 hover:bg-[#3A7269]/15 cursor-pointer'
                          : 'border-zinc-200 dark:border-zinc-700 bg-[#F5F5F7] dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 cursor-default'
                      }`}
                    >
                      <span>evidence: {step.evidence_id}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="space-y-1.5">
                      <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">
                        <strong className="text-zinc-900 dark:text-zinc-100">What happened: </strong>
                        {step.what_happened}
                      </p>
                      <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        <strong className="text-zinc-800 dark:text-zinc-200">Why it matters: </strong>
                        {step.why_it_matters}
                      </p>
                    </div>

                    <div className="space-y-2 rounded-md border border-zinc-200/80 dark:border-zinc-800 bg-[#FAFAFA] dark:bg-zinc-900/70 p-3">
                      <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed flex items-start gap-1.5">
                        <Headphones className="w-3.5 h-3.5 text-[#3A7269] dark:text-teal-400 shrink-0 mt-0.5" />
                        <span>
                          <strong className="text-zinc-900 dark:text-zinc-100">Listen for: </strong>
                          {step.listen_prompt}
                        </span>
                      </p>
                      <p className="text-teal-950 dark:text-teal-200 leading-relaxed flex items-start gap-1.5">
                        <Wrench className="w-3.5 h-3.5 text-[#3A7269] dark:text-teal-400 shrink-0 mt-0.5" />
                        <span>
                          <strong className="text-[#3A7269] dark:text-teal-300">What to try: </strong>
                          {step.what_to_try}
                        </span>
                      </p>
                      <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed flex items-start gap-1.5">
                        <Target className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
                        <span>
                          <strong className="text-zinc-800 dark:text-zinc-200">Recheck target: </strong>
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
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[#F5F5F7] dark:bg-zinc-950/70 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono tabular-nums text-zinc-600 dark:text-zinc-400"
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1 text-[#3A7269] dark:text-teal-400 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Raw Audio Sent: {mentor.privacy_audit.raw_audio_sent_to_ai ? 'True' : '0 bytes (False)'}
                </span>
              </span>
              <span>
                Toggle A (Metrics JSON):{' '}
                <strong className="text-zinc-800 dark:text-zinc-200">
                  {mentor.privacy_audit.external_ai_enabled ? 'ON' : 'OFF'}
                </strong>
              </span>
              <span>
                Toggle B (Direct Audio):{' '}
                <strong className="text-zinc-800 dark:text-zinc-200">
                  {mentor.privacy_audit.direct_audio_inspection_enabled ? 'ON' : 'OFF'}
                </strong>
              </span>
              <span>
                Toggle C (Model Training):{' '}
                <strong className="text-zinc-800 dark:text-zinc-200">
                  {mentor.privacy_audit.training_opt_in ? 'True' : 'False'}
                </strong>
              </span>
            </div>

            <div className="flex items-center gap-3">
              {!toggleAEnabled ? (
                <button
                  type="button"
                  onClick={handleEnableToggleA}
                  className="text-[#3A7269] dark:text-teal-400 hover:underline font-semibold"
                >
                  Enable Metrics-Only Gemini AI (Toggle A)
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleDisableToggleA}
                  className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 underline underline-offset-2"
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

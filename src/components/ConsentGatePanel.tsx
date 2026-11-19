import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ConsentState, validateConsentForAction } from '../contracts/analysisContract';
import { BRUT_EASE } from '../lib/motion';
import { Plus, X, Lock, AlertTriangle } from 'lucide-react';

interface ConsentGatePanelProps {
  consent: ConsentState;
  onChangeConsent: (updated: ConsentState) => void;
  compact?: boolean;
  variant?: 'grid' | 'accordion';
}

export const ConsentGatePanel: React.FC<ConsentGatePanelProps> = ({
  consent,
  onChangeConsent,
  compact = false,
  variant = 'grid',
}) => {
  const localCheck = validateConsentForAction(consent, 'local_analysis');
  const aiCheck = validateConsentForAction(consent, 'external_ai_interpretation');
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({ '02': true });

  const toggleRow = (id: string) => {
    setOpenRows((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleToggle = (
    key: keyof Omit<ConsentState, 'consent_timestamp' | 'ai_numerical_metrics_transfer_consent'>
  ) => {
    const updatedVal = !consent[key];
    const updatedState: ConsentState = {
      ...consent,
      [key]: updatedVal,
      consent_timestamp: new Date().toISOString(),
    };
    if (key === 'external_ai_transfer_consent') {
      updatedState.ai_numerical_metrics_transfer_consent = updatedVal;
    }
    onChangeConsent(updatedState);
  };

  if (variant === 'accordion') {
    const accordionRows = [
      {
        num: '01',
        title: 'LOCAL MATHEMATICAL DSP',
        tag: 'REQUIRED',
        active: consent.audio_analysis_consent,
        statusText: consent.audio_analysis_consent ? 'ACTIVE' : 'BLOCKED',
        summary:
          'Permits temporary ephemeral processing of your audio bounce to compute deterministic ITU-R BS.1770-4 loudness, 4x True Peak, phase correlation, and Welch PSD metrics. Uploaded files are purged immediately after analysis.',
        controls: (
          <label
            htmlFor="consent-local-dsp"
            className="inline-flex items-center gap-2.5 cursor-pointer font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]"
          >
            <input
              id="consent-local-dsp"
              type="checkbox"
              checked={consent.audio_analysis_consent}
              onChange={() => handleToggle('audio_analysis_consent')}
              className="h-4 w-4 accent-[#0A0A0A] cursor-pointer"
            />
            <span>{localCheck.valid ? 'EPHEMERAL DSP GATE: OPEN' : 'ANALYSIS BLOCKED'}</span>
          </label>
        ),
      },
      {
        num: '02',
        title: 'TOGGLE A · AI MENTOR (METRICS JSON ONLY)',
        tag: '0 AUDIO BYTES',
        active: consent.external_ai_transfer_consent,
        statusText: consent.external_ai_transfer_consent ? 'OPTED IN' : 'BLOCKED',
        summary:
          'Permits ephemeral server-side Gemini Mentor processing of sanitized numerical DSP JSON + Artist Vision tags only. Sends strictly 0 audio bytes and never enables model training.',
        controls: (
          <label
            htmlFor="consent-external-ai"
            className="inline-flex items-center gap-2.5 cursor-pointer font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]"
          >
            <input
              id="consent-external-ai"
              data-testid="toggle-a-ai-metrics"
              type="checkbox"
              checked={consent.external_ai_transfer_consent}
              onChange={() => handleToggle('external_ai_transfer_consent')}
              className="h-4 w-4 accent-[#0A0A0A] cursor-pointer"
            />
            <span>
              {aiCheck.valid
                ? 'METRICS-ONLY JSON ALLOWED (0 AUDIO)'
                : 'METRICS TRANSFER BLOCKED (DEFAULT)'}
            </span>
          </label>
        ),
      },
      {
        num: '03',
        title: 'TOGGLE B · DIRECT AUDIO & RAW TRANSFER',
        tag: 'STRICT BOUNDARY',
        active:
          consent.ai_audio_content_inspection_consent || consent.raw_audio_transfer_consent,
        statusText:
          consent.ai_audio_content_inspection_consent || consent.raw_audio_transfer_consent
            ? 'OPTED IN'
            : 'LOCKED OFF',
        summary:
          'Separate explicit switches required before any multimodal model may inspect audio content or before uncompressed raw audio bytes can leave the local execution boundary. Kept strictly OFF by default.',
        controls: (
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <label
              htmlFor="consent-ai-audio-inspect"
              className="inline-flex items-center gap-2 cursor-pointer font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]"
            >
              <input
                id="consent-ai-audio-inspect"
                data-testid="toggle-b-direct-audio"
                type="checkbox"
                checked={consent.ai_audio_content_inspection_consent}
                onChange={() => handleToggle('ai_audio_content_inspection_consent')}
                className="h-4 w-4 accent-[#0A0A0A] cursor-pointer"
              />
              <span>DIRECT AUDIO INSPECTION</span>
            </label>
            <label
              htmlFor="consent-raw-transfer"
              className="inline-flex items-center gap-2 cursor-pointer font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]"
            >
              <input
                id="consent-raw-transfer"
                type="checkbox"
                checked={consent.raw_audio_transfer_consent}
                onChange={() => handleToggle('raw_audio_transfer_consent')}
                className="h-4 w-4 accent-[#0A0A0A] cursor-pointer"
              />
              <span>RAW AUDIO TRANSFER</span>
            </label>
          </div>
        ),
      },
      {
        num: '04',
        title: 'TOGGLE C · MODEL TRAINING LOCK (RULE 5)',
        tag: 'DEFAULT FALSE',
        active: consent.model_training_opt_in,
        statusText: consent.model_training_opt_in ? 'FLAGGED' : 'DISABLED',
        summary:
          'Ephemeral API processing is strictly distinct from model training. Default is model_training_opt_in: false. Enabling Toggle A never opts your mixes into training pipelines.',
        controls: (
          <label
            htmlFor="consent-model-training"
            className="inline-flex items-center gap-2.5 cursor-pointer font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]"
          >
            <input
              id="consent-model-training"
              data-testid="toggle-c-model-training"
              type="checkbox"
              checked={consent.model_training_opt_in}
              onChange={() => handleToggle('model_training_opt_in')}
              className="h-4 w-4 accent-[#0A0A0A] cursor-pointer"
            />
            <span>MODEL TRAINING OPT-IN (ZERO PIPELINES ACTIVE)</span>
          </label>
        ),
      },
    ];

    return (
      <div
        aria-label="Privacy and Five-Tier Consent Configuration"
        className="flex flex-col h-full bg-[var(--bg-canvas)]"
      >
        <div className="px-5 py-3.5 border-b-[1.5px] border-[var(--border-ink)] bg-[var(--bg-surface)] flex flex-wrap items-center justify-between gap-2">
          <div className="font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--ink)]">
            GRANULAR PRIVACY PERMISSION GATE · RULES 4 &amp; 5
          </div>
          <div className="font-mono text-[10px] tabular-nums text-[var(--ink-muted)]">
            UTC {consent.consent_timestamp.slice(11, 19)}
          </div>
        </div>

        <div className="divide-y-[1.5px] divide-[var(--border-ink)] flex-1">
          {accordionRows.map((row) => {
            const isOpen = !!openRows[row.num];
            return (
              <div key={row.num} className="bg-[var(--bg-canvas)]">
                <button
                  type="button"
                  onClick={() => toggleRow(row.num)}
                  aria-expanded={isOpen}
                  className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
                >
                  <div className="flex items-baseline gap-3.5 min-w-0">
                    <span className="font-display text-2xl sm:text-3xl leading-none text-[var(--ink)] shrink-0">
                      {row.num}
                    </span>
                    <div className="min-w-0">
                      <div className="font-ui text-xs sm:text-sm font-bold uppercase tracking-wide text-[var(--ink)] truncate">
                        {row.title}
                      </div>
                      <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)] mt-0.5">
                        {row.tag}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <span
                      className={`px-2 py-0.5 border border-[var(--border-ink)] font-mono text-[10px] font-bold uppercase tracking-wider ${
                        row.active
                          ? 'bg-[#FFD600] text-[#0A0A0A]'
                          : 'bg-[var(--bg-surface)] text-[var(--ink)]'
                      }`}
                    >
                      {row.statusText}
                    </span>
                    <span
                      aria-hidden="true"
                      className="w-7 h-7 border-[1.5px] border-[var(--border-ink)] flex items-center justify-center bg-[var(--bg-canvas)] text-[var(--ink)]"
                    >
                      {isOpen ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    </span>
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: BRUT_EASE }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-4 pt-3 border-t border-[var(--border-ink)]/25 bg-[var(--bg-surface)] space-y-3">
                        <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
                          {row.summary}
                        </p>
                        <div className="pt-2 border-t border-[var(--border-ink)]/20">
                          {row.controls}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {!consent.audio_analysis_consent && (
          <div
            role="alert"
            className="p-3.5 border-t-2 border-[var(--border-ink)] bg-[#FF3B1F] text-white text-xs font-mono flex items-center gap-2.5"
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              ANALYSIS PAUSED (RULE 4): Re-enable Row 01 (Local Mathematical DSP) to inspect audio.
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <section
      aria-label="Privacy and Five-Tier Consent Configuration"
      className="border-2 border-[var(--border-ink)] bg-[var(--bg-canvas)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 border-b-2 border-[var(--border-ink)] bg-[var(--bg-surface)]">
        <div>
          <div className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--ink)]">
            <span className="w-2.5 h-2.5 bg-[#FFD600] border border-[var(--border-ink)]" />
            <span>PRIVACY-FIRST ARCHITECTURE · RULES 4 &amp; 5 ENFORCED</span>
          </div>
          <h2 className="font-ui text-base sm:text-lg font-bold uppercase tracking-tight text-[var(--ink)] mt-1">
            Granular Audio &amp; AI Privacy Permission Gate
          </h2>
          {!compact && (
            <p className="text-xs text-[var(--ink-muted)] mt-1 max-w-3xl leading-relaxed">
              Local DSP, Metrics-Only AI Mentor (Toggle A), Direct Audio Inspection (Toggle B), Raw Audio Transfer, and Model Training (Toggle C) are separately gated. Ephemeral API processing never opts into model training.
            </p>
          )}
        </div>
        <div className="font-mono text-[11px] tabular-nums px-2.5 py-1 border border-[var(--border-ink)] bg-[var(--bg-canvas)] text-[var(--ink)]">
          UTC {consent.consent_timestamp.slice(0, 19).replace('T', ' ')}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 divide-y-[1.5px] md:divide-y-0 md:divide-x-[1.5px] divide-[var(--border-ink)]">
        {/* 1. Local DSP */}
        <div className="p-4 flex flex-col justify-between bg-[var(--bg-canvas)]">
          <div>
            <div className="flex items-center justify-between gap-2 font-mono text-[10px] font-bold uppercase">
              <span>01 · REQUIRED</span>
              <span
                className={`px-1.5 py-0.5 border border-[var(--border-ink)] ${
                  consent.audio_analysis_consent
                    ? 'bg-[#FFD600] text-[#0A0A0A]'
                    : 'bg-[#FF3B1F] text-white'
                }`}
              >
                {consent.audio_analysis_consent ? 'GRANTED' : 'REVOKED'}
              </span>
            </div>
            <label
              htmlFor="consent-local-dsp"
              className="block font-ui text-xs font-bold uppercase tracking-wide text-[var(--ink)] mt-2 cursor-pointer"
            >
              1. Ephemeral Local DSP
            </label>
            <p className="text-[11px] text-[var(--ink-muted)] mt-1.5 leading-relaxed">
              Deterministic LUFS, True Peak, phase, and spectral metrics. Audio purged immediately.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-[var(--border-ink)]/25 flex items-center justify-between gap-2">
            <input
              id="consent-local-dsp"
              type="checkbox"
              checked={consent.audio_analysis_consent}
              onChange={() => handleToggle('audio_analysis_consent')}
              className="h-4 w-4 accent-[#0A0A0A] cursor-pointer"
            />
            <span className="font-mono text-[10px] uppercase text-[var(--ink-muted)]">
              {localCheck.valid ? 'Gate Open' : 'Blocked'}
            </span>
          </div>
        </div>

        {/* 2. Toggle A */}
        <div className="p-4 flex flex-col justify-between bg-[var(--bg-canvas)]">
          <div>
            <div className="flex items-center justify-between gap-2 font-mono text-[10px] font-bold uppercase">
              <span>TOGGLE A · JSON</span>
              <span
                className={`px-1.5 py-0.5 border border-[var(--border-ink)] ${
                  consent.external_ai_transfer_consent
                    ? 'bg-[#FFD600] text-[#0A0A0A]'
                    : 'bg-[var(--bg-surface)] text-[var(--ink)]'
                }`}
              >
                {consent.external_ai_transfer_consent ? 'OPTED IN' : 'BLOCKED'}
              </span>
            </div>
            <label
              htmlFor="consent-external-ai"
              className="block font-ui text-xs font-bold uppercase tracking-wide text-[var(--ink)] mt-2 cursor-pointer"
            >
              2. AI Mentor (0 Audio)
            </label>
            <p className="text-[11px] text-[var(--ink-muted)] mt-1.5 leading-relaxed">
              Ephemeral API processing of numerical DSP JSON + Artist Vision only. Zero audio bytes.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-[var(--border-ink)]/25 flex items-center justify-between gap-2">
            <input
              id="consent-external-ai"
              data-testid="toggle-a-ai-metrics"
              type="checkbox"
              checked={consent.external_ai_transfer_consent}
              onChange={() => handleToggle('external_ai_transfer_consent')}
              className="h-4 w-4 accent-[#0A0A0A] cursor-pointer"
            />
            <span className="font-mono text-[10px] uppercase text-[var(--ink-muted)]">
              {aiCheck.valid ? 'JSON Only' : 'Blocked'}
            </span>
          </div>
        </div>

        {/* 3. Toggle B */}
        <div className="p-4 flex flex-col justify-between bg-[var(--bg-canvas)]">
          <div>
            <div className="flex items-center justify-between gap-2 font-mono text-[10px] font-bold uppercase">
              <span>TOGGLE B · AUDIO</span>
              <span
                className={`px-1.5 py-0.5 border border-[var(--border-ink)] ${
                  consent.ai_audio_content_inspection_consent
                    ? 'bg-[#FFD600] text-[#0A0A0A]'
                    : 'bg-[var(--bg-surface)] text-[var(--ink)]'
                }`}
              >
                {consent.ai_audio_content_inspection_consent ? 'OPTED IN' : 'OFF'}
              </span>
            </div>
            <label
              htmlFor="consent-ai-audio-inspect"
              className="block font-ui text-xs font-bold uppercase tracking-wide text-[var(--ink)] mt-2 cursor-pointer"
            >
              3. Direct Audio Inspect
            </label>
            <p className="text-[11px] text-[var(--ink-muted)] mt-1.5 leading-relaxed">
              Separate gate before any multimodal model inspects audio bytes. Default OFF.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-[var(--border-ink)]/25 flex items-center justify-between gap-2">
            <input
              id="consent-ai-audio-inspect"
              data-testid="toggle-b-direct-audio"
              type="checkbox"
              checked={consent.ai_audio_content_inspection_consent}
              onChange={() => handleToggle('ai_audio_content_inspection_consent')}
              className="h-4 w-4 accent-[#0A0A0A] cursor-pointer"
            />
            <span className="font-mono text-[10px] uppercase text-[var(--ink-muted)]">
              {consent.ai_audio_content_inspection_consent ? 'Opted In' : '0 Bytes Sent'}
            </span>
          </div>
        </div>

        {/* 4. Raw Audio Transfer */}
        <div className="p-4 flex flex-col justify-between bg-[var(--bg-canvas)]">
          <div>
            <div className="flex items-center justify-between gap-2 font-mono text-[10px] font-bold uppercase">
              <span>04 · BOUNDARY</span>
              <span
                className={`px-1.5 py-0.5 border border-[var(--border-ink)] ${
                  consent.raw_audio_transfer_consent
                    ? 'bg-[#FFD600] text-[#0A0A0A]'
                    : 'bg-[var(--bg-surface)] text-[var(--ink)]'
                }`}
              >
                {consent.raw_audio_transfer_consent ? 'OPTED IN' : 'BLOCKED'}
              </span>
            </div>
            <label
              htmlFor="consent-raw-transfer"
              className="block font-ui text-xs font-bold uppercase tracking-wide text-[var(--ink)] mt-2 cursor-pointer"
            >
              4. Raw Audio Transfer
            </label>
            <p className="text-[11px] text-[var(--ink-muted)] mt-1.5 leading-relaxed">
              Required before uncompressed audio leaves local execution. Default OFF.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-[var(--border-ink)]/25 flex items-center justify-between gap-2">
            <input
              id="consent-raw-transfer"
              type="checkbox"
              checked={consent.raw_audio_transfer_consent}
              onChange={() => handleToggle('raw_audio_transfer_consent')}
              className="h-4 w-4 accent-[#0A0A0A] cursor-pointer"
            />
            <span className="font-mono text-[10px] uppercase text-[var(--ink-muted)]">
              {consent.raw_audio_transfer_consent ? 'Allowed' : 'Ephemeral'}
            </span>
          </div>
        </div>

        {/* 5. Toggle C: Model Training */}
        <div className="p-4 flex flex-col justify-between bg-[var(--bg-canvas)]">
          <div>
            <div className="flex items-center justify-between gap-2 font-mono text-[10px] font-bold uppercase">
              <span>TOGGLE C · RULE 5</span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 border border-[var(--border-ink)] bg-[var(--bg-surface)] text-[var(--ink)]">
                <Lock className="w-2.5 h-2.5" />
                {consent.model_training_opt_in ? 'FLAGGED' : 'OFF'}
              </span>
            </div>
            <label
              htmlFor="consent-model-training"
              className="block font-ui text-xs font-bold uppercase tracking-wide text-[var(--ink)] mt-2 cursor-pointer"
            >
              5. Model Training
            </label>
            <p className="text-[11px] text-[var(--ink-muted)] mt-1.5 leading-relaxed">
              Strictly OFF by default. Zero automatic training pipelines exist.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-[var(--border-ink)]/25 flex items-center justify-between gap-2">
            <input
              id="consent-model-training"
              data-testid="toggle-c-model-training"
              type="checkbox"
              checked={consent.model_training_opt_in}
              onChange={() => handleToggle('model_training_opt_in')}
              className="h-4 w-4 accent-[#0A0A0A] cursor-pointer"
            />
            <span className="font-mono text-[10px] uppercase text-[var(--ink-muted)]">
              No Training
            </span>
          </div>
        </div>
      </div>

      {!consent.audio_analysis_consent && (
        <div
          role="alert"
          className="p-3.5 border-t-2 border-[var(--border-ink)] bg-[#FF3B1F] text-white text-xs font-mono flex items-center gap-2.5"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            <strong>ANALYSIS PAUSED (RULE 4):</strong> Permission 1 (Ephemeral Local DSP) is unchecked. Re-enable above to run mix analysis.
          </span>
        </div>
      )}
    </section>
  );
};

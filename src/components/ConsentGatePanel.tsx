import React from 'react';
import { ConsentState, validateConsentForAction } from '../contracts/analysisContract';
import { ShieldCheck, Lock, AlertTriangle } from 'lucide-react';

interface ConsentGatePanelProps {
  consent: ConsentState;
  onChangeConsent: (updated: ConsentState) => void;
  compact?: boolean;
}

export const ConsentGatePanel: React.FC<ConsentGatePanelProps> = ({
  consent,
  onChangeConsent,
  compact = false,
}) => {
  const localCheck = validateConsentForAction(consent, 'local_analysis');
  const aiCheck = validateConsentForAction(consent, 'external_ai_interpretation');

  const handleToggle = (key: keyof Omit<ConsentState, 'consent_timestamp'>) => {
    onChangeConsent({
      ...consent,
      [key]: !consent[key],
      consent_timestamp: new Date().toISOString(),
    });
  };

  return (
    <section
      aria-label="Privacy and Three-Tier Consent Configuration"
      className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-zinc-50/70 dark:bg-zinc-900/80 p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <ShieldCheck className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            <span>PRIVACY-FIRST ARCHITECTURE</span>
            <span aria-hidden="true">·</span>
            <span>RULES 4 & 5 ENFORCED</span>
          </div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
            Granular Three-Tier Audio Permission Gate
          </h2>
          {!compact && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1 max-w-3xl">
              Audio analysis, external AI interpretation, and model training are governed by three independent permissions. Model training is disabled by default and automatic training is permanently prohibited.
            </p>
          )}
        </div>
        <div className="text-xs font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
          Updated: {consent.consent_timestamp.slice(0, 19).replace('T', ' ')} UTC
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        {/* Permission 1: Audio Analysis */}
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-950 p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
                PERMISSION 01 · REQUIRED
              </span>
              <span className="text-xs font-medium text-teal-800 dark:text-teal-400">
                {consent.audio_analysis_consent ? 'Granted' : 'Revoked'}
              </span>
            </div>
            <label
              htmlFor="consent-local-dsp"
              className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-1.5 cursor-pointer"
            >
              1. Ephemeral Mathematical DSP Analysis
            </label>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5 leading-relaxed">
              Permits temporary processing of your audio file to compute deterministic LUFS, True Peak, phase, and spectral metrics. Files are purged after analysis.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <input
              id="consent-local-dsp"
              type="checkbox"
              checked={consent.audio_analysis_consent}
              onChange={() => handleToggle('audio_analysis_consent')}
              className="h-4 w-4 rounded border-zinc-300 text-teal-700 focus:ring-teal-700 cursor-pointer"
            />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {localCheck.valid ? 'Analysis Gate Open' : 'Analysis Blocked'}
            </span>
          </div>
        </div>

        {/* Permission 2: External AI Service Transfer */}
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-950 p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
                PERMISSION 02 · OPTIONAL
              </span>
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {consent.external_ai_transfer_consent ? 'Opted In' : 'Blocked (Default)'}
              </span>
            </div>
            <label
              htmlFor="consent-external-ai"
              className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-1.5 cursor-pointer"
            >
              2. External AI Educational Interpretation
            </label>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5 leading-relaxed">
              Permits sending structured mathematical DSP measurements and mix context to the Gemini API for plain-language coaching. AI never invents measurements.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <input
              id="consent-external-ai"
              type="checkbox"
              checked={consent.external_ai_transfer_consent}
              onChange={() => handleToggle('external_ai_transfer_consent')}
              className="h-4 w-4 rounded border-zinc-300 text-teal-700 focus:ring-teal-700 cursor-pointer"
            />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {aiCheck.valid ? 'AI Payload Permitted' : 'External Transfer Blocked'}
            </span>
          </div>
        </div>

        {/* Permission 3: Model Training (Default False, No Automatic Training) */}
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-950 p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
                PERMISSION 03 · RULE 5 LOCK
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                <Lock className="w-3 h-3" />
                {consent.model_training_opt_in ? 'Explicit Opt-In Flagged' : 'Disabled (Default)'}
              </span>
            </div>
            <label
              htmlFor="consent-model-training"
              className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-1.5 cursor-pointer"
            >
              3. Model Training on User Audio
            </label>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5 leading-relaxed">
              Rule 5: Default is strictly OFF. Even if checked, Phase 1–6 implements zero automatic training pipelines on user audio or stems.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <input
              id="consent-model-training"
              type="checkbox"
              checked={consent.model_training_opt_in}
              onChange={() => handleToggle('model_training_opt_in')}
              className="h-4 w-4 rounded border-zinc-300 text-teal-700 focus:ring-teal-700 cursor-pointer"
            />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              No Auto-Training Implemented
            </span>
          </div>
        </div>
      </div>

      {!consent.audio_analysis_consent && (
        <div
          role="alert"
          className="mt-4 p-3.5 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2.5"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            <strong>Analysis Paused (Rule 4):</strong> Permission 1 (Ephemeral Mathematical DSP Analysis) is currently unchecked. Re-enable Permission 1 above to view or run mix analysis reports.
          </span>
        </div>
      )}
    </section>
  );
};

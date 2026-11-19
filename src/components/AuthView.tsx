import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Lock, ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { AppRoute } from '../auth/authLogic';
import { TACTILE_TAP } from '../lib/motion';

interface AuthViewProps {
  initialMode?: 'login' | 'signup';
  returnTo: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onAuthenticated: (destination: AppRoute) => void;
}

export const AuthView: React.FC<AuthViewProps> = ({
  initialMode = 'login',
  returnTo,
  onNavigate,
  onAuthenticated,
}) => {
  const { isSupabaseConfigured, signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [legalConsent, setLegalConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      if (mode === 'login') {
        const res = await signInWithEmail(email, password);
        if (!res.ok) {
          setErrorMsg(res.error || 'Unable to sign in.');
        } else {
          onAuthenticated(returnTo);
        }
      } else {
        const res = await signUpWithEmail({
          email,
          password,
          displayName,
          legalConsentAccepted: legalConsent,
        });
        if (!res.ok) {
          setErrorMsg(res.error || 'Unable to create account.');
        } else if (res.needsEmailConfirmation) {
          setSuccessMsg(
            'Account created. Check your inbox to confirm your email address, then log in.'
          );
          setMode('login');
        } else {
          onAuthenticated(returnTo);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      const res = await signInWithGoogle(returnTo);
      if (!res.ok) {
        setErrorMsg(res.error || 'Unable to start Google sign-in.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      aria-label="Account Authentication"
      className="max-w-5xl mx-auto my-4 sm:my-8 border-2 border-[var(--border-ink)] bg-[var(--bg-canvas)]"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* Left Editorial Column */}
        <div className="lg:col-span-5 p-6 sm:p-8 border-b-2 lg:border-b-0 lg:border-r-2 border-[var(--border-ink)] bg-[var(--bg-surface)] flex flex-col justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-[#FFD600] text-[#0A0A0A] border-[1.5px] border-[#0A0A0A] font-mono text-[10px] font-bold uppercase tracking-wider">
              <Lock className="w-3 h-3" aria-hidden="true" />
              <span>ISOLATED STUDIO ACCOUNT · 100% FREE</span>
            </div>

            <h1 className="font-display text-4xl sm:text-5xl text-[var(--ink)] mt-5 leading-[0.92]">
              {mode === 'login' ? 'SIGN IN TO STUDIO' : 'CREATE YOUR ACCOUNT'}
            </h1>

            <div className="mt-6 space-y-3 border-t-[1.5px] border-[var(--border-ink)] pt-5">
              <div className="flex items-start gap-2.5">
                <span className="font-mono text-xs font-bold px-1.5 py-0.5 bg-[var(--ink)] text-[var(--bg-canvas)] shrink-0">
                  01
                </span>
                <p className="text-xs text-[var(--ink)] leading-relaxed">
                  <strong>Row-Level Security (RLS):</strong> Your saved DSP summaries stay strictly private to your account.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="font-mono text-xs font-bold px-1.5 py-0.5 bg-[var(--ink)] text-[var(--bg-canvas)] shrink-0">
                  02
                </span>
                <p className="text-xs text-[var(--ink)] leading-relaxed">
                  <strong>Zero Raw Audio Stored:</strong> Audio files are analyzed ephemerally and never saved to cloud storage.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="font-mono text-xs font-bold px-1.5 py-0.5 bg-[var(--ink)] text-[var(--bg-canvas)] shrink-0">
                  03
                </span>
                <p className="text-xs text-[var(--ink)] leading-relaxed">
                  <strong>Free Educational Access:</strong> Full Simple &amp; Advanced DSP studio with zero subscriptions or paywalls.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t-[1.5px] border-[var(--border-ink)] flex items-center justify-between gap-2 font-mono text-[10px] uppercase text-[var(--ink-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[var(--ink)]" aria-hidden="true" />
              {isSupabaseConfigured ? 'SUPABASE AUTH CONNECTED' : 'LOCAL PREVIEW AUTH MODE'}
            </span>
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="underline font-bold text-[var(--ink)] cursor-pointer hover:text-[#FF3B1F]"
            >
              HOME
            </button>
          </div>
        </div>

        {/* Right Form Column */}
        <div className="lg:col-span-7 p-6 sm:p-8 bg-[var(--bg-canvas)]">
          {/* Instant-switch mode tabs (zero layoutId lag) */}
          <div
            role="tablist"
            aria-label="Authentication Mode"
            className="grid grid-cols-2 border-2 border-[var(--border-ink)] mb-6"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              data-testid="auth-tab-login"
              onClick={() => {
                setMode('login');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`py-3 font-ui text-xs font-bold uppercase tracking-wider cursor-pointer transition-none border-r-[1.5px] border-[var(--border-ink)] ${
                mode === 'login'
                  ? 'bg-[var(--ink)] text-[var(--bg-canvas)]'
                  : 'bg-transparent text-[var(--ink)] hover:bg-[var(--bg-surface)]'
              }`}
            >
              LOG IN
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signup'}
              data-testid="auth-tab-signup"
              onClick={() => {
                setMode('signup');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`py-3 font-ui text-xs font-bold uppercase tracking-wider cursor-pointer transition-none ${
                mode === 'signup'
                  ? 'bg-[var(--ink)] text-[var(--bg-canvas)]'
                  : 'bg-transparent text-[var(--ink)] hover:bg-[var(--bg-surface)]'
              }`}
            >
              SIGN UP FREE
            </button>
          </div>

          {!isSupabaseConfigured && (
            <div className="mb-5 p-3 border-[1.5px] border-[var(--border-ink)] bg-[var(--bg-surface)] font-mono text-[11px] text-[var(--ink)]">
              Supabase env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are not set in this preview container. Email sign-up/login runs an isolated browser session with full form validation.
            </div>
          )}

          {/* Google OAuth CTA */}
          <motion.button
            type="button"
            whileTap={TACTILE_TAP}
            disabled={submitting}
            onClick={handleGoogle}
            data-testid="auth-google-btn"
            className="w-full py-3 px-4 border-2 border-[var(--border-ink)] bg-[var(--bg-canvas)] text-[var(--ink)] hover:bg-[#FFD600] hover:text-[#0A0A0A] font-ui text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
          >
            <span
              aria-hidden="true"
              className="w-5 h-5 border border-current flex items-center justify-center font-mono text-xs font-black"
            >
              G
            </span>
            <span>CONTINUE WITH GOOGLE</span>
          </motion.button>

          <div className="my-5 flex items-center gap-3">
            <div className="h-[1.5px] flex-1 bg-[var(--border-ink)]/30" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--ink-muted)]">
              OR EMAIL &amp; PASSWORD
            </span>
            <div className="h-[1.5px] flex-1 bg-[var(--border-ink)]/30" />
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label
                  htmlFor="auth-display-name"
                  className="block font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--ink)] mb-1.5"
                >
                  STUDIO NAME (OPTIONAL)
                </label>
                <input
                  id="auth-display-name"
                  type="text"
                  autoComplete="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Alex Mercer"
                  className="w-full px-3.5 py-2.5 border-2 border-[var(--border-ink)] bg-[var(--bg-canvas)] text-[var(--ink)] text-sm font-sans"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="auth-email"
                className="block font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--ink)] mb-1.5"
              >
                EMAIL ADDRESS
              </label>
              <input
                id="auth-email"
                data-testid="auth-email-input"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="engineer@studio.com"
                className="w-full px-3.5 py-2.5 border-2 border-[var(--border-ink)] bg-[var(--bg-canvas)] text-[var(--ink)] text-sm font-sans"
              />
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="block font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--ink)] mb-1.5"
              >
                PASSWORD (MIN 8 CHARACTERS)
              </label>
              <input
                id="auth-password"
                data-testid="auth-password-input"
                type="password"
                required
                minLength={8}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 border-2 border-[var(--border-ink)] bg-[var(--bg-canvas)] text-[var(--ink)] text-sm font-sans"
              />
            </div>

            {mode === 'signup' && (
              <div className="p-3.5 border-[1.5px] border-[var(--border-ink)] bg-[var(--bg-surface)]">
                <label
                  htmlFor="auth-legal-consent"
                  className="flex items-start gap-3 cursor-pointer text-xs text-[var(--ink)] leading-relaxed"
                >
                  <input
                    id="auth-legal-consent"
                    data-testid="auth-consent-checkbox"
                    type="checkbox"
                    checked={legalConsent}
                    onChange={(e) => setLegalConsent(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[#0A0A0A] shrink-0 cursor-pointer"
                  />
                  <span>
                    I agree to the{' '}
                    <a
                      href="/privacy"
                      onClick={(e) => {
                        e.preventDefault();
                        onNavigate('/privacy');
                      }}
                      className="underline font-bold hover:text-[#FF3B1F]"
                    >
                      Privacy Policy
                    </a>{' '}
                    and{' '}
                    <a
                      href="/terms"
                      onClick={(e) => {
                        e.preventDefault();
                        onNavigate('/terms');
                      }}
                      className="underline font-bold hover:text-[#FF3B1F]"
                    >
                      Terms &amp; Conditions
                    </a>
                    .
                  </span>
                </label>
              </div>
            )}

            {errorMsg && (
              <div
                role="alert"
                data-testid="auth-error-banner"
                className="p-3 border-2 border-[var(--border-ink)] bg-[#FF3B1F] text-white text-xs font-mono flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div
                role="status"
                className="p-3 border-2 border-[#0A0A0A] bg-[#FFD600] text-[#0A0A0A] text-xs font-mono flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{successMsg}</span>
              </div>
            )}

            <motion.button
              type="submit"
              whileTap={TACTILE_TAP}
              disabled={submitting}
              data-testid="auth-submit-btn"
              className="w-full py-3.5 px-5 border-2 border-[#0A0A0A] bg-[#FFD600] text-[#0A0A0A] hover:bg-[#0A0A0A] hover:text-[#FFD600] dark:border-white font-ui text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <span>
                {submitting
                  ? 'AUTHENTICATING...'
                  : mode === 'login'
                  ? 'LOG IN TO STUDIO'
                  : 'CREATE FREE ACCOUNT'}
              </span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </motion.button>
          </form>
        </div>
      </div>
    </section>
  );
};

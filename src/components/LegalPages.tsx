import React from 'react';
import { ArrowLeft, Shield, FileText, Cookie } from 'lucide-react';
import { AppRoute } from '../auth/authLogic';

interface LegalPagesProps {
  route: '/privacy' | '/terms' | '/cookies';
  onNavigate: (route: AppRoute) => void;
}

const LEGAL_TABS: Array<{ route: '/privacy' | '/terms' | '/cookies'; label: string }> = [
  { route: '/privacy', label: 'PRIVACY POLICY' },
  { route: '/terms', label: 'TERMS & CONDITIONS' },
  { route: '/cookies', label: 'COOKIES POLICY' },
];

export const LegalPages: React.FC<LegalPagesProps> = ({ route, onNavigate }) => {
  return (
    <article
      aria-label="Legal and Privacy Policy"
      className="max-w-4xl mx-auto my-4 sm:my-8 border-2 border-[var(--border-ink)] bg-[var(--bg-canvas)]"
    >
      {/* Top Navigation Bar */}
      <div className="px-5 py-3.5 border-b-2 border-[var(--border-ink)] bg-[var(--bg-surface)] flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onNavigate('/')}
          className="inline-flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)] hover:text-[#FF3B1F] cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>BACK TO MIXLEARN STUDIO</span>
        </button>

        <nav aria-label="Legal Documents" className="flex flex-wrap items-center gap-1.5">
          {LEGAL_TABS.map((tab) => {
            const active = route === tab.route;
            return (
              <a
                key={tab.route}
                href={tab.route}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(tab.route);
                }}
                aria-current={active ? 'page' : undefined}
                className={`px-2.5 py-1 border-[1.5px] border-[var(--border-ink)] font-mono text-[10px] font-bold uppercase tracking-wider ${
                  active
                    ? 'bg-[var(--ink)] text-[var(--bg-canvas)]'
                    : 'bg-[var(--bg-canvas)] text-[var(--ink)] hover:bg-[var(--bg-surface)]'
                }`}
              >
                {tab.label}
              </a>
            );
          })}
        </nav>
      </div>

      {route === '/privacy' && (
        <div className="p-6 sm:p-8 space-y-6">
          <header className="border-b-[1.5px] border-[var(--border-ink)] pb-5">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-[#FFD600] text-[#0A0A0A] border border-[#0A0A0A] font-mono text-[10px] font-bold uppercase">
              <Shield className="w-3 h-3" aria-hidden="true" />
              <span>EFFECTIVE · PRIVACY-FIRST ARCHITECTURE</span>
            </div>
            <h1 className="font-display text-4xl sm:text-5xl text-[var(--ink)] mt-3">
              PRIVACY POLICY
            </h1>
          </header>

          <section className="space-y-2">
            <h2 className="font-ui text-base font-bold uppercase text-[var(--ink)]">
              01 · Ephemeral Audio Processing
            </h2>
            <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
              Audio bounces and original stems uploaded to MixLearn Studio are decoded inside an isolated ephemeral scratchpad strictly for mathematical DSP measurement (ITU-R BS.1770-4 loudness, 4× oversampled True Peak, phase correlation, and Welch PSD) and deleted automatically as soon as the analysis completes. Raw audio files are never stored in Supabase Storage or persistent databases.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-ui text-base font-bold uppercase text-[var(--ink)]">
              02 · Zero Default AI Model Training
            </h2>
            <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
              External AI Mentor interpretation is disabled by default and requires explicit opt-in (Toggle A). When enabled, only sanitized numerical DSP telemetry JSON (0 raw audio bytes) is transmitted for ephemeral coaching. Model training opt-in (Toggle C) is strictly separate and defaults to off.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-ui text-base font-bold uppercase text-[var(--ink)]">
              03 · Supabase Account Data Minimization &amp; RLS
            </h2>
            <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
              When you create an account, we store only your authentication identifier, email address, optional studio display name, and lightweight numerical mix session summaries (`track_name`, `genre`, `stage`, and summary metrics JSON). PostgreSQL Row-Level Security (`auth.uid() = user_id`) ensures no other user can read or modify your records.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-ui text-base font-bold uppercase text-[var(--ink)]">
              04 · Account &amp; Data Deletion Rights
            </h2>
            <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
              You retain full control over your account data. Deleting your user account cascades automatically across `profiles` and `mix_sessions`, permanently removing all saved session summaries. You may also clear local browser preferences at any time from your browser settings.
            </p>
          </section>
        </div>
      )}

      {route === '/terms' && (
        <div className="p-6 sm:p-8 space-y-6">
          <header className="border-b-[1.5px] border-[var(--border-ink)] pb-5">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-[#FFD600] text-[#0A0A0A] border border-[#0A0A0A] font-mono text-[10px] font-bold uppercase">
              <FileText className="w-3 h-3" aria-hidden="true" />
              <span>FREE EDUCATIONAL TOOL</span>
            </div>
            <h1 className="font-display text-4xl sm:text-5xl text-[var(--ink)] mt-3">
              TERMS &amp; CONDITIONS
            </h1>
          </header>

          <section className="space-y-2">
            <h2 className="font-ui text-base font-bold uppercase text-[var(--ink)]">
              01 · Free Educational Purpose
            </h2>
            <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
              MixLearn Studio is provided free of charge as an educational mixing and mastering analysis workbench. Diagnostics and coaching notes are informational engineering guidance designed to support your ear and DAW workflow.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-ui text-base font-bold uppercase text-[var(--ink)]">
              02 · 100% Audio Ownership
            </h2>
            <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
              You retain 100% copyright, master ownership, and intellectual property rights in all music, mixes, masters, and stems you analyze using MixLearn Studio. We claim no license to distribute, reproduce, or train models on your recordings.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-ui text-base font-bold uppercase text-[var(--ink)]">
              03 · Acceptable Use &amp; Audio Integrity
            </h2>
            <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
              You agree to upload only audio files you own or have permission to inspect, respect rate limits (15 AI Mentor requests/minute and 100 MB maximum file size), and refrain from attempting unauthorized access, abuse, or automated scraping of the API.
            </p>
          </section>
        </div>
      )}

      {route === '/cookies' && (
        <div className="p-6 sm:p-8 space-y-6">
          <header className="border-b-[1.5px] border-[var(--border-ink)] pb-5">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-[#FFD600] text-[#0A0A0A] border border-[#0A0A0A] font-mono text-[10px] font-bold uppercase">
              <Cookie className="w-3 h-3" aria-hidden="true" />
              <span>STRICTLY ESSENTIAL ONLY</span>
            </div>
            <h1 className="font-display text-4xl sm:text-5xl text-[var(--ink)] mt-3">
              COOKIES POLICY
            </h1>
          </header>

          <section className="space-y-2">
            <h2 className="font-ui text-base font-bold uppercase text-[var(--ink)]">
              01 · Strictly Essential Storage
            </h2>
            <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
              MixLearn Studio uses strictly essential browser storage and authentication session tokens solely to keep you securely signed in (Supabase Auth session) and to remember your Light/Dark studio theme and cookie banner acknowledgment.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-ui text-base font-bold uppercase text-[var(--ink)]">
              02 · Zero Advertising or Third-Party Tracking
            </h2>
            <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
              We do not load third-party ad networks, behavioral tracking pixels, social media beacons, or cross-site analytics scripts. Clearing your browser site data immediately removes all stored theme and session preferences.
            </p>
          </section>
        </div>
      )}
    </article>
  );
};

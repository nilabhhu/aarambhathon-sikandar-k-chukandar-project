import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpRight, Plus, X, Play, Check } from 'lucide-react';
import { LiveSpectrumAnalyzer } from './LiveSpectrumAnalyzer';
import { AppRoute } from '../auth/authLogic';
import { BRUT_EASE, TACTILE_TAP } from '../lib/motion';

interface LandingPageViewProps {
  isAuthenticated: boolean;
  onNavigate: (route: AppRoute) => void;
  onOpenAuth: (mode: 'login' | 'signup') => void;
}

const CORE_FEATURES = [
  {
    num: '01',
    tag: 'BEGINNER WORKFLOW',
    title: 'SIMPLE MIX CHECK',
    description:
      'Plain-English health tiles for Volume, Clipping Safety, Clarity, and Mono Compatibility with step-by-step DAW fix checklists.',
    highlight: false,
    targetRoute: '/simple' as AppRoute,
  },
  {
    num: '02',
    tag: 'ENGINEER TELEMETRY',
    title: '60FPS METERING & TRANSLATION LAB',
    description:
      'Live FFT Spectrum Analyzer, Momentary/Short-Term/Integrated LUFS, 4x True Peak, Goniometer Vectorscope, A/B loudness-matched reference switching, and speaker biquad filters.',
    highlight: true,
    targetRoute: '/advanced' as AppRoute,
  },
  {
    num: '03',
    tag: 'MULTITRACK & ITERATION',
    title: 'ORIGINAL STEMS & REVISION DELTAS',
    description:
      'Upload 2–8 genuine DAW stems for 50 ms alignment checks and 6-band masking overlap, then verify v1 vs. v2 mix improvements deterministically.',
    highlight: false,
    targetRoute: '/advanced' as AppRoute,
  },
  {
    num: '04',
    tag: 'EVIDENCE-BOUND COACHING',
    title: 'PRIVACY-FIRST AI MENTOR',
    description:
      'Consent-gated coaching grounded strictly in measured DSP JSON (0 raw audio bytes sent) with Artist Vision tags and deterministic offline fallback.',
    highlight: false,
    targetRoute: '/advanced' as AppRoute,
  },
];

const WORKFLOW_STEPS = [
  {
    num: '01',
    title: 'UPLOAD BOUNCE',
    detail: 'WAV, FLAC, AIFF, MP3, or OGG up to 100 MB. Analyzed ephemerally in isolated scratchpads.',
  },
  {
    num: '02',
    title: 'INSPECT REAL DSP & SPECTRUM',
    detail: 'Read ITU-R BS.1770-4 loudness, 4x True Peak, phase correlation, and live 60fps FFT spectrum.',
  },
  {
    num: '03',
    title: 'FIX IN DAW & VERIFY V2',
    detail: 'Apply targeted EQ, gain-staging, or mono adjustments and compare v1 vs. v2 deltas.',
  },
];

const FAQ_ITEMS = [
  {
    id: 'privacy',
    question: 'Are my uploaded audio files stored or used to train AI models?',
    answer:
      'No. Audio bounces are processed ephemerally and deleted immediately after DSP calculation. Only lightweight numerical session summaries are saved to your isolated account, and model training is strictly off by default.',
  },
  {
    id: 'stems',
    question: 'Does MixLearn Studio perform AI stem separation?',
    answer:
      'Never. Under Product Rule 1, AI stem splitting and pseudo-stems are permanently prohibited so masking diagnostics remain mathematically authentic. Upload 2–8 genuine original stems exported from your DAW.',
  },
  {
    id: 'formats',
    question: 'Which audio formats and sample rates are supported?',
    answer:
      'WAV (16/24-bit PCM and 32-bit float), FLAC, AIFF, MP3, and OGG in mono or stereo from 8 kHz to 384 kHz (up to 100 MB / 10 minutes).',
  },
  {
    id: 'free',
    question: 'Is MixLearn Studio free to use?',
    answer:
      'Yes. MixLearn Studio is 100% free for students, independent artists, and mix engineers—with no subscriptions, billing tiers, or paywalled meters.',
  },
];

export const LandingPageView: React.FC<LandingPageViewProps> = ({
  isAuthenticated,
  onNavigate,
  onOpenAuth,
}) => {
  const [openFaqId, setOpenFaqId] = useState<string | null>('privacy');

  return (
    <div>
      {/* 1. DYNAMIC SWISS NEO-BRUTALIST HERO */}
      <section
        aria-label="MixLearn Studio Hero"
        className="border-b-2 border-[var(--border-ink)] bg-[var(--bg-canvas)]"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* Headline & CTAs */}
          <div className="lg:col-span-7 p-6 sm:p-8 lg:p-10 border-b-2 lg:border-b-0 lg:border-r-2 border-[var(--border-ink)] flex flex-col justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 border-[1.5px] border-[var(--border-ink)] bg-[var(--bg-surface)] font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]">
                <span className="w-2 h-2 bg-[#FF3B1F]" aria-hidden="true" />
                <span>ITU-R BS.1770-4 · 4× TRUE PEAK · 60FPS WEB AUDIO</span>
              </div>

              <h1 className="font-display text-5xl sm:text-6xl xl:text-7xl text-[var(--ink)] mt-5 leading-[0.88] tracking-tight">
                REAL DSP.
                <br />
                ZERO GUESSWORK.
              </h1>

              <p className="mt-4 text-sm sm:text-base text-[var(--ink-muted)] max-w-xl leading-relaxed font-normal">
                Mathematical mix diagnostics, live 60fps spectrum metering, original stem masking analysis, and privacy-first DAW coaching.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              {isAuthenticated ? (
                <>
                  <motion.button
                    type="button"
                    whileTap={TACTILE_TAP}
                    onClick={() => onNavigate('/simple')}
                    data-testid="hero-open-simple-btn"
                    className="inline-flex items-center gap-2 px-6 py-3.5 border-2 border-[#0A0A0A] bg-[#FFD600] text-[#0A0A0A] hover:bg-[#0A0A0A] hover:text-[#FFD600] dark:border-white font-ui text-xs font-bold uppercase tracking-wider cursor-pointer"
                  >
                    <span>OPEN SIMPLE STUDIO</span>
                    <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
                  </motion.button>
                  <motion.button
                    type="button"
                    whileTap={TACTILE_TAP}
                    onClick={() => onNavigate('/advanced')}
                    data-testid="hero-open-advanced-btn"
                    className="inline-flex items-center gap-2 px-6 py-3.5 border-2 border-[var(--border-ink)] bg-[var(--bg-canvas)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--bg-canvas)] font-ui text-xs font-bold uppercase tracking-wider cursor-pointer"
                  >
                    <span>ADVANCED LAB</span>
                    <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
                  </motion.button>
                </>
              ) : (
                <>
                  <motion.button
                    type="button"
                    whileTap={TACTILE_TAP}
                    onClick={() => onOpenAuth('signup')}
                    data-testid="hero-get-started-btn"
                    className="inline-flex items-center gap-2 px-6 py-3.5 border-2 border-[#0A0A0A] bg-[#FFD600] text-[#0A0A0A] hover:bg-[#0A0A0A] hover:text-[#FFD600] dark:border-white font-ui text-xs font-bold uppercase tracking-wider cursor-pointer"
                  >
                    <span>GET STARTED FREE</span>
                    <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
                  </motion.button>
                  <motion.button
                    type="button"
                    whileTap={TACTILE_TAP}
                    onClick={() => onOpenAuth('login')}
                    data-testid="hero-login-btn"
                    className="inline-flex items-center gap-2 px-6 py-3.5 border-2 border-[var(--border-ink)] bg-[var(--bg-canvas)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--bg-canvas)] font-ui text-xs font-bold uppercase tracking-wider cursor-pointer"
                  >
                    <span>LOG IN</span>
                  </motion.button>
                </>
              )}
            </div>
          </div>

          {/* Right Stage: Interactive 60fps Live Spectrum Preview */}
          <div className="lg:col-span-5 bg-[#0A0A0A] text-white flex flex-col justify-between">
            <div className="px-4 py-3 border-b border-white/20 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-wider text-[#FFD600]">
                <Play className="w-3 h-3 fill-current" aria-hidden="true" />
                <span>LIVE 60FPS SPECTRUM ENGINE</span>
              </div>
              <span className="font-mono text-[10px] text-white/70 tabular-nums">
                20 HZ — 20 KHZ
              </span>
            </div>

            <div className="p-3 flex-1 flex flex-col justify-center">
              <LiveSpectrumAnalyzer
                mode="hero"
                height={220}
                title="LIVE SPECTRUM · 20 HZ – 20 KHZ"
                subtitle="60FPS INTERACTIVE"
              />
            </div>

            <div className="grid grid-cols-3 border-t border-white/20 divide-x divide-white/20 font-mono text-[10px]">
              <div className="p-3">
                <div className="text-white/60 uppercase">STANDARDS</div>
                <div className="text-white font-bold mt-0.5">EBU R128</div>
              </div>
              <div className="p-3">
                <div className="text-white/60 uppercase">RETENTION</div>
                <div className="text-[#FFD600] font-bold mt-0.5">0 AUDIO SAVED</div>
              </div>
              <div className="p-3">
                <div className="text-white/60 uppercase">ACCESS</div>
                <div className="text-white font-bold mt-0.5">100% FREE</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. CORE FEATURES GRID (01–04) */}
      <section aria-label="Core Features" className="border-b-2 border-[var(--border-ink)] bg-[var(--bg-canvas)]">
        <div className="px-5 py-4 border-b-2 border-[var(--border-ink)] bg-[var(--bg-surface)] flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl sm:text-3xl text-[var(--ink)] tracking-tight">
            CORE STUDIO MODULES
          </h2>
          <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">
            01 — 04
          </span>
        </div>

        <div className="divide-y-[1.5px] divide-[var(--border-ink)]">
          {CORE_FEATURES.map((feat) => (
            <div
              key={feat.num}
              className={`grid grid-cols-1 md:grid-cols-12 items-center transition-colors ${
                feat.highlight
                  ? 'bg-[#FF3B1F] text-white'
                  : 'bg-[var(--bg-canvas)] text-[var(--ink)] hover:bg-[var(--bg-surface)]'
              }`}
            >
              <div className="md:col-span-2 px-5 py-4 md:py-6 md:border-r-[1.5px] border-current/25 flex items-baseline gap-3">
                <span className="font-display text-4xl sm:text-5xl leading-none">
                  {feat.num}
                </span>
              </div>

              <div className="md:col-span-7 px-5 pb-4 md:py-5">
                <div
                  className={`font-mono text-[10px] font-bold uppercase tracking-wider ${
                    feat.highlight ? 'text-[#FFD600]' : 'text-[var(--ink-muted)]'
                  }`}
                >
                  {feat.tag}
                </div>
                <h3 className="font-ui text-lg sm:text-xl font-bold uppercase tracking-tight mt-1">
                  {feat.title}
                </h3>
                <p
                  className={`text-xs sm:text-sm mt-1.5 leading-relaxed font-normal ${
                    feat.highlight ? 'text-white/95' : 'text-[var(--ink-muted)]'
                  }`}
                >
                  {feat.description}
                </p>
              </div>

              <div className="md:col-span-3 px-5 pb-5 md:py-5 flex md:justify-end">
                <button
                  type="button"
                  onClick={() =>
                    isAuthenticated ? onNavigate(feat.targetRoute) : onOpenAuth('signup')
                  }
                  className={`inline-flex items-center gap-1.5 px-4 py-2.5 border-2 font-mono text-[11px] font-bold uppercase tracking-wider cursor-pointer ${
                    feat.highlight
                      ? 'border-[#0A0A0A] bg-[#FFD600] text-[#0A0A0A] hover:bg-[#0A0A0A] hover:text-[#FFD600]'
                      : 'border-[var(--border-ink)] bg-[var(--bg-canvas)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--bg-canvas)]'
                  }`}
                >
                  <span>{isAuthenticated ? 'OPEN' : 'TRY FREE'}</span>
                  <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. HOW IT WORKS (3-STEP VISUAL FLOW) */}
      <section aria-label="How It Works" className="border-b-2 border-[var(--border-ink)] bg-[var(--bg-canvas)]">
        <div className="px-5 py-4 border-b-2 border-[var(--border-ink)] bg-[var(--bg-surface)] flex items-center justify-between">
          <h2 className="font-display text-2xl sm:text-3xl text-[var(--ink)]">
            HOW IT WORKS
          </h2>
          <span className="font-mono text-[11px] font-bold uppercase text-[var(--ink-muted)]">
            3-STEP LOOP
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 divide-y-[1.5px] md:divide-y-0 md:divide-x-[1.5px] divide-[var(--border-ink)]">
          {WORKFLOW_STEPS.map((step) => (
            <div key={step.num} className="p-6 flex flex-col justify-between gap-4">
              <div>
                <div className="inline-flex items-center justify-center w-10 h-10 bg-[#FFD600] text-[#0A0A0A] border-[1.5px] border-[#0A0A0A] font-display text-2xl leading-none">
                  {step.num}
                </div>
                <h3 className="font-ui text-base font-bold uppercase tracking-tight text-[var(--ink)] mt-4">
                  {step.title}
                </h3>
                <p className="text-xs sm:text-sm text-[var(--ink-muted)] mt-2 leading-relaxed font-normal">
                  {step.detail}
                </p>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase text-[var(--ink)] pt-3 border-t border-[var(--border-ink)]/20">
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                <span>DETERMINISTIC DSP</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. INTERACTIVE FAQ ACCORDION */}
      <section aria-label="Frequently Asked Questions" className="bg-[var(--bg-canvas)]">
        <div className="px-5 py-4 border-b-2 border-[var(--border-ink)] bg-[var(--bg-surface)] flex items-center justify-between">
          <h2 className="font-display text-2xl sm:text-3xl text-[var(--ink)]">
            FREQUENTLY ASKED QUESTIONS
          </h2>
          <span className="font-mono text-[11px] font-bold uppercase text-[var(--ink-muted)]">
            FAQ
          </span>
        </div>

        <div className="divide-y-[1.5px] divide-[var(--border-ink)]">
          {FAQ_ITEMS.map((item, idx) => {
            const isOpen = openFaqId === item.id;
            const panelId = `faq-panel-${item.id}`;
            return (
              <div key={item.id}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  data-testid={`faq-toggle-${item.id}`}
                  onClick={() => setOpenFaqId(isOpen ? null : item.id)}
                  className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-[var(--bg-surface)] cursor-pointer"
                >
                  <div className="flex items-baseline gap-3.5">
                    <span className="font-mono text-xs font-bold text-[var(--ink-muted)] shrink-0">
                      0{idx + 1}
                    </span>
                    <span className="font-ui text-sm sm:text-base font-bold text-[var(--ink)]">
                      {item.question}
                    </span>
                  </div>
                  <span
                    aria-hidden="true"
                    className={`w-7 h-7 border-[1.5px] border-[var(--border-ink)] flex items-center justify-center shrink-0 ${
                      isOpen
                        ? 'bg-[#FFD600] text-[#0A0A0A] border-[#0A0A0A]'
                        : 'bg-[var(--bg-canvas)] text-[var(--ink)]'
                    }`}
                  >
                    {isOpen ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={panelId}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: BRUT_EASE }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5 pt-2 pl-12 text-xs sm:text-sm text-[var(--ink-muted)] leading-relaxed border-t border-[var(--border-ink)]/15 bg-[var(--bg-surface)]">
                        {item.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  MotionConfig,
  useReducedMotion,
  useScroll,
  useTransform,
} from 'motion/react';
import { BRUT_EASE, BRUT_SPRING, TACTILE_TAP } from './lib/motion';
import {
  AnalysisReport,
  ArtistVisionTag,
  ConsentState,
  createDefaultConsentState,
  GenreId,
  MixStage,
  RevisionDeltaReport,
  StemMultitrackReport,
  UserReportedDawContext,
} from './contracts/analysisContract';
import { generatePhase1DemoReport, GENRE_LABELS, MIX_STAGE_LABELS } from './contracts/demoFixtures';
import { checkBackendHealth, analyzeAudioWithDsp } from './services/apiService';
import { StudioAudioProvider } from './audio/StudioAudioContext';
import { studioAudioEngine } from './audio/StudioAudioEngine';
import { synthesizeDemoTrackWavFile } from './audio/demoTrackSynthesizer';
import { ConsentGatePanel } from './components/ConsentGatePanel';
import { LiveSpectrumAnalyzer } from './components/LiveSpectrumAnalyzer';
import { SimpleMixCheckView } from './components/SimpleMixCheckView';
import { AdvancedMixCheckView } from './components/AdvancedMixCheckView';
import { ArchitectureHandoffView } from './components/ArchitectureHandoffView';
import {
  ArrowUpRight,
  Sun,
  Moon,
  RefreshCw,
  AlertCircle,
  Plus,
  X,
} from 'lucide-react';

type ActiveRoute = 'home' | 'simple' | 'advanced' | 'architecture';

function getRouteFromLocation(): ActiveRoute {
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase().replace('#', '');
  if (path === '/simple' || hash === 'simple') return 'simple';
  if (path === '/advanced' || hash === 'advanced') return 'advanced';
  if (path === '/architecture' || hash === 'architecture') return 'architecture';
  return 'home';
}

/** Crisp geometric wireframe globe/wave icon for the Hero #FF3B1F red square */
const WireframeAcousticGlobe: React.FC = () => (
  <motion.svg
    viewBox="0 0 80 80"
    className="w-16 h-16 sm:w-20 sm:h-20 text-white"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    animate={{ rotate: 360 }}
    transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
    aria-hidden="true"
  >
    <circle cx="40" cy="40" r="30" />
    <ellipse cx="40" cy="40" rx="15" ry="30" />
    <ellipse cx="40" cy="40" rx="30" ry="12" />
    <line x1="10" y1="40" x2="70" y2="40" />
    <line x1="40" y1="10" x2="40" y2="70" />
  </motion.svg>
);

/** Oversized Swiss geometric asterisk for the #FFD600 yellow feature block */
const GeometricAsterisk: React.FC = () => {
  const prefersReduced = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const rotate = useTransform(scrollYProgress, [0, 1], [0, prefersReduced ? 0 : 180]);

  return (
    <motion.svg
      style={{ rotate }}
      viewBox="0 0 120 120"
      className="w-24 h-24 sm:w-28 sm:h-28 text-[#0A0A0A] shrink-0"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="51" y="6" width="18" height="108" />
      <rect x="6" y="51" width="108" height="18" />
      <rect x="51" y="6" width="18" height="108" transform="rotate(45 60 60)" />
      <rect x="51" y="6" width="18" height="108" transform="rotate(-45 60 60)" />
    </motion.svg>
  );
};

function MixLearnStudioShell() {
  const [route, setRoute] = useState<ActiveRoute>(() => getRouteFromLocation());
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [genre, setGenre] = useState<GenreId>('indie_rock');
  const [mixStage, setMixStage] = useState<MixStage>('unmastered_mix');
  const [consent, setConsent] = useState<ConsentState>(() => createDefaultConsentState());
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [heroSpecsOpen, setHeroSpecsOpen] = useState<boolean>(false);

  // File Upload & Lifecycle States
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisProgress, setAnalysisProgress] = useState<number>(0);
  const [analysisStageIndex, setAnalysisStageIndex] = useState<number>(0);
  const [analysisStage, setAnalysisStage] = useState<
    'idle' | 'selected' | 'uploading' | 'analyzing' | 'complete' | 'failed'
  >('idle');
  const abortControllerRef = useRef<AbortController | null>(null);

  const [reportSource, setReportSource] = useState<'backend' | 'offline_fallback'>('backend');
  const [activeReport, setActiveReport] = useState<AnalysisReport | null>(null);
  const [loadingReport, setLoadingReport] = useState<boolean>(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // Phase 4 & 5 Lifted Session State
  const [stemReport, setStemReport] = useState<StemMultitrackReport | null>(null);
  const [revisionComparison, setRevisionComparison] = useState<RevisionDeltaReport | null>(null);
  const [dawContext, setDawContext] = useState<UserReportedDawContext>({
    source_tag: 'user_reported_context',
    daw_name: '',
    bus_routing: '',
    plugin_chain_notes: '',
    updated_at: null,
  });
  const [artistVision, setArtistVision] = useState<ArtistVisionTag[]>([]);

  const navigateTo = (newRoute: ActiveRoute) => {
    setRoute(newRoute);
    const targetPath = newRoute === 'home' ? '/' : `/${newRoute}`;
    if (window.location.pathname !== targetPath) {
      window.history.pushState(null, '', targetPath);
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  useEffect(() => {
    const handlePopState = () => {
      setRoute(getRouteFromLocation());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
    let isCancelled = false;
    setBackendStatus('checking');
    const initBackend = async () => {
      try {
        const health = await checkBackendHealth();
        if (!isCancelled) {
          setBackendStatus(health.online ? 'online' : 'offline');
        }
      } catch {
        if (!isCancelled) {
          setBackendStatus('offline');
        }
      }
    };
    initBackend();
    return () => {
      isCancelled = true;
    };
  }, []);

  const runMixAnalysis = async (
    fileToAnalyze?: File | null,
    targetGenre: GenreId = genre,
    targetStage: MixStage = mixStage
  ) => {
    const file = fileToAnalyze || selectedFile;
    if (!file) return;

    if (!consent.audio_analysis_consent) {
      setReportError('Permission 1 (audio_analysis_consent) is required to inspect audio.');
      setAnalysisStage('failed');
      return;
    }

    setSelectedFile(file);
    setActiveReport(null);
    setRevisionComparison(null);
    studioAudioEngine.clearRevisionV2();
    setIsAnalyzing(true);
    setAnalysisProgress(5);
    setAnalysisStageIndex(0);
    setLoadingReport(true);
    setAnalysisStage('analyzing');
    setReportError(null);

    const audioDecodePromise = studioAudioEngine.loadPrimaryFile(file);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const minDurationMs = 2400;
    const startTime = performance.now();

    const progressTimer = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(95, Math.round((elapsed / minDurationMs) * 100));
      setAnalysisProgress(progress);

      if (progress < 25) {
        setAnalysisStageIndex(0);
      } else if (progress < 55) {
        setAnalysisStageIndex(1);
      } else if (progress < 85) {
        setAnalysisStageIndex(2);
      } else {
        setAnalysisStageIndex(3);
      }
    }, 40);

    const minDelayPromise = new Promise((resolve) => setTimeout(resolve, minDurationMs));

    const fd = new FormData();
    fd.append('audio_file', file);
    fd.append('file', file);
    fd.append('interface_mode', route === 'simple' ? 'simple' : 'advanced');
    fd.append('genre', targetGenre);
    fd.append('mix_stage', targetStage);
    fd.append('stage', targetStage);
    fd.append('consent_state_json', JSON.stringify(consent));
    fd.append('consent_state', JSON.stringify(consent));

    try {
      const analysisPromise = analyzeAudioWithDsp(fd, fetch, controller.signal);
      const [result] = await Promise.all([analysisPromise, minDelayPromise, audioDecodePromise]);

      clearInterval(progressTimer);
      setAnalysisProgress(100);
      setAnalysisStageIndex(3);

      await new Promise((resolve) => setTimeout(resolve, 150));

      if (result.success && result.report) {
        setActiveReport(result.report);
        setReportSource('backend');
        setAnalysisStage('complete');
        setReportError(null);
        studioAudioEngine.syncPrimaryLufsFromReport(
          result.report.measurements.integrated_loudness.value
        );
      } else {
        setAnalysisStage('failed');
        setReportError(result.errorMessage || 'Mathematical DSP analysis failed.');
      }
    } catch (err: any) {
      clearInterval(progressTimer);
      if (err.name !== 'AbortError') {
        setAnalysisStage('failed');
        setReportError(err.message || 'DSP analysis failed.');
      }
    } finally {
      clearInterval(progressTimer);
      setIsAnalyzing(false);
      setLoadingReport(false);
    }
  };

  const handleSelectFile = (file: File) => {
    setSelectedFile(file);
    runMixAnalysis(file, genre, mixStage);
  };

  const handleClearFile = () => {
    studioAudioEngine.clearPrimaryMix();
    setSelectedFile(null);
    setActiveReport(null);
    setRevisionComparison(null);
    setAnalysisStage('idle');
    setReportError(null);
  };

  const handleCancelAnalysis = () => {
    abortControllerRef.current?.abort();
    setIsAnalyzing(false);
    setAnalysisStage('selected');
    setReportError('DSP analysis was cancelled.');
    setLoadingReport(false);
  };

  const handleAnalyzeAudioFile = async (fileToAnalyze?: File) => {
    runMixAnalysis(fileToAnalyze || selectedFile, genre, mixStage);
  };

  const handleLoadDemoTrack = async () => {
    const demoFile = synthesizeDemoTrackWavFile('checkmix_demo_track_24bit.wav');
    setSelectedFile(demoFile);
    setReportError(null);
    setRevisionComparison(null);
    studioAudioEngine.clearRevisionV2();

    const demoReport = generatePhase1DemoReport({
      interface_mode: route === 'advanced' ? 'advanced' : 'simple',
      genre,
      mix_stage: mixStage,
      consent_state: consent,
      custom_filename: demoFile.name,
      custom_duration_sec: 4.0,
      custom_sample_rate: 44100,
      custom_file_size_bytes: demoFile.size,
    });

    setActiveReport(demoReport);
    setReportSource('offline_fallback');
    setAnalysisStage('complete');
    setIsAnalyzing(false);

    await studioAudioEngine.loadPrimaryFile(
      demoFile,
      demoReport.measurements.integrated_loudness.value
    );
  };

  const handleCheckBackendHealth = async () => {
    setBackendStatus('checking');
    try {
      const health = await checkBackendHealth();
      setBackendStatus(health.online ? 'online' : 'offline');
    } catch {
      setBackendStatus('offline');
    }
  };

  const navItems: Array<{ id: ActiveRoute; href: string; label: string; shortLabel: string }> = [
    { id: 'home', href: '/', label: 'OVERVIEW', shortLabel: 'HOME' },
    { id: 'simple', href: '/simple', label: 'SIMPLE CHECK', shortLabel: 'SIMPLE' },
    { id: 'advanced', href: '/advanced', label: 'ADVANCED LAB', shortLabel: 'ADVANCED' },
    { id: 'architecture', href: '/architecture', label: 'ARCHITECTURE', shortLabel: 'SYSTEM' },
  ];

  const engineLabel =
    backendStatus === 'checking'
      ? 'ENGINE: CONNECTING TO DSP...'
      : backendStatus === 'online'
      ? 'ENGINE: FASTAPI ONLINE'
      : 'ENGINE: LOCAL WEB AUDIO';

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-canvas)] text-[var(--ink)] overflow-x-clip">
      {/* TOP SWISS GRID NAVIGATION BAR */}
      <header className="sticky top-0 z-40 bg-[var(--bg-canvas)] border-b-2 border-[var(--border-ink)]">
        <div className="max-w-[1440px] mx-auto">
          {/* Desktop Architectural Row */}
          <div className="hidden lg:flex items-stretch justify-between">
            {/* Brand Cell */}
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('home');
              }}
              className="px-5 py-3.5 border-r-2 border-[var(--border-ink)] font-display text-2xl leading-none tracking-tight text-[var(--ink)] flex items-center whitespace-nowrap shrink-0 hover:bg-[#FFD600] hover:text-[#0A0A0A] transition-colors"
            >
              MIXLEARN.
            </a>

            {/* Descriptor Cell */}
            <div className="hidden xl:flex items-center px-4 border-r-2 border-[var(--border-ink)] font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--ink-muted)] whitespace-nowrap shrink-0">
              AUDIO DSP STUDIO
            </div>

            {/* Navigation Cells */}
            <nav
              aria-label="Primary Navigation"
              className="flex items-stretch flex-1 divide-x-[1.5px] divide-[var(--border-ink)]"
            >
              {navItems.map((item) => {
                const isActive = route === item.id;
                return (
                  <a
                    key={item.id}
                    href={item.href}
                    onClick={(e) => {
                      e.preventDefault();
                      navigateTo(item.id);
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    className={`relative flex-1 flex items-center justify-center px-3 py-3.5 font-ui text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-colors ${
                      isActive
                        ? 'text-[var(--bg-canvas)]'
                        : 'text-[var(--ink)] hover:bg-[var(--bg-surface)]'
                    }`}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="brut-nav-active"
                        transition={BRUT_SPRING}
                        className="absolute inset-0 bg-[var(--ink)]"
                      />
                    )}
                    <span className="relative z-10">{item.label}</span>
                  </a>
                );
              })}
            </nav>

            {/* Theme Toggle Cell */}
            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              aria-label={darkMode ? 'Switch to Default Light Mode' : 'Switch to Dark Mode'}
              data-testid="theme-toggle-btn"
              className="px-3.5 border-l-2 border-[var(--border-ink)] flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--bg-canvas)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span>{darkMode ? 'PAPER' : 'INK'}</span>
            </button>

            {/* Primary CTA Cell — Solid #FFD600 Yellow */}
            <motion.button
              type="button"
              whileTap={TACTILE_TAP}
              onClick={() => navigateTo(route === 'simple' ? 'advanced' : 'simple')}
              className="group px-5 py-3.5 border-l-2 border-[var(--border-ink)] bg-[#FFD600] text-[#0A0A0A] hover:bg-[#0A0A0A] hover:text-[#FFD600] font-ui text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              <span>{route === 'simple' ? 'ADVANCED LAB' : 'START MIX CHECK'}</span>
              <ArrowUpRight className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-[3px] group-hover:-translate-y-[3px]" />
            </motion.button>
          </div>

          {/* Mobile / Tablet 2-Row Swiss Grid Header (Zero Horizontal Overflow at 390px) */}
          <div className="lg:hidden">
            <div className="flex items-stretch justify-between border-b-[1.5px] border-[var(--border-ink)]">
              <a
                href="/"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo('home');
                }}
                className="px-4 py-3 font-display text-xl leading-none tracking-tight text-[var(--ink)] flex items-center"
              >
                MIXLEARN.
              </a>
              <div className="flex items-stretch">
                <button
                  type="button"
                  onClick={() => setDarkMode((d) => !d)}
                  aria-label={darkMode ? 'Switch to Default Light Mode' : 'Switch to Dark Mode'}
                  className="px-3 border-l-[1.5px] border-[var(--border-ink)] flex items-center justify-center text-[var(--ink)] cursor-pointer"
                >
                  {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => navigateTo(route === 'simple' ? 'advanced' : 'simple')}
                  className="px-3.5 border-l-[1.5px] border-[var(--border-ink)] bg-[#FFD600] text-[#0A0A0A] font-ui text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <span>{route === 'simple' ? 'ADVANCED' : 'START'}</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <nav
              aria-label="Mobile Navigation"
              className="grid grid-cols-4 divide-x-[1.5px] divide-[var(--border-ink)]"
            >
              {navItems.map((item) => {
                const isActive = route === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigateTo(item.id)}
                    className={`py-2.5 text-center font-mono text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-[var(--ink)] text-[var(--bg-canvas)]'
                        : 'bg-[var(--bg-canvas)] text-[var(--ink)]'
                    }`}
                  >
                    {item.shortLabel}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      </header>

      {/* SUB-HEADER CONTEXT BAR (Only on /simple, /advanced, /architecture to keep / Overview clean) */}
      {route !== 'home' && (
        <div className="border-b-2 border-[var(--border-ink)] bg-[var(--bg-surface)]">
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] tabular-nums">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-bold uppercase text-[var(--ink)] truncate">
                {GENRE_LABELS[genre]}
              </span>
              <span className="opacity-40">/</span>
              <span className="uppercase text-[var(--ink-muted)] whitespace-nowrap">
                {MIX_STAGE_LABELS[mixStage].title}
              </span>
            </div>

            <div
              data-testid="engine-status-indicator"
              className="inline-flex items-center gap-2 px-2.5 py-0.5 border-[1.5px] border-[var(--border-ink)] bg-[#FFD600] text-[#0A0A0A] font-bold uppercase tracking-wider text-[10px]"
            >
              <span
                className={`w-2 h-2 ${
                  backendStatus === 'online' ? 'bg-[#0A0A0A]' : 'bg-[#FF3B1F]'
                }`}
              />
              <span>{engineLabel}</span>
              <button
                type="button"
                onClick={handleCheckBackendHealth}
                title="Re-check FastAPI DSP status"
                aria-label="Re-check FastAPI DSP status"
                className="ml-0.5 hover:opacity-70 cursor-pointer"
              >
                <RefreshCw
                  className={`w-3 h-3 ${
                    backendStatus === 'checking' || loadingReport ? 'animate-spin' : ''
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN VIEWPORT */}
      <main className="flex-1 w-full max-w-[1440px] mx-auto border-x-0 xl:border-x-2 border-[var(--border-ink)]">
        {/* ============================================================
            ROUTE: OVERVIEW (/) — SWISS NEO-BRUTALIST EDITORIAL GRID
        ============================================================ */}
        {route === 'home' && (
          <div>
            {/* 1. HERO SPLIT */}
            <section
              aria-label="MixLearn Studio Hero"
              className="grid grid-cols-1 lg:grid-cols-12 border-b-2 border-[var(--border-ink)]"
            >
              {/* Left Column: Giant Stacked Anton Headline */}
              <div className="lg:col-span-6 p-6 sm:p-10 lg:p-12 lg:border-r-2 border-b-2 lg:border-b-0 border-[var(--border-ink)] flex flex-col justify-between gap-8 bg-[var(--bg-canvas)]">
                <div className="space-y-6">
                  <div className="inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--ink-muted)]">
                    <span className="px-2 py-0.5 bg-[var(--ink)] text-[var(--bg-canvas)]">
                      ITU-R BS.1770-4
                    </span>
                    <span>EBU R128 · WELCH PSD</span>
                  </div>

                  <h1 className="font-display text-[clamp(3.3rem,7vw,6.2rem)] leading-[0.89] tracking-[-0.02em] uppercase text-[var(--ink)]">
                    {['MIX', 'WITHOUT', 'GUESSWORK.'].map((line, i) => (
                      <span key={line} className="block overflow-hidden">
                        <motion.span
                          className="block"
                          initial={{ y: '105%' }}
                          animate={{ y: 0 }}
                          transition={{
                            duration: 0.48,
                            delay: i * 0.08,
                            ease: BRUT_EASE,
                          }}
                        >
                          {line}
                        </motion.span>
                      </span>
                    ))}
                  </h1>

                  {/* Yellow Square Bullet Tagline */}
                  <div className="flex items-start gap-3 pt-1">
                    <span
                      className="w-3.5 h-3.5 mt-0.5 bg-[#FFD600] border-[1.5px] border-[var(--border-ink)] shrink-0"
                      aria-hidden="true"
                    />
                    <p className="font-mono text-xs sm:text-[13px] font-bold uppercase tracking-wider text-[var(--ink)]">
                      DETERMINISTIC DSP. LIVE SPECTRUM. PRIVACY-FIRST AI.
                    </p>
                  </div>
                </div>

                {/* Primary Hero CTAs */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <motion.button
                    type="button"
                    whileTap={TACTILE_TAP}
                    onClick={() => navigateTo('simple')}
                    className="group inline-flex items-center gap-2.5 px-6 py-3.5 border-2 border-[var(--border-ink)] bg-[var(--bg-canvas)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--bg-canvas)] font-ui text-xs sm:text-sm font-bold uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    <span>OPEN SIMPLE CHECK</span>
                    <ArrowUpRight className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-[3px] group-hover:-translate-y-[3px]" />
                  </motion.button>

                  <motion.button
                    type="button"
                    whileTap={TACTILE_TAP}
                    onClick={() => navigateTo('advanced')}
                    className="group inline-flex items-center gap-2 px-5 py-3.5 border-2 border-[var(--border-ink)] bg-[#FFD600] text-[#0A0A0A] hover:bg-[#0A0A0A] hover:text-[#FFD600] font-ui text-xs sm:text-sm font-bold uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    <span>ADVANCED LAB</span>
                    <ArrowUpRight className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-[3px] group-hover:-translate-y-[3px]" />
                  </motion.button>
                </div>
              </div>

              {/* Right Column: Studio Copy + Red Wireframe Icon Block + Hero Live Spectrum */}
              <div className="lg:col-span-6 flex flex-col bg-[var(--bg-surface)]">
                {/* Upper Info & Red Graphic Square */}
                <div className="flex items-stretch border-b-2 border-[var(--border-ink)] bg-[var(--bg-canvas)]">
                  <div className="flex-1 p-5 sm:p-6 flex flex-col justify-between gap-4">
                    <p className="text-xs sm:text-sm text-[var(--ink-muted)] leading-relaxed">
                      Measure every bounce with mathematical DSP as the sole source of truth. Audit loudness, true peak headroom, live 60fps spectrum, multitrack stem overlap, and v1→v2 revisions with zero cloud retention.
                    </p>
                    <div className="flex items-center justify-between gap-2 pt-2 border-t-[1.5px] border-[var(--border-ink)]/20">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">
                        RULE 1: NO AI STEM FABRICATION
                      </span>
                      <button
                        type="button"
                        onClick={() => setHeroSpecsOpen((v) => !v)}
                        aria-expanded={heroSpecsOpen}
                        aria-label="Toggle DSP calibration specifications"
                        className="w-8 h-8 border-[1.5px] border-[var(--border-ink)] bg-[var(--bg-surface)] hover:bg-[var(--ink)] hover:text-[var(--bg-canvas)] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                      >
                        {heroSpecsOpen ? (
                          <X className="w-4 h-4" />
                        ) : (
                          <Plus className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Solid #FF3B1F Vermilion Square with Animated Wireframe Globe */}
                  <div className="w-28 sm:w-36 border-l-2 border-[var(--border-ink)] bg-[#FF3B1F] flex flex-col items-center justify-center p-3 shrink-0">
                    <WireframeAcousticGlobe />
                    <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-white mt-2">
                      48KHZ · 60FPS
                    </span>
                  </div>
                </div>

                {/* Expandable Calibration Strip triggered by '+' button */}
                <AnimatePresence initial={false}>
                  {heroSpecsOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: BRUT_EASE }}
                      className="overflow-hidden border-b-2 border-[var(--border-ink)] bg-[var(--ink)] text-[var(--bg-canvas)]"
                    >
                      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-[var(--bg-canvas)]/20 font-mono text-[10px] uppercase">
                        <div className="p-3">
                          <div className="opacity-60">LOUDNESS</div>
                          <div className="font-bold mt-0.5">ITU-R BS.1770-4</div>
                        </div>
                        <div className="p-3">
                          <div className="opacity-60">TRUE PEAK</div>
                          <div className="font-bold mt-0.5">4× POLYPHASE ISP</div>
                        </div>
                        <div className="p-3">
                          <div className="opacity-60">STEM POLICY</div>
                          <div className="font-bold mt-0.5 text-[#FFD600]">ORIGINAL ONLY</div>
                        </div>
                        <div className="p-3">
                          <div className="opacity-60">AI TRAINING</div>
                          <div className="font-bold mt-0.5">FALSE (LOCKED)</div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Live 60fps Interactive Music Spectrum Analyzer Hero Stage */}
                <div className="p-4 sm:p-5 flex-1 flex flex-col justify-center">
                  <LiveSpectrumAnalyzer
                    mode="hero"
                    height={216}
                    title="LIVE SPECTRUM ANALYZER · 20 HZ – 20 KHZ"
                    subtitle="POINTER REACTIVE"
                  />
                </div>
              </div>
            </section>

            {/* 2. FULL-WIDTH STATUS STRIP */}
            <section
              aria-label="Studio Engine Status Strip"
              className="grid grid-cols-1 lg:grid-cols-12 border-b-2 border-[var(--border-ink)] bg-[var(--bg-canvas)]"
            >
              {/* Rotated Vertical (2026) Cell */}
              <div className="hidden lg:flex lg:col-span-1 border-r-2 border-[var(--border-ink)] items-center justify-center py-4 bg-[var(--bg-surface)]">
                <span className="writing-vertical font-mono text-xs font-bold tracking-widest text-[var(--ink)]">
                  (2026)
                </span>
              </div>

              {/* Editorial Tagline Cell */}
              <button
                type="button"
                onClick={() => navigateTo('simple')}
                className="lg:col-span-8 px-6 py-5 flex items-center justify-between gap-4 text-left hover:bg-[var(--bg-surface)] transition-colors cursor-pointer border-b-2 lg:border-b-0 border-[var(--border-ink)]"
              >
                <span className="font-ui text-sm sm:text-base font-bold uppercase tracking-wide text-[var(--ink)]">
                  LEARN MIXING BY DOING MIXING. DETERMINISTIC EBU R128 + AI MENTOR.
                </span>
                <span className="font-display text-2xl leading-none text-[var(--ink)] shrink-0">
                  →
                </span>
              </button>

              {/* Solid #FFD600 Live Engine Online Block */}
              <div
                data-testid="engine-status-indicator"
                className="lg:col-span-3 lg:border-l-2 border-[var(--border-ink)] bg-[#FFD600] text-[#0A0A0A] px-5 py-4 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`w-3 h-3 shrink-0 ${
                      backendStatus === 'online'
                        ? 'bg-[#0A0A0A] animate-pulse'
                        : backendStatus === 'checking'
                        ? 'bg-[#0A0A0A]/50'
                        : 'bg-[#FF3B1F]'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="font-mono text-xs font-bold uppercase tracking-wider truncate">
                    {engineLabel}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCheckBackendHealth}
                  title="Re-check FastAPI DSP status"
                  aria-label="Re-check FastAPI DSP status"
                  className="p-1.5 border-[1.5px] border-[#0A0A0A] bg-[#FFD600] hover:bg-[#0A0A0A] hover:text-[#FFD600] transition-colors cursor-pointer shrink-0"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      backendStatus === 'checking' || loadingReport ? 'animate-spin' : ''
                    }`}
                  />
                </button>
              </div>
            </section>

            {/* 3. NUMBERED 01 / 02 / 03 WORKFLOW ROWS */}
            <section
              aria-label="Core Studio Workflows"
              className="grid grid-cols-1 lg:grid-cols-12 border-b-2 border-[var(--border-ink)]"
            >
              {/* Left Column: Core Workflows Heading */}
              <div className="lg:col-span-4 p-6 sm:p-8 lg:border-r-2 border-b-2 lg:border-b-0 border-[var(--border-ink)] bg-[var(--bg-surface)] flex flex-col justify-between gap-6">
                <div className="space-y-3">
                  <div className="font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--ink-muted)]">
                    DUAL-MODE INTERFACE
                  </div>
                  <h2 className="font-display text-4xl sm:text-5xl leading-[0.9] uppercase text-[var(--ink)]">
                    CORE
                    <br />
                    WORKFLOWS ↓
                  </h2>
                  <p className="text-xs sm:text-sm text-[var(--ink-muted)] leading-relaxed pt-2">
                    Start clean in Simple Check for plain-English diagnostics and top-3 DAW actions, or open the full Advanced Workbench with 60fps meters, Reference A/B, and original stem masking.
                  </p>
                </div>

                <motion.button
                  type="button"
                  whileTap={TACTILE_TAP}
                  onClick={() => navigateTo('advanced')}
                  className="group self-start inline-flex items-center gap-2 px-5 py-3 border-2 border-[var(--border-ink)] bg-[var(--bg-canvas)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--bg-canvas)] font-ui text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  <span>OPEN ADVANCED</span>
                  <ArrowUpRight className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-[3px] group-hover:-translate-y-[3px]" />
                </motion.button>
              </div>

              {/* Right Column: Stacked 01 / 02 (Red Highlight) / 03 Rows */}
              <div className="lg:col-span-8 divide-y-2 divide-[var(--border-ink)]">
                {/* 01 — Simple Mix Check */}
                <button
                  type="button"
                  onClick={() => navigateTo('simple')}
                  className="group w-full p-6 sm:p-8 bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface)] text-left flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors cursor-pointer"
                >
                  <div className="flex items-start sm:items-center gap-5 sm:gap-7">
                    <span className="font-display text-5xl sm:text-6xl leading-none text-[var(--ink)] shrink-0">
                      01
                    </span>
                    <div>
                      <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--ink-muted)]">
                        /SIMPLE · BEGINNER QUICK CHECK
                      </div>
                      <h3 className="font-display text-2xl sm:text-3xl uppercase text-[var(--ink)] mt-1">
                        SIMPLE MIX CHECK
                      </h3>
                      <p className="text-xs sm:text-sm text-[var(--ink-muted)] mt-1 max-w-xl">
                        4 plain-English traffic-light meters, compact live spectrum, and prioritized 01/02/03 DAW action drawers.
                      </p>
                    </div>
                  </div>
                  <ArrowUpRight className="w-7 h-7 text-[var(--ink)] shrink-0 transition-transform duration-150 group-hover:translate-x-1 group-hover:-translate-y-1" />
                </button>

                {/* 02 — Advanced Workbench (Highlighted Solid #FF3B1F Vermilion Row) */}
                <button
                  type="button"
                  onClick={() => navigateTo('advanced')}
                  className="group w-full p-6 sm:p-8 bg-[#FF3B1F] hover:bg-[#E02D12] text-white text-left flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors cursor-pointer"
                >
                  <div className="flex items-start sm:items-center gap-5 sm:gap-7">
                    <span className="font-display text-5xl sm:text-6xl leading-none text-white shrink-0">
                      02
                    </span>
                    <div>
                      <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-white/85">
                        /ADVANCED · FULL ENGINEER CONSOLE
                      </div>
                      <h3 className="font-display text-2xl sm:text-3xl uppercase text-white mt-1">
                        ADVANCED WORKBENCH
                      </h3>
                      <p className="text-xs sm:text-sm text-white/90 mt-1 max-w-xl">
                        60fps Waveform, Live FFT Spectrum, Peak/LUFS, 2D Vectorscope, loudness-matched Reference A/B, and Phone/Laptop Lab.
                      </p>
                    </div>
                  </div>
                  <ArrowUpRight className="w-7 h-7 text-white shrink-0 transition-transform duration-150 group-hover:translate-x-1 group-hover:-translate-y-1" />
                </button>

                {/* 03 — Stems, Revisions & AI */}
                <button
                  type="button"
                  onClick={() => navigateTo('advanced')}
                  className="group w-full p-6 sm:p-8 bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface)] text-left flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors cursor-pointer"
                >
                  <div className="flex items-start sm:items-center gap-5 sm:gap-7">
                    <span className="font-display text-5xl sm:text-6xl leading-none text-[var(--ink)] shrink-0">
                      03
                    </span>
                    <div>
                      <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--ink-muted)]">
                        RULE 1 &amp; RULE 4 ENFORCED
                      </div>
                      <h3 className="font-display text-2xl sm:text-3xl uppercase text-[var(--ink)] mt-1">
                        STEMS, REVISIONS &amp; AI
                      </h3>
                      <p className="text-xs sm:text-sm text-[var(--ink-muted)] mt-1 max-w-xl">
                        Upload 2–8 genuine DAW stems for masking diagnostics, verify v1→v2 revision deltas, and unlock consent-gated AI coaching.
                      </p>
                    </div>
                  </div>
                  <ArrowUpRight className="w-7 h-7 text-[var(--ink)] shrink-0 transition-transform duration-150 group-hover:translate-x-1 group-hover:-translate-y-1" />
                </button>
              </div>
            </section>

            {/* 4. BOTTOM GEOMETRIC FEATURE BAND */}
            <section
              aria-label="Privacy Gates and Engineering Standards"
              className="grid grid-cols-1 lg:grid-cols-12 border-b-2 border-[var(--border-ink)]"
            >
              {/* Left: Solid #FFD600 Yellow Block with Rotating Geometric Asterisk */}
              <div className="lg:col-span-4 bg-[#FFD600] text-[#0A0A0A] p-6 sm:p-8 lg:border-r-2 border-b-2 lg:border-b-0 border-[var(--border-ink)] flex flex-col justify-between gap-8">
                <div className="flex items-start justify-between gap-4">
                  <GeometricAsterisk />
                  <span className="font-mono text-[10px] font-bold uppercase tracking-widest px-2 py-1 border-[1.5px] border-[#0A0A0A]">
                    10 RULES
                  </span>
                </div>

                <div className="space-y-3">
                  <h2 className="font-display text-4xl sm:text-5xl leading-[0.88] uppercase text-[#0A0A0A]">
                    BUILT FOR
                    <br />
                    REAL MIXES.
                  </h2>
                  <p className="text-xs sm:text-sm text-[#0A0A0A]/85 leading-relaxed font-medium">
                    No AI stem fabrication. No hidden cloud retention. Mathematical DSP is the sole source of truth, and every AI permission starts OFF by default.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigateTo('architecture')}
                    className="group inline-flex items-center gap-1.5 pt-2 font-mono text-xs font-bold uppercase tracking-wider text-[#0A0A0A] underline underline-offset-4 cursor-pointer"
                  >
                    <span>INSPECT SYSTEM ARCHITECTURE</span>
                    <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </button>
                </div>
              </div>

              {/* Middle Narrow Vertical Divider Cell */}
              <div className="hidden lg:flex lg:col-span-1 border-r-2 border-[var(--border-ink)] bg-[var(--bg-surface)] items-center justify-center py-6">
                <span className="writing-vertical font-mono text-xs font-bold uppercase tracking-widest text-[var(--ink)]">
                  PRIVACY GATES →
                </span>
              </div>

              {/* Right: Expandable 01 / 02 / 03 / 04 Consent Accordion */}
              <div className="lg:col-span-7">
                <ConsentGatePanel
                  consent={consent}
                  onChangeConsent={setConsent}
                  variant="accordion"
                />
              </div>
            </section>
          </div>
        )}

        {/* ============================================================
            ROUTE: /simple — BEGINNER QUICK CHECK
        ============================================================ */}
        {route === 'simple' && (
          <div className="p-4 sm:p-6 lg:p-8 space-y-6">
            {reportError && (
              <div className="border-2 border-[var(--border-ink)] bg-[#FF3B1F] text-white p-3.5 text-xs font-mono flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{reportError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setReportError(null)}
                  className="px-2 py-0.5 border border-white text-white hover:bg-white hover:text-[#FF3B1F] uppercase font-bold cursor-pointer"
                >
                  DISMISS
                </button>
              </div>
            )}

            <SimpleMixCheckView
              report={activeReport}
              reportSource={reportSource}
              genre={genre}
              mixStage={mixStage}
              consent={consent}
              onChangeConsent={setConsent}
              artistVision={artistVision}
              onChangeArtistVision={setArtistVision}
              onChangeGenre={(g) => {
                setGenre(g);
                if (selectedFile) {
                  runMixAnalysis(selectedFile, g, mixStage);
                }
              }}
              onChangeMixStage={(st) => {
                setMixStage(st);
                if (selectedFile) {
                  runMixAnalysis(selectedFile, genre, st);
                }
              }}
              onSwitchToAdvanced={() => navigateTo('advanced')}
              onAnalyzeAudioFile={handleAnalyzeAudioFile}
              onLoadDemoTrack={handleLoadDemoTrack}
              selectedFile={selectedFile}
              onSelectFile={handleSelectFile}
              onClearFile={handleClearFile}
              isAnalyzing={isAnalyzing}
              analysisProgress={analysisProgress}
              analysisStageIndex={analysisStageIndex}
              errorMessage={reportError}
              onCancelAnalysis={handleCancelAnalysis}
            />

            <ConsentGatePanel consent={consent} onChangeConsent={setConsent} compact />
          </div>
        )}

        {/* ============================================================
            ROUTE: /advanced — FULL MASTERING WORKBENCH
        ============================================================ */}
        {route === 'advanced' && (
          <div className="p-4 sm:p-6 lg:p-8 space-y-6">
            {reportError && (
              <div className="border-2 border-[var(--border-ink)] bg-[#FF3B1F] text-white p-3.5 text-xs font-mono flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{reportError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setReportError(null)}
                  className="px-2 py-0.5 border border-white text-white hover:bg-white hover:text-[#FF3B1F] uppercase font-bold cursor-pointer"
                >
                  DISMISS
                </button>
              </div>
            )}

            <AdvancedMixCheckView
              report={activeReport}
              reportSource={reportSource}
              genre={genre}
              mixStage={mixStage}
              consent={consent}
              onChangeConsent={setConsent}
              artistVision={artistVision}
              onChangeArtistVision={setArtistVision}
              onChangeGenre={(g) => {
                setGenre(g);
                if (selectedFile) {
                  runMixAnalysis(selectedFile, g, mixStage);
                }
              }}
              onChangeMixStage={(st) => {
                setMixStage(st);
                if (selectedFile) {
                  runMixAnalysis(selectedFile, genre, st);
                }
              }}
              onAnalyzeAudioFile={handleAnalyzeAudioFile}
              onLoadDemoTrack={handleLoadDemoTrack}
              selectedFile={selectedFile}
              audioFile={selectedFile}
              onSelectFile={handleSelectFile}
              onClearFile={handleClearFile}
              isAnalyzing={isAnalyzing}
              analysisProgress={analysisProgress}
              analysisStageIndex={analysisStageIndex}
              analysisStage={analysisStage}
              errorMessage={reportError}
              onCancelAnalysis={handleCancelAnalysis}
              stemReport={stemReport}
              onStemReportChange={setStemReport}
              revisionComparison={revisionComparison}
              onRevisionComparisonChange={setRevisionComparison}
              dawContext={dawContext}
              onDawContextChange={setDawContext}
            />

            <ConsentGatePanel consent={consent} onChangeConsent={setConsent} compact />
          </div>
        )}

        {/* ============================================================
            ROUTE: /architecture — SYSTEM ARCHITECTURE & CONTRACTS
        ============================================================ */}
        {route === 'architecture' && (
          <div className="p-4 sm:p-6 lg:p-8">
            <ArchitectureHandoffView
              report={
                activeReport ||
                generatePhase1DemoReport({
                  interface_mode: 'advanced',
                  genre: 'indie_rock',
                  mix_stage: 'unmastered_mix',
                  consent_state: createDefaultConsentState(),
                })
              }
            />
          </div>
        )}
      </main>

      {/* SWISS ARCHITECTURAL FOOTER */}
      <footer className="border-t-2 border-[var(--border-ink)] bg-[var(--bg-canvas)]">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4 font-mono text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">
          <div className="flex items-center gap-3">
            <span className="font-display text-base tracking-tight text-[var(--ink)]">
              MIXLEARN.
            </span>
            <span>MATHEMATICAL DSP &amp; AUDIO ENGINEERING WORKBENCH</span>
          </div>
          <span className="tabular-nums font-bold text-[var(--ink)]">
            DEFAULT MODEL TRAINING OPT-IN: FALSE
          </span>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <StudioAudioProvider>
        <MixLearnStudioShell />
      </StudioAudioProvider>
    </MotionConfig>
  );
}

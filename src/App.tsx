/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion, MotionConfig } from 'motion/react';
import {
  STUDIO_EASE,
  STUDIO_SPRING,
  TACTILE_TAP,
  VIEWPORT_REVEAL,
} from './lib/motion';
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
import { SimpleMixCheckView } from './components/SimpleMixCheckView';
import { AdvancedMixCheckView } from './components/AdvancedMixCheckView';
import { ArchitectureHandoffView } from './components/ArchitectureHandoffView';
import {
  ArrowRight,
  Sun,
  Moon,
  Shield,
  Sliders,
  BookOpen,
  Server,
  RefreshCw,
  AlertCircle,
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

function MixLearnStudioShell() {
  const [route, setRoute] = useState<ActiveRoute>(() => getRouteFromLocation());
  const [darkMode, setDarkMode] = useState<boolean>(false); // Default Light Mode per design tokens
  const [genre, setGenre] = useState<GenreId>('indie_rock');
  const [mixStage, setMixStage] = useState<MixStage>('unmastered_mix');
  const [consent, setConsent] = useState<ConsentState>(() => createDefaultConsentState());
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');

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

  // Phase 4 & 5 Lifted Session State: Stems, Mix Revision v2 Delta, DAW Context, and Artist Vision
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

  // Sync route changes with browser history
  const navigateTo = (newRoute: ActiveRoute) => {
    setRoute(newRoute);
    const targetPath = newRoute === 'home' ? '/' : `/${newRoute}`;
    if (window.location.pathname !== targetPath) {
      window.history.pushState(null, '', targetPath);
    }
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

  // Initial Backend Health Check on Mount (starts in 'checking' state to avoid cold-start flicker)
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

  // Real Mathematical DSP Analysis + Singleton StudioAudioEngine Buffer Sync
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

    // Load buffer into singleton StudioAudioEngine in parallel so playback & 6-band FFT persist across routes
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

  // File Selection auto-triggers real DSP analysis
  const handleSelectFile = (file: File) => {
    setSelectedFile(file);
    runMixAnalysis(file, genre, mixStage);
  };

  // Clear Selected File and reset to clean empty state
  const handleClearFile = () => {
    studioAudioEngine.clearPrimaryMix();
    setSelectedFile(null);
    setActiveReport(null);
    setRevisionComparison(null);
    setAnalysisStage('idle');
    setReportError(null);
  };

  // Cancel in-flight DSP analysis
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

  // Explicit user-triggered "LOAD DEMO TRACK" action (synthesizes playable stereo WAV + calibrated 2-zone scan)
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

    // Decode playable synthesized WAV in StudioAudioEngine so transport, waveform, and FFT stay synchronized
    await studioAudioEngine.loadPrimaryFile(
      demoFile,
      demoReport.measurements.integrated_loudness.value
    );
  };

  // Manual or on-demand backend health check
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
    { id: 'home', href: '/', label: 'Overview', shortLabel: 'Overview' },
    { id: 'simple', href: '/simple', label: 'Simple Mix Check', shortLabel: 'Simple' },
    { id: 'advanced', href: '/advanced', label: 'Advanced Mix Check', shortLabel: 'Advanced' },
    { id: 'architecture', href: '/architecture', label: 'System Architecture', shortLabel: 'System' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)] transition-colors duration-200">
      {/* Studio Top Navigation Bar — 3-Zone Contract with Sliding layoutId Pill Track */}
      <header className="sticky top-0 z-40 bg-[var(--bg-elevated)]/95 backdrop-blur-sm studio-hairline-b">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-6 px-4 sm:px-6 py-3.5">
          {/* Zone 1: Wordmark */}
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('home');
            }}
            className="text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)] whitespace-nowrap shrink-0 font-display"
          >
            MixLearn Studio
          </a>

          {/* Zone 2: Recessed #F5F5F7 Segmented Mode Track with layoutId="workspace-mode-pill" */}
          <nav
            aria-label="Primary Navigation"
            className="hidden md:flex items-center gap-1 p-1 bg-[var(--bg-surface)] squircle-inner border border-[var(--border-hairline-color)]"
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
                  className={`relative px-3.5 py-1.5 text-xs font-medium squircle-inner transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'text-white font-semibold'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="workspace-mode-pill"
                      transition={STUDIO_SPRING}
                      className="absolute inset-0 bg-[var(--accent-primary)] squircle-inner"
                    />
                  )}
                  <span className="relative z-10">{item.label}</span>
                </a>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center gap-2 shrink-0">
            <motion.button
              type="button"
              whileTap={TACTILE_TAP}
              onClick={() => navigateTo(route === 'simple' ? 'advanced' : 'simple')}
              className="px-4 py-2 text-xs font-semibold text-white bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] squircle-inner transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {route === 'simple' ? 'Open Advanced Check' : 'Start Simple Check'}
            </motion.button>
          </div>
        </div>
      </header>

      {/* Ultra-Clean Single-Line Studio Context Sub-Header */}
      <div className="bg-[var(--bg-surface)] studio-hairline-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text-secondary)]">
          <div className="flex items-center gap-2 font-mono tabular-nums min-w-0 truncate">
            <span className="truncate">{GENRE_LABELS[genre]}</span>
            <span aria-hidden="true" className="opacity-40">·</span>
            <span className="whitespace-nowrap shrink-0">{MIX_STAGE_LABELS[mixStage].title}</span>
          </div>

          <div className="flex flex-wrap items-center justify-between md:justify-end gap-2 w-full md:w-auto">
            {/* Mobile Compact Route Switcher */}
            <nav
              aria-label="Mobile Navigation"
              className="flex md:hidden items-center gap-1 p-0.5 bg-[var(--bg-elevated)] squircle-inner border border-[var(--border-hairline-color)] max-w-full overflow-x-auto"
            >
              {navItems.map((item) => {
                const isActive = route === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigateTo(item.id)}
                    className={`px-2 py-1 squircle-inner text-[11px] font-medium whitespace-nowrap transition-colors ${
                      isActive
                        ? 'bg-[var(--accent-primary)] text-white font-semibold'
                        : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    {item.shortLabel}
                  </button>
                );
              })}
            </nav>

            {/* Live FastAPI DSP Engine Status Pill */}
            <div
              data-testid="engine-status-indicator"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 squircle-inner text-[11px] font-mono tabular-nums whitespace-nowrap shrink-0 ${
                backendStatus === 'online'
                  ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] border border-[var(--border-active-color)]'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-hairline-color)]'
              }`}
            >
              <Server className="w-3 h-3 shrink-0" />
              <span>
                {backendStatus === 'checking'
                  ? 'Engine: Connecting...'
                  : backendStatus === 'online'
                  ? 'Engine: FastAPI DSP (Online)'
                  : 'Engine: Local Web Audio'}
              </span>
              <button
                type="button"
                onClick={handleCheckBackendHealth}
                title="Re-check FastAPI DSP status"
                aria-label="Re-check FastAPI DSP status"
                className="hover:opacity-75 ml-0.5 cursor-pointer"
              >
                <RefreshCw
                  className={`w-3 h-3 ${backendStatus === 'checking' || loadingReport ? 'animate-spin' : ''}`}
                />
              </button>
            </div>

            {/* Light / Dark Studio Theme Toggle */}
            <motion.button
              type="button"
              whileTap={TACTILE_TAP}
              onClick={() => setDarkMode((d) => !d)}
              aria-label={darkMode ? 'Switch to Default Light Mode' : 'Switch to Secondary Dark Mode'}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 squircle-inner border border-[var(--border-hairline-color)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:border-[var(--border-active-color)] transition-colors whitespace-nowrap shrink-0 text-[11px] font-medium cursor-pointer"
            >
              {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span>{darkMode ? 'Light' : 'Dark'}</span>
            </motion.button>
          </div>
        </div>
      </div>

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {route === 'home' && (
          <div className="space-y-12">
            {/* Editorial Acoustic-Engineering Hero */}
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: STUDIO_EASE }}
              className="studio-elevated squircle-outer p-7 sm:p-10 lg:p-12"
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
                <div className="lg:col-span-8 space-y-5">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[var(--accent-primary)] font-medium">
                    <span>Acoustic Diagnostics Workbench</span>
                    <span aria-hidden="true" className="opacity-40">·</span>
                    <span className="text-[var(--text-secondary)]">ITU-R BS.1770-4 &amp; EBU R128</span>
                  </div>

                  <h1 className="text-3xl sm:text-4xl lg:text-[2.65rem] font-bold leading-[1.12] tracking-[-0.02em] text-[var(--text-primary)] text-balance">
                    Learn mixing and mastering by doing mixing and mastering, and receive meaningful insights through AI.
                  </h1>

                  <p className="text-sm sm:text-base text-[var(--text-secondary)] max-w-2xl leading-[1.6]">
                    Measure every bounce with mathematical DSP as the single source of truth. Inspect tonal balance against genre curves, audit user-uploaded original stems for spectral masking, verify v1 to v2 revision improvements, and unlock consent-gated coaching grounded strictly in measured evidence.
                  </p>

                  <div className="pt-2 flex flex-wrap items-center gap-3">
                    <motion.button
                      type="button"
                      whileTap={TACTILE_TAP}
                      onClick={() => navigateTo('simple')}
                      className="inline-flex items-center gap-2 px-5 py-2.5 squircle-inner bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <span>Open Simple Mix Check</span>
                      <ArrowRight className="w-4 h-4" />
                    </motion.button>
                    <motion.button
                      type="button"
                      whileTap={TACTILE_TAP}
                      onClick={() => navigateTo('advanced')}
                      className="inline-flex items-center gap-2 px-5 py-2.5 squircle-inner border border-[var(--border-hairline-color)] bg-[var(--bg-surface)] hover:border-[var(--border-active-color)] text-[var(--text-primary)] text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <span>Open Advanced Workbench</span>
                    </motion.button>
                    <button
                      type="button"
                      onClick={() => navigateTo('architecture')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-[var(--accent-primary)] hover:underline underline-offset-4 text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <span>System Architecture</span>
                    </button>
                  </div>
                </div>

                {/* Right Editorial Acoustic Specification Ledger */}
                <aside
                  aria-label="Measurement Engine Specifications"
                  className="lg:col-span-4 studio-surface squircle-inner p-5 space-y-4"
                >
                  <div className="text-xs font-mono text-[var(--text-secondary)] pb-2.5 studio-hairline-b flex items-center justify-between">
                    <span>Reference Calibration</span>
                    <span className="text-[var(--accent-primary)] font-medium">v{activeReport?.schema_version || '2.0.0'}</span>
                  </div>
                  <dl className="space-y-3 text-xs">
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-[var(--text-secondary)]">Loudness Standard</dt>
                      <dd className="font-mono tabular-nums font-medium text-[var(--text-primary)]">ITU-R BS.1770-4</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-[var(--text-secondary)]">True Peak Oversampling</dt>
                      <dd className="font-mono tabular-nums font-medium text-[var(--text-primary)]">4× Polyphase ISP</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-[var(--text-secondary)]">Spectral Resolution</dt>
                      <dd className="font-mono tabular-nums font-medium text-[var(--text-primary)]">6-Band Welch PSD</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-[var(--text-secondary)]">Stem Policy (Rule 1)</dt>
                      <dd className="font-mono font-medium text-[var(--status-safe)]">Original Stems Only</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 pt-2.5 studio-hairline-t">
                      <dt className="text-[var(--text-secondary)]">Default AI Training</dt>
                      <dd className="font-mono font-medium text-[var(--text-primary)]">Disabled (False)</dd>
                    </div>
                  </dl>
                </aside>
              </div>
            </motion.section>

            {/* Asymmetric Two-Column Split: Simple Mix Check vs. Advanced Workbench */}
            <section
              aria-label="Dual Interface Architecture"
              className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch"
            >
              {/* Left (5 cols): Simple Mix Check */}
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={VIEWPORT_REVEAL}
                transition={{ duration: 0.4, ease: STUDIO_EASE }}
                className="lg:col-span-5 studio-elevated squircle-outer p-7 flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs font-mono text-[var(--text-secondary)]">
                    <span>01 · Focused Guidance</span>
                    <span>/simple</span>
                  </div>
                  <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2.5">
                    <BookOpen className="w-5 h-5 text-[var(--accent-primary)] shrink-0" />
                    <span>Simple Mix Check</span>
                  </h2>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                    Built for independent artists who want a distraction-free read on loudness, headroom, tonal balance, and the top three DAW adjustments to make next.
                  </p>
                  <ol className="space-y-2.5 pt-2 text-xs text-[var(--text-secondary)] border-t border-[var(--border-hairline-color)]">
                    <li className="flex items-baseline gap-2.5">
                      <span className="font-mono tabular-nums text-[var(--accent-primary)] font-semibold">01</span>
                      <span>Choose your genre and Unmastered Mix or Final Master stage.</span>
                    </li>
                    <li className="flex items-baseline gap-2.5">
                      <span className="font-mono tabular-nums text-[var(--accent-primary)] font-semibold">02</span>
                      <span>Review 4 core diagnostics and your 6-band spectral curve vs. genre envelope.</span>
                    </li>
                    <li className="flex items-baseline gap-2.5">
                      <span className="font-mono tabular-nums text-[var(--accent-primary)] font-semibold">03</span>
                      <span>Work through top-3 plain-language DAW fixes with collapsible learning guides.</span>
                    </li>
                  </ol>
                </div>

                <div className="mt-7 pt-5 studio-hairline-t">
                  <motion.button
                    type="button"
                    whileTap={TACTILE_TAP}
                    onClick={() => navigateTo('simple')}
                    className="w-full py-2.5 px-4 squircle-inner bg-[var(--text-primary)] text-[var(--bg-elevated)] hover:opacity-90 text-xs font-semibold transition-opacity cursor-pointer"
                  >
                    Launch Simple Mix Check
                  </motion.button>
                </div>
              </motion.div>

              {/* Right (7 cols): Advanced Mix Check Workbench */}
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={VIEWPORT_REVEAL}
                transition={{ duration: 0.4, delay: 0.08, ease: STUDIO_EASE }}
                className="lg:col-span-7 studio-elevated squircle-outer p-7 flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs font-mono text-[var(--text-secondary)]">
                    <span>02 · Full Studio Workbench</span>
                    <span>/advanced</span>
                  </div>
                  <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2.5">
                    <Sliders className="w-5 h-5 text-[var(--accent-primary)] shrink-0" />
                    <span>Advanced Mix Check</span>
                  </h2>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                    Precision playback and diagnostic console sharing the exact same DSP engine—adding sample-locked Reference A/B switching, Translation Lab filters, multitrack stem overlap matrices, and v1 to v2 revision delta verification.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-3 border-t border-[var(--border-hairline-color)] text-xs text-[var(--text-secondary)]">
                    <div className="studio-surface squircle-inner p-3.5 space-y-1">
                      <div className="font-semibold text-[var(--text-primary)]">Loudness-Matched A/B &amp; Lab</div>
                      <p>15ms click-free Mix A / Reference B switching, equal-power Mono fold, and Phone/Laptop filter approximations.</p>
                    </div>
                    <div className="studio-surface squircle-inner p-3.5 space-y-1">
                      <div className="font-semibold text-[var(--text-primary)]">Time-Domain &amp; Phase Sync</div>
                      <p>60fps canvas waveform markers linked to Short-Term LUFS trajectory and live Stereo Phase Correlation meter.</p>
                    </div>
                    <div className="studio-surface squircle-inner p-3.5 space-y-1">
                      <div className="font-semibold text-[var(--text-primary)]">Original Stems Matrix (Rule 1)</div>
                      <p>Upload 2–8 genuine DAW stems to measure pairwise 6-band spectral overlap—zero AI stem fabrication.</p>
                    </div>
                    <div className="studio-surface squircle-inner p-3.5 space-y-1">
                      <div className="font-semibold text-[var(--text-primary)]">v1 → v2 Revision Deltas</div>
                      <p>Track exact LUFS, True Peak, LRA, phase, and tonal shifts to confirm every finding improved cleanly.</p>
                    </div>
                  </div>
                </div>

                <div className="mt-7 pt-5 studio-hairline-t">
                  <motion.button
                    type="button"
                    whileTap={TACTILE_TAP}
                    onClick={() => navigateTo('advanced')}
                    className="w-full py-2.5 px-4 squircle-inner bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Launch Advanced Workbench
                  </motion.button>
                </div>
              </motion.div>
            </section>

            {/* Five-Tier Consent & Privacy Gate */}
            <ConsentGatePanel consent={consent} onChangeConsent={setConsent} />

            {/* Ten Non-Negotiable Product Rules — Clean Editorial Ledger */}
            <motion.section
              aria-label="Ten Absolute Product Rules"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VIEWPORT_REVEAL}
              transition={{ duration: 0.4, ease: STUDIO_EASE }}
              className="studio-elevated squircle-outer p-7"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 pb-4 studio-hairline-b">
                <div>
                  <div className="flex items-center gap-2 text-xs font-mono text-[var(--accent-primary)]">
                    <Shield className="w-3.5 h-3.5" />
                    <span>Engineering &amp; Privacy Invariants</span>
                  </div>
                  <h2 className="text-lg font-bold text-[var(--text-primary)] mt-1">
                    Ten Non-Negotiable Studio Rules
                  </h2>
                </div>
                <span className="text-xs font-mono text-[var(--text-secondary)]">
                  Enforced by JSON Schema &amp; Automated Tests
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-4 mt-5 text-xs text-[var(--text-secondary)] leading-relaxed">
                <div>
                  <strong className="text-[var(--text-primary)]">01. No AI Stem Splitting:</strong> Never fabricate pseudo-stems from stereo mixdowns. Stem overlap runs solely on genuine user-uploaded multitracks.
                </div>
                <div>
                  <strong className="text-[var(--text-primary)]">02. DSP Source of Truth:</strong> Mathematical DSP calculations are the sole source of objective measurements. AI never invents metrics.
                </div>
                <div>
                  <strong className="text-[var(--text-primary)]">03. Technical Integrity:</strong> Creative vision tags guide stylistic advice but never suppress measurable technical warnings.
                </div>
                <div>
                  <strong className="text-[var(--text-primary)]">04. Granular Consent Dimensions:</strong> Local DSP, metrics-only AI JSON, direct audio inspection, raw transfer, and model training are separately gated.
                </div>
                <div>
                  <strong className="text-[var(--text-primary)]">05. Zero Default Training:</strong> Default is strictly <span className="font-mono">model_training_opt_in: false</span>. Ephemeral processing never opts into training.
                </div>
                <div>
                  <strong className="text-[var(--text-primary)]">06. Honest Device Simulation:</strong> Phone and Laptop translation modes are explicitly labeled as linear biquad filter approximations.
                </div>
                <div>
                  <strong className="text-[var(--text-primary)]">07. Honest Streaming Estimates:</strong> Platform loudness normalization shifts are documented estimates based on published playback targets.
                </div>
                <div>
                  <strong className="text-[var(--text-primary)]">08. Objective vs. Stylistic Split:</strong> Objective technical boundary alerts are cleanly separated from subjective genre-context notes.
                </div>
                <div>
                  <strong className="text-[var(--text-primary)]">09. Lean Local-First Architecture:</strong> Ephemeral analysis workspaces purge uploaded audio immediately without auth walls or cloud retention.
                </div>
                <div>
                  <strong className="text-[var(--text-primary)]">10. Verified Contract Boundaries:</strong> Deterministic unit suites (<span className="font-mono">node:test</span> + <span className="font-mono">pytest</span>) validate every DSP and privacy boundary.
                </div>
              </div>
            </motion.section>
          </div>
        )}

        {route === 'simple' && (
          <div className="space-y-8">
            {reportError && (
              <div className="border border-[var(--status-alert)]/30 bg-rose-50/80 dark:bg-rose-950/30 p-3.5 squircle-inner text-xs text-rose-900 dark:text-rose-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-[var(--status-alert)]" />
                  <span>{reportError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setReportError(null)}
                  className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-mono cursor-pointer"
                >
                  Dismiss
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

        {route === 'advanced' && (
          <div className="space-y-8">
            {reportError && (
              <div className="border border-[var(--status-alert)]/30 bg-rose-50/80 dark:bg-rose-950/30 p-3.5 squircle-inner text-xs text-rose-900 dark:text-rose-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-[var(--status-alert)]" />
                  <span>{reportError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setReportError(null)}
                  className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-mono cursor-pointer"
                >
                  Dismiss
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

        {route === 'architecture' && (
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
        )}
      </main>

      {/* Quiet Studio Footer */}
      <footer className="studio-hairline-t px-4 sm:px-6 py-5 bg-[var(--bg-elevated)] text-xs text-[var(--text-secondary)]">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <span>MixLearn Studio · Mathematical DSP &amp; Audio Engineering Workbench</span>
          <span className="font-mono tabular-nums">Default Model Training Opt-In: False</span>
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

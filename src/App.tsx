/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, MotionConfig } from 'motion/react';
import { TACTILE_TAP } from './lib/motion';
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
import {
  AuthProvider,
  consumePendingReturnTo,
  storePendingReturnTo,
  useAuth,
} from './auth/AuthContext';
import {
  AppRoute,
  isProtectedRoute,
  parseAppRoute,
  sanitizeReturnTo,
} from './auth/authLogic';
import { saveMixSessionSummary } from './lib/supabaseClient';
import { ConsentGatePanel } from './components/ConsentGatePanel';
import { SimpleMixCheckView } from './components/SimpleMixCheckView';
import { AdvancedMixCheckView } from './components/AdvancedMixCheckView';
import { ArchitectureHandoffView } from './components/ArchitectureHandoffView';
import { LandingPageView } from './components/LandingPageView';
import { AuthView } from './components/AuthView';
import { LegalPages } from './components/LegalPages';
import { CookieConsentBanner } from './components/CookieConsentBanner';
import {
  ArrowUpRight,
  Sun,
  Moon,
  RefreshCw,
  AlertCircle,
  LogOut,
  Lock,
} from 'lucide-react';

const THEME_STORAGE_KEY = 'mixlearn_theme_v1';

function readInitialDarkMode(): boolean {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark';
  } catch {
    return false;
  }
}

function getRouteFromLocation(): AppRoute {
  return parseAppRoute(window.location.pathname);
}

function MixLearnStudioShell() {
  const auth = useAuth();
  const [route, setRoute] = useState<AppRoute>(() => getRouteFromLocation());
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [pendingReturnTo, setPendingReturnTo] = useState<AppRoute>(() => {
    const initial = getRouteFromLocation();
    return isProtectedRoute(initial) ? initial : '/simple';
  });
  const [darkMode, setDarkMode] = useState<boolean>(() => readInitialDarkMode());
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

  const pushRoute = useCallback((nextRoute: AppRoute, replace = false) => {
    setRoute(nextRoute);
    if (window.location.pathname !== nextRoute) {
      if (replace) {
        window.history.replaceState(null, '', nextRoute);
      } else {
        window.history.pushState(null, '', nextRoute);
      }
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const navigateTo = useCallback(
    (targetRoute: AppRoute) => {
      if (isProtectedRoute(targetRoute) && !auth.isLoading && !auth.user) {
        setPendingReturnTo(targetRoute);
        storePendingReturnTo(targetRoute);
        setAuthMode('login');
        pushRoute('/auth');
        return;
      }
      pushRoute(targetRoute);
    },
    [auth.isLoading, auth.user, pushRoute]
  );

  const openAuth = useCallback(
    (mode: 'login' | 'signup', returnTo: AppRoute = '/simple') => {
      const safeDest = sanitizeReturnTo(returnTo);
      setAuthMode(mode);
      setPendingReturnTo(safeDest);
      storePendingReturnTo(safeDest);
      pushRoute('/auth');
    },
    [pushRoute]
  );

  // Strict route guard for direct URL entry or browser back/forward navigation
  useEffect(() => {
    if (auth.isLoading) return;
    if (!auth.user && isProtectedRoute(route)) {
      setPendingReturnTo(route);
      storePendingReturnTo(route);
      pushRoute('/auth', true);
    } else if (auth.user && route === '/auth') {
      const storedDest = consumePendingReturnTo() || pendingReturnTo || '/simple';
      pushRoute(sanitizeReturnTo(storedDest), true);
    }
  }, [auth.isLoading, auth.user, pendingReturnTo, pushRoute, route]);

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
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, darkMode ? 'dark' : 'light');
    } catch {
      // ignore storage errors
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

  const handleClearFile = useCallback(() => {
    studioAudioEngine.clearPrimaryMix();
    studioAudioEngine.clearRevisionV2();
    setSelectedFile(null);
    setActiveReport(null);
    setStemReport(null);
    setRevisionComparison(null);
    setAnalysisStage('idle');
    setReportError(null);
  }, []);

  const handleLogout = useCallback(async () => {
    abortControllerRef.current?.abort();
    handleClearFile();
    await auth.signOut();
    pushRoute('/');
  }, [auth, handleClearFile, pushRoute]);

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
    fd.append('interface_mode', route === '/simple' ? 'simple' : 'advanced');
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

        // Persist lightweight summary JSON ONLY (zero raw audio) when signed in via Supabase
        if (auth.user && auth.user.provider === 'supabase') {
          const objectiveCount = result.report.issues.filter(
            (i) => i.classification === 'objective_technical'
          ).length;
          void saveMixSessionSummary({
            user_id: auth.user.id,
            track_name: result.report.file_metadata.filename,
            genre: targetGenre,
            stage: targetStage,
            summary_metrics: {
              integrated_lufs: result.report.measurements.integrated_loudness.value,
              true_peak_dbtp: result.report.measurements.true_peak_max.value,
              loudness_range_lu: result.report.measurements.loudness_range_lra.value,
              phase_correlation_mean: result.report.measurements.phase_correlation_mean.value,
              issue_count: result.report.issues.length,
              objective_issue_count: objectiveCount,
              duration_seconds: result.report.file_metadata.duration_seconds,
              is_demonstration_data: result.report.is_demonstration_data,
            },
          });
        }
      } else {
        setAnalysisStage('failed');
        setReportError(result.errorMessage || 'Mathematical DSP analysis failed.');
      }
    } catch (err: unknown) {
      clearInterval(progressTimer);
      const errorObj = err as { name?: string; message?: string };
      if (errorObj?.name !== 'AbortError') {
        setAnalysisStage('failed');
        setReportError(errorObj?.message || 'DSP analysis failed.');
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
      interface_mode: route === '/advanced' ? 'advanced' : 'simple',
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

  const navItems: Array<{
    id: AppRoute;
    href: AppRoute;
    label: string;
    shortLabel: string;
    protected: boolean;
  }> = [
    { id: '/', href: '/', label: 'OVERVIEW', shortLabel: 'HOME', protected: false },
    { id: '/simple', href: '/simple', label: 'SIMPLE CHECK', shortLabel: 'SIMPLE', protected: true },
    {
      id: '/advanced',
      href: '/advanced',
      label: 'ADVANCED LAB',
      shortLabel: 'ADVANCED',
      protected: true,
    },
    {
      id: '/architecture',
      href: '/architecture',
      label: 'ARCHITECTURE',
      shortLabel: 'SYSTEM',
      protected: true,
    },
  ];

  const engineLabel =
    backendStatus === 'checking'
      ? 'ENGINE: CONNECTING TO DSP...'
      : backendStatus === 'online'
      ? 'ENGINE: FASTAPI ONLINE'
      : 'ENGINE: LOCAL WEB AUDIO';

  const isStudioRoute =
    route === '/simple' || route === '/advanced' || route === '/architecture';

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
                navigateTo('/');
              }}
              aria-label="MixLearn Studio Home"
              className="px-5 py-3.5 border-r-2 border-[var(--border-ink)] font-display text-2xl leading-none tracking-tight text-[var(--ink)] flex items-center whitespace-nowrap shrink-0 hover:bg-[#FFD600] hover:text-[#0A0A0A]"
            >
              MIXLEARN.
            </a>

            {/* Navigation Cells — Instant CSS Inversion (Zero layoutId Flicker) */}
            <nav
              aria-label="Primary Navigation"
              className="flex items-stretch flex-1 divide-x-[1.5px] divide-[var(--border-ink)]"
            >
              {navItems.map((item) => {
                const isActive = route === item.id;
                const showLock = item.protected && !auth.user;
                return (
                  <a
                    key={item.id}
                    href={item.href}
                    onClick={(e) => {
                      e.preventDefault();
                      navigateTo(item.id);
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    data-testid={`nav-link-${item.shortLabel.toLowerCase()}`}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-3.5 font-ui text-xs font-bold uppercase tracking-wider whitespace-nowrap ${
                      isActive
                        ? 'bg-[var(--ink)] text-[var(--bg-canvas)]'
                        : 'bg-transparent text-[var(--ink)] hover:bg-[var(--bg-surface)]'
                    }`}
                  >
                    {showLock && (
                      <Lock className="w-3 h-3 opacity-65 shrink-0" aria-hidden="true" />
                    )}
                    <span>{item.label}</span>
                  </a>
                );
              })}
            </nav>

            {/* Theme Toggle Cell */}
            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              aria-label={darkMode ? 'Switch to Light Mode (Paper)' : 'Switch to Dark Mode (Ink)'}
              data-testid="theme-toggle-btn"
              className="px-3.5 border-l-2 border-[var(--border-ink)] flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--bg-canvas)] whitespace-nowrap shrink-0 cursor-pointer"
            >
              {darkMode ? (
                <Sun className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <Moon className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>{darkMode ? 'PAPER' : 'INK'}</span>
            </button>

            {/* Auth Controls */}
            {auth.user ? (
              <div className="flex items-stretch border-l-2 border-[var(--border-ink)] shrink-0">
                <div
                  className="hidden xl:flex items-center px-3.5 font-mono text-[11px] font-medium text-[var(--ink-muted)] max-w-[190px] truncate"
                  title={auth.user.email}
                >
                  {auth.user.displayName}
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  data-testid="logout-btn"
                  aria-label="Log Out of MixLearn Studio"
                  className="px-4 py-3.5 xl:border-l-[1.5px] border-[var(--border-ink)] bg-[var(--bg-canvas)] text-[var(--ink)] hover:bg-[#FF3B1F] hover:text-white font-ui text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>LOG OUT</span>
                </button>
              </div>
            ) : (
              <div className="flex items-stretch border-l-2 border-[var(--border-ink)] shrink-0">
                <button
                  type="button"
                  onClick={() => openAuth('login', '/simple')}
                  data-testid="nav-login-btn"
                  className="px-4 py-3.5 bg-[var(--bg-canvas)] text-[var(--ink)] hover:bg-[var(--bg-surface)] font-ui text-xs font-bold uppercase tracking-wider whitespace-nowrap cursor-pointer"
                >
                  LOG IN
                </button>
                <motion.button
                  type="button"
                  whileTap={TACTILE_TAP}
                  onClick={() => openAuth('signup', '/simple')}
                  data-testid="nav-get-started-btn"
                  className="group px-5 py-3.5 border-l-2 border-[var(--border-ink)] bg-[#FFD600] text-[#0A0A0A] hover:bg-[#0A0A0A] hover:text-[#FFD600] font-ui text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <span>GET STARTED</span>
                  <ArrowUpRight className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-[3px] group-hover:-translate-y-[3px]" />
                </motion.button>
              </div>
            )}
          </div>

          {/* Mobile / Tablet 2-Row Swiss Grid Header */}
          <div className="lg:hidden">
            <div className="flex items-stretch justify-between border-b-[1.5px] border-[var(--border-ink)]">
              <a
                href="/"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo('/');
                }}
                aria-label="MixLearn Studio Home"
                className="px-4 py-3 font-display text-xl leading-none tracking-tight text-[var(--ink)] flex items-center"
              >
                MIXLEARN.
              </a>
              <div className="flex items-stretch">
                <button
                  type="button"
                  onClick={() => setDarkMode((d) => !d)}
                  aria-label={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                  className="px-3 border-l-[1.5px] border-[var(--border-ink)] flex items-center justify-center text-[var(--ink)] cursor-pointer"
                >
                  {darkMode ? (
                    <Sun className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Moon className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
                {auth.user ? (
                  <button
                    type="button"
                    onClick={handleLogout}
                    data-testid="mobile-logout-btn"
                    className="px-3.5 border-l-[1.5px] border-[var(--border-ink)] bg-[var(--bg-canvas)] text-[var(--ink)] hover:bg-[#FF3B1F] hover:text-white font-ui text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>LOG OUT</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => openAuth('signup', '/simple')}
                    className="px-3.5 border-l-[1.5px] border-[var(--border-ink)] bg-[#FFD600] text-[#0A0A0A] font-ui text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <span>GET STARTED</span>
                    <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
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
                    aria-current={isActive ? 'page' : undefined}
                    className={`py-2.5 text-center font-mono text-[10px] font-bold uppercase tracking-wider cursor-pointer ${
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

      {/* SUB-HEADER CONTEXT BAR (Only on authenticated Studio routes) */}
      {isStudioRoute && auth.user && (
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
              className="inline-flex items-center gap-2 px-2.5 py-0.5 border-[1.5px] border-[#0A0A0A] bg-[#FFD600] text-[#0A0A0A] font-bold uppercase tracking-wider text-[10px]"
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
        {/* ROUTE: / (LANDING PAGE) */}
        {route === '/' && (
          <LandingPageView
            isAuthenticated={Boolean(auth.user)}
            onNavigate={navigateTo}
            onOpenAuth={(mode) => openAuth(mode, '/simple')}
          />
        )}

        {/* ROUTE: /auth (LOGIN / SIGN UP) */}
        {route === '/auth' && (
          <div className="px-4 sm:px-6 py-6 sm:py-10">
            <AuthView
              initialMode={authMode}
              returnTo={pendingReturnTo}
              onNavigate={navigateTo}
              onAuthenticated={(destination) => {
                const storedDest = consumePendingReturnTo();
                pushRoute(sanitizeReturnTo(storedDest || destination));
              }}
            />
          </div>
        )}

        {/* ROUTES: /privacy, /terms, /cookies */}
        {(route === '/privacy' || route === '/terms' || route === '/cookies') && (
          <div className="px-4 sm:px-6 py-4">
            <LegalPages route={route} onNavigate={navigateTo} />
          </div>
        )}

        {/* PROTECTED ROUTE LOADING GUARD */}
        {isStudioRoute && auth.isLoading && (
          <div className="p-12 text-center font-mono text-xs uppercase tracking-widest text-[var(--ink-muted)]">
            VERIFYING STUDIO SESSION...
          </div>
        )}

        {/* ROUTE: /simple (PROTECTED) */}
        {route === '/simple' && auth.user && (
          <div className="p-4 sm:p-6 lg:p-8 space-y-6">
            {reportError && (
              <div
                role="alert"
                className="border-2 border-[var(--border-ink)] bg-[#FF3B1F] text-white p-3.5 text-xs font-mono flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
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
              onSwitchToAdvanced={() => navigateTo('/advanced')}
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

        {/* ROUTE: /advanced (PROTECTED) */}
        {route === '/advanced' && auth.user && (
          <div className="p-4 sm:p-6 lg:p-8 space-y-6">
            {reportError && (
              <div
                role="alert"
                className="border-2 border-[var(--border-ink)] bg-[#FF3B1F] text-white p-3.5 text-xs font-mono flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
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

        {/* ROUTE: /architecture (PROTECTED) */}
        {route === '/architecture' && auth.user && (
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

      {/* GLOBAL SWISS NEO-BRUTALIST FOOTER */}
      <footer className="border-t-2 border-[var(--border-ink)] bg-[var(--bg-canvas)]">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4 font-mono text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('/');
              }}
              className="font-display text-lg tracking-tight text-[var(--ink)] hover:text-[#FF3B1F]"
            >
              MIXLEARN.
            </a>
            <span className="text-[var(--ink-muted)]">
              FREE AUDIO DSP WORKBENCH · ZERO AUDIO RETENTION
            </span>
          </div>

          <nav aria-label="Footer Legal and Account Links" className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <a
              href="/privacy"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('/privacy');
              }}
              className="text-[var(--ink)] font-bold hover:text-[#FF3B1F]"
            >
              PRIVACY POLICY
            </a>
            <a
              href="/terms"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('/terms');
              }}
              className="text-[var(--ink)] font-bold hover:text-[#FF3B1F]"
            >
              TERMS &amp; CONDITIONS
            </a>
            <a
              href="/cookies"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('/cookies');
              }}
              className="text-[var(--ink)] font-bold hover:text-[#FF3B1F]"
            >
              COOKIES POLICY
            </a>
            {auth.user ? (
              <button
                type="button"
                onClick={handleLogout}
                className="text-[var(--ink)] font-bold hover:text-[#FF3B1F] uppercase cursor-pointer"
              >
                LOG OUT ({auth.user.displayName})
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openAuth('login', '/simple')}
                className="text-[var(--ink)] font-bold hover:text-[#FF3B1F] uppercase cursor-pointer"
              >
                ACCOUNT / LOG IN
              </button>
            )}
          </nav>
        </div>
      </footer>

      {/* MINIMAL ESSENTIAL-COOKIES BANNER */}
      <CookieConsentBanner onNavigate={navigateTo} />
    </div>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <StudioAudioProvider>
          <MixLearnStudioShell />
        </StudioAudioProvider>
      </AuthProvider>
    </MotionConfig>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  AnalysisReport,
  ConsentState,
  createDefaultConsentState,
  GenreId,
  MixStage,
} from './contracts/analysisContract';
import { generatePhase1DemoReport, GENRE_LABELS, MIX_STAGE_LABELS } from './contracts/demoFixtures';
import { checkBackendHealth, fetchAnalysisReport, analyzeAudioWithDsp } from './services/apiService';
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

export default function App() {
  const [route, setRoute] = useState<ActiveRoute>(() => getRouteFromLocation());
  const [darkMode, setDarkMode] = useState<boolean>(false); // Default Light Mode per design tokens
  const [genre, setGenre] = useState<GenreId>('indie_rock');
  const [mixStage, setMixStage] = useState<MixStage>('unmastered_mix');
  const [consent, setConsent] = useState<ConsentState>(() => createDefaultConsentState());
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [checkingBackend, setCheckingBackend] = useState<boolean>(false);

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

  // Initial Backend Health Check on Mount (without overwriting real reports!)
  useEffect(() => {
    let isCancelled = false;
    const initBackend = async () => {
      try {
        const health = await checkBackendHealth();
        if (!isCancelled) {
          setBackendOnline(health.online);
        }
      } catch {
        if (!isCancelled) {
          setBackendOnline(false);
        }
      }
    };
    initBackend();
    return () => {
      isCancelled = true;
    };
  }, []);

  // Real Mathematical DSP Analysis with smooth 2.4s minimum animation (Rule 2 & 3)
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
    setIsAnalyzing(true);
    setAnalysisProgress(5);
    setAnalysisStageIndex(0);
    setLoadingReport(true);
    setAnalysisStage('analyzing');
    setReportError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const minDurationMs = 2400;
    const startTime = performance.now();

    // Smooth stage progress ticker (0% -> 95%)
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
      const [result] = await Promise.all([analysisPromise, minDelayPromise]);

      clearInterval(progressTimer);
      setAnalysisProgress(100);
      setAnalysisStageIndex(3);

      // Brief 150ms settling pause at 100%
      await new Promise((resolve) => setTimeout(resolve, 150));

      if (result.success && result.report) {
        setActiveReport(result.report);
        setReportSource('backend');
        setAnalysisStage('complete');
        setReportError(null);
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
    setSelectedFile(null);
    setActiveReport(null);
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

  // Explicitly Load Demonstration Report
  const handleLoadDemonstration = async () => {
    setLoadingReport(true);
    try {
      const result = await fetchAnalysisReport({
        interface_mode: route === 'simple' ? 'simple' : 'advanced',
        genre,
        mix_stage: mixStage,
        consent_state: consent,
      });

      setActiveReport(result.report!);
      setReportSource(result.source);
      setSelectedFile(null);
      setAnalysisStage('complete');
      setReportError(null);
    } catch {
      setActiveReport(
        generatePhase1DemoReport({
          interface_mode: route === 'simple' ? 'simple' : 'advanced',
          genre,
          mix_stage: mixStage,
          consent_state: consent,
        })
      );
      setReportSource('offline_fallback');
      setSelectedFile(null);
      setAnalysisStage('complete');
    } finally {
      setLoadingReport(false);
    }
  };

  // Manual or on-demand backend health check
  const handleCheckBackendHealth = async () => {
    setCheckingBackend(true);
    try {
      const health = await checkBackendHealth();
      setBackendOnline(health.online);
    } catch {
      setBackendOnline(false);
    } finally {
      setCheckingBackend(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        {/* Zone 1: Wordmark */}
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigateTo('home');
          }}
          className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100 whitespace-nowrap shrink-0 font-display"
        >
          MixLearn Studio
        </a>

        {/* Zone 2: Navigation Links */}
        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-600 dark:text-zinc-400"
        >
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('home');
            }}
            className={`hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0 ${
              route === 'home'
                ? 'text-teal-800 dark:text-teal-400 underline underline-offset-8 decoration-2 font-semibold'
                : ''
            }`}
          >
            Overview
          </a>
          <a
            href="/simple"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('simple');
            }}
            className={`hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0 ${
              route === 'simple'
                ? 'text-teal-800 dark:text-teal-400 underline underline-offset-8 decoration-2 font-semibold'
                : ''
            }`}
          >
            Simple Mix Check
          </a>
          <a
            href="/advanced"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('advanced');
            }}
            className={`hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0 ${
              route === 'advanced'
                ? 'text-teal-800 dark:text-teal-400 underline underline-offset-8 decoration-2 font-semibold'
                : ''
            }`}
          >
            Advanced Mix Check
          </a>
          <a
            href="/architecture"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('architecture');
            }}
            className={`hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0 ${
              route === 'architecture'
                ? 'text-teal-800 dark:text-teal-400 underline underline-offset-8 decoration-2 font-semibold'
                : ''
            }`}
          >
            Phase 1 Architecture
          </a>
        </nav>

        {/* Zone 3: Primary Action & Theme Toggle */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => navigateTo(route === 'simple' ? 'advanced' : 'simple')}
            className="px-4 py-2 text-xs font-medium text-white bg-teal-800 hover:bg-teal-900 dark:bg-teal-700 dark:hover:bg-teal-600 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            {route === 'simple' ? 'Open Advanced Check' : 'Start Simple Mix Check'}
          </button>
        </div>
      </header>

      {/* Secondary Workspace Context & Theme Toolbar */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/70 px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-600 dark:text-zinc-400">
          <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums">
            <span className="font-semibold text-teal-800 dark:text-teal-400">
              PHASE 1 FOUNDATION
            </span>
            <span aria-hidden="true">·</span>
            <span>SHARED ENGINE CONTRACT v{activeReport?.schema_version || '2.0.0'}</span>
            <span aria-hidden="true">·</span>
            <span>GENRE: {GENRE_LABELS[genre]}</span>
            <span aria-hidden="true">·</span>
            <span>STAGE: {MIX_STAGE_LABELS[mixStage].title}</span>
            <span aria-hidden="true">·</span>
            <span
              className={
                reportSource === 'backend'
                  ? 'text-teal-700 dark:text-teal-300 font-semibold'
                  : 'text-amber-700 dark:text-amber-400 font-semibold'
              }
            >
              DATA: {reportSource === 'backend' ? 'FASTAPI BACKEND' : 'OFFLINE LOCAL'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Live Backend Connection Badge */}
            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono border ${
                backendOnline === true
                  ? 'bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800'
                  : 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700'
              }`}
            >
              <Server className="w-3.5 h-3.5 shrink-0" />
              <span>
                {checkingBackend
                  ? 'Checking API...'
                  : backendOnline === true
                    ? 'Backend API: Online (Vite Proxy)'
                    : 'Backend API: Offline (Client Mode)'}
              </span>
              <button
                type="button"
                onClick={handleCheckBackendHealth}
                title="Re-check backend API status"
                className="hover:opacity-75 ml-0.5 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${checkingBackend || loadingReport ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Mobile route switcher */}
            <div className="flex md:hidden items-center gap-1">
              {(['home', 'simple', 'advanced', 'architecture'] as ActiveRoute[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => navigateTo(r)}
                  className={`px-2 py-1 rounded text-xs font-medium capitalize ${
                    route === r
                      ? 'bg-teal-800 text-white'
                      : 'text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              aria-label={darkMode ? 'Switch to Default Light Mode' : 'Switch to Secondary Dark Mode'}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0"
            >
              {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span>{darkMode ? 'Light (Default)' : 'Dark'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        {route === 'home' && (
          <div className="space-y-10">
            {/* Hero Section */}
            <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-zinc-50/50 dark:bg-zinc-900/50 p-8">
              <div className="max-w-3xl">
                <p className="text-xs font-mono text-teal-800 dark:text-teal-400 font-semibold">
                  PRIVACY-FIRST AUDIO ENGINEERING EDUCATION · PHASE 1 HANDOFF FOUNDATION
                </p>
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mt-2 text-balance">
                  Learn mixing and mastering by doing mixing and mastering, and receive meaningful insights through AI.
                </h1>
                <p className="text-base text-zinc-600 dark:text-zinc-400 mt-3 leading-relaxed">
                  Examine your mixes with mathematical DSP measurements as the single source of truth, listen to exact issue timestamps, separate objective technical defects from stylistic choices, and verify revisions across two tailored interfaces sharing one analysis contract.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => navigateTo('simple')}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-teal-800 hover:bg-teal-900 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0"
                  >
                    <span>Open Simple Mix Check (Beginners)</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateTo('advanced')}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm font-medium transition-colors whitespace-nowrap shrink-0"
                  >
                    <span>Open Advanced Mix Check (Intermediate)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateTo('architecture')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md text-teal-800 dark:text-teal-400 hover:underline text-sm font-medium whitespace-nowrap shrink-0"
                  >
                    <span>Inspect Phase 1 Architecture Contract</span>
                  </button>
                </div>
              </div>
            </section>

            {/* Two Interfaces Sharing One Technical Analysis Engine */}
            <section aria-label="Dual Interface Architecture" className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Interface 1 Card */}
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs font-mono text-zinc-500 dark:text-zinc-400">
                    <span>INTERFACE 01 · BEGINNER WORKFLOW</span>
                    <span>ROUTE: /simple</span>
                  </div>
                  <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mt-2 flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-teal-700 dark:text-teal-400" />
                    <span>Simple Mix Check</span>
                  </h2>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 leading-relaxed">
                    Designed for independent musicians who want clear, actionable feedback without intimidating spectral graphs or dense engineering terminology.
                  </p>
                  <ul className="mt-4 space-y-2 text-xs text-zinc-700 dark:text-zinc-300">
                    <li>1. Select music genre and Unmastered Mix or Final Master stage.</li>
                    <li>2. Receive prioritized plain-language findings ranked by impact.</li>
                    <li>3. Follow the 4-part loop: What was detected, Why it matters, What to try, and How to verify.</li>
                    <li>4. Keeps objective technical warnings distinct from stylistic suggestions.</li>
                  </ul>
                </div>
                <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => navigateTo('simple')}
                    className="w-full py-2.5 px-4 rounded-md bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 text-xs font-semibold transition-colors"
                  >
                    Launch Simple Mix Check
                  </button>
                </div>
              </div>

              {/* Interface 2 Card */}
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs font-mono text-zinc-500 dark:text-zinc-400">
                    <span>INTERFACE 02 · INTERMEDIATE DIAGNOSTICS</span>
                    <span>ROUTE: /advanced</span>
                  </div>
                  <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mt-2 flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-teal-700 dark:text-teal-400" />
                    <span>Advanced Mix Check</span>
                  </h2>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 leading-relaxed">
                    Full engineering diagnostics consuming the identical shared `AudioMixAnalysisReport` contract with full unit precision and timestamped waveform inspection.
                  </p>
                  <ul className="mt-4 space-y-2 text-xs text-zinc-700 dark:text-zinc-300">
                    <li>1. Complete LUFS, True Peak (dBTP), LRA, crest factor, phase correlation & PSD bands.</li>
                    <li>2. Clickable issue timestamps synced to functional waveform & Mono sum auditioning.</li>
                    <li>3. Genuine original stem validation (strictly blocking AI stem separation per Rule 1).</li>
                    <li>4. Forward-compatible slots for streaming gain, reference matching, revisions, and opt-in AI.</li>
                  </ul>
                </div>
                <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => navigateTo('advanced')}
                    className="w-full py-2.5 px-4 rounded-md bg-teal-800 hover:bg-teal-900 text-white text-xs font-semibold transition-colors"
                  >
                    Launch Advanced Mix Check
                  </button>
                </div>
              </div>
            </section>

            {/* Five-Tier Consent & Privacy Gate */}
            <ConsentGatePanel consent={consent} onChangeConsent={setConsent} />

            {/* Absolute Product Rules Summary */}
            <section
              aria-label="Ten Absolute Product Rules"
              className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-6"
            >
              <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 dark:text-zinc-400">
                <Shield className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                <span>ARCHITECTURAL INVARIANTS · ENFORCED BY SCHEMA & UNIT TESTS</span>
              </div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
                Ten Non-Negotiable Product & Engineering Rules
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 mt-4 text-xs text-zinc-700 dark:text-zinc-300">
                <div>
                  <strong>Rule 1 (No AI Stem Splitting):</strong> Never use AI stem separation or pseudo-stems. Analyze stems only when the user uploads genuine original stems/multitracks.
                </div>
                <div>
                  <strong>Rule 2 (DSP Source of Truth):</strong> Mathematical DSP measurements are the sole source of objective values. AI must never invent measurements.
                </div>
                <div>
                  <strong>Rule 3 (Technical Integrity):</strong> Artistic preferences may guide creative advice but never hide measurable technical issues.
                </div>
                <div>
                  <strong>Rule 4 (Granular Consent Dimensions):</strong> Audio analysis, external AI transfer of numbers, external AI inspection of audio, raw audio transfer, and model training require separate explicit permissions.
                </div>
                <div>
                  <strong>Rule 5 (Zero Default Training):</strong> Default is `model_training_opt_in: false`. Automatic training on user audio is strictly prohibited.
                </div>
                <div>
                  <strong>Rule 6 (Honest Device Simulation):</strong> Playback-device translation previews are presented strictly as linear filter approximations, not hardware replicas.
                </div>
                <div>
                  <strong>Rule 7 (Honest Streaming Estimates):</strong> Streaming loudness predictions are presented as estimates based on documented playback modes.
                </div>
                <div>
                  <strong>Rule 8 (Objective vs. Stylistic Split):</strong> Objective technical warnings (`objective_technical`) are strictly separated from stylistic notes (`subjective_stylistic`).
                </div>
                <div>
                  <strong>Rule 9 (Lean Phase 1 Infrastructure):</strong> Zero unnecessary databases, auth walls, or cloud queues in Phase 1.
                </div>
                <div>
                  <strong>Rule 10 (Maintainable & Testable):</strong> Deterministic unit tests (`node:test` + `pytest`) validate every contract boundary.
                </div>
              </div>
            </section>
          </div>
        )}

        {route === 'simple' && (
          <div className="space-y-8">
            {reportError && (
              <div className="border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-700/50 p-3 rounded text-xs text-red-900 dark:text-red-200 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
                  <span>{reportError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setReportError(null)}
                  className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 font-mono"
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
              <div className="border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-700/50 p-3 rounded text-xs text-red-900 dark:text-red-200 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
                  <span>{reportError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setReportError(null)}
                  className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 font-mono"
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

      {/* Quiet Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 px-6 py-5 bg-white dark:bg-zinc-950 text-xs text-zinc-500 dark:text-zinc-400">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <span>
            MixLearn Studio · Mathematical DSP Analysis Engine
          </span>
          <span className="font-mono">
            Pure Mathematical DSP · Default Training Opt-In: False
          </span>
        </div>
      </footer>
    </div>
  );
}

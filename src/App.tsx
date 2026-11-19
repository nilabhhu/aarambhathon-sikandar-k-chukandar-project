/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  AnalysisReport,
  ConsentState,
  createDefaultConsentState,
  GenreId,
  MixStage,
} from './contracts/analysisContract';
import { GENRE_LABELS, MIX_STAGE_LABELS } from './contracts/demoFixtures';
import {
  checkBackendHealth,
  analyzeAudioWithDsp,
  validateAudioUploadFile,
} from './services/apiService';
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
  const [checkingBackend, setCheckingBackend] = useState<boolean>(true);

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [audioObjectUrl, setAudioObjectUrl] = useState<string | null>(null);
  const [activeReport, setActiveReport] = useState<AnalysisReport | null>(null);
  const [reportSource, setReportSource] = useState<'backend' | 'local_web_audio' | null>(null);
  const [loadingReport, setLoadingReport] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [engineNotice, setEngineNotice] = useState<string | null>(null);

  // Manage Object URL lifecycle for inline audio auditioning
  useEffect(() => {
    if (!uploadedFile) {
      setAudioObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(uploadedFile);
    setAudioObjectUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [uploadedFile]);

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

  // Live /api/v1/health check on startup (clean empty state; no preloaded dummy audio fixture)
  useEffect(() => {
    let cancelled = false;
    const probeHealth = async () => {
      setCheckingBackend(true);
      const health = await checkBackendHealth();
      if (!cancelled) {
        setBackendOnline(health.online);
        setCheckingBackend(false);
      }
    };
    probeHealth();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAnalyzeAudioFile = async (file: File) => {
    setUploadError(null);
    setEngineNotice(null);

    // Explicit client-side upload guard before sending over network
    const validation = validateAudioUploadFile(file);
    if (!validation.valid) {
      setUploadError(validation.error || 'Invalid audio file.');
      return;
    }

    if (!consent.audio_analysis_consent) {
      setUploadError(
        'Permission 1 (audio_analysis_consent) is currently disabled. Enable it in the Privacy Gate before analyzing audio.'
      );
      return;
    }

    setUploadedFile(file);
    setLoadingReport(true);
    try {
      const fd = new FormData();
      fd.append('audio_file', file);
      fd.append('interface_mode', route === 'simple' ? 'simple' : 'advanced');
      fd.append('genre', genre);
      fd.append('mix_stage', mixStage);
      fd.append('consent_state_json', JSON.stringify(consent));

      const result = await analyzeAudioWithDsp(fd);
      if (result.success && result.report) {
        setActiveReport(result.report);
        setReportSource(result.source);
        setBackendOnline(result.source === 'backend');
        setEngineNotice(result.source === 'local_web_audio' ? result.errorMessage ?? null : null);
      } else {
        setUploadError(result.errorMessage || 'DSP analysis failed. Please verify the file and try again.');
        if (result.source === 'local_web_audio') {
          setBackendOnline(false);
        }
      }
    } catch (err: any) {
      setUploadError(err?.message || 'Unexpected error while analyzing audio file.');
    } finally {
      setLoadingReport(false);
    }
  };

  // Manual live /api/v1/health check
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
            Architecture
          </a>
        </nav>

        {/* Zone 3: Primary Action */}
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

      {/* Secondary Workspace Context & Live Engine Status Toolbar */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/70 px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-600 dark:text-zinc-400">
          <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums">
            <span className="font-semibold text-teal-800 dark:text-teal-400">
              PHASE 2 · REAL DSP ENGINE
            </span>
            <span aria-hidden="true">·</span>
            <span>CONTRACT v{activeReport?.schema_version ?? '2.0.0'}</span>
            <span aria-hidden="true">·</span>
            <span>GENRE: {GENRE_LABELS[genre]}</span>
            <span aria-hidden="true">·</span>
            <span>STAGE: {MIX_STAGE_LABELS[mixStage].title}</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Live Engine Badge strictly reflecting /api/v1/health */}
            <div
              data-testid="live-engine-badge"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono border ${
                backendOnline === true
                  ? 'bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800'
                  : 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700'
              }`}
            >
              <Server className="w-3.5 h-3.5 shrink-0" />
              <span>
                {checkingBackend
                  ? 'Engine: Checking API...'
                  : backendOnline === true
                    ? 'Engine: FastAPI DSP (EBU R128)'
                    : 'Engine: Local Web Audio Fallback'}
              </span>
              <button
                type="button"
                onClick={handleCheckBackendHealth}
                aria-label="Re-check FastAPI backend health"
                title="Re-check FastAPI /api/v1/health status"
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
                  PRIVACY-FIRST AUDIO ENGINEERING EDUCATION · PHASE 2 REAL DSP ENGINE
                </p>
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mt-2 text-balance">
                  Learn mixing and mastering by doing mixing and mastering, and receive meaningful insights through AI.
                </h1>
                <p className="text-base text-zinc-600 dark:text-zinc-400 mt-3 leading-relaxed">
                  Upload your real mix or master to measure objective loudness (LUFS), 4x True Peak (dBTP), dynamics, stereo phase, and frequency balance, listen directly to affected timestamps, and verify every revision across two tailored interfaces sharing one mathematical DSP engine.
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
                    <span>Inspect Architecture & API Matrix</span>
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
                    <li>2. Upload a real audio export to get a 4-metric scorecard and top 3 action cards.</li>
                    <li>3. Follow the learning loop: What happened, Why it matters, Listen, What to try, and Recheck.</li>
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
                    Full engineering diagnostics consuming the identical shared `AudioMixAnalysisReport` v2.0.0 contract with full unit precision and real DSP waveform inspection.
                  </p>
                  <ul className="mt-4 space-y-2 text-xs text-zinc-700 dark:text-zinc-300">
                    <li>1. Complete LUFS, 4x True Peak (dBTP), LRA, crest factor, phase correlation & Welch PSD bands.</li>
                    <li>2. Clickable issue timestamps synced to real decoded DSP waveform buckets.</li>
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
                  <strong>Rule 9 (Ephemeral Stateless Processing):</strong> Uploaded files are processed in ephemeral scratch workspaces and purged immediately after analysis.
                </div>
                <div>
                  <strong>Rule 10 (Maintainable & Testable):</strong> Deterministic unit tests (`node:test` + `pytest`) validate every DSP formula and contract boundary.
                </div>
              </div>
            </section>
          </div>
        )}

        {route === 'simple' && (
          <div className="space-y-8">
            <SimpleMixCheckView
              report={activeReport}
              reportSource={reportSource}
              audioUrl={audioObjectUrl}
              loading={loadingReport}
              uploadError={uploadError}
              engineNotice={engineNotice}
              genre={genre}
              mixStage={mixStage}
              consent={consent}
              onChangeGenre={setGenre}
              onChangeMixStage={setMixStage}
              onSwitchToAdvanced={() => navigateTo('advanced')}
              onAnalyzeAudioFile={handleAnalyzeAudioFile}
              onClearUploadError={() => setUploadError(null)}
            />
            <ConsentGatePanel consent={consent} onChangeConsent={setConsent} compact />
          </div>
        )}

        {route === 'advanced' && (
          <div className="space-y-8">
            <AdvancedMixCheckView
              report={activeReport}
              reportSource={reportSource}
              audioUrl={audioObjectUrl}
              loading={loadingReport}
              uploadError={uploadError}
              engineNotice={engineNotice}
              genre={genre}
              mixStage={mixStage}
              consent={consent}
              onChangeGenre={setGenre}
              onChangeMixStage={setMixStage}
              onAnalyzeAudioFile={handleAnalyzeAudioFile}
              onClearUploadError={() => setUploadError(null)}
            />
            <ConsentGatePanel consent={consent} onChangeConsent={setConsent} compact />
          </div>
        )}

        {route === 'architecture' && <ArchitectureHandoffView report={activeReport} />}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 px-6 py-5 bg-white dark:bg-zinc-950 text-xs text-zinc-500 dark:text-zinc-400">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <span>
            MixLearn Studio · Phase 2 Mathematical DSP Engine & Shared Contract v2.0.0
          </span>
          <span className="font-mono">
            Ephemeral Processing Only · Default Training Opt-In: False
          </span>
        </div>
      </footer>
    </div>
  );
}

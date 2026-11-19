import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  AnalysisReport,
  validateAnalysisReport,
} from '../contracts/analysisContract';
import { TACTILE_TAP } from '../lib/motion';
import {
  CheckCircle2,
  FileCode,
  Terminal,
  Layers,
  Play,
  Server,
  RefreshCw,
} from 'lucide-react';
import { buildApiUrl } from '../services/apiService';

interface ArchitectureHandoffViewProps {
  report: AnalysisReport;
}

interface EndpointProbeResult {
  endpoint: string;
  method: string;
  expectedStatus: number;
  expectedErrorCode?: string;
  actualStatus?: number;
  latencyMs?: number;
  statusText?: string;
  responsePreview?: string;
  success?: boolean;
}

export const ArchitectureHandoffView: React.FC<ArchitectureHandoffViewProps> = ({
  report,
}) => {
  const [showRawJson, setShowRawJson] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probeResults, setProbeResults] = useState<EndpointProbeResult[] | null>(null);

  const validation = validateAnalysisReport(report);

  const runEndpointProbe = async () => {
    setProbing(true);
    const endpointsToProbe: Array<{
      endpoint: string;
      method: string;
      expectedStatus: number;
      expectedErrorCode?: string;
      body?: string;
    }> = [
      { endpoint: '/health', method: 'GET', expectedStatus: 200 },
      { endpoint: '/api/v1/health', method: 'GET', expectedStatus: 200 },
      { endpoint: '/api/v1/capabilities', method: 'GET', expectedStatus: 200 },
      { endpoint: '/api/v1/contracts/schema', method: 'GET', expectedStatus: 200 },
      { endpoint: '/api/v1/demo/report', method: 'GET', expectedStatus: 200 },
      {
        endpoint: '/api/v1/analyze/stems',
        method: 'POST',
        expectedStatus: 422,
        body: JSON.stringify([{ stem_name: 'test_ai.wav', stem_source_type: 'ai_separated' }]),
      },
      {
        endpoint: '/api/v1/interpret/ai',
        method: 'POST',
        expectedStatus: 403,
        expectedErrorCode: 'AI_TRANSFER_CONSENT_REQUIRED',
        body: JSON.stringify({
          allow_ai_interpretation: false,
          allow_direct_audio_inspection: false,
          allow_model_training: false,
          consent_state: {
            audio_analysis_consent: true,
            external_ai_transfer_consent: false,
            ai_numerical_metrics_transfer_consent: false,
            ai_audio_content_inspection_consent: false,
            raw_audio_transfer_consent: false,
            model_training_opt_in: false,
          },
          genre: 'indie_rock',
          mix_stage: 'unmastered_mix',
          interface_mode: 'advanced',
          artist_vision: [],
          report: { measurements: {}, issues: [] },
        }),
      },
    ];

    const results: EndpointProbeResult[] = [];

    for (const item of endpointsToProbe) {
      const startTime = performance.now();
      try {
        const url = buildApiUrl(item.endpoint);
        const res = await fetch(url, {
          method: item.method,
          headers: item.body ? { 'Content-Type': 'application/json' } : undefined,
          body: item.body,
        });
        const duration = Math.round(performance.now() - startTime);
        let preview = '';
        let parsedJson: any = null;
        try {
          parsedJson = await res.json();
          preview = JSON.stringify(parsedJson).slice(0, 90) + '...';
        } catch {
          preview = await res.text();
        }

        const statusMatches = res.status === item.expectedStatus;
        const codeMatches = item.expectedErrorCode
          ? parsedJson?.detail?.error_code === item.expectedErrorCode
          : true;

        results.push({
          endpoint: item.endpoint,
          method: item.method,
          expectedStatus: item.expectedStatus,
          expectedErrorCode: item.expectedErrorCode,
          actualStatus: res.status,
          latencyMs: duration,
          statusText: `${res.status} ${res.statusText}`,
          responsePreview: preview,
          success: statusMatches && codeMatches,
        });
      } catch (err: any) {
        results.push({
          endpoint: item.endpoint,
          method: item.method,
          expectedStatus: item.expectedStatus,
          expectedErrorCode: item.expectedErrorCode,
          statusText: 'Local Web Audio Mode (Backend Offline)',
          responsePreview: err.message,
          success: false,
        });
      }
    }

    setProbeResults(results);
    setProbing(false);
  };

  return (
    <div className="space-y-8">
      {/* Header & Live Contract Verification Status */}
      <section className="studio-elevated squircle-outer p-6 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-5 studio-hairline-b">
          <div>
            <p className="text-xs font-mono text-[var(--accent-primary)] font-medium">
              Shared Engine Contract &amp; Privacy Architecture
            </p>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] mt-1">
              System Architecture &amp; Implementation Contract
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-3xl leading-relaxed">
              Single source of truth for repository layout, shared JSON Schema v2.0.0 data contracts, streaming multitrack stem DSP (zero AI separation), revision delta comparison, and consent-gated Gemini 2.5 Flash AI Mentor with deterministic offline fallback.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-[var(--accent-primary)] bg-[var(--accent-soft)] border border-[var(--border-active-color)] px-3.5 py-2 squircle-inner">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              Contract Validator: {validation.valid ? 'PASS (0 Errors)' : `FAIL (${validation.errors.length})`}
            </span>
          </div>
        </div>

        {/* Repository Structure & Module Responsibilities */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[var(--accent-primary)]" />
              <span>Repository Architecture Layout</span>
            </h2>
            <pre className="mt-3 p-4 squircle-inner studio-surface text-xs font-mono text-[var(--text-primary)] overflow-x-auto leading-relaxed">
{`aarambhathon-sikandar-k-chukandar-project/
├── contracts/
│   ├── analysis_report.schema.json # JSON Schema (v2.0.0)
│   └── fixtures/
│       └── demo_report.json        # Canonical schema fixture
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI DSP, stems, revisions, AI
│   │   ├── dsp/                    # Loudness, spectral, stems, deltas
│   │   └── ai/mentor.py            # Server-side Gemini 2.5 Flash
│   └── tests/                      # Pytest DSP, contract & Phase 5
├── src/
│   ├── audio/
│   │   ├── StudioAudioEngine.ts    # Singleton Web Audio A/B/v2 & Lab
│   │   ├── StudioAudioContext.tsx  # App-level audio persistence
│   │   ├── spectralProfile.ts      # 6-band genre target math
│   │   ├── phase4Logic.ts          # Stem overlap & revision math
│   │   └── phase5MentorLogic.ts    # AI sanitizer & offline mentor
│   ├── contracts/                  # Shared TS contract & tests
│   ├── services/                   # Relative API & Web Audio DSP
│   └── components/                 # Simple, Advanced, AiMentorPanel
└── docs/                           # System & privacy specifications`}
            </pre>
          </div>

          <div className="min-w-0">
            <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Terminal className="w-4 h-4 text-[var(--accent-primary)]" />
              <span>API Endpoint &amp; Engine Capability Matrix</span>
            </h2>
            <div className="mt-3 border border-[var(--border-hairline-color)] squircle-inner overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[var(--bg-surface)] studio-hairline-b font-mono text-[11px] text-[var(--text-secondary)]">
                    <th className="py-2.5 px-3 whitespace-nowrap">Method &amp; Route</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Milestone</th>
                    <th className="py-2.5 px-3">Current Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-hairline-color)] font-mono">
                  <tr>
                    <td className="py-2 px-3 whitespace-nowrap">GET /api/v1/health</td>
                    <td className="py-2 px-3 whitespace-nowrap text-[var(--text-secondary)]">Foundation</td>
                    <td className="py-2 px-3 text-[var(--status-safe)]">200 OK (Operational)</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 whitespace-nowrap">GET /api/v1/capabilities</td>
                    <td className="py-2 px-3 whitespace-nowrap text-[var(--text-secondary)]">Foundation</td>
                    <td className="py-2 px-3 text-[var(--status-safe)]">200 OK (Implemented)</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 whitespace-nowrap">GET /api/v1/contracts/schema</td>
                    <td className="py-2 px-3 whitespace-nowrap text-[var(--text-secondary)]">Foundation</td>
                    <td className="py-2 px-3 text-[var(--status-safe)]">200 OK (v2.0.0)</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 whitespace-nowrap">POST /api/v1/analyze/dsp</td>
                    <td className="py-2 px-3 whitespace-nowrap text-[var(--text-secondary)]">Phase 2</td>
                    <td className="py-2 px-3 text-[var(--status-safe)]">200 OK (FastAPI / Web Audio)</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 whitespace-nowrap">StudioAudioEngine A/B + Lab</td>
                    <td className="py-2 px-3 whitespace-nowrap text-[var(--text-secondary)]">Phase 3</td>
                    <td className="py-2 px-3 text-[var(--status-safe)]">Active (Client Web Audio)</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 whitespace-nowrap">POST /api/v1/analyze/streaming</td>
                    <td className="py-2 px-3 whitespace-nowrap text-[var(--text-secondary)]">Phase 3</td>
                    <td className="py-2 px-3 text-[var(--status-safe)]">200 OK (Spotify/Apple/YT)</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 whitespace-nowrap">POST /api/v1/analyze/stems</td>
                    <td className="py-2 px-3 whitespace-nowrap text-[var(--text-secondary)]">Phase 4</td>
                    <td className="py-2 px-3 text-[var(--status-safe)]">200 OK (Original Stems · 422 Rule 1)</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 whitespace-nowrap">POST /api/v1/compare/revisions</td>
                    <td className="py-2 px-3 whitespace-nowrap text-[var(--text-secondary)]">Phase 4</td>
                    <td className="py-2 px-3 text-[var(--status-safe)]">200 OK (v1 → v2 Deltas Active)</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 whitespace-nowrap">AI Stem Separation</td>
                    <td className="py-2 px-3 whitespace-nowrap text-[var(--text-secondary)]">Rule 1</td>
                    <td className="py-2 px-3 text-[var(--status-alert)]">PROHIBITED_BY_PRODUCT_RULE</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 whitespace-nowrap">POST /api/v1/interpret/ai</td>
                    <td className="py-2 px-3 whitespace-nowrap text-[var(--text-secondary)]">Phase 5</td>
                    <td className="py-2 px-3 text-[var(--status-safe)]">200 OK (Phase 5 · Consent-Gated)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Live Backend Integration Probe */}
      <section className="studio-elevated squircle-outer p-6 md:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 studio-hairline-b">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-[var(--accent-primary)]">
              <Server className="w-4 h-4" />
              <span>Live Relative URL Integration Verifier</span>
            </div>
            <h2 className="text-base font-bold text-[var(--text-primary)] mt-1">
              Backend API Live Endpoint Probe (Relative Routing)
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Verify live communication between the browser client and FastAPI DSP service using relative API URLs.
            </p>
          </div>

          <motion.button
            type="button"
            whileTap={TACTILE_TAP}
            onClick={runEndpointProbe}
            disabled={probing}
            className="inline-flex items-center gap-2 px-4 py-2 squircle-inner bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white text-xs font-semibold disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            {probing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            <span>{probing ? 'Probing Endpoints...' : 'Test Backend Endpoints'}</span>
          </motion.button>
        </div>

        {probeResults && (
          <div className="mt-4 overflow-x-auto squircle-inner border border-[var(--border-hairline-color)]">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="bg-[var(--bg-surface)] studio-hairline-b text-[11px] text-[var(--text-secondary)]">
                  <th className="py-2.5 px-3">Method &amp; Endpoint</th>
                  <th className="py-2.5 px-3">Expected</th>
                  <th className="py-2.5 px-3">Actual Status</th>
                  <th className="py-2.5 px-3">Latency</th>
                  <th className="py-2.5 px-3">Response Snippet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline-color)]">
                {probeResults.map((res, i) => (
                  <tr key={i} className="hover:bg-[var(--bg-surface)]/70 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-[var(--text-primary)] whitespace-nowrap">
                      {res.method} {res.endpoint}
                    </td>
                    <td className="py-2.5 px-3 text-[var(--text-secondary)] whitespace-nowrap">
                      HTTP {res.expectedStatus}
                      {res.expectedErrorCode ? ` (${res.expectedErrorCode})` : ''}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span
                        className={`font-semibold ${
                          res.success ? 'text-[var(--status-safe)]' : 'text-[var(--status-alert)]'
                        }`}
                      >
                        {res.statusText || 'Error'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-[var(--text-secondary)] tabular-nums whitespace-nowrap">
                      {res.latencyMs !== undefined ? `${res.latencyMs} ms` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-[11px] text-[var(--text-secondary)] max-w-xs truncate">
                      {res.responsePreview}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Six-Stage Architectural Roadmap */}
      <section className="studio-elevated squircle-outer p-6 md:p-7">
        <h2 className="text-base font-bold text-[var(--text-primary)]">
          Architectural Delivery Roadmap
        </h2>
        <p className="text-xs text-[var(--text-secondary)] mt-1">
          Every milestone delivers self-contained value while strictly preserving prior contract invariants.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {[
            {
              tag: 'Milestone 1 · Complete',
              title: 'Contracts, Consent & Layouts',
              body: 'Dual-interface UI foundation, 5-tier privacy gate, JSON Schema contract, deterministic unit suites.',
              active: false,
            },
            {
              tag: 'Phase 2 · Complete',
              title: 'Core Mathematical DSP Engine',
              body: 'FastAPI libebur128/SciPy + in-browser Web Audio DSP extracting true peaks, gated LUFS, phase, and PSD bands.',
              active: false,
            },
            {
              tag: 'Phase 3 · Complete',
              title: 'Advanced Workbench & Translation Lab',
              body: 'Sample-locked loudness-matched A/B, 15ms click-free ramps, Phone/Laptop filter lab, 60fps canvas waveform, and 6-band spectral curves.',
              active: false,
            },
            {
              tag: 'Phase 4 · Complete',
              title: 'Original Stems & Revision Delta',
              body: 'Streaming 2–8 original user stem overlap matrix (Rule 1: zero AI separation), optional DAW context drawer, and loudness-matched v1 → v2 revision verification.',
              active: false,
            },
            {
              tag: 'Phase 5 · Active Workbench',
              title: 'Consent-Gated AI Mentor & Artist Vision',
              body: 'Server-side Gemini 2.5 Flash structured coaching strictly grounded in measured DSP evidence IDs with deterministic offline fallback and zero audio bytes by default (Rules 2–5).',
              active: true,
            },
            {
              tag: 'Phase 6 · Scheduled',
              title: 'End-to-End QA & Production Hardening',
              body: 'Ephemeral cleanup audits, WCAG AA verification, and cross-browser codec resilience.',
              active: false,
            },
          ].map((item) => (
            <div
              key={item.title}
              className={`squircle-inner p-4 border ${
                item.active
                  ? 'border-[var(--border-active-color)] bg-[var(--accent-soft)]'
                  : 'border-[var(--border-hairline-color)] bg-[var(--bg-surface)]'
              }`}
            >
              <div
                className={`text-[11px] font-mono font-semibold ${
                  item.active ? 'text-[var(--accent-primary)]' : 'text-[var(--text-secondary)]'
                }`}
              >
                {item.tag}
              </div>
              <h3 className="text-sm font-bold text-[var(--text-primary)] mt-1">
                {item.title}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Contract Inspector Toggle */}
      <section className="studio-elevated squircle-outer p-6 md:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-[var(--text-primary)]">
              Live Contract Payload Inspector
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Inspect the exact JSON data structure powering both Simple and Advanced Mix Check.
            </p>
          </div>
          <motion.button
            type="button"
            whileTap={TACTILE_TAP}
            onClick={() => setShowRawJson(!showRawJson)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 squircle-inner border border-[var(--border-hairline-color)] bg-[var(--bg-surface)] text-xs font-mono text-[var(--text-primary)] hover:border-[var(--border-active-color)] transition-colors whitespace-nowrap cursor-pointer"
          >
            <FileCode className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
            <span>{showRawJson ? 'Hide Raw JSON Payload' : 'View Full JSON Payload'}</span>
          </motion.button>
        </div>

        {showRawJson && (
          <div className="mt-4">
            <pre className="p-4 squircle-inner bg-[#0D1211] text-[#E6ECEA] text-xs font-mono overflow-x-auto max-h-96 border border-[var(--border-hairline-color)]">
              {JSON.stringify(report, null, 2)}
            </pre>
          </div>
        )}
      </section>
    </div>
  );
};

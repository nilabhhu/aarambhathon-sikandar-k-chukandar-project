import React, { useState } from 'react';
import {
  AnalysisReport,
  validateAnalysisReport,
} from '../contracts/analysisContract';
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
    const endpointsToProbe = [
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
        try {
          const json = await res.json();
          preview = JSON.stringify(json).slice(0, 90) + '...';
        } catch {
          preview = await res.text();
        }

        results.push({
          endpoint: item.endpoint,
          method: item.method,
          expectedStatus: item.expectedStatus,
          actualStatus: res.status,
          latencyMs: duration,
          statusText: `${res.status} ${res.statusText}`,
          responsePreview: preview,
          success: res.status === item.expectedStatus,
        });
      } catch (err: any) {
        results.push({
          endpoint: item.endpoint,
          method: item.method,
          expectedStatus: item.expectedStatus,
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
      <section className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <p className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
              PHASE 4 · STEMS, REVISION DELTAS &amp; SHARED CONTRACT SPECIFICATION
            </p>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">
              System Architecture &amp; Implementation Contract
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1 max-w-3xl">
              Single source of truth for repository layout, shared JSON Schema v2.0.0 data contracts, streaming multitrack stem DSP (zero AI separation), revision delta comparison, and 5-tier consent boundaries.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-[#3A7269] dark:text-teal-400 bg-[#3A7269]/10 dark:bg-teal-950/50 border border-[#3A7269]/25 dark:border-teal-800 px-3 py-2 rounded-md">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              Contract Validator: {validation.valid ? 'PASS (0 Errors)' : `FAIL (${validation.errors.length})`}
            </span>
          </div>
        </div>

        {/* Repository Structure & Module Responsibilities */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#3A7269] dark:text-teal-400" />
              <span>Repository Architecture Layout</span>
            </h2>
            <pre className="mt-3 p-4 rounded-lg bg-[#FAFAFA] dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-800 dark:text-zinc-200 overflow-x-auto leading-relaxed">
{`aarambhathon-sikandar-k-chukandar-project/
├── contracts/
│   ├── analysis_report.schema.json  # JSON Schema (v2.0.0)
│   └── fixtures/
│       └── demo_report.json         # Canonical schema fixture
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI DSP, stems & revision routes
│   │   └── dsp/                     # Loudness, spectral, stems, revisions
│   └── tests/                       # Pytest DSP & contract suite
├── src/
│   ├── audio/
│   │   ├── StudioAudioEngine.ts     # Singleton Web Audio A/B/v2 & Lab
│   │   ├── StudioAudioContext.tsx   # App-level audio persistence
│   │   ├── spectralProfile.ts       # 6-band genre target math
│   │   └── phase4Logic.ts           # Stem overlap & revision delta math
│   ├── contracts/                   # Shared TS contract & tests
│   ├── services/                    # Relative API & Web Audio DSP
│   └── components/                  # Simple, Advanced, Stems & Revisions
└── docs/                            # System & privacy specifications`}
            </pre>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-[#3A7269] dark:text-teal-400" />
              <span>API Endpoint &amp; Engine Capability Matrix</span>
            </h2>
            <div className="mt-3 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#FAFAFA] dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                    <th className="py-2 px-3 whitespace-nowrap">Method &amp; Route</th>
                    <th className="py-2 px-3 whitespace-nowrap">Milestone</th>
                    <th className="py-2 px-3">Current Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 font-mono">
                  <tr>
                    <td className="py-2 px-3 whitespace-nowrap">GET /api/v1/health</td>
                    <td className="py-2 px-3 whitespace-nowrap">Foundation</td>
                    <td className="py-2 px-3 text-[#3A7269] dark:text-teal-400">200 OK (Operational)</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 whitespace-nowrap">GET /api/v1/capabilities</td>
                    <td className="py-2 px-3 whitespace-nowrap">Foundation</td>
                    <td className="py-2 px-3 text-[#3A7269] dark:text-teal-400">200 OK (Implemented)</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 whitespace-nowrap">GET /api/v1/contracts/schema</td>
                    <td className="py-2 px-3 whitespace-nowrap">Foundation</td>
                    <td className="py-2 px-3 text-[#3A7269] dark:text-teal-400">200 OK (v2.0.0)</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 whitespace-nowrap">POST /api/v1/analyze/dsp</td>
                    <td className="py-2 px-3 whitespace-nowrap">Phase 2</td>
                    <td className="py-2 px-3 text-[#3A7269] dark:text-teal-400">200 OK (FastAPI / Web Audio)</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 whitespace-nowrap">StudioAudioEngine A/B + Lab</td>
                    <td className="py-2 px-3 whitespace-nowrap">Phase 3</td>
                    <td className="py-2 px-3 text-[#3A7269] dark:text-teal-400">Active (Client Web Audio)</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 whitespace-nowrap">POST /api/v1/analyze/streaming</td>
                    <td className="py-2 px-3 whitespace-nowrap">Phase 3</td>
                    <td className="py-2 px-3 text-[#3A7269] dark:text-teal-400">200 OK (Spotify/Apple/YT)</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 whitespace-nowrap">POST /api/v1/analyze/stems</td>
                    <td className="py-2 px-3 whitespace-nowrap">Phase 4</td>
                    <td className="py-2 px-3 text-[#3A7269] dark:text-teal-400">200 OK (Original Stems · 422 Rule 1)</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 whitespace-nowrap">POST /api/v1/compare/revisions</td>
                    <td className="py-2 px-3 whitespace-nowrap">Phase 4</td>
                    <td className="py-2 px-3 text-[#3A7269] dark:text-teal-400">200 OK (v1 → v2 Deltas Active)</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 whitespace-nowrap">AI Stem Separation</td>
                    <td className="py-2 px-3 whitespace-nowrap">Rule 1</td>
                    <td className="py-2 px-3 text-rose-700 dark:text-rose-400">PROHIBITED_BY_PRODUCT_RULE</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 whitespace-nowrap">POST /api/v1/interpret/ai</td>
                    <td className="py-2 px-3 whitespace-nowrap">Phase 5</td>
                    <td className="py-2 px-3 text-zinc-500">403 Consent / 501 Scheduled</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Live Backend Integration Probe */}
      <section className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 dark:text-zinc-400">
              <Server className="w-4 h-4 text-[#3A7269] dark:text-teal-400" />
              <span>LIVE RELATIVE URL INTEGRATION VERIFIER</span>
            </div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
              Backend API Live Endpoint Probe (Relative Routing)
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
              Verify live communication between the browser client and FastAPI DSP service using relative API URLs.
            </p>
          </div>

          <button
            type="button"
            onClick={runEndpointProbe}
            disabled={probing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#3A7269] hover:bg-[#2F5E56] text-white text-xs font-medium disabled:opacity-50 transition-colors"
          >
            {probing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            <span>{probing ? 'Probing Endpoints...' : 'Test Backend Endpoints'}</span>
          </button>
        </div>

        {probeResults && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-500 dark:text-zinc-400 uppercase">
                  <th className="py-2 px-3">Method &amp; Endpoint</th>
                  <th className="py-2 px-3">Expected</th>
                  <th className="py-2 px-3">Actual Status</th>
                  <th className="py-2 px-3">Latency</th>
                  <th className="py-2 px-3">Response Snippet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {probeResults.map((res, i) => (
                  <tr key={i} className="hover:bg-[#FAFAFA] dark:hover:bg-zinc-800/50">
                    <td className="py-2.5 px-3 font-semibold text-zinc-900 dark:text-zinc-100">
                      {res.method} {res.endpoint}
                    </td>
                    <td className="py-2.5 px-3 text-zinc-500">HTTP {res.expectedStatus}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`font-semibold ${
                          res.success
                            ? 'text-[#3A7269] dark:text-teal-400'
                            : 'text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        {res.statusText || 'Error'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-zinc-500 tabular-nums">
                      {res.latencyMs !== undefined ? `${res.latencyMs} ms` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-[11px] text-zinc-600 dark:text-zinc-400 max-w-xs truncate">
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
      <section className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-6">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Architectural Delivery Roadmap
        </h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
          Every milestone delivers self-contained value while strictly preserving prior contract invariants.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 bg-[#FAFAFA] dark:bg-zinc-950/50">
            <div className="text-[11px] font-mono font-semibold text-[#3A7269] dark:text-teal-400">
              MILESTONE 1 · COMPLETE
            </div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
              Contracts, Consent &amp; Layouts
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5">
              Dual-interface UI foundation, 5-tier privacy gate, JSON Schema contract, deterministic unit suites.
            </p>
          </div>

          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 bg-[#FAFAFA] dark:bg-zinc-950/50">
            <div className="text-[11px] font-mono font-semibold text-[#3A7269] dark:text-teal-400">
              PHASE 2 · COMPLETE
            </div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
              Core Mathematical DSP Engine
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5">
              FastAPI libebur128/SciPy + in-browser Web Audio DSP extracting true peaks, gated LUFS, phase, and PSD bands.
            </p>
          </div>

          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 bg-[#FAFAFA] dark:bg-zinc-950/50">
            <div className="text-[11px] font-mono font-semibold text-[#3A7269] dark:text-teal-400">
              PHASE 3 · COMPLETE
            </div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
              Advanced Workbench &amp; Translation Lab
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5">
              Sample-locked loudness-matched A/B, 15ms click-free ramps, Phone/Laptop filter lab, 60fps canvas waveform, and 6-band spectral curves.
            </p>
          </div>

          <div className="border border-[#3A7269] dark:border-teal-600 bg-[#3A7269]/[0.06] dark:bg-teal-950/30 rounded-lg p-4">
            <div className="text-[11px] font-mono font-semibold text-[#3A7269] dark:text-teal-400">
              PHASE 4 · ACTIVE WORKBENCH
            </div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
              Original Stems &amp; Revision Delta
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5">
              Streaming 2–8 original user stem overlap matrix (Rule 1: zero AI separation), optional DAW context drawer, and loudness-matched v1 → v2 revision verification.
            </p>
          </div>

          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
            <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
              PHASE 5 · SCHEDULED
            </div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
              Consent-Gated AI Coaching
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5">
              Opt-in educational explanation strictly grounded in deterministic mathematical DSP measurements (Rules 2, 4 &amp; 5).
            </p>
          </div>

          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
            <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
              PHASE 6 · SCHEDULED
            </div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
              End-to-End QA &amp; Production Hardening
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5">
              Ephemeral cleanup audits, WCAG AA verification, and cross-browser codec resilience.
            </p>
          </div>
        </div>
      </section>

      {/* Contract Inspector Toggle */}
      <section className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Live Contract Payload Inspector
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
              Inspect the exact JSON data structure powering both Simple and Advanced Mix Check.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowRawJson(!showRawJson)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-xs font-mono text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap"
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>{showRawJson ? 'Hide Raw JSON Payload' : 'View Full JSON Payload'}</span>
          </button>
        </div>

        {showRawJson && (
          <div className="mt-4">
            <pre className="p-4 rounded-lg bg-zinc-950 text-zinc-200 text-xs font-mono overflow-x-auto max-h-96 border border-zinc-800">
              {JSON.stringify(report, null, 2)}
            </pre>
          </div>
        )}
      </section>
    </div>
  );
};

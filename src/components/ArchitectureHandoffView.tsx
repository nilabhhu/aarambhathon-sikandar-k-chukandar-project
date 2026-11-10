import React, { useState } from 'react';
import {
  AnalysisReport,
  validatePhase1AnalysisReport,
} from '../contracts/analysisContract';
import {
  CheckCircle2,
  FileCode,
  Terminal,
  Layers,
  Activity,
  Play,
  AlertTriangle,
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

  const validation = validatePhase1AnalysisReport(report);

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
      {
        endpoint: '/api/v1/analyze/dsp',
        method: 'POST',
        expectedStatus: 501,
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
          statusText: 'Connection Failed (Backend Offline?)',
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
      <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <p className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
              PHASE 1 DELIVERABLES 01–12 · ARCHITECTURAL HANDOFF SPECIFICATION
            </p>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
              Phase 1 Architecture & Implementation Contract
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1 max-w-3xl">
              Single source of truth for repository layout, shared JSON Schema data contracts, FastAPI/Next.js endpoints, 5-tier consent model, and 6-phase dependency boundaries.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-teal-800 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800 px-3 py-2 rounded-md">
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
              <Layers className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              <span>Agreed Repository Layout</span>
            </h2>
            <pre className="mt-3 p-4 rounded-md bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-800 dark:text-zinc-200 overflow-x-auto leading-relaxed">
{`aarambhathon-sikandar-k-chukandar-project/
├── contracts/
│   ├── analysis_report.schema.json  # JSON Schema (2020-12)
│   └── fixtures/
│       └── demo_report.json         # Canonical fixture
├── backend/
│   ├── app/
│   │   └── main.py                  # FastAPI + 501 boundaries
│   ├── tests/
│   │   └── test_phase1_contracts.py # Pytest Rule 1/4/5 suite
│   └── requirements.txt             # Locked Python packages
├── frontend/ (and root src/)
│   ├── contracts/
│   │   ├── analysisContract.ts      # Shared TS contract
│   │   ├── demoFixtures.ts          # Labeled demo fixtures
│   │   ├── analysisContract.test.ts # node:test unit suite
│   │   └── backendIntegration.test.ts # API integration tests
│   ├── services/
│   │   └── apiService.ts            # Relative API routing client
│   └── components/                  # Simple & Advanced views
├── docs/
│   ├── architecture.md              # Full system architecture
│   ├── product-spec.md              # Product specification
│   ├── design-system.md             # UI tokens & typography
│   ├── privacy-model.md             # Consent & privacy rules
│   ├── api-contracts.md             # Endpoint contracts
│   ├── phase-gates.md               # 6-phase gate criteria
│   └── PHASE_1_ARCHITECTURE_HANDOFF.md
├── scripts/
│   ├── validate_contracts.sh        # Bash validation runner
│   ├── validate_contracts.ps1       # Windows PowerShell runner
│   └── validate_schema.js           # Cross-platform verifier
└── .github/workflows/
    └── ci.yml                       # GitHub Actions CI`}
            </pre>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              <span>API Endpoint Matrix (Phase 1 vs. Future Phases)</span>
            </h2>
            <div className="mt-3 border border-zinc-200 dark:border-zinc-800 rounded-md overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                    <th className="py-2 px-3">Method & Route</th>
                    <th className="py-2 px-3">Phase</th>
                    <th className="py-2 px-3">Phase 1 Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 font-mono">
                  <tr>
                    <td className="py-2 px-3">GET /health</td>
                    <td className="py-2 px-3">Phase 1</td>
                    <td className="py-2 px-3 text-teal-800 dark:text-teal-400">200 OK (Operational)</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3">GET /api/v1/health</td>
                    <td className="py-2 px-3">Phase 1</td>
                    <td className="py-2 px-3 text-teal-800 dark:text-teal-400">200 OK (Implemented)</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3">GET /api/v1/capabilities</td>
                    <td className="py-2 px-3">Phase 1</td>
                    <td className="py-2 px-3 text-teal-800 dark:text-teal-400">200 OK (Implemented)</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3">GET /api/v1/contracts/schema</td>
                    <td className="py-2 px-3">Phase 1</td>
                    <td className="py-2 px-3 text-teal-800 dark:text-teal-400">200 OK (Implemented)</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3">GET /api/v1/demo/report</td>
                    <td className="py-2 px-3">Phase 1</td>
                    <td className="py-2 px-3 text-teal-800 dark:text-teal-400">200 OK (Demo Report)</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3">POST /api/v1/analyze/demo</td>
                    <td className="py-2 px-3">Phase 1</td>
                    <td className="py-2 px-3 text-teal-800 dark:text-teal-400">200 OK (Demo Fixture)</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3">POST /api/v1/analyze/dsp</td>
                    <td className="py-2 px-3">Phase 2</td>
                    <td className="py-2 px-3 text-zinc-500">501 NOT_IMPLEMENTED</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3">POST /api/v1/analyze/reference</td>
                    <td className="py-2 px-3">Phase 3</td>
                    <td className="py-2 px-3 text-zinc-500">501 NOT_IMPLEMENTED</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3">POST /api/v1/analyze/streaming</td>
                    <td className="py-2 px-3">Phase 3</td>
                    <td className="py-2 px-3 text-zinc-500">501 NOT_IMPLEMENTED</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3">POST /api/v1/analyze/stems</td>
                    <td className="py-2 px-3">Phase 4</td>
                    <td className="py-2 px-3 text-zinc-500">422 Rule 1 / 501 Phase 4</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3">POST /api/v1/analyze/revisions</td>
                    <td className="py-2 px-3">Phase 5</td>
                    <td className="py-2 px-3 text-zinc-500">501 NOT_IMPLEMENTED</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3">POST /api/v1/interpret/ai</td>
                    <td className="py-2 px-3">Phase 5</td>
                    <td className="py-2 px-3 text-zinc-500">403 Consent / 501 Phase 5</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Live Backend Integration Probe */}
      <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 dark:text-zinc-400">
              <Server className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              <span>LIVE RELATIVE URL INTEGRATION VERIFIER</span>
            </div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
              Backend API Live Endpoint Probe (Vite Proxy / Relative Routing)
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
              Verify live communication between browser client and FastAPI backend using relative URLs proxied through Vite.
            </p>
          </div>

          <button
            type="button"
            onClick={runEndpointProbe}
            disabled={probing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded bg-teal-800 hover:bg-teal-900 text-white text-xs font-medium disabled:opacity-50 transition-colors"
          >
            {probing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            <span>{probing ? 'Probing Endpoints...' : 'Test All Backend Endpoints'}</span>
          </button>
        </div>

        {probeResults && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-500 dark:text-zinc-400 uppercase">
                  <th className="py-2 px-3">Method & Endpoint</th>
                  <th className="py-2 px-3">Expected</th>
                  <th className="py-2 px-3">Actual Status</th>
                  <th className="py-2 px-3">Latency</th>
                  <th className="py-2 px-3">Response Snippet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {probeResults.map((res, i) => (
                  <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <td className="py-2.5 px-3 font-semibold text-zinc-900 dark:text-zinc-100">
                      {res.method} {res.endpoint}
                    </td>
                    <td className="py-2.5 px-3 text-zinc-500">
                      HTTP {res.expectedStatus}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                          res.success
                            ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-400'
                            : 'bg-red-50 text-red-800 dark:bg-red-950/60 dark:text-red-400'
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

      {/* Six-Phase Dependency Roadmap */}
      <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-6">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Six-Phase Architectural Dependency Map
        </h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
          Every phase delivers self-contained value while strictly preserving prior contract invariants.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          <div className="border border-teal-700/40 bg-teal-50/40 dark:bg-teal-950/30 rounded-md p-4">
            <div className="text-[11px] font-mono font-semibold text-teal-800 dark:text-teal-400">
              PHASE 1 · COMPLETE
            </div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
              Contracts, Consent & Layouts
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5">
              Dual-interface UI foundation, 5-tier privacy gate, JSON Schema v1.0.0, demonstration fixtures, CI pipeline.
            </p>
          </div>

          <div className="border border-zinc-200 dark:border-zinc-800 rounded-md p-4">
            <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
              PHASE 2 · DEPENDS ON PHASE 1
            </div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
              Core Mathematical DSP Engine
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5">
              FFmpeg/libebur128, pyloudnorm, SciPy, and soundfile replacing demonstration data with genuine signal calculations.
            </p>
          </div>

          <div className="border border-zinc-200 dark:border-zinc-800 rounded-md p-4">
            <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
              PHASE 3 · DEPENDS ON PHASE 2
            </div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
              Reference Matching & Streaming
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5">
              Loudness-matched reference comparison and documented streaming-service playback gain estimates (Spotify, Apple).
            </p>
          </div>

          <div className="border border-zinc-200 dark:border-zinc-800 rounded-md p-4">
            <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
              PHASE 4 · DEPENDS ON PHASE 2
            </div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
              Stems & Device Translation
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5">
              Original user multitrack masking analysis (Rule 1: no AI separation) and linear-filter playback approximations.
            </p>
          </div>

          <div className="border border-zinc-200 dark:border-zinc-800 rounded-md p-4">
            <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
              PHASE 5 · DEPENDS ON PHASES 2–4
            </div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
              Revision Delta & Opt-in AI
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5">
              Before/after revision delta calculation and consent-gated Gemini API educational interpretation on DSP numbers.
            </p>
          </div>

          <div className="border border-zinc-200 dark:border-zinc-800 rounded-md p-4">
            <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
              PHASE 6 · DEPENDS ON ALL
            </div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
              End-to-End QA & Polish
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5">
              Ephemeral storage cleanup verification, WCAG AA compliance audit, cross-browser audio decoding verification.
            </p>
          </div>
        </div>
      </section>

      {/* Contract Inspector Toggle */}
      <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-6">
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-xs font-mono text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap"
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>{showRawJson ? 'Hide Raw JSON Payload' : 'View Full JSON Payload'}</span>
          </button>
        </div>

        {showRawJson && (
          <div className="mt-4">
            <pre className="p-4 rounded-md bg-zinc-950 text-zinc-200 text-xs font-mono overflow-x-auto max-h-96 border border-zinc-800">
              {JSON.stringify(report, null, 2)}
            </pre>
          </div>
        )}
      </section>
    </div>
  );
};

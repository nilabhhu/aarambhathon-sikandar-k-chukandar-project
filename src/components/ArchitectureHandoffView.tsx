import React, { useState } from 'react';
import {
  AnalysisReport,
  validatePhase1AnalysisReport,
} from '../contracts/analysisContract';
import { CheckCircle2, FileCode, Terminal, Layers } from 'lucide-react';

interface ArchitectureHandoffViewProps {
  report: AnalysisReport;
}

export const ArchitectureHandoffView: React.FC<ArchitectureHandoffViewProps> = ({
  report,
}) => {
  const [showRawJson, setShowRawJson] = useState(false);
  const validation = validatePhase1AnalysisReport(report);

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
              Single source of truth for repository layout, shared JSON Schema data contracts, FastAPI/Next.js endpoints, 3-tier consent model, and 6-phase dependency boundaries.
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
├── backend/
│   ├── app/
│   │   └── main.py                  # FastAPI + 501 boundaries
│   └── tests/
│       └── test_phase1_contracts.py # Pytest Rule 1/4/5 suite
├── frontend/ (and root src/)
│   ├── contracts/
│   │   ├── analysisContract.ts      # Shared TS contract
│   │   ├── demoFixtures.ts          # Labeled demo fixtures
│   │   └── analysisContract.test.ts # node:test unit suite
│   └── components/                  # Simple & Advanced views
├── docs/
│   └── PHASE_1_ARCHITECTURE_HANDOFF.md
├── scripts/
│   └── validate_contracts.sh        # Schema & test runner
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

      {/* Six-Phase Dependency Roadmap */}
      <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-6">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Six-Phase Architectural Dependency Map
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          {[
            {
              phase: 'Phase 1 (Current)',
              title: 'Architecture, Contracts & UI Foundation',
              status: 'ACTIVE & VERIFIED',
              details:
                'JSON Schema 2020-12 contract, 3-tier Consent Gate, Simple & Advanced route layouts, visibly labeled demonstration fixtures, CI & unit tests.',
            },
            {
              phase: 'Phase 2',
              title: 'Core Mathematical DSP Engine',
              status: 'DEPENDS ON PHASE 1',
              details:
                'FFmpeg/libebur128, pyloudnorm, NumPy, SciPy, and soundfile computing real LUFS, True Peak (4x ISP), LRA, crest factor, phase correlation, and Welch PSD.',
            },
            {
              phase: 'Phase 3',
              title: 'Reference Matching & Streaming Estimates',
              status: 'DEPENDS ON PHASE 2',
              details:
                'LUFS-matched reference track delta comparisons and documented streaming-platform playback normalization estimates (Rule 7 compliant).',
            },
            {
              phase: 'Phase 4',
              title: 'Original Stems & Translation Filters',
              status: 'DEPENDS ON PHASE 2',
              details:
                'Genuine user-uploaded stem/multitrack frequency masking & phase conflict detector (Rule 1 blocks AI stem splitting) + Web Audio device approximations (Rule 6).',
            },
            {
              phase: 'Phase 5',
              title: 'Mix Revisions & Consent-Gated AI Coaching',
              status: 'DEPENDS ON PHASES 2–4',
              details:
                'Before/after revision verification delta engine and opt-in Gemini API coaching strictly grounded in deterministic DSP measurements (Rules 2 & 4).',
            },
            {
              phase: 'Phase 6',
              title: 'End-to-End Hardening & Release',
              status: 'DEPENDS ON PHASES 1–5',
              details:
                'Ephemeral file purge verification, WCAG AA keyboard & screen-reader audit, load testing, and hackathon pitch readiness.',
            },
          ].map((item) => (
            <div
              key={item.phase}
              className="border border-zinc-200 dark:border-zinc-800 rounded-md p-4 bg-zinc-50/50 dark:bg-zinc-950/60"
            >
              <div className="flex items-center justify-between text-xs font-mono text-zinc-500 dark:text-zinc-400">
                <span>{item.phase}</span>
                <span className="text-teal-800 dark:text-teal-400">{item.status}</span>
              </div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
                {item.title}
              </h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5 leading-relaxed">
                {item.details}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Live Contract Payload Inspector */}
      <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <FileCode className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              <span>Live Shared Contract Payload Inspector (`AudioMixAnalysisReport`)</span>
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
              Inspect the exact JSON payload shared between Simple Mix Check and Advanced Mix Check.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowRawJson((s) => !s)}
            className="px-3.5 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 whitespace-nowrap shrink-0"
          >
            {showRawJson ? 'Hide Raw JSON Payload' : 'View Raw JSON Payload'}
          </button>
        </div>

        {showRawJson && (
          <pre className="mt-4 p-4 rounded-md bg-zinc-950 text-zinc-100 text-xs font-mono overflow-x-auto max-h-96">
            {JSON.stringify(report, null, 2)}
          </pre>
        )}
      </section>
    </div>
  );
};

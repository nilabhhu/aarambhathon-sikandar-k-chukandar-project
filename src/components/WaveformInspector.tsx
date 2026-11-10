import React, { useMemo } from 'react';
import { AnalysisIssue } from '../contracts/analysisContract';
import { Eye, Info } from 'lucide-react';

interface WaveformInspectorProps {
  durationSeconds: number;
  issues: AnalysisIssue[];
  activeIssueId: string | null;
  activeTimestamp: { start_sec: number; end_sec: number; label: string } | null;
  onSelectTimestamp: (
    issueId: string,
    ts: { start_sec: number; end_sec: number; label: string }
  ) => void;
  monoMode: boolean;
  onToggleMono: () => void;
  isUnmastered: boolean;
}

export function formatTimecode(sec: number): string {
  const mins = Math.floor(sec / 60);
  const rem = (sec % 60).toFixed(1);
  const paddedMins = String(mins).padStart(2, '0');
  const paddedSecs = Number(rem) < 10 ? `0${rem}` : rem;
  return `${paddedMins}:${paddedSecs}`;
}

export const WaveformInspector: React.FC<WaveformInspectorProps> = ({
  durationSeconds,
  issues,
  activeIssueId,
  activeTimestamp,
  onSelectTimestamp,
  monoMode,
  onToggleMono,
  isUnmastered,
}) => {
  // Deterministic synthetic envelope bars illustrating Verse/Chorus/Bridge structural envelope for Phase 1 verification
  const bars = useMemo(() => {
    const count = 96;
    const result: { index: number; timeSec: number; peakAmplitude: number; rmsAmplitude: number; clipped: boolean }[] = [];
    for (let i = 0; i < count; i++) {
      const timeSec = (i / count) * durationSeconds;
      const inChorus1 = timeSec >= 42.5 && timeSec <= 58.0;
      const inBridge = timeSec >= 108.0 && timeSec <= 124.5;
      const inChorus2 = timeSec >= 134.0 && timeSec <= 152.5;

      const deterministicWave = Math.abs(Math.sin(i * 0.63) * 0.22 + Math.cos(i * 1.17) * 0.14);
      let basePeak = 0.52 + deterministicWave;
      if (inChorus1 || inChorus2) {
        basePeak = isUnmastered ? 0.94 : 0.99;
      } else if (inBridge) {
        basePeak = monoMode ? 0.44 : 0.68; // Illustrates visual mono fold-down cancellation dip in bridge
      }

      const peakAmplitude = Math.min(1.0, basePeak);
      const rmsAmplitude = peakAmplitude * (inChorus1 || inChorus2 ? 0.78 : 0.62);
      const clipped = (inChorus1 || inChorus2) && i % 4 === 0;

      result.push({
        index: i,
        timeSec,
        peakAmplitude,
        rmsAmplitude,
        clipped,
      });
    }
    return result;
  }, [durationSeconds, isUnmastered, monoMode]);

  return (
    <section
      aria-label="Synthetic Waveform Profile and Issue Timestamp Selector"
      className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-5 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 font-mono tabular-nums">
            <span className="font-semibold text-teal-800 dark:text-teal-400">
              SYNTHETIC DEMO ENVELOPE (PHASE 1 VISUALIZATION)
            </span>
            <span aria-hidden="true">·</span>
            <span>DURATION {formatTimecode(durationSeconds)}</span>
            <span aria-hidden="true">·</span>
            <span>SIMULATED PEAK / RMS</span>
          </div>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
            Synthetic Time-Domain Profile & Clickable Issue Regions
          </h3>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleMono}
            aria-pressed={monoMode}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
              monoMode
                ? 'bg-teal-800 text-white border-teal-800 dark:bg-teal-600 dark:border-teal-600'
                : 'bg-zinc-50 text-zinc-800 border-zinc-300 hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>
              {monoMode
                ? 'Visual Simulation: Mono Sum Curve'
                : 'Visual Simulation: Stereo Curve'}
            </span>
          </button>
        </div>
      </div>

      {/* Synthetic Visualization Disclosure Notice */}
      <div className="flex items-start gap-2 p-2.5 rounded bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-600 dark:text-zinc-400">
        <Info className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
        <span>
          <strong>Phase 1 Visual Simulation Only:</strong> This waveform is a mathematically generated synthetic envelope illustrating song structure and region highlighting. No real audio playback engine or live audio decoding is active in Phase 1; genuine audio playback, real stereo auditioning, and real waveform extraction belong to Phase 2.
        </span>
      </div>

      {/* SVG Synthetic Waveform Envelope */}
      <div className="relative bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-md p-4">
        <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400 mb-2">
          <span>0.0 dBFS Reference Ceiling</span>
          <span>
            {activeTimestamp
              ? `Highlighted Region: ${activeTimestamp.label} (${formatTimecode(activeTimestamp.start_sec)} – ${formatTimecode(activeTimestamp.end_sec)})`
              : 'Click any timestamp marker below to highlight region'}
          </span>
          <span>
            {monoMode
              ? 'Simulated Visual Cancellation on Bridge (01:48–02:04)'
              : 'Simulated Stereo Envelope'}
          </span>
        </div>

        <svg
          viewBox="0 0 960 140"
          className="w-full h-36 overflow-visible"
          role="img"
          aria-label="Synthetic audio waveform envelope showing simulated peak and RMS amplitude across track duration"
        >
          {/* Horizontal dBFS reference gridlines */}
          <line x1="0" y1="10" x2="960" y2="10" stroke="currentColor" className="text-red-300 dark:text-red-900/60" strokeDasharray="3 3" strokeWidth="1" />
          <line x1="0" y1="70" x2="960" y2="70" stroke="currentColor" className="text-zinc-300 dark:text-zinc-800" strokeWidth="1" />
          <line x1="0" y1="130" x2="960" y2="130" stroke="currentColor" className="text-red-300 dark:text-red-900/60" strokeDasharray="3 3" strokeWidth="1" />

          {/* Highlighted active issue timestamp window */}
          {activeTimestamp && (
            <rect
              x={(activeTimestamp.start_sec / durationSeconds) * 960}
              y="0"
              width={Math.max(
                4,
                ((activeTimestamp.end_sec - activeTimestamp.start_sec) / durationSeconds) * 960
              )}
              height="140"
              className="fill-teal-700/15 dark:fill-teal-400/20 stroke-teal-700/50 dark:stroke-teal-400/60"
              strokeWidth="1.5"
            />
          )}

          {/* Waveform vertical bars */}
          {bars.map((bar) => {
            const x = (bar.index / bars.length) * 960;
            const barWidth = 960 / bars.length - 2;
            const peakHeight = bar.peakAmplitude * 56;
            const rmsHeight = bar.rmsAmplitude * 56;

            const inActiveRegion =
              activeTimestamp &&
              bar.timeSec >= activeTimestamp.start_sec &&
              bar.timeSec <= activeTimestamp.end_sec;

            return (
              <g key={bar.index} transform={`translate(${x}, 70)`}>
                {/* Peak envelope bar */}
                <rect
                  x="0"
                  y={-peakHeight}
                  width={barWidth}
                  height={peakHeight * 2}
                  rx="1"
                  className={
                    bar.clipped
                      ? 'fill-red-700/80 dark:fill-red-500/80'
                      : inActiveRegion
                        ? 'fill-teal-800 dark:fill-teal-300'
                        : 'fill-zinc-300 dark:fill-zinc-700'
                  }
                />
                {/* RMS interior core bar */}
                <rect
                  x="0"
                  y={-rmsHeight}
                  width={barWidth}
                  height={rmsHeight * 2}
                  rx="1"
                  className={
                    inActiveRegion
                      ? 'fill-teal-950 dark:fill-teal-100'
                      : 'fill-zinc-500 dark:fill-zinc-500'
                  }
                  opacity="0.85"
                />
              </g>
            );
          })}
        </svg>

        {/* Time ruler markers */}
        <div className="flex justify-between text-[10px] font-mono tabular-nums text-zinc-400 dark:text-zinc-500 mt-2">
          <span>00:00.0</span>
          <span>00:45.0</span>
          <span>01:30.0</span>
          <span>02:15.0</span>
          <span>{formatTimecode(durationSeconds)}</span>
        </div>
      </div>

      {/* Clickable Timestamp Strip */}
      <div>
        <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">
          Clickable Issue Timestamp Markers (Select to highlight corresponding region on envelope):
        </div>
        <div className="flex flex-wrap gap-2">
          {issues.flatMap((issue) =>
            issue.timestamps.map((ts) => {
              const isSelected =
                activeIssueId === issue.issue_id &&
                activeTimestamp?.start_sec === ts.start_sec;
              return (
                <button
                  key={`${issue.issue_id}-${ts.start_sec}`}
                  type="button"
                  onClick={() => onSelectTimestamp(issue.issue_id, ts)}
                  className={`px-3 py-1.5 rounded-md text-xs font-mono tabular-nums border transition-colors text-left ${
                    isSelected
                      ? 'bg-teal-800 text-white border-teal-800 dark:bg-teal-600 dark:border-teal-500'
                      : 'bg-zinc-50 text-zinc-800 border-zinc-200 hover:border-zinc-400 dark:bg-zinc-800/70 dark:text-zinc-200 dark:border-zinc-700'
                  }`}
                >
                  <span className="font-semibold">
                    {formatTimecode(ts.start_sec)}–{formatTimecode(ts.end_sec)}
                  </span>
                  <span className="mx-1.5 opacity-60">·</span>
                  <span className="font-sans">{ts.label}</span>
                  <span className="ml-2 opacity-75">
                    [{issue.classification === 'objective_technical' ? 'Objective' : 'Stylistic'}]
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
};

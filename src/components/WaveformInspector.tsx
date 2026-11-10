import React, { useMemo } from 'react';
import { AnalysisIssue } from '../contracts/analysisContract';
import { Volume2, VolumeX } from 'lucide-react';

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
  // Deterministic functional envelope bars representing Verse/Chorus/Bridge macrodynamics
  const bars = useMemo(() => {
    const count = 96;
    const result: { index: number; timeSec: number; peakAmplitude: number; rmsAmplitude: number; clipped: boolean }[] = [];
    for (let i = 0; i < count; i++) {
      const timeSec = (i / count) * durationSeconds;
      // Chorus 1 (42.5-58s) and Chorus 2 (134-152.5s) have high amplitude
      const inChorus1 = timeSec >= 42.5 && timeSec <= 58.0;
      const inBridge = timeSec >= 108.0 && timeSec <= 124.5;
      const inChorus2 = timeSec >= 134.0 && timeSec <= 152.5;

      const deterministicWave = Math.abs(Math.sin(i * 0.63) * 0.22 + Math.cos(i * 1.17) * 0.14);
      let basePeak = 0.52 + deterministicWave;
      if (inChorus1 || inChorus2) {
        basePeak = isUnmastered ? 0.94 : 0.99;
      } else if (inBridge) {
        basePeak = monoMode ? 0.44 : 0.68; // Demonstrates mono phase dip in bridge
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
      aria-label="Functional Audio Waveform and Issue Timestamp Inspector"
      className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 font-mono tabular-nums">
            <span>FUNCTIONAL WAVEFORM ENVELOPE</span>
            <span aria-hidden="true">·</span>
            <span>DURATION {formatTimecode(durationSeconds)}</span>
            <span aria-hidden="true">·</span>
            <span>PEAK / RMS OVERLAY</span>
          </div>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
            Time-Domain Envelope & Clickable Issue Regions
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
            {monoMode ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            <span>{monoMode ? 'Listening Mode: Mono Sum (L+R)' : 'Listening Mode: Stereo (L/R)'}</span>
          </button>
        </div>
      </div>

      {/* Functional SVG Waveform with dBFS Scale and Issue Region Highlights */}
      <div className="mt-4 relative bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-md p-4">
        <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400 mb-2">
          <span>0.0 dBFS Ceiling</span>
          <span>
            {activeTimestamp
              ? `Selected Region: ${activeTimestamp.label} (${formatTimecode(activeTimestamp.start_sec)} – ${formatTimecode(activeTimestamp.end_sec)})`
              : 'Click any timestamp marker below to inspect region'}
          </span>
          <span>{monoMode ? 'Mono Sum Attenuation Active on Bridge (01:48–02:04)' : 'Stereo Correlation Active'}</span>
        </div>

        <svg
          viewBox="0 0 960 140"
          className="w-full h-36 overflow-visible"
          role="img"
          aria-label="Audio waveform showing peak and RMS amplitude across track duration"
        >
          {/* Horizontal dBFS reference gridlines */}
          <line x1="0" y1="10" x2="960" y2="10" stroke="currentColor" className="text-red-300 dark:text-red-900/60" strokeDasharray="3 3" strokeWidth="1" />
          <line x1="0" y1="70" x2="960" y2="70" stroke="currentColor" className="text-zinc-300 dark:text-zinc-800" strokeWidth="1" />
          <line x1="0" y1="130" x2="960" y2="130" stroke="currentColor" className="text-red-300 dark:text-red-900/60" strokeDasharray="3 3" strokeWidth="1" />

          {/* Highlighted active issue timestamp window */}
          {activeTimestamp && (
            <rect
              x={(activeTimestamp.start_sec / durationSeconds) * 960}
              y="4"
              width={Math.max(12, ((activeTimestamp.end_sec - activeTimestamp.start_sec) / durationSeconds) * 960)}
              height="132"
              rx="3"
              className="fill-teal-700/15 stroke-teal-700 dark:fill-teal-400/15 dark:stroke-teal-400"
              strokeWidth="1.5"
            />
          )}

          {/* Waveform Bars */}
          {bars.map((bar) => {
            const x = bar.index * 10 + 2;
            const peakHalfHeight = bar.peakAmplitude * 58;
            const rmsHalfHeight = bar.rmsAmplitude * 58;
            const inActiveWindow =
              activeTimestamp &&
              bar.timeSec >= activeTimestamp.start_sec &&
              bar.timeSec <= activeTimestamp.end_sec;

            return (
              <g key={bar.index}>
                {/* Peak envelope bar */}
                <rect
                  x={x}
                  y={70 - peakHalfHeight}
                  width="5"
                  height={peakHalfHeight * 2}
                  rx="1.5"
                  className={
                    bar.clipped
                      ? 'fill-amber-600 dark:fill-amber-500'
                      : inActiveWindow
                        ? 'fill-teal-700 dark:fill-teal-400'
                        : 'fill-zinc-400 dark:fill-zinc-600'
                  }
                />
                {/* RMS inner energy bar */}
                <rect
                  x={x + 1}
                  y={70 - rmsHalfHeight}
                  width="3"
                  height={rmsHalfHeight * 2}
                  rx="1"
                  className={
                    inActiveWindow
                      ? 'fill-teal-900 dark:fill-teal-200'
                      : 'fill-zinc-600 dark:fill-zinc-400'
                  }
                />
              </g>
            );
          })}
        </svg>

        <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400 mt-2">
          <span>00:00.0</span>
          <span>00:45.0</span>
          <span>01:30.0</span>
          <span>02:15.0</span>
          <span>{formatTimecode(durationSeconds)}</span>
        </div>
      </div>

      {/* Clickable Timestamp Strip */}
      <div className="mt-4">
        <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">
          Clickable Issue Timestamp Markers (Select to isolate on waveform):
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

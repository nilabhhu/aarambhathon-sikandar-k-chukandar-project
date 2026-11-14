import React, { useMemo } from 'react';
import { AnalysisIssue, TimelineSeries } from '../contracts/analysisContract';
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
  timeline?: TimelineSeries | null;
  isDemonstrationData?: boolean;
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
  timeline,
  isDemonstrationData = true,
}) => {
  // Use real DSP timeline series if available; fallback to deterministic synthetic envelope for demo
  const bars = useMemo(() => {
    if (timeline && timeline.buckets && timeline.buckets.length > 0) {
      return timeline.buckets.map((b, i) => {
        const peakAmp = Math.min(1.0, Math.max(0.04, Math.pow(10, b.peak_dbfs / 20.0)));
        const rmsAmp = Math.min(peakAmp, Math.max(0.02, Math.pow(10, b.rms_dbfs / 20.0)));
        return {
          index: i,
          timeSec: b.start_sec,
          peakAmplitude: peakAmp,
          rmsAmplitude: rmsAmp,
          clipped: b.clipped,
        };
      });
    }

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
        basePeak = monoMode ? 0.44 : 0.68;
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
  }, [durationSeconds, isUnmastered, monoMode, timeline]);

  return (
    <section
      aria-label="Waveform Profile and Issue Timestamp Selector"
      className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-5 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 font-mono tabular-nums">
            <span className="font-semibold text-teal-800 dark:text-teal-400">
              {isDemonstrationData === false
                ? 'MATHEMATICAL DSP TIMELINE (REAL AUDIO ENVELOPE)'
                : 'SYNTHETIC DEMO ENVELOPE (PHASE 1 VISUALIZATION)'}
            </span>
            <span aria-hidden="true">·</span>
            <span>DURATION {formatTimecode(durationSeconds)}</span>
            <span aria-hidden="true">·</span>
            <span>{isDemonstrationData === false ? 'MEASURED PEAK / RMS' : 'SIMULATED PEAK / RMS'}</span>
          </div>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
            {isDemonstrationData === false
              ? 'DSP Time-Domain Waveform & Clickable Issue Regions'
              : 'Synthetic Time-Domain Profile & Clickable Issue Regions'}
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

      {/* Visualization Disclosure Notice */}
      <div className="flex items-start gap-2 p-2.5 rounded bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-600 dark:text-zinc-400">
        <Info className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
        <span>
          {isDemonstrationData === false ? (
            <>
              <strong>Mathematical DSP Measurement:</strong> This waveform profile is extracted from real decoded float32 audio samples across uniform time buckets.
            </>
          ) : (
            <>
              <strong>Phase 1 Visual Simulation Only:</strong> This waveform is a mathematically generated synthetic envelope illustrating song structure and region highlighting. No real audio playback engine or live audio decoding is active in demonstration mode; real waveform extraction belongs to Phase 2 mathematical DSP.
            </>
          )}
        </span>
      </div>

      {/* SVG Waveform Envelope */}
      <div className="relative w-full h-32 bg-zinc-50 dark:bg-zinc-950 rounded border border-zinc-200 dark:border-zinc-800 overflow-hidden select-none">
        {/* Zero baseline */}
        <div className="absolute top-1/2 left-0 right-0 h-px bg-zinc-200 dark:bg-zinc-800 pointer-events-none" />

        {/* Region Highlights for Issues */}
        {issues.map((issue) =>
          issue.timestamps.map((ts, idx) => {
            const leftPct = (ts.start_sec / durationSeconds) * 100;
            const widthPct = Math.max(1, ((ts.end_sec - ts.start_sec) / durationSeconds) * 100);
            const isSelected =
              activeIssueId === issue.issue_id &&
              activeTimestamp?.start_sec === ts.start_sec;

            const isTechnical = issue.classification === 'objective_technical';

            return (
              <button
                key={`${issue.issue_id}-${idx}`}
                type="button"
                onClick={() => onSelectTimestamp(issue.issue_id, ts)}
                title={`${issue.title} (${formatTimecode(ts.start_sec)} – ${formatTimecode(ts.end_sec)})`}
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                className={`absolute inset-y-0 cursor-pointer transition-all border-x ${
                  isSelected
                    ? isTechnical
                      ? 'bg-rose-500/25 border-rose-600 dark:bg-rose-500/35 dark:border-rose-400 z-20'
                      : 'bg-amber-500/25 border-amber-600 dark:bg-amber-500/35 dark:border-amber-400 z-20'
                    : isTechnical
                    ? 'bg-rose-500/10 border-rose-300 dark:bg-rose-500/15 dark:border-rose-900/60 hover:bg-rose-500/20 z-10'
                    : 'bg-amber-500/10 border-amber-300 dark:bg-amber-500/15 dark:border-amber-900/60 hover:bg-amber-500/20 z-10'
                }`}
              >
                <span className="sr-only">
                  {issue.title}: {formatTimecode(ts.start_sec)} to {formatTimecode(ts.end_sec)}
                </span>
              </button>
            );
          })
        )}

        {/* Vertical Waveform Amplitude Bars */}
        <div className="absolute inset-0 flex items-center justify-between px-1 pointer-events-none">
          {bars.map((bar) => {
            const peakHeight = Math.max(4, bar.peakAmplitude * 100);
            const rmsHeight = Math.max(2, bar.rmsAmplitude * 100);

            return (
              <div
                key={bar.index}
                style={{ height: `${peakHeight}%` }}
                className="flex-1 max-w-[4px] mx-[0.5px] flex items-center justify-center"
              >
                {/* Peak bar */}
                <div
                  className={`w-full rounded-sm transition-all ${
                    bar.clipped
                      ? 'bg-rose-600 dark:bg-rose-500'
                      : 'bg-zinc-300 dark:bg-zinc-700'
                  }`}
                  style={{ height: '100%' }}
                >
                  {/* RMS center core */}
                  <div
                    className="w-full bg-zinc-600 dark:bg-zinc-400 rounded-sm mx-auto my-auto"
                    style={{ height: `${(rmsHeight / peakHeight) * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Active Scrub Marker if timestamp selected */}
        {activeTimestamp && (
          <div
            style={{ left: `${(activeTimestamp.start_sec / durationSeconds) * 100}%` }}
            className="absolute top-0 bottom-0 w-0.5 bg-teal-800 dark:bg-teal-400 z-30 pointer-events-none"
          >
            <div className="absolute -top-1 -left-1.5 w-3.5 h-3.5 bg-teal-800 dark:bg-teal-400 rounded-full" />
          </div>
        )}
      </div>

      {/* Footer scrubber time indicators & active selection readout */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-zinc-500 dark:text-zinc-400">
        <div>00:00.0</div>
        {activeTimestamp ? (
          <div className="text-zinc-900 dark:text-zinc-100 font-sans font-medium text-xs bg-zinc-100 dark:bg-zinc-800 px-3 py-1 rounded">
            Auditioning cue:{' '}
            <span className="font-mono font-semibold">
              {formatTimecode(activeTimestamp.start_sec)} – {formatTimecode(activeTimestamp.end_sec)}
            </span>{' '}
            ({activeTimestamp.label})
          </div>
        ) : (
          <div className="text-zinc-400 dark:text-zinc-500 italic font-sans text-xs">
            Click any highlighted region above or card timestamp below to select
          </div>
        )}
        <div>{formatTimecode(durationSeconds)}</div>
      </div>
    </section>
  );
};

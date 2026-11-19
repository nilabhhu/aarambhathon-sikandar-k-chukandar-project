import React, { useEffect, useMemo, useRef } from 'react';
import { MixStage, TimelineSeries } from '../contracts/analysisContract';
import { useStudioAudioEngine, useStudioAudioState } from '../audio/StudioAudioContext';
import { formatTimecode } from './WaveformInspector';

interface ShortTermLufsTimelineProps {
  timeline: TimelineSeries | null;
  durationSeconds: number;
  mixStage: MixStage;
  integratedLufs: number | null;
  shortTermMaxLufs: number | null;
}

const MIN_LUFS = -36;
const MAX_LUFS = -3;

export const ShortTermLufsTimeline: React.FC<ShortTermLufsTimelineProps> = ({
  timeline,
  durationSeconds,
  mixStage,
  integratedLufs,
  shortTermMaxLufs,
}) => {
  const engine = useStudioAudioEngine();
  const audioState = useStudioAudioState();
  const playheadRef = useRef<SVGLineElement | null>(null);

  const isUnmastered = mixStage === 'unmastered_mix';
  const targetMin = isUnmastered ? -18.0 : -14.0;
  const targetMax = isUnmastered ? -14.0 : -9.0;

  const svgW = 540;
  const svgH = 196;
  const padL = 44;
  const padR = 16;
  const padT = 18;
  const padB = 30;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const lufsToY = (val: number) => {
    const clamped = Math.max(MIN_LUFS, Math.min(MAX_LUFS, val));
    const ratio = (clamped - MIN_LUFS) / (MAX_LUFS - MIN_LUFS);
    return padT + plotH * (1 - ratio);
  };

  const { linePath, areaPath, hasData } = useMemo(() => {
    const buckets = timeline?.buckets ?? [];
    if (buckets.length < 2) {
      return { linePath: '', areaPath: '', hasData: false };
    }

    const totalDur = Math.max(0.1, durationSeconds || timeline?.total_duration_sec || 1);
    const pts: Array<{ x: number; y: number }> = [];

    for (const b of buckets) {
      const val = b.short_term_lufs ?? b.momentary_lufs;
      if (val === null || !Number.isFinite(val)) continue;
      const midSec = (b.start_sec + b.end_sec) * 0.5;
      const x = padL + Math.max(0, Math.min(1, midSec / totalDur)) * plotW;
      const y = lufsToY(val);
      pts.push({ x, y });
    }

    if (pts.length < 2) {
      return { linePath: '', areaPath: '', hasData: false };
    }

    const line = pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');
    const baselineY = padT + plotH;
    const area = `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${baselineY.toFixed(1)} L ${pts[0].x.toFixed(1)} ${baselineY.toFixed(1)} Z`;

    return { linePath: line, areaPath: area, hasData: true };
  }, [timeline, durationSeconds, plotW, plotH]);

  // 60fps direct SVG playhead update (zero React state re-renders)
  useEffect(() => {
    let rafId = 0;
    const updatePlayhead = () => {
      const dur = Math.max(0.1, durationSeconds || audioState.primaryDurationSec || 1);
      const cur = engine.getCurrentTime();
      const x = padL + Math.max(0, Math.min(1, cur / dur)) * plotW;
      if (playheadRef.current) {
        playheadRef.current.setAttribute('x1', x.toFixed(1));
        playheadRef.current.setAttribute('x2', x.toFixed(1));
      }
      if (audioState.isPlaying) {
        rafId = requestAnimationFrame(updatePlayhead);
      }
    };
    updatePlayhead();
    return () => cancelAnimationFrame(rafId);
  }, [engine, audioState.isPlaying, audioState.primaryDurationSec, durationSeconds, plotW]);

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * svgW;
    const ratio = Math.max(0, Math.min(1, (relX - padL) / plotW));
    const dur = durationSeconds || audioState.primaryDurationSec;
    if (dur > 0) {
      engine.seek(ratio * dur);
    }
  };

  const targetTopY = lufsToY(targetMax);
  const targetBotY = lufsToY(targetMin);
  const integratedY = integratedLufs !== null ? lufsToY(integratedLufs) : null;
  const gridTicks = [-6, -12, -18, -24, -30, -36];

  return (
    <section
      aria-label="Short-Term LUFS Timeline"
      data-testid="short-term-lufs-timeline"
      className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-5 space-y-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 pb-3 border-b border-zinc-200/80 dark:border-zinc-800">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Short-Term LUFS Timeline
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            3-second loudness trajectory vs. {isUnmastered ? 'Unmastered' : 'Master'} target band
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
          <span>
            Int:{' '}
            <strong className="text-zinc-900 dark:text-zinc-100">
              {integratedLufs !== null ? `${integratedLufs.toFixed(1)}` : '—'}
            </strong>
          </span>
          <span>
            Max ST:{' '}
            <strong className="text-zinc-900 dark:text-zinc-100">
              {shortTermMaxLufs !== null ? `${shortTermMaxLufs.toFixed(1)}` : '—'}
            </strong>
          </span>
        </div>
      </div>

      {hasData ? (
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          onClick={handleSvgClick}
          className="w-full h-auto cursor-pointer select-none"
          role="img"
          aria-label="Short-Term LUFS over track duration"
        >
          <defs>
            <linearGradient id="lufsAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3A7269" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#3A7269" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          <rect
            x={padL}
            y={padT}
            width={plotW}
            height={plotH}
            rx={5}
            className="fill-[#FAFAFA] dark:fill-zinc-950/80 stroke-zinc-200 dark:stroke-zinc-800"
            strokeWidth={1}
          />

          {/* Target Loudness Band Shading */}
          <rect
            x={padL}
            y={targetTopY}
            width={plotW}
            height={Math.max(2, targetBotY - targetTopY)}
            className="fill-[#3A7269]/[0.13] dark:fill-teal-400/[0.14]"
          />

          {/* Horizontal Gridlines */}
          {gridTicks.map((tick) => {
            const y = lufsToY(tick);
            return (
              <g key={tick}>
                <line
                  x1={padL}
                  x2={padL + plotW}
                  y1={y}
                  y2={y}
                  className="stroke-zinc-200/80 dark:stroke-zinc-800"
                  strokeWidth={1}
                />
                <text
                  x={padL - 6}
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-zinc-400 dark:fill-zinc-500 text-[9.5px] font-mono tabular-nums"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {/* Integrated LUFS Dashed Reference */}
          {integratedY !== null && (
            <line
              x1={padL}
              x2={padL + plotW}
              y1={integratedY}
              y2={integratedY}
              className="stroke-amber-600/70 dark:stroke-amber-400/70"
              strokeWidth={1.25}
              strokeDasharray="4 3"
            />
          )}

          {/* Short-Term LUFS Curve & Area */}
          <path d={areaPath} fill="url(#lufsAreaGrad)" />
          <path
            d={linePath}
            fill="none"
            className="stroke-[#3A7269] dark:stroke-teal-400"
            strokeWidth={1.85}
            strokeLinejoin="round"
          />

          {/* Live Playhead Sync Line */}
          <line
            ref={playheadRef}
            x1={padL}
            x2={padL}
            y1={padT}
            y2={padT + plotH}
            className="stroke-zinc-900 dark:stroke-zinc-100"
            strokeWidth={1.5}
          />

          {/* X-Axis Timestamps */}
          <text
            x={padL}
            y={padT + plotH + 18}
            className="fill-zinc-500 dark:fill-zinc-400 text-[9.5px] font-mono tabular-nums"
          >
            00:00.0
          </text>
          <text
            x={padL + plotW / 2}
            y={padT + plotH + 18}
            textAnchor="middle"
            className="fill-zinc-500 dark:fill-zinc-400 text-[9.5px] font-mono tabular-nums"
          >
            {formatTimecode(durationSeconds / 2)}
          </text>
          <text
            x={padL + plotW}
            y={padT + plotH + 18}
            textAnchor="end"
            className="fill-zinc-500 dark:fill-zinc-400 text-[9.5px] font-mono tabular-nums"
          >
            {formatTimecode(durationSeconds)}
          </text>
        </svg>
      ) : (
        <div className="h-40 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-xs text-zinc-500">
          Short-term LUFS timeline buckets unavailable for this bounce.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
        <span>
          Target zone: <span className="font-mono tabular-nums">{targetMin.toFixed(1)} to {targetMax.toFixed(1)} LUFS</span>
        </span>
        <span>Click curve to seek playhead</span>
      </div>
    </section>
  );
};

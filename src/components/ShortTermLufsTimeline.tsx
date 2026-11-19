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

  const { effectiveTimeline, effectiveDuration, effectiveShortTermMax, effectiveIntegrated } =
    useMemo(() => {
      const reportBuckets = timeline?.buckets ?? [];
      const reportFiniteSt = reportBuckets.filter(
        (b) => b.short_term_lufs !== null && Number.isFinite(b.short_term_lufs)
      );
      const useReport = reportFiniteSt.length >= 2;
      const chosenTimeline = useReport
        ? timeline
        : audioState.primaryShortTermTimeline ?? timeline;

      const dur = Math.max(
        0.1,
        audioState.primaryDurationSec > 0
          ? audioState.primaryDurationSec
          : durationSeconds || chosenTimeline?.total_duration_sec || 1
      );

      let maxSt = shortTermMaxLufs;
      if (maxSt === null || !Number.isFinite(maxSt)) {
        if (audioState.primaryShortTermMaxLufs !== null) {
          maxSt = audioState.primaryShortTermMaxLufs;
        } else if (chosenTimeline?.buckets?.length) {
          const vals = chosenTimeline.buckets
            .map((b) => b.short_term_lufs)
            .filter((v): v is number => v !== null && Number.isFinite(v));
          if (vals.length > 0) {
            maxSt = Math.max(...vals);
          }
        }
      }

      const intVal =
        integratedLufs !== null && Number.isFinite(integratedLufs)
          ? integratedLufs
          : audioState.primaryLufs;

      return {
        effectiveTimeline: chosenTimeline,
        effectiveDuration: dur,
        effectiveShortTermMax: maxSt,
        effectiveIntegrated: intVal,
      };
    }, [
      timeline,
      audioState.primaryShortTermTimeline,
      audioState.primaryShortTermMaxLufs,
      audioState.primaryDurationSec,
      audioState.primaryLufs,
      durationSeconds,
      shortTermMaxLufs,
      integratedLufs,
    ]);

  const { linePath, areaPath, hasData } = useMemo(() => {
    const buckets = effectiveTimeline?.buckets ?? [];
    if (buckets.length < 2) {
      return { linePath: '', areaPath: '', hasData: false };
    }

    const totalDur = Math.max(0.1, effectiveDuration || effectiveTimeline?.total_duration_sec || 1);
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
  }, [effectiveTimeline, effectiveDuration, plotW, plotH]);

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
  const integratedY = effectiveIntegrated !== null ? lufsToY(effectiveIntegrated) : null;
  const gridTicks = [-6, -12, -18, -24, -30, -36];

  return (
    <section
      aria-label="Short-Term LUFS Timeline"
      data-testid="short-term-lufs-timeline"
      className="h-full studio-elevated squircle-outer p-5 md:p-6 flex flex-col justify-between space-y-3.5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 pb-3.5 studio-hairline-b">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-primary)]">
            Short-Term LUFS Timeline
          </h3>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            3-second loudness trajectory vs. {isUnmastered ? 'Unmastered' : 'Master'} target band
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-[var(--text-secondary)]">
          <span>
            Int:{' '}
            <strong className="text-[var(--text-primary)]">
              {effectiveIntegrated !== null ? `${effectiveIntegrated.toFixed(1)}` : '—'}
            </strong>
          </span>
          <span>
            Max ST:{' '}
            <strong data-testid="short-term-max-readout" className="text-[var(--text-primary)]">
              {effectiveShortTermMax !== null ? `${effectiveShortTermMax.toFixed(1)}` : '—'}
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
              <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          <rect
            x={padL}
            y={padT}
            width={plotW}
            height={plotH}
            rx={0}
            fill="var(--bg-surface)"
            stroke="var(--border-hairline-color)"
            strokeWidth={1.5}
          />

          {/* Target Loudness Band Shading */}
          <rect
            x={padL}
            y={targetTopY}
            width={plotW}
            height={Math.max(2, targetBotY - targetTopY)}
            fill="var(--accent-soft)"
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
                  stroke="var(--border-hairline-color)"
                  strokeWidth={1}
                />
                <text
                  x={padL - 6}
                  y={y + 3.5}
                  textAnchor="end"
                  fill="var(--text-secondary)"
                  className="text-[9.5px] font-mono tabular-nums"
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
              stroke="var(--status-caution)"
              strokeOpacity={0.75}
              strokeWidth={1.25}
              strokeDasharray="4 3"
            />
          )}

          {/* Short-Term LUFS Curve & Area */}
          <path d={areaPath} fill="url(#lufsAreaGrad)" />
          <path
            d={linePath}
            fill="none"
            stroke="var(--accent-primary)"
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
            stroke="var(--text-primary)"
            strokeWidth={1.5}
          />

          {/* X-Axis Timestamps */}
          <text
            x={padL}
            y={padT + plotH + 18}
            fill="var(--text-secondary)"
            className="text-[9.5px] font-mono tabular-nums"
          >
            00:00.0
          </text>
          <text
            x={padL + plotW / 2}
            y={padT + plotH + 18}
            textAnchor="middle"
            fill="var(--text-secondary)"
            className="text-[9.5px] font-mono tabular-nums"
          >
            {formatTimecode(effectiveDuration / 2)}
          </text>
          <text
            x={padL + plotW}
            y={padT + plotH + 18}
            textAnchor="end"
            fill="var(--text-secondary)"
            className="text-[9.5px] font-mono tabular-nums"
          >
            {formatTimecode(effectiveDuration)}
          </text>
        </svg>
      ) : (
        <div className="h-40 squircle-inner border border-dashed border-[var(--border-hairline-color)] bg-[var(--bg-surface)] flex items-center justify-center text-xs text-[var(--text-secondary)]">
          Short-term LUFS timeline buckets unavailable for this bounce.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-secondary)] pt-1 studio-hairline-t">
        <span>
          Target zone:{' '}
          <span className="font-mono tabular-nums text-[var(--text-primary)]">
            {targetMin.toFixed(1)} to {targetMax.toFixed(1)} LUFS
          </span>
        </span>
        <span>Click curve to seek playhead</span>
      </div>
    </section>
  );
};

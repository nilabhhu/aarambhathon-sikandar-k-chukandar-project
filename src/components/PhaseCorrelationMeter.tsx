import React, { useEffect, useMemo, useRef } from 'react';
import { TimelineSeries } from '../contracts/analysisContract';
import { useStudioAudioEngine, useStudioAudioState } from '../audio/StudioAudioContext';

interface PhaseCorrelationMeterProps {
  meanCorrelation: number | null;
  minCorrelation: number | null;
  stereoWidthIndex: number | null;
  channels: 1 | 2;
  timeline: TimelineSeries | null;
}

function corrToPercent(val: number): number {
  const clamped = Math.max(-1, Math.min(1, val));
  return ((clamped + 1) / 2) * 100;
}

export const PhaseCorrelationMeter: React.FC<PhaseCorrelationMeterProps> = ({
  meanCorrelation,
  minCorrelation,
  stereoWidthIndex,
  channels,
  timeline,
}) => {
  const engine = useStudioAudioEngine();
  const audioState = useStudioAudioState();

  const liveNeedleRef = useRef<HTMLDivElement | null>(null);
  const liveValueRef = useRef<HTMLSpanElement | null>(null);

  const isMonoTrack = channels === 1;
  const effectiveMean = isMonoTrack ? 1.0 : meanCorrelation;
  const effectiveMin = isMonoTrack ? 1.0 : minCorrelation;

  // 60fps direct DOM update for live playback correlation meter (zero React state re-renders)
  useEffect(() => {
    let rafId = 0;
    let smoothed = effectiveMean ?? 0.7;

    const tick = () => {
      const live = engine.getLivePhaseCorrelation();
      if (live !== null) {
        smoothed = smoothed * 0.72 + live * 0.28;
        if (liveNeedleRef.current) {
          liveNeedleRef.current.style.left = `${corrToPercent(smoothed).toFixed(2)}%`;
          liveNeedleRef.current.style.opacity = '1';
        }
        if (liveValueRef.current) {
          liveValueRef.current.textContent = `${smoothed >= 0 ? '+' : ''}${smoothed.toFixed(2)}`;
        }
      } else if (liveNeedleRef.current) {
        liveNeedleRef.current.style.opacity = '0';
      }

      if (audioState.isPlaying) {
        rafId = requestAnimationFrame(tick);
      }
    };

    if (audioState.isPlaying) {
      tick();
    } else {
      if (liveNeedleRef.current) {
        liveNeedleRef.current.style.opacity = '0';
      }
      if (liveValueRef.current) {
        liveValueRef.current.textContent =
          effectiveMean !== null ? `${effectiveMean >= 0 ? '+' : ''}${effectiveMean.toFixed(2)}` : '—';
      }
    }

    return () => cancelAnimationFrame(rafId);
  }, [engine, audioState.isPlaying, effectiveMean]);

  // Mini correlation timeline sparkline from DSP timeline buckets
  const sparkPath = useMemo(() => {
    const buckets = timeline?.buckets ?? [];
    if (buckets.length < 2 || isMonoTrack) return '';
    const w = 360;
    const h = 44;
    const pts: string[] = [];
    buckets.forEach((b, i) => {
      if (b.phase_correlation === null) return;
      const x = (i / (buckets.length - 1)) * w;
      const clamped = Math.max(-1, Math.min(1, b.phase_correlation));
      const y = h * (1 - (clamped + 1) / 2);
      pts.push(`${pts.length === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    });
    return pts.join(' ');
  }, [timeline, isMonoTrack]);

  const statusText = isMonoTrack
    ? 'Mono Track (+1.00)'
    : effectiveMin !== null && effectiveMin < 0
    ? 'Momentary Cancellation Detected'
    : effectiveMean !== null && effectiveMean >= 0.2
    ? 'Mono-Compatible Stereo'
    : 'Wide / Low Correlation';

  const statusColor = isMonoTrack
    ? 'text-[#3A7269] dark:text-teal-400'
    : effectiveMin !== null && effectiveMin < 0
    ? 'text-rose-700 dark:text-rose-400'
    : effectiveMean !== null && effectiveMean >= 0.2
    ? 'text-[#3A7269] dark:text-teal-400'
    : 'text-amber-700 dark:text-amber-400';

  return (
    <section
      aria-label="Stereo Phase Correlation Meter"
      data-testid="phase-correlation-meter"
      className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-5 flex flex-col justify-between space-y-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 pb-3 border-b border-zinc-200/80 dark:border-zinc-800">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Stereo Phase Correlation Meter
          </h3>
          <p className={`text-xs font-medium mt-0.5 ${statusColor}`}>{statusText}</p>
        </div>
        <div className="text-right font-mono tabular-nums">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            {audioState.isPlaying ? 'Live' : 'Mean'}
          </div>
          <span
            ref={liveValueRef}
            className="text-lg font-bold text-zinc-900 dark:text-zinc-100"
          >
            {effectiveMean !== null ? `${effectiveMean >= 0 ? '+' : ''}${effectiveMean.toFixed(2)}` : '—'}
          </span>
        </div>
      </div>

      {/* Horizontal Correlation Scale (-1.0 to +1.0) */}
      <div className="space-y-2.5">
        <div className="relative h-8 rounded-md border border-zinc-200 dark:border-zinc-800 bg-[#FAFAFA] dark:bg-zinc-950 overflow-hidden">
          {/* Semantic Zones: -1..0 Cancellation Risk | 0..+0.25 Wide | +0.25..+1 Safe */}
          <div className="absolute inset-y-0 left-0 w-1/2 bg-rose-500/12 dark:bg-rose-500/18 border-r border-zinc-300 dark:border-zinc-700" />
          <div className="absolute inset-y-0 left-1/2 w-[12.5%] bg-amber-500/10 dark:bg-amber-500/15" />
          <div className="absolute inset-y-0 left-[62.5%] right-0 bg-[#3A7269]/12 dark:bg-teal-400/15" />

          {/* Range Span between Min and Mean */}
          {effectiveMin !== null && effectiveMean !== null && (
            <div
              style={{
                left: `${Math.min(corrToPercent(effectiveMin), corrToPercent(effectiveMean))}%`,
                width: `${Math.max(1.5, Math.abs(corrToPercent(effectiveMean) - corrToPercent(effectiveMin)))}%`,
              }}
              className={`absolute top-2 bottom-2 rounded-xs ${
                effectiveMin < 0
                  ? 'bg-rose-500/45 dark:bg-rose-400/45'
                  : 'bg-[#3A7269]/40 dark:bg-teal-400/40'
              }`}
            />
          )}

          {/* Worst-Case Min Marker */}
          {effectiveMin !== null && (
            <div
              style={{ left: `${corrToPercent(effectiveMin)}%` }}
              title={`Minimum 400ms Dip: ${effectiveMin.toFixed(2)}`}
              className="absolute inset-y-1 w-0.5 -ml-px bg-rose-600 dark:bg-rose-400"
            />
          )}

          {/* Mean Correlation Marker */}
          {effectiveMean !== null && (
            <div
              style={{ left: `${corrToPercent(effectiveMean)}%` }}
              title={`Mean Correlation: ${effectiveMean.toFixed(2)}`}
              className="absolute inset-y-0 w-1 -ml-0.5 bg-[#3A7269] dark:bg-teal-400"
            />
          )}

          {/* Live Playback Needle (60fps DOM ref, zero React state) */}
          <div
            ref={liveNeedleRef}
            style={{ opacity: 0, left: '50%' }}
            className="absolute top-0 bottom-0 w-0.5 -ml-px bg-zinc-900 dark:bg-white transition-opacity duration-150"
          />
        </div>

        {/* Scale Ticks */}
        <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
          <span className="text-rose-700 dark:text-rose-400">-1.0 (Out of Phase)</span>
          <span>0.0</span>
          <span className="text-[#3A7269] dark:text-teal-400">+1.0 (Mono Safe)</span>
        </div>
      </div>

      {/* Mini Phase-over-Time Sparkline */}
      {sparkPath && (
        <div className="space-y-1">
          <div className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">
            Windowed Correlation Across Track
          </div>
          <svg
            viewBox="0 0 360 44"
            className="w-full h-11 rounded border border-zinc-200/80 dark:border-zinc-800 bg-[#FAFAFA] dark:bg-zinc-950"
            aria-hidden="true"
          >
            {/* 0.0 Centerline */}
            <line
              x1={0}
              x2={360}
              y1={22}
              y2={22}
              className="stroke-zinc-300 dark:stroke-zinc-700"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
            <path
              d={sparkPath}
              fill="none"
              className="stroke-[#3A7269] dark:stroke-teal-400"
              strokeWidth={1.5}
            />
          </svg>
        </div>
      )}

      {/* Numeric Telemetry Footer */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-200/80 dark:border-zinc-800 text-xs font-mono tabular-nums">
        <div>
          <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-sans">Mean</div>
          <div className="font-semibold text-zinc-900 dark:text-zinc-100">
            {effectiveMean !== null ? `${effectiveMean >= 0 ? '+' : ''}${effectiveMean.toFixed(2)}` : '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-sans">Worst Dip</div>
          <div
            className={`font-semibold ${
              effectiveMin !== null && effectiveMin < 0
                ? 'text-rose-700 dark:text-rose-400'
                : 'text-zinc-900 dark:text-zinc-100'
            }`}
          >
            {effectiveMin !== null ? `${effectiveMin >= 0 ? '+' : ''}${effectiveMin.toFixed(2)}` : '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-sans">Stereo Width</div>
          <div className="font-semibold text-zinc-900 dark:text-zinc-100">
            {isMonoTrack
              ? '0%'
              : stereoWidthIndex !== null
              ? `${stereoWidthIndex.toFixed(0)}%`
              : '—'}
          </div>
        </div>
      </div>
    </section>
  );
};

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
    ? 'text-[var(--status-safe)]'
    : effectiveMin !== null && effectiveMin < 0
    ? 'text-[var(--status-alert)]'
    : effectiveMean !== null && effectiveMean >= 0.2
    ? 'text-[var(--status-safe)]'
    : 'text-[var(--status-caution)]';

  return (
    <section
      aria-label="Stereo Phase Correlation Meter"
      data-testid="phase-correlation-meter"
      className="h-full studio-elevated squircle-outer p-5 md:p-6 flex flex-col justify-between space-y-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 pb-3.5 studio-hairline-b">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-primary)]">
            Stereo Phase Correlation Meter
          </h3>
          <p className={`text-xs font-semibold mt-0.5 ${statusColor}`}>{statusText}</p>
        </div>
        <div className="text-right font-mono tabular-nums">
          <div className="text-[11px] text-[var(--text-secondary)]">
            {audioState.isPlaying ? 'Live' : 'Mean'}
          </div>
          <span
            ref={liveValueRef}
            className="text-lg font-bold text-[var(--text-primary)]"
          >
            {effectiveMean !== null ? `${effectiveMean >= 0 ? '+' : ''}${effectiveMean.toFixed(2)}` : '—'}
          </span>
        </div>
      </div>

      {/* Horizontal Correlation Scale (-1.0 to +1.0) */}
      <div className="space-y-2.5">
        <div className="relative h-8 squircle-inner border border-[var(--border-hairline-color)] bg-[var(--bg-surface)] overflow-hidden">
          {/* Semantic Zones: -1..0 Cancellation Risk | 0..+0.25 Wide | +0.25..+1 Safe */}
          <div className="absolute inset-y-0 left-0 w-1/2 bg-rose-500/10 border-r border-[var(--border-hairline-color)]" />
          <div className="absolute inset-y-0 left-1/2 w-[12.5%] bg-amber-500/10" />
          <div className="absolute inset-y-0 left-[62.5%] right-0 bg-[var(--accent-soft)]/80" />

          {/* Range Span between Min and Mean */}
          {effectiveMin !== null && effectiveMean !== null && (
            <div
              style={{
                left: `${Math.min(corrToPercent(effectiveMin), corrToPercent(effectiveMean))}%`,
                width: `${Math.max(1.5, Math.abs(corrToPercent(effectiveMean) - corrToPercent(effectiveMin)))}%`,
              }}
              className={`absolute top-2 bottom-2 rounded-[3px] ${
                effectiveMin < 0
                  ? 'bg-[var(--status-alert)]/40'
                  : 'bg-[var(--accent-primary)]/35'
              }`}
            />
          )}

          {/* Worst-Case Min Marker */}
          {effectiveMin !== null && (
            <div
              style={{ left: `${corrToPercent(effectiveMin)}%` }}
              title={`Minimum 400ms Dip: ${effectiveMin.toFixed(2)}`}
              className="absolute inset-y-1 w-0.5 -ml-px bg-[var(--status-alert)]"
            />
          )}

          {/* Mean Correlation Marker */}
          {effectiveMean !== null && (
            <div
              style={{ left: `${corrToPercent(effectiveMean)}%` }}
              title={`Mean Correlation: ${effectiveMean.toFixed(2)}`}
              className="absolute inset-y-0 w-1 -ml-0.5 bg-[var(--accent-primary)]"
            />
          )}

          {/* Live Playback Needle (60fps DOM ref, zero React state) */}
          <div
            ref={liveNeedleRef}
            style={{ opacity: 0, left: '50%' }}
            className="absolute top-0 bottom-0 w-0.5 -ml-px bg-[var(--text-primary)] transition-opacity duration-150"
          />
        </div>

        {/* Scale Ticks */}
        <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-[var(--text-secondary)]">
          <span className="text-[var(--status-alert)]">-1.0 (Out of Phase)</span>
          <span>0.0</span>
          <span className="text-[var(--status-safe)]">+1.0 (Mono Safe)</span>
        </div>
      </div>

      {/* Mini Phase-over-Time Sparkline */}
      {sparkPath && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-mono text-[var(--text-secondary)]">
            Windowed Correlation Across Track
          </div>
          <svg
            viewBox="0 0 360 44"
            className="w-full h-11 squircle-inner border border-[var(--border-hairline-color)] bg-[var(--bg-surface)]"
            aria-hidden="true"
          >
            <line
              x1={0}
              x2={360}
              y1={22}
              y2={22}
              stroke="var(--border-hairline-color)"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
            <path
              d={sparkPath}
              fill="none"
              stroke="var(--accent-primary)"
              strokeWidth={1.5}
            />
          </svg>
        </div>
      )}

      {/* Numeric Telemetry Footer */}
      <div className="grid grid-cols-3 gap-2 pt-3 studio-hairline-t text-xs font-mono tabular-nums">
        <div>
          <div className="text-[10px] text-[var(--text-secondary)] font-sans">Mean</div>
          <div className="font-semibold text-[var(--text-primary)]">
            {effectiveMean !== null ? `${effectiveMean >= 0 ? '+' : ''}${effectiveMean.toFixed(2)}` : '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-[var(--text-secondary)] font-sans">Worst Dip</div>
          <div
            className={`font-semibold ${
              effectiveMin !== null && effectiveMin < 0
                ? 'text-[var(--status-alert)]'
                : 'text-[var(--text-primary)]'
            }`}
          >
            {effectiveMin !== null ? `${effectiveMin >= 0 ? '+' : ''}${effectiveMin.toFixed(2)}` : '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-[var(--text-secondary)] font-sans">Stereo Width</div>
          <div className="font-semibold text-[var(--text-primary)]">
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

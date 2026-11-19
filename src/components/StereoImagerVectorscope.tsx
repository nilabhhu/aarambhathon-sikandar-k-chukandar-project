import React, { useEffect, useRef } from 'react';
import { useStudioAudioEngine, useStudioAudioState } from '../audio/StudioAudioContext';
import { TRANSLATION_PROFILES } from '../audio/StudioAudioEngine';
import {
  LiveStereoTelemetry,
  computeLiveStereoTelemetry,
  formatStereoBalance,
} from '../audio/realtimeMeters';

interface ScopePalette {
  surface: string;
  fadeFill: string;
  ringFill: string;
  grid: string;
  axis: string;
  label: string;
  tealRgb: string;
  cautionRgb: string;
  alertRgb: string;
}

function readScopePalette(): ScopePalette {
  const isDark =
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark');

  if (isDark) {
    return {
      surface: '#141B19',
      fadeFill: 'rgba(20, 27, 25, 0.22)',
      ringFill: 'rgba(242, 245, 244, 0.03)',
      grid: 'rgba(242, 245, 244, 0.10)',
      axis: 'rgba(242, 245, 244, 0.18)',
      label: '#9BA8A4',
      tealRgb: '77, 165, 151',
      cautionRgb: '251, 191, 36',
      alertRgb: '251, 113, 133',
    };
  }

  return {
    surface: '#FFFFFF',
    fadeFill: 'rgba(255, 255, 255, 0.22)',
    ringFill: 'rgba(58, 114, 105, 0.035)',
    grid: 'rgba(24, 34, 32, 0.09)',
    axis: 'rgba(24, 34, 32, 0.18)',
    label: '#52605D',
    tealRgb: '58, 114, 105',
    cautionRgb: '180, 83, 9',
    alertRgb: '190, 18, 60',
  };
}

export const StereoImagerVectorscope: React.FC = () => {
  const engine = useStudioAudioEngine();
  const audioState = useStudioAudioState();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Offscreen phosphor trail buffer (so graticule stays razor-sharp above phosphor fade)
  const trailCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Pre-allocated zero-GC buffers for 60fps rAF
  const sampleBufLRef = useRef<Float32Array>(new Float32Array(512));
  const sampleBufRRef = useRef<Float32Array>(new Float32Array(512));
  const telemetryRef = useRef<LiveStereoTelemetry>({
    widthPct: 0,
    balance: 0,
    correlation: 1,
    hasSignal: false,
  });

  // Direct DOM refs updated at 60fps — ZERO React state updates per frame
  const widthValRef = useRef<HTMLDivElement | null>(null);
  const balanceValRef = useRef<HTMLDivElement | null>(null);
  const corrValRef = useRef<HTMLDivElement | null>(null);

  const paletteRef = useRef<ScopePalette>(readScopePalette());
  const isPlayingRef = useRef(audioState.isPlaying);
  isPlayingRef.current = audioState.isPlaying;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!trailCanvasRef.current) {
      trailCanvasRef.current = document.createElement('canvas');
    }
    const trailCanvas = trailCanvasRef.current;
    const trailCtx = trailCanvas.getContext('2d');
    if (!trailCtx) return;

    let width = Math.max(260, container.clientWidth);
    const height = 216;
    let dpr = Math.min(2, window.devicePixelRatio || 1);

    const clearTrail = () => {
      const pal = paletteRef.current;
      trailCtx.save();
      trailCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      trailCtx.fillStyle = pal.surface;
      trailCtx.fillRect(0, 0, width, height);
      trailCtx.restore();
    };

    const resizeCanvas = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = Math.max(260, container.clientWidth);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      trailCanvas.width = Math.round(width * dpr);
      trailCanvas.height = Math.round(height * dpr);
      clearTrail();
    };

    resizeCanvas();

    const drawGraticule = (
      gCtx: CanvasRenderingContext2D,
      cx: number,
      cy: number,
      radius: number,
      pal: ScopePalette,
      isIdle: boolean
    ) => {
      gCtx.save();

      // Concentric reference rings (100% & 50%)
      gCtx.fillStyle = pal.ringFill;
      gCtx.beginPath();
      gCtx.arc(cx, cy, radius, 0, Math.PI * 2);
      gCtx.fill();

      gCtx.strokeStyle = pal.grid;
      gCtx.lineWidth = 1;
      gCtx.beginPath();
      gCtx.arc(cx, cy, radius, 0, Math.PI * 2);
      gCtx.stroke();

      gCtx.setLineDash([3, 3]);
      gCtx.beginPath();
      gCtx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
      gCtx.stroke();
      gCtx.setLineDash([]);

      // M (vertical center) & -S/+S (horizontal width) axes
      gCtx.strokeStyle = pal.axis;
      gCtx.lineWidth = 1;
      gCtx.beginPath();
      gCtx.moveTo(cx, cy - radius);
      gCtx.lineTo(cx, cy + radius);
      gCtx.moveTo(cx - radius, cy);
      gCtx.lineTo(cx + radius, cy);
      gCtx.stroke();

      // L (-45°) & R (+45°) diagonal channel axes
      const diag = radius * Math.SQRT1_2;
      gCtx.strokeStyle = pal.grid;
      gCtx.setLineDash([2, 3]);
      gCtx.beginPath();
      gCtx.moveTo(cx - diag, cy - diag);
      gCtx.lineTo(cx + diag, cy + diag);
      gCtx.moveTo(cx + diag, cy - diag);
      gCtx.lineTo(cx - diag, cy + diag);
      gCtx.stroke();
      gCtx.setLineDash([]);

      // Studio Graticule Labels: M, L, R, -S, +S
      gCtx.font = '600 10px "Geist Mono", ui-monospace, monospace';
      gCtx.fillStyle = pal.label;
      gCtx.textAlign = 'center';
      gCtx.textBaseline = 'middle';

      gCtx.fillText('M', cx, cy - radius - 10);
      gCtx.fillText('L', cx - diag - 10, cy - diag - 7);
      gCtx.fillText('R', cx + diag + 10, cy - diag - 7);
      gCtx.fillText('-S', cx - radius - 14, cy);
      gCtx.fillText('+S', cx + radius + 14, cy);

      // Clean centered crosshair reticle in idle state
      if (isIdle) {
        gCtx.strokeStyle = `rgba(${pal.tealRgb}, 0.65)`;
        gCtx.lineWidth = 1.5;
        gCtx.beginPath();
        gCtx.moveTo(cx - 7, cy);
        gCtx.lineTo(cx + 7, cy);
        gCtx.moveTo(cx, cy - 7);
        gCtx.lineTo(cx, cy + 7);
        gCtx.stroke();

        gCtx.fillStyle = `rgba(${pal.tealRgb}, 0.85)`;
        gCtx.beginPath();
        gCtx.arc(cx, cy, 2.5, 0, Math.PI * 2);
        gCtx.fill();
      }

      gCtx.restore();
    };

    const smoothTelemetry = { widthPct: 0, balance: 0, corr: 1 };

    const drawFrame = () => {
      const pal = paletteRef.current;
      const cx = width / 2;
      const cy = height / 2 + 2;
      const radius = Math.min(width * 0.36, height * 0.39);

      const bufL = sampleBufLRef.current;
      const bufR = sampleBufRRef.current;
      const hasSamples = engine.getLiveStereoSamples(bufL, bufR);

      // 1. Fade previous phosphor trail cleanly on offscreen trail canvas
      trailCtx.save();
      trailCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      trailCtx.fillStyle = pal.fadeFill;
      trailCtx.fillRect(0, 0, width, height);

      if (hasSamples) {
        const tel = computeLiveStereoTelemetry(bufL, bufR, telemetryRef.current);
        smoothTelemetry.widthPct = smoothTelemetry.widthPct * 0.72 + tel.widthPct * 0.28;
        smoothTelemetry.balance = smoothTelemetry.balance * 0.75 + tel.balance * 0.25;
        smoothTelemetry.corr = smoothTelemetry.corr * 0.72 + tel.correlation * 0.28;

        // Choose trace hue: Studio Teal (in-phase) -> Amber (wide/borderline) -> Rose (out-of-phase)
        const traceRgb =
          tel.correlation < 0
            ? pal.alertRgb
            : tel.correlation < 0.2
            ? pal.cautionRgb
            : pal.tealRgb;

        // Plot rotated Mid/Side coordinates:
        // x = (L - R) * 0.7071 (Side), y = (L + R) * 0.7071 (Mid)
        // Mapped so pure L sits on -45° (upper-left), pure R sits on +45° (upper-right),
        // and equal-power Mono (L === R) collapses strictly onto the vertical M center line!
        const SQRT1_2 = Math.SQRT1_2;
        const scale = radius * 0.9;

        trailCtx.strokeStyle = `rgba(${traceRgb}, 0.55)`;
        trailCtx.lineWidth = 1.25;
        trailCtx.beginPath();

        let started = false;
        for (let i = 0; i < bufL.length; i++) {
          const l = bufL[i];
          const r = bufR[i];
          const xMs = (l - r) * SQRT1_2;
          const yMs = (l + r) * SQRT1_2;

          // Soft radial clamp inside scope circle
          let px = -xMs * scale;
          let py = -yMs * scale;
          const dist = Math.hypot(px, py);
          if (dist > radius) {
            const k = radius / dist;
            px *= k;
            py *= k;
          }

          const sx = cx + px;
          const sy = cy + py;

          if (!started) {
            trailCtx.moveTo(sx, sy);
            started = true;
          } else {
            trailCtx.lineTo(sx, sy);
          }
        }
        trailCtx.stroke();

        // Subtle luminous phosphor points along trace for oscilloscope clarity
        trailCtx.fillStyle = `rgba(${traceRgb}, 0.85)`;
        for (let i = 0; i < bufL.length; i += 4) {
          const l = bufL[i];
          const r = bufR[i];
          let px = -(l - r) * SQRT1_2 * scale;
          let py = -(l + r) * SQRT1_2 * scale;
          const dist = Math.hypot(px, py);
          if (dist > radius) {
            const k = radius / dist;
            px *= k;
            py *= k;
          }
          trailCtx.fillRect(cx + px - 0.75, cy + py - 0.75, 1.5, 1.5);
        }

        // Direct DOM updates (0 React re-renders)
        if (widthValRef.current) {
          widthValRef.current.textContent = `${Math.round(smoothTelemetry.widthPct)}%`;
        }
        if (balanceValRef.current) {
          balanceValRef.current.textContent = formatStereoBalance(smoothTelemetry.balance);
        }
        if (corrValRef.current) {
          const c = smoothTelemetry.corr;
          corrValRef.current.textContent = `${c >= 0 ? '+' : ''}${c.toFixed(2)}`;
          corrValRef.current.style.color =
            c < 0
              ? 'var(--status-alert)'
              : c < 0.2
              ? 'var(--status-caution)'
              : 'var(--status-safe)';
        }
      } else {
        if (!isPlayingRef.current) {
          clearTrail();
          if (widthValRef.current) widthValRef.current.textContent = '—';
          if (balanceValRef.current) balanceValRef.current.textContent = 'C';
          if (corrValRef.current) {
            corrValRef.current.textContent = '—';
            corrValRef.current.style.color = 'var(--text-primary)';
          }
        }
      }
      trailCtx.restore();

      // 2. Composite phosphor trail onto visible canvas, then draw crisp graticule on top
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(trailCanvas, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawGraticule(ctx, cx, cy, radius, pal, !hasSamples && !isPlayingRef.current);
      ctx.restore();
    };

    let rafId = 0;
    const loop = () => {
      drawFrame();
      if (isPlayingRef.current) {
        rafId = requestAnimationFrame(loop);
      }
    };

    drawFrame();
    if (audioState.isPlaying) {
      rafId = requestAnimationFrame(loop);
    }

    const resizeObs = new ResizeObserver(() => {
      resizeCanvas();
      drawFrame();
    });
    resizeObs.observe(container);

    const themeObs = new MutationObserver(() => {
      paletteRef.current = readScopePalette();
      clearTrail();
      drawFrame();
    });
    themeObs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      cancelAnimationFrame(rafId);
      resizeObs.disconnect();
      themeObs.disconnect();
    };
  }, [engine, audioState.isPlaying]);

  const activeFeedLabel = `${
    audioState.activeDeck === 'A'
      ? 'Deck A'
      : audioState.activeDeck === 'B'
      ? 'Ref B'
      : 'Rev v2'
  } · ${audioState.monoMode ? 'Mono Fold' : 'Stereo'} · ${
    TRANSLATION_PROFILES[audioState.translationMode].shortLabel
  }`;

  return (
    <section
      aria-label="2D Stereo Imager and Goniometer"
      data-testid="stereo-imager-vectorscope"
      className="h-full studio-elevated squircle-outer p-5 md:p-6 flex flex-col justify-between space-y-4"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2 pb-3.5 studio-hairline-b">
        <div className="min-w-0">
          <div className="text-[11px] font-mono text-[var(--accent-primary)] font-medium">
            60fps Lissajous M/S Field · Post-Translation Bus
          </div>
          <h3 className="text-sm font-bold text-[var(--text-primary)] mt-0.5">
            2D Stereo Imager / Goniometer
          </h3>
        </div>

        <span
          data-testid="vectorscope-feed-badge"
          className="px-2.5 py-1 squircle-inner font-mono text-[10px] font-medium border border-[var(--border-hairline-color)] bg-[var(--bg-surface)] text-[var(--text-secondary)] whitespace-nowrap"
        >
          {activeFeedLabel}
        </span>
      </div>

      {/* 60fps HTML5 Canvas Goniometer Stage */}
      <div
        ref={containerRef}
        className="w-full squircle-inner border border-[var(--border-hairline-color)] bg-[var(--bg-elevated)] overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          data-testid="stereo-imager-vectorscope-canvas"
          role="img"
          aria-label="Real-time 2D stereo goniometer Lissajous Mid/Side plot"
          className="block w-full"
        />
      </div>

      {/* Direct-Ref Tabular Numeric Readouts (Zero 60Hz React Re-renders) */}
      <div className="grid grid-cols-3 gap-2.5 pt-3 studio-hairline-t font-mono tabular-nums">
        <div className="squircle-inner studio-surface px-3 py-2">
          <div className="text-[10px] font-sans text-[var(--text-secondary)]">Stereo Width</div>
          <div
            ref={widthValRef}
            data-testid="live-stereo-width"
            className="text-sm font-bold text-[var(--text-primary)] mt-0.5"
          >
            —
          </div>
        </div>
        <div className="squircle-inner studio-surface px-3 py-2">
          <div className="text-[10px] font-sans text-[var(--text-secondary)]">L/R Balance</div>
          <div
            ref={balanceValRef}
            data-testid="live-stereo-balance"
            className="text-sm font-bold text-[var(--text-primary)] mt-0.5"
          >
            C
          </div>
        </div>
        <div className="squircle-inner studio-surface px-3 py-2">
          <div className="text-[10px] font-sans text-[var(--text-secondary)]">Live Phase</div>
          <div
            ref={corrValRef}
            data-testid="live-vectorscope-phase"
            className="text-sm font-bold text-[var(--text-primary)] mt-0.5"
          >
            —
          </div>
        </div>
      </div>
    </section>
  );
};

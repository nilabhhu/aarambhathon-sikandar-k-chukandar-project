import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { AnalysisIssue } from '../contracts/analysisContract';
import { useStudioAudioEngine, useStudioAudioState } from '../audio/StudioAudioContext';
import { SixBandMeasurements } from '../audio/spectralProfile';
import {
  LIVE_SPECTRUM_ZONES,
  LiveSpectrumZoneId,
  SPECTRUM_GRID_FREQS,
  SPECTRUM_MAX_DB,
  SPECTRUM_MIN_DB,
  aggregateFftToLogBars,
  computeHeroHarmonicWave,
  findZoneAtFreq,
  formatFreqHz,
  freqToLogRatio,
  logRatioToFreq,
  mapIssueToLiveZone,
  mapStaticSpectrumToLogBars,
  spectrumDbToNorm,
  updatePeakHolds,
} from '../audio/liveSpectrumMath';

export interface LiveSpectrumAnalyzerProps {
  mode: 'hero' | 'simple' | 'advanced';
  issues?: AnalysisIssue[];
  activeIssueId?: string | null;
  staticSpectrumBins?: number[] | null;
  staticSixBands?: SixBandMeasurements | null;
  onSelectZone?: (zoneId: LiveSpectrumZoneId, matchedIssueId: string | null) => void;
  height?: number;
  showControls?: boolean;
  title?: string;
  subtitle?: string;
}

const BAR_COUNT_BY_MODE = {
  hero: 56,
  simple: 48,
  advanced: 64,
} as const;

export const LiveSpectrumAnalyzer: React.FC<LiveSpectrumAnalyzerProps> = ({
  mode,
  issues = [],
  activeIssueId = null,
  staticSpectrumBins = null,
  staticSixBands = null,
  onSelectZone,
  height,
  showControls = false,
  title,
  subtitle,
}) => {
  const engine = useStudioAudioEngine();
  const audioState = useStudioAudioState();

  const barCount = BAR_COUNT_BY_MODE[mode];
  const canvasHeight = height ?? (mode === 'hero' ? 236 : mode === 'simple' ? 204 : 244);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const statusReadoutRef = useRef<HTMLSpanElement | null>(null);
  const hoverReadoutRef = useRef<HTMLSpanElement | null>(null);

  const [selectedZoneId, setSelectedZoneId] = useState<LiveSpectrumZoneId | null>(null);

  // Map issues to their 6 spectrum zones
  const zoneIssueMap = useMemo(() => {
    const map = new Map<LiveSpectrumZoneId, AnalysisIssue>();
    const rank: Record<string, number> = { critical: 3, warning: 2, notice: 1, pass: 0 };
    for (const issue of issues) {
      const zoneId = mapIssueToLiveZone(issue);
      const existing = map.get(zoneId);
      if (!existing || (rank[issue.severity] ?? 0) > (rank[existing.severity] ?? 0)) {
        map.set(zoneId, issue);
      }
    }
    return map;
  }, [issues]);

  // Sync selected zone when an external issue card is clicked
  const activeIssueZoneId = useMemo<LiveSpectrumZoneId | null>(() => {
    if (!activeIssueId) return null;
    const found = issues.find((i) => i.issue_id === activeIssueId);
    return found ? mapIssueToLiveZone(found) : null;
  }, [activeIssueId, issues]);

  const effectiveSelectedZone = activeIssueZoneId ?? selectedZoneId;

  // Pre-allocated zero-GC buffers for 60fps rAF
  const fftBufRef = useRef<Float32Array>(new Float32Array(1024));
  const rawBarsRef = useRef<Float32Array>(new Float32Array(barCount));
  const smoothBarsRef = useRef<Float32Array>(new Float32Array(barCount).fill(SPECTRUM_MIN_DB));
  const peakHoldRef = useRef<Float32Array>(new Float32Array(barCount).fill(SPECTRUM_MIN_DB));
  const peakTimerRef = useRef<Float32Array>(new Float32Array(barCount));

  // Pointer state stored strictly in ref (ZERO React re-renders at 60Hz)
  const pointerRef = useRef<{
    active: boolean;
    x: number;
    y: number;
    ratioX: number;
    hz: number;
    zoneId: LiveSpectrumZoneId;
  }>({
    active: false,
    x: 0,
    y: 0,
    ratioX: -1,
    hz: 1000,
    zoneId: 'high_mid',
  });

  // Keep latest reactive props in a ref so the rAF loop never tears down
  const propsRef = useRef({
    mode,
    barCount,
    canvasHeight,
    isPlaying: audioState.isPlaying,
    hasPrimaryMix: audioState.hasPrimaryMix,
    staticSpectrumBins: staticSpectrumBins ?? audioState.primarySpectrumBins,
    staticSixBands: staticSixBands ?? audioState.primarySixBands,
    effectiveSelectedZone,
    zoneIssueMap,
  });

  propsRef.current = {
    mode,
    barCount,
    canvasHeight,
    isPlaying: audioState.isPlaying,
    hasPrimaryMix: audioState.hasPrimaryMix,
    staticSpectrumBins: staticSpectrumBins ?? audioState.primarySpectrumBins,
    staticSixBands: staticSixBands ?? audioState.primarySixBands,
    effectiveSelectedZone,
    zoneIssueMap,
  };

  // Ensure buffers match barCount if mode changes
  if (rawBarsRef.current.length !== barCount) {
    rawBarsRef.current = new Float32Array(barCount);
    smoothBarsRef.current = new Float32Array(barCount).fill(SPECTRUM_MIN_DB);
    peakHoldRef.current = new Float32Array(barCount).fill(SPECTRUM_MIN_DB);
    peakTimerRef.current = new Float32Array(barCount);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotionQuery =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;

    let cssW = Math.max(280, container.clientWidth);
    let dpr = Math.min(2, window.devicePixelRatio || 1);

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cssW = Math.max(260, container.clientWidth);
      const h = propsRef.current.canvasHeight;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${h}px`;
    };

    resize();

    let rafId = 0;
    let lastTs = performance.now();
    let mounted = true;

    const drawFrame = (nowMs: number) => {
      if (!mounted) return;
      const dtSec = Math.min(0.1, Math.max(0.001, (nowMs - lastTs) / 1000));
      lastTs = nowMs;

      const p = propsRef.current;
      const cssH = p.canvasHeight;
      const padLeft = 36;
      const padRight = 14;
      const padTop = 20;
      const padBottom = 26;
      const plotW = Math.max(120, cssW - padLeft - padRight);
      const plotH = Math.max(80, cssH - padTop - padBottom);

      const rawBars = rawBarsRef.current;
      const smoothBars = smoothBarsRef.current;
      const peakHolds = peakHoldRef.current;
      const peakTimers = peakTimerRef.current;
      const ptr = pointerRef.current;
      const reducedMotion = Boolean(reducedMotionQuery?.matches);

      // 1. Source spectrum data (Live 60fps FFT -> Static Track Welch Curve -> Hero Harmonic Wave)
      const gotLiveFft = engine.getLiveFrequencyData(fftBufRef.current);
      let sourceMode: 'LIVE_FFT' | 'STATIC_WELCH' | 'HERO_WAVE' = 'HERO_WAVE';

      if (gotLiveFft) {
        sourceMode = 'LIVE_FFT';
        aggregateFftToLogBars(fftBufRef.current, engine.getSampleRate(), rawBars);
      } else if (p.mode !== 'hero') {
        const mapped = mapStaticSpectrumToLogBars(
          rawBars,
          p.staticSpectrumBins,
          p.staticSixBands
        );
        if (mapped) {
          sourceMode = 'STATIC_WELCH';
        } else {
          rawBars.fill(SPECTRUM_MIN_DB);
          sourceMode = 'STATIC_WELCH';
        }
      } else {
        sourceMode = 'HERO_WAVE';
        computeHeroHarmonicWave(
          rawBars,
          nowMs / 1000,
          ptr.active ? ptr.ratioX : null,
          reducedMotion
        );
      }

      // 2. Smooth bar ballistics & falling vermilion peak-hold caps (zero allocations)
      const attackAlpha = sourceMode === 'STATIC_WELCH' ? 0.35 : 0.62;
      const releaseAlpha = sourceMode === 'STATIC_WELCH' ? 0.25 : 0.22;
      for (let i = 0; i < p.barCount; i++) {
        const target = rawBars[i];
        const cur = smoothBars[i];
        const alpha = target > cur ? attackAlpha : releaseAlpha;
        smoothBars[i] = cur + (target - cur) * alpha;
      }

      if (sourceMode === 'STATIC_WELCH') {
        for (let i = 0; i < p.barCount; i++) {
          peakHolds[i] = smoothBars[i];
          peakTimers[i] = 0;
        }
      } else {
        updatePeakHolds(smoothBars, peakHolds, peakTimers, dtSec);
      }

      // Direct DOM text updates (zero React re-renders)
      if (statusReadoutRef.current) {
        statusReadoutRef.current.textContent =
          sourceMode === 'LIVE_FFT'
            ? 'LIVE 60FPS FFT · 2048 PT'
            : sourceMode === 'STATIC_WELCH'
            ? 'PAUSED · WELCH PSD CURVE'
            : 'INTERACTIVE HARMONIC FIELD';
      }

      // 3. Paint Stark #0A0A0A Swiss Brutalist Canvas
      ctx.save();
      ctx.scale(dpr, dpr);

      // Stark Black Stage
      ctx.fillStyle = '#0A0A0A';
      ctx.fillRect(0, 0, cssW, cssH);

      // Subtle zone background highlight for active/flagged/hovered zone
      const hoveredZoneId = ptr.active ? ptr.zoneId : null;
      const highlightZoneId = hoveredZoneId ?? p.effectiveSelectedZone;

      for (const z of LIVE_SPECTRUM_ZONES) {
        const zx0 = padLeft + freqToLogRatio(z.minHz) * plotW;
        const zx1 = padLeft + freqToLogRatio(z.maxHz) * plotW;
        const issue = p.zoneIssueMap.get(z.id);
        const isFocused = highlightZoneId === z.id;

        if (isFocused) {
          ctx.fillStyle = 'rgba(255, 214, 0, 0.11)';
          ctx.fillRect(zx0, padTop, zx1 - zx0, plotH);
        } else if (issue) {
          ctx.fillStyle =
            issue.severity === 'critical'
              ? 'rgba(255, 59, 31, 0.12)'
              : 'rgba(255, 214, 0, 0.06)';
          ctx.fillRect(zx0, padTop, zx1 - zx0, plotH);
        }
      }

      // Horizontal dBFS gridlines
      const dbTicks = [-12, -24, -42, -60, -78];
      ctx.font = '500 9.5px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      for (const db of dbTicks) {
        const y = Math.round(padTop + (1 - spectrumDbToNorm(db)) * plotH) + 0.5;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padLeft, y);
        ctx.lineTo(padLeft + plotW, y);
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.52)';
        ctx.fillText(`${db}`, padLeft - 6, y);
      }

      // Vertical logarithmic frequency gridlines (30, 60, 125, 250, 500, 1k, 2k, 4k, 8k, 16k Hz)
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const tick of SPECTRUM_GRID_FREQS) {
        const x = Math.round(padLeft + freqToLogRatio(tick.hz) * plotW) + 0.5;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.13)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, padTop);
        ctx.lineTo(x, padTop + plotH);
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.fillText(tick.label, x, padTop + plotH + 7);
      }

      // Crisp rectangular plot frame
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(padLeft + 0.5, padTop + 0.5, plotW - 1, plotH - 1);

      // 4. Crisp Rectangular Swiss Spectrum Bars (0px radius!)
      const slotW = plotW / p.barCount;
      const gap = slotW > 7 ? 2 : 1;
      const barW = Math.max(2, Math.floor(slotW - gap));

      let hoveredBarDb = SPECTRUM_MIN_DB;

      for (let i = 0; i < p.barCount; i++) {
        const x = Math.round(padLeft + i * slotW + (slotW - barW) * 0.5);
        const centerHz = logRatioToFreq((i + 0.5) / p.barCount);
        const barZone = findZoneAtFreq(centerHz);
        const isHighlightedZone = highlightZoneId === barZone.id;
        const zoneIssue = p.zoneIssueMap.get(barZone.id);

        const norm = spectrumDbToNorm(smoothBars[i]);
        const barH = Math.max(1, Math.round(norm * plotH));
        const barY = padTop + plotH - barH;

        // Track exact dB at hovered bar
        if (ptr.active) {
          const hoveredIndex = Math.max(
            0,
            Math.min(p.barCount - 1, Math.floor(ptr.ratioX * p.barCount))
          );
          if (i === hoveredIndex) {
            hoveredBarDb = smoothBars[i];
          }
        }

        // Strict Swiss bar palette: #FFFFFF default, #FFD600 hovered/active band, #FF3B1F critical issue peak
        if (isHighlightedZone) {
          ctx.fillStyle = '#FFD600';
        } else if (zoneIssue?.severity === 'critical' && norm > 0.52) {
          ctx.fillStyle = '#FF3B1F';
        } else {
          ctx.fillStyle = '#FFFFFF';
        }

        if (norm > 0.005) {
          ctx.fillRect(x, barY, barW, barH);
        }

        // Falling Vermilion Peak-Hold Cap (#FF3B1F)
        const peakNorm = spectrumDbToNorm(peakHolds[i]);
        if (peakNorm > 0.02) {
          const capY = Math.max(padTop + 1, Math.round(padTop + plotH - peakNorm * plotH) - 2);
          ctx.fillStyle = '#FF3B1F';
          ctx.fillRect(x, capY, barW, 2.5);
        }
      }

      // 5. Interactive Vertical Crosshair & Live Hz / dBFS Telemetry HUD
      if (ptr.active) {
        const cx = Math.max(padLeft, Math.min(padLeft + plotW, Math.round(ptr.x) + 0.5));
        ctx.strokeStyle = '#FFD600';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, padTop);
        ctx.lineTo(cx, padTop + plotH);
        ctx.stroke();

        // Crisp 0px telemetry callout box
        const zoneDef = findZoneAtFreq(ptr.hz);
        const readout = `${zoneDef.code} · ${formatFreqHz(ptr.hz)} · ${hoveredBarDb.toFixed(1)} dBFS`;
        if (hoverReadoutRef.current) {
          hoverReadoutRef.current.textContent = readout;
        }

        ctx.font = '600 10.5px "JetBrains Mono", ui-monospace, monospace';
        const textW = ctx.measureText(readout).width;
        const boxW = textW + 14;
        const boxH = 22;
        const boxX = cx + 8 + boxW > padLeft + plotW ? cx - boxW - 8 : cx + 8;
        const boxY = padTop + 6;

        ctx.fillStyle = '#FFD600';
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.strokeStyle = '#0A0A0A';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(boxX, boxY, boxW, boxH);

        ctx.fillStyle = '#0A0A0A';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(readout, boxX + 7, boxY + boxH / 2 + 0.5);
      } else if (hoverReadoutRef.current) {
        const activeZ = LIVE_SPECTRUM_ZONES.find((z) => z.id === highlightZoneId);
        hoverReadoutRef.current.textContent = activeZ
          ? `BAND: ${activeZ.code} (${activeZ.rangeLabel})`
          : 'HOVER SPECTRUM · CLICK BAND';
      }

      ctx.restore();

      // Keep 60fps loop alive when playing, in hero mode (unless reduced motion), or while pointer interacts
      const shouldLoop =
        p.isPlaying ||
        (p.mode === 'hero' && !reducedMotion) ||
        ptr.active;

      if (shouldLoop) {
        rafId = requestAnimationFrame(drawFrame);
      }
    };

    const scheduleOne = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(drawFrame);
    };

    scheduleOne();

    const resizeObs = new ResizeObserver(() => {
      resize();
      scheduleOne();
    });
    resizeObs.observe(container);

    // Trigger redraw on pointer interaction even when paused
    const handlePointerWake = () => scheduleOne();
    canvas.addEventListener('pointermove', handlePointerWake);
    canvas.addEventListener('pointerleave', handlePointerWake);

    return () => {
      mounted = false;
      cancelAnimationFrame(rafId);
      resizeObs.disconnect();
      canvas.removeEventListener('pointermove', handlePointerWake);
      canvas.removeEventListener('pointerleave', handlePointerWake);
    };
  }, [
    engine,
    audioState.isPlaying,
    audioState.hasPrimaryMix,
    audioState.primaryFileName,
    staticSpectrumBins,
    staticSixBands,
    effectiveSelectedZone,
    mode,
    barCount,
    canvasHeight,
  ]);

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const padLeft = 36;
    const padRight = 14;
    const plotW = Math.max(120, rect.width - padLeft - padRight);
    const ratioX = Math.max(0, Math.min(1, (x - padLeft) / plotW));
    const hz = logRatioToFreq(ratioX);
    const zone = findZoneAtFreq(hz);

    pointerRef.current = {
      active: true,
      x,
      y,
      ratioX,
      hz,
      zoneId: zone.id,
    };
  };

  const handlePointerLeave = () => {
    pointerRef.current.active = false;
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const padLeft = 36;
    const padRight = 14;
    const plotW = Math.max(120, rect.width - padLeft - padRight);
    const ratioX = Math.max(0, Math.min(1, (x - padLeft) / plotW));
    const hz = logRatioToFreq(ratioX);
    const zone = findZoneAtFreq(hz);
    handleZoneTrigger(zone.id);
  };

  const handleZoneTrigger = (zoneId: LiveSpectrumZoneId) => {
    setSelectedZoneId(zoneId);
    const matchedIssue = zoneIssueMap.get(zoneId) ?? null;
    if (onSelectZone) {
      onSelectZone(zoneId, matchedIssue?.issue_id ?? null);
    }
  };

  return (
    <div
      data-testid={`live-spectrum-analyzer-${mode}`}
      className="border-2 border-[var(--border-ink)] bg-[#0A0A0A] text-white"
    >
      {/* Top Instrument Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 border-b-[1.5px] border-white/20 bg-[#0A0A0A]">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`w-2.5 h-2.5 shrink-0 ${
              audioState.isPlaying ? 'bg-[#FF3B1F]' : 'bg-[#FFD600]'
            }`}
            aria-hidden="true"
          />
          <span className="font-ui text-xs font-bold uppercase tracking-wider text-white truncate">
            {title || 'LIVE SPECTRUM ANALYZER · 20 HZ – 20 KHZ'}
          </span>
          {subtitle && (
            <span className="hidden sm:inline text-[11px] font-mono text-white/55 truncate">
              / {subtitle}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            ref={statusReadoutRef}
            className="font-mono text-[10px] tracking-wider uppercase text-[#FFD600] tabular-nums"
          >
            {audioState.isPlaying
              ? 'LIVE 60FPS FFT · 2048 PT'
              : mode === 'hero'
              ? 'INTERACTIVE HARMONIC FIELD'
              : 'PAUSED · WELCH PSD CURVE'}
          </span>

          {showControls && (
            <div className="flex items-center border-l border-white/25 pl-2 gap-1.5">
              <button
                type="button"
                onClick={() => engine.togglePlay()}
                disabled={!audioState.hasPrimaryMix}
                aria-label={audioState.isPlaying ? 'Pause track' : 'Play track'}
                data-testid="spectrum-play-toggle"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#FFD600] text-[#0A0A0A] hover:bg-white font-mono text-[11px] font-bold uppercase tracking-wider transition-colors disabled:opacity-40 cursor-pointer"
              >
                {audioState.isPlaying ? (
                  <>
                    <Pause className="w-3 h-3" />
                    <span>PAUSE</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3" />
                    <span>PLAY</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => engine.seek(0, true)}
                disabled={!audioState.hasPrimaryMix}
                aria-label="Restart track from beginning"
                className="p-1 border border-white/30 text-white hover:bg-white hover:text-[#0A0A0A] transition-colors disabled:opacity-40 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stark #0A0A0A 60fps HTML5 Canvas Stage */}
      <div ref={containerRef} className="relative w-full bg-[#0A0A0A] overflow-hidden">
        <canvas
          ref={canvasRef}
          data-testid="live-spectrum-canvas"
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onClick={handleCanvasClick}
          role="img"
          aria-label="Live 60fps logarithmic 20 Hz to 20 kHz audio spectrum analyzer"
          className="block w-full cursor-crosshair select-none"
        />
      </div>

      {/* Bottom 6-Band Interactive Zone Selector & Live Readout */}
      <div className="border-t-[1.5px] border-white/20 grid grid-cols-3 sm:grid-cols-6 bg-[#0A0A0A]">
        {LIVE_SPECTRUM_ZONES.map((zone, idx) => {
          const isSelected = effectiveSelectedZone === zone.id;
          const issue = zoneIssueMap.get(zone.id);
          return (
            <button
              key={zone.id}
              type="button"
              onClick={() => handleZoneTrigger(zone.id)}
              data-testid={`live-spectrum-zone-${zone.id}`}
              aria-pressed={isSelected}
              className={`px-2 py-2 text-left transition-colors cursor-pointer border-white/20 ${
                idx < 5 ? 'border-r' : ''
              } ${idx < 3 ? 'border-b sm:border-b-0' : ''} ${
                isSelected
                  ? 'bg-[#FFD600] text-[#0A0A0A]'
                  : issue?.severity === 'critical'
                  ? 'bg-[#FF3B1F] text-white hover:bg-[#FF3B1F]/90'
                  : 'bg-[#0A0A0A] text-white hover:bg-white/10'
              }`}
            >
              <div className="flex items-center justify-between gap-1 font-mono text-[10px] font-bold tracking-wider">
                <span>{zone.code}</span>
                {issue && (
                  <span
                    className={`px-1 text-[9px] font-bold ${
                      isSelected
                        ? 'bg-[#0A0A0A] text-[#FFD600]'
                        : 'bg-[#0A0A0A] text-[#FFD600]'
                    }`}
                  >
                    !
                  </span>
                )}
              </div>
              <div
                className={`font-mono text-[9.5px] tabular-nums mt-0.5 ${
                  isSelected
                    ? 'text-[#0A0A0A]/80'
                    : issue?.severity === 'critical'
                    ? 'text-white/90'
                    : 'text-white/55'
                }`}
              >
                {zone.rangeLabel}
              </div>
            </button>
          );
        })}
      </div>

      {/* Compact Telemetry Footer */}
      <div className="px-3.5 py-1.5 border-t border-white/15 bg-[#0A0A0A] flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-white/60 tabular-nums">
        <span ref={hoverReadoutRef} className="text-white/85">
          HOVER SPECTRUM · CLICK BAND
        </span>
        <span>LOG 20 HZ – 20 KHZ · PEAK HOLD</span>
      </div>
    </div>
  );
};

import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { RotateCcw } from 'lucide-react';
import { GenreId, MixStage } from '../contracts/analysisContract';
import { GENRE_LABELS, MIX_STAGE_LABELS } from '../contracts/demoFixtures';
import { useStudioAudioEngine, useStudioAudioState } from '../audio/StudioAudioContext';
import {
  METER_SILENCE_FLOOR_DB,
  dbToMeterRatio,
  formatLufs,
  formatPeakDb,
} from '../audio/realtimeMeters';
import { TACTILE_TAP } from '../lib/motion';

interface RealtimeLoudnessPeakMeterProps {
  genre: GenreId;
  mixStage: MixStage;
  targetMinLufs?: number | null;
  targetMaxLufs?: number | null;
}

const DB_MIN = -60;
const DB_MAX = 0;
const TICK_MARKS = [-60, -48, -24, -12, -6, -3, 0];

interface MeterPalette {
  surface: string;
  trackBg: string;
  hairline: string;
  textPrimary: string;
  textSecondary: string;
  teal: string;
  tealSoft: string;
  safe: string;
  caution: string;
  alert: string;
}

function readPalette(): MeterPalette {
  const isDark =
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark');

  if (isDark) {
    return {
      surface: '#141B19',
      trackBg: '#1D2724',
      hairline: 'rgba(242, 245, 244, 0.11)',
      textPrimary: '#F2F5F4',
      textSecondary: '#9BA8A4',
      teal: '#3B9688',
      tealSoft: 'rgba(59, 150, 136, 0.24)',
      safe: '#22C55E',
      caution: '#F59E0B',
      alert: '#F43F5E',
    };
  }

  return {
    surface: '#FFFFFF',
    trackBg: '#F1F3F2',
    hairline: 'rgba(24, 34, 32, 0.09)',
    textPrimary: '#182220',
    textSecondary: '#52605D',
    teal: '#3A7269',
    tealSoft: 'rgba(58, 114, 105, 0.18)',
    safe: '#15803D',
    caution: '#B45309',
    alert: '#BE123C',
  };
}

export const RealtimeLoudnessPeakMeter: React.FC<RealtimeLoudnessPeakMeterProps> = ({
  genre,
  mixStage,
  targetMinLufs,
  targetMaxLufs,
}) => {
  const engine = useStudioAudioEngine();
  const audioState = useStudioAudioState();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Direct DOM refs updated at 60fps — ZERO React state updates per frame
  const mLufsRef = useRef<HTMLDivElement | null>(null);
  const stLufsRef = useRef<HTMLDivElement | null>(null);
  const peakLRef = useRef<HTMLDivElement | null>(null);
  const peakRRef = useRef<HTMLDivElement | null>(null);
  const clipBadgeRef = useRef<HTMLSpanElement | null>(null);

  const isUnmastered = mixStage === 'unmastered_mix';
  const effTargetMin =
    typeof targetMinLufs === 'number' && Number.isFinite(targetMinLufs)
      ? targetMinLufs
      : isUnmastered
      ? -18.0
      : -14.0;
  const effTargetMax =
    typeof targetMaxLufs === 'number' && Number.isFinite(targetMaxLufs)
      ? targetMaxLufs
      : isUnmastered
      ? -14.0
      : -9.0;

  const targetRef = useRef({ min: effTargetMin, max: effTargetMax });
  targetRef.current = { min: effTargetMin, max: effTargetMax };

  const paletteRef = useRef<MeterPalette>(readPalette());
  const isPlayingRef = useRef(audioState.isPlaying);
  isPlayingRef.current = audioState.isPlaying;

  // Smoothed visual meter states (local to rAF, zero React re-renders)
  const smoothRef = useRef({
    peakL: -70,
    peakR: -70,
    momentary: METER_SILENCE_FLOOR_DB,
    shortTerm: METER_SILENCE_FLOOR_DB,
  });

  const handleResetPeakHold = () => {
    engine.resetLivePeakHold();
    if (clipBadgeRef.current) {
      clipBadgeRef.current.textContent = isPlayingRef.current ? 'LIVE · SAFE' : 'IDLE';
      clipBadgeRef.current.dataset.clipping = 'false';
      clipBadgeRef.current.className =
        'px-2 py-0.5 squircle-inner font-mono text-[10px] font-semibold border border-[var(--border-hairline-color)] bg-[var(--bg-surface)] text-[var(--text-secondary)]';
    }
    if (!isPlayingRef.current) {
      if (peakLRef.current) peakLRef.current.textContent = '-∞ dBFS';
      if (peakRRef.current) peakRRef.current.textContent = '-∞ dBFS';
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = Math.max(280, container.clientWidth);
    const height = 216;
    let dpr = Math.min(2, window.devicePixelRatio || 1);

    const resizeCanvas = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = Math.max(260, container.clientWidth);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };

    resizeCanvas();

    const drawMeter = () => {
      const pal = paletteRef.current;
      const live = engine.getLiveLoudnessAndPeaks();
      const sm = smoothRef.current;

      // Fast attack, smooth studio ballistic release when playing; crisp zero reset when paused/stopped
      const targetPeakL = Number.isFinite(live.peakL) ? live.peakL : -70;
      const targetPeakR = Number.isFinite(live.peakR) ? live.peakR : -70;
      sm.peakL = live.isPlaying
        ? targetPeakL > sm.peakL
          ? targetPeakL
          : sm.peakL * 0.84 + targetPeakL * 0.16
        : -70;
      sm.peakR = live.isPlaying
        ? targetPeakR > sm.peakR
          ? targetPeakR
          : sm.peakR * 0.84 + targetPeakR * 0.16
        : -70;
      sm.momentary = live.isPlaying
        ? sm.momentary * 0.72 + live.momentaryLufs * 0.28
        : METER_SILENCE_FLOOR_DB;
      sm.shortTerm = live.isPlaying
        ? sm.shortTerm * 0.82 + live.shortTermLufs * 0.18
        : METER_SILENCE_FLOOR_DB;

      // Update DOM numeric readouts directly (0 React re-renders)
      if (mLufsRef.current) {
        mLufsRef.current.textContent = live.isPlaying
          ? formatLufs(live.momentaryLufs)
          : '-∞ LUFS';
      }
      if (stLufsRef.current) {
        stLufsRef.current.textContent = live.isPlaying
          ? formatLufs(live.shortTermLufs)
          : '-∞ LUFS';
      }
      if (peakLRef.current) {
        peakLRef.current.textContent = live.isPlaying
          ? formatPeakDb(live.peakL)
          : Number.isFinite(live.holdL)
          ? formatPeakDb(live.holdL)
          : '-∞ dBFS';
      }
      if (peakRRef.current) {
        peakRRef.current.textContent = live.isPlaying
          ? formatPeakDb(live.peakR)
          : Number.isFinite(live.holdR)
          ? formatPeakDb(live.holdR)
          : '-∞ dBFS';
      }
      if (clipBadgeRef.current) {
        const nextState = live.isClipping ? 'clip' : live.isPlaying ? 'live' : 'idle';
        const nextLabel = live.isClipping
          ? 'CLIP ≥ -0.1 dBFS'
          : live.isPlaying
          ? 'LIVE · SAFE'
          : 'IDLE';
        if (clipBadgeRef.current.dataset.state !== nextState) {
          clipBadgeRef.current.dataset.state = nextState;
          clipBadgeRef.current.dataset.clipping = live.isClipping ? 'true' : 'false';
          clipBadgeRef.current.textContent = nextLabel;
          clipBadgeRef.current.className = live.isClipping
            ? 'px-2 py-0.5 squircle-inner font-mono text-[10px] font-bold bg-[var(--status-alert)] text-white border border-[var(--status-alert)]'
            : live.isPlaying
            ? 'px-2 py-0.5 squircle-inner font-mono text-[10px] font-semibold bg-[var(--accent-soft)] text-[var(--accent-primary)] border border-[var(--border-active-color)]'
            : 'px-2 py-0.5 squircle-inner font-mono text-[10px] font-semibold border border-[var(--border-hairline-color)] bg-[var(--bg-surface)] text-[var(--text-secondary)]';
        }
      }

      // Paint 60fps Canvas
      ctx.save();
      ctx.scale(dpr, dpr);

      // Clear background
      ctx.fillStyle = pal.surface;
      ctx.fillRect(0, 0, width, height);

      const padLeft = 40;
      const padRight = 24;
      const barW = Math.max(120, width - padLeft - padRight);
      const dbToX = (db: number) => padLeft + dbToMeterRatio(db, DB_MIN, DB_MAX) * barW;

      // Top calibrated dB scale ruler
      ctx.font = '500 10px "Geist Mono", ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      for (const tick of TICK_MARKS) {
        const x = dbToX(tick);
        ctx.strokeStyle = pal.hairline;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, 22);
        ctx.lineTo(Math.round(x) + 0.5, height - 10);
        ctx.stroke();

        ctx.fillStyle = tick === 0 ? pal.alert : pal.textSecondary;
        ctx.fillText(tick === 0 ? '0' : `${tick}`, x, 6);
      }

      // Reusable horizontal peak bar gradient (-60 -> 0 dBFS)
      const peakGrad = ctx.createLinearGradient(padLeft, 0, padLeft + barW, 0);
      peakGrad.addColorStop(0.0, pal.teal);
      peakGrad.addColorStop(0.74, pal.safe); // up to ~-15 dB
      peakGrad.addColorStop(0.88, pal.caution); // -7..-3 dB
      peakGrad.addColorStop(0.985, pal.alert); // >= -1 dB
      peakGrad.addColorStop(1.0, pal.alert);

      const drawPeakLane = (
        label: string,
        y: number,
        laneH: number,
        peakDb: number,
        holdDb: number,
        isClip: boolean
      ) => {
        // Channel label
        ctx.font = '600 11px "Geist Mono", ui-monospace, monospace';
        ctx.fillStyle = pal.textPrimary;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, 8, y + laneH / 2);

        // Recessed bar track
        ctx.fillStyle = pal.trackBg;
        ctx.beginPath();
        ctx.roundRect(padLeft, y, barW, laneH, 6);
        ctx.fill();

        // Active peak bar fill
        const fillW = dbToMeterRatio(peakDb, DB_MIN, DB_MAX) * barW;
        if (fillW > 1) {
          ctx.fillStyle = peakGrad;
          ctx.beginPath();
          ctx.roundRect(padLeft, y, fillW, laneH, 6);
          ctx.fill();
        }

        // Peak-hold cap
        if (Number.isFinite(holdDb) && holdDb > DB_MIN) {
          const hx = dbToX(holdDb);
          ctx.fillStyle = holdDb >= -0.1 ? pal.alert : holdDb >= -6 ? pal.caution : pal.textPrimary;
          ctx.fillRect(Math.max(padLeft, hx - 2), y + 1, 2.5, laneH - 2);
        }

        // Right-edge clip LED indicator
        const ledX = padLeft + barW + 6;
        ctx.fillStyle = isClip ? pal.alert : pal.trackBg;
        ctx.strokeStyle = isClip ? pal.alert : pal.hairline;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(ledX, y + 2, 10, laneH - 4, 3);
        ctx.fill();
        ctx.stroke();
      };

      // Dual L / R Peak Bars
      drawPeakLane('PK L', 32, 24, sm.peakL, live.holdL, live.isClipping);
      drawPeakLane('PK R', 64, 24, sm.peakR, live.holdR, live.isClipping);

      // Subtle section hairline separator
      ctx.strokeStyle = pal.hairline;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(8, 102.5);
      ctx.lineTo(width - 8, 102.5);
      ctx.stroke();

      // Momentary LUFS (400ms) & Short-Term LUFS (3s) Lane with Target Band Shading
      const lufsY = 126;
      const lufsH = 30;
      const { min: tMin, max: tMax } = targetRef.current;

      ctx.font = '600 10px "Geist Mono", ui-monospace, monospace';
      ctx.fillStyle = pal.textSecondary;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('MOMENTARY (400ms) · SHORT-TERM MARKER (3s)', padLeft, lufsY - 6);

      ctx.font = '600 11px "Geist Mono", ui-monospace, monospace';
      ctx.fillStyle = pal.teal;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('LUFS', 8, lufsY + lufsH / 2);

      // Recessed LUFS track
      ctx.fillStyle = pal.trackBg;
      ctx.beginPath();
      ctx.roundRect(padLeft, lufsY, barW, lufsH, 6);
      ctx.fill();

      // Shaded Genre/Stage Target Loudness Zone
      const tx0 = dbToX(tMin);
      const tx1 = dbToX(tMax);
      const tw = Math.max(4, tx1 - tx0);
      ctx.fillStyle = pal.tealSoft;
      ctx.fillRect(tx0, lufsY, tw, lufsH);

      ctx.strokeStyle = pal.teal;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.moveTo(tx0 + 0.5, lufsY - 2);
      ctx.lineTo(tx0 + 0.5, lufsY + lufsH + 2);
      ctx.moveTo(tx1 + 0.5, lufsY - 2);
      ctx.lineTo(tx1 + 0.5, lufsY + lufsH + 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Momentary LUFS bar fill
      const mRatio = dbToMeterRatio(sm.momentary, DB_MIN, DB_MAX);
      const mW = mRatio * barW;
      if (live.isPlaying && mW > 1) {
        const barColor =
          sm.momentary > tMax + 2.0
            ? pal.alert
            : sm.momentary > tMax
            ? pal.caution
            : pal.teal;
        ctx.fillStyle = barColor;
        ctx.beginPath();
        ctx.roundRect(padLeft, lufsY + 5, mW, lufsH - 10, 4);
        ctx.fill();
      }

      // Short-Term (3s) LUFS Precision Diamond & Cursor
      if (live.isPlaying && sm.shortTerm > DB_MIN) {
        const stX = dbToX(sm.shortTerm);
        ctx.strokeStyle = pal.textPrimary;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(stX, lufsY + 1);
        ctx.lineTo(stX, lufsY + lufsH - 1);
        ctx.stroke();

        ctx.fillStyle = pal.textPrimary;
        ctx.beginPath();
        ctx.moveTo(stX, lufsY - 3);
        ctx.lineTo(stX + 4, lufsY + 2);
        ctx.lineTo(stX, lufsY + 6);
        ctx.lineTo(stX - 4, lufsY + 2);
        ctx.closePath();
        ctx.fill();
      }

      // Target Zone Caption below LUFS lane
      ctx.font = '500 10px "Geist Mono", ui-monospace, monospace';
      ctx.fillStyle = pal.teal;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const labelCenter = Math.max(padLeft + 46, Math.min(width - 54, (tx0 + tx1) / 2));
      ctx.fillText(`Target ${tMin.toFixed(0)}..${tMax.toFixed(0)} LUFS`, labelCenter, lufsY + lufsH + 6);

      // Clean Idle Banner when paused (never empty or broken)
      if (!live.isPlaying) {
        const pillText = 'Press Play for Live Metering';
        ctx.font = '500 11px "DM Sans", sans-serif';
        const textW = ctx.measureText(pillText).width;
        const boxW = textW + 24;
        const boxH = 26;
        const boxX = padLeft + (barW - boxW) / 2;
        const boxY = height - 34;

        ctx.fillStyle = pal.trackBg;
        ctx.strokeStyle = pal.hairline;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = pal.textSecondary;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pillText, boxX + boxW / 2, boxY + boxH / 2 + 0.5);
      }

      ctx.restore();
    };

    let rafId = 0;
    const loop = () => {
      drawMeter();
      if (isPlayingRef.current) {
        rafId = requestAnimationFrame(loop);
      }
    };

    // Draw initial state immediately and start 60fps rAF loop if playing
    drawMeter();
    if (audioState.isPlaying) {
      rafId = requestAnimationFrame(loop);
    }

    const resizeObs = new ResizeObserver(() => {
      resizeCanvas();
      drawMeter();
    });
    resizeObs.observe(container);

    const themeObs = new MutationObserver(() => {
      paletteRef.current = readPalette();
      drawMeter();
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
  }, [engine, audioState.isPlaying, effTargetMin, effTargetMax]);

  return (
    <section
      aria-label="Real-Time LUFS and L/R Peak Meter"
      data-testid="realtime-lufs-peak-meter"
      className="h-full studio-elevated squircle-outer p-5 md:p-6 flex flex-col justify-between space-y-4"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2 pb-3.5 studio-hairline-b">
        <div className="min-w-0">
          <div className="text-[11px] font-mono text-[var(--accent-primary)] font-medium">
            60fps Live Output Telemetry · {GENRE_LABELS[genre]} ({MIX_STAGE_LABELS[mixStage].title})
          </div>
          <h3 className="text-sm font-bold text-[var(--text-primary)] mt-0.5">
            Real-Time LUFS &amp; L/R Peak Meter
          </h3>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            ref={clipBadgeRef}
            data-testid="live-clip-badge"
            data-clipping="false"
            className="px-2 py-0.5 squircle-inner font-mono text-[10px] font-semibold border border-[var(--border-hairline-color)] bg-[var(--bg-surface)] text-[var(--text-secondary)]"
          >
            {audioState.isPlaying ? 'LIVE · SAFE' : 'IDLE'}
          </span>
          <motion.button
            type="button"
            whileTap={TACTILE_TAP}
            onClick={handleResetPeakHold}
            data-testid="reset-peak-hold-btn"
            className="inline-flex items-center gap-1 px-2.5 py-1 squircle-inner border border-[var(--border-hairline-color)] bg-[var(--bg-surface)] hover:border-[var(--border-active-color)] text-[11px] font-medium text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3 text-[var(--accent-primary)]" />
            <span>Reset Peak Hold</span>
          </motion.button>
        </div>
      </div>

      {/* 60fps HTML5 Canvas Stage */}
      <div
        ref={containerRef}
        className="w-full squircle-inner border border-[var(--border-hairline-color)] bg-[var(--bg-elevated)] overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          data-testid="realtime-lufs-peak-canvas"
          role="img"
          aria-label="Real-time Left and Right sample peak meters and Momentary/Short-Term LUFS bar graph"
          className="block w-full"
        />
      </div>

      {/* Direct-Ref Tabular Numeric Readouts (Zero 60Hz React Re-renders) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 studio-hairline-t font-mono tabular-nums">
        <div className="squircle-inner studio-surface px-3 py-2">
          <div className="text-[10px] font-sans text-[var(--text-secondary)]">M-LUFS (400ms)</div>
          <div
            ref={mLufsRef}
            data-testid="live-momentary-lufs"
            className="text-sm font-bold text-[var(--text-primary)] mt-0.5"
          >
            -∞ LUFS
          </div>
        </div>
        <div className="squircle-inner studio-surface px-3 py-2">
          <div className="text-[10px] font-sans text-[var(--text-secondary)]">ST-LUFS (3s)</div>
          <div
            ref={stLufsRef}
            data-testid="live-short-term-lufs"
            className="text-sm font-bold text-[var(--text-primary)] mt-0.5"
          >
            -∞ LUFS
          </div>
        </div>
        <div className="squircle-inner studio-surface px-3 py-2">
          <div className="text-[10px] font-sans text-[var(--text-secondary)]">Peak L</div>
          <div
            ref={peakLRef}
            data-testid="live-peak-l"
            className="text-sm font-bold text-[var(--text-primary)] mt-0.5"
          >
            -∞ dBFS
          </div>
        </div>
        <div className="squircle-inner studio-surface px-3 py-2">
          <div className="text-[10px] font-sans text-[var(--text-secondary)]">Peak R</div>
          <div
            ref={peakRRef}
            data-testid="live-peak-r"
            className="text-sm font-bold text-[var(--text-primary)] mt-0.5"
          >
            -∞ dBFS
          </div>
        </div>
      </div>
    </section>
  );
};

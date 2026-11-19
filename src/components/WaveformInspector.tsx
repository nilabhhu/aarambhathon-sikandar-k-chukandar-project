import React, { useEffect, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import { AnalysisIssue, TimelineSeries } from '../contracts/analysisContract';
import { useStudioAudioEngine, useStudioAudioState } from '../audio/StudioAudioContext';
import { clampTimestampRange } from '../audio/shortTermLufsMath';
import { STUDIO_SPRING, TACTILE_TAP } from '../lib/motion';
import {
  Play,
  Pause,
  RotateCcw,
  Repeat,
  AlertCircle,
  Volume2,
  MapPin,
} from 'lucide-react';

interface WaveformInspectorProps {
  durationSeconds: number;
  issues: AnalysisIssue[];
  activeIssueId: string | null;
  activeTimestamp: { start_sec: number; end_sec: number; label: string } | null;
  onSelectTimestamp: (
    issueId: string,
    ts: { start_sec: number; end_sec: number; label: string }
  ) => void;
  timeline?: TimelineSeries | null;
  showTransportBar?: boolean;
}

export function formatTimecode(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const mins = Math.floor(sec / 60);
  const rem = (sec % 60).toFixed(1);
  const paddedMins = String(mins).padStart(2, '0');
  const paddedSecs = Number(rem) < 10 ? `0${rem}` : rem;
  return `${paddedMins}:${paddedSecs}`;
}

interface FlattenedMarker {
  id: string;
  issueId: string;
  issueTitle: string;
  classification: AnalysisIssue['classification'];
  severity: AnalysisIssue['severity'];
  startSec: number;
  endSec: number;
  label: string;
}

export const WaveformInspector: React.FC<WaveformInspectorProps> = ({
  durationSeconds,
  issues,
  activeIssueId,
  activeTimestamp,
  onSelectTimestamp,
  timeline,
  showTransportBar = true,
}) => {
  const engine = useStudioAudioEngine();
  const audioState = useStudioAudioState();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const timecodeRef = useRef<HTMLSpanElement | null>(null);

  const effectiveDuration = Math.max(
    0.1,
    audioState.primaryDurationSec > 0 ? audioState.primaryDurationSec : durationSeconds
  );

  // Flatten issue timestamps into clickable marker pins (strictly clamped to [0, effectiveDuration])
  const markers = useMemo<FlattenedMarker[]>(() => {
    const list: FlattenedMarker[] = [];
    for (const issue of issues) {
      issue.timestamps.forEach((ts, idx) => {
        const clamped = clampTimestampRange(ts.start_sec, ts.end_sec, effectiveDuration);
        list.push({
          id: `${issue.issue_id}-${idx}`,
          issueId: issue.issue_id,
          issueTitle: issue.title,
          classification: issue.classification,
          severity: issue.severity,
          startSec: clamped.start_sec,
          endSec: clamped.end_sec,
          label: ts.label,
        });
      });
    }
    return list;
  }, [issues, effectiveDuration]);

  const clampedActiveTimestamp = useMemo(() => {
    if (!activeTimestamp) return null;
    const clamped = clampTimestampRange(
      activeTimestamp.start_sec,
      activeTimestamp.end_sec,
      effectiveDuration
    );
    return {
      ...activeTimestamp,
      start_sec: clamped.start_sec,
      end_sec: clamped.end_sec,
    };
  }, [activeTimestamp, effectiveDuration]);

  // Prefer decoded AudioBuffer peaks from StudioAudioEngine, fallback to DSP timeline buckets
  const waveformBars = useMemo(() => {
    const enginePeaks = engine.getWaveformPeaks();
    if (enginePeaks && enginePeaks.length > 0) {
      return enginePeaks;
    }
    if (timeline && timeline.buckets && timeline.buckets.length > 0) {
      return timeline.buckets.map((b) => {
        const peak = Math.min(1.0, Math.max(0.04, Math.pow(10, b.peak_dbfs / 20.0)));
        const rms = Math.min(peak, Math.max(0.02, Math.pow(10, b.rms_dbfs / 20.0)));
        return { peak, rms, clipped: b.clipped };
      });
    }
    return [];
  }, [engine, audioState.hasPrimaryMix, audioState.primaryFileName, timeline]);

  // Keep latest render props in a ref so the 60fps requestAnimationFrame loop never resets
  const renderStateRef = useRef({
    bars: waveformBars,
    markers,
    activeIssueId,
    activeTimestamp: clampedActiveTimestamp,
    effectiveDuration,
    loopRegion: audioState.loopRegion,
    isLooping: audioState.isLooping,
  });

  renderStateRef.current = {
    bars: waveformBars,
    markers,
    activeIssueId,
    activeTimestamp: clampedActiveTimestamp,
    effectiveDuration,
    loopRegion: audioState.loopRegion,
    isLooping: audioState.isLooping,
  };

  // 60fps Canvas Renderer driven directly by AudioContext.currentTime (ZERO 60Hz useState)
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let rafId = 0;

    const drawFrame = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = Math.max(300, Math.floor(rect.width));
      const cssH = Math.max(120, Math.floor(rect.height));

      if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
        canvas.width = Math.floor(cssW * dpr);
        canvas.height = Math.floor(cssH * dpr);
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const {
        bars,
        markers: currentMarkers,
        activeIssueId: curIssueId,
        activeTimestamp: curTs,
        effectiveDuration: dur,
        loopRegion,
        isLooping,
      } = renderStateRef.current;

      const currentSec = engine.getCurrentTime();
      const playRatio = Math.max(0, Math.min(1, currentSec / dur));
      const playX = playRatio * cssW;

      // Update live timecode text directly via DOM ref (zero React re-renders)
      if (timecodeRef.current) {
        timecodeRef.current.textContent = formatTimecode(currentSec);
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // 1. Canvas Background (Swiss Neo-Brutalist #0A0A0A High-Contrast Stage)
      ctx.fillStyle = '#0A0A0A';
      ctx.fillRect(0, 0, cssW, cssH);

      // 2. Subtle Horizontal Centerline
      const midY = cssH / 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(cssW, midY);
      ctx.stroke();

      // 3. Issue Timestamp Regions (Shaded Vertical Zones)
      for (const mk of currentMarkers) {
        const x0 = (mk.startSec / dur) * cssW;
        const x1 = Math.max(x0 + 4, (mk.endSec / dur) * cssW);
        const isSelected = curIssueId === mk.issueId && curTs?.start_sec === mk.startSec;
        const isTechnical = mk.classification === 'objective_technical';

        if (isSelected) {
          ctx.fillStyle = isTechnical
            ? 'rgba(255, 59, 31, 0.28)'
            : 'rgba(255, 214, 0, 0.24)';
        } else {
          ctx.fillStyle = isTechnical
            ? 'rgba(255, 59, 31, 0.12)'
            : 'rgba(255, 214, 0, 0.10)';
        }
        ctx.fillRect(x0, 0, x1 - x0, cssH);
      }

      // 4. Active Loop Region Band (when looping)
      if (isLooping && loopRegion) {
        const lx0 = (loopRegion.startSec / dur) * cssW;
        const lx1 = Math.max(lx0 + 6, (loopRegion.endSec / dur) * cssW);
        ctx.fillStyle = 'rgba(255, 214, 0, 0.16)';
        ctx.fillRect(lx0, 0, lx1 - lx0, cssH);
        ctx.strokeStyle = '#FFD600';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(lx0, 0);
        ctx.lineTo(lx0, cssH);
        ctx.moveTo(lx1, 0);
        ctx.lineTo(lx1, cssH);
        ctx.stroke();
      }

      // 5. Crisp Waveform Peak & RMS Envelope Bars
      if (bars.length > 0) {
        const padX = 6;
        const usableW = cssW - padX * 2;
        const step = usableW / bars.length;
        const barW = Math.max(1.5, step * 0.68);
        const maxHalfH = cssH * 0.43;

        for (let i = 0; i < bars.length; i++) {
          const b = bars[i];
          const x = padX + i * step;
          const isPlayed = x + barW * 0.5 <= playX;
          const peakH = Math.max(2, b.peak * maxHalfH);
          const rmsH = Math.max(1.2, b.rms * maxHalfH);

          // Peak Outer Bar
          if (b.clipped) {
            ctx.fillStyle = '#FF3B1F';
          } else if (isPlayed) {
            ctx.fillStyle = 'rgba(255, 214, 0, 0.55)';
          } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.34)';
          }
          ctx.fillRect(x, midY - peakH, barW, peakH * 2);

          // RMS Inner Core
          if (!b.clipped) {
            ctx.fillStyle = isPlayed ? '#FFD600' : '#FFFFFF';
            ctx.fillRect(x, midY - rmsH, barW, rmsH * 2);
          }
        }
      }

      // 6. Moving 60fps Playhead Cursor
      ctx.fillStyle = '#FFD600';
      ctx.fillRect(Math.round(playX) - 1, 0, 2, cssH);

      // Playhead top cap triangle
      ctx.beginPath();
      ctx.moveTo(playX - 5, 0);
      ctx.lineTo(playX + 5, 0);
      ctx.lineTo(playX, 7);
      ctx.closePath();
      ctx.fill();

      ctx.restore();

      if (engine.getSnapshot().isPlaying) {
        rafId = requestAnimationFrame(drawFrame);
      }
    };

    drawFrame();

    const handleResize = () => drawFrame();
    window.addEventListener('resize', handleResize);
    const observer = new MutationObserver(() => drawFrame());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
    };
  }, [
    engine,
    audioState.isPlaying,
    audioState.hasPrimaryMix,
    audioState.isLooping,
    audioState.loopRegion,
    waveformBars,
    markers,
    activeIssueId,
    activeTimestamp,
    effectiveDuration,
  ]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const seekSec = clickRatio * effectiveDuration;
    engine.seek(seekSec, true);
  };

  const handleMarkerClick = (mk: FlattenedMarker) => {
    const ts = { start_sec: mk.startSec, end_sec: mk.endSec, label: mk.label };
    onSelectTimestamp(mk.issueId, ts);
    const loopEnd = Math.min(effectiveDuration, Math.max(mk.startSec + 0.5, mk.endSec));
    engine.setLoopRegion({
      startSec: mk.startSec,
      endSec: loopEnd > mk.startSec ? loopEnd : effectiveDuration,
      label: mk.label,
    });
    engine.seekAndPlay(mk.startSec).catch(() => {});
  };

  const handleToggleLoopForActive = () => {
    if (!clampedActiveTimestamp) return;
    if (
      audioState.loopRegion &&
      Math.abs(audioState.loopRegion.startSec - clampedActiveTimestamp.start_sec) < 0.05
    ) {
      engine.toggleLooping();
    } else {
      const loopEnd = Math.min(
        effectiveDuration,
        Math.max(clampedActiveTimestamp.start_sec + 0.5, clampedActiveTimestamp.end_sec)
      );
      engine.setLoopRegion(
        {
          startSec: clampedActiveTimestamp.start_sec,
          endSec: loopEnd > clampedActiveTimestamp.start_sec ? loopEnd : effectiveDuration,
          label: clampedActiveTimestamp.label,
        },
        true
      );
      if (audioState.hasPrimaryMix) {
        engine.seekAndPlay(clampedActiveTimestamp.start_sec).catch(() => {});
      }
    }
  };

  const isLoopingActiveMarker =
    audioState.isLooping &&
    audioState.loopRegion !== null &&
    clampedActiveTimestamp !== null &&
    Math.abs(audioState.loopRegion.startSec - clampedActiveTimestamp.start_sec) < 0.1;

  return (
    <section
      aria-label="Waveform Inspector and Interactive Issue Markers"
      data-testid="waveform-inspector"
      className="studio-elevated squircle-outer p-5 md:p-6 space-y-4"
    >
      {/* Top Bar: Title + Optional Compact Transport (Simple Mode) */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 studio-hairline-b">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-primary)]">
            Waveform Timeline &amp; Issue Markers
          </h3>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Click anywhere on the waveform to scrub, or select a marker pin to audition and loop a flagged cue.
          </p>
        </div>

        {showTransportBar && (
          <div className="flex flex-wrap items-center gap-2">
            <motion.button
              type="button"
              whileTap={TACTILE_TAP}
              onClick={() => engine.togglePlay()}
              disabled={!audioState.hasPrimaryMix}
              aria-label={audioState.isPlaying ? 'Pause audio' : 'Play audio'}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 squircle-inner bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white text-xs font-semibold transition-colors disabled:opacity-45 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {audioState.isPlaying ? (
                <Pause className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              <span>{audioState.isPlaying ? 'Pause' : 'Play'}</span>
            </motion.button>

            <motion.button
              type="button"
              whileTap={TACTILE_TAP}
              onClick={() => engine.seek(0, true)}
              disabled={!audioState.hasPrimaryMix}
              aria-label="Restart playback from 00:00"
              className="p-1.5 squircle-inner border border-[var(--border-hairline-color)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--border-active-color)] transition-colors disabled:opacity-45 cursor-pointer"
              title="Restart from 00:00.0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </motion.button>

            <motion.button
              type="button"
              whileTap={TACTILE_TAP}
              onClick={() => engine.toggleMono()}
              disabled={!audioState.hasPrimaryMix}
              aria-pressed={audioState.monoMode}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 squircle-inner text-xs font-medium border transition-colors whitespace-nowrap shrink-0 disabled:opacity-45 cursor-pointer ${
                audioState.monoMode
                  ? 'bg-[var(--status-caution)] text-white border-[var(--status-caution)]'
                  : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-hairline-color)] hover:border-[var(--border-active-color)]'
              }`}
              title="Equal-power mono fold (0.5*L + 0.5*R) with 15ms click-free ramp"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>{audioState.monoMode ? 'Mono (0.5L+0.5R)' : 'Stereo'}</span>
            </motion.button>

            <div className="font-mono text-xs tabular-nums text-[var(--text-secondary)] pl-1">
              <span ref={timecodeRef} className="font-semibold text-[var(--text-primary)]">
                {formatTimecode(engine.getCurrentTime())}
              </span>
              <span className="opacity-40 mx-1">/</span>
              <span>{formatTimecode(effectiveDuration)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Decode / Playback Notice */}
      {audioState.playbackError && (
        <div className="flex items-start gap-2 p-3 squircle-inner bg-amber-50/80 dark:bg-amber-950/35 border border-[var(--status-caution)]/30 text-xs text-amber-900 dark:text-amber-200">
          <AlertCircle className="w-4 h-4 text-[var(--status-caution)] shrink-0 mt-0.5" />
          <span>{audioState.playbackError}</span>
        </div>
      )}

      {/* Interactive Marker Pin Rail + 60fps HTML5 Canvas Stage */}
      <div className="space-y-2">
        {/* Marker Pin Rail — Interactive motion.button pins with tactile spring physics */}
        {markers.length > 0 && (
          <div className="relative h-7 w-full overflow-x-clip" aria-label="Issue Timestamp Marker Pins">
            {(() => {
              const sorted = [...markers].sort((a, b) => a.startSec - b.startSec);
              const MIN_GAP_PCT = 7.4;
              let lastPct = -Infinity;
              return sorted.map((mk, idx) => {
                const rawPct = Math.max(8, Math.min(90, (mk.startSec / effectiveDuration) * 100));
                const leftPct = Math.min(90, Math.max(rawPct, lastPct + MIN_GAP_PCT));
                lastPct = leftPct;
                const isSelected =
                  activeIssueId === mk.issueId &&
                  clampedActiveTimestamp?.start_sec === mk.startSec;
                const isTech = mk.classification === 'objective_technical';

                return (
                  <motion.button
                    key={mk.id}
                    type="button"
                    data-testid={`issue-marker-pin-${idx}`}
                    onClick={() => handleMarkerClick(mk)}
                    whileHover={{ y: -1 }}
                    whileTap={TACTILE_TAP}
                    transition={STUDIO_SPRING}
                    style={{ left: `${leftPct}%`, x: '-50%' }}
                    title={`${mk.issueTitle} (${formatTimecode(mk.startSec)} – ${formatTimecode(mk.endSec)})`}
                    aria-label={`Jump to ${mk.issueTitle} at ${formatTimecode(mk.startSec)}`}
                    className={`absolute top-0.5 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono tabular-nums font-bold border cursor-pointer transition-colors ${
                      isSelected
                        ? isTech
                          ? 'bg-[#FF3B1F] text-white border-[#0A0A0A] dark:border-white outline-2 outline-offset-1 outline-[#FFD600] z-30'
                          : 'bg-[#FFD600] text-[#0A0A0A] border-[#0A0A0A] outline-2 outline-offset-1 outline-[#0A0A0A] dark:outline-white z-30'
                        : isTech
                        ? 'bg-[var(--bg-canvas)] text-[#FF3B1F] border-[#FF3B1F] z-20 hover:bg-[#FF3B1F] hover:text-white hover:z-30'
                        : 'bg-[var(--bg-canvas)] text-[var(--ink)] border-[var(--border-ink)] z-10 hover:bg-[#FFD600] hover:text-[#0A0A0A] hover:z-30'
                    }`}
                  >
                    <MapPin className="w-2.5 h-2.5 shrink-0" />
                    <span>{formatTimecode(mk.startSec)}</span>
                  </motion.button>
                );
              });
            })()}
          </div>
        )}

        {/* 60fps HTML5 Canvas Container */}
        <div
          ref={containerRef}
          onClick={handleCanvasClick}
          data-testid="waveform-canvas-stage"
          className="relative w-full h-32 squircle-inner border border-[var(--border-hairline-color)] overflow-hidden cursor-pointer select-none bg-[var(--bg-canvas)]"
        >
          <canvas
            ref={canvasRef}
            className="block w-full h-full"
            aria-label="Audio waveform canvas"
          />
        </div>
      </div>

      {/* Footer: Selected Marker Audition Bar + Quick Loop Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <span className="font-mono tabular-nums text-[var(--text-secondary)]">00:00.0</span>

        {clampedActiveTimestamp ? (
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[var(--text-secondary)]">
              Selected cue:{' '}
              <strong
                data-testid="waveform-selected-cue-range"
                className="font-mono tabular-nums text-[var(--text-primary)]"
              >
                {formatTimecode(clampedActiveTimestamp.start_sec)} –{' '}
                {formatTimecode(clampedActiveTimestamp.end_sec)}
              </strong>{' '}
              <span>({clampedActiveTimestamp.label})</span>
            </span>

            <motion.button
              type="button"
              whileTap={TACTILE_TAP}
              onClick={handleToggleLoopForActive}
              disabled={!audioState.hasPrimaryMix}
              aria-pressed={isLoopingActiveMarker}
              data-testid="waveform-loop-toggle"
              className={`inline-flex items-center gap-1.5 px-3 py-1 squircle-inner text-xs font-medium border transition-colors whitespace-nowrap shrink-0 disabled:opacity-45 cursor-pointer ${
                isLoopingActiveMarker
                  ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                  : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-hairline-color)] hover:border-[var(--border-active-color)]'
              }`}
            >
              <Repeat className="w-3 h-3" />
              <span>{isLoopingActiveMarker ? 'Looping Region' : 'Loop Section'}</span>
            </motion.button>
          </div>
        ) : (
          <span className="text-[var(--text-secondary)]">
            Select a marker pin above to seek and loop a flagged region
          </span>
        )}

        <span className="font-mono tabular-nums text-[var(--text-secondary)]">
          {formatTimecode(effectiveDuration)}
        </span>
      </div>
    </section>
  );
};

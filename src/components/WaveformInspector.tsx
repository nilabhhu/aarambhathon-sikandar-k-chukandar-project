import React, { useEffect, useMemo, useRef } from 'react';
import { AnalysisIssue, TimelineSeries } from '../contracts/analysisContract';
import { useStudioAudioEngine, useStudioAudioState } from '../audio/StudioAudioContext';
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

  // Flatten issue timestamps into clickable marker pins
  const markers = useMemo<FlattenedMarker[]>(() => {
    const list: FlattenedMarker[] = [];
    for (const issue of issues) {
      issue.timestamps.forEach((ts, idx) => {
        list.push({
          id: `${issue.issue_id}-${idx}`,
          issueId: issue.issue_id,
          issueTitle: issue.title,
          classification: issue.classification,
          severity: issue.severity,
          startSec: Math.max(0, Math.min(effectiveDuration, ts.start_sec)),
          endSec: Math.max(ts.start_sec, Math.min(effectiveDuration, ts.end_sec)),
          label: ts.label,
        });
      });
    }
    return list;
  }, [issues, effectiveDuration]);

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
    activeTimestamp,
    effectiveDuration,
    loopRegion: audioState.loopRegion,
    isLooping: audioState.isLooping,
  });

  renderStateRef.current = {
    bars: waveformBars,
    markers,
    activeIssueId,
    activeTimestamp,
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

      const isDark = document.documentElement.classList.contains('dark');
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

      // 1. Canvas Background
      ctx.fillStyle = isDark ? '#0B0F0E' : '#FAFAFA';
      ctx.fillRect(0, 0, cssW, cssH);

      // 2. Subtle Horizontal Centerline & Quarter Guides
      const midY = cssH / 2;
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(24,24,27,0.07)';
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
            ? isDark
              ? 'rgba(244, 63, 94, 0.22)'
              : 'rgba(225, 29, 72, 0.14)'
            : isDark
            ? 'rgba(245, 158, 11, 0.22)'
            : 'rgba(217, 119, 6, 0.14)';
        } else {
          ctx.fillStyle = isTechnical
            ? isDark
              ? 'rgba(244, 63, 94, 0.08)'
              : 'rgba(225, 29, 72, 0.06)'
            : isDark
            ? 'rgba(245, 158, 11, 0.08)'
            : 'rgba(217, 119, 6, 0.06)';
        }
        ctx.fillRect(x0, 0, x1 - x0, cssH);
      }

      // 4. Active Loop Region Band (when looping)
      if (isLooping && loopRegion) {
        const lx0 = (loopRegion.startSec / dur) * cssW;
        const lx1 = Math.max(lx0 + 6, (loopRegion.endSec / dur) * cssW);
        ctx.fillStyle = isDark ? 'rgba(45, 212, 191, 0.12)' : 'rgba(58, 114, 105, 0.12)';
        ctx.fillRect(lx0, 0, lx1 - lx0, cssH);
        ctx.strokeStyle = isDark ? '#2DD4BF' : '#3A7269';
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
            ctx.fillStyle = isDark ? '#FB7185' : '#E11D48';
          } else if (isPlayed) {
            ctx.fillStyle = isDark ? 'rgba(69, 155, 141, 0.65)' : 'rgba(58, 114, 105, 0.45)';
          } else {
            ctx.fillStyle = isDark ? 'rgba(113, 125, 121, 0.45)' : 'rgba(161, 161, 170, 0.45)';
          }
          ctx.fillRect(x, midY - peakH, barW, peakH * 2);

          // RMS Inner Core
          if (!b.clipped) {
            ctx.fillStyle = isPlayed
              ? isDark
                ? '#58B0A2'
                : '#3A7269'
              : isDark
              ? '#A1ABA8'
              : '#52525B';
            ctx.fillRect(x, midY - rmsH, barW, rmsH * 2);
          }
        }
      }

      // 6. Moving 60fps Playhead Cursor
      ctx.fillStyle = isDark ? '#2DD4BF' : '#18181B';
      ctx.fillRect(Math.round(playX) - 0.75, 0, 1.5, cssH);

      // Playhead top cap triangle
      ctx.beginPath();
      ctx.moveTo(playX - 4.5, 0);
      ctx.lineTo(playX + 4.5, 0);
      ctx.lineTo(playX, 6);
      ctx.closePath();
      ctx.fill();

      ctx.restore();

      if (engine.getSnapshot().isPlaying) {
        rafId = requestAnimationFrame(drawFrame);
      }
    };

    drawFrame();

    // Redraw cleanly on window resize or theme toggle
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
    engine.setLoopRegion({
      startSec: mk.startSec,
      endSec: Math.max(mk.startSec + 1.0, mk.endSec),
      label: mk.label,
    });
    engine.seekAndPlay(mk.startSec).catch(() => {});
  };

  const handleToggleLoopForActive = () => {
    if (!activeTimestamp) return;
    if (
      audioState.loopRegion &&
      Math.abs(audioState.loopRegion.startSec - activeTimestamp.start_sec) < 0.05
    ) {
      engine.toggleLooping();
    } else {
      engine.setLoopRegion(
        {
          startSec: activeTimestamp.start_sec,
          endSec: Math.max(activeTimestamp.start_sec + 1.0, activeTimestamp.end_sec),
          label: activeTimestamp.label,
        },
        true
      );
      if (audioState.hasPrimaryMix) {
        engine.seekAndPlay(activeTimestamp.start_sec).catch(() => {});
      }
    }
  };

  const isLoopingActiveMarker =
    audioState.isLooping &&
    audioState.loopRegion !== null &&
    activeTimestamp !== null &&
    Math.abs(audioState.loopRegion.startSec - activeTimestamp.start_sec) < 0.1;

  return (
    <section
      aria-label="Waveform Inspector and Interactive Issue Markers"
      data-testid="waveform-inspector"
      className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-5 space-y-3.5"
    >
      {/* Top Bar: Title + Optional Compact Transport (Simple Mode) */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-200/80 dark:border-zinc-800">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Waveform Timeline &amp; Issue Markers
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Click anywhere on the waveform to scrub, or click a marker pin to audition and loop a flagged section.
          </p>
        </div>

        {showTransportBar && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => engine.togglePlay()}
              disabled={!audioState.hasPrimaryMix}
              aria-label={audioState.isPlaying ? 'Pause audio' : 'Play audio'}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#3A7269] hover:bg-[#2F5E56] text-white text-xs font-semibold transition-colors disabled:opacity-45 whitespace-nowrap shrink-0"
            >
              {audioState.isPlaying ? (
                <Pause className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              <span>{audioState.isPlaying ? 'Pause' : 'Play'}</span>
            </button>

            <button
              type="button"
              onClick={() => engine.seek(0, true)}
              disabled={!audioState.hasPrimaryMix}
              aria-label="Restart playback from 00:00"
              className="p-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-45"
              title="Restart from 00:00.0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => engine.toggleMono()}
              disabled={!audioState.hasPrimaryMix}
              aria-pressed={audioState.monoMode}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 disabled:opacity-45 ${
                audioState.monoMode
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-[#FAFAFA] dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
              title="Equal-power mono fold (0.5*L + 0.5*R) with 15ms click-free ramp"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>{audioState.monoMode ? 'Mono (0.5L+0.5R)' : 'Stereo'}</span>
            </button>

            <div className="font-mono text-xs tabular-nums text-zinc-700 dark:text-zinc-300 pl-1">
              <span ref={timecodeRef} className="font-semibold text-zinc-900 dark:text-zinc-100">
                {formatTimecode(engine.getCurrentTime())}
              </span>
              <span className="text-zinc-400 mx-1">/</span>
              <span className="text-zinc-500">{formatTimecode(effectiveDuration)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Decode / Playback Notice */}
      {audioState.playbackError && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <span>{audioState.playbackError}</span>
        </div>
      )}

      {/* Interactive Marker Pin Rail + 60fps HTML5 Canvas Stage */}
      <div className="space-y-1.5">
        {/* Marker Pin Rail */}
        {markers.length > 0 && (
          <div className="relative h-7 w-full" aria-label="Issue Timestamp Marker Pins">
            {(() => {
              const sorted = [...markers].sort((a, b) => a.startSec - b.startSec);
              const MIN_GAP_PCT = 6.8;
              let lastPct = -Infinity;
              return sorted.map((mk, idx) => {
                const rawPct = Math.max(3, Math.min(96, (mk.startSec / effectiveDuration) * 100));
                const leftPct = Math.min(96, Math.max(rawPct, lastPct + MIN_GAP_PCT));
                lastPct = leftPct;
                const isSelected =
                  activeIssueId === mk.issueId && activeTimestamp?.start_sec === mk.startSec;
                const isTech = mk.classification === 'objective_technical';

                return (
                  <button
                    key={mk.id}
                    type="button"
                    data-testid={`issue-marker-pin-${idx}`}
                    onClick={() => handleMarkerClick(mk)}
                    style={{ left: `${leftPct}%` }}
                    title={`${mk.issueTitle} (${formatTimecode(mk.startSec)} – ${formatTimecode(mk.endSec)})`}
                    aria-label={`Jump to ${mk.issueTitle} at ${formatTimecode(mk.startSec)}`}
                    className={`absolute top-0 -translate-x-1/2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums font-semibold border transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-[#3A7269] ${
                      isSelected
                        ? isTech
                          ? 'bg-rose-600 text-white border-rose-700 z-30 shadow-xs'
                          : 'bg-amber-600 text-white border-amber-700 z-30 shadow-xs'
                        : isTech
                        ? 'bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800 z-20 hover:z-30'
                        : 'bg-amber-50 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800 z-10 hover:z-30'
                    }`}
                  >
                    <MapPin className="w-2.5 h-2.5 shrink-0" />
                    <span>{formatTimecode(mk.startSec)}</span>
                  </button>
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
          className="relative w-full h-32 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden cursor-pointer select-none bg-[#FAFAFA] dark:bg-[#0B0F0E]"
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
        <span className="font-mono tabular-nums text-zinc-500 dark:text-zinc-400">00:00.0</span>

        {activeTimestamp ? (
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-zinc-700 dark:text-zinc-300">
              Selected cue:{' '}
              <strong className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                {formatTimecode(activeTimestamp.start_sec)} – {formatTimecode(activeTimestamp.end_sec)}
              </strong>{' '}
              <span className="text-zinc-500 dark:text-zinc-400">({activeTimestamp.label})</span>
            </span>

            <button
              type="button"
              onClick={handleToggleLoopForActive}
              disabled={!audioState.hasPrimaryMix}
              aria-pressed={isLoopingActiveMarker}
              data-testid="waveform-loop-toggle"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 disabled:opacity-45 ${
                isLoopingActiveMarker
                  ? 'bg-[#3A7269] text-white border-[#3A7269]'
                  : 'bg-[#FAFAFA] dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              <Repeat className="w-3 h-3" />
              <span>{isLoopingActiveMarker ? 'Looping Region' : 'Loop Section'}</span>
            </button>
          </div>
        ) : (
          <span className="text-zinc-500 dark:text-zinc-400">
            Select a marker pin above to seek and loop a flagged region
          </span>
        )}

        <span className="font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
          {formatTimecode(effectiveDuration)}
        </span>
      </div>
    </section>
  );
};

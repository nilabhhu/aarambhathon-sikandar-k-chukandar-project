import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnalysisIssue, TimelineSeries } from '../contracts/analysisContract';
import {
  Eye,
  Info,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Repeat,
  AlertCircle,
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
  monoMode: boolean;
  onToggleMono: () => void;
  isUnmastered: boolean;
  timeline?: TimelineSeries | null;
  isDemonstrationData?: boolean;
  audioFile?: File | null;
}

export function formatTimecode(sec: number): string {
  if (isNaN(sec) || sec < 0) sec = 0;
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
  audioFile = null,
}) => {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isLoopingRegion, setIsLoopingRegion] = useState<boolean>(false);
  const [realMonoAudition, setRealMonoAudition] = useState<boolean>(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const splitterNodeRef = useRef<ChannelSplitterNode | null>(null);
  const mergerNodeRef = useRef<ChannelMergerNode | null>(null);
  const monoGainRef = useRef<GainNode | null>(null);
  const stereoGainRef = useRef<GainNode | null>(null);

  // 1. Manage Audio Object URL
  useEffect(() => {
    if (!audioFile) {
      setAudioUrl(null);
      setIsPlaying(false);
      setCurrentTime(0);
      setPlaybackError(null);
      return;
    }

    const url = URL.createObjectURL(audioFile);
    setAudioUrl(url);
    setIsPlaying(false);
    setCurrentTime(0);
    setPlaybackError(null);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [audioFile]);

  // 2. Initialize Web Audio API graph for real Mono Fold-down auditioning
  const initWebAudio = () => {
    if (audioContextRef.current || !audioRef.current) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;

      const source = ctx.createMediaElementSource(audioRef.current);
      sourceNodeRef.current = source;

      // Stereo path
      const stereoGain = ctx.createGain();
      stereoGain.gain.value = realMonoAudition ? 0 : 1;
      stereoGainRef.current = stereoGain;
      source.connect(stereoGain);
      stereoGain.connect(ctx.destination);

      // Mono fold-down path: split stereo -> sum with -6dB attenuation to prevent clipping
      const splitter = ctx.createChannelSplitter(2);
      splitterNodeRef.current = splitter;
      source.connect(splitter);

      const monoGain = ctx.createGain();
      monoGain.gain.value = realMonoAudition ? 0.5 : 0; // -6 dB
      monoGainRef.current = monoGain;
      splitter.connect(monoGain, 0); // Left
      splitter.connect(monoGain, 1); // Right

      const merger = ctx.createChannelMerger(2);
      mergerNodeRef.current = merger;
      monoGain.connect(merger, 0, 0); // feed mono to Left
      monoGain.connect(merger, 0, 1); // feed mono to Right
      merger.connect(ctx.destination);
    } catch (err) {
      console.warn('Web Audio initialization not supported or already attached:', err);
    }
  };

  // Toggle real mono fold-down
  const handleToggleRealMono = () => {
    const nextMono = !realMonoAudition;
    setRealMonoAudition(nextMono);

    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }

    if (stereoGainRef.current && monoGainRef.current) {
      if (nextMono) {
        stereoGainRef.current.gain.value = 0;
        monoGainRef.current.gain.value = 0.5; // -6dB attenuation to prevent clipping
      } else {
        stereoGainRef.current.gain.value = 1;
        monoGainRef.current.gain.value = 0;
      }
    }
  };

  // 3. Playback Controls
  const togglePlay = async () => {
    if (!audioRef.current) return;
    initWebAudio();
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume().catch(() => {});
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (err: any) {
        setPlaybackError(
          err.message ||
            'Unable to start audio playback. Browser may restrict unencoded or background audio.'
        );
        setIsPlaying(false);
      }
    }
  };

  const handleSeek = (newTime: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
    setCurrentTime(newTime);
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const cur = audioRef.current.currentTime;
    setCurrentTime(cur);

    // Region looping logic
    if (isLoopingRegion && activeTimestamp) {
      if (cur >= activeTimestamp.end_sec || cur < activeTimestamp.start_sec - 0.25) {
        audioRef.current.currentTime = activeTimestamp.start_sec;
      }
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleAudioError = () => {
    const isAiff = audioFile?.name.toLowerCase().endsWith('.aiff') || audioFile?.name.toLowerCase().endsWith('.aif');
    if (isAiff) {
      setPlaybackError(
        'Browser HTML5 limitation: AIFF files cannot be decoded natively by most browsers. Mathematical DSP analysis above was executed on the server via FFmpeg.'
      );
    } else {
      setPlaybackError('Native browser audio playback could not decode this audio stream.');
    }
    setIsPlaying(false);
  };

  const jumpToCue = (startSec: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = startSec;
      initWebAudio();
      if (!isPlaying) {
        audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    }
  };

  // 4. Waveform Visualization Bars
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
      aria-label="Waveform Profile, Audio Player and Issue Auditioning"
      className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-5 space-y-4 shadow-sm"
    >
      {/* Hidden HTML5 Audio Element for Local Audio Playback */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleAudioEnded}
          onError={handleAudioError}
          preload="metadata"
        />
      )}

      {/* Header Info */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 font-mono tabular-nums">
            <span className="font-semibold text-teal-800 dark:text-teal-400">
              {isDemonstrationData === false
                ? 'MATHEMATICAL DSP TIMELINE (MEASURED ENVELOPE)'
                : 'SYNTHETIC DEMO ENVELOPE (PHASE 1 VISUALIZATION)'}
            </span>
            <span aria-hidden="true">·</span>
            <span>DURATION {formatTimecode(durationSeconds)}</span>
            <span aria-hidden="true">·</span>
            <span>{isDemonstrationData === false ? 'MEASURED PEAK / RMS' : 'SIMULATED PEAK / RMS'}</span>
          </div>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
            {isDemonstrationData === false
              ? 'DSP Time-Domain Waveform & Auditioning Player'
              : 'Demonstration Time-Domain Profile & Clickable Regions'}
          </h3>
        </div>

        {/* Action Toggles: Mono Audition & Curve */}
        <div className="flex items-center gap-2">
          {audioFile && (
            <button
              type="button"
              onClick={handleToggleRealMono}
              aria-pressed={realMonoAudition}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors shrink-0 ${
                realMonoAudition
                  ? 'bg-amber-600 text-white border-amber-600 dark:bg-amber-500 dark:border-amber-500'
                  : 'bg-zinc-100 text-zinc-700 border-zinc-300 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700'
              }`}
              title="Acoustic mono fold-down auditioning (-6 dB sum)"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>{realMonoAudition ? 'Mono Fold Audition: ON' : 'Mono Fold: OFF'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleMono}
            aria-pressed={monoMode}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors shrink-0 ${
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

      {/* Playback Error / Unsupported Codec Banner */}
      {playbackError && (
        <div className="flex items-start gap-2 p-3 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <span>{playbackError}</span>
        </div>
      )}

      {/* Real Local Player Bar (when file is uploaded) */}
      {audioFile && (
        <div className="bg-zinc-50 dark:bg-zinc-950/80 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-teal-800 text-white hover:bg-teal-900 dark:bg-teal-600 dark:hover:bg-teal-500 shadow-sm transition-transform active:scale-95"
              aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>

            <button
              type="button"
              onClick={() => handleSeek(0)}
              className="p-2 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors"
              title="Restart from beginning"
              aria-label="Restart audio"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <div className="font-mono text-xs tabular-nums text-zinc-800 dark:text-zinc-200">
              <span className="font-semibold">{formatTimecode(currentTime)}</span>
              <span className="text-zinc-400 mx-1">/</span>
              <span className="text-zinc-500">{formatTimecode(durationSeconds)}</span>
            </div>
          </div>

          {/* Region Looping and Cue Controls */}
          {activeTimestamp && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => jumpToCue(activeTimestamp.start_sec)}
                className="px-2.5 py-1.5 rounded text-xs font-medium bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition-colors"
              >
                Audition Cue ({formatTimecode(activeTimestamp.start_sec)})
              </button>

              <button
                type="button"
                onClick={() => setIsLoopingRegion(!isLoopingRegion)}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium border transition-colors ${
                  isLoopingRegion
                    ? 'bg-teal-800 text-white border-teal-800 dark:bg-teal-600 dark:border-teal-600'
                    : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-700'
                }`}
                title="Loop current issue timestamp region continuously"
              >
                <Repeat className="w-3.5 h-3.5" />
                <span>{isLoopingRegion ? 'Looping Region' : 'Loop Region'}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* SVG Waveform Envelope & Interactive Scrub Canvas */}
      <div
        className="relative w-full h-32 bg-zinc-50 dark:bg-zinc-950 rounded border border-zinc-200 dark:border-zinc-800 overflow-hidden select-none cursor-pointer"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          const seekTime = clickRatio * durationSeconds;
          handleSeek(seekTime);
        }}
      >
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
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectTimestamp(issue.issue_id, ts);
                  jumpToCue(ts.start_sec);
                }}
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

        {/* Selected Issue Region Marker */}
        {activeTimestamp && (
          <div
            style={{ left: `${(activeTimestamp.start_sec / durationSeconds) * 100}%` }}
            className="absolute top-0 bottom-0 w-0.5 bg-teal-800 dark:bg-teal-400 z-20 pointer-events-none"
          >
            <div className="absolute -top-1 -left-1.5 w-3.5 h-3.5 bg-teal-800 dark:bg-teal-400 rounded-full" />
          </div>
        )}

        {/* Live Audio Playhead */}
        {durationSeconds > 0 && (
          <div
            style={{ left: `${(currentTime / durationSeconds) * 100}%` }}
            className="absolute top-0 bottom-0 w-0.5 bg-emerald-500 dark:bg-emerald-400 z-30 pointer-events-none shadow"
          >
            <div className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-emerald-500 dark:bg-emerald-400 rounded-full shadow-sm" />
          </div>
        )}
      </div>

      {/* Footer scrubber & cue readout */}
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
            Click any highlighted region above or card timestamp below to audition cue
          </div>
        )}
        <div>{formatTimecode(durationSeconds)}</div>
      </div>
    </section>
  );
};

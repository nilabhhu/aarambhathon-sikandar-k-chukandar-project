import React from 'react';
import { GenreId } from '../contracts/analysisContract';
import { GENRE_LABELS } from '../contracts/demoFixtures';
import { Check, Loader2, Disc3 } from 'lucide-react';

interface DspAnalysisLoadingScreenProps {
  fileName: string;
  fileSizeBytes: number;
  genre: GenreId;
  progressPercent: number; // 0 to 100
  stageIndex: number; // 0, 1, 2, 3
}

const STAGES = [
  'Decoding audio buffer & verifying sample rate...',
  'Measuring Integrated LUFS, True Peak (dBTP) & headroom...',
  'Scanning 6-band frequency spectrum & sub-140 Hz phase correlation...',
  (genreLabel: string) => `Building prioritized DAW action plan for ${genreLabel}...`,
];

export const DspAnalysisLoadingScreen: React.FC<DspAnalysisLoadingScreenProps> = ({
  fileName,
  fileSizeBytes,
  genre,
  progressPercent,
  stageIndex,
}) => {
  const genreLabel = GENRE_LABELS[genre] || 'Selected Genre';
  const sizeMb = (fileSizeBytes / (1024 * 1024)).toFixed(1);

  // 20 vertical equalizer bars with varying heights & animation delays
  const barHeights = [45, 80, 60, 95, 30, 70, 85, 40, 90, 65, 75, 50, 92, 55, 35, 78, 62, 88, 48, 72];

  return (
    <section
      role="region"
      aria-label="Audio DSP Analysis in Progress"
      className="border border-teal-200 dark:border-teal-800 rounded-xl bg-white dark:bg-zinc-900 p-6 md:p-8 shadow-sm space-y-6"
    >
      {/* Header with File Info */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300">
            <Disc3 className="w-5 h-5 animate-spin" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <span>Live Mathematical DSP Analysis in Progress</span>
              <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                REAL DSP
              </span>
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 font-mono truncate max-w-lg">
              Analyzing: <strong className="text-zinc-800 dark:text-zinc-200">{fileName}</strong> ({sizeMb} MB) · Target: {genreLabel}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold font-mono text-teal-800 dark:text-teal-400 tabular-nums">
            {Math.round(progressPercent)}%
          </div>
          <div className="text-[11px] text-zinc-400">Completion</div>
        </div>
      </div>

      {/* Visual Equalizer / Waveform Scanner */}
      <div className="relative h-28 w-full rounded-lg bg-zinc-950 overflow-hidden flex items-end justify-center gap-1.5 px-4 pb-3">
        {/* Glowing Scanning Line */}
        <div
          className="absolute inset-y-0 w-32 bg-gradient-to-r from-transparent via-teal-400/20 to-transparent pointer-events-none animate-scanline"
        />

        {/* 20 Vertical Equalizer Bars */}
        {barHeights.map((h, i) => {
          const delay = (i * 0.06).toFixed(2);
          const duration = (0.8 + (i % 5) * 0.15).toFixed(2);
          return (
            <div
              key={i}
              className="w-full max-w-[12px] bg-gradient-to-t from-teal-700 via-teal-400 to-emerald-300 rounded-t-sm origin-bottom animate-eq-pulse"
              style={{
                height: `${h}%`,
                animationDelay: `${delay}s`,
                animationDuration: `${duration}s`,
              }}
            />
          );
        })}
      </div>

      {/* Animated Smooth Progress Bar */}
      <div className="space-y-1.5">
        <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-2.5 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-teal-700 via-teal-500 to-emerald-400 rounded-full transition-all duration-150 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
          />
        </div>
      </div>

      {/* Live Step-by-Step Stage Ticker */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
        {STAGES.map((stageFnOrStr, idx) => {
          const stageText = typeof stageFnOrStr === 'function' ? stageFnOrStr(genreLabel) : stageFnOrStr;
          const isDone = stageIndex > idx;
          const isActive = stageIndex === idx;

          return (
            <div
              key={idx}
              className={`flex items-start gap-2.5 p-3 rounded-lg border text-xs transition-colors ${
                isDone
                  ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-300'
                  : isActive
                  ? 'border-teal-300 dark:border-teal-700 bg-teal-50/70 dark:bg-teal-950/40 text-teal-950 dark:text-teal-100 shadow-xs'
                  : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 text-zinc-400 dark:text-zinc-500'
              }`}
            >
              <div className="mt-0.5 shrink-0">
                {isDone ? (
                  <div className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </div>
                ) : isActive ? (
                  <Loader2 className="w-4 h-4 text-teal-700 dark:text-teal-400 animate-spin" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-zinc-300 dark:border-zinc-700 text-[10px] font-mono flex items-center justify-center">
                    {idx + 1}
                  </div>
                )}
              </div>
              <span className={isActive ? 'font-semibold' : ''}>{stageText}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
};

import React from 'react';
import { motion } from 'motion/react';
import { GenreId } from '../contracts/analysisContract';
import { GENRE_LABELS } from '../contracts/demoFixtures';
import { STUDIO_EASE } from '../lib/motion';
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

  const barHeights = [45, 80, 60, 95, 30, 70, 85, 40, 90, 65, 75, 50, 92, 55, 35, 78, 62, 88, 48, 72];
  const clampedProgress = Math.min(100, Math.max(0, progressPercent));

  return (
    <motion.section
      role="region"
      aria-label="Audio DSP Analysis in Progress"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.28, ease: STUDIO_EASE }}
      className="studio-elevated squircle-outer p-6 md:p-8 space-y-6"
    >
      {/* Header with File Info */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 studio-hairline-b">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="p-2.5 squircle-inner bg-[var(--accent-soft)] text-[var(--accent-primary)] border border-[var(--border-active-color)] shrink-0">
            <Disc3 className="w-5 h-5 animate-spin" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[var(--text-primary)] flex flex-wrap items-center gap-2">
              <span>Live Mathematical DSP Analysis in Progress</span>
              <span className="text-[11px] font-mono font-medium px-2 py-0.5 squircle-inner bg-[var(--accent-soft)] text-[var(--accent-primary)] border border-[var(--border-active-color)]">
                REAL DSP
              </span>
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5 font-mono tabular-nums truncate max-w-xl">
              Analyzing: <strong className="text-[var(--text-primary)]">{fileName}</strong> ({sizeMb} MB) · Target: {genreLabel}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold font-mono text-[var(--accent-primary)] tabular-nums leading-none">
            {Math.round(clampedProgress)}%
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] mt-1">Completion</div>
        </div>
      </div>

      {/* Daylight Studio Recessed Equalizer Scanner */}
      <div className="relative h-28 w-full squircle-inner studio-surface overflow-hidden flex items-end justify-center gap-1.5 px-5 pb-3.5">
        {/* Subtle Horizontal Studio Gridlines */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-1/3 border-t border-dashed border-[var(--border-hairline-color)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-2/3 border-t border-dashed border-[var(--border-hairline-color)]"
        />

        {/* Soft Scanning Beam */}
        <div
          aria-hidden="true"
          className="absolute inset-y-0 w-36 bg-gradient-to-r from-transparent via-[var(--accent-primary)]/14 to-transparent pointer-events-none animate-scanline"
        />

        {/* 20 Vertical Equalizer Bars */}
        {barHeights.map((h, i) => {
          const delay = (i * 0.06).toFixed(2);
          const duration = (0.8 + (i % 5) * 0.15).toFixed(2);
          return (
            <div
              key={i}
              className="w-full max-w-[12px] bg-[var(--accent-primary)]/85 rounded-t-[4px] origin-bottom animate-eq-pulse"
              style={{
                height: `${h}%`,
                animationDelay: `${delay}s`,
                animationDuration: `${duration}s`,
              }}
            />
          );
        })}
      </div>

      {/* Clean Hairline Progress Track */}
      <div className="w-full bg-[var(--bg-surface)] border border-[var(--border-hairline-color)] h-2 rounded-full overflow-hidden">
        <div
          className="h-full bg-[var(--accent-primary)] rounded-full transition-all duration-150 ease-out"
          style={{ width: `${clampedProgress}%` }}
        />
      </div>

      {/* Live Step-by-Step Stage Ticker */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
        {STAGES.map((stageFnOrStr, idx) => {
          const stageText = typeof stageFnOrStr === 'function' ? stageFnOrStr(genreLabel) : stageFnOrStr;
          const isDone = stageIndex > idx;
          const isActive = stageIndex === idx;

          return (
            <div
              key={idx}
              className={`flex items-start gap-2.5 p-3.5 squircle-inner border text-xs transition-colors ${
                isDone
                  ? 'border-[var(--status-safe)]/30 bg-[var(--accent-soft)]/50 text-[var(--text-primary)]'
                  : isActive
                  ? 'border-[var(--border-active-color)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                  : 'border-[var(--border-hairline-color)] bg-[var(--bg-surface)] text-[var(--text-secondary)]'
              }`}
            >
              <div className="mt-0.5 shrink-0">
                {isDone ? (
                  <div className="w-4 h-4 rounded-full bg-[var(--status-safe)] text-white flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </div>
                ) : isActive ? (
                  <Loader2 className="w-4 h-4 text-[var(--accent-primary)] animate-spin" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-[var(--border-hairline-color)] text-[10px] font-mono tabular-nums flex items-center justify-center text-[var(--text-secondary)]">
                    {idx + 1}
                  </div>
                )}
              </div>
              <span className={isActive ? 'font-semibold' : ''}>{stageText}</span>
            </div>
          );
        })}
      </div>
    </motion.section>
  );
};

import React, { useMemo, useState } from 'react';
import {
  AnalysisReport,
  GenreId,
  MixStage,
} from '../contracts/analysisContract';
import { GENRE_LABELS, MIX_STAGE_LABELS } from '../contracts/demoFixtures';
import {
  buildSixBandSpectralProfile,
  SixBandMeasurements,
  SpectralBandDatum,
} from '../audio/spectralProfile';

interface SpectralTonalBalanceGraphProps {
  report: AnalysisReport;
  genre: GenreId;
  mixStage: MixStage;
  measuredSixBands?: SixBandMeasurements | null;
  referenceSixBands?: SixBandMeasurements | null;
  referenceFileName?: string | null;
  variant?: 'simple' | 'advanced';
  onSelectFlaggedIssue?: (issueId: string) => void;
}

const CHART_MIN_DB = -48;
const CHART_MAX_DB = -6;

function clampDb(val: number): number {
  return Math.max(CHART_MIN_DB, Math.min(CHART_MAX_DB, val));
}

function buildSmoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;

  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function buildEnvelopePolygon(
  topPoints: Array<{ x: number; y: number }>,
  bottomPoints: Array<{ x: number; y: number }>
): string {
  if (topPoints.length === 0 || bottomPoints.length === 0) return '';
  const topPath = buildSmoothPath(topPoints);
  const reversedBottom = [...bottomPoints].reverse();
  const bottomCurve = buildSmoothPath(reversedBottom).replace(/^M/, 'L');
  return `${topPath} ${bottomCurve} Z`;
}

export const SpectralTonalBalanceGraph: React.FC<SpectralTonalBalanceGraphProps> = ({
  report,
  genre,
  mixStage,
  measuredSixBands = null,
  referenceSixBands = null,
  referenceFileName = null,
  variant = 'simple',
  onSelectFlaggedIssue,
}) => {
  const bands = useMemo(
    () =>
      buildSixBandSpectralProfile({
        report,
        genre,
        mixStage,
        measuredSixBands,
        referenceSixBands,
      }),
    [report, genre, mixStage, measuredSixBands, referenceSixBands]
  );

  // Default focused band to the first flagged band (or Low-Mid if none flagged) for clear immediate context
  const defaultActiveIndex = useMemo(() => {
    const flaggedIdx = bands.findIndex((b) => b.flaggedByActionPlan);
    return flaggedIdx >= 0 ? flaggedIdx : 2;
  }, [bands]);

  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const activeIdx = hoveredIdx !== null ? hoveredIdx : defaultActiveIndex;
  const activeBand: SpectralBandDatum | undefined = bands[activeIdx];

  const isAdvanced = variant === 'advanced';
  const svgWidth = 760;
  const svgHeight = isAdvanced ? 268 : 236;
  const padLeft = 52;
  const padRight = 24;
  const padTop = 24;
  const padBottom = 46;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const dbToY = (db: number) => {
    const clamped = clampDb(db);
    const ratio = (clamped - CHART_MIN_DB) / (CHART_MAX_DB - CHART_MIN_DB);
    return padTop + plotH * (1 - ratio);
  };

  const bandWidth = plotW / bands.length;
  const bandCenterX = (idx: number) => padLeft + bandWidth * (idx + 0.5);

  const gridLines = isAdvanced
    ? [-6, -12, -18, -24, -30, -36, -42, -48]
    : [-12, -24, -36, -48];

  const envelopeTopPts = bands.map((b, i) => ({
    x: bandCenterX(i),
    y: dbToY(b.targetMaxDbfs),
  }));
  const envelopeBotPts = bands.map((b, i) => ({
    x: bandCenterX(i),
    y: dbToY(b.targetMinDbfs),
  }));
  const envelopePath = buildEnvelopePolygon(envelopeTopPts, envelopeBotPts);

  const measuredPts = bands
    .map((b, i) =>
      b.measuredDbfs !== null
        ? { x: bandCenterX(i), y: dbToY(b.measuredDbfs), band: b, index: i }
        : null
    )
    .filter((p): p is { x: number; y: number; band: SpectralBandDatum; index: number } => p !== null);

  const measuredCurvePath = buildSmoothPath(measuredPts.map((p) => ({ x: p.x, y: p.y })));

  const referencePts = bands
    .map((b, i) =>
      b.referenceDbfs !== null
        ? { x: bandCenterX(i), y: dbToY(b.referenceDbfs) }
        : null
    )
    .filter((p): p is { x: number; y: number } => p !== null);

  const referenceCurvePath =
    referencePts.length >= 2 ? buildSmoothPath(referencePts) : '';

  const flaggedCount = bands.filter((b) => b.flaggedByActionPlan).length;

  return (
    <section
      aria-label="Spectral Tonal Balance Graph"
      data-testid={isAdvanced ? 'advanced-spectral-graph' : 'simple-spectral-graph'}
      className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-5 md:p-6 space-y-4"
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3.5 border-b border-zinc-200/80 dark:border-zinc-800">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {isAdvanced
              ? '6-Band Tonal Balance vs. Genre Target Envelope'
              : 'Spectral Tonal Balance'}
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Measured frequency distribution in dBFS compared against the{' '}
            <span className="font-medium text-zinc-800 dark:text-zinc-200">
              {GENRE_LABELS[genre]}
            </span>{' '}
            ({MIX_STAGE_LABELS[mixStage].title}) envelope.
          </p>
        </div>

        {/* Clean Unboxed Legend */}
        <div className="flex flex-wrap items-center gap-4 text-[11px] text-zinc-600 dark:text-zinc-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-[#3A7269] dark:bg-teal-400 rounded-full" />
            <span>Measured Mix</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-2.5 rounded-xs bg-[#3A7269]/15 dark:bg-teal-400/20 border border-[#3A7269]/35 dark:border-teal-400/40" />
            <span>Genre Target</span>
          </span>
          {referenceCurvePath && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 border-t-2 border-dashed border-indigo-500 dark:border-indigo-400" />
              <span className="truncate max-w-[140px]">
                Ref B{referenceFileName ? ` (${referenceFileName})` : ''}
              </span>
            </span>
          )}
          {flaggedCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>Action Plan Flag ({flaggedCount})</span>
            </span>
          )}
        </div>
      </div>

      {/* Live Hover / Focus Telemetry Readout Strip */}
      {activeBand && (
        <div
          data-testid="spectral-band-readout"
          className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg bg-[#FAFAFA] dark:bg-zinc-950/70 border border-zinc-200/80 dark:border-zinc-800 text-xs"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              {activeBand.label}
            </span>
            <span className="font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
              {activeBand.rangeLabel}
            </span>
            {activeBand.flaggedByActionPlan && (
              <>
                <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">·</span>
                <span
                  className={`font-medium ${
                    activeBand.flagSeverity === 'critical'
                      ? 'text-rose-700 dark:text-rose-400'
                      : 'text-amber-700 dark:text-amber-400'
                  }`}
                >
                  Flagged: {activeBand.flagReason}
                </span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums">
            <span>
              <span className="text-zinc-500 dark:text-zinc-400 mr-1.5">Measured:</span>
              <strong className="text-zinc-900 dark:text-zinc-100">
                {activeBand.measuredDbfs !== null
                  ? `${activeBand.measuredDbfs.toFixed(1)} dBFS`
                  : 'N/A'}
              </strong>
            </span>
            <span>
              <span className="text-zinc-500 dark:text-zinc-400 mr-1.5">Target:</span>
              <span className="text-zinc-700 dark:text-zinc-300">
                {activeBand.targetMinDbfs.toFixed(1)} to {activeBand.targetMaxDbfs.toFixed(1)} dBFS
              </span>
            </span>
            <span>
              <span className="text-zinc-500 dark:text-zinc-400 mr-1.5">Delta:</span>
              <strong
                className={
                  activeBand.deltaFromTargetDb === null
                    ? 'text-zinc-400'
                    : activeBand.status === 'in_target'
                    ? 'text-[#3A7269] dark:text-teal-400'
                    : activeBand.flaggedByActionPlan && activeBand.flagSeverity === 'critical'
                    ? 'text-rose-700 dark:text-rose-400'
                    : 'text-amber-700 dark:text-amber-400'
                }
              >
                {activeBand.deltaFromTargetDb !== null
                  ? `${activeBand.deltaFromTargetDb >= 0 ? '+' : ''}${activeBand.deltaFromTargetDb.toFixed(1)} dB`
                  : '—'}
              </strong>
            </span>
          </div>
        </div>
      )}

      {/* Responsive SVG Plot with Interactive Keyboard/Pointer Columns */}
      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto min-w-[540px] select-none"
          role="img"
          aria-label={`6-band spectral tonal balance chart for ${GENRE_LABELS[genre]} ${MIX_STAGE_LABELS[mixStage].title}`}
        >
          <defs>
            <linearGradient id={`barGrad-${variant}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3A7269" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#3A7269" stopOpacity="0.03" />
            </linearGradient>
            <linearGradient id={`flagBarGrad-${variant}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#D97706" stopOpacity="0.30" />
              <stop offset="100%" stopColor="#D97706" stopOpacity="0.04" />
            </linearGradient>
            <linearGradient id={`critBarGrad-${variant}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E11D48" stopOpacity="0.30" />
              <stop offset="100%" stopColor="#E11D48" stopOpacity="0.04" />
            </linearGradient>
          </defs>

          {/* Plot Canvas Surface */}
          <rect
            x={padLeft}
            y={padTop}
            width={plotW}
            height={plotH}
            rx={6}
            className="fill-[#FAFAFA] dark:fill-zinc-950/80 stroke-zinc-200 dark:stroke-zinc-800"
            strokeWidth={1}
          />

          {/* Horizontal dBFS Gridlines */}
          {gridLines.map((db) => {
            const y = dbToY(db);
            return (
              <g key={db}>
                <line
                  x1={padLeft}
                  x2={padLeft + plotW}
                  y1={y}
                  y2={y}
                  className="stroke-zinc-200/80 dark:stroke-zinc-800/90"
                  strokeWidth={1}
                  strokeDasharray={isAdvanced && db % 12 !== 0 ? '2 4' : undefined}
                />
                <text
                  x={padLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-zinc-400 dark:fill-zinc-500 text-[10px] font-mono tabular-nums"
                >
                  {db}
                </text>
              </g>
            );
          })}

          {/* Y-Axis Unit Label */}
          <text
            x={padLeft - 8}
            y={padTop - 8}
            textAnchor="end"
            className="fill-zinc-400 dark:fill-zinc-500 text-[9.5px] font-mono"
          >
            dBFS
          </text>

          {/* Vertical Band Separators & Hover Column Highlight */}
          {bands.map((band, idx) => {
            const colX = padLeft + idx * bandWidth;
            const isHovered = activeIdx === idx;
            return (
              <g key={`col-${band.id}`}>
                {isHovered && (
                  <rect
                    x={colX + 2}
                    y={padTop + 1}
                    width={bandWidth - 4}
                    height={plotH - 2}
                    rx={4}
                    className="fill-[#3A7269]/[0.06] dark:fill-teal-400/[0.08]"
                  />
                )}
                {idx > 0 && (
                  <line
                    x1={colX}
                    x2={colX}
                    y1={padTop}
                    y2={padTop + plotH}
                    className="stroke-zinc-200/50 dark:stroke-zinc-800/60"
                    strokeWidth={1}
                  />
                )}
              </g>
            );
          })}

          {/* Soft Shaded Genre Target Envelope */}
          {envelopePath && (
            <path
              d={envelopePath}
              className="fill-[#3A7269]/[0.13] dark:fill-teal-400/[0.14] stroke-[#3A7269]/35 dark:stroke-teal-400/35"
              strokeWidth={1}
            />
          )}

          {/* Subtle Vertical Measured Bars */}
          {bands.map((band, idx) => {
            if (band.measuredDbfs === null) return null;
            const cx = bandCenterX(idx);
            const barW = Math.min(34, bandWidth * 0.32);
            const topY = dbToY(band.measuredDbfs);
            const bottomY = padTop + plotH;
            const barH = Math.max(2, bottomY - topY);

            const fillUrl = band.flaggedByActionPlan
              ? band.flagSeverity === 'critical'
                ? `url(#critBarGrad-${variant})`
                : `url(#flagBarGrad-${variant})`
              : `url(#barGrad-${variant})`;

            return (
              <rect
                key={`bar-${band.id}`}
                x={cx - barW / 2}
                y={topY}
                width={barW}
                height={barH}
                rx={3}
                fill={fillUrl}
              />
            );
          })}

          {/* Optional Reference Track B Dashed Curve */}
          {referenceCurvePath && (
            <path
              d={referenceCurvePath}
              fill="none"
              className="stroke-indigo-500/80 dark:stroke-indigo-400/80"
              strokeWidth={1.75}
              strokeDasharray="5 4"
            />
          )}

          {/* Smooth Measured Tonal Curve */}
          {measuredCurvePath && (
            <path
              d={measuredCurvePath}
              fill="none"
              className="stroke-[#3A7269] dark:stroke-teal-400"
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Data Nodes + Action Plan Flag Indicators */}
          {bands.map((band, idx) => {
            const cx = bandCenterX(idx);
            const isSelected = activeIdx === idx;
            const hasVal = band.measuredDbfs !== null;
            const cy = hasVal ? dbToY(band.measuredDbfs!) : padTop + plotH - 8;

            const isCrit = band.flaggedByActionPlan && band.flagSeverity === 'critical';
            const isFlag = band.flaggedByActionPlan;

            return (
              <g key={`node-${band.id}`}>
                {hasVal && (
                  <>
                    {isFlag && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isSelected ? 10 : 8}
                        className={
                          isCrit
                            ? 'fill-rose-500/18 dark:fill-rose-400/20'
                            : 'fill-amber-500/20 dark:fill-amber-400/20'
                        }
                      />
                    )}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isSelected ? 5.2 : 4.2}
                      className={
                        isCrit
                          ? 'fill-rose-600 dark:fill-rose-400 stroke-white dark:stroke-zinc-900'
                          : isFlag
                          ? 'fill-amber-500 dark:fill-amber-400 stroke-white dark:stroke-zinc-900'
                          : 'fill-[#3A7269] dark:fill-teal-400 stroke-white dark:stroke-zinc-900'
                      }
                      strokeWidth={2}
                    />

                    {/* Flagged Band Label Above Node */}
                    {isFlag && (
                      <text
                        x={cx}
                        y={Math.max(padTop + 13, cy - 12)}
                        textAnchor="middle"
                        className={`text-[10px] font-mono font-semibold ${
                          isCrit
                            ? 'fill-rose-700 dark:fill-rose-400'
                            : 'fill-amber-700 dark:fill-amber-400'
                        }`}
                      >
                        {band.deltaFromTargetDb !== null
                          ? `${band.deltaFromTargetDb >= 0 ? '+' : ''}${band.deltaFromTargetDb.toFixed(1)} dB`
                          : 'Check'}
                      </text>
                    )}
                  </>
                )}

                {/* X-Axis Band Name & Hz Range */}
                <text
                  x={cx}
                  y={padTop + plotH + 18}
                  textAnchor="middle"
                  className={`text-[11px] font-semibold ${
                    isSelected
                      ? 'fill-zinc-900 dark:fill-zinc-100'
                      : 'fill-zinc-700 dark:fill-zinc-300'
                  }`}
                >
                  {band.label}
                </text>
                <text
                  x={cx}
                  y={padTop + plotH + 33}
                  textAnchor="middle"
                  className="fill-zinc-500 dark:fill-zinc-400 text-[10px] font-mono tabular-nums"
                >
                  {band.rangeLabel}
                </text>

                {/* Accessible Interactive Hit Column */}
                <rect
                  x={padLeft + idx * bandWidth}
                  y={padTop}
                  width={bandWidth}
                  height={plotH + padBottom}
                  fill="transparent"
                  role="button"
                  tabIndex={0}
                  aria-label={`${band.label} (${band.rangeLabel}): ${
                    band.measuredDbfs !== null
                      ? `${band.measuredDbfs.toFixed(1)} dBFS, delta ${
                          band.deltaFromTargetDb !== null
                            ? `${band.deltaFromTargetDb >= 0 ? '+' : ''}${band.deltaFromTargetDb.toFixed(1)} dB`
                            : 'N/A'
                        } vs genre target`
                      : 'Unavailable'
                  }`}
                  className="cursor-pointer focus:outline-none"
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  onFocus={() => setHoveredIdx(idx)}
                  onClick={() => {
                    setHoveredIdx(idx);
                    if (band.linkedIssueId && onSelectFlaggedIssue) {
                      onSelectFlaggedIssue(band.linkedIssueId);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setHoveredIdx(idx);
                      if (band.linkedIssueId && onSelectFlaggedIssue) {
                        onSelectFlaggedIssue(band.linkedIssueId);
                      }
                    }
                  }}
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Advanced Mode Compact Band Delta Strip */}
      {isAdvanced && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1">
          {bands.map((band, idx) => {
            const isSelected = activeIdx === idx;
            return (
              <button
                key={band.id}
                type="button"
                onMouseEnter={() => setHoveredIdx(idx)}
                onFocus={() => setHoveredIdx(idx)}
                onClick={() => {
                  setHoveredIdx(idx);
                  if (band.linkedIssueId && onSelectFlaggedIssue) {
                    onSelectFlaggedIssue(band.linkedIssueId);
                  }
                }}
                className={`text-left px-2.5 py-2 rounded-lg border transition-colors ${
                  isSelected
                    ? 'border-[#3A7269] dark:border-teal-500 bg-[#3A7269]/[0.05] dark:bg-teal-950/30'
                    : 'border-zinc-200 dark:border-zinc-800 bg-[#FAFAFA] dark:bg-zinc-950/50 hover:border-zinc-300 dark:hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                    {band.shortLabel}
                  </span>
                  {band.flaggedByActionPlan && (
                    <span
                      className={`w-2 h-2 rounded-full ${
                        band.flagSeverity === 'critical' ? 'bg-rose-500' : 'bg-amber-500'
                      }`}
                      title={band.flagReason || 'Flagged band'}
                    />
                  )}
                </div>
                <div className="font-mono tabular-nums text-xs font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
                  {band.measuredDbfs !== null ? `${band.measuredDbfs.toFixed(1)}` : '—'}{' '}
                  <span className="text-[10px] font-normal text-zinc-500">dBFS</span>
                </div>
                <div className="font-mono tabular-nums text-[10px] text-zinc-500 dark:text-zinc-400">
                  {band.deltaFromTargetDb !== null
                    ? `${band.deltaFromTargetDb >= 0 ? '+' : ''}${band.deltaFromTargetDb.toFixed(1)} dB vs tgt`
                    : 'No reading'}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};

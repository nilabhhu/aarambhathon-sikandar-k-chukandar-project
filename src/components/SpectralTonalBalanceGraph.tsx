import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  AnalysisReport,
  GenreId,
  MixStage,
} from '../contracts/analysisContract';
import { GENRE_LABELS, MIX_STAGE_LABELS } from '../contracts/demoFixtures';
import { SixBandMeasurements } from '../audio/spectralProfile';
import {
  BARS_PER_BAND,
  buildRetroSpectrumModel,
  RetroBandId,
  RetroProblemZone,
} from '../audio/retroSpectrumModel';
import { TACTILE_TAP } from '../lib/motion';

interface SpectralTonalBalanceGraphProps {
  report: AnalysisReport;
  genre: GenreId;
  mixStage: MixStage;
  measuredSixBands?: SixBandMeasurements | null;
  referenceSixBands?: SixBandMeasurements | null;
  referenceFileName?: string | null;
  spectrumBins?: number[] | null;
  variant?: 'simple' | 'advanced';
  focusedIssueId?: string | null;
  flashNonce?: number;
  onSelectFlaggedIssue?: (issueId: string) => void;
}

const CHART_MIN_DB = -52;
const CHART_MAX_DB = -4;

function clampDb(val: number): number {
  return Math.max(CHART_MIN_DB, Math.min(CHART_MAX_DB, val));
}

function dbToNormalized(db: number): number {
  return (clampDb(db) - CHART_MIN_DB) / (CHART_MAX_DB - CHART_MIN_DB);
}

export const SpectralTonalBalanceGraph: React.FC<SpectralTonalBalanceGraphProps> = ({
  report,
  genre,
  mixStage,
  measuredSixBands = null,
  referenceSixBands = null,
  referenceFileName = null,
  spectrumBins = null,
  variant = 'simple',
  focusedIssueId = null,
  flashNonce = 0,
  onSelectFlaggedIssue,
}) => {
  const containerRef = useRef<HTMLElement | null>(null);

  const model = useMemo(
    () =>
      buildRetroSpectrumModel({
        report,
        genre,
        mixStage,
        measuredSixBands,
        referenceSixBands,
        spectrumBins,
      }),
    [report, genre, mixStage, measuredSixBands, referenceSixBands, spectrumBins]
  );

  const defaultFocusedBandId: RetroBandId | null = useMemo(() => {
    if (model.problemZones.length > 0) {
      return model.problemZones[0].bandId;
    }
    return null;
  }, [model.problemZones]);

  const [hoveredBandId, setHoveredBandId] = useState<RetroBandId | null>(null);
  const [lockedBandId, setLockedBandId] = useState<RetroBandId | null>(defaultFocusedBandId);
  const [flashingBandId, setFlashingBandId] = useState<RetroBandId | null>(null);
  const [activeFlashKey, setActiveFlashKey] = useState<number>(0);

  // Reset locked band cleanly when a new report arrives
  useEffect(() => {
    setLockedBandId(defaultFocusedBandId);
    setHoveredBandId(null);
  }, [report.report_id, defaultFocusedBandId]);

  // Bidirectional sync: clicking an issue card below focuses + flashes its problem frequency zone
  useEffect(() => {
    if (!focusedIssueId || flashNonce <= 0) return;
    const mappedBand = model.issueToBandMap[focusedIssueId];
    if (!mappedBand) return;

    setLockedBandId(mappedBand);
    setHoveredBandId(null);
    setFlashingBandId(mappedBand);
    setActiveFlashKey(flashNonce);

    const timer = window.setTimeout(() => {
      setFlashingBandId((cur) => (cur === mappedBand ? null : cur));
    }, 1550);

    return () => window.clearTimeout(timer);
  }, [focusedIssueId, flashNonce, model.issueToBandMap]);

  const activeBandId: RetroBandId | null = hoveredBandId ?? lockedBandId;
  const activeBand = model.bands.find((b) => b.id === activeBandId) ?? model.bands[2];
  const activeZone: RetroProblemZone | null = activeBand?.problemZone ?? null;

  const isAdvanced = variant === 'advanced';
  const svgWidth = 840;
  const svgHeight = isAdvanced ? 304 : 276;
  const padLeft = 48;
  const padRight = 18;
  const padTop = 34;
  const padBottom = 50;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const dbToY = (db: number) => padTop + plotH * (1 - dbToNormalized(db));
  const bandW = plotW / model.bands.length;
  const barSlotW = plotW / model.bars.length;
  const barW = Math.max(5.5, barSlotW - 4.5);

  const gridLines = [-6, -12, -18, -24, -30, -36, -42, -48];

  // Build soft genre target envelope polygon (targetMaxDbfs ceiling down to targetMinDbfs floor)
  const targetEnvelopePolygon = useMemo(() => {
    const upper = model.bands.flatMap((band, idx) => {
      const x0 = padLeft + idx * bandW;
      const x1 = x0 + bandW;
      const yMax = dbToY(band.targetMaxDbfs);
      return [`${x0.toFixed(1)},${yMax.toFixed(1)}`, `${x1.toFixed(1)},${yMax.toFixed(1)}`];
    });
    const lower = [...model.bands]
      .reverse()
      .flatMap((band, revIdx) => {
        const idx = model.bands.length - 1 - revIdx;
        const x0 = padLeft + idx * bandW;
        const x1 = x0 + bandW;
        const yMin = dbToY(band.targetMinDbfs);
        return [`${x1.toFixed(1)},${yMin.toFixed(1)}`, `${x0.toFixed(1)},${yMin.toFixed(1)}`];
      });
    return [...upper, ...lower].join(' ');
  }, [model.bands, bandW]);

  // Measured tonal curve polyline connecting all 48 bin tops
  const measuredCurvePoints = model.bars
    .map((bar) => {
      const cx = padLeft + (bar.index + 0.5) * barSlotW;
      const y = dbToY(bar.dbfs);
      return `${cx.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  // Target ceiling polyline
  const targetPolylinePoints = model.bars
    .map((bar) => {
      const cx = padLeft + (bar.index + 0.5) * barSlotW;
      const y = dbToY(bar.targetMaxDbfs);
      return `${cx.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  // Optional Reference Track B dashed curve
  const hasRefB = model.bars.some((b) => b.referenceDbfs !== null);
  const refBPolylinePoints = hasRefB
    ? model.bars
        .filter((b) => b.referenceDbfs !== null)
        .map((bar) => {
          const cx = padLeft + (bar.index + 0.5) * barSlotW;
          const y = dbToY(bar.referenceDbfs!);
          return `${cx.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ')
    : '';

  const handleSelectBand = (bandId: RetroBandId) => {
    setLockedBandId(bandId);
    setFlashingBandId(bandId);
    setActiveFlashKey((k) => k + 1);
    const bandObj = model.bands.find((b) => b.id === bandId);
    if (bandObj?.problemZone?.linkedIssueId && onSelectFlaggedIssue) {
      onSelectFlaggedIssue(bandObj.problemZone.linkedIssueId);
    }
  };

  return (
    <section
      ref={containerRef}
      aria-label="Spectral Tonal Balance Analyzer"
      data-testid={isAdvanced ? 'advanced-spectral-graph' : 'simple-spectral-graph'}
      className="studio-elevated squircle-outer p-5 md:p-6 space-y-4"
    >
      {/* Header & Daylight Studio Legend */}
      <div className="flex flex-wrap items-start justify-between gap-3 pb-4 studio-hairline-b">
        <div>
          <div className="text-[11px] font-mono text-[var(--accent-primary)] font-medium">
            6-Band Spectral Tonal Balance · 48-Bin FFT
          </div>
          <h2 className="text-base font-bold text-[var(--text-primary)] mt-0.5">
            {isAdvanced
              ? 'Frequency Problem-Zone Spectrum vs. Genre Target Envelope'
              : 'Spectral Tonal Balance & Flagged Frequency Zones'}
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Hover or click any frequency band to inspect exact Hz levels against{' '}
            <span className="font-medium text-[var(--text-primary)]">
              {GENRE_LABELS[genre]}
            </span>{' '}
            ({MIX_STAGE_LABELS[mixStage].title}).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3.5 text-[11px] font-mono text-[var(--text-secondary)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-[3px] bg-[var(--accent-primary)] inline-block" />
            <span>Your Mix</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-2.5 rounded-[3px] bg-[var(--accent-soft)] border border-[var(--border-active-color)] inline-block" />
            <span>Target Envelope</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-[var(--status-caution)] font-medium">
            <span className="w-2.5 h-2.5 rounded-[3px] bg-[var(--status-caution)] inline-block" />
            <span>Warning</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-[var(--status-alert)] font-medium">
            <span className="w-2.5 h-2.5 rounded-[3px] bg-[var(--status-alert)] inline-block" />
            <span>Critical</span>
          </span>
          {hasRefB && (
            <span className="inline-flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
              <span className="w-3.5 border-t-2 border-dashed border-current inline-block" />
              <span className="truncate max-w-[120px]">
                Ref B{referenceFileName ? ` (${referenceFileName})` : ''}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Daylight Studio Spectral Stage */}
      <div
        data-testid="retro-spectrum-crt"
        className="relative squircle-inner bg-[var(--bg-surface)] border border-[var(--border-hairline-color)] p-3.5 md:p-4 space-y-3"
      >
        {/* Top Diagnostic Summary Row & Interactive Callout Card */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[var(--text-secondary)]">
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{
                  backgroundColor:
                    model.problemZones.length > 0
                      ? 'var(--status-alert)'
                      : 'var(--status-safe)',
                }}
              />
              <span className="font-semibold text-[var(--text-primary)]">
                {model.problemZones.length > 0
                  ? `${model.problemZones.length} Flagged Frequency Zone${model.problemZones.length > 1 ? 's' : ''} Detected`
                  : 'All 6 Frequency Bands Within Genre Target Envelope'}
              </span>
            </div>
            <span className="tabular-nums">
              {activeBand.label} ({activeBand.axisRange}) ·{' '}
              <strong className="text-[var(--text-primary)]">
                {activeBand.measuredDbfs.toFixed(1)} dBFS
              </strong>
            </span>
          </div>

          {/* Interactive Band Diagnostic Callout */}
          <div className="min-h-[72px] flex items-end">
            {activeZone ? (
              <div
                data-testid="retro-rpg-tooltip"
                className={`w-full px-4 py-3 squircle-inner bg-[var(--bg-elevated)] border transition-all duration-150 ${
                  activeZone.severity === 'critical'
                    ? 'border-[var(--status-alert)]/45'
                    : 'border-[var(--status-caution)]/45'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center justify-center w-5 h-5 rounded-md font-mono text-xs font-bold text-white ${
                        activeZone.severity === 'critical'
                          ? 'bg-[var(--status-alert)]'
                          : 'bg-[var(--status-caution)]'
                      }`}
                    >
                      !
                    </span>
                    <span
                      data-testid="retro-rpg-tooltip-headline"
                      className={`text-xs font-semibold ${
                        activeZone.severity === 'critical'
                          ? 'text-[var(--status-alert)]'
                          : 'text-[var(--status-caution)]'
                      }`}
                    >
                      {activeZone.headline}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">
                    {activeZone.measuredDbfs > activeZone.targetMaxDbfs
                      ? `Avg ${activeZone.measuredDbfs.toFixed(1)} / Target ${activeZone.targetMaxDbfs.toFixed(1)} dBFS`
                      : `Peak ${activeZone.peakDbfs.toFixed(1)} / Target ${activeZone.targetMaxDbfs.toFixed(1)} dBFS`}
                  </span>
                </div>

                <p
                  data-testid="retro-rpg-tooltip-tip"
                  className="mt-1.5 text-xs text-[var(--text-primary)] leading-relaxed"
                >
                  {activeZone.actionableTip}
                </p>
              </div>
            ) : (
              <div
                data-testid="retro-rpg-tooltip"
                className="w-full px-4 py-3 squircle-inner bg-[var(--bg-elevated)] border border-[var(--border-active-color)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    data-testid="retro-rpg-tooltip-headline"
                    className="text-xs font-semibold text-[var(--accent-primary)]"
                  >
                    {activeBand.axisRange}: {activeBand.label} — Within Target
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">
                    {activeBand.measuredDbfs.toFixed(1)} dBFS (Target {activeBand.targetMinDbfs.toFixed(1)} to {activeBand.targetMaxDbfs.toFixed(1)})
                  </span>
                </div>
                <p
                  data-testid="retro-rpg-tooltip-tip"
                  className="mt-1 text-xs text-[var(--text-secondary)] leading-relaxed"
                >
                  This band sits cleanly inside your genre target envelope. Click any amber or crimson zone to inspect flagged EQ issues.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Daylight Studio SVG Plot Stage */}
        <div className="w-full overflow-x-auto squircle-inner bg-[var(--bg-elevated)] border border-[var(--border-hairline-color)] p-2">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-auto min-w-[560px] select-none"
            role="img"
            aria-label={`Spectral tonal balance graph for ${GENRE_LABELS[genre]} ${MIX_STAGE_LABELS[mixStage].title}`}
          >
            {/* Clean Daylight Plot Backplate */}
            <rect
              x={padLeft}
              y={padTop}
              width={plotW}
              height={plotH}
              rx={6}
              fill="var(--bg-elevated)"
              stroke="var(--border-hairline-color)"
              strokeWidth={1}
            />

            {/* Soft #EBF3F1 Genre Target Envelope Polygon */}
            <polygon
              points={targetEnvelopePolygon}
              fill="var(--accent-soft)"
              fillOpacity={0.95}
            />

            {/* Horizontal dBFS Hairline Gridlines */}
            {gridLines.map((db) => {
              const y = dbToY(db);
              return (
                <g key={db}>
                  <line
                    x1={padLeft}
                    x2={padLeft + plotW}
                    y1={y}
                    y2={y}
                    stroke="var(--border-hairline-color)"
                    strokeWidth={1}
                    strokeDasharray={db % 12 === 0 ? undefined : '2 4'}
                  />
                  <text
                    x={padLeft - 8}
                    y={y + 3.5}
                    textAnchor="end"
                    fill="var(--text-secondary)"
                    className="text-[10px] font-mono tabular-nums"
                  >
                    {db}
                  </text>
                </g>
              );
            })}

            <text
              x={padLeft - 8}
              y={padTop - 10}
              textAnchor="end"
              fill="var(--text-secondary)"
              className="text-[9.5px] font-mono"
            >
              dBFS
            </text>

            {/* Vertical Band Dividers & Flagged Problem Frequency Zone Overlays */}
            {model.bands.map((band, idx) => {
              const colX = padLeft + idx * bandW;
              const zone = band.problemZone;
              const isSelected = activeBand.id === band.id;
              const isFlashing = flashingBandId === band.id;

              const overlayColor =
                zone?.severity === 'critical'
                  ? 'var(--status-alert)'
                  : zone?.severity === 'warning'
                  ? 'var(--status-caution)'
                  : 'var(--accent-primary)';

              return (
                <g key={`band-bg-${band.id}`}>
                  {/* Subtle hover/selection highlight for balanced band */}
                  {!zone && isSelected && (
                    <rect
                      x={colX + 1}
                      y={padTop + 1}
                      width={bandW - 2}
                      height={plotH - 2}
                      fill="var(--accent-primary)"
                      fillOpacity={0.05}
                    />
                  )}

                  {/* Flagged Warning (#B45309) or Critical (#BE123C) Zone Overlay */}
                  {zone && (
                    <g data-testid={`problem-zone-${band.id}`}>
                      <rect
                        key={isFlashing ? `flash-${band.id}-${activeFlashKey}` : `pulse-${band.id}`}
                        x={colX + 1}
                        y={padTop + 1}
                        width={bandW - 2}
                        height={plotH - 2}
                        fill={overlayColor}
                        className={
                          isFlashing
                            ? 'animate-retro-zone-flash'
                            : 'animate-retro-zone-pulse'
                        }
                      />
                      <rect
                        x={colX + 1.5}
                        y={padTop + 1.5}
                        width={bandW - 3}
                        height={plotH - 3}
                        fill="none"
                        stroke={overlayColor}
                        strokeWidth={isSelected || isFlashing ? 1.5 : 1}
                        strokeDasharray={isSelected || isFlashing ? undefined : '4 3'}
                        strokeOpacity={isSelected || isFlashing ? 0.75 : 0.4}
                      />
                    </g>
                  )}

                  {/* Band Separator */}
                  {idx > 0 && (
                    <line
                      x1={colX}
                      x2={colX}
                      y1={padTop}
                      y2={padTop + plotH}
                      stroke="var(--border-hairline-color)"
                      strokeWidth={1}
                    />
                  )}
                </g>
              );
            })}

            {/* 48 Precision Daylight Spectral Bars */}
            {model.bars.map((bar) => {
              const bandObj = model.bands.find((b) => b.id === bar.bandId)!;
              const zone = bandObj.problemZone;
              const isSelectedBand = activeBand.id === bar.bandId;
              const yTop = dbToY(bar.dbfs);
              const barH = Math.max(2, padTop + plotH - yTop);
              const x = padLeft + bar.index * barSlotW + (barSlotW - barW) / 2;

              const barFill =
                zone?.severity === 'critical'
                  ? 'var(--status-alert)'
                  : zone?.severity === 'warning'
                  ? 'var(--status-caution)'
                  : 'var(--accent-primary)';

              return (
                <g
                  key={`bar-${bar.index}`}
                  data-testid={`spectrum-bar-${bar.index}`}
                  data-problem-state={zone ? zone.severity : 'normal'}
                >
                  <rect
                    x={x}
                    y={yTop}
                    width={barW}
                    height={barH}
                    rx={2}
                    fill={barFill}
                    fillOpacity={zone ? (isSelectedBand ? 0.85 : 0.68) : isSelectedBand ? 0.52 : 0.34}
                  />
                </g>
              );
            })}

            {/* Target Envelope Upper Boundary Dashed Curve */}
            <polyline
              points={targetPolylinePoints}
              fill="none"
              stroke="var(--accent-primary)"
              strokeWidth={1.25}
              strokeDasharray="4 3"
              strokeOpacity={0.55}
            />

            {/* Primary #3A7269 Measured Spectral Tonal Curve */}
            <polyline
              points={measuredCurvePoints}
              fill="none"
              stroke="var(--accent-primary)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Optional Reference B Dashed Curve */}
            {refBPolylinePoints && (
              <polyline
                points={refBPolylinePoints}
                fill="none"
                stroke="#6366F1"
                strokeWidth={1.75}
                strokeDasharray="4 3"
                strokeOpacity={0.9}
              />
            )}

            {/* Flagged Band Markers above each Problem Zone Peak */}
            {model.problemZones.map((zone) => {
              const peakX = padLeft + (zone.peakBarIndex + 0.5) * barSlotW;
              const peakY = dbToY(zone.peakDbfs);
              const markerY = Math.max(padTop + 16, peakY - 14);
              const color =
                zone.severity === 'critical' ? 'var(--status-alert)' : 'var(--status-caution)';

              return (
                <g
                  key={`marker-${zone.zoneId}`}
                  data-testid={`pixel-warning-marker-${zone.bandId}`}
                  className="pointer-events-none"
                >
                  <g className="animate-retro-marker-bounce">
                    <rect
                      x={peakX - 8}
                      y={markerY - 9}
                      width={16}
                      height={16}
                      rx={5}
                      fill={color}
                    />
                    <text
                      x={peakX}
                      y={markerY + 3}
                      textAnchor="middle"
                      fill="#FFFFFF"
                      className="font-mono text-[11px] font-bold"
                    >
                      !
                    </text>
                  </g>
                  <line
                    x1={peakX}
                    y1={markerY + 8}
                    x2={peakX}
                    y2={Math.max(markerY + 10, peakY - 2)}
                    stroke={color}
                    strokeWidth={1.25}
                    strokeDasharray="2 2"
                  />
                </g>
              );
            })}

            {/* X-Axis Frequency Band Labels & Interactive Hit Columns */}
            {model.bands.map((band, idx) => {
              const colX = padLeft + idx * bandW;
              const cx = colX + bandW / 2;
              const zone = band.problemZone;
              const isSelected = activeBand.id === band.id;

              const labelFill =
                zone?.severity === 'critical'
                  ? 'var(--status-alert)'
                  : zone?.severity === 'warning'
                  ? 'var(--status-caution)'
                  : isSelected
                  ? 'var(--accent-primary)'
                  : 'var(--text-primary)';

              return (
                <g key={`axis-${band.id}`}>
                  <text
                    x={cx}
                    y={padTop + plotH + 20}
                    textAnchor="middle"
                    fill={labelFill}
                    className="text-[12px] font-semibold"
                  >
                    {band.label}
                  </text>
                  <text
                    x={cx}
                    y={padTop + plotH + 36}
                    textAnchor="middle"
                    fill="var(--text-secondary)"
                    className="text-[10px] font-mono tabular-nums"
                  >
                    {band.axisRange}
                  </text>

                  {/* Interactive Hover & Click Hit Column */}
                  <rect
                    x={colX}
                    y={padTop}
                    width={bandW}
                    height={plotH + padBottom}
                    fill="transparent"
                    role="button"
                    tabIndex={0}
                    data-testid={`spectrum-zone-trigger-${band.id}`}
                    aria-label={
                      zone
                        ? `${band.label} (${band.axisRange}): ${zone.headline}. ${zone.actionableTip}`
                        : `${band.label} (${band.axisRange}): ${band.measuredDbfs.toFixed(1)} dBFS, within target`
                    }
                    className="cursor-pointer focus:outline-none"
                    onMouseEnter={() => setHoveredBandId(band.id)}
                    onMouseLeave={() => setHoveredBandId(null)}
                    onFocus={() => setHoveredBandId(band.id)}
                    onBlur={() => setHoveredBandId(null)}
                    onClick={() => handleSelectBand(band.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelectBand(band.id);
                      }
                    }}
                  />
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Interactive 6-Band Telemetry Selector Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {model.bands.map((band) => {
          const zone = band.problemZone;
          const isSelected = activeBand.id === band.id;
          const isCrit = zone?.severity === 'critical';
          const isWarn = zone?.severity === 'warning';

          return (
            <motion.button
              key={band.id}
              type="button"
              whileTap={TACTILE_TAP}
              data-testid={`band-chip-${band.id}`}
              onMouseEnter={() => setHoveredBandId(band.id)}
              onMouseLeave={() => setHoveredBandId(null)}
              onClick={() => handleSelectBand(band.id)}
              className={`text-left px-3 py-2.5 squircle-inner border transition-colors cursor-pointer ${
                isSelected
                  ? isCrit
                    ? 'border-[var(--status-alert)] bg-rose-50/70 dark:bg-rose-950/30'
                    : isWarn
                    ? 'border-[var(--status-caution)] bg-amber-50/70 dark:bg-amber-950/30'
                    : 'border-[var(--accent-primary)] bg-[var(--accent-soft)]'
                  : 'border-[var(--border-hairline-color)] bg-[var(--bg-surface)] hover:border-[var(--border-active-color)]'
              }`}
            >
              <div className="flex items-center justify-between gap-1 text-[11px]">
                <span className="font-semibold text-[var(--text-primary)]">
                  {band.label}
                </span>
                {zone && (
                  <span
                    className={`font-mono text-[10px] font-bold px-1.5 py-0.2 rounded text-white ${
                      isCrit ? 'bg-[var(--status-alert)]' : 'bg-[var(--status-caution)]'
                    }`}
                  >
                    !
                  </span>
                )}
              </div>
              <div className="font-mono tabular-nums text-[10px] text-[var(--text-secondary)]">
                {band.axisRange}
              </div>
              <div className="font-mono tabular-nums text-xs font-bold text-[var(--text-primary)] mt-1 flex items-baseline justify-between gap-1">
                <span>{band.measuredDbfs.toFixed(1)} dB</span>
                {zone ? (
                  <span
                    className={`text-[10px] font-semibold ${
                      isCrit ? 'text-[var(--status-alert)]' : 'text-[var(--status-caution)]'
                    }`}
                  >
                    +{zone.deltaDb.toFixed(1)}
                  </span>
                ) : (
                  <span className="text-[10px] text-[var(--status-safe)] font-medium">
                    OK
                  </span>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      <span className="sr-only">
        Rendered {model.bands.length * BARS_PER_BAND} frequency bins across 6 studio bands.
      </span>
    </section>
  );
};

import type { SprintPointsSummary } from '../types.js';
import { burndownIdealLine, currentMarker, rangePosition } from '../idealLine.js';

const WIDTH = 640;
const HEIGHT = 240;
const PAD = { top: 16, right: 16, bottom: 36, left: 48 };

export interface BurndownChartProps {
  readonly summary: SprintPointsSummary;
  /** ISO date for “today” — injectable for tests. */
  readonly todayIso?: string;
}

function formatNum(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function xAt(frac: number): number {
  const innerW = WIDTH - PAD.left - PAD.right;
  return PAD.left + frac * innerW;
}

function yAt(value: number, maxY: number): number {
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  return PAD.top + innerH * (1 - value / maxY);
}

/** Ideal burndown line + current remaining-points marker (no fabricated history). */
export function BurndownChart({
  summary,
  todayIso = new Date().toISOString(),
}: BurndownChartProps) {
  const ideal = burndownIdealLine(summary.totalPoints);
  const marker = currentMarker(
    todayIso,
    summary.startDate,
    summary.endDate,
    summary.remainingPoints,
  );
  const position = rangePosition(todayIso, summary.startDate, summary.endDate);
  const maxY = Math.max(summary.totalPoints, summary.remainingPoints, 1);
  const innerH = HEIGHT - PAD.top - PAD.bottom;

  const polyline = ideal
    .map((p) => `${xAt(p.x).toFixed(1)},${yAt(p.y, maxY).toFixed(1)}`)
    .join(' ');

  return (
    <div data-testid="burndown-chart">
      <svg
        className="agile-chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Sprint burndown ideal line with current remaining points"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const y = PAD.top + innerH * (1 - frac);
          return (
            <g key={frac}>
              <line
                x1={PAD.left}
                y1={y}
                x2={WIDTH - PAD.right}
                y2={y}
                className="agile-chart-grid"
              />
              <text x={PAD.left - 8} y={y + 4} textAnchor="end" className="agile-chart-axis-label">
                {formatNum(maxY * frac)}
              </text>
            </g>
          );
        })}

        <line
          x1={PAD.left}
          y1={PAD.top + innerH}
          x2={WIDTH - PAD.right}
          y2={PAD.top + innerH}
          className="agile-chart-axis"
        />
        <line
          x1={PAD.left}
          y1={PAD.top}
          x2={PAD.left}
          y2={PAD.top + innerH}
          className="agile-chart-axis"
        />

        <polyline
          fill="none"
          points={polyline}
          className="burndown-ideal"
          data-testid="burndown-ideal"
        />

        {marker ? (
          <circle
            cx={xAt(marker.x)}
            cy={yAt(marker.y, maxY)}
            r={5}
            className="burndown-current"
            data-testid="burndown-current"
          />
        ) : null}

        <text x={PAD.left} y={HEIGHT - 8} className="agile-chart-axis-label">
          {summary.startDate.slice(0, 10)}
        </text>
        <text
          x={WIDTH - PAD.right}
          y={HEIGHT - 8}
          textAnchor="end"
          className="agile-chart-axis-label"
        >
          {summary.endDate.slice(0, 10)}
        </text>
      </svg>
      {position !== 'in-range' ? (
        <p className="muted chart-note" data-testid="burndown-out-of-range">
          Current point hidden — today is {position === 'before' ? 'before' : 'after'} this
          sprint&apos;s date range.
        </p>
      ) : null}
    </div>
  );
}

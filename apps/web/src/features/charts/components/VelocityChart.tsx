import type { VelocitySprintRow } from '../types.js';

const WIDTH = 640;
const HEIGHT = 240;
const PAD = { top: 16, right: 16, bottom: 48, left: 48 };

export interface VelocityChartProps {
  readonly data: readonly VelocitySprintRow[];
}

function formatNum(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/** Inline SVG bar chart — one bar per closed sprint (mirrors SCurveChart). */
export function VelocityChart({ data }: VelocityChartProps) {
  if (data.length === 0) {
    return (
      <p className="muted" data-testid="velocity-empty">
        No closed sprints yet — velocity appears after the first sprint close.
      </p>
    );
  }

  const maxY = Math.max(...data.map((d) => d.completedPoints), 1);
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const slot = innerW / data.length;
  const barW = Math.max(8, slot * 0.55);

  return (
    <svg
      className="agile-chart"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Velocity by closed sprint"
      data-testid="velocity-chart"
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

      {data.map((row, i) => {
        const h = (row.completedPoints / maxY) * innerH;
        const x = PAD.left + i * slot + (slot - barW) / 2;
        const y = PAD.top + innerH - h;
        return (
          <g key={row.sprintId}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={Math.max(h, 0)}
              className="velocity-bar"
              data-testid={`velocity-bar-${row.sprintId}`}
            />
            <text
              x={x + barW / 2}
              y={HEIGHT - 12}
              textAnchor="middle"
              className="agile-chart-axis-label"
            >
              {row.sprintName.length > 12
                ? `${row.sprintName.slice(0, 11)}…`
                : row.sprintName}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

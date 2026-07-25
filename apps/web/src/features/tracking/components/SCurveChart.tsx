import type { SCurve } from '../types.js';

const WIDTH = 640;
const HEIGHT = 240;
const PAD = { top: 16, right: 16, bottom: 36, left: 48 };

export interface SCurveChartProps {
  readonly data: SCurve;
}

function formatNum(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/** Inline SVG S-curve — PV polyline + EV/AC markers at the current date. */
export function SCurveChart({ data }: SCurveChartProps) {
  const { points, current } = data;
  if (points.length === 0) {
    return <p className="muted">No baseline span to chart yet.</p>;
  }

  const values = [
    ...points.map((p) => p.pv),
    current.ev,
    current.ac,
  ];
  const maxY = Math.max(...values, 1);
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;

  const xAt = (index: number): number =>
    PAD.left + (points.length === 1 ? innerW / 2 : (index / (points.length - 1)) * innerW);

  const yAt = (value: number): number => PAD.top + innerH * (1 - value / maxY);

  const polyline = points
    .map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.pv).toFixed(1)}`)
    .join(' ');

  // Place EV/AC markers on the x-axis by nearest PV sample date (or last point).
  let markerIndex = points.findIndex((p) => p.date >= current.date);
  if (markerIndex < 0) markerIndex = points.length - 1;
  const markerX = xAt(markerIndex);

  return (
    <svg
      className="s-curve-chart"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Planned value S-curve with earned value and actual cost markers"
    >
      {/* Grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const y = PAD.top + innerH * (1 - frac);
        return (
          <g key={frac}>
            <line
              x1={PAD.left}
              y1={y}
              x2={WIDTH - PAD.right}
              y2={y}
              className="s-curve-grid"
            />
            <text x={PAD.left - 8} y={y + 4} textAnchor="end" className="s-curve-axis-label">
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
        className="s-curve-axis"
      />
      <line
        x1={PAD.left}
        y1={PAD.top}
        x2={PAD.left}
        y2={PAD.top + innerH}
        className="s-curve-axis"
      />

      <polyline
        fill="none"
        points={polyline}
        className="s-curve-pv"
        data-testid="s-curve-pv"
      />

      <circle
        cx={markerX}
        cy={yAt(current.ev)}
        r={5}
        className="s-curve-ev"
        data-testid="s-curve-ev"
      />
      <circle
        cx={markerX}
        cy={yAt(current.ac)}
        r={5}
        className="s-curve-ac"
        data-testid="s-curve-ac"
      />

      <text
        x={PAD.left}
        y={HEIGHT - 8}
        className="s-curve-axis-label"
      >
        {points[0]?.date}
      </text>
      <text
        x={WIDTH - PAD.right}
        y={HEIGHT - 8}
        textAnchor="end"
        className="s-curve-axis-label"
      >
        {points[points.length - 1]?.date}
      </text>
    </svg>
  );
}

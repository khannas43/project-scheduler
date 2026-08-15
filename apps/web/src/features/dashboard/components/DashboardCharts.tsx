import type { ProgressBreakdown, PhaseProgressRow, SCurvePayload } from '../types.js';

const DONUT_SIZE = 180;
const DONUT_STROKE = 22;

export function ProgressDonut({ breakdown }: { breakdown: ProgressBreakdown }) {
  const segments = [
    { key: 'completed', label: 'Done', value: breakdown.completed, color: '#14b8a6' },
    { key: 'inProgress', label: 'In progress', value: breakdown.inProgress, color: '#2dd4bf' },
    { key: 'notStarted', label: 'Not started', value: breakdown.notStarted, color: '#475569' },
  ];
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const r = (DONUT_SIZE - DONUT_STROKE) / 2;
  const c = 2 * Math.PI * r;
  const cx = DONUT_SIZE / 2;
  const cy = DONUT_SIZE / 2;

  let offset = 0;
  const arcs =
    total === 0
      ? null
      : segments.map((s) => {
          const len = (s.value / total) * c;
          const arc = (
            <circle
              key={s.key}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={DONUT_STROKE}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          );
          offset += len;
          return arc;
        });

  return (
    <div className="dash-donut-wrap">
      <svg
        className="dash-donut"
        viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}
        role="img"
        aria-label="Task progress breakdown"
      >
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={DONUT_STROKE}
        />
        {arcs}
        <text x={cx} y={cy - 4} textAnchor="middle" className="dash-donut-center-value">
          {total}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="dash-donut-center-label">
          leaf tasks
        </text>
      </svg>
      <ul className="dash-donut-legend">
        {segments.map((s) => (
          <li key={s.key}>
            <span className="dash-swatch" style={{ background: s.color }} />
            <span>
              {s.label} <strong>{s.value}</strong>
            </span>
          </li>
        ))}
        <li>
          <span className="dash-swatch" style={{ background: '#94a3b8' }} />
          <span>
            Milestones <strong>{breakdown.milestone}</strong>
          </span>
        </li>
      </ul>
    </div>
  );
}

export function PhaseProgressChart({ phases }: { phases: readonly PhaseProgressRow[] }) {
  if (phases.length === 0) {
    return <p className="muted">No root WBS phases to chart yet.</p>;
  }

  const width = 520;
  const rowH = 28;
  const padL = 120;
  const padR = 48;
  const height = phases.length * rowH + 16;
  const barW = width - padL - padR;

  return (
    <svg
      className="dash-phase-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Phase percent complete"
    >
      {phases.map((p, i) => {
        const y = 8 + i * rowH;
        const pct = Math.max(0, Math.min(100, p.percentComplete));
        const w = (pct / 100) * barW;
        return (
          <g key={p.taskId}>
            <text x={padL - 8} y={y + 14} textAnchor="end" className="dash-phase-label">
              {(p.wbsCode ? `${p.wbsCode} ` : '') + p.name.slice(0, 18)}
            </text>
            <rect
              x={padL}
              y={y + 4}
              width={barW}
              height={14}
              rx={3}
              className="dash-phase-track"
            />
            <rect
              x={padL}
              y={y + 4}
              width={Math.max(w, pct > 0 ? 2 : 0)}
              height={14}
              rx={3}
              className={p.isCritical ? 'dash-phase-fill is-critical' : 'dash-phase-fill'}
            />
            <text x={padL + barW + 6} y={y + 14} className="dash-phase-pct">
              {Math.round(pct)}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Compact S-curve for the dashboard (reuses tracking chart classes). */
export function DashboardSCurve({ data }: { data: SCurvePayload }) {
  const WIDTH = 640;
  const HEIGHT = 220;
  const PAD = { top: 16, right: 16, bottom: 32, left: 44 };
  const { points, current } = data;

  if (points.length === 0) {
    return <p className="muted">No baseline span to chart yet.</p>;
  }

  const values = [...points.map((p) => p.pv), current.ev, current.ac];
  const maxY = Math.max(...values, 1);
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const xAt = (index: number): number =>
    PAD.left + (points.length === 1 ? innerW / 2 : (index / (points.length - 1)) * innerW);
  const yAt = (value: number): number => PAD.top + innerH * (1 - value / maxY);
  const polyline = points.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.pv).toFixed(1)}`).join(' ');

  let markerIndex = points.findIndex((p) => p.date >= current.date);
  if (markerIndex < 0) markerIndex = points.length - 1;
  const markerX = xAt(markerIndex);

  return (
    <svg
      className="s-curve-chart dash-s-curve"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Planned value S-curve with EV and AC"
    >
      {[0, 0.5, 1].map((frac) => {
        const y = PAD.top + innerH * (1 - frac);
        return (
          <g key={frac}>
            <line x1={PAD.left} y1={y} x2={WIDTH - PAD.right} y2={y} className="s-curve-grid" />
            <text x={PAD.left - 6} y={y + 4} textAnchor="end" className="s-curve-axis-label">
              {Math.round(maxY * frac)}
            </text>
          </g>
        );
      })}
      <polyline points={polyline} fill="none" className="s-curve-pv" />
      <circle cx={markerX} cy={yAt(current.ev)} r={4} className="s-curve-ev" />
      <circle cx={markerX} cy={yAt(current.ac)} r={4} className="s-curve-ac" />
      <text x={PAD.left} y={HEIGHT - 8} className="s-curve-axis-label">
        {points[0]?.date?.slice(0, 10)}
      </text>
      <text x={WIDTH - PAD.right} y={HEIGHT - 8} textAnchor="end" className="s-curve-axis-label">
        {points[points.length - 1]?.date?.slice(0, 10)}
      </text>
    </svg>
  );
}

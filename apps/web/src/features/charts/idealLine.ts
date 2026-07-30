export type RangePosition = 'before' | 'in-range' | 'after';

export interface ChartPoint {
  readonly x: number; // 0..1 along the sprint span
  readonly y: number;
}

/** UTC midnight ms for an ISO date/time string. */
export function toUtcDayMs(iso: string): number {
  const d = new Date(iso);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function rangePosition(
  todayIso: string,
  startIso: string,
  endIso: string,
): RangePosition {
  const today = toUtcDayMs(todayIso);
  const start = toUtcDayMs(startIso);
  const end = toUtcDayMs(endIso);
  if (today < start) return 'before';
  if (today > end) return 'after';
  return 'in-range';
}

/**
 * Fractional x (0..1) for `today` along [start, end]. Clamped to [0, 1]
 * when outside — callers should hide the marker and show a note instead.
 */
export function progressAlongSprint(
  todayIso: string,
  startIso: string,
  endIso: string,
): number {
  const today = toUtcDayMs(todayIso);
  const start = toUtcDayMs(startIso);
  const end = toUtcDayMs(endIso);
  if (end <= start) return 0;
  return (today - start) / (end - start);
}

/** Ideal burndown: start → totalPoints, end → 0. */
export function burndownIdealLine(totalPoints: number): readonly [ChartPoint, ChartPoint] {
  return [
    { x: 0, y: totalPoints },
    { x: 1, y: 0 },
  ];
}

/** Ideal burnup completed-line: start → 0, end → totalPoints. */
export function burnupIdealLine(totalPoints: number): readonly [ChartPoint, ChartPoint] {
  return [
    { x: 0, y: 0 },
    { x: 1, y: totalPoints },
  ];
}

/**
 * Current-point marker for burndown/burnup. Returns null when today is
 * outside the sprint range (caller shows a note instead of a fake point).
 */
export function currentMarker(
  todayIso: string,
  startIso: string,
  endIso: string,
  y: number,
): ChartPoint | null {
  if (rangePosition(todayIso, startIso, endIso) !== 'in-range') return null;
  return {
    x: Math.min(1, Math.max(0, progressAlongSprint(todayIso, startIso, endIso))),
    y,
  };
}

import type { AssignmentRow, TaskRow } from '../tasks/types.js';

export interface ResourceAssignmentItem {
  readonly assignment: AssignmentRow;
  readonly task: TaskRow;
}

const WORKING_MINUTES_PER_DAY = 480;

/** YYYY-MM-DD in UTC for an ISO timestamp. */
export function utcDayKey(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function utcDayKeyFromParts(year: number, monthIndex: number, day: number): string {
  const m = String(monthIndex + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

/** Compare YYYY-MM-DD keys lexicographically (valid for ISO dates). */
export function dayKeyCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Inclusive UTC calendar span for a task. Missing finish falls back to start;
 * missing both → not shown on the calendar.
 */
export function taskUtcSpan(task: TaskRow): { start: string; finish: string } | null {
  const start = task.earlyStart ? utcDayKey(task.earlyStart) : null;
  const finishRaw = task.earlyFinish ? utcDayKey(task.earlyFinish) : start;
  if (!start || !finishRaw) return null;
  const finish = dayKeyCompare(finishRaw, start) < 0 ? start : finishRaw;
  return { start, finish };
}

export function itemSpansUtcDay(item: ResourceAssignmentItem, dayKey: string): boolean {
  const span = taskUtcSpan(item.task);
  if (!span) return false;
  return dayKeyCompare(dayKey, span.start) >= 0 && dayKeyCompare(dayKey, span.finish) <= 0;
}

export function assignmentsForResource(
  tasks: readonly TaskRow[],
  assignments: readonly AssignmentRow[],
  resourceId: string,
): ResourceAssignmentItem[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const items: ResourceAssignmentItem[] = [];
  for (const assignment of assignments) {
    if (assignment.resourceId !== resourceId) continue;
    const task = byId.get(assignment.taskId);
    if (!task || task.isSummary) continue;
    items.push({ assignment, task });
  }
  items.sort((a, b) => {
    const as = a.task.earlyStart ?? '';
    const bs = b.task.earlyStart ?? '';
    if (as !== bs) return as < bs ? -1 : 1;
    return (a.task.wbsCode ?? '').localeCompare(b.task.wbsCode ?? '');
  });
  return items;
}

export function itemsOnDay(
  items: readonly ResourceAssignmentItem[],
  dayKey: string,
): ResourceAssignmentItem[] {
  return items.filter((item) => itemSpansUtcDay(item, dayKey));
}

/** Parse assignment/resource units; invalid → 0. */
export function parseUnits(value: string | null | undefined): number {
  if (value == null || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * True when this assignment alone exceeds the resource capacity
 * (default max units = 1 → anything above 100% is overallocated).
 */
export function isAssignmentOverallocated(
  item: ResourceAssignmentItem,
  maxUnits = 1,
): boolean {
  return assignmentUnits(item) > maxUnits;
}

/** Effective units for an assignment (blank → 1.0). */
export function assignmentUnits(item: ResourceAssignmentItem): number {
  if (item.assignment.units == null || item.assignment.units === '') return 1;
  return parseUnits(item.assignment.units);
}

/** Normalize API/DB period dates to YYYY-MM-DD. */
export function normalizePeriodDate(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export type TimephasedBucketView = {
  readonly periodDate: string;
  readonly plannedWorkMinutes: number | null;
};

/** Day-specific units from timephased contour; flat assignment units only as loading fallback. */
export function unitsOnDay(
  item: ResourceAssignmentItem,
  dayKey: string,
  contour: readonly TimephasedBucketView[] | undefined,
): number {
  if (!contour) return assignmentUnits(item);
  const row = contour.find((b) => normalizePeriodDate(b.periodDate) === dayKey);
  if (!row) return 0;
  return dayUnitsFromMinutes(row.plannedWorkMinutes ?? 0);
}

/** Sum of assignment units active on a UTC day (prefers per-day contour when provided). */
export function dayTotalUnits(
  items: readonly ResourceAssignmentItem[],
  dayKey: string,
  contours?: ReadonlyMap<string, readonly TimephasedBucketView[]>,
): number {
  let total = 0;
  for (const item of itemsOnDay(items, dayKey)) {
    total += unitsOnDay(item, dayKey, contours?.get(item.assignment.id));
  }
  return total;
}

/** Day is over when combined load exceeds max units. */
export function isDayOverallocated(
  items: readonly ResourceAssignmentItem[],
  dayKey: string,
  maxUnits = 1,
  contours?: ReadonlyMap<string, readonly TimephasedBucketView[]>,
): boolean {
  return dayTotalUnits(items, dayKey, contours) > maxUnits;
}

/** 6×7 month grid cells; Sunday-first, null = leading/trailing padding. */
export function monthGridCells(
  year: number,
  monthIndex: number,
): Array<{ day: number; dayKey: string } | null> {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const startPad = first.getUTCDay(); // 0=Sun
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const cells: Array<{ day: number; dayKey: string } | null> = [];
  for (let i = 0; i < startPad; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ day, dayKey: utcDayKeyFromParts(year, monthIndex, day) });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  while (cells.length < 42) cells.push(null);
  return cells;
}

export function workingDaysFromMinutes(durationMinutes: number | null | undefined): number {
  if (durationMinutes == null || durationMinutes <= 0) return 1;
  return Math.max(1, Math.round(durationMinutes / WORKING_MINUTES_PER_DAY));
}

export function minutesFromWorkingDays(days: number): number {
  return Math.max(1, Math.round(days)) * WORKING_MINUTES_PER_DAY;
}

/** Stable pastel accent from task id for calendar chips. */
export function taskAccent(taskId: string): string {
  let hash = 0;
  for (let i = 0; i < taskId.length; i += 1) {
    hash = (hash * 31 + taskId.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue} 42% 42%)`;
}

/** Snap units to 0.05 so the UI never sticks on values like 0.91 / 0.96. */
export function roundUnits(units: number, step = 0.05): number {
  if (!Number.isFinite(units)) return units;
  if (units === 0) return 0;
  const rounded = Math.round(units / step) * step;
  return Math.round(rounded * 1000) / 1000;
}

/** Display helper — snaps to 0.05 and stringifies without float noise. */
export function formatUnits(value: string | number | null | undefined): string {
  if (value == null || value === '') return '1';
  const n = typeof value === 'number' ? value : parseUnits(String(value));
  if (!Number.isFinite(n)) return '0';
  return String(roundUnits(n));
}

export function dayUnitsFromMinutes(plannedWorkMinutes: number): number {
  return roundUnits(plannedWorkMinutes / WORKING_MINUTES_PER_DAY);
}

/** True when day buckets are not all the same unit level. */
export function contourVariesByDay(
  contour: readonly TimephasedBucketView[] | undefined,
): boolean {
  if (!contour || contour.length <= 1) return false;
  const first = dayUnitsFromMinutes(contour[0]?.plannedWorkMinutes ?? 0);
  return contour.some((b) => dayUnitsFromMinutes(b.plannedWorkMinutes ?? 0) !== first);
}

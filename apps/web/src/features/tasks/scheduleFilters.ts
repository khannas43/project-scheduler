import type { AssignmentRow, DependencyRow, TaskRow } from './types.js';

/** Matches dashboard near-critical band (1× 8h working day). */
export const NEAR_CRITICAL_FLOAT_MINUTES = 480;

export type ScheduleFocus = 'all' | 'critical' | 'near_critical' | 'lookahead';

export type LookaheadWeeks = 2 | 4 | 6;

export interface ScheduleFilterState {
  readonly focus: ScheduleFocus;
  readonly lookaheadWeeks: LookaheadWeeks;
  readonly resourceId: string | null;
}

export const DEFAULT_SCHEDULE_FILTERS: ScheduleFilterState = {
  focus: 'all',
  lookaheadWeeks: 4,
  resourceId: null,
};

export function isScheduleFilterActive(state: ScheduleFilterState): boolean {
  return state.focus !== 'all' || state.resourceId !== null;
}

export function lookaheadWindow(
  statusDate: string | null,
  weeks: LookaheadWeeks,
  now: Date = new Date(),
): { start: Date; end: Date } {
  const base = statusDate ? new Date(statusDate) : now;
  const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + weeks * 7);
  return { start, end };
}

function taskOverlapsWindow(task: TaskRow, start: Date, end: Date): boolean {
  if (!task.earlyStart || !task.earlyFinish) return false;
  const es = Date.parse(task.earlyStart);
  const ef = Date.parse(task.earlyFinish);
  if (Number.isNaN(es) || Number.isNaN(ef)) return false;
  return es < end.getTime() && ef > start.getTime();
}

function isNearCritical(task: TaskRow): boolean {
  if (task.isCritical) return true;
  if (task.totalFloatMinutes === null) return false;
  return task.totalFloatMinutes <= NEAR_CRITICAL_FLOAT_MINUTES;
}

function matchesFocus(
  task: TaskRow,
  focus: ScheduleFocus,
  window: { start: Date; end: Date } | null,
): boolean {
  if (task.isSummary) return false;
  switch (focus) {
    case 'all':
      return true;
    case 'critical':
      return task.isCritical;
    case 'near_critical':
      return isNearCritical(task);
    case 'lookahead':
      return window !== null && taskOverlapsWindow(task, window.start, window.end);
    default:
      return true;
  }
}

/**
 * Filter the WBS for scheduler views. Matching leaf/milestone rows are kept,
 * plus every ancestor so hierarchy context remains readable.
 */
export function applyScheduleFilters(
  tasks: readonly TaskRow[],
  assignments: readonly AssignmentRow[],
  state: ScheduleFilterState,
  options: { statusDate: string | null; now?: Date },
): TaskRow[] {
  if (!isScheduleFilterActive(state)) {
    return [...tasks];
  }

  const window =
    state.focus === 'lookahead'
      ? lookaheadWindow(options.statusDate, state.lookaheadWeeks, options.now)
      : null;

  const resourceTaskIds =
    state.resourceId === null
      ? null
      : new Set(
          assignments
            .filter((a) => a.resourceId === state.resourceId)
            .map((a) => a.taskId),
        );

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const matched = new Set<string>();

  for (const task of tasks) {
    if (!matchesFocus(task, state.focus, window)) continue;
    if (resourceTaskIds && !resourceTaskIds.has(task.id)) continue;
    matched.add(task.id);
    let parentId = task.parentId;
    while (parentId) {
      matched.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
  }

  return tasks.filter((t) => matched.has(t.id));
}

export function filterDependenciesForTasks(
  dependencies: readonly DependencyRow[],
  tasks: readonly TaskRow[],
): DependencyRow[] {
  const ids = new Set(tasks.map((t) => t.id));
  return dependencies.filter((d) => ids.has(d.predecessorId) && ids.has(d.successorId));
}

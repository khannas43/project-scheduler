import { workingMinutesBetween, type CompiledCalendar } from './calendar.js';
import type { FloatResult } from './float.js';
import type { ComputedSchedule } from './forwardPass.js';
import type { TaskInput } from './taskTypes.js';
import { asEpochMinutes, type CalendarId, type EpochMinutes, type TaskId } from './types.js';

export interface SummarySchedule {
  readonly earlyStart: EpochMinutes;
  readonly earlyFinish: EpochMinutes;
  readonly durationMinutes: number;
  readonly isCritical: boolean;
}

function depthOf(taskById: ReadonlyMap<TaskId, TaskInput>, id: TaskId): number {
  let depth = 0;
  let current = taskById.get(id)?.parentId ?? null;
  while (current !== null) {
    depth += 1;
    current = taskById.get(current)?.parentId ?? null;
  }
  return depth;
}

/**
 * §4.7: after both passes, walk the WBS tree bottom-up. Only rolls up
 * early_start/early_finish/duration/is_critical — percent_complete and cost
 * need tracking and resource data that doesn't exist in TaskInput yet
 * (Phases 3 and 4 respectively).
 *
 * "Children" means *direct* children only; a summary of summaries still
 * ends up correct because deeper summaries are processed first and their
 * rolled-up values are what the shallower summary reads.
 */
export function rollupSummaries(
  tasks: readonly TaskInput[],
  forwardResults: ReadonlyMap<TaskId, ComputedSchedule>,
  floatResults: ReadonlyMap<TaskId, FloatResult>,
  calendars: ReadonlyMap<CalendarId, CompiledCalendar>,
): ReadonlyMap<TaskId, SummarySchedule> {
  const taskById = new Map(tasks.map((t) => [t.id, t] as const));
  const childrenOf = new Map<TaskId, TaskInput[]>();
  for (const t of tasks) {
    if (t.parentId === null) {
      continue;
    }
    const children = childrenOf.get(t.parentId) ?? [];
    children.push(t);
    childrenOf.set(t.parentId, children);
  }

  const summaries = tasks.filter((t) => t.isSummary);
  const orderedSummaries = [...summaries].sort((a, b) => depthOf(taskById, b.id) - depthOf(taskById, a.id));

  const earlyStartOf = new Map<TaskId, EpochMinutes>();
  const earlyFinishOf = new Map<TaskId, EpochMinutes>();
  const isCriticalOf = new Map<TaskId, boolean>();
  for (const [id, schedule] of forwardResults) {
    earlyStartOf.set(id, schedule.earlyStart);
    earlyFinishOf.set(id, schedule.earlyFinish);
  }
  for (const [id, float] of floatResults) {
    isCriticalOf.set(id, float.isCritical);
  }

  const results = new Map<TaskId, SummarySchedule>();

  for (const summary of orderedSummaries) {
    const children = childrenOf.get(summary.id) ?? [];
    if (children.length === 0) {
      throw new Error(`Summary task ${summary.id} has no children — nothing to roll up`);
    }

    let minStart = Infinity;
    let maxFinish = -Infinity;
    let anyCritical = false;

    for (const child of children) {
      const childStart = earlyStartOf.get(child.id);
      const childFinish = earlyFinishOf.get(child.id);
      if (childStart === undefined || childFinish === undefined) {
        throw new Error(`Child ${child.id} of summary ${summary.id} has no computed schedule`);
      }
      minStart = Math.min(minStart, childStart);
      maxFinish = Math.max(maxFinish, childFinish);
      if (isCriticalOf.get(child.id) === true) {
        anyCritical = true;
      }
    }

    const earlyStart = asEpochMinutes(minStart);
    const earlyFinish = asEpochMinutes(maxFinish);

    const calendar = calendars.get(summary.calendarId);
    if (!calendar) {
      throw new Error(`No compiled calendar found for calendar ${summary.calendarId} (summary ${summary.id})`);
    }

    const durationMinutes = workingMinutesBetween(earlyStart, earlyFinish, calendar);

    earlyStartOf.set(summary.id, earlyStart);
    earlyFinishOf.set(summary.id, earlyFinish);
    isCriticalOf.set(summary.id, anyCritical);

    results.set(summary.id, { earlyStart, earlyFinish, durationMinutes, isCritical: anyCritical });
  }

  return results;
}

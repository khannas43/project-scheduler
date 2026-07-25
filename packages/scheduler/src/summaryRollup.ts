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
  /**
   * Duration-weighted average of direct children's % complete (§4.7).
   * Null when Σ(child.duration) === 0 (all milestones / zero-duration children).
   */
  readonly percentComplete: number | null;
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
 * §4.7: after both passes, walk the WBS tree bottom-up.
 *
 * "Children" means *direct* children only; a summary of summaries still
 * ends up correct because deeper summaries are processed first and their
 * rolled-up values are what the shallower summary reads.
 *
 * percentComplete = Σ(child.pct × child.duration) / Σ(child.duration)
 * with null child pct treated as 0; zero total duration → null (not NaN).
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
  const percentCompleteOf = new Map<TaskId, number | null>();
  const durationOf = new Map<TaskId, number>();

  for (const [id, schedule] of forwardResults) {
    earlyStartOf.set(id, schedule.earlyStart);
    earlyFinishOf.set(id, schedule.earlyFinish);
  }
  for (const [id, float] of floatResults) {
    isCriticalOf.set(id, float.isCritical);
  }
  for (const t of tasks) {
    if (!t.isSummary) {
      percentCompleteOf.set(t.id, t.percentComplete ?? null);
      durationOf.set(t.id, t.durationMinutes);
    }
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
    let weightedPct = 0;
    let totalDuration = 0;

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

      const childDuration = durationOf.get(child.id) ?? 0;
      const childPct = percentCompleteOf.get(child.id);
      // null child → 0 in the weighted sum (§4.7 / Phase 4).
      weightedPct += (childPct ?? 0) * childDuration;
      totalDuration += childDuration;
    }

    const earlyStart = asEpochMinutes(minStart);
    const earlyFinish = asEpochMinutes(maxFinish);

    const calendar = calendars.get(summary.calendarId);
    if (!calendar) {
      throw new Error(`No compiled calendar found for calendar ${summary.calendarId} (summary ${summary.id})`);
    }

    const durationMinutes = workingMinutesBetween(earlyStart, earlyFinish, calendar);
    const percentComplete = totalDuration === 0 ? null : weightedPct / totalDuration;

    earlyStartOf.set(summary.id, earlyStart);
    earlyFinishOf.set(summary.id, earlyFinish);
    isCriticalOf.set(summary.id, anyCritical);
    percentCompleteOf.set(summary.id, percentComplete);
    // Nested rollups weight by the child's own duration (leaf duration or
    // rolled working-minute span for a child summary).
    durationOf.set(summary.id, durationMinutes);

    results.set(summary.id, {
      earlyStart,
      earlyFinish,
      durationMinutes,
      isCritical: anyCritical,
      percentComplete,
    });
  }

  return results;
}

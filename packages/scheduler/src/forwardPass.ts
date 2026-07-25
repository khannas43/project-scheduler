import { addWorkingMinutes, subtractWorkingMinutes, type CompiledCalendar } from './calendar.js';
import { computeTopologicalOrder } from './graphOrdering.js';
import { applyLag, resolveLagMinutes } from './lag.js';
import type { DependencyInput, LinkType, TaskInput } from './taskTypes.js';
import { asEpochMinutes, type CalendarId, type EpochMinutes, type TaskId } from './types.js';

export type { DependencyInput, LinkType, TaskInput } from './taskTypes.js';

export interface ComputedSchedule {
  readonly earlyStart: EpochMinutes;
  readonly earlyFinish: EpochMinutes;
}

interface PredecessorEdge {
  readonly predecessorId: TaskId;
  readonly linkType: LinkType;
  readonly lagMinutes: number;
  readonly lagPercent: number | null | undefined;
}

/**
 * §4.4 forward pass — all four link types (FS/SS/FF/SF) and signed lag,
 * including percentage lag (§13 items 27–28).
 *
 * - No constraint types (asap/snet/mso/...) — every task is effectively
 *   ASAP. Constraints + precedence are build order item 29.
 * - Summary tasks are excluded entirely, and dependencies touching one are
 *   ignored for this pass — their dates come from rollup (§4.7) after both
 *   passes. A summary can still appear in the input; it just won't appear
 *   in the output map.
 *
 * The successor's own calendar governs lag and the duration back-derivation
 * for FF/SF — the lag is part of establishing *this* task's schedule, same
 * as its own duration is.
 */
export function runForwardPass(
  projectStart: EpochMinutes,
  tasks: readonly TaskInput[],
  dependencies: readonly DependencyInput[],
  calendars: ReadonlyMap<CalendarId, CompiledCalendar>,
): ReadonlyMap<TaskId, ComputedSchedule> {
  const schedulable = tasks.filter((t) => !t.isSummary);
  const schedulableIds = new Set(schedulable.map((t) => t.id));
  const taskById = new Map(schedulable.map((t) => [t.id, t] as const));

  const relevantDeps = dependencies.filter(
    (d) => schedulableIds.has(d.predecessorId) && schedulableIds.has(d.successorId),
  );

  const predecessorsOf = new Map<TaskId, PredecessorEdge[]>();
  for (const dep of relevantDeps) {
    const preds = predecessorsOf.get(dep.successorId) ?? [];
    preds.push({
      predecessorId: dep.predecessorId,
      linkType: dep.linkType,
      lagMinutes: dep.lagMinutes,
      lagPercent: dep.lagPercent,
    });
    predecessorsOf.set(dep.successorId, preds);
  }

  const topoOrder = computeTopologicalOrder(schedulableIds, relevantDeps);

  const results = new Map<TaskId, ComputedSchedule>();

  for (const id of topoOrder) {
    const t = taskById.get(id);
    if (!t) {
      continue;
    }

    const calendar = calendars.get(t.calendarId);
    if (!calendar) {
      throw new Error(`No compiled calendar found for calendar ${t.calendarId} (task ${id})`);
    }

    const preds = predecessorsOf.get(id) ?? [];
    let earlyStart: EpochMinutes;

    if (preds.length === 0) {
      earlyStart = projectStart;
    } else {
      let maxStart = -Infinity;
      for (const edge of preds) {
        const predTask = taskById.get(edge.predecessorId);
        const predSchedule = results.get(edge.predecessorId);
        if (!predTask || !predSchedule) {
          throw new Error(`Predecessor ${edge.predecessorId} was not scheduled before its successor ${id}`);
        }
        const lag = resolveLagMinutes(edge.lagMinutes, edge.lagPercent, predTask.durationMinutes);
        const candidateStart = candidateEarlyStart(edge.linkType, predSchedule, lag, t.durationMinutes, calendar);
        maxStart = Math.max(maxStart, candidateStart);
      }
      earlyStart = asEpochMinutes(maxStart);
    }

    const earlyFinish = addWorkingMinutes(earlyStart, t.durationMinutes, calendar);
    results.set(id, { earlyStart, earlyFinish });
  }

  return results;
}

function candidateEarlyStart(
  linkType: LinkType,
  pred: ComputedSchedule,
  lag: number,
  successorDurationMinutes: number,
  calendar: CompiledCalendar,
): EpochMinutes {
  switch (linkType) {
    case 'FS':
      return applyLag(pred.earlyFinish, lag, calendar);
    case 'SS':
      return applyLag(pred.earlyStart, lag, calendar);
    case 'FF': {
      // §4.4: candidate early-finish, then calendar-aware back to early-start.
      const candidateFinish = applyLag(pred.earlyFinish, lag, calendar);
      return subtractWorkingMinutes(candidateFinish, successorDurationMinutes, calendar);
    }
    case 'SF': {
      const candidateFinish = applyLag(pred.earlyStart, lag, calendar);
      return subtractWorkingMinutes(candidateFinish, successorDurationMinutes, calendar);
    }
  }
}

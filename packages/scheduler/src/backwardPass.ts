import { addWorkingMinutes, subtractWorkingMinutes, type CompiledCalendar } from './calendar.js';
import type { DependencyInput, LinkType, TaskInput } from './forwardPass.js';
import { computeTopologicalOrder } from './graphOrdering.js';
import { resolveLagMinutes, unapplyLag } from './lag.js';
import { asEpochMinutes, type CalendarId, type EpochMinutes, type TaskId } from './types.js';

export interface BackwardSchedule {
  readonly lateStart: EpochMinutes;
  readonly lateFinish: EpochMinutes;
}

interface SuccessorEdge {
  readonly successorId: TaskId;
  readonly linkType: LinkType;
  readonly lagMinutes: number;
  readonly lagPercent: number | null | undefined;
}

/**
 * §4.5 backward pass — all four link types (FS/SS/FF/SF) and signed lag,
 * including percentage lag (§13 items 27–28). Scoped identically to
 * `runForwardPass` on constraints (still ASAP-only) and summary exclusion.
 *
 * Processes tasks in the reverse of the forward pass's topological order
 * (§4.5: "reverse topological order"), so every task's successors are
 * already resolved by the time it's processed.
 *
 * The predecessor's own calendar (the task being computed) governs lag and
 * the duration forward-derivation for SS/SF.
 */
export function runBackwardPass(
  projectFinish: EpochMinutes,
  tasks: readonly TaskInput[],
  dependencies: readonly DependencyInput[],
  calendars: ReadonlyMap<CalendarId, CompiledCalendar>,
): ReadonlyMap<TaskId, BackwardSchedule> {
  const schedulable = tasks.filter((t) => !t.isSummary);
  const schedulableIds = new Set(schedulable.map((t) => t.id));
  const taskById = new Map(schedulable.map((t) => [t.id, t] as const));

  const relevantDeps = dependencies.filter(
    (d) => schedulableIds.has(d.predecessorId) && schedulableIds.has(d.successorId),
  );

  const successorsOf = new Map<TaskId, SuccessorEdge[]>();
  for (const dep of relevantDeps) {
    const succs = successorsOf.get(dep.predecessorId) ?? [];
    succs.push({
      successorId: dep.successorId,
      linkType: dep.linkType,
      lagMinutes: dep.lagMinutes,
      lagPercent: dep.lagPercent,
    });
    successorsOf.set(dep.predecessorId, succs);
  }

  const reverseOrder = computeTopologicalOrder(schedulableIds, relevantDeps).reverse();

  const results = new Map<TaskId, BackwardSchedule>();

  for (const id of reverseOrder) {
    const t = taskById.get(id);
    if (!t) {
      continue;
    }

    const calendar = calendars.get(t.calendarId);
    if (!calendar) {
      throw new Error(`No compiled calendar found for calendar ${t.calendarId} (task ${id})`);
    }

    const succs = successorsOf.get(id) ?? [];
    let lateFinish: EpochMinutes;

    if (succs.length === 0) {
      lateFinish = projectFinish;
    } else {
      let minFinish = Infinity;
      for (const edge of succs) {
        const succSchedule = results.get(edge.successorId);
        if (!succSchedule) {
          throw new Error(`Successor ${edge.successorId} was not scheduled before its predecessor ${id}`);
        }
        // Percentage lag is of the *predecessor* duration — that's `t` here.
        const lag = resolveLagMinutes(edge.lagMinutes, edge.lagPercent, t.durationMinutes);
        const candidateFinish = candidateLateFinish(edge.linkType, succSchedule, lag, t.durationMinutes, calendar);
        minFinish = Math.min(minFinish, candidateFinish);
      }
      lateFinish = asEpochMinutes(minFinish);
    }

    const lateStart = subtractWorkingMinutes(lateFinish, t.durationMinutes, calendar);
    results.set(id, { lateStart, lateFinish });
  }

  return results;
}

function candidateLateFinish(
  linkType: LinkType,
  succ: BackwardSchedule,
  lag: number,
  predecessorDurationMinutes: number,
  calendar: CompiledCalendar,
): EpochMinutes {
  switch (linkType) {
    case 'FS':
      return unapplyLag(succ.lateStart, lag, calendar);
    case 'FF':
      return unapplyLag(succ.lateFinish, lag, calendar);
    case 'SS': {
      // §4.5: candidate late-start, then calendar-aware forward to late-finish.
      const candidateStart = unapplyLag(succ.lateStart, lag, calendar);
      return addWorkingMinutes(candidateStart, predecessorDurationMinutes, calendar);
    }
    case 'SF': {
      const candidateStart = unapplyLag(succ.lateFinish, lag, calendar);
      return addWorkingMinutes(candidateStart, predecessorDurationMinutes, calendar);
    }
  }
}

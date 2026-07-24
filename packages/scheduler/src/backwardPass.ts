import { subtractWorkingMinutes, type CompiledCalendar } from './calendar.js';
import type { DependencyInput, TaskInput } from './forwardPass.js';
import { computeTopologicalOrder } from './graphOrdering.js';
import { asEpochMinutes, type CalendarId, type EpochMinutes, type TaskId } from './types.js';

export interface BackwardSchedule {
  readonly lateStart: EpochMinutes;
  readonly lateFinish: EpochMinutes;
}

/**
 * §4.5, scoped identically to runForwardPass (§4.4's Phase 1 increment):
 * FS links only, non-negative lag only, no constraint types, summary tasks
 * excluded. See forwardPass.ts's doc comment for the full reasoning — every
 * restriction there applies here for the same reasons.
 *
 * Processes tasks in the reverse of the forward pass's topological order
 * (§4.5: "reverse topological order"), so every task's successors are
 * already resolved by the time it's processed.
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

  for (const dep of relevantDeps) {
    if (dep.linkType !== 'FS') {
      throw new Error(
        `Unsupported link type '${dep.linkType}' on ${dep.predecessorId} -> ${dep.successorId}: only FS links are implemented so far`,
      );
    }
    if (dep.lagMinutes < 0) {
      throw new Error(`Negative lag on ${dep.predecessorId} -> ${dep.successorId} is not yet supported`);
    }
  }

  const successorsOf = new Map<TaskId, { successorId: TaskId; lagMinutes: number }[]>();
  for (const dep of relevantDeps) {
    const succs = successorsOf.get(dep.predecessorId) ?? [];
    succs.push({ successorId: dep.successorId, lagMinutes: dep.lagMinutes });
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
      for (const { successorId, lagMinutes } of succs) {
        const succSchedule = results.get(successorId);
        if (!succSchedule) {
          throw new Error(`Successor ${successorId} was not scheduled before its predecessor ${id}`);
        }
        // Mirrors the forward pass's choice: the task being computed uses
        // its own calendar for the lag adjustment toward it.
        const candidateFinish =
          lagMinutes === 0 ? succSchedule.lateStart : subtractWorkingMinutes(succSchedule.lateStart, lagMinutes, calendar);
        minFinish = Math.min(minFinish, candidateFinish);
      }
      lateFinish = asEpochMinutes(minFinish);
    }

    const lateStart = subtractWorkingMinutes(lateFinish, t.durationMinutes, calendar);
    results.set(id, { lateStart, lateFinish });
  }

  return results;
}

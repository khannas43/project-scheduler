import { addWorkingMinutes, type CompiledCalendar } from './calendar.js';
import { asEpochMinutes, type CalendarId, type EpochMinutes, type TaskId } from './types.js';

export type LinkType = 'FS' | 'SS' | 'FF' | 'SF';

export interface DependencyInput {
  readonly predecessorId: TaskId;
  readonly successorId: TaskId;
  readonly linkType: LinkType;
  readonly lagMinutes: number;
}

export interface TaskInput {
  readonly id: TaskId;
  /** Summary tasks are never directly scheduled (§4.7) — excluded from the result entirely. */
  readonly isSummary: boolean;
  readonly durationMinutes: number;
  readonly calendarId: CalendarId;
}

export interface ComputedSchedule {
  readonly earlyStart: EpochMinutes;
  readonly earlyFinish: EpochMinutes;
}

/**
 * §4.4, scoped to Phase 1's stated increment ("Forward pass, FS links only",
 * TECHNICAL_DESIGN.md §13 item 16):
 *
 * - Only FS links. SS/FF/SF are Phase 2 (build order item 27) — rejected
 *   loudly here rather than silently mishandled, since that would produce
 *   wrong schedules instead of an obvious error.
 * - Only non-negative lag. Negative lag needs a "subtract working minutes"
 *   primitive that doesn't exist yet (build order item 28) — same reasoning.
 * - No constraint types (asap/snet/mso/...) — every task is effectively
 *   ASAP. Constraints + precedence are build order item 29.
 * - Summary tasks are excluded entirely, and dependencies touching one are
 *   ignored for this pass — their dates come from rollup (§4.7) after both
 *   passes, which doesn't exist yet either. A summary can still appear in
 *   the input; it just won't appear in the output map.
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

  for (const dep of relevantDeps) {
    if (dep.linkType !== 'FS') {
      throw new Error(
        `Unsupported link type '${dep.linkType}' on ${dep.predecessorId} -> ${dep.successorId}: only FS links are implemented so far`,
      );
    }
    if (dep.lagMinutes < 0) {
      throw new Error(
        `Negative lag on ${dep.predecessorId} -> ${dep.successorId} is not yet supported`,
      );
    }
  }

  const predecessorsOf = new Map<TaskId, { predecessorId: TaskId; lagMinutes: number }[]>();
  const successorsOf = new Map<TaskId, TaskId[]>();
  const inDegree = new Map<TaskId, number>();
  for (const id of schedulableIds) {
    inDegree.set(id, 0);
  }

  for (const dep of relevantDeps) {
    const preds = predecessorsOf.get(dep.successorId) ?? [];
    preds.push({ predecessorId: dep.predecessorId, lagMinutes: dep.lagMinutes });
    predecessorsOf.set(dep.successorId, preds);

    const succs = successorsOf.get(dep.predecessorId) ?? [];
    succs.push(dep.successorId);
    successorsOf.set(dep.predecessorId, succs);

    inDegree.set(dep.successorId, (inDegree.get(dep.successorId) ?? 0) + 1);
  }

  // Kahn's algorithm — validateGraph already ran (§4.3), so this graph is
  // known acyclic; a leftover node after the queue drains would mean this
  // function was called without validating first.
  const queue: TaskId[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  const topoOrder: TaskId[] = [];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    if (current === undefined) {
      continue;
    }
    topoOrder.push(current);
    for (const successor of successorsOf.get(current) ?? []) {
      const remaining = (inDegree.get(successor) ?? 0) - 1;
      inDegree.set(successor, remaining);
      if (remaining === 0) {
        queue.push(successor);
      }
    }
  }

  if (topoOrder.length !== schedulableIds.size) {
    throw new Error('Forward pass encountered a cycle — call validateGraph() first');
  }

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
      for (const { predecessorId, lagMinutes } of preds) {
        const predSchedule = results.get(predecessorId);
        if (!predSchedule) {
          throw new Error(`Predecessor ${predecessorId} was not scheduled before its successor ${id}`);
        }
        // The successor's own calendar governs the lag — the lag is part of
        // establishing *this* task's schedule, same as its own duration is.
        const candidateStart =
          lagMinutes === 0 ? predSchedule.earlyFinish : addWorkingMinutes(predSchedule.earlyFinish, lagMinutes, calendar);
        maxStart = Math.max(maxStart, candidateStart);
      }
      earlyStart = asEpochMinutes(maxStart);
    }

    const earlyFinish = addWorkingMinutes(earlyStart, t.durationMinutes, calendar);
    results.set(id, { earlyStart, earlyFinish });
  }

  return results;
}

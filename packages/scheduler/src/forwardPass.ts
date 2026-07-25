import { addWorkingMinutes, subtractWorkingMinutes, type CompiledCalendar } from './calendar.js';
import { computeTopologicalOrder } from './graphOrdering.js';
import { applyLag, resolveLagMinutes } from './lag.js';
import type { SchedulingWarning } from './schedule.js';
import type { ConstraintType, DependencyInput, LinkType, TaskInput } from './taskTypes.js';
import { asEpochMinutes, type CalendarId, type EpochMinutes, type TaskId } from './types.js';

export type { DependencyInput, LinkType, TaskInput } from './taskTypes.js';

export interface ComputedSchedule {
  readonly earlyStart: EpochMinutes;
  readonly earlyFinish: EpochMinutes;
}

export interface ForwardPassResult {
  readonly results: ReadonlyMap<TaskId, ComputedSchedule>;
  readonly warnings: readonly SchedulingWarning[];
}

interface PredecessorEdge {
  readonly predecessorId: TaskId;
  readonly linkType: LinkType;
  readonly lagMinutes: number;
  readonly lagPercent: number | null | undefined;
}

const DATE_REQUIRED: ReadonlySet<ConstraintType> = new Set(['snet', 'snlt', 'fnet', 'fnlt', 'mso', 'mfo']);

/**
 * §4.4 forward pass — all four link types (FS/SS/FF/SF), signed/percentage
 * lag (§13 items 27–28), and seven of the eight constraint types (§13 item
 * 29: asap/snet/snlt/fnet/fnlt/mso/mfo). ALAP is deliberately deferred —
 * see docs/adr/002-constraint-precedence.md.
 *
 * Summary tasks are excluded entirely; dependencies touching one are ignored
 * for this pass — their dates come from rollup (§4.7) after both passes.
 *
 * The successor's own calendar governs lag and the duration back-derivation
 * for FF/SF/MFO/FNET — the lag/constraint is part of establishing *this*
 * task's schedule, same as its own duration is.
 */
export function runForwardPass(
  projectStart: EpochMinutes,
  tasks: readonly TaskInput[],
  dependencies: readonly DependencyInput[],
  calendars: ReadonlyMap<CalendarId, CompiledCalendar>,
): ForwardPassResult {
  const schedulable = tasks.filter((t) => !t.isSummary);
  const schedulableIds = new Set(schedulable.map((t) => t.id));
  const taskById = new Map(schedulable.map((t) => [t.id, t] as const));

  const relevantDeps = dependencies.filter(
    (d) => schedulableIds.has(d.predecessorId) && schedulableIds.has(d.successorId),
  );

  const predecessorsOf = new Map<TaskId, PredecessorEdge[]>();
  const hasSuccessor = new Set<TaskId>();
  for (const dep of relevantDeps) {
    const preds = predecessorsOf.get(dep.successorId) ?? [];
    preds.push({
      predecessorId: dep.predecessorId,
      linkType: dep.linkType,
      lagMinutes: dep.lagMinutes,
      lagPercent: dep.lagPercent,
    });
    predecessorsOf.set(dep.successorId, preds);
    hasSuccessor.add(dep.predecessorId);
  }

  const topoOrder = computeTopologicalOrder(schedulableIds, relevantDeps);

  const results = new Map<TaskId, ComputedSchedule>();
  const warnings: SchedulingWarning[] = [];

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
    let depEarlyStart: EpochMinutes;

    if (preds.length === 0) {
      depEarlyStart = projectStart;
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
      depEarlyStart = asEpochMinutes(maxStart);
    }

    const constrained = applyConstraint({
      taskId: id,
      depEarlyStart,
      durationMinutes: t.durationMinutes,
      calendar,
      constraintType: t.constraintType ?? null,
      constraintDate: t.constraintDate ?? null,
      hasSuccessors: hasSuccessor.has(id),
    });
    warnings.push(...constrained.warnings);
    results.set(id, { earlyStart: constrained.earlyStart, earlyFinish: constrained.earlyFinish });
  }

  return { results, warnings };
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
      const candidateFinish = applyLag(pred.earlyFinish, lag, calendar);
      return subtractWorkingMinutes(candidateFinish, successorDurationMinutes, calendar);
    }
    case 'SF': {
      const candidateFinish = applyLag(pred.earlyStart, lag, calendar);
      return subtractWorkingMinutes(candidateFinish, successorDurationMinutes, calendar);
    }
  }
}

function applyConstraint(args: {
  taskId: TaskId;
  depEarlyStart: EpochMinutes;
  durationMinutes: number;
  calendar: CompiledCalendar;
  constraintType: ConstraintType | null;
  constraintDate: EpochMinutes | null;
  hasSuccessors: boolean;
}): { earlyStart: EpochMinutes; earlyFinish: EpochMinutes; warnings: SchedulingWarning[] } {
  const { taskId, depEarlyStart, durationMinutes, calendar, constraintType, constraintDate, hasSuccessors } = args;
  const warnings: SchedulingWarning[] = [];

  if (constraintType === 'alap') {
    // Both branches throw today — see ADR 002. Differentiated only so a
    // future no-successor implementation can change exactly one arm.
    if (hasSuccessors) {
      throw new Error(
        `ALAP constraint on task ${taskId} is not yet supported for tasks with successors (see docs/adr/002-constraint-precedence.md)`,
      );
    }
    throw new Error(
      `ALAP constraint on task ${taskId} is not yet implemented (see docs/adr/002-constraint-precedence.md)`,
    );
  }

  if (constraintType !== null && DATE_REQUIRED.has(constraintType) && constraintDate === null) {
    throw new Error(`Constraint type '${constraintType}' on task ${taskId} requires a constraintDate`);
  }

  switch (constraintType) {
    case null:
    case 'asap': {
      const earlyStart = depEarlyStart;
      return { earlyStart, earlyFinish: addWorkingMinutes(earlyStart, durationMinutes, calendar), warnings };
    }
    case 'snet': {
      const earlyStart = asEpochMinutes(Math.max(depEarlyStart, constraintDate as number));
      return { earlyStart, earlyFinish: addWorkingMinutes(earlyStart, durationMinutes, calendar), warnings };
    }
    case 'fnet': {
      const candidateFinish = addWorkingMinutes(depEarlyStart, durationMinutes, calendar);
      if (candidateFinish < (constraintDate as EpochMinutes)) {
        const earlyFinish = constraintDate as EpochMinutes;
        return {
          earlyStart: subtractWorkingMinutes(earlyFinish, durationMinutes, calendar),
          earlyFinish,
          warnings,
        };
      }
      return { earlyStart: depEarlyStart, earlyFinish: candidateFinish, warnings };
    }
    case 'mso': {
      const earlyStart = constraintDate as EpochMinutes;
      if (earlyStart !== depEarlyStart) {
        warnings.push({
          code: 'CONSTRAINT_OVERRIDES_DEPENDENCY',
          taskIds: [taskId],
          message: `MSO on task ${taskId} overrides dependency-derived early start ${depEarlyStart} with ${earlyStart}`,
        });
      }
      return { earlyStart, earlyFinish: addWorkingMinutes(earlyStart, durationMinutes, calendar), warnings };
    }
    case 'mfo': {
      const earlyFinish = constraintDate as EpochMinutes;
      const earlyStart = subtractWorkingMinutes(earlyFinish, durationMinutes, calendar);
      if (earlyStart !== depEarlyStart) {
        warnings.push({
          code: 'CONSTRAINT_OVERRIDES_DEPENDENCY',
          taskIds: [taskId],
          message: `MFO on task ${taskId} overrides dependency-derived early start ${depEarlyStart} with ${earlyStart}`,
        });
      }
      return { earlyStart, earlyFinish, warnings };
    }
    case 'snlt': {
      const earlyStart = depEarlyStart;
      const earlyFinish = addWorkingMinutes(earlyStart, durationMinutes, calendar);
      if (depEarlyStart > (constraintDate as EpochMinutes)) {
        warnings.push({
          code: 'SOFT_CONSTRAINT_VIOLATED',
          taskIds: [taskId],
          message: `SNLT on task ${taskId}: early start ${depEarlyStart} is later than constraint date ${constraintDate}`,
        });
      }
      return { earlyStart, earlyFinish, warnings };
    }
    case 'fnlt': {
      const earlyStart = depEarlyStart;
      const earlyFinish = addWorkingMinutes(earlyStart, durationMinutes, calendar);
      if (earlyFinish > (constraintDate as EpochMinutes)) {
        warnings.push({
          code: 'SOFT_CONSTRAINT_VIOLATED',
          taskIds: [taskId],
          message: `FNLT on task ${taskId}: early finish ${earlyFinish} is later than constraint date ${constraintDate}`,
        });
      }
      return { earlyStart, earlyFinish, warnings };
    }
    // `alap` is handled (and thrown) above before this switch; TS narrows it out.
  }
}

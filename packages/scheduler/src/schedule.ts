import { runBackwardPass } from './backwardPass.js';
import type { CompiledCalendar } from './calendar.js';
import { computeFloat, extractCriticalPath } from './float.js';
import { runForwardPass } from './forwardPass.js';
import { validateGraph } from './graphValidation.js';
import { rollupSummaries } from './summaryRollup.js';
import type { DependencyInput, TaskInput } from './taskTypes.js';
import { asEpochMinutes, type CalendarId, type EpochMinutes, type TaskId } from './types.js';

export type { DependencyInput, LinkType, TaskInput } from './taskTypes.js';

export interface SchedulerInput {
  readonly projectStart: EpochMinutes;
  readonly tasks: readonly TaskInput[];
  readonly dependencies: readonly DependencyInput[];
  readonly calendars: ReadonlyMap<CalendarId, CompiledCalendar>;
  readonly defaultCalendarId: CalendarId;
}

/** Not yet populated by anything (constraint types are Phase 2) — shape settled now so Phase 2 is additive, not a breaking change. */
export interface SchedulingWarning {
  readonly code: string;
  readonly taskIds: readonly TaskId[];
  readonly message: string;
}

export interface ComputedTaskSchedule {
  readonly earlyStart: EpochMinutes;
  readonly earlyFinish: EpochMinutes;
  /** null for summary tasks (§4.7) — late dates and float aren't rolled up, only early dates and criticality are. */
  readonly lateStart: EpochMinutes | null;
  readonly lateFinish: EpochMinutes | null;
  readonly totalFloatMinutes: number | null;
  readonly freeFloatMinutes: number | null;
  readonly isCritical: boolean;
}

export interface SchedulerOutput {
  readonly tasks: ReadonlyMap<TaskId, ComputedTaskSchedule>;
  readonly projectFinish: EpochMinutes;
  readonly criticalPath: readonly TaskId[];
  readonly warnings: readonly SchedulingWarning[];
}

/**
 * §4.1's public entrypoint: validate → forward pass → backward pass → float
 * → summary rollup. `projectFinish` isn't a caller input — it's derived as
 * the latest early_finish across every schedulable task, exactly like a
 * plain CPM network with no explicit deadline (deadlines are a constraint,
 * Phase 2, not implemented yet).
 */
export function schedule(input: SchedulerInput): SchedulerOutput {
  const { projectStart, tasks, dependencies, calendars, defaultCalendarId } = input;

  if (!calendars.has(defaultCalendarId)) {
    throw new Error(`defaultCalendarId ${defaultCalendarId} is not present in the compiled calendars map`);
  }

  validateGraph(tasks, dependencies);

  const forward = runForwardPass(projectStart, tasks, dependencies, calendars);

  let projectFinishValue = projectStart as number;
  for (const { earlyFinish } of forward.values()) {
    if (earlyFinish > projectFinishValue) {
      projectFinishValue = earlyFinish;
    }
  }
  const projectFinish = asEpochMinutes(projectFinishValue);

  const backward = runBackwardPass(projectFinish, tasks, dependencies, calendars);
  const float = computeFloat(forward, backward, dependencies);
  const rollup = rollupSummaries(tasks, forward, float, calendars);
  const criticalPath = extractCriticalPath(float, forward);

  const resultTasks = new Map<TaskId, ComputedTaskSchedule>();
  for (const task of tasks) {
    if (task.isSummary) {
      const r = rollup.get(task.id);
      if (!r) {
        continue;
      }
      resultTasks.set(task.id, {
        earlyStart: r.earlyStart,
        earlyFinish: r.earlyFinish,
        lateStart: null,
        lateFinish: null,
        totalFloatMinutes: null,
        freeFloatMinutes: null,
        isCritical: r.isCritical,
      });
      continue;
    }

    const f = forward.get(task.id);
    const b = backward.get(task.id);
    const fl = float.get(task.id);
    if (!f || !b || !fl) {
      continue;
    }
    resultTasks.set(task.id, {
      earlyStart: f.earlyStart,
      earlyFinish: f.earlyFinish,
      lateStart: b.lateStart,
      lateFinish: b.lateFinish,
      totalFloatMinutes: fl.totalFloatMinutes,
      freeFloatMinutes: fl.freeFloatMinutes,
      isCritical: fl.isCritical,
    });
  }

  return { tasks: resultTasks, projectFinish, criticalPath, warnings: [] };
}

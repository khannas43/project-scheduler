import type { ComputedSchedule, DependencyInput } from './forwardPass.js';
import type { BackwardSchedule } from './backwardPass.js';
import type { TaskId } from './types.js';

export interface FloatResult {
  readonly totalFloatMinutes: number;
  readonly freeFloatMinutes: number;
  readonly isCritical: boolean;
}

/**
 * §4.6. Only considers FS edges between two tasks that both have a forward
 * result — same universe runForwardPass/runBackwardPass already settled on
 * (summary tasks and non-FS edges excluded), so no need to re-filter by
 * link type here.
 *
 * A task with no successors has no `min(successor.early_start)` to compute
 * free float from; by convention it equals total float there (nothing after
 * it to be more tightly constrained by than the project boundary itself).
 */
export function computeFloat(
  forwardResults: ReadonlyMap<TaskId, ComputedSchedule>,
  backwardResults: ReadonlyMap<TaskId, BackwardSchedule>,
  dependencies: readonly DependencyInput[],
  criticalThresholdMinutes = 0,
): ReadonlyMap<TaskId, FloatResult> {
  const successorsOf = new Map<TaskId, TaskId[]>();
  for (const { predecessorId, successorId } of dependencies) {
    if (!forwardResults.has(predecessorId) || !forwardResults.has(successorId)) {
      continue;
    }
    const successors = successorsOf.get(predecessorId) ?? [];
    successors.push(successorId);
    successorsOf.set(predecessorId, successors);
  }

  const results = new Map<TaskId, FloatResult>();

  for (const [id, forward] of forwardResults) {
    const backward = backwardResults.get(id);
    if (!backward) {
      throw new Error(`No backward-pass result for task ${id}`);
    }

    const totalFloatMinutes = backward.lateStart - forward.earlyStart;

    const successors = successorsOf.get(id) ?? [];
    let freeFloatMinutes: number;
    if (successors.length === 0) {
      freeFloatMinutes = totalFloatMinutes;
    } else {
      let minSuccessorStart = Infinity;
      for (const successorId of successors) {
        const successorForward = forwardResults.get(successorId);
        if (!successorForward) {
          throw new Error(`No forward-pass result for successor ${successorId}`);
        }
        minSuccessorStart = Math.min(minSuccessorStart, successorForward.earlyStart);
      }
      freeFloatMinutes = minSuccessorStart - forward.earlyFinish;
    }

    results.set(id, {
      totalFloatMinutes,
      freeFloatMinutes,
      isCritical: totalFloatMinutes <= criticalThresholdMinutes,
    });
  }

  return results;
}

/** §4.6: all tasks where is_critical, ordered by early_start. */
export function extractCriticalPath(
  floatResults: ReadonlyMap<TaskId, FloatResult>,
  forwardResults: ReadonlyMap<TaskId, ComputedSchedule>,
): TaskId[] {
  const critical: TaskId[] = [];
  for (const [id, float] of floatResults) {
    if (float.isCritical) {
      critical.push(id);
    }
  }

  return critical.sort((a, b) => {
    const aStart = forwardResults.get(a)?.earlyStart ?? 0;
    const bStart = forwardResults.get(b)?.earlyStart ?? 0;
    return aStart - bStart;
  });
}

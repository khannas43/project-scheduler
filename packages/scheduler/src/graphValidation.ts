import type { TaskId } from './types.js';

export interface TaskNode {
  readonly id: TaskId;
  readonly parentId: TaskId | null;
  readonly isSummary: boolean;
}

export interface DependencyEdge {
  readonly predecessorId: TaskId;
  readonly successorId: TaskId;
}

/** §12.3: carries the offending task IDs for UI highlighting. */
export class SchedulingError extends Error {
  readonly taskIds: readonly TaskId[];

  constructor(message: string, taskIds: readonly TaskId[]) {
    super(message);
    this.name = 'SchedulingError';
    this.taskIds = taskIds;
  }
}

type Color = 'grey' | 'black';

interface DfsFrame {
  readonly node: TaskId;
  edgeIndex: number;
}

/**
 * Iterative three-colour DFS (§4.3) — never recursive, so a long dependency
 * chain can't blow the call stack. Returns the full cycle path (closed —
 * first and last entries are the same node) the first time a back edge
 * (an edge into a grey node) is found, or null if the graph is acyclic.
 */
function findCycle(taskIds: readonly TaskId[], adjacency: ReadonlyMap<TaskId, readonly TaskId[]>): TaskId[] | null {
  const color = new Map<TaskId, Color>();

  for (const start of taskIds) {
    if (color.has(start)) {
      continue;
    }

    const stack: DfsFrame[] = [{ node: start, edgeIndex: 0 }];
    color.set(start, 'grey');

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      if (!frame) {
        break;
      }

      const neighbors = adjacency.get(frame.node) ?? [];
      if (frame.edgeIndex >= neighbors.length) {
        color.set(frame.node, 'black');
        stack.pop();
        continue;
      }

      const next = neighbors[frame.edgeIndex];
      frame.edgeIndex += 1;
      if (next === undefined) {
        continue;
      }

      const nextColor = color.get(next);
      if (nextColor === 'grey') {
        const cycleStart = stack.findIndex((f) => f.node === next);
        const path = stack.slice(cycleStart === -1 ? 0 : cycleStart).map((f) => f.node);
        path.push(next);
        return path;
      }
      if (nextColor === undefined) {
        color.set(next, 'grey');
        stack.push({ node: next, edgeIndex: 0 });
      }
      // 'black' neighbors are already fully explored — nothing to do.
    }
  }

  return null;
}

function buildAdjacency(dependencies: readonly DependencyEdge[]): Map<TaskId, TaskId[]> {
  const adjacency = new Map<TaskId, TaskId[]>();
  for (const { predecessorId, successorId } of dependencies) {
    const successors = adjacency.get(predecessorId);
    if (successors) {
      successors.push(successorId);
    } else {
      adjacency.set(predecessorId, [successorId]);
    }
  }
  return adjacency;
}

function isAncestorOf(
  taskById: ReadonlyMap<TaskId, TaskNode>,
  ancestorId: TaskId,
  descendantId: TaskId,
): boolean {
  let current = taskById.get(descendantId)?.parentId ?? null;
  while (current !== null) {
    if (current === ancestorId) {
      return true;
    }
    current = taskById.get(current)?.parentId ?? null;
  }
  return false;
}

function findSummaryLinkViolations(
  tasks: readonly TaskNode[],
  dependencies: readonly DependencyEdge[],
): DependencyEdge[] {
  const taskById = new Map(tasks.map((t) => [t.id, t] as const));
  const violations: DependencyEdge[] = [];

  for (const dep of dependencies) {
    const predecessor = taskById.get(dep.predecessorId);
    const successor = taskById.get(dep.successorId);
    if (!predecessor || !successor) {
      continue; // the orphan check reports this; don't double-report here.
    }

    const predecessorLinksToOwnDescendant = predecessor.isSummary && isAncestorOf(taskById, dep.predecessorId, dep.successorId);
    const successorLinksToOwnDescendant = successor.isSummary && isAncestorOf(taskById, dep.successorId, dep.predecessorId);

    if (predecessorLinksToOwnDescendant || successorLinksToOwnDescendant) {
      violations.push(dep);
    }
  }

  return violations;
}

/**
 * §4.3: validate before any scheduling pass runs. Throws SchedulingError on
 * the first class of problem found (cycle, then orphan, then summary-link) —
 * reject the mutation entirely rather than attempt partial scheduling.
 */
export function validateGraph(tasks: readonly TaskNode[], dependencies: readonly DependencyEdge[]): void {
  const taskIds = tasks.map((t) => t.id);
  const taskIdSet = new Set(taskIds);

  const adjacency = buildAdjacency(dependencies);
  const cycle = findCycle(taskIds, adjacency);
  if (cycle) {
    throw new SchedulingError(`Dependency cycle detected: ${cycle.join(' -> ')}`, cycle);
  }

  const orphanIds = new Set<TaskId>();
  for (const { predecessorId, successorId } of dependencies) {
    if (!taskIdSet.has(predecessorId)) {
      orphanIds.add(predecessorId);
    }
    if (!taskIdSet.has(successorId)) {
      orphanIds.add(successorId);
    }
  }
  if (orphanIds.size > 0) {
    const ids = [...orphanIds];
    throw new SchedulingError(`Dependencies reference tasks that do not exist: ${ids.join(', ')}`, ids);
  }

  const violations = findSummaryLinkViolations(tasks, dependencies);
  if (violations.length > 0) {
    const involved = new Set<TaskId>();
    for (const v of violations) {
      involved.add(v.predecessorId);
      involved.add(v.successorId);
    }
    const ids = [...involved];
    throw new SchedulingError('Dependencies link a summary task to its own descendant', ids);
  }
}

import type { TaskId } from './types.js';

export interface GraphEdge {
  readonly predecessorId: TaskId;
  readonly successorId: TaskId;
}

/**
 * Kahn's algorithm topological order (§4.4), shared by the forward pass
 * (processes in this order) and the backward pass (processes in the reverse
 * of it — reversing a valid topological order always yields a valid reverse
 * one, so there's no need for a second, out-degree-based algorithm).
 *
 * Assumes the graph is acyclic — call validateGraph() first. Throws if it
 * isn't; this is a defensive check, not this function's job to report well.
 */
export function computeTopologicalOrder(ids: ReadonlySet<TaskId>, edges: readonly GraphEdge[]): TaskId[] {
  const successorsOf = new Map<TaskId, TaskId[]>();
  const inDegree = new Map<TaskId, number>();
  for (const id of ids) {
    inDegree.set(id, 0);
  }

  for (const { predecessorId, successorId } of edges) {
    const successors = successorsOf.get(predecessorId) ?? [];
    successors.push(successorId);
    successorsOf.set(predecessorId, successors);
    inDegree.set(successorId, (inDegree.get(successorId) ?? 0) + 1);
  }

  const queue: TaskId[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  const order: TaskId[] = [];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    if (current === undefined) {
      continue;
    }
    order.push(current);
    for (const successor of successorsOf.get(current) ?? []) {
      const remaining = (inDegree.get(successor) ?? 0) - 1;
      inDegree.set(successor, remaining);
      if (remaining === 0) {
        queue.push(successor);
      }
    }
  }

  if (order.length !== ids.size) {
    throw new Error('computeTopologicalOrder encountered a cycle — call validateGraph() first');
  }

  return order;
}

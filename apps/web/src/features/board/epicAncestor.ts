import type { TaskRow } from '../tasks/types.js';

/**
 * Walk parentId to the nearest agile summary (epic). Epics are containers and
 * never appear as board/backlog cards themselves.
 */
export function findEpicAncestor(
  task: TaskRow,
  tasksById: ReadonlyMap<string, TaskRow>,
): TaskRow | null {
  let parentId = task.parentId;
  const seen = new Set<string>();

  while (parentId) {
    if (seen.has(parentId)) break;
    seen.add(parentId);

    const parent = tasksById.get(parentId);
    if (!parent) break;

    if (parent.isSummary && parent.schedulingMode === 'agile') {
      return parent;
    }
    parentId = parent.parentId;
  }

  return null;
}

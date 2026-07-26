import { sortTasksForGrid } from './optimisticEdit.js';
import type { TaskRow } from './types.js';

/** Parent id → direct child ids (WBS sibling order). */
export function buildChildrenIndex(tasks: readonly TaskRow[]): Map<string, readonly string[]> {
  const map = new Map<string, string[]>();
  for (const task of sortTasksForGrid(tasks)) {
    if (!task.parentId) continue;
    const list = map.get(task.parentId);
    if (list) list.push(task.id);
    else map.set(task.parentId, [task.id]);
  }
  return map;
}

export function taskHasChildren(
  taskId: string,
  childrenIndex: ReadonlyMap<string, readonly string[]>,
): boolean {
  return (childrenIndex.get(taskId)?.length ?? 0) > 0;
}

/**
 * Pre-order WBS list with descendants of collapsed parents removed.
 * The collapsed parent row itself stays visible.
 */
export function filterTasksByCollapsed(
  tasks: readonly TaskRow[],
  collapsedIds: ReadonlySet<string>,
): TaskRow[] {
  const ordered = sortTasksForGrid(tasks);
  if (collapsedIds.size === 0) return ordered;

  const byId = new Map(ordered.map((t) => [t.id, t]));
  const isHiddenUnderCollapse = (task: TaskRow): boolean => {
    let parentId = task.parentId;
    while (parentId) {
      if (collapsedIds.has(parentId)) return true;
      parentId = byId.get(parentId)?.parentId ?? null;
    }
    return false;
  };

  return ordered.filter((t) => !isHiddenUnderCollapse(t));
}

/** Ids of every task that currently has at least one child. */
export function collapsibleTaskIds(
  childrenIndex: ReadonlyMap<string, readonly string[]>,
): string[] {
  return [...childrenIndex.keys()];
}

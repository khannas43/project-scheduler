import type { GanttTask } from './types.js';

/** Build an id → task map. Task `id` is never assumed equal to array index. */
export function buildTaskById(tasks: readonly GanttTask[]): ReadonlyMap<number, GanttTask> {
  const map = new Map<number, GanttTask>();
  for (const task of tasks) {
    map.set(task.id, task);
  }
  return map;
}

/** Resolve a task by id from the map — never via `tasks[id]`. */
export function lookupTask(
  tasksById: ReadonlyMap<number, GanttTask>,
  taskId: number | null,
): GanttTask | undefined {
  if (taskId === null) return undefined;
  return tasksById.get(taskId);
}

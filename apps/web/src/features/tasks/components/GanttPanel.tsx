import { GanttView, type GanttDependency, type GanttTask } from '@pkg/gantt';
import { useEffect, useMemo, useRef } from 'react';

import type { Project } from '../../projects/index.js';
import { TaskIdAdapter } from '../idAdapter.js';
import { isoToEpochMinutes, projectStartEpochMinutes, sortTasksForGrid } from '../optimisticEdit.js';
import type { DependencyRow, TaskRow } from '../types.js';

export interface GanttPanelProps {
  readonly project: Project;
  readonly tasks: readonly TaskRow[];
  readonly dependencies: readonly DependencyRow[];
  readonly onHoverTask: (taskId: string | null) => void;
}

function buildGanttData(
  project: Project,
  tasks: readonly TaskRow[],
  dependencies: readonly DependencyRow[],
  adapter: TaskIdAdapter,
): { ganttTasks: GanttTask[]; ganttDeps: GanttDependency[] } {
  const ordered = sortTasksForGrid(tasks);
  const projectStart = projectStartEpochMinutes(project);

  const ganttTasks: GanttTask[] = [];
  for (let row = 0; row < ordered.length; row += 1) {
    const task = ordered[row];
    if (!task) continue;
    const numericId = adapter.toNumeric(task.id);
    if (numericId === undefined) continue;

    const earlyStartMin = task.earlyStart ? isoToEpochMinutes(task.earlyStart) : projectStart;
    ganttTasks.push({
      id: numericId,
      name: task.name,
      row,
      startMinutes: earlyStartMin - projectStart,
      durationMinutes: task.durationMinutes ?? 0,
      progress: 0,
      isCritical: task.isCritical,
    });
  }

  const ganttDeps: GanttDependency[] = [];
  for (const dep of dependencies) {
    const predecessorId = adapter.toNumeric(dep.predecessorId);
    const successorId = adapter.toNumeric(dep.successorId);
    if (predecessorId === undefined || successorId === undefined) continue;
    ganttDeps.push({ predecessorId, successorId });
  }

  return { ganttTasks, ganttDeps };
}

/**
 * Thin imperative wrapper around @pkg/gantt GanttView — read-only (hover only).
 */
export function GanttPanel({ project, tasks, dependencies, onHoverTask }: GanttPanelProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<GanttView | null>(null);
  const adapterRef = useRef<TaskIdAdapter>(new TaskIdAdapter([]));
  const onHoverRef = useRef(onHoverTask);
  onHoverRef.current = onHoverTask;

  // Rebuild the adapter when the UUID set / order changes (tree load or structural edit).
  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks]);
  const adapter = useMemo(() => new TaskIdAdapter(taskIds), [taskIds]);
  adapterRef.current = adapter;

  const { ganttTasks, ganttDeps } = useMemo(
    () => buildGanttData(project, tasks, dependencies, adapter),
    [project, tasks, dependencies, adapter],
  );

  // Mount once; hover resolves through refs so adapter/callback updates don't remount.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const view = new GanttView({
      container: host,
      tasks: [],
      dependencies: [],
      onHover: (numericId) => {
        if (numericId === null) {
          onHoverRef.current(null);
          return;
        }
        onHoverRef.current(adapterRef.current.toUuid(numericId) ?? null);
      },
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    viewRef.current?.setData(ganttTasks, ganttDeps);
  }, [ganttTasks, ganttDeps]);

  return (
    <div className="gantt-panel">
      <div className="gantt-panel-label">Gantt</div>
      <div ref={hostRef} className="gantt-host" data-testid="gantt-host" />
    </div>
  );
}

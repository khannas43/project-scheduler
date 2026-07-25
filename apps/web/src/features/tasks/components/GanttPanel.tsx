import { GanttView, type GanttDependency, type GanttTask } from '@pkg/gantt';
import { useEffect, useMemo, useRef } from 'react';

import type { Project } from '../../projects/index.js';
import { TaskIdAdapter } from '../idAdapter.js';
import {
  epochMinutesToIso,
  isoToEpochMinutes,
  projectStartEpochMinutes,
  sortTasksForGrid,
} from '../optimisticEdit.js';
import type { DependencyRow, TaskEditPatch, TaskRow } from '../types.js';

export interface GanttPanelProps {
  readonly project: Project;
  readonly tasks: readonly TaskRow[];
  readonly dependencies: readonly DependencyRow[];
  readonly onHoverTask: (taskId: string | null) => void;
  readonly onCommitMove?: (patch: TaskEditPatch) => void;
  readonly onCommitResize?: (patch: TaskEditPatch) => void;
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
      isSummary: task.isSummary,
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
 * Imperative wrapper around @pkg/gantt GanttView — hover, drag-to-move (MSO), resize duration.
 */
export function GanttPanel({
  project,
  tasks,
  dependencies,
  onHoverTask,
  onCommitMove,
  onCommitResize,
}: GanttPanelProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<GanttView | null>(null);
  const adapterRef = useRef<TaskIdAdapter>(new TaskIdAdapter([]));
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const projectRef = useRef(project);
  projectRef.current = project;
  const onHoverRef = useRef(onHoverTask);
  onHoverRef.current = onHoverTask;
  const onCommitMoveRef = useRef(onCommitMove);
  onCommitMoveRef.current = onCommitMove;
  const onCommitResizeRef = useRef(onCommitResize);
  onCommitResizeRef.current = onCommitResize;

  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks]);
  const adapter = useMemo(() => new TaskIdAdapter(taskIds), [taskIds]);
  adapterRef.current = adapter;

  const { ganttTasks, ganttDeps } = useMemo(
    () => buildGanttData(project, tasks, dependencies, adapter),
    [project, tasks, dependencies, adapter],
  );

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
      onCommitMove: (numericId, newStartMinutes) => {
        const uuid = adapterRef.current.toUuid(numericId);
        if (!uuid) return;
        const task = tasksRef.current.find((t) => t.id === uuid);
        if (!task) return;
        const projectStart = projectStartEpochMinutes(projectRef.current);
        const constraintDate = epochMinutesToIso(projectStart + newStartMinutes);
        onCommitMoveRef.current?.({
          taskId: uuid,
          version: task.version,
          constraintType: 'mso',
          constraintDate,
        });
      },
      onCommitResize: (numericId, newDurationMinutes) => {
        const uuid = adapterRef.current.toUuid(numericId);
        if (!uuid) return;
        const task = tasksRef.current.find((t) => t.id === uuid);
        if (!task) return;
        onCommitResizeRef.current?.({
          taskId: uuid,
          version: task.version,
          durationMinutes: newDurationMinutes,
        });
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

import {
  GanttView,
  MINUTES_PER_DAY,
  pixelsPerMinuteForScale,
  type GanttDependency,
  type GanttTask,
  type GanttTimeScale,
} from '@pkg/gantt';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { Project } from '../../projects/index.js';
import { useSprints } from '../../sprints/hooks/useSprints.js';
import type { SprintRow } from '../../sprints/types.js';
import { useCreateDependency } from '../hooks/useDependencies.js';
import { TaskIdAdapter } from '../idAdapter.js';
import {
  epochMinutesToIso,
  isoToEpochMinutes,
  projectStartEpochMinutes,
} from '../optimisticEdit.js';
import { filterTasksByCollapsed } from '../taskVisibility.js';
import type { DependencyRow, TaskEditPatch, TaskRow } from '../types.js';

const EMPTY_COLLAPSED = new Set<string>();
const TIME_SCALE_STORAGE_KEY = 'project-scheduler.gantt.timeScale';
const TIME_SCALES: readonly GanttTimeScale[] = ['day', 'week', 'month'];
const WORKING_MINUTES_PER_DAY = 480;

/** Trigger a browser download from a data URL (no server round-trip). */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function slugPngFilename(projectName: string): string {
  const slug = projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'gantt'}.png`;
}

function isTimeScale(value: string): value is GanttTimeScale {
  return value === 'day' || value === 'week' || value === 'month';
}

export function readStoredTimeScale(): GanttTimeScale {
  try {
    const raw = localStorage.getItem(TIME_SCALE_STORAGE_KEY);
    if (raw && isTimeScale(raw)) return raw;
  } catch {
    // ignore quota / private mode
  }
  return 'week';
}

/** Map Gantt calendar-day duration (1440 min/day) → task working minutes (480/day). */
export function calendarMinutesToWorking(calendarMinutes: number): number {
  const days = Math.max(1, Math.round(calendarMinutes / MINUTES_PER_DAY));
  return days * WORKING_MINUTES_PER_DAY;
}

/**
 * Bar length on the Gantt axis is calendar span (earlyFinish − earlyStart).
 * Falls back to working duration mapped onto whole calendar days when dates are missing.
 */
export function ganttDurationMinutes(task: TaskRow): number {
  if (task.earlyStart && task.earlyFinish) {
    const start = isoToEpochMinutes(task.earlyStart);
    const finish = isoToEpochMinutes(task.earlyFinish);
    const span = finish - start;
    if (span > 0) return span;
  }
  const working = task.durationMinutes ?? 0;
  if (working <= 0) return 0;
  const workingDays = Math.max(1, Math.round(working / WORKING_MINUTES_PER_DAY));
  return workingDays * MINUTES_PER_DAY;
}

export interface GanttPanelProps {
  readonly project: Project;
  readonly tasks: readonly TaskRow[];
  readonly dependencies: readonly DependencyRow[];
  /** When set, Gantt rows follow the same collapsed WBS visibility as the grid. */
  readonly collapsedIds?: ReadonlySet<string>;
  readonly onHoverTask: (taskId: string | null) => void;
  readonly onCommitMove?: (patch: TaskEditPatch) => void;
  readonly onCommitResize?: (patch: TaskEditPatch) => void;
}

/**
 * Map project tasks → Gantt bars. Agile tasks without a sprint are omitted
 * (same rule as the Board). Agile tasks with a sprint span that sprint's
 * date range; CPM tasks use earlyStart / duration as before.
 */
export function buildGanttData(
  project: Project,
  tasks: readonly TaskRow[],
  dependencies: readonly DependencyRow[],
  adapter: TaskIdAdapter,
  collapsedIds: ReadonlySet<string>,
  sprints: readonly SprintRow[] = [],
): { ganttTasks: GanttTask[]; ganttDeps: GanttDependency[] } {
  const ordered = filterTasksByCollapsed(tasks, collapsedIds);
  const projectStart = projectStartEpochMinutes(project);
  const sprintsById = new Map(sprints.map((s) => [s.id, s]));

  const ganttTasks: GanttTask[] = [];
  const visibleIds = new Set<string>();
  let row = 0;

  for (const task of ordered) {
    const numericId = adapter.toNumeric(task.id);
    if (numericId === undefined) continue;

    if (task.schedulingMode === 'agile') {
      if (!task.sprintId) continue;
      const sprint = sprintsById.get(task.sprintId);
      if (!sprint) continue;

      const sprintStart = isoToEpochMinutes(sprint.startDate);
      const sprintEnd = isoToEpochMinutes(sprint.endDate);
      ganttTasks.push({
        id: numericId,
        name: task.name,
        row,
        startMinutes: sprintStart - projectStart,
        durationMinutes: Math.max(0, sprintEnd - sprintStart),
        progress: 0,
        isCritical: false,
        isSummary: task.isSummary,
        isAgile: true,
      });
      visibleIds.add(task.id);
      row += 1;
      continue;
    }

    const earlyStartMin = task.earlyStart ? isoToEpochMinutes(task.earlyStart) : projectStart;
    ganttTasks.push({
      id: numericId,
      name: task.name,
      row,
      startMinutes: earlyStartMin - projectStart,
      durationMinutes: ganttDurationMinutes(task),
      progress: 0,
      isCritical: task.isCritical,
      isSummary: task.isSummary,
    });
    visibleIds.add(task.id);
    row += 1;
  }

  const ganttDeps: GanttDependency[] = [];
  for (const dep of dependencies) {
    if (!visibleIds.has(dep.predecessorId) || !visibleIds.has(dep.successorId)) continue;
    const predecessorId = adapter.toNumeric(dep.predecessorId);
    const successorId = adapter.toNumeric(dep.successorId);
    if (predecessorId === undefined || successorId === undefined) continue;
    ganttDeps.push({ predecessorId, successorId });
  }

  return { ganttTasks, ganttDeps };
}

/**
 * Imperative wrapper around @pkg/gantt GanttView — hover, move, resize, Shift+edge link.
 */
export function GanttPanel({
  project,
  tasks,
  dependencies,
  collapsedIds = EMPTY_COLLAPSED,
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

  const [timeScale, setTimeScale] = useState<GanttTimeScale>(() => readStoredTimeScale());

  const sprintsQuery = useSprints(project.id);
  const sprints = sprintsQuery.data ?? [];

  const createDep = useCreateDependency(project.id);
  const createDepRef = useRef(createDep);
  createDepRef.current = createDep;

  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks]);
  const adapter = useMemo(() => new TaskIdAdapter(taskIds), [taskIds]);
  adapterRef.current = adapter;

  const { ganttTasks, ganttDeps } = useMemo(
    () => buildGanttData(project, tasks, dependencies, adapter, collapsedIds, sprints),
    [project, tasks, dependencies, adapter, collapsedIds, sprints],
  );
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const view = new GanttView({
      container: host,
      tasks: [],
      dependencies: [],
      pixelsPerMinute: pixelsPerMinuteForScale(readStoredTimeScale()),
      originDateIso: projectRef.current.startDate,
      statusDateIso: projectRef.current.statusDate,
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
        if (!task || task.schedulingMode === 'agile') return;
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
        if (!task || task.schedulingMode === 'agile') return;
        onCommitResizeRef.current?.({
          taskId: uuid,
          version: task.version,
          durationMinutes: calendarMinutesToWorking(newDurationMinutes),
        });
      },
      onCommitLink: (fromNumericId, toNumericId) => {
        const predecessorId = adapterRef.current.toUuid(fromNumericId);
        const successorId = adapterRef.current.toUuid(toNumericId);
        if (!predecessorId || !successorId) return;
        createDepRef.current.mutate({ predecessorId, successorId });
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

  useEffect(() => {
    viewRef.current?.setOriginDateIso(project.startDate);
  }, [project.startDate]);

  useEffect(() => {
    viewRef.current?.setStatusDateIso(project.statusDate);
  }, [project.statusDate]);

  useEffect(() => {
    viewRef.current?.setPixelsPerMinute(pixelsPerMinuteForScale(timeScale));
    try {
      localStorage.setItem(TIME_SCALE_STORAGE_KEY, timeScale);
    } catch {
      // ignore
    }
  }, [timeScale]);

  // GanttView only listens to window resize — nudge it when the panel is
  // shown/resized by the project-detail splitter or view-mode toggle.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      window.dispatchEvent(new Event('resize'));
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="gantt-panel">
      <div className="gantt-panel-toolbar">
        <div className="gantt-panel-toolbar-left">
          <div className="gantt-panel-label">Gantt</div>
          <div className="gantt-scale-toggle" role="group" aria-label="Time scale">
            {TIME_SCALES.map((scale) => (
              <button
                key={scale}
                type="button"
                className={
                  scale === timeScale ? 'gantt-scale-btn gantt-scale-btn-active' : 'gantt-scale-btn'
                }
                data-testid={`gantt-scale-${scale}`}
                aria-pressed={scale === timeScale}
                onClick={() => setTimeScale(scale)}
              >
                {scale === 'day' ? 'Day' : scale === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="btn-secondary gantt-save-png"
          data-testid="gantt-save-png"
          onClick={() => {
            const view = viewRef.current;
            if (!view) return;
            downloadDataUrl(view.exportToPngDataUrl(), slugPngFilename(projectRef.current.name));
          }}
        >
          Save as PNG
        </button>
      </div>
      <div ref={hostRef} className="gantt-host" data-testid="gantt-host" />
    </div>
  );
}

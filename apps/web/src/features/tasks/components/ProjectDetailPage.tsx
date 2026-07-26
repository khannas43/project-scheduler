import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { projectsApi } from '../../projects/index.js';
import { useCreateTask } from '../hooks/useCreateTask.js';
import { useDeleteTask } from '../hooks/useDeleteTask.js';
import { useSetTaskPredecessors } from '../hooks/useDependencies.js';
import { projectQueryKey, useTaskEdit } from '../hooks/useTaskEdit.js';
import { useTaskTree } from '../hooks/useTaskTree.js';
import { useUndoRedo } from '../hooks/useUndoRedo.js';
import {
  buildChildrenIndex,
  collapsibleTaskIds,
  taskHasChildren,
} from '../taskVisibility.js';
import type { TaskEditPatch, TaskRow } from '../types.js';
import { AssignmentPanel } from './AssignmentPanel.js';
import { CreateTaskModal, suggestWbsCode, type CreateTaskDraft } from './CreateTaskModal.js';
import { GanttPanel } from './GanttPanel.js';
import { TaskGrid } from './TaskGrid.js';

type DetailViewMode = 'split' | 'grid' | 'gantt';

const LAYOUT_STORAGE_KEY = 'project-scheduler.detail-layout';
const DEFAULT_GRID_PCT = 46;
const MIN_PANEL_PCT = 22;
const MAX_PANEL_PCT = 78;

function loadLayoutPrefs(): { mode: DetailViewMode; gridPct: number } {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return { mode: 'split', gridPct: DEFAULT_GRID_PCT };
    const parsed = JSON.parse(raw) as { mode?: string; gridPct?: number };
    const mode: DetailViewMode =
      parsed.mode === 'grid' || parsed.mode === 'gantt' || parsed.mode === 'split'
        ? parsed.mode
        : 'split';
    const gridPct =
      typeof parsed.gridPct === 'number' && Number.isFinite(parsed.gridPct)
        ? Math.min(MAX_PANEL_PCT, Math.max(MIN_PANEL_PCT, parsed.gridPct))
        : DEFAULT_GRID_PCT;
    return { mode, gridPct };
  } catch {
    return { mode: 'split', gridPct: DEFAULT_GRID_PCT };
  }
}

export function ProjectDetailPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [assignTask, setAssignTask] = useState<TaskRow | null>(null);
  const [createParent, setCreateParent] = useState<TaskRow | null | undefined>(undefined);
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [layoutPrefs] = useState(loadLayoutPrefs);
  const [viewMode, setViewMode] = useState<DetailViewMode>(layoutPrefs.mode);
  const [gridPct, setGridPct] = useState(layoutPrefs.gridPct);
  const layoutRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startPct: number } | null>(null);

  const projectQuery = useQuery({
    queryKey: projectQueryKey(projectId),
    queryFn: () => projectsApi.getProject(projectId),
  });

  const taskTree = useTaskTree(projectId);
  const edit = useTaskEdit(projectId);
  const createTask = useCreateTask(projectId);
  const deleteTask = useDeleteTask(projectId);
  const setPredecessors = useSetTaskPredecessors(projectId);

  const onEdit = useCallback(
    (patch: TaskEditPatch) => {
      edit.mutate(patch);
    },
    [edit.mutate],
  );

  const onToggleCollapse = useCallback((taskId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  const onExpandAll = useCallback(() => {
    setCollapsedIds(new Set());
  }, []);

  const onCollapseAll = useCallback(() => {
    const tree = taskTree.data?.tasks;
    if (!tree) return;
    setCollapsedIds(new Set(collapsibleTaskIds(buildChildrenIndex(tree))));
  }, [taskTree.data?.tasks]);

  const onCreateTask = useCallback(
    async (draft: CreateTaskDraft) => {
      await createTask.mutateAsync({
        name: draft.name,
        parentId: draft.parentId,
        placeAtWbs: draft.placeAtWbs,
        isSummary: draft.isSummary,
        isMilestone: draft.isMilestone,
        durationMinutes: draft.durationMinutes,
      });
      if (draft.parentId) {
        // Keep the new subtask visible under its parent.
        setCollapsedIds((prev) => {
          if (!prev.has(draft.parentId!)) return prev;
          const next = new Set(prev);
          next.delete(draft.parentId!);
          return next;
        });
      }
      setCreateParent(undefined);
    },
    [createTask],
  );

  const onDeleteTask = useCallback(
    (task: TaskRow) => {
      const tree = taskTree.data?.tasks ?? [];
      const hasKids = taskHasChildren(task.id, buildChildrenIndex(tree));
      const label = task.wbsCode ? `${task.wbsCode} ${task.name}` : task.name;
      const message = hasKids
        ? `Delete “${label}” and all of its subtasks? This cannot be undone.`
        : `Delete “${label}”? This cannot be undone.`;
      if (!window.confirm(message)) return;
      void deleteTask.mutateAsync(task.id);
    },
    [deleteTask, taskTree.data?.tasks],
  );

  useEffect(() => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({ mode: viewMode, gridPct }));
  }, [viewMode, gridPct]);

  const onSplitterPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (viewMode !== 'split') return;
      e.preventDefault();
      const handle = e.currentTarget;
      handle.setPointerCapture(e.pointerId);
      dragRef.current = { startX: e.clientX, startPct: gridPct };
    },
    [viewMode, gridPct],
  );

  const onSplitterPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const layout = layoutRef.current;
    if (!drag || !layout) return;
    const width = layout.getBoundingClientRect().width;
    if (width <= 0) return;
    const deltaPct = ((e.clientX - drag.startX) / width) * 100;
    const next = Math.min(MAX_PANEL_PCT, Math.max(MIN_PANEL_PCT, drag.startPct + deltaPct));
    setGridPct(next);
  }, []);

  const onSplitterPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      dragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // already released
      }
    }
  }, []);

  const { undo, redo, canUndo, canRedo } = useUndoRedo(projectId, edit.mutate, {
    enabled: Boolean(projectQuery.data && taskTree.data),
  });

  if (projectQuery.isLoading || taskTree.isLoading) {
    return (
      <div className="page project-detail-page">
        <p className="muted">Loading project…</p>
      </div>
    );
  }

  if (projectQuery.isError || !projectQuery.data) {
    return (
      <div className="page project-detail-page">
        <p className="form-error">Could not load project.</p>
        <Link to="/projects">← Back to projects</Link>
      </div>
    );
  }

  if (taskTree.isError || !taskTree.data) {
    return (
      <div className="page project-detail-page">
        <header className="page-header">
          <div>
            <p className="eyebrow">
              <Link to="/projects">← Projects</Link>
            </p>
            <h1>{projectQuery.data.name}</h1>
          </div>
        </header>
        <p className="form-error">Could not load tasks.</p>
      </div>
    );
  }

  const project = projectQuery.data;
  const { tasks, dependencies, assignments, projectVersion } = taskTree.data;

  return (
    <div className="page project-detail-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <Link to="/projects">← Projects</Link>
          </p>
          <h1>{project.name}</h1>
          <p className="lede muted">
            Version <span className="mono">{projectVersion}</span>
            {project.status ? <> · {project.status}</> : null}
            {' · '}
            <Link to="/projects/$projectId/roles" params={{ projectId }}>
              Manage roles
            </Link>
            {' · '}
            <Link to="/projects/$projectId/resources" params={{ projectId }}>
              Resources
            </Link>
            {' · '}
            <Link to="/projects/$projectId/baselines" params={{ projectId }}>
              Baselines
            </Link>
            {' · '}
            <Link to="/projects/$projectId/reports" params={{ projectId }}>
              Reports
            </Link>
            {' · '}
            <Link to="/projects/$projectId/settings" params={{ projectId }}>
              Settings
            </Link>
          </p>
        </div>
        <div className="project-detail-toolbar">
          <div className="view-mode-toggle" role="group" aria-label="Panel layout">
            <button
              type="button"
              className={viewMode === 'grid' ? 'is-active' : undefined}
              aria-pressed={viewMode === 'grid'}
              onClick={() => setViewMode('grid')}
            >
              Tasks
            </button>
            <button
              type="button"
              className={viewMode === 'split' ? 'is-active' : undefined}
              aria-pressed={viewMode === 'split'}
              onClick={() => setViewMode('split')}
            >
              Both
            </button>
            <button
              type="button"
              className={viewMode === 'gantt' ? 'is-active' : undefined}
              aria-pressed={viewMode === 'gantt'}
              onClick={() => setViewMode('gantt')}
            >
              Gantt
            </button>
          </div>
          <div className="undo-redo-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={undo}
              disabled={!canUndo || edit.isPending}
              aria-keyshortcuts="Meta+Z Control+Z"
            >
              Undo
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={redo}
              disabled={!canRedo || edit.isPending}
              aria-keyshortcuts="Meta+Shift+Z Control+Shift+Z"
            >
              Redo
            </button>
          </div>
        </div>
      </header>

      <div
        ref={layoutRef}
        className={`project-detail-layout is-${viewMode}`}
        style={
          viewMode === 'split'
            ? ({ ['--grid-pct']: `${gridPct}%` } as CSSProperties)
            : undefined
        }
      >
        <section
          className="project-detail-grid"
          aria-label="Task grid"
          hidden={viewMode === 'gantt'}
        >
          <TaskGrid
            tasks={tasks}
            dependencies={dependencies}
            highlightedTaskId={highlightedTaskId}
            collapsedIds={collapsedIds}
            onToggleCollapse={onToggleCollapse}
            onExpandAll={onExpandAll}
            onCollapseAll={onCollapseAll}
            onAddTask={() => setCreateParent(null)}
            onAddSubtask={(parent) => setCreateParent(parent)}
            onDeleteTask={onDeleteTask}
            onEdit={onEdit}
            onSetPredecessors={setPredecessors}
            onAssignResources={setAssignTask}
            isEditing={edit.isPending}
            dateSettings={project.settings}
          />
        </section>

        {viewMode === 'split' ? (
          <div
            className="project-detail-splitter"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize task list and Gantt"
            aria-valuemin={MIN_PANEL_PCT}
            aria-valuemax={MAX_PANEL_PCT}
            aria-valuenow={Math.round(gridPct)}
            tabIndex={0}
            onPointerDown={onSplitterPointerDown}
            onPointerMove={onSplitterPointerMove}
            onPointerUp={onSplitterPointerUp}
            onPointerCancel={onSplitterPointerUp}
            onDoubleClick={() => setGridPct(DEFAULT_GRID_PCT)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') {
                e.preventDefault();
                setGridPct((p) => Math.max(MIN_PANEL_PCT, p - 3));
              }
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                setGridPct((p) => Math.min(MAX_PANEL_PCT, p + 3));
              }
            }}
          >
            <button
              type="button"
              className="splitter-collapse"
              aria-label="Hide task list"
              title="Hide task list"
              onClick={(e) => {
                e.stopPropagation();
                setViewMode('gantt');
              }}
            >
              ‹
            </button>
            <div className="splitter-grip" aria-hidden="true" />
            <button
              type="button"
              className="splitter-collapse"
              aria-label="Hide Gantt"
              title="Hide Gantt"
              onClick={(e) => {
                e.stopPropagation();
                setViewMode('grid');
              }}
            >
              ›
            </button>
          </div>
        ) : null}

        <section
          className="project-detail-gantt"
          aria-label="Gantt chart"
          hidden={viewMode === 'grid'}
        >
          <GanttPanel
            project={project}
            tasks={tasks}
            dependencies={dependencies}
            collapsedIds={collapsedIds}
            onHoverTask={setHighlightedTaskId}
            onCommitMove={onEdit}
            onCommitResize={onEdit}
          />
        </section>
      </div>

      {assignTask ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal assignment-modal" role="dialog" aria-modal="true">
            <AssignmentPanel
              projectId={projectId}
              task={assignTask}
              assignments={assignments}
              onClose={() => setAssignTask(null)}
            />
          </div>
        </div>
      ) : null}

      {createParent !== undefined ? (
        <CreateTaskModal
          parent={createParent}
          suggestedWbs={suggestWbsCode(tasks, createParent)}
          isPending={createTask.isPending}
          onClose={() => setCreateParent(undefined)}
          onSubmit={onCreateTask}
        />
      ) : null}
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { projectsApi } from '../../projects/index.js';
import { HelpLink } from '../../help/index.js';
import { useResources } from '../../resources/index.js';
import { useCreateTask } from '../hooks/useCreateTask.js';
import { useDeleteTask } from '../hooks/useDeleteTask.js';
import { useSetTaskPredecessors } from '../hooks/useDependencies.js';
import { projectQueryKey, useTaskEdit } from '../hooks/useTaskEdit.js';
import { useTaskTree } from '../hooks/useTaskTree.js';
import { useUndoRedo } from '../hooks/useUndoRedo.js';
import {
  DEFAULT_SCHEDULE_FILTERS,
  applyScheduleFilters,
  filterDependenciesForTasks,
  type ScheduleFilterState,
} from '../scheduleFilters.js';
import {
  buildChildrenIndex,
  collapsibleTaskIds,
  taskHasChildren,
} from '../taskVisibility.js';
import type { TaskEditPatch, TaskRow } from '../types.js';
import { AssignmentPanel } from './AssignmentPanel.js';
import { CreateTaskModal, suggestWbsCode, type CreateTaskDraft } from './CreateTaskModal.js';
import { GanttPanel } from './GanttPanel.js';
import { LevelResourcesModal } from './LevelResourcesModal.js';
import { ScheduleFilterBar } from './ScheduleFilterBar.js';
import { TaskGrid } from './TaskGrid.js';
import { UpdateProgressModal } from './UpdateProgressModal.js';
import { ImportSpreadsheetModal } from '../../projects/components/ImportSpreadsheetModal.js';

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

function formatStatus(status: string | null | undefined): string | null {
  if (!status) return null;
  return status.replace(/_/g, ' ');
}

export function ProjectDetailPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [importedTaskIds, setImportedTaskIds] = useState<ReadonlySet<string>>(() => new Set());
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [assignTask, setAssignTask] = useState<TaskRow | null>(null);
  const [createParent, setCreateParent] = useState<TaskRow | null | undefined>(undefined);
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [layoutPrefs] = useState(loadLayoutPrefs);
  const [viewMode, setViewMode] = useState<DetailViewMode>(layoutPrefs.mode);
  const [gridPct, setGridPct] = useState(layoutPrefs.gridPct);
  const [scheduleFilters, setScheduleFilters] =
    useState<ScheduleFilterState>(DEFAULT_SCHEDULE_FILTERS);
  const [levelingOpen, setLevelingOpen] = useState(false);
  const [levelResourceIds, setLevelResourceIds] = useState<string[] | undefined>(undefined);
  const [progressOpen, setProgressOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const layoutRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startPct: number } | null>(null);

  const projectQuery = useQuery({
    queryKey: projectQueryKey(projectId),
    queryFn: () => projectsApi.getProject(projectId),
  });

  const taskTree = useTaskTree(projectId);
  const resourcesQuery = useResources(projectId);
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('level') !== '1') return;
    const resourceId = params.get('resourceId');
    setLevelResourceIds(resourceId ? [resourceId] : undefined);
    setLevelingOpen(true);
    const url = new URL(window.location.href);
    url.searchParams.delete('level');
    url.searchParams.delete('resourceId');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, [projectId]);

  const openLeveling = useCallback((resourceIds?: string[]) => {
    setLevelResourceIds(resourceIds && resourceIds.length > 0 ? resourceIds : undefined);
    setLevelingOpen(true);
  }, []);

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

  const tasks = taskTree.data?.tasks ?? [];
  const dependencies = taskTree.data?.dependencies ?? [];
  const assignments = taskTree.data?.assignments ?? [];
  const projectVersion = taskTree.data?.projectVersion ?? projectQuery.data?.version ?? 0;
  const statusDate = projectQuery.data?.statusDate ?? null;

  const filteredTasks = useMemo(
    () =>
      applyScheduleFilters(tasks, assignments, scheduleFilters, {
        statusDate,
      }),
    [tasks, assignments, scheduleFilters, statusDate],
  );
  const filteredDependencies = useMemo(
    () => filterDependenciesForTasks(dependencies, filteredTasks),
    [dependencies, filteredTasks],
  );
  const filterResources = useMemo(
    () =>
      (resourcesQuery.data ?? []).map((r) => ({
        id: r.id,
        name: r.name,
      })),
    [resourcesQuery.data],
  );

  if (projectQuery.isLoading || taskTree.isLoading) {
    return (
      <div className="page project-detail-page">
        <p className="project-workspace-loading">Loading project…</p>
      </div>
    );
  }

  if (projectQuery.isError || !projectQuery.data) {
    return (
      <div className="page project-detail-page">
        <p className="form-error">Could not load project.</p>
        <Link to="/projects" className="project-workspace-back">
          ← Back to projects
        </Link>
      </div>
    );
  }

  if (taskTree.isError || !taskTree.data) {
    return (
      <div className="page project-detail-page">
        <header className="project-workspace-bar">
          <Link to="/projects" className="project-workspace-back">
            ← Projects
          </Link>
          <h1 className="project-workspace-title">{projectQuery.data.name}</h1>
        </header>
        <p className="form-error">Could not load tasks.</p>
      </div>
    );
  }

  const project = projectQuery.data;
  const statusLabel = formatStatus(project.status);

  return (
    <div className="page project-detail-page">
      <header className="project-workspace-bar">
        <div className="project-workspace-bar-main">
          <Link to="/projects" className="project-workspace-back">
            ← Projects
          </Link>
          <div className="project-workspace-identity">
            <h1 className="project-workspace-title">{project.name}</h1>
            <div className="project-workspace-meta">
              {statusLabel ? (
                <span className="project-status-chip" data-status={project.status ?? undefined}>
                  {statusLabel}
                </span>
              ) : null}
              <span className="project-version mono">
                v<span>{projectVersion}</span>
              </span>
              <HelpLink topic="schedule" label="Schedule help" />
            </div>
          </div>
        </div>
        <div className="project-workspace-tools">
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
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setImportOpen(true)}
              data-testid="schedule-import-spreadsheet-toolbar"
              title="Import tasks from Excel or CSV into this project"
            >
              Import
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setProgressOpen(true)}
              data-testid="schedule-update-progress-toolbar"
              title="Set status date and update task % complete / reschedule incomplete work"
            >
              Update progress
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => openLeveling()}
              data-testid="schedule-level-resources-toolbar"
              title="Delay non-critical tasks within float to clear resource overloads"
            >
              Level resources
            </button>
          </div>
        </div>
      </header>

      <nav className="project-workspace-nav" aria-label="Project">
        <Link
          to="/projects/$projectId"
          params={{ projectId }}
          className="project-workspace-nav-link"
          aria-current="page"
        >
          Schedule
        </Link>
        <Link
          to="/projects/$projectId/dashboard"
          params={{ projectId }}
          className="project-workspace-nav-link"
        >
          Dashboard
        </Link>
        <Link
          to="/projects/$projectId/resources"
          params={{ projectId }}
          className="project-workspace-nav-link"
        >
          Resources
        </Link>
        <Link
          to="/projects/$projectId/board"
          params={{ projectId }}
          className="project-workspace-nav-link"
        >
          Board
        </Link>
        <Link
          to="/projects/$projectId/backlog"
          params={{ projectId }}
          className="project-workspace-nav-link"
        >
          Backlog
        </Link>
        <Link
          to="/projects/$projectId/baselines"
          params={{ projectId }}
          className="project-workspace-nav-link"
        >
          Baselines
        </Link>
        <Link
          to="/projects/$projectId/reports"
          params={{ projectId }}
          className="project-workspace-nav-link"
        >
          Reports
        </Link>
        <Link
          to="/projects/$projectId/activity"
          params={{ projectId }}
          className="project-workspace-nav-link"
        >
          Activity
        </Link>
        <Link
          to="/projects/$projectId/agile-charts"
          params={{ projectId }}
          className="project-workspace-nav-link"
        >
          Charts
        </Link>
        <Link
          to="/projects/$projectId/people"
          params={{ projectId }}
          className="project-workspace-nav-link"
        >
          People
        </Link>
        <Link
          to="/projects/$projectId/roles"
          params={{ projectId }}
          className="project-workspace-nav-link"
        >
          Roles
        </Link>
        <Link
          to="/projects/$projectId/settings"
          params={{ projectId }}
          className="project-workspace-nav-link"
        >
          Settings
        </Link>
      </nav>

      <div className="project-schedule-stage">
        {importNotice ? (
          <div className="info-banner import-highlight-banner" role="status" data-testid="import-highlight-banner">
            <span>{importNotice}</span>
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                setImportNotice(null);
                setImportedTaskIds(new Set());
              }}
            >
              Dismiss
            </button>
          </div>
        ) : null}
        <ScheduleFilterBar
          filters={scheduleFilters}
          onChange={setScheduleFilters}
          resources={filterResources}
          visibleCount={filteredTasks.length}
          totalCount={tasks.length}
          onLevelResources={() => openLeveling()}
          onUpdateProgress={() => setProgressOpen(true)}
          onImportSpreadsheet={() => setImportOpen(true)}
        />
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
              tasks={filteredTasks}
              dependencies={filteredDependencies}
              highlightedTaskId={highlightedTaskId}
              highlightedTaskIds={importedTaskIds}
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
              tasks={filteredTasks}
              dependencies={filteredDependencies}
              collapsedIds={collapsedIds}
              onHoverTask={setHighlightedTaskId}
              onCommitMove={onEdit}
              onCommitResize={onEdit}
            />
          </section>
        </div>
      </div>

      {levelingOpen ? (
        <LevelResourcesModal
          projectId={projectId}
          {...(levelResourceIds ? { resourceIds: levelResourceIds } : {})}
          onClose={() => {
            setLevelingOpen(false);
            setLevelResourceIds(undefined);
          }}
          onApplied={() => {
            // Task tree invalidation is handled by the mutation hook.
          }}
        />
      ) : null}

      {progressOpen ? (
        <UpdateProgressModal
          projectId={projectId}
          initialStatusDate={project.statusDate}
          onClose={() => setProgressOpen(false)}
          onApplied={() => {
            // Invalidation handled by mutation hook.
          }}
        />
      ) : null}

      {importOpen ? (
        <ImportSpreadsheetModal
          projectId={projectId}
          projectName={project.name}
          onClose={() => setImportOpen(false)}
          onImported={(result) => {
            const ids = result.createdTaskIds;
            setImportedTaskIds(new Set(ids));
            setCollapsedIds(new Set());
            const n = result.taskCount;
            setImportNotice(
              result.mode === 'merge'
                ? `Merged ${n} new task${n === 1 ? '' : 's'} — highlighted with a New badge.`
                : `Replaced schedule with ${n} task${n === 1 ? '' : 's'} — highlighted with a New badge.`,
            );
            window.setTimeout(() => {
              const firstId = ids[0];
              if (!firstId) return;
              document
                .querySelector(`[data-task-id="${firstId}"]`)
                ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }, 100);
          }}
        />
      ) : null}

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

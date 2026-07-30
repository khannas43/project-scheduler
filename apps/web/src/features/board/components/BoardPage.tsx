import { Link, useParams } from '@tanstack/react-router';
import { useEffect, useMemo, useState, type DragEvent } from 'react';

import { useResources } from '../../resources/hooks/useResources.js';
import { useSprints } from '../../sprints/hooks/useSprints.js';
import type { SprintRow } from '../../sprints/types.js';
import { useTaskTree } from '../../tasks/hooks/useTaskTree.js';
import type { AssignmentRow, TaskRow } from '../../tasks/types.js';
import { findEpicAncestor } from '../epicAncestor.js';
import { useBoardColumns, useMoveTaskBoardColumn } from '../hooks/useBoard.js';
import type { BoardColumnRow } from '../types.js';
import { ManageColumnsModal } from './ManageColumnsModal.js';

const UNASSIGNED_KEY = '__unassigned__';

type GroupBy = 'none' | 'resource' | 'epic';

function pickDefaultSprintId(sprints: readonly SprintRow[]): string | null {
  if (sprints.length === 0) return null;
  const active = sprints.find((s) => s.state === 'active');
  return (active ?? sprints[0])!.id;
}

function compareBacklogRank(a: TaskRow, b: TaskRow): number {
  const ra = a.backlogRank ?? '';
  const rb = b.backlogRank ?? '';
  if (ra !== rb) return ra < rb ? -1 : ra > rb ? 1 : 0;
  return (a.wbsCode ?? a.name).localeCompare(b.wbsCode ?? b.name);
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

export function BoardPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const sprintsQuery = useSprints(projectId);
  const columnsQuery = useBoardColumns(projectId);
  const taskTree = useTaskTree(projectId);
  const resourcesQuery = useResources(projectId);
  const moveColumn = useMoveTaskBoardColumn(projectId);

  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [manageOpen, setManageOpen] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);

  const sprints = sprintsQuery.data ?? [];
  const columns = useMemo(
    () => [...(columnsQuery.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [columnsQuery.data],
  );

  useEffect(() => {
    if (selectedSprintId !== null) return;
    if (!sprintsQuery.data) return;
    setSelectedSprintId(pickDefaultSprintId(sprintsQuery.data));
  }, [sprintsQuery.data, selectedSprintId]);

  const tasksById = useMemo(() => {
    const map = new Map<string, TaskRow>();
    for (const t of taskTree.data?.tasks ?? []) map.set(t.id, t);
    return map;
  }, [taskTree.data?.tasks]);

  const assignmentsByTask = useMemo(() => {
    const map = new Map<string, AssignmentRow[]>();
    for (const a of taskTree.data?.assignments ?? []) {
      const list = map.get(a.taskId) ?? [];
      list.push(a);
      map.set(a.taskId, list);
    }
    return map;
  }, [taskTree.data?.assignments]);

  const resourceNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of resourcesQuery.data ?? []) {
      map.set(r.id, r.name);
    }
    return map;
  }, [resourcesQuery.data]);

  const sprintTasks = useMemo(() => {
    const tasks = taskTree.data?.tasks ?? [];
    if (!selectedSprintId) return [] as TaskRow[];
    return tasks
      .filter((t) => t.schedulingMode === 'agile' && t.sprintId === selectedSprintId)
      .sort(compareBacklogRank);
  }, [taskTree.data?.tasks, selectedSprintId]);

  const tasksByColumn = useMemo(() => {
    const map = new Map<string, TaskRow[]>();
    map.set(UNASSIGNED_KEY, []);
    for (const col of columns) map.set(col.id, []);
    for (const task of sprintTasks) {
      const key =
        task.boardColumnId && map.has(task.boardColumnId)
          ? task.boardColumnId
          : UNASSIGNED_KEY;
      map.get(key)!.push(task);
    }
    return map;
  }, [columns, sprintTasks]);

  function onCardDragStart(taskId: string, e: DragEvent<HTMLElement>) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
    setDraggingTaskId(taskId);
  }

  function onColumnDragOver(columnKey: string, e: DragEvent<HTMLElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumnId(columnKey);
  }

  function onColumnDrop(columnKey: string, e: DragEvent<HTMLElement>) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain') || draggingTaskId;
    setDraggingTaskId(null);
    setDragOverColumnId(null);
    if (!taskId) return;
    const boardColumnId = columnKey === UNASSIGNED_KEY ? null : columnKey;
    const task = sprintTasks.find((t) => t.id === taskId);
    if (!task) return;
    if ((task.boardColumnId ?? null) === boardColumnId) return;
    void moveColumn.mutateAsync({ taskId, boardColumnId });
  }

  function onDragEnd() {
    setDraggingTaskId(null);
    setDragOverColumnId(null);
  }

  function renderCard(task: TaskRow) {
    const isDragging = draggingTaskId === task.id;
    return (
      <article
        key={task.id}
        className={['board-card', isDragging ? 'is-dragging' : ''].filter(Boolean).join(' ')}
        draggable
        onDragStart={(e) => onCardDragStart(task.id, e)}
        onDragEnd={onDragEnd}
        aria-grabbed={isDragging}
        data-task-id={task.id}
      >
        <p className="board-card-title">{task.name}</p>
        <p className="muted board-card-meta">
          {task.wbsCode ? <span className="mono">{task.wbsCode}</span> : null}
          {task.storyPoints != null ? (
            <>
              {task.wbsCode ? ' · ' : null}
              {task.storyPoints} pts
            </>
          ) : null}
        </p>
      </article>
    );
  }

  function renderLanes(
    tasks: readonly TaskRow[],
    laneKeyFor: (task: TaskRow) => string,
    labelFor: (laneKey: string) => string,
  ) {
    const lanes = new Map<string, TaskRow[]>();
    for (const task of tasks) {
      const key = laneKeyFor(task);
      const list = lanes.get(key) ?? [];
      list.push(task);
      lanes.set(key, list);
    }

    return [...lanes.entries()].map(([laneKey, laneTasks]) => (
      <div key={laneKey} className="board-swimlane">
        <h3 className="board-swimlane-title">{labelFor(laneKey)}</h3>
        {laneTasks.map(renderCard)}
      </div>
    ));
  }

  function renderColumnBody(_columnKey: string, tasks: readonly TaskRow[]) {
    void _columnKey;
    if (groupBy === 'none') {
      return tasks.map(renderCard);
    }

    if (groupBy === 'resource') {
      return renderLanes(
        tasks,
        (task) => {
          const first = assignmentsByTask.get(task.id)?.[0];
          return first?.resourceId ?? '__unassigned_resource__';
        },
        (resourceId) =>
          resourceId === '__unassigned_resource__'
            ? 'Unassigned'
            : (resourceNameById.get(resourceId) ?? shortId(resourceId)),
      );
    }

    return renderLanes(
      tasks,
      (task) => findEpicAncestor(task, tasksById)?.id ?? '__no_epic__',
      (epicId) =>
        epicId === '__no_epic__'
          ? 'No epic'
          : (tasksById.get(epicId)?.name ?? shortId(epicId)),
    );
  }

  function renderColumn(column: BoardColumnRow | null) {
    const key = column?.id ?? UNASSIGNED_KEY;
    const tasks = tasksByColumn.get(key) ?? [];
    const title = column?.name ?? 'Unassigned';
    const wipLimit = column?.wipLimit ?? null;
    const overWip = wipLimit !== null && tasks.length > wipLimit;
    const isDragOver = dragOverColumnId === key;

    return (
      <section
        key={key}
        className={['board-column', isDragOver ? 'is-drag-over' : ''].filter(Boolean).join(' ')}
        aria-label={title}
        onDragOver={(e) => onColumnDragOver(key, e)}
        onDrop={(e) => onColumnDrop(key, e)}
        onDragLeave={() => {
          if (dragOverColumnId === key) setDragOverColumnId(null);
        }}
        data-column-id={key}
      >
        <header className="board-column-header">
          <h2>{title}</h2>
          <span className={['board-wip', overWip ? 'is-over' : ''].filter(Boolean).join(' ')}>
            {tasks.length}
            {wipLimit !== null ? ` / ${wipLimit}` : ''}
          </span>
        </header>
        <div className="board-column-body">{renderColumnBody(key, tasks)}</div>
      </section>
    );
  }

  const loading = sprintsQuery.isLoading || columnsQuery.isLoading || taskTree.isLoading;

  return (
    <div className="page board-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <Link to="/projects/$projectId" params={{ projectId }}>
              ← Project
            </Link>
          </p>
          <h1>Board</h1>
          <p className="lede muted">
            Drag agile tasks between columns for the selected sprint.
            {' · '}
            <Link to="/projects/$projectId/backlog" params={{ projectId }}>
              Backlog
            </Link>
          </p>
        </div>
        <div className="board-toolbar">
          <label className="field board-sprint-picker">
            Sprint
            <select
              value={selectedSprintId ?? ''}
              onChange={(e) => setSelectedSprintId(e.target.value || null)}
              disabled={sprints.length === 0}
              aria-label="Sprint"
            >
              {sprints.length === 0 ? <option value="">No sprints</option> : null}
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.state === 'active' ? ' (active)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field board-group-by">
            Group by
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupBy)}
              aria-label="Group by"
            >
              <option value="none">None</option>
              <option value="resource">Resource</option>
              <option value="epic">Epic</option>
            </select>
          </label>
          <button type="button" className="btn-secondary" onClick={() => setManageOpen(true)}>
            Manage columns
          </button>
        </div>
      </header>

      {loading ? <p className="muted">Loading board…</p> : null}
      {sprintsQuery.isError || columnsQuery.isError || taskTree.isError ? (
        <p className="form-error">Could not load board data.</p>
      ) : null}

      {!loading && sprints.length === 0 ? (
        <div className="empty-state">
          <p>No sprints yet. Create one on the backlog page.</p>
          <Link to="/projects/$projectId/backlog" params={{ projectId }}>
            Open backlog
          </Link>
        </div>
      ) : null}

      {!loading && sprints.length > 0 ? (
        <div className="board-columns" role="list">
          {renderColumn(null)}
          {columns.map((col) => renderColumn(col))}
        </div>
      ) : null}

      {manageOpen ? (
        <ManageColumnsModal
          projectId={projectId}
          columns={columns}
          onClose={() => setManageOpen(false)}
        />
      ) : null}
    </div>
  );
}

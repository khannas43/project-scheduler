import { Link, useParams } from '@tanstack/react-router';
import { useMemo, useState, type DragEvent, type FormEvent } from 'react';

import {
  useCloseSprint,
  useCreateSprint,
  useSprints,
  useUpdateSprint,
} from '../../sprints/hooks/useSprints.js';
import type { SprintRow } from '../../sprints/types.js';
import { useTaskTree } from '../../tasks/hooks/useTaskTree.js';
import type { TaskRow } from '../../tasks/types.js';
import { findEpicAncestor } from '../epicAncestor.js';
import { usePatchTaskSprint, useReorderBacklogRank } from '../hooks/useBoard.js';

type SectionKey = string; // 'backlog' | sprintId

function compareBacklogRank(a: TaskRow, b: TaskRow): number {
  const ra = a.backlogRank ?? '';
  const rb = b.backlogRank ?? '';
  if (ra !== rb) return ra < rb ? -1 : ra > rb ? 1 : 0;
  return (a.wbsCode ?? a.name).localeCompare(b.wbsCode ?? b.name);
}

function dateToIsoStart(date: string): string {
  return `${date}T00:00:00.000Z`;
}

function dateToIsoEnd(date: string): string {
  return `${date}T23:59:59.999Z`;
}

function neighborsForDrop(
  ordered: readonly TaskRow[],
  draggedId: string,
  targetId: string | null,
): { beforeTaskId: string | null; afterTaskId: string | null } {
  const without = ordered.filter((t) => t.id !== draggedId);
  if (targetId === null || targetId === draggedId) {
    const last = without[without.length - 1];
    return { beforeTaskId: null, afterTaskId: last?.id ?? null };
  }
  const idx = without.findIndex((t) => t.id === targetId);
  if (idx < 0) {
    const last = without[without.length - 1];
    return { beforeTaskId: null, afterTaskId: last?.id ?? null };
  }
  const after = without[idx - 1];
  return { beforeTaskId: targetId, afterTaskId: after?.id ?? null };
}

function sumStoryPoints(tasks: readonly TaskRow[]): number {
  let total = 0;
  for (const t of tasks) {
    if (t.storyPoints == null) continue;
    const n = Number(t.storyPoints);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

export function BacklogPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const sprintsQuery = useSprints(projectId);
  const taskTree = useTaskTree(projectId);
  const createSprint = useCreateSprint(projectId);
  const updateSprint = useUpdateSprint(projectId);
  const closeSprint = useCloseSprint(projectId);
  const reorder = useReorderBacklogRank(projectId);
  const patchSprint = usePatchTaskSprint(projectId);

  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [sprintName, setSprintName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [closingSprintId, setClosingSprintId] = useState<string | null>(null);
  const [carryOverToSprintId, setCarryOverToSprintId] = useState<string>('');

  const sprints = sprintsQuery.data ?? [];
  const agileTasks = useMemo(
    () => (taskTree.data?.tasks ?? []).filter((t) => t.schedulingMode === 'agile'),
    [taskTree.data?.tasks],
  );

  const tasksById = useMemo(() => {
    const map = new Map<string, TaskRow>();
    for (const t of taskTree.data?.tasks ?? []) map.set(t.id, t);
    return map;
  }, [taskTree.data?.tasks]);

  const sections = useMemo(() => {
    const bySprint = new Map<SectionKey, TaskRow[]>();
    bySprint.set('backlog', []);
    for (const s of sprints) bySprint.set(s.id, []);

    for (const task of agileTasks) {
      // Epics are containers — not backlog cards.
      if (task.isSummary) continue;
      const key = task.sprintId && bySprint.has(task.sprintId) ? task.sprintId : 'backlog';
      bySprint.get(key)!.push(task);
    }

    for (const list of bySprint.values()) {
      list.sort(compareBacklogRank);
    }

    return bySprint;
  }, [agileTasks, sprints]);

  function sectionSprintId(key: SectionKey): string | null {
    return key === 'backlog' ? null : key;
  }

  function onCardDragStart(taskId: string, e: DragEvent<HTMLElement>) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
    setDraggingTaskId(taskId);
  }

  function onDragOver(dropKey: string, e: DragEvent<HTMLElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverKey(dropKey);
  }

  async function onDrop(
    sectionKey: SectionKey,
    targetTaskId: string | null,
    e: DragEvent<HTMLElement>,
  ) {
    e.preventDefault();
    e.stopPropagation();
    const taskId = e.dataTransfer.getData('text/plain') || draggingTaskId;
    setDraggingTaskId(null);
    setDragOverKey(null);
    if (!taskId) return;

    const task = agileTasks.find((t) => t.id === taskId);
    if (!task) return;

    const targetSprintId = sectionSprintId(sectionKey);
    const currentSprintId = task.sprintId ?? null;

    const ordered = sections.get(sectionKey) ?? [];

    if (currentSprintId !== targetSprintId) {
      await patchSprint.mutateAsync({
        taskId: task.id,
        version: task.version,
        sprintId: targetSprintId,
      });
      // Land the task at the drop point in the destination section, not
      // wherever its old (source-section) rank happens to sort it.
      const { beforeTaskId, afterTaskId } = neighborsForDrop(ordered, taskId, targetTaskId);
      await reorder.mutateAsync({ taskId, beforeTaskId, afterTaskId });
      return;
    }

    const { beforeTaskId, afterTaskId } = neighborsForDrop(ordered, taskId, targetTaskId);
    if (beforeTaskId === null && afterTaskId === null && ordered.length <= 1) return;
    await reorder.mutateAsync({ taskId, beforeTaskId, afterTaskId });
  }

  function onDragEnd() {
    setDraggingTaskId(null);
    setDragOverKey(null);
  }

  async function handleCreateSprint(event: FormEvent) {
    event.preventDefault();
    const name = sprintName.trim();
    if (!name) {
      setFormError('Name is required');
      return;
    }
    if (!startDate || !endDate) {
      setFormError('Start and end dates are required');
      return;
    }
    if (new Date(dateToIsoEnd(endDate)) <= new Date(dateToIsoStart(startDate))) {
      setFormError('End date must be after start date');
      return;
    }
    setFormError(null);
    await createSprint.mutateAsync({
      name,
      startDate: dateToIsoStart(startDate),
      endDate: dateToIsoEnd(endDate),
    });
    setSprintName('');
    setStartDate('');
    setEndDate('');
  }

  function openClosePicker(sprint: SprintRow) {
    setClosingSprintId(sprint.id);
    setCarryOverToSprintId('');
  }

  async function confirmCloseSprint() {
    if (!closingSprintId) return;
    await closeSprint.mutateAsync({
      sprintId: closingSprintId,
      input: {
        carryOverToSprintId: carryOverToSprintId === '' ? null : carryOverToSprintId,
      },
    });
    setClosingSprintId(null);
    setCarryOverToSprintId('');
  }

  function renderSection(key: SectionKey, title: string, sprint?: SprintRow) {
    const tasks = sections.get(key) ?? [];
    const sectionDropKey = `section:${key}`;
    const isSectionOver = dragOverKey === sectionDropKey;
    const points = sumStoryPoints(tasks);
    const capacity =
      sprint?.capacity != null && sprint.capacity !== ''
        ? Number(sprint.capacity)
        : null;
    const carryTargets = sprints.filter(
      (s) => s.id !== sprint?.id && s.state !== 'closed',
    );

    return (
      <section
        key={key}
        className={['backlog-section', isSectionOver ? 'is-drag-over' : '']
          .filter(Boolean)
          .join(' ')}
        aria-label={title}
        data-section={key}
        onDragOver={(e) => onDragOver(sectionDropKey, e)}
        onDrop={(e) => void onDrop(key, null, e)}
      >
        <header className="backlog-section-header">
          <div className="backlog-section-heading">
            <h2>{title}</h2>
            {sprint ? (
              <span className="muted">
                {sprint.state}
                {' · '}
                {new Date(sprint.startDate).toLocaleDateString()} –{' '}
                {new Date(sprint.endDate).toLocaleDateString()}
                {' · '}
                {points}
                {capacity != null && Number.isFinite(capacity)
                  ? ` / ${capacity}`
                  : ''}{' '}
                pts
              </span>
            ) : (
              <span className="muted">{tasks.length} items</span>
            )}
          </div>
          {sprint && sprint.state === 'planned' ? (
            <button
              type="button"
              className="btn-secondary btn-compact"
              data-testid={`start-sprint-${sprint.id}`}
              disabled={updateSprint.isPending}
              onClick={() =>
                void updateSprint.mutateAsync({
                  sprintId: sprint.id,
                  input: { version: sprint.version, state: 'active' },
                })
              }
            >
              Start sprint
            </button>
          ) : null}
          {sprint && sprint.state === 'active' ? (
            <button
              type="button"
              className="btn-secondary btn-compact"
              data-testid={`close-sprint-${sprint.id}`}
              disabled={closeSprint.isPending}
              onClick={() => openClosePicker(sprint)}
            >
              Close sprint
            </button>
          ) : null}
        </header>

        {closingSprintId === sprint?.id ? (
          <div className="backlog-close-picker" data-testid={`close-picker-${sprint.id}`}>
            <label className="field">
              Carry incomplete to
              <select
                value={carryOverToSprintId}
                onChange={(e) => setCarryOverToSprintId(e.target.value)}
                aria-label="Carry incomplete to"
              >
                <option value="">Backlog</option>
                {carryTargets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="btn-secondary btn-compact"
                onClick={() => setClosingSprintId(null)}
                disabled={closeSprint.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-compact"
                data-testid={`confirm-close-${sprint.id}`}
                disabled={closeSprint.isPending}
                onClick={() => void confirmCloseSprint()}
              >
                {closeSprint.isPending ? 'Closing…' : 'Confirm close'}
              </button>
            </div>
          </div>
        ) : null}

        <ul className="backlog-list">
          {tasks.map((task) => {
            const dropKey = `task:${task.id}`;
            const isDragging = draggingTaskId === task.id;
            const isOver = dragOverKey === dropKey;
            const epic = findEpicAncestor(task, tasksById);
            return (
              <li
                key={task.id}
                className={[
                  'backlog-item',
                  isDragging ? 'is-dragging' : '',
                  isOver ? 'is-drag-over' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                draggable
                onDragStart={(e) => onCardDragStart(task.id, e)}
                onDragEnd={onDragEnd}
                onDragOver={(e) => {
                  e.stopPropagation();
                  onDragOver(dropKey, e);
                }}
                onDrop={(e) => void onDrop(key, task.id, e)}
                aria-grabbed={isDragging}
                data-task-id={task.id}
              >
                <span className="backlog-item-name">{task.name}</span>
                {epic ? (
                  <span className="backlog-epic-badge" data-testid={`epic-badge-${task.id}`}>
                    {epic.name}
                  </span>
                ) : null}
                <span className="muted mono">{task.wbsCode ?? '—'}</span>
                <span className="muted">
                  {task.storyPoints != null ? `${task.storyPoints} pts` : '—'}
                </span>
              </li>
            );
          })}
        </ul>
        {tasks.length === 0 ? <p className="muted backlog-empty">Drop tasks here</p> : null}
      </section>
    );
  }

  const loading = sprintsQuery.isLoading || taskTree.isLoading;

  return (
    <div className="page backlog-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <Link to="/projects/$projectId" params={{ projectId }}>
              ← Project
            </Link>
          </p>
          <h1>Backlog</h1>
          <p className="lede muted">
            Order agile work and assign it to sprints.
            {' · '}
            <Link to="/projects/$projectId/board" params={{ projectId }}>
              Board
            </Link>
          </p>
        </div>
      </header>

      {loading ? <p className="muted">Loading backlog…</p> : null}
      {sprintsQuery.isError || taskTree.isError ? (
        <p className="form-error">Could not load backlog data.</p>
      ) : null}

      {!loading ? (
        <>
          {renderSection('backlog', 'Backlog')}
          {sprints.map((s) => renderSection(s.id, s.name, s))}

          <form
            className="create-task-form backlog-new-sprint"
            onSubmit={(e) => void handleCreateSprint(e)}
          >
            <h2>+ New sprint</h2>
            <label className="field">
              Name
              <input
                value={sprintName}
                onChange={(e) => setSprintName(e.target.value)}
                placeholder="Sprint name"
                disabled={createSprint.isPending}
              />
            </label>
            <label className="field">
              Start date
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={createSprint.isPending}
              />
            </label>
            <label className="field">
              End date
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={createSprint.isPending}
              />
            </label>
            {formError ? <p className="form-error">{formError}</p> : null}
            <div className="form-actions">
              <button type="submit" disabled={createSprint.isPending}>
                {createSprint.isPending ? 'Creating…' : 'Create sprint'}
              </button>
            </div>
          </form>
        </>
      ) : null}
    </div>
  );
}

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { ProjectSettings } from '@pkg/schema';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from 'react';

import { useErrorBanner } from '../../../stores/errorBanner.js';
import { formatProjectDate } from '../../projects/dateFormat.js';
import {
  DEFAULT_TASK_GRID_COLUMN_ORDER,
  loadColumnOrder,
  moveColumnOrder,
  saveColumnOrder,
} from '../columnOrder.js';
import { wbsDepth } from '../optimisticEdit.js';
import {
  formatPredecessorDisplay,
  parsePredecessorWbsCodes,
  resolvePredecessorIds,
} from '../predecessors.js';
import {
  buildChildrenIndex,
  collapsibleTaskIds,
  filterTasksByCollapsed,
  taskHasChildren,
} from '../taskVisibility.js';
import type { DependencyRow, TaskEditPatch, TaskRow } from '../types.js';
import {
  DateCell,
  dateInputToConstraintIso,
  isoToDateInputValue,
} from './DateCell.js';

export { dateInputToConstraintIso, isoToDateInputValue };
export {
  DEFAULT_TASK_GRID_COLUMN_ORDER,
  loadColumnOrder,
  moveColumnOrder,
  normalizeColumnOrder,
  saveColumnOrder,
} from '../columnOrder.js';

export interface TaskGridProps {
  readonly tasks: readonly TaskRow[];
  readonly dependencies?: readonly DependencyRow[];
  readonly highlightedTaskId: string | null;
  readonly collapsedIds: ReadonlySet<string>;
  readonly onToggleCollapse: (taskId: string) => void;
  readonly onCollapseAll?: () => void;
  readonly onExpandAll?: () => void;
  readonly onAddTask?: () => void;
  readonly onAddSubtask?: (parent: TaskRow) => void;
  readonly onDeleteTask?: (task: TaskRow) => void;
  readonly onEdit: (patch: TaskEditPatch) => void;
  readonly onSetPredecessors?: (
    successorId: string,
    predecessorIds: readonly string[],
  ) => void | Promise<void>;
  readonly onAssignResources?: (task: TaskRow) => void;
  readonly isEditing?: boolean;
  /** Project date display preferences (format + date/datetime). */
  readonly dateSettings?: Pick<ProjectSettings, 'dateFormat' | 'dateTimeDisplay'>;
}

type EditableField = 'name' | 'durationMinutes';

/** Working-day length used by the default Mon–Fri calendar (8h). */
export const WORKING_MINUTES_PER_DAY = 480;

export function minutesToWorkingDays(minutes: number | null): number | null {
  if (minutes === null) return null;
  return minutes / WORKING_MINUTES_PER_DAY;
}

export function workingDaysToMinutes(days: number): number {
  return Math.round(days * WORKING_MINUTES_PER_DAY);
}

export function formatDurationDays(minutes: number | null): string {
  const days = minutesToWorkingDays(minutes);
  if (days === null) return '';
  if (Number.isInteger(days)) return String(days);
  // Keep short fractions (e.g. 0.5d) readable without long floats.
  return String(Math.round(days * 100) / 100);
}

function InlineCell({
  task,
  field,
  display,
  onCommit,
}: {
  task: TaskRow;
  field: EditableField;
  display: string;
  onCommit: (patch: TaskEditPatch) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(display);

  const start = () => {
    setDraft(
      field === 'durationMinutes'
        ? formatDurationDays(task.durationMinutes)
        : task.name,
    );
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    if (field === 'name') {
      const next = draft.trim();
      if (!next || next === task.name) return;
      onCommit({ taskId: task.id, version: task.version, name: next });
      return;
    }
    // Duration is edited in working days; persist as minutes for the API.
    const parsed = draft.trim() === '' ? null : Number(draft);
    if (parsed !== null && !Number.isFinite(parsed)) return;
    if (parsed !== null && parsed < 0) return;
    const nextMinutes = parsed === null ? null : workingDaysToMinutes(parsed);
    if (nextMinutes === task.durationMinutes) return;
    onCommit({
      taskId: task.id,
      version: task.version,
      durationMinutes: nextMinutes,
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        className="cell-input"
        aria-label={field === 'name' ? `Edit name for ${task.wbsCode ?? task.id}` : `Edit duration for ${task.wbsCode ?? task.id}`}
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
    );
  }

  return (
    <button type="button" className="cell-edit-trigger" onClick={start}>
      {display || '—'}
    </button>
  );
}

function PredecessorCell({
  task,
  display,
  tasks,
  onSetPredecessors,
}: {
  task: TaskRow;
  display: string;
  tasks: readonly TaskRow[];
  onSetPredecessors: (
    successorId: string,
    predecessorIds: readonly string[],
  ) => void | Promise<void>;
}) {
  const showBanner = useErrorBanner((s) => s.show);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(display);

  const start = () => {
    setDraft(display);
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const nextDisplay = draft.trim();
    if (nextDisplay === display) return;
    try {
      const codes = parsePredecessorWbsCodes(draft);
      const ids = resolvePredecessorIds(task.id, codes, tasks);
      void onSetPredecessors(task.id, ids);
    } catch (err) {
      showBanner(err instanceof Error ? err : new Error(String(err)));
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        className="cell-input mono"
        aria-label={`Edit predecessors for ${task.wbsCode ?? task.id}`}
        placeholder="e.g. 1.1, 1.2"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
    );
  }

  return (
    <button type="button" className="cell-edit-trigger mono" onClick={start}>
      {display || '—'}
    </button>
  );
}

const columnHelper = createColumnHelper<TaskRow>();

/** Native title tooltip on column headers — hover for a short definition. */
function ColumnHeader({ label, tip }: { label: string; tip: string }) {
  return (
    <span className="column-header-tip" title={tip}>
      {label}
    </span>
  );
}

/** Shared Yes/No control used by Critical and Milestone columns. */
function YesNoToggle({
  value,
  ariaLabel,
  onChange,
  disabled = false,
}: {
  readonly value: boolean;
  readonly ariaLabel: string;
  readonly onChange: (next: boolean) => void;
  readonly disabled?: boolean;
}) {
  return (
    <div className="yes-no-toggle" role="group" aria-label={ariaLabel}>
      <button
        type="button"
        className={value ? 'is-active' : undefined}
        aria-pressed={value}
        disabled={disabled}
        onClick={() => {
          if (!value) onChange(true);
        }}
      >
        Yes
      </button>
      <button
        type="button"
        className={!value ? 'is-active' : undefined}
        aria-pressed={!value}
        disabled={disabled}
        onClick={() => {
          if (value) onChange(false);
        }}
      >
        No
      </button>
    </div>
  );
}

const DRAG_HINT = ' Drag the header to reorder columns.';

const COLUMN_TIPS = {
  wbs: `Work Breakdown Structure code — hierarchical ID for the task in the plan (e.g. 1.2.3).${DRAG_HINT}`,
  name: `Task name. Click to edit.${DRAG_HINT}`,
  duration: `How long the task takes, in working days (8-hour days). Click to edit. Summaries show — because duration is rolled up from children.${DRAG_HINT}`,
  predecessors: `Tasks that must finish (or otherwise constrain this one) before this task can proceed. Enter WBS codes, comma-separated (e.g. 1.1, 1.2).${DRAG_HINT}`,
  startDate: `Earliest start from the schedule (CPM). Click to set a Must Start On date; clear to let dependencies drive the start again.${DRAG_HINT}`,
  finishDate: `Earliest finish from the schedule (CPM). Click to set a Must Finish On date; clear to let the schedule drive the finish again.${DRAG_HINT}`,
  totalFloat: `Slack in working minutes: how long you can delay this task without delaying the project finish. 0 means critical; negative means the plan is over-constrained.${DRAG_HINT}`,
  critical: `Toggle to mark critical or not. This sets a sticky override; the schedule still computes float. Uncheck/check to force Yes or No.${DRAG_HINT}`,
  milestone: `Mark as a milestone (zero-duration checkpoint). Duration becomes 0; setting a positive duration clears the milestone.${DRAG_HINT}`,
  resources: `Open the panel to assign people or equipment to this task.${DRAG_HINT}`,
  actions: `Row actions such as adding a subtask or deleting the task.${DRAG_HINT}`,
} as const;

export function TaskGrid({
  tasks,
  dependencies = [],
  highlightedTaskId,
  collapsedIds,
  onToggleCollapse,
  onCollapseAll,
  onExpandAll,
  onAddTask,
  onAddSubtask,
  onDeleteTask,
  onEdit,
  onSetPredecessors,
  onAssignResources,
  dateSettings,
}: TaskGridProps) {
  const childrenIndex = useMemo(() => buildChildrenIndex(tasks), [tasks]);
  const data = useMemo(
    () => filterTasksByCollapsed(tasks, collapsedIds),
    [tasks, collapsedIds],
  );
  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const canCollapseAny = collapsibleTaskIds(childrenIndex).length > 0;

  const [columnOrder, setColumnOrder] = useState<string[]>(() => loadColumnOrder());
  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);

  useEffect(() => {
    saveColumnOrder(columnOrder);
  }, [columnOrder]);

  const resetColumnOrder = useCallback(() => {
    setColumnOrder([...DEFAULT_TASK_GRID_COLUMN_ORDER]);
  }, []);

  const onHeaderDragStart = useCallback((columnId: string, e: DragEvent<HTMLTableCellElement>) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', columnId);
    setDraggingColumnId(columnId);
  }, []);

  const onHeaderDragOver = useCallback((columnId: string, e: DragEvent<HTMLTableCellElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumnId(columnId);
  }, []);

  const onHeaderDrop = useCallback((toId: string, e: DragEvent<HTMLTableCellElement>) => {
    e.preventDefault();
    const fromId = e.dataTransfer.getData('text/plain') || draggingColumnId;
    setDraggingColumnId(null);
    setDragOverColumnId(null);
    if (!fromId) return;
    setColumnOrder((prev) => moveColumnOrder(prev, fromId, toId));
  }, [draggingColumnId]);

  const onHeaderDragEnd = useCallback(() => {
    setDraggingColumnId(null);
    setDragOverColumnId(null);
  }, []);

  const columns = useMemo(
    () => [
      columnHelper.accessor('wbsCode', {
        header: () => <ColumnHeader label="WBS" tip={COLUMN_TIPS.wbs} />,
        cell: (info) => <span className="mono">{info.getValue() ?? '—'}</span>,
      }),
      columnHelper.accessor('name', {
        header: () => <ColumnHeader label="Name" tip={COLUMN_TIPS.name} />,
        cell: (info) => {
          const task = info.row.original;
          const depth = wbsDepth(task.wbsCode);
          const hasChildren = taskHasChildren(task.id, childrenIndex);
          const collapsed = collapsedIds.has(task.id);
          return (
            <div
              className={task.isSummary || hasChildren ? 'task-name-cell is-group' : 'task-name-cell'}
              style={{ paddingLeft: `${depth * 1.15}rem` }}
            >
              {hasChildren ? (
                <button
                  type="button"
                  className="wbs-toggle"
                  aria-label={collapsed ? `Expand ${task.wbsCode ?? task.name}` : `Collapse ${task.wbsCode ?? task.name}`}
                  aria-expanded={!collapsed}
                  onClick={() => onToggleCollapse(task.id)}
                >
                  {collapsed ? '▸' : '▾'}
                </button>
              ) : (
                <span className="wbs-toggle-spacer" aria-hidden="true" />
              )}
              <InlineCell task={task} field="name" display={task.name} onCommit={onEdit} />
            </div>
          );
        },
      }),
      columnHelper.accessor('durationMinutes', {
        header: () => <ColumnHeader label="Duration (days)" tip={COLUMN_TIPS.duration} />,
        cell: (info) => {
          const task = info.row.original;
          if (task.isSummary) {
            return <span className="muted">—</span>;
          }
          if (task.isMilestone) {
            return (
              <span className="mono muted" title="Milestones have zero duration">
                0
              </span>
            );
          }
          return (
            <InlineCell
              task={task}
              field="durationMinutes"
              display={formatDurationDays(task.durationMinutes)}
              onCommit={onEdit}
            />
          );
        },
      }),
      columnHelper.display({
        id: 'predecessors',
        header: () => <ColumnHeader label="Predecessors" tip={COLUMN_TIPS.predecessors} />,
        cell: (info) => {
          const task = info.row.original;
          if (task.isSummary || !onSetPredecessors) {
            const display = formatPredecessorDisplay(task.id, dependencies, tasksById);
            return <span className="mono muted">{display || '—'}</span>;
          }
          const display = formatPredecessorDisplay(task.id, dependencies, tasksById);
          return (
            <PredecessorCell
              task={task}
              display={display}
              tasks={tasks}
              onSetPredecessors={onSetPredecessors}
            />
          );
        },
      }),
      columnHelper.accessor('earlyStart', {
        header: () => <ColumnHeader label="Start date" tip={COLUMN_TIPS.startDate} />,
        cell: (info) => {
          const task = info.row.original;
          const label = formatProjectDate(info.getValue(), dateSettings);
          if (task.isSummary) {
            return <span className="mono">{label}</span>;
          }
          return (
            <DateCell task={task} kind="start" onCommit={onEdit} displayLabel={label} />
          );
        },
      }),
      columnHelper.accessor('earlyFinish', {
        header: () => <ColumnHeader label="Finish date" tip={COLUMN_TIPS.finishDate} />,
        cell: (info) => {
          const task = info.row.original;
          const label = formatProjectDate(info.getValue(), dateSettings);
          if (task.isSummary) {
            return <span className="mono">{label}</span>;
          }
          return (
            <DateCell task={task} kind="finish" onCommit={onEdit} displayLabel={label} />
          );
        },
      }),
      columnHelper.accessor('totalFloatMinutes', {
        header: () => <ColumnHeader label="Total float" tip={COLUMN_TIPS.totalFloat} />,
        cell: (info) => {
          const v = info.getValue();
          return <span className="mono">{v === null ? '—' : String(v)}</span>;
        },
      }),
      columnHelper.accessor('isCritical', {
        header: () => <ColumnHeader label="Critical" tip={COLUMN_TIPS.critical} />,
        cell: (info) => {
          const task = info.row.original;
          if (task.isSummary) {
            return <span className="muted">{info.getValue() ? 'Yes' : '—'}</span>;
          }
          return (
            <YesNoToggle
              value={task.isCritical}
              ariaLabel={`Critical for ${task.wbsCode ?? task.name}`}
              onChange={(next) => {
                onEdit({
                  taskId: task.id,
                  version: task.version,
                  criticalOverride: next,
                });
              }}
            />
          );
        },
      }),
      columnHelper.accessor('isMilestone', {
        header: () => <ColumnHeader label="Milestone" tip={COLUMN_TIPS.milestone} />,
        cell: (info) => {
          const task = info.row.original;
          if (task.isSummary) {
            return <span className="muted">{info.getValue() ? 'Yes' : '—'}</span>;
          }
          return (
            <YesNoToggle
              value={Boolean(task.isMilestone)}
              ariaLabel={`Milestone for ${task.wbsCode ?? task.name}`}
              onChange={(next) => {
                onEdit({
                  taskId: task.id,
                  version: task.version,
                  isMilestone: next,
                  ...(next ? { durationMinutes: 0 } : {}),
                });
              }}
            />
          );
        },
      }),
      columnHelper.display({
        id: 'resources',
        header: () => <ColumnHeader label="Resources" tip={COLUMN_TIPS.resources} />,
        cell: (info) => {
          const task = info.row.original;
          if (task.isSummary || !onAssignResources) {
            return <span className="muted">—</span>;
          }
          return (
            <button
              type="button"
              className="btn-link"
              onClick={() => onAssignResources(task)}
            >
              Resources
            </button>
          );
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: () => <ColumnHeader label="Actions" tip={COLUMN_TIPS.actions} />,
        cell: (info) => {
          const task = info.row.original;
          return (
            <div className="task-row-actions">
              {onAddSubtask ? (
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => onAddSubtask(task)}
                  aria-label={`Add subtask under ${task.wbsCode ?? task.name}`}
                >
                  + Subtask
                </button>
              ) : null}
              {onDeleteTask ? (
                <button
                  type="button"
                  className="btn-link btn-danger-link"
                  onClick={() => onDeleteTask(task)}
                  aria-label={`Delete ${task.wbsCode ?? task.name}`}
                >
                  Delete
                </button>
              ) : null}
            </div>
          );
        },
      }),
    ],
    [
      onEdit,
      onAssignResources,
      onAddSubtask,
      onDeleteTask,
      onSetPredecessors,
      onToggleCollapse,
      collapsedIds,
      childrenIndex,
      dependencies,
      tasks,
      tasksById,
      dateSettings,
    ],
  );

  const table = useReactTable({
    data,
    columns,
    state: { columnOrder },
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  if (tasks.length === 0) {
    return (
      <div className="empty-state">
        <p>No tasks in this project yet.</p>
        {onAddTask ? (
          <button type="button" onClick={onAddTask}>
            Add task
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="task-grid-shell">
      <div className="task-grid-toolbar" role="group" aria-label="Task actions">
        {onAddTask ? (
          <button type="button" className="btn-compact" onClick={onAddTask}>
            Add task
          </button>
        ) : null}
        {canCollapseAny ? (
          <>
            <span className="muted toolbar-sep">Group by WBS</span>
            <button type="button" className="btn-secondary btn-compact" onClick={onExpandAll}>
              Expand all
            </button>
            <button type="button" className="btn-secondary btn-compact" onClick={onCollapseAll}>
              Collapse all
            </button>
          </>
        ) : null}
        <button
          type="button"
          className="btn-secondary btn-compact"
          onClick={resetColumnOrder}
          title="Restore the default left-to-right column order"
        >
          Reset columns
        </button>
      </div>
      <div className="table-wrap task-grid-wrap">
        <table className="data-table task-grid">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const isDragging = draggingColumnId === header.id;
                  const isDragOver = dragOverColumnId === header.id && !isDragging;
                  return (
                    <th
                      key={header.id}
                      draggable
                      onDragStart={(e) => onHeaderDragStart(header.id, e)}
                      onDragOver={(e) => onHeaderDragOver(header.id, e)}
                      onDrop={(e) => onHeaderDrop(header.id, e)}
                      onDragEnd={onHeaderDragEnd}
                      className={[
                        'task-grid-th-draggable',
                        isDragging ? 'is-dragging' : '',
                        isDragOver ? 'is-drag-over' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      aria-grabbed={isDragging}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              const critical = row.original.isCritical;
              const highlighted = row.original.id === highlightedTaskId;
              const grouped = row.original.isSummary || taskHasChildren(row.original.id, childrenIndex);
              return (
                <tr
                  key={row.id}
                  data-task-id={row.original.id}
                  className={[
                    critical ? 'is-critical' : '',
                    highlighted ? 'is-highlighted' : '',
                    grouped ? 'is-group-row' : '',
                    collapsedIds.has(row.original.id) ? 'is-collapsed' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

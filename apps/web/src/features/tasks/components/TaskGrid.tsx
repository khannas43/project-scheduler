import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useMemo, useState, type KeyboardEvent } from 'react';

import { sortTasksForGrid, wbsDepth } from '../optimisticEdit.js';
import type { TaskEditPatch, TaskRow } from '../types.js';

export interface TaskGridProps {
  readonly tasks: readonly TaskRow[];
  readonly highlightedTaskId: string | null;
  readonly onEdit: (patch: TaskEditPatch) => void;
  readonly onAssignResources?: (task: TaskRow) => void;
  readonly isEditing?: boolean;
}

type EditableField = 'name' | 'durationMinutes';

function formatTs(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 16).replace('T', ' ');
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
        ? String(task.durationMinutes ?? '')
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
    const parsed = draft.trim() === '' ? null : Number(draft);
    if (parsed !== null && !Number.isFinite(parsed)) return;
    if (parsed === task.durationMinutes) return;
    onCommit({
      taskId: task.id,
      version: task.version,
      durationMinutes: parsed === null ? null : Math.trunc(parsed),
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

const columnHelper = createColumnHelper<TaskRow>();

export function TaskGrid({
  tasks,
  highlightedTaskId,
  onEdit,
  onAssignResources,
}: TaskGridProps) {
  const data = useMemo(() => sortTasksForGrid(tasks), [tasks]);

  const columns = useMemo(
    () => [
      columnHelper.accessor('wbsCode', {
        header: 'WBS',
        cell: (info) => <span className="mono">{info.getValue() ?? '—'}</span>,
      }),
      columnHelper.accessor('name', {
        header: 'Name',
        cell: (info) => {
          const task = info.row.original;
          const depth = wbsDepth(task.wbsCode);
          return (
            <div className="task-name-cell" style={{ paddingLeft: `${depth * 1.1}rem` }}>
              <InlineCell task={task} field="name" display={task.name} onCommit={onEdit} />
            </div>
          );
        },
      }),
      columnHelper.accessor('durationMinutes', {
        header: 'Duration (min)',
        cell: (info) => {
          const task = info.row.original;
          if (task.isSummary) {
            return <span className="muted">—</span>;
          }
          return (
            <InlineCell
              task={task}
              field="durationMinutes"
              display={task.durationMinutes === null ? '' : String(task.durationMinutes)}
              onCommit={onEdit}
            />
          );
        },
      }),
      columnHelper.accessor('earlyStart', {
        header: 'Early start',
        cell: (info) => <span className="mono">{formatTs(info.getValue())}</span>,
      }),
      columnHelper.accessor('earlyFinish', {
        header: 'Early finish',
        cell: (info) => <span className="mono">{formatTs(info.getValue())}</span>,
      }),
      columnHelper.accessor('totalFloatMinutes', {
        header: 'Total float',
        cell: (info) => {
          const v = info.getValue();
          return <span className="mono">{v === null ? '—' : String(v)}</span>;
        },
      }),
      columnHelper.accessor('isCritical', {
        header: 'Critical',
        cell: (info) => (info.getValue() ? 'Yes' : '—'),
      }),
      columnHelper.display({
        id: 'resources',
        header: 'Resources',
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
    ],
    [onEdit, onAssignResources],
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  if (data.length === 0) {
    return (
      <div className="empty-state">
        <p>No tasks in this project yet.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap task-grid-wrap">
      <table className="data-table task-grid">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((header) => (
                <th key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => {
            const critical = row.original.isCritical;
            const highlighted = row.original.id === highlightedTaskId;
            return (
              <tr
                key={row.id}
                data-task-id={row.original.id}
                className={[critical ? 'is-critical' : '', highlighted ? 'is-highlighted' : '']
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
  );
}

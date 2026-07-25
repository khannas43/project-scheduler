import { useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';

import { useResources } from '../../resources/index.js';
import {
  useAssignmentTimephased,
  useCreateAssignment,
  useDeleteAssignment,
  useUpdateAssignment,
} from '../hooks/useAssignments.js';
import type { AssignmentRow, TaskRow } from '../types.js';

export interface AssignmentPanelProps {
  readonly projectId: string;
  readonly task: TaskRow;
  readonly assignments: readonly AssignmentRow[];
  readonly onClose: () => void;
}

function formatUnits(units: string | null): string {
  if (units === null || units === '') return '1';
  return units;
}

export function AssignmentPanel({
  projectId,
  task,
  assignments,
  onClose,
}: AssignmentPanelProps) {
  const resourcesQuery = useResources(projectId);
  const create = useCreateAssignment(projectId);
  const update = useUpdateAssignment(projectId);
  const del = useDeleteAssignment(projectId);

  const taskAssignments = useMemo(
    () => assignments.filter((a) => a.taskId === task.id),
    [assignments, task.id],
  );

  const resources = resourcesQuery.data ?? [];
  const resourceName = (id: string) => resources.find((r) => r.id === id)?.name ?? id.slice(0, 8);

  const assignedIds = new Set(taskAssignments.map((a) => a.resourceId));
  const available = resources.filter((r) => !assignedIds.has(r.id));

  const [addResourceId, setAddResourceId] = useState('');
  const [addUnits, setAddUnits] = useState('1');

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    if (!addResourceId) return;
    const units = addUnits.trim() === '' ? undefined : Number(addUnits);
    if (units !== undefined && (!Number.isFinite(units) || units <= 0)) return;

    try {
      await create.mutateAsync({
        taskId: task.id,
        resourceId: addResourceId,
        units: units ?? null,
      });
      setAddResourceId('');
      setAddUnits('1');
    } catch {
      // Banner via hook.
    }
  }

  return (
    <div className="assignment-panel">
      <header className="assignment-panel-header">
        <div>
          <h2>Resources</h2>
          <p className="muted">
            Assignments for <strong>{task.name}</strong>
            {task.wbsCode ? (
              <>
                {' '}
                (<span className="mono">{task.wbsCode}</span>)
              </>
            ) : null}
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={onClose}>
          Close
        </button>
      </header>

      {resourcesQuery.isLoading ? <p className="muted">Loading resources…</p> : null}

      <div className="table-wrap">
        <table className="data-table assignment-table">
          <thead>
            <tr>
              <th>Resource</th>
              <th>Units</th>
              <th>Work (min)</th>
              <th>Cost</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {taskAssignments.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No assignments yet.
                </td>
              </tr>
            ) : (
              taskAssignments.map((row) => (
                <AssignmentRowEditor
                  key={row.id}
                  row={row}
                  resourceLabel={resourceName(row.resourceId)}
                  pending={update.isPending || del.isPending}
                  onSaveUnits={(units) => {
                    void update.mutateAsync({ assignmentId: row.id, units }).catch(() => undefined);
                  }}
                  onRemove={() => {
                    void del.mutateAsync(row.id).catch(() => undefined);
                  }}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <form className="assignment-add-row" onSubmit={(e) => void onAdd(e)}>
        <label>
          Resource
          <select
            value={addResourceId}
            onChange={(e) => setAddResourceId(e.target.value)}
            disabled={create.isPending || available.length === 0}
            aria-label="Resource to assign"
          >
            <option value="">Select…</option>
            {available.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.resourceType})
              </option>
            ))}
          </select>
        </label>
        <label>
          Units
          <input
            inputMode="decimal"
            value={addUnits}
            onChange={(e) => setAddUnits(e.target.value)}
            disabled={create.isPending}
            aria-label="Units"
          />
        </label>
        <button type="submit" disabled={create.isPending || !addResourceId}>
          {create.isPending ? 'Adding…' : 'Add assignment'}
        </button>
      </form>
    </div>
  );
}

function AssignmentRowEditor({
  row,
  resourceLabel,
  pending,
  onSaveUnits,
  onRemove,
}: {
  row: AssignmentRow;
  resourceLabel: string;
  pending: boolean;
  onSaveUnits: (units: number) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(formatUnits(row.units));
  const [expanded, setExpanded] = useState(false);
  const timephased = useAssignmentTimephased(row.id, expanded);

  const commit = () => {
    setEditing(false);
    const n = Number(draft);
    if (!Number.isFinite(n) || n <= 0) {
      setDraft(formatUnits(row.units));
      return;
    }
    if (String(n) === formatUnits(row.units) || n === Number(row.units)) return;
    onSaveUnits(n);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(formatUnits(row.units));
      setEditing(false);
    }
  };

  return (
    <>
      <tr data-assignment-id={row.id}>
        <td>{resourceLabel}</td>
        <td>
          {editing ? (
            <input
              className="cell-input"
              aria-label={`Units for ${resourceLabel}`}
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={onKeyDown}
            />
          ) : (
            <button
              type="button"
              className="cell-edit-trigger"
              onClick={() => {
                setDraft(formatUnits(row.units));
                setEditing(true);
              }}
            >
              {formatUnits(row.units)}
            </button>
          )}
        </td>
        <td className="mono">{row.workMinutes ?? '—'}</td>
        <td className="mono">{row.cost ?? '—'}</td>
        <td>
          <div className="role-actions">
            <button
              type="button"
              className="btn-link"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Hide distribution' : 'View distribution'}
            </button>
            <button type="button" className="btn-link" disabled={pending} onClick={onRemove}>
              Remove
            </button>
          </div>
        </td>
      </tr>
      {expanded ? (
        <tr className="assignment-distribution-row" data-distribution-for={row.id}>
          <td colSpan={5}>
            {timephased.isLoading ? <p className="muted">Loading distribution…</p> : null}
            {timephased.isError ? (
              <p className="form-error" role="alert">
                Could not load distribution.
              </p>
            ) : null}
            {timephased.data && timephased.data.length === 0 ? (
              <p className="muted">No timephased work (unscheduled, non-work, or zero duration).</p>
            ) : null}
            {timephased.data && timephased.data.length > 0 ? (
              <table className="data-table timephased-table">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Planned work (min)</th>
                  </tr>
                </thead>
                <tbody>
                  {timephased.data.map((bucket) => (
                    <tr key={bucket.periodDate}>
                      <td className="mono">{bucket.periodDate}</td>
                      <td className="mono">{bucket.plannedWorkMinutes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

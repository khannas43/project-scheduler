import { useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';

import { useResources } from '../../resources/index.js';
import type { AssignmentUpdateInput } from '../api.js';
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
  const n = Number(units);
  if (!Number.isFinite(n)) return units;
  // Snap to 0.05 so derived values like 0.9104 don't linger in the UI.
  const rounded = Math.round(n / 0.05) * 0.05;
  return String(Math.round(rounded * 1000) / 1000);
}

function formatWork(workMinutes: number | null): string {
  if (workMinutes === null) return '';
  return String(workMinutes);
}

function formatCost(cost: string | null): string {
  if (cost === null || cost === '') return '';
  return cost;
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
    const unitsRaw = addUnits.trim() === '' ? undefined : Number(addUnits);
    if (unitsRaw !== undefined && (!Number.isFinite(unitsRaw) || unitsRaw <= 0)) return;
    const units =
      unitsRaw === undefined ? undefined : Number(formatUnits(String(unitsRaw)));

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
            . Edit units, work, or cost — changing units or work recalculates the other from the
            task duration.
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
                  onSave={(patch) => {
                    void update
                      .mutateAsync({ assignmentId: row.id, ...patch })
                      .catch(() => undefined);
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
  onSave,
  onRemove,
}: {
  row: AssignmentRow;
  resourceLabel: string;
  pending: boolean;
  onSave: (patch: AssignmentUpdateInput) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [unitsDraft, setUnitsDraft] = useState(formatUnits(row.units));
  const [workDraft, setWorkDraft] = useState(formatWork(row.workMinutes));
  const [costDraft, setCostDraft] = useState(formatCost(row.cost));
  const [formError, setFormError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const timephased = useAssignmentTimephased(row.id, expanded);

  const beginEdit = () => {
    setUnitsDraft(formatUnits(row.units));
    setWorkDraft(formatWork(row.workMinutes));
    setCostDraft(formatCost(row.cost));
    setFormError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setFormError(null);
    setUnitsDraft(formatUnits(row.units));
    setWorkDraft(formatWork(row.workMinutes));
    setCostDraft(formatCost(row.cost));
  };

  const commit = () => {
    const unitsRaw = unitsDraft.trim();
    const workRaw = workDraft.trim();
    const costRaw = costDraft.trim();

    const units = Number(formatUnits(String(Number(unitsRaw))));
    const workMinutes = workRaw === '' ? null : Number(workRaw);
    const cost = costRaw === '' ? null : Number(costRaw);

    if (!Number.isFinite(units) || units <= 0) {
      setFormError('Units must be a positive number (0.05 steps).');
      return;
    }
    if (workMinutes !== null && (!Number.isFinite(workMinutes) || !Number.isInteger(workMinutes) || workMinutes < 0)) {
      setFormError('Work must be a whole number of minutes (or blank).');
      return;
    }
    if (cost !== null && (!Number.isFinite(cost) || cost < 0)) {
      setFormError('Cost must be a non-negative number (or blank).');
      return;
    }

    const prevUnits = Number(formatUnits(row.units));
    const prevWork = row.workMinutes;
    const prevCost = row.cost === null || row.cost === '' ? null : Number(row.cost);

    const unitsChanged = units !== prevUnits;
    const workChanged = workMinutes !== prevWork && !(workMinutes === null && prevWork === null);
    const costChanged =
      cost !== prevCost && !(cost === null && (prevCost === null || Number.isNaN(prevCost)));

    if (!unitsChanged && !workChanged && !costChanged) {
      setEditing(false);
      setFormError(null);
      return;
    }

    // Prefer the field the user changed relative to the triangle:
    // - work change → send workMinutes (server derives units)
    // - units-only → send units (server derives work)
    // - cost always sent when changed (override / recompute skip)
    const patch: {
      units?: number;
      workMinutes?: number;
      cost?: number | null;
    } = {};
    if (workChanged && workMinutes !== null) {
      patch.workMinutes = workMinutes;
    } else if (unitsChanged) {
      patch.units = units;
    }
    if (costChanged) {
      patch.cost = cost;
    }

    if (Object.keys(patch).length === 0) {
      setEditing(false);
      setFormError(null);
      return;
    }

    setFormError(null);
    setEditing(false);
    onSave(patch satisfies AssignmentUpdateInput);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  return (
    <>
      <tr data-assignment-id={row.id}>
        <td>
          <button
            type="button"
            className="btn-link assignment-resource-name"
            onClick={beginEdit}
            aria-label={`Edit assignment for ${resourceLabel}`}
          >
            {resourceLabel}
          </button>
        </td>
        <td>
          {editing ? (
            <input
              className="cell-input"
              aria-label={`Units for ${resourceLabel}`}
              inputMode="decimal"
              value={unitsDraft}
              autoFocus
              onChange={(e) => setUnitsDraft(e.target.value)}
              onKeyDown={onKeyDown}
            />
          ) : (
            <button type="button" className="cell-edit-trigger" onClick={beginEdit}>
              {formatUnits(row.units)}
            </button>
          )}
        </td>
        <td>
          {editing ? (
            <input
              className="cell-input"
              aria-label={`Work minutes for ${resourceLabel}`}
              inputMode="numeric"
              value={workDraft}
              onChange={(e) => setWorkDraft(e.target.value)}
              onKeyDown={onKeyDown}
            />
          ) : (
            <button type="button" className="cell-edit-trigger mono" onClick={beginEdit}>
              {row.workMinutes ?? '—'}
            </button>
          )}
        </td>
        <td>
          {editing ? (
            <input
              className="cell-input"
              aria-label={`Cost for ${resourceLabel}`}
              inputMode="decimal"
              value={costDraft}
              onChange={(e) => setCostDraft(e.target.value)}
              onKeyDown={onKeyDown}
            />
          ) : (
            <button type="button" className="cell-edit-trigger mono" onClick={beginEdit}>
              {row.cost ?? '—'}
            </button>
          )}
        </td>
        <td>
          <div className="role-actions">
            {editing ? (
              <>
                <button type="button" className="btn-compact" onClick={commit} disabled={pending}>
                  Save
                </button>
                <button type="button" className="btn-link" onClick={cancelEdit} disabled={pending}>
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" className="btn-compact" onClick={beginEdit}>
                Edit
              </button>
            )}
            <button
              type="button"
              className="btn-link"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Hide distribution' : 'View distribution'}
            </button>
            <button
              type="button"
              className="btn-link btn-danger-link"
              disabled={pending}
              onClick={onRemove}
            >
              Remove
            </button>
          </div>
          {formError ? (
            <p className="form-error assignment-row-error" role="alert">
              {formError}
            </p>
          ) : null}
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

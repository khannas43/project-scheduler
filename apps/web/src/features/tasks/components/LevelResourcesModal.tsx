import { useEffect, useMemo, useState } from 'react';

import { useLevelResources, useUndoLevelResources } from '../hooks/useLevelResources.js';
import type { LevelingMove, LevelProjectResult } from '../api.js';

type TaskScope = 'all' | 'selected';

interface LevelResourcesModalProps {
  readonly projectId: string;
  readonly resourceIds?: readonly string[];
  readonly onClose: () => void;
  readonly onApplied: () => void;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function moveTooltip(m: LevelingMove): string {
  return [
    `After leveling, “${m.taskName}” starts later so ${m.resourceName} is less overloaded.`,
    `Start moves from ${formatWhen(m.fromStart)} → ${formatWhen(m.toStart)} (${m.delayMinutes} min delay).`,
    'Uses a Start-No-Earlier-Than (SNET) constraint within free float — project finish should not slip if float remains.',
    m.reason,
  ].join(' ');
}

function resourceSummaryTooltip(
  resourceName: string,
  moves: readonly LevelingMove[],
  stillOverloaded: boolean,
): string {
  const taskList = moves.map((m) => `“${m.taskName}” (+${m.delayMinutes}m)`).join('; ');
  const outcome = stillOverloaded
    ? 'Some overload may remain because not enough free float was available.'
    : 'This should clear day-level overload for this resource (within the preview heuristic).';
  return `Leveling will delay ${moves.length} task${moves.length === 1 ? '' : 's'} assigned to ${resourceName}: ${taskList}. ${outcome}`;
}

export function LevelResourcesModal({
  projectId,
  resourceIds,
  onClose,
  onApplied,
}: LevelResourcesModalProps) {
  const level = useLevelResources(projectId);
  const undo = useUndoLevelResources(projectId);
  const [preview, setPreview] = useState<LevelProjectResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [taskScope, setTaskScope] = useState<TaskScope>('all');
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [eligibleSeeded, setEligibleSeeded] = useState(false);

  const selectedKey = useMemo(
    () => [...selectedTaskIds].sort().join(','),
    [selectedTaskIds],
  );

  useEffect(() => {
    let cancelled = false;
    setError(null);

    if (taskScope === 'selected' && selectedTaskIds.size === 0) {
      setPreview((prev) =>
        prev
          ? {
              ...prev,
              dryRun: true,
              moves: [],
              remainingOverallocations: prev.remainingOverallocations,
            }
          : prev,
      );
      return;
    }

    const input = {
      dryRun: true as const,
      withinFloat: 'free' as const,
      ...(resourceIds && resourceIds.length > 0 ? { resourceIds } : {}),
      ...(taskScope === 'selected' ? { taskIds: [...selectedTaskIds] } : {}),
    };
    void level
      .mutateAsync(input)
      .then((result) => {
        if (cancelled) return;
        setPreview(result);
        const eligible = result.eligibleTasks ?? [];
        if (!eligibleSeeded && eligible.length > 0) {
          setSelectedTaskIds(new Set(eligible.map((t) => t.taskId)));
          setEligibleSeeded(true);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not preview leveling');
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, resourceIds?.join(','), taskScope, selectedKey]);

  const eligibleTasks = preview?.eligibleTasks ?? [];

  const movesByResource = useMemo(() => {
    const map = new Map<string, { name: string; moves: LevelingMove[] }>();
    for (const m of preview?.moves ?? []) {
      const entry = map.get(m.resourceId) ?? { name: m.resourceName, moves: [] };
      entry.moves.push(m);
      map.set(m.resourceId, entry);
    }
    return [...map.entries()].map(([id, value]) => ({ resourceId: id, ...value }));
  }, [preview?.moves]);

  const remainingIds = useMemo(
    () => new Set((preview?.remainingOverallocations ?? []).map((r) => r.resourceId)),
    [preview?.remainingOverallocations],
  );

  function toggleTask(taskId: string) {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function selectAllEligible() {
    setSelectedTaskIds(new Set(eligibleTasks.map((t) => t.taskId)));
  }

  function clearEligible() {
    setSelectedTaskIds(new Set());
  }

  async function onApply() {
    setError(null);
    if (taskScope === 'selected' && selectedTaskIds.size === 0) {
      setError('Select at least one task to level.');
      return;
    }
    try {
      const result = await level.mutateAsync({
        dryRun: false,
        withinFloat: 'free',
        ...(resourceIds && resourceIds.length > 0 ? { resourceIds } : {}),
        ...(taskScope === 'selected' ? { taskIds: [...selectedTaskIds] } : {}),
      });
      setPreview(result);
      onApplied();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply leveling');
    }
  }

  async function onUndo() {
    setError(null);
    try {
      await undo.mutateAsync();
      onApplied();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not undo leveling');
    }
  }

  const pending = level.isPending || undo.isPending;
  const moves = preview?.moves ?? [];
  const remaining = preview?.remainingOverallocations ?? [];
  const canUndo = preview?.canUndo === true;
  const applyDisabled =
    pending ||
    !preview ||
    moves.length === 0 ||
    (taskScope === 'selected' && selectedTaskIds.size === 0);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal level-resources-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="level-resources-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="level-resources-title">Level resources</h2>
        <p className="muted">
          Resource leveling finds days where a person/equipment is booked over capacity, then
          delays non-critical tasks (within free float) so those days clear. Hover a resource or
          row for what will change.
          {resourceIds && resourceIds.length > 0 ? ' Scoped to the selected resource.' : null}
        </p>

        <fieldset className="level-task-scope">
          <legend>Tasks to level</legend>
          <label className="level-scope-option">
            <input
              type="radio"
              name="level-task-scope"
              value="all"
              checked={taskScope === 'all'}
              onChange={() => setTaskScope('all')}
              disabled={pending}
            />
            All eligible tasks
          </label>
          <label className="level-scope-option">
            <input
              type="radio"
              name="level-task-scope"
              value="selected"
              checked={taskScope === 'selected'}
              onChange={() => setTaskScope('selected')}
              disabled={pending}
              data-testid="level-scope-selected"
            />
            Selected tasks only
          </label>
        </fieldset>

        {taskScope === 'selected' ? (
          <div className="level-task-picker">
            <div className="level-task-picker-toolbar">
              <span className="muted">
                {selectedTaskIds.size} of {eligibleTasks.length} eligible selected
              </span>
              <div className="level-task-picker-actions">
                <button
                  type="button"
                  className="btn-link"
                  onClick={selectAllEligible}
                  disabled={pending || eligibleTasks.length === 0}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="btn-link"
                  onClick={clearEligible}
                  disabled={pending || selectedTaskIds.size === 0}
                >
                  Clear
                </button>
              </div>
            </div>
            {eligibleTasks.length === 0 ? (
              <p className="muted">No eligible tasks (need non-critical work with free float).</p>
            ) : (
              <ul className="level-task-checklist" aria-label="Tasks that may be delayed">
                {eligibleTasks.map((t) => (
                  <li key={t.taskId}>
                    <label className="level-task-check">
                      <input
                        type="checkbox"
                        checked={selectedTaskIds.has(t.taskId)}
                        onChange={() => toggleTask(t.taskId)}
                        disabled={pending}
                      />
                      <span className="level-task-check-label">
                        <strong>{t.taskName}</strong>
                        {t.resourceNames.length > 0 ? (
                          <span className="muted"> · {t.resourceNames.join(', ')}</span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <p className="muted level-task-picker-hint">
              Unselected tasks still count toward resource load; only checked tasks may be delayed.
            </p>
          </div>
        ) : null}

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        {!preview && !error ? <p className="muted">Analyzing schedule…</p> : null}

        {preview && moves.length === 0 && !(taskScope === 'selected' && selectedTaskIds.size === 0) ? (
          <p className="muted">
            No safe moves found — either clear already, or only critical work is overloaded.
          </p>
        ) : null}

        {taskScope === 'selected' && selectedTaskIds.size === 0 && preview ? (
          <p className="muted">Select one or more tasks to preview leveling moves.</p>
        ) : null}

        {movesByResource.length > 0 ? (
          <ul className="level-resource-chips" aria-label="Resources affected">
            {movesByResource.map((group) => (
              <li key={group.resourceId}>
                <span
                  className="level-resource-chip"
                  title={resourceSummaryTooltip(
                    group.name,
                    group.moves,
                    remainingIds.has(group.resourceId),
                  )}
                >
                  <strong>{group.name}</strong>
                  <span className="muted">
                    {group.moves.length} move{group.moves.length === 1 ? '' : 's'}
                    {remainingIds.has(group.resourceId) ? ' · may remain over' : ' · clears overload'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {moves.length > 0 ? (
          <div className="table-wrap level-moves-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Resource</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Delay</th>
                </tr>
              </thead>
              <tbody>
                {moves.map((m) => (
                  <tr key={`${m.taskId}-${m.toStart}`} title={moveTooltip(m)}>
                    <td title={moveTooltip(m)}>{m.taskName}</td>
                    <td
                      title={resourceSummaryTooltip(
                        m.resourceName,
                        movesByResource.find((g) => g.resourceId === m.resourceId)?.moves ?? [m],
                        remainingIds.has(m.resourceId),
                      )}
                    >
                      <span className="level-resource-name">{m.resourceName}</span>
                    </td>
                    <td className="mono">{formatWhen(m.fromStart)}</td>
                    <td className="mono">{formatWhen(m.toStart)}</td>
                    <td className="mono">{m.delayMinutes}m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {preview && remaining.length > 0 ? (
          <p className="muted">
            After these moves, still overloaded:{' '}
            {remaining.map((r) => r.resourceName).join(', ')} (not enough float).
          </p>
        ) : null}

        <div className="form-actions level-resources-actions">
          <button
            type="button"
            className="btn-secondary level-modal-btn-secondary"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </button>
          {canUndo ? (
            <button
              type="button"
              className="btn-secondary level-modal-btn-secondary"
              onClick={() => void onUndo()}
              disabled={pending}
              data-testid="level-undo"
            >
              Undo last level
            </button>
          ) : null}
          <button
            type="button"
            className="level-modal-btn-primary"
            onClick={() => void onApply()}
            disabled={applyDisabled}
          >
            {pending && level.isPending
              ? 'Working…'
              : `Apply ${moves.length} move${moves.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

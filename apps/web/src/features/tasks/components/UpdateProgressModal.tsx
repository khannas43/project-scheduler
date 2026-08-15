import { useEffect, useMemo, useState } from 'react';

import { dateInputToIso, toDateInputValue } from '../../projects/dateFormat.js';
import { useProgressUpdate } from '../hooks/useProgressUpdate.js';
import type { ProgressUpdateResult } from '../api.js';

type TaskScope = 'all' | 'selected';
type PercentMode = 'none' | 'as_scheduled' | 'set';

interface UpdateProgressModalProps {
  readonly projectId: string;
  readonly initialStatusDate: string | null;
  readonly onClose: () => void;
  readonly onApplied: () => void;
}

function todayInputValue(): string {
  return toDateInputValue(new Date().toISOString()) || '';
}

export function UpdateProgressModal({
  projectId,
  initialStatusDate,
  onClose,
  onApplied,
}: UpdateProgressModalProps) {
  const progress = useProgressUpdate(projectId);
  const [statusDateInput, setStatusDateInput] = useState(
    () => toDateInputValue(initialStatusDate) || todayInputValue(),
  );
  const [percentMode, setPercentMode] = useState<PercentMode>('as_scheduled');
  const [setPercentValue, setSetPercentValue] = useState('50');
  const [rescheduleIncomplete, setRescheduleIncomplete] = useState(false);
  const [taskScope, setTaskScope] = useState<TaskScope>('all');
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [eligibleSeeded, setEligibleSeeded] = useState(false);
  const [preview, setPreview] = useState<ProgressUpdateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedKey = useMemo(
    () => [...selectedTaskIds].sort().join(','),
    [selectedTaskIds],
  );

  const statusDateIso = useMemo(() => dateInputToIso(statusDateInput), [statusDateInput]);

  const parsedSetPercent = useMemo(() => {
    const n = Number(setPercentValue);
    if (!Number.isFinite(n)) return null;
    if (n < 0 || n > 100) return null;
    return Math.round(n * 100) / 100;
  }, [setPercentValue]);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    if (!statusDateIso) {
      setPreview(null);
      return;
    }

    if (percentMode === 'set' && parsedSetPercent === null) {
      setPreview(null);
      return;
    }

    if (taskScope === 'selected' && selectedTaskIds.size === 0) {
      setPreview((prev) =>
        prev
          ? { ...prev, dryRun: true, percentChanges: [], rescheduleChanges: [] }
          : prev,
      );
      return;
    }

    void progress
      .mutateAsync({
        dryRun: true,
        statusDate: statusDateIso,
        updateAsScheduled: percentMode === 'as_scheduled',
        rescheduleIncomplete,
        ...(percentMode === 'set' && parsedSetPercent !== null
          ? { setPercentComplete: parsedSetPercent }
          : {}),
        ...(taskScope === 'selected' ? { taskIds: [...selectedTaskIds] } : {}),
      })
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
          setError(err instanceof Error ? err.message : 'Could not preview progress update');
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    projectId,
    statusDateIso,
    percentMode,
    parsedSetPercent,
    rescheduleIncomplete,
    taskScope,
    selectedKey,
  ]);

  const eligibleTasks = preview?.eligibleTasks ?? [];
  const percentChanges = preview?.percentChanges ?? [];
  const rescheduleChanges = preview?.rescheduleChanges ?? [];
  const changeCount = percentChanges.length + rescheduleChanges.length;
  const pending = progress.isPending;

  function toggleTask(taskId: string) {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  async function onApply() {
    setError(null);
    if (!statusDateIso) {
      setError('Choose a status date.');
      return;
    }
    if (percentMode === 'set' && parsedSetPercent === null) {
      setError('Enter a % between 0 and 100.');
      return;
    }
    if (taskScope === 'selected' && selectedTaskIds.size === 0) {
      setError('Select at least one task.');
      return;
    }
    try {
      await progress.mutateAsync({
        dryRun: false,
        statusDate: statusDateIso,
        updateAsScheduled: percentMode === 'as_scheduled',
        rescheduleIncomplete,
        ...(percentMode === 'set' && parsedSetPercent !== null
          ? { setPercentComplete: parsedSetPercent }
          : {}),
        ...(taskScope === 'selected' ? { taskIds: [...selectedTaskIds] } : {}),
      });
      onApplied();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply progress update');
    }
  }

  const applyDisabled =
    pending ||
    !statusDateIso ||
    (percentMode === 'set' && parsedSetPercent === null) ||
    (taskScope === 'selected' && selectedTaskIds.size === 0) ||
    !preview;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal update-progress-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-progress-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="update-progress-title">Update progress</h2>
        <p className="muted">
          Set the project status date, then update % complete on leaf tasks and/or push incomplete
          work after that date. You can also edit % Complete directly in the schedule grid.
        </p>

        <label className="field">
          Status date
          <input
            type="date"
            value={statusDateInput}
            onChange={(e) => setStatusDateInput(e.target.value)}
            disabled={pending}
            data-testid="progress-status-date"
          />
        </label>

        <fieldset className="level-task-scope">
          <legend>% Complete</legend>
          <label className="level-scope-option">
            <input
              type="radio"
              name="progress-percent-mode"
              checked={percentMode === 'none'}
              onChange={() => setPercentMode('none')}
              disabled={pending}
            />
            Do not change %
          </label>
          <label className="level-scope-option">
            <input
              type="radio"
              name="progress-percent-mode"
              checked={percentMode === 'as_scheduled'}
              onChange={() => setPercentMode('as_scheduled')}
              disabled={pending}
            />
            Update as scheduled (through status date)
          </label>
          <label className="level-scope-option level-scope-option-inline">
            <input
              type="radio"
              name="progress-percent-mode"
              checked={percentMode === 'set'}
              onChange={() => setPercentMode('set')}
              disabled={pending}
              data-testid="progress-percent-set"
            />
            Set to
            <input
              type="number"
              className="progress-percent-input"
              min={0}
              max={100}
              step={1}
              value={setPercentValue}
              onChange={(e) => {
                setSetPercentValue(e.target.value);
                setPercentMode('set');
              }}
              disabled={pending}
              aria-label="Percent complete value"
              data-testid="progress-percent-value"
            />
            %
          </label>
          <label className="level-scope-option">
            <input
              type="checkbox"
              checked={rescheduleIncomplete}
              onChange={(e) => setRescheduleIncomplete(e.target.checked)}
              disabled={pending}
              data-testid="progress-reschedule-incomplete"
            />
            Reschedule incomplete work after status date
          </label>
        </fieldset>

        <fieldset className="level-task-scope">
          <legend>Tasks</legend>
          <label className="level-scope-option">
            <input
              type="radio"
              name="progress-task-scope"
              checked={taskScope === 'all'}
              onChange={() => setTaskScope('all')}
              disabled={pending}
            />
            All leaf tasks
          </label>
          <label className="level-scope-option">
            <input
              type="radio"
              name="progress-task-scope"
              checked={taskScope === 'selected'}
              onChange={() => setTaskScope('selected')}
              disabled={pending}
              data-testid="progress-scope-selected"
            />
            Selected tasks only
          </label>
        </fieldset>

        {taskScope === 'selected' ? (
          <div className="level-task-picker">
            <div className="level-task-picker-toolbar">
              <span className="muted">
                {selectedTaskIds.size} of {eligibleTasks.length} selected
              </span>
              <div className="level-task-picker-actions">
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => setSelectedTaskIds(new Set(eligibleTasks.map((t) => t.taskId)))}
                  disabled={pending || eligibleTasks.length === 0}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => setSelectedTaskIds(new Set())}
                  disabled={pending || selectedTaskIds.size === 0}
                >
                  Clear
                </button>
              </div>
            </div>
            {eligibleTasks.length === 0 ? (
              <p className="muted">No leaf tasks.</p>
            ) : (
              <ul className="level-task-checklist" aria-label="Tasks to update">
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
                        <span className="muted"> · {t.percentComplete}%</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        {!preview && !error && statusDateIso ? <p className="muted">Analyzing…</p> : null}

        {preview && changeCount === 0 ? (
          <p className="muted">
            No task changes for these options — applying will still save the status date.
          </p>
        ) : null}

        {percentChanges.length > 0 ? (
          <div className="table-wrap level-moves-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>From %</th>
                  <th>To %</th>
                </tr>
              </thead>
              <tbody>
                {percentChanges.map((c) => (
                  <tr key={`pct-${c.taskId}`} title={c.reason}>
                    <td>{c.taskName}</td>
                    <td className="mono">{c.fromPercent}</td>
                    <td className="mono">{c.toPercent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {rescheduleChanges.length > 0 ? (
          <div className="table-wrap level-moves-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Reschedule task</th>
                  <th>New start (SNET)</th>
                </tr>
              </thead>
              <tbody>
                {rescheduleChanges.map((c) => (
                  <tr key={`res-${c.taskId}`} title={c.reason}>
                    <td>{c.taskName}</td>
                    <td className="mono">{new Date(c.toStart).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
          <button
            type="button"
            className="level-modal-btn-primary"
            onClick={() => void onApply()}
            disabled={applyDisabled}
            data-testid="progress-apply"
          >
            {pending
              ? 'Working…'
              : changeCount > 0
                ? `Apply ${changeCount} change${changeCount === 1 ? '' : 's'}`
                : 'Save status date'}
          </button>
        </div>
      </div>
    </div>
  );
}

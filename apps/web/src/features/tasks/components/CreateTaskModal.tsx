import { useState, type FormEvent } from 'react';

import type { TaskRow } from '../types.js';

const WORKING_MINUTES_PER_DAY = 480;
const WBS_RE = /^\d+(\.\d+)*$/;

export type CreateTaskDraft = {
  readonly name: string;
  readonly parentId: string | null;
  readonly placeAtWbs: string;
  readonly isSummary: boolean;
  readonly isMilestone: boolean;
  readonly durationMinutes: number | null;
};

export interface CreateTaskModalProps {
  readonly parent: TaskRow | null;
  /** Suggested outline code (e.g. next free `2.5`). Editable in the form. */
  readonly suggestedWbs: string;
  readonly isPending: boolean;
  readonly onSubmit: (draft: CreateTaskDraft) => void | Promise<void>;
  readonly onClose: () => void;
}

/** Next free WBS under `parent`, or next root code when parent is null. */
export function suggestWbsCode(tasks: readonly TaskRow[], parent: TaskRow | null): string {
  if (parent) {
    const count = tasks.filter((t) => t.parentId === parent.id).length;
    const base = parent.wbsCode ?? parent.wbsPath;
    if (!base) return String(count + 1);
    return `${base}.${count + 1}`;
  }
  const roots = tasks.filter((t) => t.parentId === null).length;
  return String(roots + 1);
}

export function CreateTaskModal({
  parent,
  suggestedWbs,
  isPending,
  onSubmit,
  onClose,
}: CreateTaskModalProps) {
  const isSubtask = parent !== null;
  const [name, setName] = useState('');
  const [wbsCode, setWbsCode] = useState(suggestedWbs);
  const [durationDays, setDurationDays] = useState('1');
  const [isSummary, setIsSummary] = useState(false);
  const [isMilestone, setIsMilestone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required');
      return;
    }

    const placeAtWbs = wbsCode.trim();
    if (!WBS_RE.test(placeAtWbs)) {
      setError('WBS must look like 2.5 or 2.5.1');
      return;
    }

    // When opened as “Add subtask”, keep the typed code under that parent’s prefix.
    if (parent?.wbsCode) {
      const prefix = parent.wbsCode;
      if (placeAtWbs !== prefix && !placeAtWbs.startsWith(`${prefix}.`)) {
        setError(`WBS must be under ${prefix} (e.g. ${prefix}.1 or ${prefix}.5)`);
        return;
      }
      if (placeAtWbs === prefix) {
        setError(`Use a child code under ${prefix}, e.g. ${prefix}.1`);
        return;
      }
    }

    let durationMinutes: number | null = null;
    if (!isSummary && !isMilestone) {
      const days = Number(durationDays);
      if (!Number.isFinite(days) || days < 0) {
        setError('Duration must be a non-negative number of days');
        return;
      }
      durationMinutes = Math.round(days * WORKING_MINUTES_PER_DAY);
    } else if (isMilestone) {
      durationMinutes = 0;
    }

    setError(null);
    await onSubmit({
      name: trimmed,
      parentId: parent?.id ?? null,
      placeAtWbs,
      isSummary,
      isMilestone: isSummary ? false : isMilestone,
      durationMinutes,
    });
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal create-task-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-task-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="assignment-panel-header">
          <div>
            <h2 id="create-task-title">{isSubtask ? 'Add subtask' : 'Add task'}</h2>
            {parent ? (
              <p className="muted">
                Under <strong>{parent.name}</strong>
                {parent.wbsCode ? (
                  <>
                    {' '}
                    (<span className="mono">{parent.wbsCode}</span>)
                  </>
                ) : null}
              </p>
            ) : (
              <p className="muted">
                Set the WBS code to insert at a position (e.g. <span className="mono">2.5</span> or{' '}
                <span className="mono">2.5.1</span>). Later siblings are renumbered.
              </p>
            )}
          </div>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={isPending}>
            Close
          </button>
        </header>

        <form className="create-task-form" onSubmit={(e) => void handleSubmit(e)}>
          <label className="field">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder={isSubtask ? 'Subtask name' : 'Task name'}
              disabled={isPending}
            />
          </label>

          <label className="field">
            WBS code
            <input
              className="mono"
              value={wbsCode}
              onChange={(e) => setWbsCode(e.target.value)}
              placeholder="e.g. 2.5 or 2.5.1"
              disabled={isPending}
              aria-describedby="wbs-hint"
            />
          </label>
          <p id="wbs-hint" className="muted field-hint">
            Inserts at this outline position. Example: <span className="mono">2.5</span> becomes the
            5th child of <span className="mono">2</span>; existing <span className="mono">2.5+</span>{' '}
            shift down.
          </p>

          <label className="field checkbox-field">
            <input
              type="checkbox"
              checked={isSummary}
              onChange={(e) => {
                const next = e.target.checked;
                setIsSummary(next);
                if (next) setIsMilestone(false);
              }}
              disabled={isPending}
            />
            Summary group (container for subtasks)
          </label>

          {!isSummary ? (
            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={isMilestone}
                onChange={(e) => setIsMilestone(e.target.checked)}
                disabled={isPending}
              />
              Milestone (zero duration)
            </label>
          ) : null}

          {!isSummary && !isMilestone ? (
            <label className="field">
              Duration (days)
              <input
                type="number"
                min="0"
                step="0.5"
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                disabled={isPending}
              />
            </label>
          ) : null}

          {error ? <p className="form-error">{error}</p> : null}

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isPending}>
              Cancel
            </button>
            <button type="submit" disabled={isPending}>
              {isPending ? 'Adding…' : isSubtask ? 'Add subtask' : 'Add task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

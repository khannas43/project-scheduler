import { useEffect, useState, type FormEvent } from 'react';

import {
  useCreateBoardColumn,
  useDeleteBoardColumn,
  useUpdateBoardColumn,
} from '../hooks/useBoard.js';
import type { BoardColumnRow } from '../types.js';

export interface ManageColumnsModalProps {
  readonly projectId: string;
  readonly columns: readonly BoardColumnRow[];
  readonly onClose: () => void;
}

function draftsFromColumns(
  columns: readonly BoardColumnRow[],
): Record<string, { name: string; wipLimit: string }> {
  return Object.fromEntries(
    columns.map((c) => [
      c.id,
      { name: c.name, wipLimit: c.wipLimit === null ? '' : String(c.wipLimit) },
    ]),
  );
}

export function ManageColumnsModal({ projectId, columns, onClose }: ManageColumnsModalProps) {
  const createColumn = useCreateBoardColumn(projectId);
  const updateColumn = useUpdateBoardColumn(projectId);
  const deleteColumn = useDeleteBoardColumn(projectId);

  const [newName, setNewName] = useState('');
  const [newWip, setNewWip] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState(() => draftsFromColumns(columns));

  useEffect(() => {
    setDrafts((prev) => {
      const next = draftsFromColumns(columns);
      for (const id of Object.keys(next)) {
        if (prev[id]) next[id] = prev[id]!;
      }
      return next;
    });
  }, [columns]);

  const busy =
    createColumn.isPending || updateColumn.isPending || deleteColumn.isPending;

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) {
      setCreateError('Name is required');
      return;
    }
    let wipLimit: number | null = null;
    if (newWip.trim()) {
      const n = Number(newWip);
      if (!Number.isInteger(n) || n < 1) {
        setCreateError('WIP limit must be a positive integer');
        return;
      }
      wipLimit = n;
    }
    setCreateError(null);
    const sortOrder =
      columns.length === 0 ? 0 : Math.max(...columns.map((c) => c.sortOrder)) + 1;
    await createColumn.mutateAsync({ name, sortOrder, wipLimit });
    setNewName('');
    setNewWip('');
  }

  async function handleSave(column: BoardColumnRow) {
    const draft = drafts[column.id] ?? { name: column.name, wipLimit: '' };
    const name = draft.name.trim();
    if (!name) return;

    let wipLimit: number | null = null;
    if (draft.wipLimit.trim()) {
      const n = Number(draft.wipLimit);
      if (!Number.isInteger(n) || n < 1) return;
      wipLimit = n;
    }

    await updateColumn.mutateAsync({
      columnId: column.id,
      input: { version: column.version, name, wipLimit },
    });
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal manage-columns-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-columns-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="assignment-panel-header">
          <div>
            <h2 id="manage-columns-title">Manage columns</h2>
            <p className="muted">Create, rename, set WIP limits, or delete board columns.</p>
          </div>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Close
          </button>
        </header>

        <ul className="manage-columns-list">
          {columns.map((column) => {
            const draft = drafts[column.id] ?? {
              name: column.name,
              wipLimit: column.wipLimit === null ? '' : String(column.wipLimit),
            };
            return (
              <li key={column.id} className="manage-columns-row">
                <label className="field">
                  Name
                  <input
                    value={draft.name}
                    disabled={busy}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [column.id]: { ...draft, name: e.target.value },
                      }))
                    }
                  />
                </label>
                <label className="field">
                  WIP limit
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="None"
                    value={draft.wipLimit}
                    disabled={busy}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [column.id]: { ...draft, wipLimit: e.target.value },
                      }))
                    }
                  />
                </label>
                <div className="form-actions">
                  <button
                    type="button"
                    className="btn-secondary btn-compact"
                    disabled={busy}
                    onClick={() => void handleSave(column)}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="btn-link btn-danger-link"
                    disabled={busy}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Delete column “${column.name}”? Tasks in it become unassigned.`,
                        )
                      ) {
                        return;
                      }
                      void deleteColumn.mutateAsync(column.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <form className="create-task-form" onSubmit={(e) => void handleCreate(e)}>
          <h3>Add column</h3>
          <label className="field">
            Name
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. In progress"
              disabled={busy}
            />
          </label>
          <label className="field">
            WIP limit (optional)
            <input
              type="number"
              min="1"
              step="1"
              value={newWip}
              onChange={(e) => setNewWip(e.target.value)}
              placeholder="None"
              disabled={busy}
            />
          </label>
          {createError ? <p className="form-error">{createError}</p> : null}
          <div className="form-actions">
            <button type="submit" disabled={busy}>
              {createColumn.isPending ? 'Adding…' : 'Add column'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

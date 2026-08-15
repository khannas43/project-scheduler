import { type FormEvent, useState } from 'react';

import * as projectsApi from '../api.js';
import { useImportSpreadsheetIntoProject } from '../hooks/useProjects.js';
import type { SpreadsheetImportMode } from '../api.js';

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

interface ImportSpreadsheetModalProps {
  readonly projectId: string;
  readonly projectName: string;
  readonly onClose: () => void;
  readonly onImported: (result: projectsApi.ImportSpreadsheetIntoProjectResult) => void;
}

export function ImportSpreadsheetModal({
  projectId,
  projectName,
  onClose,
  onImported,
}: ImportSpreadsheetModalProps) {
  const importMutation = useImportSpreadsheetIntoProject(projectId);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<SpreadsheetImportMode>('merge');
  const [templateBusy, setTemplateBusy] = useState<'csv' | 'xlsx' | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const pending = importMutation.isPending;
  const error =
    localError ??
    (importMutation.error instanceof Error ? importMutation.error.message : null);

  async function downloadTemplate(format: 'csv' | 'xlsx') {
    setLocalError(null);
    setTemplateBusy(format);
    try {
      await projectsApi.downloadImportTemplate(format);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Could not download template');
    } finally {
      setTemplateBusy(null);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    if (!file) {
      setLocalError('Choose a .csv or .xlsx file.');
      return;
    }
    if (mode === 'replace') {
      if (
        !window.confirm(
          `Replace all tasks in “${projectName}” with this file? Existing tasks, links, and assignments will be removed.`,
        )
      ) {
        return;
      }
    }
    try {
      const contentBase64 = await fileToBase64(file);
      const result = await importMutation.mutateAsync({
        filename: file.name,
        contentBase64,
        mode,
      });
      onImported(result);
      onClose();
    } catch {
      // Banner / mutation error
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal import-spreadsheet-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-spreadsheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={(e) => void onSubmit(e)}>
          <h2 id="import-spreadsheet-title">Import Excel / CSV</h2>
          <p className="muted">
            Add tasks from a spreadsheet into <strong>{projectName}</strong>. Use the same
            template as “New project from spreadsheet”.
          </p>

          <div className="create-template-row">
            <button
              type="button"
              className="btn-link"
              disabled={pending || templateBusy !== null}
              onClick={() => void downloadTemplate('xlsx')}
            >
              {templateBusy === 'xlsx' ? 'Downloading…' : 'Download Excel template'}
            </button>
            <button
              type="button"
              className="btn-link"
              disabled={pending || templateBusy !== null}
              onClick={() => void downloadTemplate('csv')}
            >
              {templateBusy === 'csv' ? 'Downloading…' : 'Download CSV template'}
            </button>
          </div>

          <fieldset className="level-task-scope">
            <legend>Import mode</legend>
            <label className="level-scope-option">
              <input
                type="radio"
                name="import-mode"
                checked={mode === 'merge'}
                onChange={() => setMode('merge')}
                disabled={pending}
              />
              Merge — append tasks (keep existing plan)
            </label>
            <label className="level-scope-option">
              <input
                type="radio"
                name="import-mode"
                checked={mode === 'replace'}
                onChange={() => setMode('replace')}
                disabled={pending}
                data-testid="import-mode-replace"
              />
              Replace — delete current tasks, then import
            </label>
          </fieldset>

          <label className="field">
            File
            <input
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={pending}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              data-testid="import-spreadsheet-file"
            />
          </label>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={pending}>
              Cancel
            </button>
            <button type="submit" disabled={pending || !file} data-testid="import-spreadsheet-apply">
              {pending ? 'Importing…' : mode === 'replace' ? 'Replace tasks' : 'Merge tasks'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

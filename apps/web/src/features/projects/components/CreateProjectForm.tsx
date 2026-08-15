import { useMemo, useState, type FormEvent } from 'react';

import * as projectsApi from '../api.js';
import { dateInputToIso } from '../dateFormat.js';
import {
  useCreateProject,
  useCreateProjectFromSpreadsheet,
  useCreateProjectFromTemplate,
  useProjectTemplates,
} from '../hooks/useProjects.js';

interface CreateProjectFormProps {
  onCancel: () => void;
}

type CreateMode = 'blank' | 'template' | 'spreadsheet';

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

export function CreateProjectForm({ onCancel }: CreateProjectFormProps) {
  const create = useCreateProject();
  const createFromFile = useCreateProjectFromSpreadsheet();
  const createFromTemplate = useCreateProjectFromTemplate();
  const templatesQuery = useProjectTemplates();
  const [mode, setMode] = useState<CreateMode>('blank');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('active');
  const [startDate, setStartDate] = useState('');
  const [categoryKey, setCategoryKey] = useState('');
  const [templateKey, setTemplateKey] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [templateBusy, setTemplateBusy] = useState<'csv' | 'xlsx' | null>(null);

  const pending = create.isPending || createFromFile.isPending || createFromTemplate.isPending;
  const mutationError =
    mode === 'spreadsheet' ? createFromFile.error : mode === 'template' ? createFromTemplate.error : create.error;
  const error =
    formError ??
    (mutationError instanceof Error
      ? mutationError.message
      : mutationError
        ? String(mutationError)
        : null);

  const categories = templatesQuery.data?.categories ?? [];
  const templates = templatesQuery.data?.templates ?? [];
  const templatesInCategory = useMemo(
    () => (categoryKey === '' ? templates : templates.filter((t) => t.categoryKey === categoryKey)),
    [categoryKey, templates],
  );
  const selectedTemplate = templates.find((t) => t.key === templateKey) ?? null;

  async function downloadTemplate(format: 'csv' | 'xlsx') {
    setTemplateError(null);
    setTemplateBusy(format);
    try {
      await projectsApi.downloadImportTemplate(format);
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : 'Could not download template');
    } finally {
      setTemplateBusy(null);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError('Name is required');
      return;
    }

    const payload = {
      name: trimmed,
      description: description.trim() === '' ? null : description,
      status,
      startDate: startDate === '' ? null : dateInputToIso(startDate),
    };

    try {
      if (mode === 'blank') {
        await create.mutateAsync(payload);
        return;
      }

      if (mode === 'template') {
        if (!templateKey) {
          setFormError('Choose a project template.');
          return;
        }
        await createFromTemplate.mutateAsync({ ...payload, templateKey });
        return;
      }

      if (!file) {
        setFormError('Choose a .csv or .xlsx file.');
        return;
      }
      const lower = file.name.toLowerCase();
      if (!lower.endsWith('.csv') && !lower.endsWith('.xlsx')) {
        setFormError('Unsupported file type — use .csv or .xlsx');
        return;
      }
      const contentBase64 = await fileToBase64(file);
      await createFromFile.mutateAsync({
        ...payload,
        filename: file.name,
        contentBase64,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create project');
    }
  }

  return (
    <form className="create-project-form" onSubmit={(e) => void onSubmit(e)}>
      <h2>New project</h2>

      <fieldset className="create-mode">
        <legend>How do you want to start?</legend>
        <label className="create-mode-option">
          <input
            type="radio"
            name="createMode"
            checked={mode === 'blank'}
            onChange={() => setMode('blank')}
          />
          Blank project
        </label>
        <label className="create-mode-option">
          <input
            type="radio"
            name="createMode"
            checked={mode === 'template'}
            onChange={() => setMode('template')}
          />
          From template
        </label>
        <label className="create-mode-option">
          <input
            type="radio"
            name="createMode"
            checked={mode === 'spreadsheet'}
            onChange={() => setMode('spreadsheet')}
          />
          From Excel / CSV
        </label>
      </fieldset>

      {mode === 'template' ? (
        <div className="import-panel">
          <p className="muted">
            Pick a category, then a starter WBS. Tasks, milestones, and dependencies are copied in;
            you can edit the plan after create.
          </p>
          {templatesQuery.isLoading ? <p className="muted">Loading templates…</p> : null}
          {templatesQuery.isError ? (
            <p className="form-error" role="alert">
              {templatesQuery.error instanceof Error
                ? templatesQuery.error.message
                : 'Could not load templates'}
            </p>
          ) : null}
          <label>
            Category
            <select
              value={categoryKey}
              onChange={(e) => {
                setCategoryKey(e.target.value);
                setTemplateKey('');
              }}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Template
            <select value={templateKey} onChange={(e) => setTemplateKey(e.target.value)} required>
              <option value="">Select a template</option>
              {templatesInCategory.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          {selectedTemplate ? (
            <p className="muted">
              {selectedTemplate.description} Typical duration: {selectedTemplate.durationHint}.
            </p>
          ) : null}
        </div>
      ) : null}

      {mode === 'spreadsheet' ? (
        <div className="import-panel">
          <p className="muted">
            Download a template, fill in tasks (IDs, durations, parents, predecessors), then upload
            the file to create the project schedule. To add tasks to an existing project, open that
            project and use <strong>Import</strong> on the Schedule toolbar.
          </p>
          <div className="template-actions">
            <button
              type="button"
              className="btn-secondary"
              disabled={templateBusy !== null || pending}
              onClick={() => void downloadTemplate('xlsx')}
            >
              {templateBusy === 'xlsx' ? 'Downloading…' : 'Excel template'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={templateBusy !== null || pending}
              onClick={() => void downloadTemplate('csv')}
            >
              {templateBusy === 'csv' ? 'Downloading…' : 'CSV template'}
            </button>
          </div>
          <label>
            Spreadsheet file
            <input
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              required={mode === 'spreadsheet'}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {file ? <p className="muted mono">{file.name}</p> : null}
          {templateError ? (
            <p className="form-error" role="alert">
              {templateError}
            </p>
          ) : null}
        </div>
      ) : null}

      <label>
        Name
        <input
          name="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </label>
      <label>
        Description
        <textarea
          name="description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label>
        Status
        <select name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">Active</option>
          <option value="planned">Planned</option>
          <option value="on_hold">On hold</option>
          <option value="completed">Completed</option>
        </select>
      </label>
      <label>
        Start date
        <input
          type="date"
          name="startDate"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </label>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={
            pending ||
            name.trim() === '' ||
            (mode === 'spreadsheet' && !file) ||
            (mode === 'template' && !templateKey)
          }
        >
          {pending
            ? 'Creating…'
            : mode === 'spreadsheet'
              ? 'Create from file'
              : mode === 'template'
                ? 'Create from template'
                : 'Create project'}
        </button>
      </div>
    </form>
  );
}

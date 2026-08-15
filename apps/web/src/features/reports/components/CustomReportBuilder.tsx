import {
  DEFAULT_SAVED_REPORT_COLUMNS,
  SAVED_REPORT_COLUMN_LABELS,
  type SavedReportColumn,
} from '@pkg/schema';
import { useMemo, useState } from 'react';

import { ApiError } from '../../../lib/apiClient.js';
import * as reportsApi from '../api.js';
import type {
  CustomReportRunResult,
  SavedReportDefinition,
  SavedReportFilters,
  SavedReportSummary,
} from '../api.js';
import {
  useCreateSavedReport,
  useDeleteSavedReport,
  useSavedReports,
  useUpdateSavedReport,
} from '../hooks/useSavedReports.js';

const ALL_COLUMNS = Object.keys(SAVED_REPORT_COLUMN_LABELS) as SavedReportColumn[];

function formatCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Date(value).toLocaleString();
  }
  return String(value);
}

interface CustomReportBuilderProps {
  readonly projectId: string;
}

export function CustomReportBuilder({ projectId }: CustomReportBuilderProps) {
  const savedQuery = useSavedReports(projectId);
  const createMutation = useCreateSavedReport(projectId);
  const updateMutation = useUpdateSavedReport(projectId);
  const deleteMutation = useDeleteSavedReport(projectId);

  const [selectedId, setSelectedId] = useState<string>('');
  const [name, setName] = useState('Critical path tasks');
  const [columns, setColumns] = useState<SavedReportColumn[]>([...DEFAULT_SAVED_REPORT_COLUMNS]);
  const [filters, setFilters] = useState<SavedReportFilters>({
    includeSummaries: false,
    isCritical: true,
  });
  const [sortColumn, setSortColumn] = useState<SavedReportColumn | ''>('earlyStart');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [preview, setPreview] = useState<CustomReportRunResult | null>(null);
  const [busy, setBusy] = useState<'preview' | 'save' | 'export' | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const definition: SavedReportDefinition = useMemo(
    () => ({
      columns,
      filters: {
        ...(filters.isCritical !== undefined ? { isCritical: filters.isCritical } : {}),
        ...(filters.isMilestone !== undefined ? { isMilestone: filters.isMilestone } : {}),
        ...(filters.includeSummaries !== undefined
          ? { includeSummaries: filters.includeSummaries }
          : {}),
        ...(filters.hasResources !== undefined ? { hasResources: filters.hasResources } : {}),
        ...(filters.minPercentComplete !== undefined
          ? { minPercentComplete: filters.minPercentComplete }
          : {}),
        ...(filters.maxPercentComplete !== undefined
          ? { maxPercentComplete: filters.maxPercentComplete }
          : {}),
      },
      ...(sortColumn
        ? { sort: { column: sortColumn, direction: sortDirection } }
        : {}),
    }),
    [columns, filters, sortColumn, sortDirection],
  );

  function loadSaved(report: SavedReportSummary) {
    setSelectedId(report.id);
    setName(report.name);
    setColumns([...report.definition.columns]);
    setFilters(report.definition.filters ?? {});
    setSortColumn(report.definition.sort?.column ?? '');
    setSortDirection(report.definition.sort?.direction ?? 'asc');
    setPreview(null);
    setLocalError(null);
  }

  function patchFilters(
    patch: Partial<SavedReportFilters>,
    clearKeys: readonly (keyof SavedReportFilters)[] = [],
  ) {
    setFilters((prev) => {
      const next: Record<string, unknown> = { ...prev, ...patch };
      for (const key of clearKeys) {
        delete next[key];
      }
      return next as SavedReportFilters;
    });
  }

  function toggleColumn(column: SavedReportColumn) {
    setColumns((prev) => {
      if (prev.includes(column)) {
        if (prev.length === 1) return prev;
        return prev.filter((c) => c !== column);
      }
      return [...prev, column];
    });
  }

  async function onPreview() {
    setLocalError(null);
    setBusy('preview');
    try {
      const result = await reportsApi.previewCustomReport(projectId, definition);
      setPreview(result);
    } catch (err) {
      setLocalError(err instanceof ApiError ? err.detail : 'Preview failed');
    } finally {
      setBusy(null);
    }
  }

  async function onSave() {
    setLocalError(null);
    if (!name.trim()) {
      setLocalError('Give the report a name before saving.');
      return;
    }
    setBusy('save');
    try {
      if (selectedId) {
        const updated = await updateMutation.mutateAsync({
          reportId: selectedId,
          name: name.trim(),
          definition,
        });
        loadSaved(updated);
      } else {
        const created = await createMutation.mutateAsync({
          name: name.trim(),
          definition,
        });
        loadSaved(created);
      }
      const result = await reportsApi.previewCustomReport(projectId, definition);
      setPreview(result);
    } catch (err) {
      setLocalError(err instanceof ApiError ? err.detail : 'Save failed');
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    if (!selectedId) return;
    if (!window.confirm(`Delete saved report “${name}”?`)) return;
    setLocalError(null);
    try {
      await deleteMutation.mutateAsync(selectedId);
      setSelectedId('');
      setPreview(null);
    } catch (err) {
      setLocalError(err instanceof ApiError ? err.detail : 'Delete failed');
    }
  }

  async function onExportCsv() {
    if (!selectedId) {
      setLocalError('Save the report first, then export CSV.');
      return;
    }
    setLocalError(null);
    setBusy('export');
    try {
      await reportsApi.downloadSavedReportCsv(projectId, selectedId, `${name || 'report'}.csv`);
    } catch (err) {
      setLocalError(err instanceof ApiError ? err.detail : 'Export failed');
    } finally {
      setBusy(null);
    }
  }

  function onNew() {
    setSelectedId('');
    setName('New custom report');
    setColumns([...DEFAULT_SAVED_REPORT_COLUMNS]);
    setFilters({ includeSummaries: true });
    setSortColumn('');
    setSortDirection('asc');
    setPreview(null);
    setLocalError(null);
  }

  const saved = savedQuery.data ?? [];

  return (
    <section className="custom-report-builder" aria-label="Custom report builder">
      <header className="custom-report-header">
        <div>
          <h2>Custom report</h2>
          <p className="muted">
            Pick columns and filters over the project task list, preview results, and save the
            definition for later.
          </p>
        </div>
        <div className="custom-report-actions">
          <button type="button" className="btn-secondary" onClick={onNew}>
            New
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy !== null || columns.length === 0}
            onClick={() => void onPreview()}
            data-testid="custom-report-preview"
          >
            {busy === 'preview' ? 'Running…' : 'Preview'}
          </button>
          <button
            type="button"
            disabled={busy !== null || columns.length === 0}
            onClick={() => void onSave()}
            data-testid="custom-report-save"
          >
            {busy === 'save' ? 'Saving…' : selectedId ? 'Update saved' : 'Save'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={!selectedId || busy !== null}
            onClick={() => void onExportCsv()}
            data-testid="custom-report-export-csv"
          >
            {busy === 'export' ? 'Exporting…' : 'CSV'}
          </button>
          {selectedId ? (
            <button
              type="button"
              className="btn-danger-link"
              disabled={deleteMutation.isPending}
              onClick={() => void onDelete()}
            >
              Delete
            </button>
          ) : null}
        </div>
      </header>

      <div className="custom-report-layout">
        <aside className="custom-report-saved" aria-label="Saved reports">
          <h3>Saved</h3>
          {savedQuery.isLoading ? <p className="muted">Loading…</p> : null}
          {saved.length === 0 && !savedQuery.isLoading ? (
            <p className="muted">No saved reports yet.</p>
          ) : null}
          <ul className="custom-report-saved-list">
            {saved.map((report) => (
              <li key={report.id}>
                <button
                  type="button"
                  className={
                    report.id === selectedId
                      ? 'custom-report-saved-item is-active'
                      : 'custom-report-saved-item'
                  }
                  onClick={() => loadSaved(report)}
                >
                  {report.name}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="custom-report-editor">
          <label className="field">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="custom-report-name"
            />
          </label>

          <fieldset className="custom-report-columns">
            <legend>Columns</legend>
            <div className="custom-report-column-grid">
              {ALL_COLUMNS.map((column) => (
                <label key={column} className="custom-report-check">
                  <input
                    type="checkbox"
                    checked={columns.includes(column)}
                    onChange={() => toggleColumn(column)}
                  />
                  {SAVED_REPORT_COLUMN_LABELS[column]}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="custom-report-filters">
            <legend>Filters</legend>
            <div className="custom-report-filter-grid">
              <label className="custom-report-check">
                <input
                  type="checkbox"
                  checked={filters.isCritical === true}
                  onChange={(e) =>
                    e.target.checked
                      ? patchFilters({ isCritical: true })
                      : patchFilters({}, ['isCritical'])
                  }
                />
                Critical only
              </label>
              <label className="custom-report-check">
                <input
                  type="checkbox"
                  checked={filters.isMilestone === true}
                  onChange={(e) =>
                    e.target.checked
                      ? patchFilters({ isMilestone: true })
                      : patchFilters({}, ['isMilestone'])
                  }
                />
                Milestones only
              </label>
              <label className="custom-report-check">
                <input
                  type="checkbox"
                  checked={filters.includeSummaries !== false}
                  onChange={(e) => patchFilters({ includeSummaries: e.target.checked })}
                />
                Include summaries
              </label>
              <label className="custom-report-check">
                <input
                  type="checkbox"
                  checked={filters.hasResources === true}
                  onChange={(e) =>
                    e.target.checked
                      ? patchFilters({ hasResources: true })
                      : patchFilters({}, ['hasResources'])
                  }
                />
                Has resources
              </label>
              <label className="field">
                Min % complete
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={filters.minPercentComplete ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '') patchFilters({}, ['minPercentComplete']);
                    else patchFilters({ minPercentComplete: Number(v) });
                  }}
                />
              </label>
              <label className="field">
                Max % complete
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={filters.maxPercentComplete ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '') patchFilters({}, ['maxPercentComplete']);
                    else patchFilters({ maxPercentComplete: Number(v) });
                  }}
                />
              </label>
            </div>
          </fieldset>

          <div className="custom-report-sort-row">
            <label className="field">
              Sort by
              <select
                value={sortColumn}
                onChange={(e) => setSortColumn(e.target.value as SavedReportColumn | '')}
              >
                <option value="">WBS order</option>
                {columns.map((column) => (
                  <option key={column} value={column}>
                    {SAVED_REPORT_COLUMN_LABELS[column]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Direction
              <select
                value={sortDirection}
                disabled={!sortColumn}
                onChange={(e) => setSortDirection(e.target.value as 'asc' | 'desc')}
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </label>
          </div>

          {localError ? (
            <p className="form-error" role="alert">
              {localError}
            </p>
          ) : null}
        </div>
      </div>

      {preview ? (
        <div className="table-wrap custom-report-preview" data-testid="custom-report-preview-table">
          <p className="muted">
            {preview.rowCount} row{preview.rowCount === 1 ? '' : 's'}
            {preview.reportName ? ` · ${preview.reportName}` : ''}
          </p>
          <table className="data-table">
            <thead>
              <tr>
                {preview.columnLabels.map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.length === 0 ? (
                <tr>
                  <td colSpan={preview.columns.length}>No matching tasks.</td>
                </tr>
              ) : (
                preview.rows.map((row, idx) => (
                  <tr key={idx}>
                    {preview.columns.map((col) => (
                      <td key={col}>{formatCell(row[col])}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

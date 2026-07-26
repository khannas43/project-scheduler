import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useEffect, useState, type FormEvent } from 'react';

import { useBaselines } from '../../tracking/hooks/useEarnedValue.js';
import { projectQueryKey } from '../../tasks/hooks/useTaskEdit.js';
import * as projectsApi from '../api.js';
import {
  DATE_FORMAT_OPTIONS,
  dateInputToIso,
  formatProjectDate,
  projectSettingsOf,
  toDateInputValue,
} from '../dateFormat.js';
import { useUpdateProject } from '../hooks/useUpdateProject.js';

export function ProjectSettingsPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const projectQuery = useQuery({
    queryKey: projectQueryKey(projectId),
    queryFn: () => projectsApi.getProject(projectId),
  });
  const baselinesQuery = useBaselines(projectId);
  const update = useUpdateProject(projectId);

  const project = projectQuery.data;
  const settings = projectSettingsOf(project?.settings);

  const [name, setName] = useState('');
  const [status, setStatus] = useState('active');
  const [startDate, setStartDate] = useState('');
  const [statusDate, setStatusDate] = useState('');
  const [dateFormat, setDateFormat] = useState(settings.dateFormat);
  const [dateTimeDisplay, setDateTimeDisplay] = useState(settings.dateTimeDisplay);
  const [activeBaselineId, setActiveBaselineId] = useState<string>('');
  const [showBaselineOnGantt, setShowBaselineOnGantt] = useState(settings.showBaselineOnGantt);
  const [formError, setFormError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (!project) return;
    const s = projectSettingsOf(project.settings);
    setName(project.name);
    setStatus(project.status);
    setStartDate(toDateInputValue(project.startDate));
    setStatusDate(toDateInputValue(project.statusDate));
    setDateFormat(s.dateFormat);
    setDateTimeDisplay(s.dateTimeDisplay);
    setActiveBaselineId(s.activeBaselineId ?? '');
    setShowBaselineOnGantt(s.showBaselineOnGantt);
  }, [project]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!project) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError('Name is required');
      return;
    }
    setFormError(null);
    try {
      await update.mutateAsync({
        version: project.version,
        name: trimmed,
        status: status.trim() || 'active',
        startDate: startDate ? dateInputToIso(startDate) : null,
        statusDate: statusDate ? dateInputToIso(statusDate) : null,
        settings: {
          dateFormat,
          dateTimeDisplay,
          activeBaselineId: activeBaselineId || null,
          showBaselineOnGantt,
        },
      });
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2000);
    } catch {
      // Banner via hook.
    }
  }

  if (projectQuery.isLoading) {
    return (
      <div className="page">
        <p className="muted">Loading settings…</p>
      </div>
    );
  }

  if (projectQuery.isError || !project) {
    return (
      <div className="page">
        <p className="form-error">Could not load project settings.</p>
        <Link to="/projects">← Back to projects</Link>
      </div>
    );
  }

  const previewIso = project.startDate ?? '2026-07-24T09:30:00.000Z';
  const preview = formatProjectDate(previewIso, { dateFormat, dateTimeDisplay });

  return (
    <div className="page project-settings-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <Link to="/projects/$projectId" params={{ projectId }}>
              ← Project
            </Link>
          </p>
          <h1>Project settings</h1>
          <p className="lede muted">
            Configure schedule dates, display formats, and the default baseline for{' '}
            <strong>{project.name}</strong>.
          </p>
        </div>
      </header>

      <form className="settings-form" onSubmit={(e) => void onSubmit(e)}>
        <section className="settings-section" aria-labelledby="settings-identity">
          <h2 id="settings-identity">Project</h2>
          <label className="field">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={update.isPending} />
          </label>
          <label className="field">
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={update.isPending}>
              <option value="active">Active</option>
              <option value="planned">Planned</option>
              <option value="on_hold">On hold</option>
              <option value="complete">Complete</option>
            </select>
          </label>
        </section>

        <section className="settings-section" aria-labelledby="settings-dates">
          <h2 id="settings-dates">Schedule dates</h2>
          <p className="muted section-help">
            Project start anchors the schedule. Status date is used for progress / EV reporting.
            Finish date is calculated by the engine
            {project.finishDate
              ? ` (currently ${formatProjectDate(project.finishDate, { dateFormat, dateTimeDisplay: 'date' })})`
              : ''}
            .
          </p>
          <div className="settings-grid">
            <label className="field">
              Start date
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={update.isPending}
              />
            </label>
            <label className="field">
              Status date
              <input
                type="date"
                value={statusDate}
                onChange={(e) => setStatusDate(e.target.value)}
                disabled={update.isPending}
              />
            </label>
          </div>
        </section>

        <section className="settings-section" aria-labelledby="settings-formats">
          <h2 id="settings-formats">Date display</h2>
          <p className="muted section-help">
            Controls how start and finish dates appear on the schedule grid and related views.
          </p>
          <div className="settings-grid">
            <label className="field">
              Date format
              <select
                value={dateFormat}
                onChange={(e) => setDateFormat(e.target.value as typeof dateFormat)}
                disabled={update.isPending}
              >
                {DATE_FORMAT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Start / finish detail
              <select
                value={dateTimeDisplay}
                onChange={(e) => setDateTimeDisplay(e.target.value as typeof dateTimeDisplay)}
                disabled={update.isPending}
              >
                <option value="date">Date only</option>
                <option value="datetime">Date and time (UTC)</option>
              </select>
            </label>
          </div>
          <p className="settings-preview">
            Preview: <span className="mono">{preview}</span>
          </p>
        </section>

        <section className="settings-section" aria-labelledby="settings-baseline">
          <h2 id="settings-baseline">Baseline</h2>
          <p className="muted section-help">
            Choose the default baseline for variance and earned-value views. Capture baselines from{' '}
            <Link to="/projects/$projectId/baselines" params={{ projectId }}>
              Baselines
            </Link>
            .
          </p>
          <label className="field">
            Active baseline
            <select
              value={activeBaselineId}
              onChange={(e) => setActiveBaselineId(e.target.value)}
              disabled={update.isPending || baselinesQuery.isLoading}
            >
              <option value="">None</option>
              {(baselinesQuery.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  #{b.baselineNumber}
                  {b.name ? ` — ${b.name}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field checkbox-field">
            <input
              type="checkbox"
              checked={showBaselineOnGantt}
              onChange={(e) => setShowBaselineOnGantt(e.target.checked)}
              disabled={update.isPending}
            />
            Show baseline bars on the Gantt (when an active baseline is set)
          </label>
        </section>

        {formError ? <p className="form-error">{formError}</p> : null}
        {savedFlash ? <p className="settings-saved">Settings saved.</p> : null}

        <div className="form-actions">
          <Link to="/projects/$projectId" params={{ projectId }} className="btn-secondary-link">
            Cancel
          </Link>
          <button type="submit" disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </form>
    </div>
  );
}

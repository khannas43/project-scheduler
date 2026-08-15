import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';

import { categoryName } from '@pkg/schema';

import type { Project } from '../api.js';
import { useProjects } from '../hooks/useProjects.js';
import { CreateProjectForm } from './CreateProjectForm.js';
import { ProjectLifecycleActions } from './ProjectLifecycleActions.js';

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function shortOwner(ownerId: string): string {
  return ownerId.slice(0, 8);
}

function ProjectRow({ project }: { project: Project }) {
  return (
    <tr className={project.isArchived ? 'is-archived' : undefined}>
      <td>
        <div className="project-name-cell">
          <Link to="/projects/$projectId" params={{ projectId: project.id }} className="project-link">
            {project.name}
          </Link>
          {project.isArchived ? <span className="status-pill status-archived">Disabled</span> : null}
        </div>
      </td>
      <td>
        <span className={`status-pill status-${project.status}`}>{project.status}</span>
      </td>
      <td>{categoryName(project.category) ?? '—'}</td>
      <td className="mono" title={project.ownerId}>
        {shortOwner(project.ownerId)}
      </td>
      <td>
        {formatDate(project.startDate)} → {formatDate(project.finishDate)}
      </td>
      <td>
        <ProjectLifecycleActions project={project} />
      </td>
    </tr>
  );
}

export function ProjectListPage() {
  const { data, isLoading, isError, error, refetch } = useProjects();
  const [creating, setCreating] = useState(false);
  const [showDisabled, setShowDisabled] = useState(false);

  const visible = useMemo(() => {
    const rows = data ?? [];
    return showDisabled ? rows : rows.filter((p) => !p.isArchived);
  }, [data, showDisabled]);

  const disabledCount = useMemo(
    () => (data ?? []).filter((p) => p.isArchived).length,
    [data],
  );

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Projects</h1>
          <p className="lede">Your workspace — membership-scoped.</p>
        </div>
        <div className="page-header-actions">
          {disabledCount > 0 ? (
            <label className="show-disabled-toggle">
              <input
                type="checkbox"
                checked={showDisabled}
                onChange={(e) => setShowDisabled(e.target.checked)}
              />
              Show disabled ({disabledCount})
            </label>
          ) : null}
          <button type="button" onClick={() => setCreating(true)}>
            New project
          </button>
        </div>
      </header>

      {creating ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setCreating(false)}>
          <div
            className="modal"
            role="dialog"
            aria-labelledby="create-project-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div id="create-project-title" className="sr-only">
              Create project
            </div>
            <CreateProjectForm onCancel={() => setCreating(false)} />
          </div>
        </div>
      ) : null}

      {isLoading ? <p className="muted">Loading projects…</p> : null}
      {isError ? (
        <p className="form-error" role="alert">
          {error instanceof Error ? error.message : 'Failed to load projects'}{' '}
          <button type="button" className="btn-link" onClick={() => void refetch()}>
            Retry
          </button>
        </p>
      ) : null}

      {data && data.length === 0 ? (
        <div className="empty-state">
          <p>No projects yet.</p>
          <button type="button" onClick={() => setCreating(true)}>
            Create your first project
          </button>
        </div>
      ) : null}

      {data && data.length > 0 && visible.length === 0 ? (
        <div className="empty-state">
          <p>All projects are disabled.</p>
          <button type="button" className="btn-secondary" onClick={() => setShowDisabled(true)}>
            Show disabled projects
          </button>
        </div>
      ) : null}

      {visible.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Category</th>
                <th>Owner</th>
                <th>Date range</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((project) => (
                <ProjectRow key={project.id} project={project} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

import { useState } from 'react';
import { Link } from '@tanstack/react-router';

import type { Project } from '../api.js';
import { useProjects } from '../hooks/useProjects.js';
import { CreateProjectForm } from './CreateProjectForm.js';

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
    <tr>
      <td>
        <Link to="/projects/$projectId" params={{ projectId: project.id }} className="project-link">
          {project.name}
        </Link>
      </td>
      <td>
        <span className={`status-pill status-${project.status}`}>{project.status}</span>
      </td>
      <td className="mono" title={project.ownerId}>
        {shortOwner(project.ownerId)}
      </td>
      <td>
        {formatDate(project.startDate)} → {formatDate(project.finishDate)}
      </td>
    </tr>
  );
}

export function ProjectListPage() {
  const { data, isLoading, isError, error, refetch } = useProjects();
  const [creating, setCreating] = useState(false);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Projects</h1>
          <p className="lede">Your workspace — membership-scoped.</p>
        </div>
        <button type="button" onClick={() => setCreating(true)}>
          New project
        </button>
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

      {data && data.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Owner</th>
                <th>Date range</th>
              </tr>
            </thead>
            <tbody>
              {data.map((project) => (
                <ProjectRow key={project.id} project={project} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

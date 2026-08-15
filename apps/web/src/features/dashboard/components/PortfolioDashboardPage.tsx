import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';

import { ProjectLifecycleActions } from '../../projects/components/ProjectLifecycleActions.js';
import { useProjects } from '../../projects/hooks/useProjects.js';
import { usePortfolioDashboard } from '../hooks/useDashboard.js';
import { HEALTH_LABELS, type ProjectHealth } from '../types.js';

function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${Math.round(value)}%`;
}

function formatIndex(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toFixed(2);
}

function healthClass(health: ProjectHealth): string {
  return `health-badge is-${health.replaceAll('_', '-')}`;
}

export function PortfolioDashboardPage() {
  const query = usePortfolioDashboard();
  const projectsQuery = useProjects();
  const [showDisabled, setShowDisabled] = useState(false);

  const projectById = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; version: number; isArchived: boolean }
    >();
    for (const p of projectsQuery.data ?? []) {
      map.set(p.id, {
        id: p.id,
        name: p.name,
        version: p.version,
        isArchived: p.isArchived,
      });
    }
    return map;
  }, [projectsQuery.data]);

  const rows = useMemo(() => {
    const all = query.data ?? [];
    if (showDisabled) return all;
    return all.filter((row) => {
      const project = projectById.get(row.projectId);
      return !(project?.isArchived ?? false);
    });
  }, [query.data, projectById, showDisabled]);

  const disabledCount = useMemo(() => {
    let count = 0;
    for (const row of query.data ?? []) {
      if (projectById.get(row.projectId)?.isArchived) count += 1;
    }
    return count;
  }, [query.data, projectById]);

  if (query.isLoading) {
    return (
      <div className="page">
        <p className="muted">Loading portfolio…</p>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="page">
        <p className="form-error">Could not load portfolio dashboard.</p>
      </div>
    );
  }

  const allRows = query.data ?? [];

  return (
    <div className="page portfolio-dashboard-page">
      <header className="page-header">
        <div>
          <h1>Portfolio</h1>
          <p className="lede muted">Health across projects you belong to.</p>
        </div>
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
      </header>

      {allRows.length === 0 ? (
        <div className="empty-state">
          <p>No projects yet.</p>
          <Link to="/projects">Go to projects</Link>
        </div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <p>All projects are disabled.</p>
          <button type="button" className="btn-secondary" onClick={() => setShowDisabled(true)}>
            Show disabled projects
          </button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table portfolio-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Status</th>
                <th>Health</th>
                <th>% complete</th>
                <th>SPI</th>
                <th>CPI</th>
                <th>Critical</th>
                <th>Overallocated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const project = projectById.get(row.projectId);
                const archived = project?.isArchived ?? false;
                return (
                  <tr
                    key={row.projectId}
                    data-testid={`portfolio-row-${row.projectId}`}
                    className={archived ? 'is-archived' : undefined}
                  >
                    <td>
                      <div className="project-name-cell">
                        <Link
                          to="/projects/$projectId"
                          params={{ projectId: row.projectId }}
                          className="project-link"
                        >
                          {row.projectName}
                        </Link>
                        {archived ? (
                          <span className="status-pill status-archived">Disabled</span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <span className="status-pill">{row.status}</span>
                    </td>
                    <td>
                      <span className={healthClass(row.health)}>{HEALTH_LABELS[row.health]}</span>
                    </td>
                    <td>{formatPct(row.overallPercentComplete)}</td>
                    <td className="mono">{formatIndex(row.spi)}</td>
                    <td className="mono">{formatIndex(row.cpi)}</td>
                    <td className="mono">{row.criticalTaskCount}</td>
                    <td className="mono">{row.overallocatedResourceCount}</td>
                    <td>
                      {project ? (
                        <ProjectLifecycleActions
                          project={{
                            id: project.id,
                            name: project.name,
                            version: project.version,
                            isArchived: project.isArchived,
                          }}
                        />
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

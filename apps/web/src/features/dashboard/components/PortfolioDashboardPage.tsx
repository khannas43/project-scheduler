import { Link } from '@tanstack/react-router';

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

  const rows = query.data ?? [];

  return (
    <div className="page portfolio-dashboard-page">
      <header className="page-header">
        <div>
          <h1>Portfolio</h1>
          <p className="lede muted">Health across projects you belong to.</p>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="empty-state">
          <p>No projects yet.</p>
          <Link to="/projects">Go to projects</Link>
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
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.projectId} data-testid={`portfolio-row-${row.projectId}`}>
                  <td>
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: row.projectId }}
                      className="project-link"
                    >
                      {row.projectName}
                    </Link>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { Link, useParams } from '@tanstack/react-router';

import { useProjectDashboard } from '../hooks/useDashboard.js';
import { HEALTH_LABELS, type ProjectHealth } from '../types.js';

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return value.slice(0, 10);
}

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

export function ProjectDashboardPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const query = useProjectDashboard(projectId);

  if (query.isLoading) {
    return (
      <div className="page">
        <p className="muted">Loading dashboard…</p>
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="page">
        <p className="form-error">Could not load project dashboard.</p>
        <Link to="/projects/$projectId" params={{ projectId }}>
          ← Project
        </Link>
      </div>
    );
  }

  const d = query.data;

  return (
    <div className="page dashboard-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <Link to="/projects/$projectId" params={{ projectId }}>
              ← Project
            </Link>
          </p>
          <h1>Dashboard</h1>
          <p className="lede muted">
            Health snapshot for <strong>{d.projectName}</strong>
            {d.status ? <> · {d.status}</> : null}
          </p>
        </div>
        <span className={healthClass(d.health)} data-testid="health-badge">
          {HEALTH_LABELS[d.health]}
        </span>
      </header>

      <section className="dashboard-stats" aria-label="Project stats">
        <article className="dashboard-stat-tile">
          <h2>Overall complete</h2>
          <p className="dashboard-stat-value" data-testid="stat-complete">
            {formatPct(d.overallPercentComplete)}
          </p>
        </article>
        <article className="dashboard-stat-tile">
          <h2>Critical tasks</h2>
          <p className="dashboard-stat-value" data-testid="stat-critical">
            {d.criticalTaskCount}
          </p>
        </article>
        <article className="dashboard-stat-tile">
          <h2>Overallocated resources</h2>
          <p className="dashboard-stat-value" data-testid="stat-overalloc">
            {d.overallocatedResourceCount}
          </p>
        </article>
        <article className="dashboard-stat-tile">
          <h2>SPI</h2>
          <p className="dashboard-stat-value" data-testid="stat-spi">
            {formatIndex(d.spi)}
          </p>
        </article>
        <article className="dashboard-stat-tile">
          <h2>CPI</h2>
          <p className="dashboard-stat-value" data-testid="stat-cpi">
            {formatIndex(d.cpi)}
          </p>
        </article>
        <article className="dashboard-stat-tile">
          <h2>Slipping tasks</h2>
          <p className="dashboard-stat-value" data-testid="stat-slipping">
            {d.slippingTaskCount}
          </p>
        </article>
      </section>

      <section className="dashboard-section" aria-labelledby="upcoming-milestones">
        <h2 id="upcoming-milestones">Upcoming milestones</h2>
        {d.upcomingMilestones.length === 0 ? (
          <p className="muted">No upcoming milestones with a finish date.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>WBS</th>
                  <th>Name</th>
                  <th>Finish</th>
                  <th>Deadline</th>
                  <th>%</th>
                  <th>Critical</th>
                </tr>
              </thead>
              <tbody>
                {d.upcomingMilestones.map((m) => (
                  <tr key={`${m.wbsCode}-${m.name}-${m.earlyFinish}`}>
                    <td className="mono">{m.wbsCode ?? '—'}</td>
                    <td>{m.name}</td>
                    <td>{formatDate(m.earlyFinish)}</td>
                    <td>{formatDate(m.deadline)}</td>
                    <td>{formatPct(m.percentComplete)}</td>
                    <td>{m.isCritical ? 'Yes' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="dashboard-section" aria-labelledby="top-slipping">
        <h2 id="top-slipping">Top slipping tasks</h2>
        {d.topSlippingTasks.length === 0 ? (
          <p className="muted">No slipping tasks against the current baseline.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>WBS</th>
                  <th>Name</th>
                  <th>Reasons</th>
                  <th>Variance (min)</th>
                </tr>
              </thead>
              <tbody>
                {d.topSlippingTasks.map((t) => (
                  <tr key={t.taskId}>
                    <td className="mono">{t.wbsCode ?? '—'}</td>
                    <td>{t.name}</td>
                    <td>{t.reasons.join(', ')}</td>
                    <td className="mono">{t.varianceMinutes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="reports-ev-card" aria-label="Earned value">
        <h2>Earned value</h2>
        <p className="muted">
          SPI/CPI and the S-curve live on the baselines page — open it to review EV against a
          captured plan.
        </p>
        <Link
          to="/projects/$projectId/baselines"
          params={{ projectId }}
          className="btn-link"
          data-testid="ev-baselines-link"
        >
          Open baselines &amp; earned value →
        </Link>
      </section>
    </div>
  );
}

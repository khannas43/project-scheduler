import { Link, useParams } from '@tanstack/react-router';

import { useProjectDashboard } from '../hooks/useDashboard.js';
import { HEALTH_LABELS, type ProjectHealth } from '../types.js';
import { DashboardSCurve, PhaseProgressChart, ProgressDonut } from './DashboardCharts.js';

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

function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatMinutes(value: number): string {
  const days = value / 480;
  if (Math.abs(days) >= 1) return `${days.toFixed(1)}d`;
  const hours = value / 60;
  return `${hours.toFixed(1)}h`;
}

function healthClass(health: ProjectHealth): string {
  return `health-badge is-${health.replaceAll('_', '-')}`;
}

function remainingLabel(finishDate: string | null): string {
  if (!finishDate) return '—';
  const finish = new Date(finishDate);
  if (Number.isNaN(finish.getTime())) return '—';
  const days = Math.ceil((finish.getTime() - Date.now()) / 86_400_000);
  if (days > 0) return `${days}d left`;
  if (days === 0) return 'Due today';
  return `${Math.abs(days)}d overdue`;
}

export function ProjectDashboardPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const query = useProjectDashboard(projectId);

  if (query.isLoading) {
    return (
      <div className="page dashboard-page">
        <p className="muted">Loading dashboard…</p>
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="page dashboard-page">
        <p className="form-error">Could not load project dashboard.</p>
        <Link to="/projects/$projectId" params={{ projectId }}>
          ← Project
        </Link>
      </div>
    );
  }

  const d = query.data;
  const ev = d.earnedValue;

  return (
    <div className="page dashboard-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <Link to="/projects/$projectId" params={{ projectId }}>
              ← Schedule
            </Link>
          </p>
          <h1>{d.projectName}</h1>
          <p className="lede muted">
            Project dashboard
            {d.status ? <> · {d.status}</> : null}
            {' · '}
            {formatDate(d.startDate)} → {formatDate(d.finishDate)}
            {' · '}
            <span className="mono">{remainingLabel(d.finishDate)}</span>
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
          <h2>In progress</h2>
          <p className="dashboard-stat-value" data-testid="stat-in-progress">
            {d.progressBreakdown.inProgress}
          </p>
        </article>
        <article className="dashboard-stat-tile">
          <h2>Overallocated</h2>
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
          <h2>Slipping</h2>
          <p className="dashboard-stat-value" data-testid="stat-slipping">
            {d.slippingTaskCount}
          </p>
        </article>
        <article className="dashboard-stat-tile">
          <h2>Leaf tasks</h2>
          <p className="dashboard-stat-value">
            {d.taskCounts.completed}/{d.taskCounts.leaf}
          </p>
        </article>
      </section>

      <div className="dashboard-grid">
        <section className="dashboard-panel" aria-labelledby="progress-breakdown">
          <h2 id="progress-breakdown">Work status</h2>
          <ProgressDonut breakdown={d.progressBreakdown} />
        </section>

        <section className="dashboard-panel" aria-labelledby="phase-progress">
          <h2 id="phase-progress">Phase progress</h2>
          <PhaseProgressChart phases={d.phaseProgress} />
        </section>
      </div>

      <section className="dashboard-panel" aria-labelledby="top-in-progress">
        <div className="dashboard-panel-header">
          <h2 id="top-in-progress">Top 5 in progress</h2>
          <span className="muted">Highest % complete among active leaf tasks</span>
        </div>
        {d.topInProgress.length === 0 ? (
          <p className="muted">No activities currently in progress.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table" data-testid="top-in-progress-table">
              <thead>
                <tr>
                  <th>WBS</th>
                  <th>Activity</th>
                  <th>%</th>
                  <th>Finish</th>
                  <th>Critical</th>
                  <th>Resources</th>
                </tr>
              </thead>
              <tbody>
                {d.topInProgress.map((t) => (
                  <tr key={t.taskId}>
                    <td className="mono">{t.wbsCode ?? '—'}</td>
                    <td>
                      <div className="dash-activity-name">{t.name}</div>
                      <div
                        className="dash-mini-bar"
                        aria-hidden="true"
                        style={{ ['--pct' as string]: `${t.percentComplete}%` }}
                      />
                    </td>
                    <td className="mono">{formatPct(t.percentComplete)}</td>
                    <td>{formatDate(t.earlyFinish)}</td>
                    <td>{t.isCritical ? 'Yes' : '—'}</td>
                    <td className="muted">{t.resourceNames || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="dashboard-grid">
        <section className="dashboard-panel" aria-labelledby="near-critical">
          <h2 id="near-critical">Near-critical path</h2>
          {d.nearCritical.length === 0 ? (
            <p className="muted">No critical or near-critical leaf tasks.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>WBS</th>
                    <th>Name</th>
                    <th>Float</th>
                    <th>%</th>
                    <th>Finish</th>
                  </tr>
                </thead>
                <tbody>
                  {d.nearCritical.map((t) => (
                    <tr key={t.taskId} className={t.isCritical ? 'is-critical-row' : undefined}>
                      <td className="mono">{t.wbsCode ?? '—'}</td>
                      <td>{t.name}</td>
                      <td className="mono">
                        {t.totalFloatMinutes === null ? '—' : formatMinutes(t.totalFloatMinutes)}
                      </td>
                      <td>{formatPct(t.percentComplete)}</td>
                      <td>{formatDate(t.earlyFinish)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="dashboard-panel" aria-labelledby="upcoming-milestones">
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
                    <th>Critical</th>
                  </tr>
                </thead>
                <tbody>
                  {d.upcomingMilestones.map((m) => (
                    <tr key={`${m.wbsCode}-${m.name}-${m.earlyFinish}`}>
                      <td className="mono">{m.wbsCode ?? '—'}</td>
                      <td>{m.name}</td>
                      <td>{formatDate(m.earlyFinish)}</td>
                      <td>{m.isCritical ? 'Yes' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <div className="dashboard-grid">
        <section className="dashboard-panel" aria-labelledby="top-slipping">
          <h2 id="top-slipping">Top slipping tasks</h2>
          {d.topSlippingTasks.length === 0 ? (
            <p className="muted">No slipping tasks against deadline/baseline.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>WBS</th>
                    <th>Name</th>
                    <th>Reasons</th>
                    <th>Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {d.topSlippingTasks.map((t) => (
                    <tr key={t.taskId}>
                      <td className="mono">{t.wbsCode ?? '—'}</td>
                      <td>{t.name}</td>
                      <td>{t.reasons.join(', ')}</td>
                      <td className="mono">{formatMinutes(t.varianceMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="dashboard-panel" aria-labelledby="top-overalloc">
          <div className="dashboard-panel-header">
            <h2 id="top-overalloc">Resource pressure</h2>
            {d.topOverallocated.length > 0 ? (
              <Link
                to="/projects/$projectId"
                params={{ projectId }}
                className="btn-link"
                onClick={(e) => {
                  e.preventDefault();
                  window.location.assign(`/projects/${projectId}?level=1`);
                }}
              >
                Level resources
              </Link>
            ) : null}
          </div>
          {d.topOverallocated.length === 0 ? (
            <p className="muted">No overallocated resources detected.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Resource</th>
                    <th>Overalloc days</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {d.topOverallocated.map((r) => (
                    <tr key={r.resourceId}>
                      <td>{r.resourceName}</td>
                      <td className="mono">{r.overallocatedDayCount}</td>
                      <td>
                        <Link
                          to="/projects/$projectId"
                          params={{ projectId }}
                          className="btn-link"
                          onClick={(e) => {
                            e.preventDefault();
                            window.location.assign(
                              `/projects/${projectId}?level=1&resourceId=${encodeURIComponent(r.resourceId)}`,
                            );
                          }}
                        >
                          Level
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="dashboard-panel" aria-labelledby="earned-value">
        <div className="dashboard-panel-header">
          <h2 id="earned-value">Earned value</h2>
          <Link
            to="/projects/$projectId/baselines"
            params={{ projectId }}
            className="btn-link"
            data-testid="ev-baselines-link"
          >
            Open baselines →
          </Link>
        </div>
        {ev ? (
          <>
            <div className="dashboard-stats dashboard-stats-compact" aria-label="Earned value metrics">
              <article className="dashboard-stat-tile">
                <h2>BAC</h2>
                <p className="dashboard-stat-value">{formatMoney(ev.bac)}</p>
              </article>
              <article className="dashboard-stat-tile">
                <h2>PV</h2>
                <p className="dashboard-stat-value">{formatMoney(ev.pv)}</p>
              </article>
              <article className="dashboard-stat-tile">
                <h2>EV</h2>
                <p className="dashboard-stat-value">{formatMoney(ev.ev)}</p>
              </article>
              <article className="dashboard-stat-tile">
                <h2>AC</h2>
                <p className="dashboard-stat-value">{formatMoney(ev.ac)}</p>
              </article>
            </div>
            {d.sCurve ? (
              <>
                <DashboardSCurve data={d.sCurve} />
                <div className="s-curve-legend muted">
                  <span className="s-curve-legend-pv">PV (planned)</span>
                  <span className="s-curve-legend-ev">EV</span>
                  <span className="s-curve-legend-ac">AC</span>
                </div>
              </>
            ) : (
              <p className="muted">S-curve unavailable for this baseline.</p>
            )}
          </>
        ) : (
          <p className="muted">
            Capture a baseline to unlock SPI/CPI and the planned-value S-curve on this dashboard.
          </p>
        )}
      </section>
    </div>
  );
}

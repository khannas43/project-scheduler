import { Link, useParams } from '@tanstack/react-router';
import { useState } from 'react';

import { ApiError } from '../../../lib/apiClient.js';
import { useBaselines } from '../../tracking/hooks/useEarnedValue.js';
import * as reportsApi from '../api.js';
import {
  useCostOverviewReport,
  useCriticalTasksReport,
  useMilestonesReport,
  useOverallocatedResourcesReport,
  useProjectSummaryReport,
  useSlippingTasksReport,
} from '../hooks/useReports.js';
import { REPORT_OPTIONS, type ReportKind } from '../types.js';
import { CustomReportBuilder } from './CustomReportBuilder.js';

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return String(value);
}

export function ReportsPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const [kind, setKind] = useState<ReportKind>('summary');
  const [baselineId, setBaselineId] = useState<string>('');
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<'csv' | 'excel' | 'pdf' | null>(null);

  const baselinesQuery = useBaselines(projectId);

  const summaryQuery = useProjectSummaryReport(projectId, kind === 'summary');
  const criticalQuery = useCriticalTasksReport(projectId, kind === 'critical-tasks');
  const milestonesQuery = useMilestonesReport(projectId, kind === 'milestones');
  const overallocQuery = useOverallocatedResourcesReport(
    projectId,
    kind === 'overallocated-resources',
  );
  const costQuery = useCostOverviewReport(projectId, kind === 'cost-overview');
  const slippingQuery = useSlippingTasksReport(
    projectId,
    kind === 'slipping-tasks',
    baselineId || undefined,
  );

  const activeQuery = {
    summary: summaryQuery,
    'critical-tasks': criticalQuery,
    milestones: milestonesQuery,
    'overallocated-resources': overallocQuery,
    'cost-overview': costQuery,
    'slipping-tasks': slippingQuery,
  }[kind];

  async function onDownload(format: 'csv' | 'excel' | 'pdf') {
    setDownloadError(null);
    setDownloading(format);
    try {
      if (format === 'csv') await reportsApi.downloadProjectCsv(projectId);
      else if (format === 'excel') await reportsApi.downloadProjectExcel(projectId);
      else await reportsApi.downloadProjectPdf(projectId);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.detail
          : err instanceof Error
            ? err.message
            : 'Download failed';
      setDownloadError(message);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="page reports-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <Link to="/projects/$projectId" params={{ projectId }}>
              ← Project
            </Link>
          </p>
          <h1>Reports</h1>
          <p className="lede muted">
            Built-in reports, custom/saved task reports, and task-list exports.
          </p>
        </div>
        <div className="reports-export-actions">
          <button
            type="button"
            className="btn-secondary"
            data-testid="download-csv"
            disabled={downloading !== null}
            onClick={() => void onDownload('csv')}
          >
            {downloading === 'csv' ? 'Downloading…' : 'CSV'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            data-testid="download-excel"
            disabled={downloading !== null}
            onClick={() => void onDownload('excel')}
          >
            {downloading === 'excel' ? 'Downloading…' : 'Excel'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            data-testid="download-pdf"
            disabled={downloading !== null}
            onClick={() => void onDownload('pdf')}
          >
            {downloading === 'pdf' ? 'Downloading…' : 'PDF'}
          </button>
        </div>
      </header>

      {downloadError ? <p className="form-error">{downloadError}</p> : null}

      <CustomReportBuilder projectId={projectId} />

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

      <section className="reports-picker" aria-label="Built-in reports">
        <label className="field">
          <span>Report</span>
          <select
            data-testid="report-picker"
            value={kind}
            onChange={(e) => setKind(e.target.value as ReportKind)}
          >
            {REPORT_OPTIONS.map((opt) => (
              <option key={opt.kind} value={opt.kind}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        {kind === 'slipping-tasks' ? (
          <label className="field">
            <span>Baseline (optional)</span>
            <select
              data-testid="slipping-baseline"
              value={baselineId}
              onChange={(e) => setBaselineId(e.target.value)}
            >
              <option value="">Deadlines only</option>
              {(baselinesQuery.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name ?? `Baseline ${b.baselineNumber}`}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </section>

      {activeQuery.isLoading ? <p className="muted">Loading report…</p> : null}
      {activeQuery.isError ? (
        <p className="form-error">
          {activeQuery.error instanceof ApiError
            ? activeQuery.error.detail
            : 'Could not load report.'}
        </p>
      ) : null}

      {kind === 'summary' && summaryQuery.data ? (
        <div className="table-wrap" data-testid="report-table">
          <table className="data-table">
            <tbody>
              <tr>
                <th>Project</th>
                <td>{summaryQuery.data.projectName}</td>
              </tr>
              <tr>
                <th>Status</th>
                <td>{summaryQuery.data.status}</td>
              </tr>
              <tr>
                <th>Overall % complete</th>
                <td>{formatNumber(summaryQuery.data.overallPercentComplete)}</td>
              </tr>
              <tr>
                <th>Tasks (total / leaf / critical / completed)</th>
                <td>
                  {summaryQuery.data.taskCounts.total} / {summaryQuery.data.taskCounts.leaf} /{' '}
                  {summaryQuery.data.taskCounts.critical} /{' '}
                  {summaryQuery.data.taskCounts.completed}
                </td>
              </tr>
              <tr>
                <th>Cost (BAC / EV / AC)</th>
                <td>
                  {summaryQuery.data.cost
                    ? `${summaryQuery.data.cost.bac} / ${summaryQuery.data.cost.ev} / ${summaryQuery.data.cost.ac}`
                    : 'No baseline'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}

      {kind === 'critical-tasks' && criticalQuery.data ? (
        <div className="table-wrap" data-testid="report-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>WBS</th>
                <th>Name</th>
                <th>Start</th>
                <th>Finish</th>
                <th>Duration (days)</th>
                <th>Float</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {criticalQuery.data.map((r) => (
                <tr key={`${r.wbsCode}-${r.name}`}>
                  <td className="mono">{r.wbsCode ?? '—'}</td>
                  <td>{r.name}</td>
                  <td>{formatDate(r.earlyStart)}</td>
                  <td>{formatDate(r.earlyFinish)}</td>
                  <td>
                    {r.durationMinutes === null
                      ? '—'
                      : String(Math.round((r.durationMinutes / 480) * 100) / 100)}
                  </td>
                  <td>{formatNumber(r.totalFloatMinutes)}</td>
                  <td>{formatNumber(r.percentComplete)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {kind === 'milestones' && milestonesQuery.data ? (
        <div className="table-wrap" data-testid="report-table">
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
              {milestonesQuery.data.map((r) => (
                <tr key={`${r.wbsCode}-${r.name}`}>
                  <td className="mono">{r.wbsCode ?? '—'}</td>
                  <td>{r.name}</td>
                  <td>{formatDate(r.earlyFinish)}</td>
                  <td>{formatDate(r.deadline)}</td>
                  <td>{formatNumber(r.percentComplete)}</td>
                  <td>{r.isCritical ? 'Y' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {kind === 'overallocated-resources' && overallocQuery.data ? (
        <div className="table-wrap" data-testid="report-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>Resource</th>
                <th>Overallocated days</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {overallocQuery.data.map((r) => (
                <tr key={r.resourceId}>
                  <td>{r.resourceName}</td>
                  <td>{r.overallocatedDayCount}</td>
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
      ) : null}

      {kind === 'cost-overview' && costQuery.data ? (
        <div className="table-wrap" data-testid="report-table">
          <p className="muted">
            Total cost {costQuery.data.totalCost} · {costQuery.data.unassignedTaskCount}{' '}
            unassigned leaf tasks
          </p>
          <table className="data-table">
            <thead>
              <tr>
                <th>WBS</th>
                <th>Name</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {costQuery.data.rows.map((r) => (
                <tr key={`${r.wbsCode}-${r.name}`}>
                  <td className="mono">{r.wbsCode ?? '—'}</td>
                  <td>{r.name}</td>
                  <td>{formatNumber(r.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {kind === 'slipping-tasks' && slippingQuery.data ? (
        <div className="table-wrap" data-testid="report-table">
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
              {slippingQuery.data.map((r) => (
                <tr key={r.taskId}>
                  <td className="mono">{r.wbsCode ?? '—'}</td>
                  <td>{r.name}</td>
                  <td>{r.reasons.join(', ')}</td>
                  <td>{r.varianceMinutes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

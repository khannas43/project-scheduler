import type { BaselineTaskVariance } from '../types.js';

export interface BaselineVarianceTableProps {
  readonly tasks: readonly BaselineTaskVariance[];
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function fmtNum(n: number | null): string {
  if (n === null) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function BaselineVarianceTable({ tasks }: BaselineVarianceTableProps) {
  if (tasks.length === 0) {
    return (
      <div className="empty-state">
        <p>No tasks in this baseline snapshot.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="data-table baseline-variance-table">
        <thead>
          <tr>
            <th>Task</th>
            <th>Start var (min)</th>
            <th>Finish var (min)</th>
            <th>Duration var (min)</th>
            <th>Cost var</th>
            <th>Baseline start</th>
            <th>Current start</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.taskId}>
              <td>{t.taskName}</td>
              <td className="mono">{fmtNum(t.startVarianceMinutes)}</td>
              <td className="mono">{fmtNum(t.finishVarianceMinutes)}</td>
              <td className="mono">{fmtNum(t.durationVarianceMinutes)}</td>
              <td className="mono">{fmtNum(t.costVariance)}</td>
              <td className="muted">{fmtDate(t.baselineStart)}</td>
              <td className="muted">{fmtDate(t.currentStart)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

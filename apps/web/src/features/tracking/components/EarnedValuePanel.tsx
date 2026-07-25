import { ApiError } from '../../../lib/apiClient.js';
import { useEarnedValue, useSCurve } from '../hooks/useEarnedValue.js';
import { SCurveChart } from './SCurveChart.js';

export interface EarnedValuePanelProps {
  readonly projectId: string;
  readonly baselineId?: string;
}

function formatMetric(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

export function EarnedValuePanel({ projectId, baselineId }: EarnedValuePanelProps) {
  const evQuery = useEarnedValue(projectId, baselineId);
  const sCurveQuery = useSCurve(projectId, baselineId);

  const noBaseline =
    (evQuery.error instanceof ApiError && evQuery.error.status === 404) ||
    (sCurveQuery.error instanceof ApiError && sCurveQuery.error.status === 404);

  if (noBaseline) {
    return (
      <section className="earned-value-panel" aria-label="Earned value">
        <h2>Earned value</h2>
        <div className="empty-state" data-testid="evm-empty">
          <p>No baseline captured yet. Save a baseline to see SPI/CPI and the S-curve.</p>
        </div>
      </section>
    );
  }

  if (evQuery.isLoading || sCurveQuery.isLoading) {
    return (
      <section className="earned-value-panel" aria-label="Earned value">
        <h2>Earned value</h2>
        <p className="muted">Loading earned value…</p>
      </section>
    );
  }

  if (evQuery.isError || !evQuery.data) {
    return (
      <section className="earned-value-panel" aria-label="Earned value">
        <h2>Earned value</h2>
        <p className="form-error">Could not load earned value.</p>
      </section>
    );
  }

  const ev = evQuery.data;

  return (
    <section className="earned-value-panel" aria-label="Earned value">
      <h2>Earned value</h2>
      <p className="muted lede">
        As of <span className="mono">{new Date(ev.asOfDate).toLocaleString()}</span>
      </p>

      <dl className="evm-stats">
        <div>
          <dt>BAC</dt>
          <dd data-testid="evm-bac">{formatMetric(ev.bac)}</dd>
        </div>
        <div>
          <dt>PV</dt>
          <dd data-testid="evm-pv">{formatMetric(ev.pv)}</dd>
        </div>
        <div>
          <dt>EV</dt>
          <dd data-testid="evm-ev">{formatMetric(ev.ev)}</dd>
        </div>
        <div>
          <dt>AC</dt>
          <dd data-testid="evm-ac">{formatMetric(ev.ac)}</dd>
        </div>
        <div>
          <dt>SPI</dt>
          <dd data-testid="evm-spi">{formatMetric(ev.spi)}</dd>
        </div>
        <div>
          <dt>CPI</dt>
          <dd data-testid="evm-cpi">{formatMetric(ev.cpi)}</dd>
        </div>
      </dl>

      {sCurveQuery.data ? <SCurveChart data={sCurveQuery.data} /> : null}
      <div className="s-curve-legend muted">
        <span className="s-curve-legend-pv">PV (planned)</span>
        <span className="s-curve-legend-ev">EV</span>
        <span className="s-curve-legend-ac">AC</span>
      </div>
    </section>
  );
}

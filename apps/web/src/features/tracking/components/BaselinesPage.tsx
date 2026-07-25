import { Link, useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { ApiError } from '../../../lib/apiClient.js';
import { useErrorBanner } from '../../../stores/errorBanner.js';
import {
  useBaselineDetail,
  useBaselines,
  useCreateBaseline,
} from '../hooks/useEarnedValue.js';
import { BaselineVarianceTable } from './BaselineVarianceTable.js';
import { EarnedValuePanel } from './EarnedValuePanel.js';

type Panel = { kind: 'none' } | { kind: 'save' };

export function BaselinesPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const baselinesQuery = useBaselines(projectId);
  const createBaseline = useCreateBaseline(projectId);
  const showBanner = useErrorBanner((s) => s.show);
  const [panel, setPanel] = useState<Panel>({ kind: 'none' });
  const [name, setName] = useState('');
  const [selectedBaselineId, setSelectedBaselineId] = useState<string | null>(null);
  const detailQuery = useBaselineDetail(selectedBaselineId);

  useEffect(() => {
    const err = baselinesQuery.error;
    if (!err) return;
    if (err instanceof ApiError) {
      showBanner(err);
      return;
    }
    if (err instanceof Error) {
      showBanner(err);
    }
  }, [baselinesQuery.error, showBanner]);

  const loading = baselinesQuery.isLoading;

  return (
    <div className="page baselines-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <Link to="/projects/$projectId" params={{ projectId }}>
              ← Project
            </Link>
          </p>
          <h1>Baselines &amp; earned value</h1>
          <p className="lede muted">
            Capture plan snapshots and track SPI/CPI against recorded actuals.
          </p>
        </div>
        {panel.kind === 'none' ? (
          <button
            type="button"
            onClick={() => setPanel({ kind: 'save' })}
            disabled={loading || Boolean(baselinesQuery.error)}
          >
            Save baseline
          </button>
        ) : null}
      </header>

      {loading ? <p className="muted">Loading baselines…</p> : null}

      {!loading && baselinesQuery.data ? (
        <section aria-label="Baselines">
          <h2>Baselines</h2>
          {baselinesQuery.data.length === 0 ? (
            <div className="empty-state">
              <p>No baselines yet. Save one to lock the current plan.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table baselines-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Captured</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {baselinesQuery.data.map((b) => (
                    <tr key={b.id} data-baseline-id={b.id}>
                      <td className="mono">{b.baselineNumber}</td>
                      <td>{b.name ?? `Baseline ${b.baselineNumber}`}</td>
                      <td className="muted">{new Date(b.capturedAt).toLocaleString()}</td>
                      <td>
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() => setSelectedBaselineId(b.id)}
                        >
                          Variance
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {selectedBaselineId ? (
        <section className="baseline-detail" aria-label="Baseline variance">
          <div className="section-heading-row">
            <h2>Variance detail</h2>
            <button
              type="button"
              className="btn-link"
              onClick={() => setSelectedBaselineId(null)}
            >
              Close
            </button>
          </div>
          {detailQuery.isLoading ? <p className="muted">Loading variance…</p> : null}
          {detailQuery.data ? (
            <BaselineVarianceTable tasks={detailQuery.data.tasks} />
          ) : null}
        </section>
      ) : null}

      <EarnedValuePanel projectId={projectId} />

      {panel.kind === 'save' ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal role-modal" role="dialog" aria-modal="true" aria-label="Save baseline">
            <h2>Save baseline</h2>
            <p className="muted">Name is optional — the next free slot (0–10) is used automatically.</p>
            <label>
              Name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Kickoff plan"
              />
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setPanel({ kind: 'none' });
                  setName('');
                }}
                disabled={createBaseline.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await createBaseline.mutateAsync(name.trim() || null);
                  setPanel({ kind: 'none' });
                  setName('');
                }}
                disabled={createBaseline.isPending}
              >
                {createBaseline.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

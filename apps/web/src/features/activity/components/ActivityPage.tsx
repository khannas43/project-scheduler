import { Link, useParams } from '@tanstack/react-router';
import { Fragment, useMemo, useState } from 'react';

import { ApiError } from '../../../lib/apiClient.js';
import { HelpLink } from '../../help/index.js';
import { formatAuditAction } from '../api.js';
import { useProjectAuditLog } from '../hooks/useAuditLog.js';

const PAGE_SIZE = 50;

export function ActivityPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const [actionDraft, setActionDraft] = useState('');
  const [entityTypeDraft, setEntityTypeDraft] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const params = useMemo(
    () => ({
      ...(action.trim() ? { action: action.trim() } : {}),
      ...(entityType.trim() ? { entityType: entityType.trim() } : {}),
      limit: PAGE_SIZE,
      offset,
    }),
    [action, entityType, offset],
  );

  const query = useProjectAuditLog(projectId, params);
  const data = query.data;
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="page activity-page" data-testid="activity-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <Link to="/projects/$projectId" params={{ projectId }}>
              ← Project
            </Link>
          </p>
          <h1>
            Activity <HelpLink topic="activity" />
          </h1>
          <p className="lede muted">
            Append-only audit trail of project changes. Events are never edited; retention is an
            ops policy (see Help).
          </p>
        </div>
      </header>

      <form
        className="activity-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setAction(actionDraft);
          setEntityType(entityTypeDraft);
          setOffset(0);
        }}
      >
        <label className="field">
          Action prefix
          <input
            value={actionDraft}
            onChange={(e) => setActionDraft(e.target.value)}
            placeholder="e.g. role. or task."
            data-testid="activity-filter-action"
          />
        </label>
        <label className="field">
          Entity type
          <input
            value={entityTypeDraft}
            onChange={(e) => setEntityTypeDraft(e.target.value)}
            placeholder="e.g. role, task, baseline"
            data-testid="activity-filter-entity"
          />
        </label>
        <button type="submit" className="btn-secondary">
          Apply
        </button>
      </form>

      {query.isLoading ? <p className="muted">Loading activity…</p> : null}
      {query.isError ? (
        <p className="form-error" role="alert">
          {query.error instanceof ApiError
            ? query.error.detail
            : 'Could not load activity. You may need audit.view permission.'}
        </p>
      ) : null}

      {!query.isLoading && !query.isError && items.length === 0 ? (
        <div className="empty-state">
          <p>No audit events match these filters.</p>
        </div>
      ) : null}

      {items.length > 0 ? (
        <>
          <p className="muted activity-count">
            Showing {offset + 1}–{offset + items.length} of {total}
          </p>
          <div className="table-wrap">
            <table className="data-table activity-table" data-testid="activity-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <Fragment key={row.id}>
                    <tr>
                      <td className="mono">{new Date(row.createdAt).toLocaleString()}</td>
                      <td>
                        <div>{row.userFullName}</div>
                        <div className="muted mono">{row.userEmail}</div>
                      </td>
                      <td>
                        <code>{formatAuditAction(row.action)}</code>
                      </td>
                      <td>
                        <span className="muted">{row.entityType}</span>{' '}
                        <code className="mono">{row.entityId.slice(0, 8)}…</code>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() =>
                            setExpandedId((id) => (id === row.id ? null : row.id))
                          }
                        >
                          {expandedId === row.id ? 'Hide' : 'Details'}
                        </button>
                      </td>
                    </tr>
                    {expandedId === row.id ? (
                      <tr className="activity-detail-row">
                        <td colSpan={5}>
                          <div className="activity-detail-grid">
                            <div>
                              <h3>Before</h3>
                              <pre>{JSON.stringify(row.before, null, 2)}</pre>
                            </div>
                            <div>
                              <h3>After</h3>
                              <pre>{JSON.stringify(row.after, null, 2)}</pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="activity-pager">
            <button
              type="button"
              className="btn-secondary"
              disabled={offset <= 0 || query.isFetching}
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            >
              Previous
            </button>
            <span className="muted">
              Page {page} / {pageCount}
            </span>
            <button
              type="button"
              className="btn-secondary"
              disabled={offset + PAGE_SIZE >= total || query.isFetching}
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
            >
              Next
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

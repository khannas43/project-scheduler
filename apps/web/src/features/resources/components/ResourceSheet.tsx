import { Link, useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { ApiError } from '../../../lib/apiClient.js';
import { useErrorBanner } from '../../../stores/errorBanner.js';
import { useResources } from '../hooks/useResources.js';
import type { Resource } from '../types.js';
import { CreateResourceForm } from './CreateResourceForm.js';
import { EditResourceForm } from './EditResourceForm.js';
import { ResourceList } from './ResourceList.js';

type Panel = { kind: 'none' } | { kind: 'create' } | { kind: 'edit'; resource: Resource };

export function ResourceSheet() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const resourcesQuery = useResources(projectId);
  const showBanner = useErrorBanner((s) => s.show);
  const [panel, setPanel] = useState<Panel>({ kind: 'none' });

  useEffect(() => {
    const err = resourcesQuery.error;
    if (!err) return;
    if (err instanceof ApiError) {
      showBanner(err);
      return;
    }
    if (err instanceof Error) {
      showBanner(err);
    }
  }, [resourcesQuery.error, showBanner]);

  const loading = resourcesQuery.isLoading;

  return (
    <div className="page resources-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <Link to="/projects/$projectId" params={{ projectId }}>
              ← Project
            </Link>
          </p>
          <h1>Resources</h1>
          <p className="lede muted">Manage the instance-wide resource pool for this workspace.</p>
        </div>
        {panel.kind === 'none' ? (
          <button
            type="button"
            onClick={() => setPanel({ kind: 'create' })}
            disabled={loading || Boolean(resourcesQuery.error)}
          >
            New resource
          </button>
        ) : null}
      </header>

      {loading ? <p className="muted">Loading resources…</p> : null}

      {!loading && resourcesQuery.data && panel.kind === 'none' ? (
        <ResourceList
          projectId={projectId}
          resources={resourcesQuery.data}
          onEdit={(resource) => setPanel({ kind: 'edit', resource })}
        />
      ) : null}

      {panel.kind === 'create' ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal role-modal" role="dialog" aria-modal="true">
            <CreateResourceForm
              projectId={projectId}
              onCancel={() => setPanel({ kind: 'none' })}
              onCreated={() => setPanel({ kind: 'none' })}
            />
          </div>
        </div>
      ) : null}

      {panel.kind === 'edit' ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal role-modal" role="dialog" aria-modal="true">
            <EditResourceForm
              projectId={projectId}
              resource={panel.resource}
              onCancel={() => setPanel({ kind: 'none' })}
              onUpdated={() => setPanel({ kind: 'none' })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

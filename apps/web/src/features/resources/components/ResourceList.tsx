import { useDeleteResource } from '../hooks/useResources.js';
import type { Resource } from '../types.js';
import { OverallocationBadge } from './OverallocationBadge.js';

export interface ResourceListProps {
  readonly projectId: string;
  readonly resources: readonly Resource[];
  readonly onEdit: (resource: Resource) => void;
}

function formatNumeric(value: string | null): string {
  if (value === null || value === '') return '—';
  return value;
}

export function ResourceList({ projectId, resources, onEdit }: ResourceListProps) {
  const del = useDeleteResource(projectId);

  if (resources.length === 0) {
    return (
      <div className="empty-state">
        <p>No resources in the pool yet.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="data-table resource-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Max units</th>
            <th>Standard rate</th>
            <th>Cost per use</th>
            <th>Overallocation</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {resources.map((resource) => (
            <tr key={resource.id} data-resource-id={resource.id}>
              <td>
                <span className="resource-name">{resource.name}</span>
              </td>
              <td className="muted">{resource.resourceType}</td>
              <td className="mono">{formatNumeric(resource.maxUnits)}</td>
              <td className="mono">{formatNumeric(resource.standardRate)}</td>
              <td className="mono">{formatNumeric(resource.costPerUse)}</td>
              <td>
                <OverallocationBadge projectId={projectId} resourceId={resource.id} />
              </td>
              <td>
                <div className="role-actions">
                  <button type="button" className="btn-link" onClick={() => onEdit(resource)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn-link"
                    disabled={del.isPending}
                    onClick={() => {
                      void del.mutateAsync(resource.id).catch(() => {
                        // 400 (assignments exist) etc. already on useErrorBanner.
                      });
                    }}
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import { Link } from '@tanstack/react-router';

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
        <p className="muted">Use New resource to add people, material, or cost items.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap resource-table-wrap">
      <table className="data-table resource-table">
        <thead>
          <tr>
            <th className="resource-col-actions">Actions</th>
            <th>Name</th>
            <th>Type</th>
            <th>Max units</th>
            <th>Standard rate</th>
            <th>Cost per use</th>
            <th>Overallocation</th>
          </tr>
        </thead>
        <tbody>
          {resources.map((resource) => (
            <tr
              key={resource.id}
              data-resource-id={resource.id}
              className="resource-row"
              onDoubleClick={() => onEdit(resource)}
            >
              <td className="resource-col-actions">
                <div className="role-actions">
                  <Link
                    to="/projects/$projectId/resources/$resourceId"
                    params={{ projectId, resourceId: resource.id }}
                    className="btn-compact"
                    data-testid={`resource-calendar-${resource.id}`}
                  >
                    Calendar
                  </Link>
                  <button
                    type="button"
                    className="btn-compact"
                    onClick={() => onEdit(resource)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn-link btn-danger-link"
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
              <td>
                <Link
                  to="/projects/$projectId/resources/$resourceId"
                  params={{ projectId, resourceId: resource.id }}
                  className="btn-link resource-name"
                >
                  {resource.name}
                </Link>
              </td>
              <td className="muted">{resource.resourceType}</td>
              <td className="mono">{formatNumeric(resource.maxUnits)}</td>
              <td className="mono">{formatNumeric(resource.standardRate)}</td>
              <td className="mono">{formatNumeric(resource.costPerUse)}</td>
              <td>
                <OverallocationBadge projectId={projectId} resourceId={resource.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

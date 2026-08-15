import { useOverallocations } from '../hooks/useResources.js';

export interface OverallocationBadgeProps {
  readonly projectId: string;
  readonly resourceId: string;
}

/** Warning pill with overallocated-day count; opens Schedule leveling for this resource. */
export function OverallocationBadge({ projectId, resourceId }: OverallocationBadgeProps) {
  const query = useOverallocations(projectId, resourceId, true);

  if (query.isLoading || query.isError || !query.data || query.data.length === 0) {
    return null;
  }

  const count = query.data.length;
  const href = `/projects/${projectId}?level=1&resourceId=${encodeURIComponent(resourceId)}`;

  return (
    <a
      href={href}
      className="status-pill overalloc-badge overalloc-badge-link"
      title={`${count} overallocated day${count === 1 ? '' : 's'} — open Level resources`}
      data-testid={`overalloc-level-${resourceId}`}
    >
      {count} day{count === 1 ? '' : 's'} over · Level
    </a>
  );
}

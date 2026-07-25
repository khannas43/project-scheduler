import { useOverallocations } from '../hooks/useResources.js';

export interface OverallocationBadgeProps {
  readonly projectId: string;
  readonly resourceId: string;
}

/** Small warning pill with overallocated-day count; renders nothing while loading or when clean. */
export function OverallocationBadge({ projectId, resourceId }: OverallocationBadgeProps) {
  const query = useOverallocations(projectId, resourceId, true);

  if (query.isLoading || query.isError || !query.data || query.data.length === 0) {
    return null;
  }

  const count = query.data.length;
  return (
    <span
      className="status-pill overalloc-badge"
      title={`${count} overallocated day${count === 1 ? '' : 's'}`}
    >
      {count} day{count === 1 ? '' : 's'} over
    </span>
  );
}

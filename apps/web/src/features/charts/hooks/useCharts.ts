import { useQuery } from '@tanstack/react-query';

import * as chartsApi from '../api.js';

export function velocityQueryKey(projectId: string) {
  return ['velocity', projectId] as const;
}

export function pointsSummaryQueryKey(sprintId: string) {
  return ['points-summary', sprintId] as const;
}

export function useProjectVelocity(projectId: string) {
  return useQuery({
    queryKey: velocityQueryKey(projectId),
    queryFn: () => chartsApi.getProjectVelocity(projectId),
    enabled: Boolean(projectId),
  });
}

export function useSprintPointsSummary(sprintId: string | null) {
  return useQuery({
    queryKey: pointsSummaryQueryKey(sprintId ?? ''),
    queryFn: () => chartsApi.getSprintPointsSummary(sprintId!),
    enabled: Boolean(sprintId),
  });
}

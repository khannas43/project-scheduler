import { useQuery } from '@tanstack/react-query';

import * as dashboardApi from '../api.js';

export function projectDashboardQueryKey(projectId: string) {
  return ['dashboard', 'project', projectId] as const;
}

export function portfolioDashboardQueryKey() {
  return ['dashboard', 'portfolio'] as const;
}

export function useProjectDashboard(projectId: string) {
  return useQuery({
    queryKey: projectDashboardQueryKey(projectId),
    queryFn: () => dashboardApi.getProjectDashboard(projectId),
    enabled: Boolean(projectId),
  });
}

export function usePortfolioDashboard() {
  return useQuery({
    queryKey: portfolioDashboardQueryKey(),
    queryFn: () => dashboardApi.getPortfolioDashboard(),
  });
}

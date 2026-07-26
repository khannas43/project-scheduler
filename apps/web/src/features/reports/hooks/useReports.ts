import { useQuery } from '@tanstack/react-query';

import * as reportsApi from '../api.js';
import type { ReportKind } from '../types.js';

export function reportQueryKey(projectId: string, kind: ReportKind, baselineId?: string) {
  if (kind === 'slipping-tasks') {
    return ['report', projectId, kind, baselineId ?? 'none'] as const;
  }
  return ['report', projectId, kind] as const;
}

export function useProjectSummaryReport(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: reportQueryKey(projectId, 'summary'),
    queryFn: () => reportsApi.getProjectSummaryReport(projectId),
    enabled: Boolean(projectId) && enabled,
  });
}

export function useCriticalTasksReport(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: reportQueryKey(projectId, 'critical-tasks'),
    queryFn: () => reportsApi.getCriticalTasksReport(projectId),
    enabled: Boolean(projectId) && enabled,
  });
}

export function useMilestonesReport(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: reportQueryKey(projectId, 'milestones'),
    queryFn: () => reportsApi.getMilestonesReport(projectId),
    enabled: Boolean(projectId) && enabled,
  });
}

export function useOverallocatedResourcesReport(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: reportQueryKey(projectId, 'overallocated-resources'),
    queryFn: () => reportsApi.getOverallocatedResourcesReport(projectId),
    enabled: Boolean(projectId) && enabled,
  });
}

export function useCostOverviewReport(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: reportQueryKey(projectId, 'cost-overview'),
    queryFn: () => reportsApi.getCostOverviewReport(projectId),
    enabled: Boolean(projectId) && enabled,
  });
}

export function useSlippingTasksReport(
  projectId: string,
  enabled: boolean,
  baselineId?: string,
) {
  return useQuery({
    queryKey: reportQueryKey(projectId, 'slipping-tasks', baselineId),
    queryFn: () => reportsApi.getSlippingTasksReport(projectId, baselineId),
    enabled: Boolean(projectId) && enabled,
  });
}

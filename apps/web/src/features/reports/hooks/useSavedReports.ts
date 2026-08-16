import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as reportsApi from '../api.js';
import type { SavedReportDefinition } from '../api.js';

export function savedReportsQueryKey(projectId: string) {
  return ['saved-reports', projectId] as const;
}

export function useSavedReports(projectId: string) {
  return useQuery({
    queryKey: savedReportsQueryKey(projectId),
    queryFn: () => reportsApi.listSavedReports(projectId),
    enabled: Boolean(projectId),
  });
}

/** Errors surface in CustomReportBuilder localError (suppress global banner). */
export function useCreateSavedReport(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { suppressErrorBanner: true },
    mutationFn: (input: { name: string; definition: SavedReportDefinition }) =>
      reportsApi.createSavedReport(projectId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: savedReportsQueryKey(projectId) });
    },
  });
}

export function useUpdateSavedReport(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { suppressErrorBanner: true },
    mutationFn: (input: {
      reportId: string;
      name?: string;
      definition?: SavedReportDefinition;
    }) => {
      const { reportId, ...body } = input;
      return reportsApi.updateSavedReport(projectId, reportId, body);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: savedReportsQueryKey(projectId) });
    },
  });
}

export function useDeleteSavedReport(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { suppressErrorBanner: true },
    mutationFn: (reportId: string) => reportsApi.deleteSavedReport(projectId, reportId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: savedReportsQueryKey(projectId) });
    },
  });
}

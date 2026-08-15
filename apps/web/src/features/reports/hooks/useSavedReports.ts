import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useErrorBanner } from '../../../stores/errorBanner.js';
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

export function useCreateSavedReport(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);
  return useMutation({
    mutationFn: (input: { name: string; definition: SavedReportDefinition }) =>
      reportsApi.createSavedReport(projectId, input),
    onError: (err) => {
      if (err instanceof Error) showBanner(err);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: savedReportsQueryKey(projectId) });
    },
  });
}

export function useUpdateSavedReport(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);
  return useMutation({
    mutationFn: (input: {
      reportId: string;
      name?: string;
      definition?: SavedReportDefinition;
    }) => {
      const { reportId, ...body } = input;
      return reportsApi.updateSavedReport(projectId, reportId, body);
    },
    onError: (err) => {
      if (err instanceof Error) showBanner(err);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: savedReportsQueryKey(projectId) });
    },
  });
}

export function useDeleteSavedReport(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);
  return useMutation({
    mutationFn: (reportId: string) => reportsApi.deleteSavedReport(projectId, reportId),
    onError: (err) => {
      if (err instanceof Error) showBanner(err);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: savedReportsQueryKey(projectId) });
    },
  });
}

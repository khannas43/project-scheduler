import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useErrorBanner } from '../../../stores/errorBanner.js';
import { portfolioDashboardQueryKey } from '../../dashboard/hooks/useDashboard.js';
import * as tasksApi from '../api.js';
import type { ProgressUpdateInput, ProgressUpdateResult } from '../api.js';
import { projectQueryKey } from './useTaskEdit.js';
import { tasksQueryKey } from './useTaskTree.js';

async function invalidateAfterProgress(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: tasksQueryKey(projectId) }),
    queryClient.invalidateQueries({ queryKey: projectQueryKey(projectId) }),
    queryClient.invalidateQueries({ queryKey: portfolioDashboardQueryKey() }),
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'project', projectId] }),
    queryClient.invalidateQueries({ queryKey: ['tracking', projectId] }),
  ]);
}

export function useProgressUpdate(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: (input: ProgressUpdateInput) => tasksApi.updateProjectProgress(projectId, input),
    onError: (err) => {
      if (err instanceof Error) showBanner(err);
    },
    onSuccess: async (result: ProgressUpdateResult) => {
      if (result.dryRun) return;
      await invalidateAfterProgress(queryClient, projectId);
    },
  });
}

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useErrorBanner } from '../../../stores/errorBanner.js';
import { portfolioDashboardQueryKey } from '../../dashboard/hooks/useDashboard.js';
import * as tasksApi from '../api.js';
import type { LevelProjectInput, LevelProjectResult } from '../api.js';
import { projectQueryKey } from './useTaskEdit.js';
import { tasksQueryKey } from './useTaskTree.js';

async function invalidateAfterLevel(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: tasksQueryKey(projectId) }),
    queryClient.invalidateQueries({ queryKey: projectQueryKey(projectId) }),
    queryClient.invalidateQueries({ queryKey: portfolioDashboardQueryKey() }),
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'project', projectId] }),
    queryClient.invalidateQueries({ queryKey: ['resources', projectId] }),
  ]);
}

export function useLevelResources(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: (input: LevelProjectInput) => tasksApi.levelProject(projectId, input),
    onError: (err) => {
      if (err instanceof Error) showBanner(err);
    },
    onSuccess: async (result: LevelProjectResult) => {
      if (result.dryRun) return;
      await invalidateAfterLevel(queryClient, projectId);
    },
  });
}

export function useUndoLevelResources(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: () => tasksApi.undoLevelProject(projectId),
    onError: (err) => {
      if (err instanceof Error) showBanner(err);
    },
    onSuccess: async () => {
      await invalidateAfterLevel(queryClient, projectId);
    },
  });
}

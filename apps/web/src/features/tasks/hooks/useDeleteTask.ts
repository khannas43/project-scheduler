import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useErrorBanner } from '../../../stores/errorBanner.js';
import * as tasksApi from '../api.js';
import { tasksQueryKey } from './useTaskTree.js';

/**
 * Delete a task (and its subtasks via FK cascade) via DELETE /api/tasks/:id.
 * Refetches the tree so WBS/schedule match the server.
 */
export function useDeleteTask(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: (taskId: string) => tasksApi.deleteTask(taskId),

    onError: (err) => {
      if (err instanceof Error) showBanner(err);
    },

    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tasksQueryKey(projectId) });
    },
  });
}

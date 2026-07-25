import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useErrorBanner } from '../../../stores/errorBanner.js';
import * as tasksApi from '../api.js';
import { mergeAffectedIntoTree } from '../optimisticEdit.js';
import type { TaskTreeResponse } from '../types.js';
import { tasksQueryKey } from './useTaskTree.js';

/**
 * Create a dependency via POST /api/dependencies.
 * No optimistic local schedule preview — the server validates the graph
 * (including cycle rejection as SchedulingConflictError → 409).
 * On success, merge affected CPM rows the same way task edits do, and append
 * the created dependency so the Gantt arrow appears without a full refetch.
 */
export function useCreateDependency(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: (input: { predecessorId: string; successorId: string }) =>
      tasksApi.createDependency({
        predecessorId: input.predecessorId,
        successorId: input.successorId,
        linkType: 'FS',
        lagMinutes: 0,
      }),

    onError: (err) => {
      // Includes scheduling_conflict (cycle) — detail is the user-facing message.
      if (err instanceof Error) {
        showBanner(err);
      }
    },

    onSuccess: (res) => {
      const key = tasksQueryKey(projectId);
      const current = queryClient.getQueryData<TaskTreeResponse>(key);
      if (!current) {
        void queryClient.invalidateQueries({ queryKey: key });
        return;
      }

      const merged = mergeAffectedIntoTree(current, res);
      const already = merged.dependencies.some((d) => d.id === res.dependency.id);
      queryClient.setQueryData<TaskTreeResponse>(key, {
        ...merged,
        dependencies: already ? merged.dependencies : [...merged.dependencies, res.dependency],
      });
    },
  });
}

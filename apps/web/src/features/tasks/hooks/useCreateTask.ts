import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useErrorBanner } from '../../../stores/errorBanner.js';
import * as tasksApi from '../api.js';
import type { TaskRow } from '../types.js';
import { tasksQueryKey } from './useTaskTree.js';

export type CreateTaskInput = {
  readonly name: string;
  readonly parentId?: string | null;
  /** Outline placement, e.g. `2.5` or `2.5.1` — inserts and renumbers siblings. */
  readonly placeAtWbs?: string;
  readonly isSummary?: boolean;
  readonly isMilestone?: boolean;
  readonly durationMinutes?: number | null;
};

/**
 * Create a task (or subtask) via POST /api/projects/:id/tasks.
 * Refetches the full tree afterwards so WBS codes, parent promotion, and
 * CPM dates from the server land in one go.
 */
export function useCreateTask(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: (input: CreateTaskInput): Promise<TaskRow> =>
      tasksApi.createTask(projectId, {
        name: input.name,
        parentId: input.parentId ?? null,
        ...(input.placeAtWbs ? { placeAtWbs: input.placeAtWbs } : {}),
        isSummary: input.isSummary ?? false,
        isMilestone: input.isSummary ? false : (input.isMilestone ?? false),
        durationMinutes: input.isSummary
          ? null
          : input.isMilestone
            ? 0
            : (input.durationMinutes ?? 480),
      }),

    onError: (err) => {
      if (err instanceof Error) showBanner(err);
    },

    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tasksQueryKey(projectId) });
    },
  });
}

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '../../../lib/apiClient.js';
import { useErrorBanner } from '../../../stores/errorBanner.js';
import { projectsApi, type Project } from '../../projects/index.js';
import * as tasksApi from '../api.js';
import { applyOptimisticEdit, mergeAffectedIntoTree } from '../optimisticEdit.js';
import type { TaskEditPatch, TaskTreeResponse } from '../types.js';
import { tasksQueryKey } from './useTaskTree.js';

export const projectQueryKey = (projectId: string) => ['project', projectId] as const;

/**
 * §7.2 optimistic edit cycle: local schedule preview in the query cache,
 * PATCH over the wire, reconcile via affected set (or restore snapshot on error).
 */
export function useTaskEdit(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: (patch: TaskEditPatch) => {
      const { taskId, ...body } = patch;
      return tasksApi.patchTask(taskId, body);
    },

    onMutate: async (patch) => {
      const key = tasksQueryKey(projectId);
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<TaskTreeResponse>(key);

      let project = queryClient.getQueryData<Project>(projectQueryKey(projectId));
      if (!project) {
        project = await projectsApi.getProject(projectId);
        queryClient.setQueryData(projectQueryKey(projectId), project);
      }

      if (snapshot && project) {
        const next = applyOptimisticEdit(snapshot, project, patch);
        queryClient.setQueryData(key, next);
      }

      return { snapshot };
    },

    onError: (err, _patch, ctx) => {
      if (ctx?.snapshot) {
        queryClient.setQueryData(tasksQueryKey(projectId), ctx.snapshot);
      }
      if (err instanceof ApiError && err.status === 409) {
        showBanner(err, {
          actionLabel: 'Reload to see the latest version',
          onAction: () => {
            void queryClient.invalidateQueries({ queryKey: tasksQueryKey(projectId) });
            void queryClient.invalidateQueries({ queryKey: projectQueryKey(projectId) });
          },
        });
        return;
      }
      if (err instanceof Error) {
        showBanner(err);
      }
    },

    onSuccess: (res) => {
      const key = tasksQueryKey(projectId);
      const current = queryClient.getQueryData<TaskTreeResponse>(key);
      if (!current) return;
      queryClient.setQueryData(key, mergeAffectedIntoTree(current, res));
    },
  });
}

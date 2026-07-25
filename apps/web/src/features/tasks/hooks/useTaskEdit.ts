import { useMutation, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '../../../lib/apiClient.js';
import { useErrorBanner } from '../../../stores/errorBanner.js';
import { projectsApi, type Project } from '../../projects/index.js';
import * as tasksApi from '../api.js';
import { applyOptimisticEdit, mergeAffectedIntoTree } from '../optimisticEdit.js';
import type { TaskTreeResponse } from '../types.js';
import { buildUndoCommand, useUndoStack, type TaskEditVariables } from '../undoStack.js';
import { tasksQueryKey } from './useTaskTree.js';

export const projectQueryKey = (projectId: string) => ['project', projectId] as const;

type MutateContext = {
  snapshot: TaskTreeResponse | undefined;
};

/**
 * §7.2 optimistic edit cycle: local schedule preview in the query cache,
 * PATCH over the wire, reconcile via affected set (or restore snapshot on error).
 * Successful user edits (source !== undo/redo) push onto the undo stack.
 */
export function useTaskEdit(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: (vars: TaskEditVariables) => {
      const { taskId, source: _source, ...body } = vars;
      void _source;
      return tasksApi.patchTask(taskId, body);
    },

    onMutate: async (vars) => {
      const key = tasksQueryKey(projectId);
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<TaskTreeResponse>(key);

      let project = queryClient.getQueryData<Project>(projectQueryKey(projectId));
      if (!project) {
        project = await projectsApi.getProject(projectId);
        queryClient.setQueryData(projectQueryKey(projectId), project);
      }

      if (snapshot && project) {
        const next = applyOptimisticEdit(snapshot, project, vars);
        queryClient.setQueryData(key, next);
      }

      return { snapshot } satisfies MutateContext;
    },

    onError: (err, vars, ctx) => {
      if (ctx?.snapshot) {
        queryClient.setQueryData(tasksQueryKey(projectId), ctx.snapshot);
      }

      const source = vars.source ?? 'user';
      if (source === 'undo') {
        useUndoStack.getState().cancelUndo();
      } else if (source === 'redo') {
        useUndoStack.getState().cancelRedo();
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

    onSuccess: (res, vars, ctx) => {
      const key = tasksQueryKey(projectId);
      const current = queryClient.getQueryData<TaskTreeResponse>(key);
      if (current) {
        queryClient.setQueryData(key, mergeAffectedIntoTree(current, res));
      }

      const override = res.warnings?.find((w) => w.code === 'CONSTRAINT_OVERRIDES_DEPENDENCY');
      if (override) {
        useErrorBanner.getState().showInfo(override.message, override.code);
      }

      const source = vars.source ?? 'user';
      if (source !== 'user') return;

      const task = ctx?.snapshot?.tasks.find((t) => t.id === vars.taskId);
      if (!task) return;
      const command = buildUndoCommand(task, vars);
      if (command) {
        useUndoStack.getState().push(command);
      }
    },
  });
}

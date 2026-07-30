import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '../../../lib/apiClient.js';
import { useErrorBanner } from '../../../stores/errorBanner.js';
import * as tasksApi from '../../tasks/api.js';
import { tasksQueryKey } from '../../tasks/hooks/useTaskTree.js';
import type { TaskEditPatch, TaskRow } from '../../tasks/types.js';
import * as boardApi from '../api.js';
import type { CreateBoardColumnInput, UpdateBoardColumnInput } from '../types.js';

export function boardColumnsQueryKey(projectId: string) {
  return ['board-columns', projectId] as const;
}

export function useBoardColumns(projectId: string) {
  return useQuery({
    queryKey: boardColumnsQueryKey(projectId),
    queryFn: () => boardApi.listBoardColumns(projectId),
    enabled: Boolean(projectId),
  });
}

function showMutationError(
  showBanner: (err: ApiError | Error) => void,
  err: unknown,
): void {
  if (err instanceof ApiError) {
    showBanner(err);
    return;
  }
  if (err instanceof Error) {
    showBanner(err);
  }
}

export function useCreateBoardColumn(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: (input: CreateBoardColumnInput) => boardApi.createBoardColumn(projectId, input),
    onError: (err) => showMutationError(showBanner, err),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: boardColumnsQueryKey(projectId) });
    },
  });
}

export function useUpdateBoardColumn(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: ({ columnId, input }: { columnId: string; input: UpdateBoardColumnInput }) =>
      boardApi.updateBoardColumn(columnId, input),
    onError: (err) => showMutationError(showBanner, err),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: boardColumnsQueryKey(projectId) });
    },
  });
}

export function useDeleteBoardColumn(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: (columnId: string) => boardApi.deleteBoardColumn(columnId),
    onError: (err) => showMutationError(showBanner, err),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: boardColumnsQueryKey(projectId) });
      await queryClient.invalidateQueries({ queryKey: tasksQueryKey(projectId) });
    },
  });
}

export function useMoveTaskBoardColumn(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: ({
      taskId,
      boardColumnId,
    }: {
      taskId: string;
      boardColumnId: string | null;
    }): Promise<TaskRow> => tasksApi.moveTaskBoardColumn(taskId, boardColumnId),
    onError: (err) => showMutationError(showBanner, err),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tasksQueryKey(projectId) });
    },
  });
}

export function useReorderBacklogRank(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: ({
      taskId,
      beforeTaskId,
      afterTaskId,
    }: {
      taskId: string;
      beforeTaskId?: string | null;
      afterTaskId?: string | null;
    }): Promise<TaskRow> =>
      tasksApi.reorderBacklogRank(taskId, { beforeTaskId, afterTaskId }),
    onError: (err) => showMutationError(showBanner, err),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tasksQueryKey(projectId) });
    },
  });
}

/** Lightweight sprint assignment from the backlog (no full undo/optimistic path). */
export function usePatchTaskSprint(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: (patch: Pick<TaskEditPatch, 'taskId' | 'version' | 'sprintId'>) => {
      const { taskId, ...body } = patch;
      return tasksApi.patchTask(taskId, body);
    },
    onError: (err) => showMutationError(showBanner, err),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tasksQueryKey(projectId) });
    },
  });
}

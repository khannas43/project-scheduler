import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '../../../lib/apiClient.js';
import { useErrorBanner } from '../../../stores/errorBanner.js';
import { tasksQueryKey } from '../../tasks/hooks/useTaskTree.js';
import * as sprintsApi from '../api.js';
import type { CloseSprintInput, CreateSprintInput, UpdateSprintInput } from '../types.js';

export function sprintsQueryKey(projectId: string) {
  return ['sprints', projectId] as const;
}

export function useSprints(projectId: string) {
  return useQuery({
    queryKey: sprintsQueryKey(projectId),
    queryFn: () => sprintsApi.listSprints(projectId),
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

export function useCreateSprint(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: (input: CreateSprintInput) => sprintsApi.createSprint(projectId, input),
    onError: (err) => showMutationError(showBanner, err),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sprintsQueryKey(projectId) });
    },
  });
}

export function useUpdateSprint(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: ({ sprintId, input }: { sprintId: string; input: UpdateSprintInput }) =>
      sprintsApi.updateSprint(sprintId, input),
    onError: (err) => showMutationError(showBanner, err),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sprintsQueryKey(projectId) });
      await queryClient.invalidateQueries({ queryKey: tasksQueryKey(projectId) });
    },
  });
}

export function useDeleteSprint(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: (sprintId: string) => sprintsApi.deleteSprint(sprintId),
    onError: (err) => showMutationError(showBanner, err),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sprintsQueryKey(projectId) });
      await queryClient.invalidateQueries({ queryKey: tasksQueryKey(projectId) });
    },
  });
}

export function useCloseSprint(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: ({
      sprintId,
      input,
    }: {
      sprintId: string;
      input?: CloseSprintInput;
    }) => sprintsApi.closeSprint(sprintId, input ?? {}),
    onError: (err) => showMutationError(showBanner, err),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sprintsQueryKey(projectId) });
      await queryClient.invalidateQueries({ queryKey: tasksQueryKey(projectId) });
    },
  });
}

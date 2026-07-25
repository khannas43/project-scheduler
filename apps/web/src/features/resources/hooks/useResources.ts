import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '../../../lib/apiClient.js';
import { useErrorBanner } from '../../../stores/errorBanner.js';
import * as resourcesApi from '../api.js';
import type { CreateResourceInput, UpdateResourceInput } from '../types.js';

export function resourcesQueryKey(projectId: string) {
  return ['resources', projectId] as const;
}

export function overallocationsQueryKey(projectId: string, resourceId: string) {
  return ['resources', projectId, 'overallocations', resourceId] as const;
}

export function useResources(projectId: string) {
  return useQuery({
    queryKey: resourcesQueryKey(projectId),
    queryFn: () => resourcesApi.listResources(projectId),
    enabled: Boolean(projectId),
  });
}

/**
 * Day-bucket overallocation for one resource.
 * `enabled` defaults false — callers (e.g. a mounted badge) opt in so closed/unmounted rows don't fetch.
 */
export function useOverallocations(
  projectId: string,
  resourceId: string,
  enabled = false,
) {
  return useQuery({
    queryKey: overallocationsQueryKey(projectId, resourceId),
    queryFn: () => resourcesApi.getOverallocations(projectId, resourceId),
    enabled: Boolean(projectId && resourceId && enabled),
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

export function useCreateResource(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: (input: CreateResourceInput) => resourcesApi.createResource(projectId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: resourcesQueryKey(projectId) });
    },
    onError: (err) => showMutationError(showBanner, err),
  });
}

export function useUpdateResource(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateResourceInput }) =>
      resourcesApi.updateResource(projectId, id, patch),
    onSuccess: async (_res, vars) => {
      await queryClient.invalidateQueries({ queryKey: resourcesQueryKey(projectId) });
      await queryClient.invalidateQueries({
        queryKey: overallocationsQueryKey(projectId, vars.id),
      });
    },
    onError: (err) => showMutationError(showBanner, err),
  });
}

export function useDeleteResource(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: (id: string) => resourcesApi.deleteResource(projectId, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: resourcesQueryKey(projectId) });
    },
    onError: (err) => showMutationError(showBanner, err),
  });
}

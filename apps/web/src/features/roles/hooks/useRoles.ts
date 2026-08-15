import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as rolesApi from '../api.js';
import type { CreateRoleInput, UpdateRoleInput } from '../types.js';

export function rolesQueryKey(projectId: string) {
  return ['roles', projectId] as const;
}

export function permissionsQueryKey(projectId: string) {
  return ['permissions', projectId] as const;
}

export function useRoles(projectId: string) {
  return useQuery({
    queryKey: rolesQueryKey(projectId),
    queryFn: () => rolesApi.listRoles(projectId),
    enabled: Boolean(projectId),
  });
}

export function usePermissions(projectId: string) {
  return useQuery({
    queryKey: permissionsQueryKey(projectId),
    queryFn: () => rolesApi.listPermissions(projectId),
    enabled: Boolean(projectId),
  });
}

/** Errors surface in the role modal form (suppress global banner). */
export function useCreateRole(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    meta: { suppressErrorBanner: true },
    mutationFn: (input: CreateRoleInput) => rolesApi.createRole(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: rolesQueryKey(projectId) });
    },
  });
}

/** Errors surface in the role modal form (suppress global banner). */
export function useUpdateRole(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    meta: { suppressErrorBanner: true },
    mutationFn: ({ roleId, patch }: { roleId: string; patch: UpdateRoleInput }) =>
      rolesApi.updateRole(roleId, patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: rolesQueryKey(projectId) });
    },
  });
}

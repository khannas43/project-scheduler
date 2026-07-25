import { apiRequest } from '../../lib/apiClient.js';

import type { CreateRoleInput, Permission, Role, UpdateRoleInput } from './types.js';

export function listRoles(projectId: string): Promise<Role[]> {
  const qs = new URLSearchParams({ projectId });
  return apiRequest<Role[]>(`/api/roles?${qs}`);
}

export function listPermissions(projectId: string): Promise<Permission[]> {
  const qs = new URLSearchParams({ projectId });
  return apiRequest<Permission[]>(`/api/permissions?${qs}`);
}

export function createRole(input: CreateRoleInput): Promise<Role> {
  return apiRequest<Role>('/api/roles', {
    method: 'POST',
    body: input,
  });
}

export function updateRole(roleId: string, patch: UpdateRoleInput): Promise<Role> {
  return apiRequest<Role>(`/api/roles/${roleId}`, {
    method: 'PATCH',
    body: patch,
  });
}

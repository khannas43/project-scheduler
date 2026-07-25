import { apiRequest } from '../../lib/apiClient.js';

import type {
  CreateResourceInput,
  OverallocationDay,
  Resource,
  UpdateResourceInput,
} from './types.js';

export function listResources(projectId: string): Promise<Resource[]> {
  const qs = new URLSearchParams({ projectId });
  return apiRequest<Resource[]>(`/api/resources?${qs}`);
}

export function createResource(
  projectId: string,
  input: CreateResourceInput,
): Promise<Resource> {
  return apiRequest<Resource>('/api/resources', {
    method: 'POST',
    body: { projectId, ...input },
  });
}

export function updateResource(
  projectId: string,
  id: string,
  patch: UpdateResourceInput,
): Promise<Resource> {
  return apiRequest<Resource>(`/api/resources/${id}`, {
    method: 'PATCH',
    body: { projectId, ...patch },
  });
}

/** DELETE uses body.projectId (API choice — matches PATCH/POST mutations). */
export function deleteResource(
  projectId: string,
  id: string,
): Promise<{ deleted: true }> {
  return apiRequest<{ deleted: true }>(`/api/resources/${id}`, {
    method: 'DELETE',
    body: { projectId },
  });
}

export function getOverallocations(
  projectId: string,
  resourceId: string,
): Promise<OverallocationDay[]> {
  const qs = new URLSearchParams({ projectId });
  return apiRequest<OverallocationDay[]>(`/api/resources/${resourceId}/overallocations?${qs}`);
}

import { apiRequest } from '../../lib/apiClient.js';

import type {
  CloseSprintInput,
  CloseSprintResult,
  CreateSprintInput,
  SprintRow,
  UpdateSprintInput,
} from './types.js';

export function listSprints(projectId: string): Promise<SprintRow[]> {
  return apiRequest<SprintRow[]>(`/api/projects/${projectId}/sprints`);
}

export function createSprint(projectId: string, input: CreateSprintInput): Promise<SprintRow> {
  return apiRequest<SprintRow>(`/api/projects/${projectId}/sprints`, {
    method: 'POST',
    body: input,
  });
}

export function updateSprint(sprintId: string, input: UpdateSprintInput): Promise<SprintRow> {
  return apiRequest<SprintRow>(`/api/sprints/${sprintId}`, {
    method: 'PATCH',
    body: input,
  });
}

export function closeSprint(
  sprintId: string,
  input: CloseSprintInput = {},
): Promise<CloseSprintResult> {
  return apiRequest<CloseSprintResult>(`/api/sprints/${sprintId}/close`, {
    method: 'POST',
    body: input,
  });
}

export function deleteSprint(sprintId: string): Promise<void> {
  return apiRequest<void>(`/api/sprints/${sprintId}`, {
    method: 'DELETE',
  });
}

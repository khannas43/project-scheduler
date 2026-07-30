import { apiRequest } from '../../lib/apiClient.js';

import type { SprintPointsSummary, VelocitySprintRow } from './types.js';

export function getProjectVelocity(projectId: string): Promise<VelocitySprintRow[]> {
  return apiRequest<VelocitySprintRow[]>(`/api/projects/${projectId}/velocity`);
}

export function getSprintPointsSummary(sprintId: string): Promise<SprintPointsSummary> {
  return apiRequest<SprintPointsSummary>(`/api/sprints/${sprintId}/points-summary`);
}

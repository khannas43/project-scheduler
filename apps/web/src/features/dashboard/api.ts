import { apiRequest } from '../../lib/apiClient.js';

import type { ProjectDashboard, ProjectDashboardSummary } from './types.js';

export function getProjectDashboard(projectId: string): Promise<ProjectDashboard> {
  return apiRequest<ProjectDashboard>(`/api/projects/${projectId}/dashboard`);
}

export function getPortfolioDashboard(): Promise<ProjectDashboardSummary[]> {
  return apiRequest<ProjectDashboardSummary[]>('/api/dashboard/portfolio');
}

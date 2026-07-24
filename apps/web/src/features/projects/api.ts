import { apiRequest } from '../../lib/apiClient.js';

export interface Project {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: string;
  readonly startDate: string | null;
  readonly finishDate: string | null;
  readonly calendarId: string;
  readonly ownerId: string;
  readonly isArchived: boolean;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateProjectInput {
  readonly name: string;
  readonly description?: string | null;
  readonly status: string;
  readonly startDate?: string | null;
}

export function listProjects(): Promise<Project[]> {
  return apiRequest<Project[]>('/api/projects');
}

export function createProject(input: CreateProjectInput): Promise<Project> {
  return apiRequest<Project>('/api/projects', {
    method: 'POST',
    body: input,
  });
}

export function getProject(projectId: string): Promise<Project> {
  return apiRequest<Project>(`/api/projects/${projectId}`);
}

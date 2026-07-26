import type { ProjectSettings, ProjectSettingsPatch } from '@pkg/schema';

import { apiRequest } from '../../lib/apiClient.js';
import { projectSettingsOf } from './dateFormat.js';

export interface Project {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: string;
  readonly startDate: string | null;
  readonly finishDate: string | null;
  readonly statusDate: string | null;
  readonly calendarId: string;
  readonly ownerId: string;
  readonly isArchived: boolean;
  readonly settings: ProjectSettings;
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

export interface UpdateProjectInput {
  readonly version: number;
  readonly name?: string;
  readonly description?: string | null;
  readonly status?: string;
  readonly startDate?: string | null;
  readonly statusDate?: string | null;
  readonly calendarId?: string;
  readonly isArchived?: boolean;
  readonly settings?: ProjectSettingsPatch;
}

function normalizeProject(raw: Project): Project {
  return {
    ...raw,
    statusDate: raw.statusDate ?? null,
    settings: projectSettingsOf(raw.settings),
  };
}

export async function listProjects(): Promise<Project[]> {
  const rows = await apiRequest<Project[]>('/api/projects');
  return rows.map(normalizeProject);
}

export function createProject(input: CreateProjectInput): Promise<Project> {
  return apiRequest<Project>('/api/projects', {
    method: 'POST',
    body: input,
  }).then(normalizeProject);
}

export function getProject(projectId: string): Promise<Project> {
  return apiRequest<Project>(`/api/projects/${projectId}`).then(normalizeProject);
}

export function updateProject(projectId: string, input: UpdateProjectInput): Promise<Project> {
  return apiRequest<Project>(`/api/projects/${projectId}`, {
    method: 'PATCH',
    body: input,
  }).then(normalizeProject);
}

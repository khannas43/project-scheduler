import type { ProjectSettings, ProjectSettingsPatch } from '@pkg/schema';

import { apiRequest, apiRequestBlob, downloadBlob } from '../../lib/apiClient.js';
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
  readonly category: string | null;
  readonly templateKey: string | null;
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

export interface CreateProjectFromSpreadsheetInput extends CreateProjectInput {
  readonly filename: string;
  readonly contentBase64: string;
}

export interface CreateProjectFromSpreadsheetResult extends Project {
  readonly taskCount: number;
  readonly dependencyCount: number;
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

export interface ProjectTemplateCategory {
  readonly key: string;
  readonly name: string;
  readonly description: string;
}

export interface ProjectTemplate {
  readonly key: string;
  readonly categoryKey: string;
  readonly name: string;
  readonly description: string;
  readonly durationHint: string;
  readonly taskCount: number;
}

export interface ProjectTemplateCatalog {
  readonly categories: readonly ProjectTemplateCategory[];
  readonly templates: readonly ProjectTemplate[];
}

export interface CreateProjectFromTemplateInput extends CreateProjectInput {
  readonly templateKey: string;
}

export interface CreateProjectFromTemplateResult extends Project {
  readonly taskCount: number;
  readonly dependencyCount: number;
}

function normalizeProject(raw: Project): Project {
  return {
    ...raw,
    statusDate: raw.statusDate ?? null,
    category: raw.category ?? null,
    templateKey: raw.templateKey ?? null,
    settings: projectSettingsOf(raw.settings),
  };
}

export async function listProjects(): Promise<Project[]> {
  const rows = await apiRequest<Project[]>('/api/projects');
  return rows.map(normalizeProject);
}

export function listProjectTemplates(): Promise<ProjectTemplateCatalog> {
  return apiRequest<ProjectTemplateCatalog>('/api/project-templates');
}

export function createProjectFromTemplate(
  input: CreateProjectFromTemplateInput,
): Promise<CreateProjectFromTemplateResult> {
  return apiRequest<CreateProjectFromTemplateResult>('/api/projects/from-template', {
    method: 'POST',
    body: input,
  }).then((raw) => ({
    ...normalizeProject(raw),
    taskCount: raw.taskCount,
    dependencyCount: raw.dependencyCount,
  }));
}

export function createProject(input: CreateProjectInput): Promise<Project> {
  return apiRequest<Project>('/api/projects', {
    method: 'POST',
    body: input,
  }).then(normalizeProject);
}

export function createProjectFromSpreadsheet(
  input: CreateProjectFromSpreadsheetInput,
): Promise<CreateProjectFromSpreadsheetResult> {
  return apiRequest<CreateProjectFromSpreadsheetResult>('/api/projects/from-spreadsheet', {
    method: 'POST',
    body: input,
  }).then((raw) => ({
    ...normalizeProject(raw),
    taskCount: raw.taskCount,
    dependencyCount: raw.dependencyCount,
  }));
}

export async function downloadImportTemplate(format: 'csv' | 'xlsx'): Promise<void> {
  const { blob, filename } = await apiRequestBlob(`/api/projects/import-template.${format}`);
  downloadBlob(blob, filename ?? `project-import-template.${format}`);
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

export function deleteProject(projectId: string): Promise<void> {
  return apiRequest<void>(`/api/projects/${projectId}`, {
    method: 'DELETE',
  });
}

export type SpreadsheetImportMode = 'replace' | 'merge';

export interface ImportSpreadsheetIntoProjectInput {
  readonly filename: string;
  readonly contentBase64: string;
  readonly mode: SpreadsheetImportMode;
}

export interface ImportSpreadsheetIntoProjectResult {
  readonly mode: SpreadsheetImportMode;
  readonly taskCount: number;
  readonly dependencyCount: number;
  readonly projectVersion: number;
  readonly createdTaskIds: readonly string[];
}

/** POST /api/projects/:id/import/spreadsheet */
export function importSpreadsheetIntoProject(
  projectId: string,
  input: ImportSpreadsheetIntoProjectInput,
): Promise<ImportSpreadsheetIntoProjectResult> {
  return apiRequest<ImportSpreadsheetIntoProjectResult>(
    `/api/projects/${projectId}/import/spreadsheet`,
    { method: 'POST', body: input },
  );
}

export interface DuplicateProjectResult extends Project {
  readonly taskCount: number;
  readonly assignmentCount: number;
}

/** POST /api/projects/:id/duplicate */
export function duplicateProject(
  projectId: string,
  input: { name?: string } = {},
): Promise<DuplicateProjectResult> {
  return apiRequest<DuplicateProjectResult>(`/api/projects/${projectId}/duplicate`, {
    method: 'POST',
    body: input,
  }).then((raw) => ({
    ...normalizeProject(raw),
    taskCount: raw.taskCount,
    assignmentCount: raw.assignmentCount,
  }));
}

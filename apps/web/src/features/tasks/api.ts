import { apiRequest } from '../../lib/apiClient.js';

import type {
  AssignmentRow,
  DependencyMutationResponse,
  TaskEditPatch,
  TaskMutationResponse,
  TaskTreeResponse,
} from './types.js';

/** §5.3 — full flat tree + calendars + projectVersion. */
export function getTaskTree(projectId: string): Promise<TaskTreeResponse> {
  return apiRequest<TaskTreeResponse>(`/api/projects/${projectId}/tasks`);
}

/** §5.4 — PATCH returns the focus task, affected CPM rows, and bumped projectVersion. */
export function patchTask(
  taskId: string,
  patch: Omit<TaskEditPatch, 'taskId'>,
): Promise<TaskMutationResponse> {
  const { version, ...rest } = patch;
  return apiRequest<TaskMutationResponse>(`/api/tasks/${taskId}`, {
    method: 'PATCH',
    body: { version, ...rest },
  });
}

/** POST /api/dependencies — create FS (etc.) link; server validates graph (cycle → 409). */
export function createDependency(input: {
  predecessorId: string;
  successorId: string;
  linkType: 'FS';
  lagMinutes: 0;
}): Promise<DependencyMutationResponse> {
  return apiRequest<DependencyMutationResponse>('/api/dependencies', {
    method: 'POST',
    body: input,
  });
}

/** POST /api/assignments — returns the created assignment row (no MutationResult wrapper). */
export function createAssignment(input: {
  taskId: string;
  resourceId: string;
  units?: number | null;
}): Promise<AssignmentRow> {
  return apiRequest<AssignmentRow>('/api/assignments', {
    method: 'POST',
    body: input,
  });
}

export function updateAssignment(
  assignmentId: string,
  input: { units: number },
): Promise<AssignmentRow> {
  return apiRequest<AssignmentRow>(`/api/assignments/${assignmentId}`, {
    method: 'PATCH',
    body: input,
  });
}

export function deleteAssignment(assignmentId: string): Promise<{ deleted: true }> {
  return apiRequest<{ deleted: true }>(`/api/assignments/${assignmentId}`, {
    method: 'DELETE',
  });
}

/** Timephased planned-work buckets for one assignment (§3.5). */
export interface AssignmentTimephasedRow {
  readonly id: string;
  readonly assignmentId: string;
  readonly periodDate: string;
  readonly plannedWorkMinutes: number | null;
  readonly actualWorkMinutes: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function getAssignmentTimephased(
  assignmentId: string,
): Promise<AssignmentTimephasedRow[]> {
  return apiRequest<AssignmentTimephasedRow[]>(`/api/assignments/${assignmentId}/timephased`);
}

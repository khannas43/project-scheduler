import { apiRequest } from '../../lib/apiClient.js';

import type {
  AssignmentRow,
  DependencyMutationResponse,
  TaskEditPatch,
  TaskMutationResponse,
  TaskRow,
  TaskTreeResponse,
} from './types.js';

/** §5.3 — full flat tree + calendars + projectVersion. */
export function getTaskTree(projectId: string): Promise<TaskTreeResponse> {
  return apiRequest<TaskTreeResponse>(`/api/projects/${projectId}/tasks`);
}

/** POST /api/projects/:id/tasks — create root task or subtask under parentId. */
export function createTask(
  projectId: string,
  input: {
    name: string;
    parentId?: string | null;
    placeAtWbs?: string;
    isSummary?: boolean;
    durationMinutes?: number | null;
    isMilestone?: boolean;
  },
): Promise<TaskRow> {
  return apiRequest<TaskRow>(`/api/projects/${projectId}/tasks`, {
    method: 'POST',
    body: input,
  });
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

/** DELETE /api/dependencies/:id — remove link and reschedule. */
export function deleteDependency(dependencyId: string): Promise<TaskMutationResponse> {
  return apiRequest<TaskMutationResponse>(`/api/dependencies/${dependencyId}`, {
    method: 'DELETE',
  });
}

/** DELETE /api/tasks/:id — removes the task (and cascaded subtasks) then reschedules. */
export function deleteTask(taskId: string): Promise<TaskMutationResponse> {
  return apiRequest<TaskMutationResponse>(`/api/tasks/${taskId}`, {
    method: 'DELETE',
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

export interface AssignmentUpdateInput {
  readonly units?: number;
  readonly workMinutes?: number;
  readonly cost?: number | null;
  readonly actualWorkMinutes?: number | null;
  readonly actualCost?: number | null;
}

export function updateAssignment(
  assignmentId: string,
  input: AssignmentUpdateInput,
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

export interface TimephasedDayUpdateInput {
  readonly periodDate: string;
  readonly units?: number;
  readonly plannedWorkMinutes?: number;
}

export interface TimephasedDayUpdateResult {
  readonly assignment: AssignmentRow;
  readonly timephased: readonly AssignmentTimephasedRow[];
}

/** PATCH one calendar day's planned work for an assignment (keeps other days intact). */
export function updateAssignmentTimephasedDay(
  assignmentId: string,
  input: TimephasedDayUpdateInput,
): Promise<TimephasedDayUpdateResult> {
  return apiRequest<TimephasedDayUpdateResult>(`/api/assignments/${assignmentId}/timephased`, {
    method: 'PATCH',
    body: input,
  });
}

import { apiRequest } from '../../lib/apiClient.js';

import type { TaskEditPatch, TaskMutationResponse, TaskTreeResponse } from './types.js';

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

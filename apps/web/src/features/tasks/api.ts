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

/** POST /api/tasks/:id/backlog-rank */
export function reorderBacklogRank(
  taskId: string,
  neighbors: {
    beforeTaskId?: string | null | undefined;
    afterTaskId?: string | null | undefined;
  },
): Promise<TaskRow> {
  return apiRequest<TaskRow>(`/api/tasks/${taskId}/backlog-rank`, {
    method: 'POST',
    body: neighbors,
  });
}

/** POST /api/tasks/:id/board-column */
export function moveTaskBoardColumn(
  taskId: string,
  boardColumnId: string | null,
): Promise<TaskRow> {
  return apiRequest<TaskRow>(`/api/tasks/${taskId}/board-column`, {
    method: 'POST',
    body: { boardColumnId },
  });
}

export interface LevelingMove {
  readonly taskId: string;
  readonly taskName: string;
  readonly resourceId: string;
  readonly resourceName: string;
  readonly fromStart: string;
  readonly toStart: string;
  readonly delayMinutes: number;
  readonly constraintType: 'snet';
  readonly constraintDate: string;
  readonly reason: string;
}

export interface EligibleLevelingTask {
  readonly taskId: string;
  readonly taskName: string;
  readonly resourceNames: readonly string[];
}

export interface LevelProjectResult {
  readonly dryRun: boolean;
  readonly moves: readonly LevelingMove[];
  readonly remainingOverallocations: readonly {
    readonly resourceId: string;
    readonly resourceName: string;
    readonly days: readonly { date: string; totalUnits: number; maxUnits: number }[];
  }[];
  readonly eligibleTasks: readonly EligibleLevelingTask[];
  readonly projectVersion?: number;
  readonly canUndo?: boolean;
}

export interface LevelUndoResult {
  readonly restoredTaskCount: number;
  readonly projectVersion: number;
}

export interface LevelProjectInput {
  readonly dryRun?: boolean;
  readonly resourceIds?: readonly string[];
  /** When set, only these tasks may be delayed; others still count toward load. */
  readonly taskIds?: readonly string[];
  readonly withinFloat?: 'free' | 'total';
  readonly maxMoves?: number;
}

/** POST /api/projects/:id/level — preview (dryRun) or apply resource leveling. */
export function levelProject(
  projectId: string,
  input: LevelProjectInput = {},
): Promise<LevelProjectResult> {
  return apiRequest<LevelProjectResult>(`/api/projects/${projectId}/level`, {
    method: 'POST',
    body: input,
  });
}

/** POST /api/projects/:id/level/undo — restore constraints from last apply. */
export function undoLevelProject(projectId: string): Promise<LevelUndoResult> {
  return apiRequest<LevelUndoResult>(`/api/projects/${projectId}/level/undo`, {
    method: 'POST',
    body: {},
  });
}

export interface ProgressEligibleTask {
  readonly taskId: string;
  readonly taskName: string;
  readonly percentComplete: number;
  readonly earlyStart: string | null;
  readonly earlyFinish: string | null;
}

export interface ProgressPercentChange {
  readonly taskId: string;
  readonly taskName: string;
  readonly fromPercent: number;
  readonly toPercent: number;
  readonly actualStart: string | null;
  readonly actualFinish: string | null;
  readonly reason: string;
}

export interface ProgressRescheduleChange {
  readonly taskId: string;
  readonly taskName: string;
  readonly fromStart: string | null;
  readonly toStart: string;
  readonly constraintType: 'snet';
  readonly constraintDate: string;
  readonly reason: string;
}

export interface ProgressUpdateResult {
  readonly dryRun: boolean;
  readonly statusDate: string;
  readonly percentChanges: readonly ProgressPercentChange[];
  readonly rescheduleChanges: readonly ProgressRescheduleChange[];
  readonly eligibleTasks: readonly ProgressEligibleTask[];
  readonly projectVersion?: number;
}

export interface ProgressUpdateInput {
  readonly dryRun?: boolean;
  readonly statusDate: string;
  readonly taskIds?: readonly string[];
  readonly updateAsScheduled?: boolean;
  readonly setPercentComplete?: number;
  readonly rescheduleIncomplete?: boolean;
}

/** POST /api/projects/:id/progress-update — preview or apply status-date progress update. */
export function updateProjectProgress(
  projectId: string,
  input: ProgressUpdateInput,
): Promise<ProgressUpdateResult> {
  return apiRequest<ProgressUpdateResult>(`/api/projects/${projectId}/progress-update`, {
    method: 'POST',
    body: input,
  });
}

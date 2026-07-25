/** Client shapes for §5.3 task-tree + §5.4 mutation responses (ISO timestamps from JSON). */

export type LinkType = 'FS' | 'SS' | 'FF' | 'SF';

export interface TaskRow {
  readonly id: string;
  readonly projectId: string;
  readonly parentId: string | null;
  readonly wbsPath: string | null;
  readonly wbsCode: string | null;
  readonly sortOrder: number | null;
  readonly name: string;
  readonly notes: string | null;
  readonly isMilestone: boolean;
  readonly isSummary: boolean;
  readonly schedulingMode: string;
  readonly durationMinutes: number | null;
  readonly taskType: string | null;
  readonly isEffortDriven: boolean;
  readonly isManuallyScheduled: boolean;
  readonly constraintType: string | null;
  readonly constraintDate: string | null;
  readonly deadline: string | null;
  readonly calendarId: string | null;
  readonly earlyStart: string | null;
  readonly earlyFinish: string | null;
  readonly lateStart: string | null;
  readonly lateFinish: string | null;
  readonly totalFloatMinutes: number | null;
  readonly freeFloatMinutes: number | null;
  readonly isCritical: boolean;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DependencyRow {
  readonly id: string;
  readonly predecessorId: string;
  readonly successorId: string;
  readonly linkType: LinkType | string;
  readonly lagMinutes: number;
  readonly lagPercent: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Assignment row from §5.3 tree — numeric() columns arrive as strings from Drizzle/JSON. */
export interface AssignmentRow {
  readonly id: string;
  readonly taskId: string;
  readonly resourceId: string;
  readonly units: string | null;
  readonly workMinutes: number | null;
  readonly actualWorkMinutes: number | null;
  readonly cost: string | null;
  readonly actualCost: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CalendarRow {
  readonly id: string;
  readonly name: string;
  readonly projectId: string | null;
  readonly workingDays: readonly number[];
  readonly hoursPerDay: string;
  readonly defaultStart: string;
  readonly defaultFinish: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** §5.3 */
export interface TaskTreeResponse {
  readonly tasks: readonly TaskRow[];
  readonly dependencies: readonly DependencyRow[];
  readonly calendars: readonly CalendarRow[];
  readonly assignments: readonly AssignmentRow[];
  readonly projectVersion: number;
}

export interface SchedulingWarningView {
  readonly code: string;
  readonly taskIds: readonly string[];
  readonly message: string;
}

/** §5.4 */
export interface TaskMutationResponse {
  readonly task: TaskRow | null;
  readonly affected: readonly TaskRow[];
  readonly projectVersion: number;
  readonly warnings: readonly SchedulingWarningView[];
}

/** POST /api/dependencies — MutationResult & { dependency } from dependencyService.createDependency. */
export type DependencyMutationResponse = TaskMutationResponse & {
  readonly dependency: DependencyRow;
};

/** Editable fields + optimistic-lock version (§9.1). */
export interface TaskEditPatch {
  readonly taskId: string;
  readonly version: number;
  readonly name?: string;
  readonly durationMinutes?: number | null;
  readonly constraintType?: string | null;
  readonly constraintDate?: string | null;
}

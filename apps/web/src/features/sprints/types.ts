/** Client shapes for sprint API responses. */

export type SprintState = 'planned' | 'active' | 'closed';

export interface SprintRow {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly goal: string | null;
  readonly startDate: string;
  readonly endDate: string;
  /** Story-point capacity; numeric() columns arrive as strings from JSON. */
  readonly capacity: string | null;
  readonly state: SprintState | string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateSprintInput {
  readonly name: string;
  readonly goal?: string | null;
  readonly startDate: string;
  readonly endDate: string;
  readonly capacity?: number | null;
}

export interface UpdateSprintInput {
  readonly version: number;
  readonly name?: string;
  readonly goal?: string | null;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly capacity?: number | null;
  /** Closing must use closeSprint so carry-over cannot be skipped. */
  readonly state?: 'planned' | 'active';
}

export interface CloseSprintInput {
  readonly carryOverToSprintId?: string | null;
}

export interface CloseSprintResult {
  readonly sprint: SprintRow;
  readonly carriedOverTaskIds: readonly string[];
}

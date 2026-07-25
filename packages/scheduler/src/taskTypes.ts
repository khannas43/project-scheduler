import type { CalendarId, TaskId } from './types.js';

export type LinkType = 'FS' | 'SS' | 'FF' | 'SF';

/**
 * The canonical task shape (§4.1's `TaskInput`), shared by every pass.
 * `parentId` only matters to graph validation (§4.3's summary-link check)
 * and summary rollup (§4.7) — the forward/backward passes and float simply
 * ignore it, since it's part of a structurally-compatible superset they all
 * accept.
 */
export interface TaskInput {
  readonly id: TaskId;
  readonly parentId: TaskId | null;
  readonly isSummary: boolean;
  readonly durationMinutes: number;
  readonly calendarId: CalendarId;
}

export interface DependencyInput {
  readonly predecessorId: TaskId;
  readonly successorId: TaskId;
  readonly linkType: LinkType;
  readonly lagMinutes: number;
  /**
   * When a number, replaces `lagMinutes` as a percentage of the predecessor's
   * duration (MS Project convention). `null`/absent means use `lagMinutes`
   * literally. Optional so existing call sites (e.g. apps/api's
   * `toDependencyInputs`) keep compiling until they start passing the column
   * through — absent and `null` are equivalent.
   */
  readonly lagPercent?: number | null;
}

import type { CalendarId, EpochMinutes, TaskId } from './types.js';

export type LinkType = 'FS' | 'SS' | 'FF' | 'SF';

export type ConstraintType = 'asap' | 'alap' | 'snet' | 'snlt' | 'fnet' | 'fnlt' | 'mso' | 'mfo';

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
  /**
   * Optional for call-site compatibility (apps/api's `toTaskInputs` doesn't
   * pass these yet). Absent/`null`/`'asap'` are all unconstrained.
   */
  readonly constraintType?: ConstraintType | null;
  readonly constraintDate?: EpochMinutes | null;
  /**
   * Per-task observational deadline (§4.4 rule 4 / §13 item 30). Never moves
   * the task — if `earlyFinish > deadline`, emit `DEADLINE_MISSED`. Optional
   * so apps/api's `toTaskInputs` keeps compiling until it wires the column.
   */
  readonly deadline?: EpochMinutes | null;
  /**
   * Leaf % complete (0–100). Summaries ignore this input — they get a
   * duration-weighted rollup from children (§4.7). Null/absent → 0 in the
   * weighted sum when this task is a child of a summary.
   */
  readonly percentComplete?: number | null;
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

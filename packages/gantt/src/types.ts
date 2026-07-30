/**
 * Render-oriented shapes for the canvas prototype.
 * Independent of API/Zod create-input schemas — those omit CPM outputs.
 */
export interface GanttTask {
  /** Numeric id for the Float32Array spatial index (§8.4). */
  readonly id: number;
  readonly name: string;
  /** Row index in the flat task list (also vertical position). */
  readonly row: number;
  /** Start offset in minutes from the project origin. */
  readonly startMinutes: number;
  readonly durationMinutes: number;
  /** 0..1 progress for the bars-layer progress fill. */
  readonly progress: number;
  readonly isCritical: boolean;
  /** Summary bars refuse drag-to-move (matches API rejectSummaryDurationOrConstraint). */
  readonly isSummary: boolean;
  /**
   * Agile / sprint bars — amber fill, refuse drag (server cross-mode guards
   * would reject constraint/duration commits).
   */
  readonly isAgile?: boolean;
}

export interface GanttDependency {
  readonly predecessorId: number;
  readonly successorId: number;
}

export interface ViewportState {
  readonly scrollTop: number;
  readonly scrollLeft: number;
  readonly width: number;
  readonly height: number;
}

export interface TimeScale {
  /** Minutes from project origin at scrollLeft = 0. */
  readonly originMinutes: number;
  readonly pixelsPerMinute: number;
}

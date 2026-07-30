import { z } from 'zod';

const TaskTypeSchema = z.enum(['fixed_duration', 'fixed_units', 'fixed_work']);
const ConstraintTypeSchema = z.enum([
  'asap',
  'alap',
  'snet',
  'snlt',
  'fnet',
  'fnlt',
  'mso',
  'mfo',
]);
const SchedulingModeSchema = z.enum(['cpm', 'agile']);

/**
 * Task inbound shapes (§3.3).
 *
 * Omitted by design (API strips via schema omission, not validation):
 * - CPM outputs: earlyStart, earlyFinish, lateStart, lateFinish,
 *   totalFloatMinutes, freeFloatMinutes, isCritical
 * - WBS: wbsPath, wbsCode (auto-generated from tree position)
 * - sortOrder (reorder via TaskMoveInputSchema)
 * - backlogRank (server-computed via POST /api/tasks/:id/backlog-rank)
 * - boardColumnId (set only via POST /api/tasks/:id/board-column)
 *
 * Tracking fields (percentComplete / actuals) are update-only — a new task
 * has no actuals yet (same omission-by-design convention as finishDate).
 *
 * `parentId` is allowed on create for initial placement under a parent;
 * reordering (parentId + sortOrder) uses TaskMoveInputSchema.
 */
export const TaskCreateInputSchema = z.object({
  projectId: z.uuid(),
  parentId: z.uuid().nullable().optional(),
  /**
   * Optional insert position as an outline code (`2.5`, `2.5.1`).
   * Server places the task there and renumbers later siblings; the stored
   * `wbsCode`/`wbsPath` remain server-owned.
   */
  placeAtWbs: z
    .string()
    .regex(/^\d+(\.\d+)*$/, 'placeAtWbs must look like 2.5 or 2.5.1')
    .optional(),
  name: z.string().min(1),
  notes: z.string().nullable().optional(),
  isMilestone: z.boolean().optional(),
  isSummary: z.boolean().optional(),
  schedulingMode: SchedulingModeSchema.optional(),
  durationMinutes: z.number().int().nonnegative().nullable().optional(),
  taskType: TaskTypeSchema.nullable().optional(),
  isEffortDriven: z.boolean().optional(),
  isManuallyScheduled: z.boolean().optional(),
  constraintType: ConstraintTypeSchema.nullable().optional(),
  constraintDate: z.iso.datetime().nullable().optional(),
  deadline: z.iso.datetime().nullable().optional(),
  calendarId: z.uuid().nullable().optional(),
  storyPoints: z.number().nonnegative().nullable().optional(),
  sprintId: z.uuid().nullable().optional(),
});

export const TaskUpdateInputSchema = TaskCreateInputSchema.partial().extend({
  version: z.number().int().nonnegative(),
  percentComplete: z.number().min(0).max(100).nullable().optional(),
  actualStart: z.iso.datetime().nullable().optional(),
  actualFinish: z.iso.datetime().nullable().optional(),
  actualDurationMinutes: z.number().int().nonnegative().nullable().optional(),
  remainingDurationMinutes: z.number().int().nonnegative().nullable().optional(),
  /**
   * Force critical (true/false), or null to clear and follow CPM float again.
   * Distinct from engine-owned `isCritical`.
   */
  criticalOverride: z.boolean().nullable().optional(),
});

/** Body for POST /api/tasks/:id/move (§5.2). */
export const TaskMoveInputSchema = z.object({
  parentId: z.uuid().nullable(),
  sortOrder: z.number().int(),
});

export type TaskCreateInput = z.infer<typeof TaskCreateInputSchema>;
export type TaskUpdateInput = z.infer<typeof TaskUpdateInputSchema>;
export type TaskMoveInput = z.infer<typeof TaskMoveInputSchema>;

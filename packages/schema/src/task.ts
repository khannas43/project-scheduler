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
 *
 * Deferred (not yet built elsewhere in the codebase):
 * - Phase 4 tracking: percentComplete, actualStart, actualFinish,
 *   actualDurationMinutes, remainingDurationMinutes
 * - Phase 6 agile: storyPoints, sprintId, boardColumnId, backlogRank
 *
 * `parentId` is allowed on create for initial placement under a parent;
 * reordering (parentId + sortOrder) uses TaskMoveInputSchema.
 */
export const TaskCreateInputSchema = z.object({
  projectId: z.uuid(),
  parentId: z.uuid().nullable().optional(),
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
});

export const TaskUpdateInputSchema = TaskCreateInputSchema.partial().extend({
  version: z.number().int().nonnegative(),
});

/** Body for POST /api/tasks/:id/move (§5.2). */
export const TaskMoveInputSchema = z.object({
  parentId: z.uuid().nullable(),
  sortOrder: z.number().int(),
});

export type TaskCreateInput = z.infer<typeof TaskCreateInputSchema>;
export type TaskUpdateInput = z.infer<typeof TaskUpdateInputSchema>;
export type TaskMoveInput = z.infer<typeof TaskMoveInputSchema>;

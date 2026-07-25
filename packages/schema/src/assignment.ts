import { z } from 'zod';

/**
 * Assignment inbound shapes (§3.5).
 * `units` null/absent → service defaults to 1.0 (100%).
 * taskId/resourceId are immutable after create — update only accepts units / actuals.
 */
export const AssignmentCreateInputSchema = z.object({
  taskId: z.uuid(),
  resourceId: z.uuid(),
  units: z.number().positive().nullable().optional(),
});

/**
 * Patch shape: units and/or recorded actuals. At least one field required
 * (empty `{}` is rejected — same convention as other partial update schemas).
 */
export const AssignmentUpdateInputSchema = z
  .object({
    units: z.number().positive().optional(),
    actualWorkMinutes: z.number().int().nonnegative().nullable().optional(),
    actualCost: z.number().nonnegative().nullable().optional(),
  })
  .refine(
    (v) =>
      v.units !== undefined ||
      v.actualWorkMinutes !== undefined ||
      v.actualCost !== undefined,
    { message: 'At least one of units, actualWorkMinutes, or actualCost is required' },
  );

export type AssignmentCreateInput = z.infer<typeof AssignmentCreateInputSchema>;
export type AssignmentUpdateInput = z.infer<typeof AssignmentUpdateInputSchema>;

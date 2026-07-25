import { z } from 'zod';

/**
 * Assignment inbound shapes (§3.5).
 * `units` null/absent → service defaults to 1.0 (100%).
 * taskId/resourceId are immutable after create — update only accepts units.
 */
export const AssignmentCreateInputSchema = z.object({
  taskId: z.uuid(),
  resourceId: z.uuid(),
  units: z.number().positive().nullable().optional(),
});

/** Only units is editable; taskId/resourceId are immutable — no version column. */
export const AssignmentUpdateInputSchema = z.object({
  units: z.number().positive(),
});

export type AssignmentCreateInput = z.infer<typeof AssignmentCreateInputSchema>;
export type AssignmentUpdateInput = z.infer<typeof AssignmentUpdateInputSchema>;

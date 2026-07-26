import { z } from 'zod';

/**
 * Assignment inbound shapes (§3.5).
 * `units` null/absent → service defaults to 1.0 (100%).
 * taskId/resourceId are immutable after create.
 */
export const AssignmentCreateInputSchema = z.object({
  taskId: z.uuid(),
  resourceId: z.uuid(),
  units: z.number().positive().nullable().optional(),
});

/**
 * Patch shape: planned units/work/cost and/or recorded actuals.
 * `units` and `workMinutes` are mutually exclusive — work derives units
 * from task duration (Duration × Units = Work).
 */
export const AssignmentUpdateInputSchema = z
  .object({
    units: z.number().positive().optional(),
    workMinutes: z.number().int().nonnegative().optional(),
    /** Planned cost override (numeric). When omitted with units/work, cost is recomputed from rates. */
    cost: z.number().nonnegative().nullable().optional(),
    actualWorkMinutes: z.number().int().nonnegative().nullable().optional(),
    actualCost: z.number().nonnegative().nullable().optional(),
  })
  .refine(
    (v) =>
      v.units !== undefined ||
      v.workMinutes !== undefined ||
      v.cost !== undefined ||
      v.actualWorkMinutes !== undefined ||
      v.actualCost !== undefined,
    {
      message:
        'At least one of units, workMinutes, cost, actualWorkMinutes, or actualCost is required',
    },
  )
  .refine((v) => !(v.units !== undefined && v.workMinutes !== undefined), {
    message: 'Provide units or workMinutes, not both',
  });

export type AssignmentCreateInput = z.infer<typeof AssignmentCreateInputSchema>;
export type AssignmentUpdateInput = z.infer<typeof AssignmentUpdateInputSchema>;

const PeriodDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'periodDate must be YYYY-MM-DD');

/**
 * Patch one timephased day for an assignment.
 * Provide `units` (fraction of a working day) or `plannedWorkMinutes`, not both.
 * `units: 0` / `plannedWorkMinutes: 0` clears that day's planned work.
 */
export const TimephasedDayUpdateInputSchema = z
  .object({
    periodDate: PeriodDateSchema,
    /** Day units — 1.0 = one full working day (480 minutes by default). */
    units: z.number().min(0).optional(),
    plannedWorkMinutes: z.number().int().nonnegative().optional(),
  })
  .refine((v) => v.units !== undefined || v.plannedWorkMinutes !== undefined, {
    message: 'Provide units or plannedWorkMinutes',
  })
  .refine((v) => !(v.units !== undefined && v.plannedWorkMinutes !== undefined), {
    message: 'Provide units or plannedWorkMinutes, not both',
  });

export type TimephasedDayUpdateInput = z.infer<typeof TimephasedDayUpdateInputSchema>;

import { z } from 'zod';

/**
 * Calendar inbound shapes (§3.2). `projectId = null` (or omitted) means a
 * global template reusable across projects.
 */
export const CalendarCreateInputSchema = z.object({
  name: z.string().min(1),
  projectId: z.uuid().nullable().optional(),
  workingDays: z.array(z.number().int().min(0).max(6)),
  hoursPerDay: z.number().positive(),
  defaultStart: z.iso.time(),
  defaultFinish: z.iso.time(),
});

/** Calendars have no `version` column — update is a plain partial of create fields. */
export const CalendarUpdateInputSchema = CalendarCreateInputSchema.partial();

/**
 * Calendar exception create (§3.2). No update schema — delete+recreate, same
 * as `task_dependencies` (create/delete only).
 */
export const CalendarExceptionCreateInputSchema = z.object({
  exceptionDate: z.iso.date(), // date-only (YYYY-MM-DD), not datetime
  isWorking: z.boolean(),
  startTime: z.iso.time().nullable().optional(),
  finishTime: z.iso.time().nullable().optional(),
  name: z.string().nullable().optional(),
  recurrence: z.object({ type: z.literal('annual') }).nullable().optional(),
});

export type CalendarCreateInput = z.infer<typeof CalendarCreateInputSchema>;
export type CalendarUpdateInput = z.infer<typeof CalendarUpdateInputSchema>;
export type CalendarExceptionCreateInput = z.infer<typeof CalendarExceptionCreateInputSchema>;

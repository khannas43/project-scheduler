import { z } from 'zod';

/**
 * Sprint inbound shapes (PROJECT_SCOPE.md §5.10).
 * Date ordering is app-level (endDate > startDate), matching this codebase's
 * convention of Zod validation rather than DB CHECKs.
 *
 * Base object is exported separately so routes can `.omit({ projectId })`
 * before re-applying the date refine (Zod forbids `.omit()` on refined schemas).
 */
export const SprintCreateFieldsSchema = z.object({
  projectId: z.uuid(),
  name: z.string().min(1),
  goal: z.string().nullable().optional(),
  startDate: z.iso.datetime(),
  endDate: z.iso.datetime(),
  capacity: z.number().nonnegative().nullable().optional(),
});

const endAfterStart = <T extends { startDate: string; endDate: string }>(v: T) =>
  new Date(v.endDate) > new Date(v.startDate);

export const SprintCreateInputSchema = SprintCreateFieldsSchema.refine(endAfterStart, {
  message: 'endDate must be after startDate',
});

/** Body for POST /api/projects/:id/sprints — projectId comes from the path. */
export const SprintCreateBodySchema = SprintCreateFieldsSchema.omit({ projectId: true }).refine(
  endAfterStart,
  { message: 'endDate must be after startDate' },
);

export const SprintUpdateInputSchema = z
  .object({
    version: z.number().int().nonnegative(),
    name: z.string().min(1).optional(),
    goal: z.string().nullable().optional(),
    startDate: z.iso.datetime().optional(),
    endDate: z.iso.datetime().optional(),
    capacity: z.number().nonnegative().nullable().optional(),
    /** Closing must use POST /api/sprints/:id/close so carry-over cannot be skipped. */
    state: z.enum(['planned', 'active']).optional(),
  })
  .refine(
    (v) => {
      if (v.startDate === undefined || v.endDate === undefined) return true;
      return new Date(v.endDate) > new Date(v.startDate);
    },
    { message: 'endDate must be after startDate' },
  );

/** Body for POST /api/sprints/:id/close. */
export const SprintCloseInputSchema = z.object({
  carryOverToSprintId: z.uuid().nullable().optional(),
});

/** Body for POST /api/tasks/:id/backlog-rank. */
export const TaskBacklogRankInputSchema = z.object({
  beforeTaskId: z.uuid().nullable().optional(),
  afterTaskId: z.uuid().nullable().optional(),
});

export type SprintCreateInput = z.infer<typeof SprintCreateInputSchema>;
export type SprintCreateBody = z.infer<typeof SprintCreateBodySchema>;
export type SprintUpdateInput = z.infer<typeof SprintUpdateInputSchema>;
export type SprintCloseInput = z.infer<typeof SprintCloseInputSchema>;
export type TaskBacklogRankInput = z.infer<typeof TaskBacklogRankInputSchema>;

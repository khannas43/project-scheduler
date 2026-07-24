import { z } from 'zod';

/**
 * Project inbound shapes (§3.2). `finishDate` is engine-computed and omitted
 * from input schemas by design — stripping, not validation.
 */
export const ProjectCreateInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  status: z.string().min(1),
  startDate: z.iso.datetime().nullable().optional(),
  calendarId: z.uuid(),
  ownerId: z.uuid(),
  isArchived: z.boolean().optional(),
});

export const ProjectUpdateInputSchema = ProjectCreateInputSchema.partial().extend({
  version: z.number().int().nonnegative(),
});

export type ProjectCreateInput = z.infer<typeof ProjectCreateInputSchema>;
export type ProjectUpdateInput = z.infer<typeof ProjectUpdateInputSchema>;

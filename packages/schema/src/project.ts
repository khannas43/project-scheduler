import { z } from 'zod';

import { ProjectCategorySchema, ProjectTemplateKeySchema } from './projectCategory.js';
import { ProjectSettingsPatchSchema } from './projectSettings.js';

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
  category: ProjectCategorySchema.nullable().optional(),
  templateKey: ProjectTemplateKeySchema.nullable().optional(),
});

export const ProjectUpdateInputSchema = ProjectCreateInputSchema.partial().extend({
  version: z.number().int().nonnegative(),
  /** Status date for progress reporting (§5.8) — not on create. */
  statusDate: z.iso.datetime().nullable().optional(),
  /** Partial merge into projects.settings jsonb. */
  settings: ProjectSettingsPatchSchema.optional(),
});

export type ProjectCreateInput = z.infer<typeof ProjectCreateInputSchema>;
export type ProjectUpdateInput = z.infer<typeof ProjectUpdateInputSchema>;

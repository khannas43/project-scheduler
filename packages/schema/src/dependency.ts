import { z } from 'zod';

const LinkTypeSchema = z.enum(['FS', 'SS', 'FF', 'SF']);

const noSelfLink = (
  data: {
    predecessorId?: string | undefined;
    successorId?: string | undefined;
  },
  ctx: z.RefinementCtx,
): void => {
  if (
    data.predecessorId !== undefined &&
    data.successorId !== undefined &&
    data.predecessorId === data.successorId
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['successorId'],
      message: 'predecessorId and successorId must differ (no self-links)',
    });
  }
};

/**
 * Dependency inbound shapes (§3.4). Self-links are rejected here with a
 * clear validation error so they never surface as a raw Postgres check
 * constraint violation.
 *
 * Keep the object schema separate from the refine — Zod 4's `.partial()`
 * cannot be called on an object that already has refinements.
 */
const DependencyCreateFields = z.object({
  predecessorId: z.uuid(),
  successorId: z.uuid(),
  linkType: LinkTypeSchema,
  lagMinutes: z.number().int().default(0),
  lagPercent: z.number().nullable().optional(),
});

export const DependencyCreateInputSchema = DependencyCreateFields.superRefine(noSelfLink);

export const DependencyUpdateInputSchema = DependencyCreateFields.partial()
  .extend({
    version: z.number().int().nonnegative(),
  })
  .superRefine(noSelfLink);

export type DependencyCreateInput = z.infer<typeof DependencyCreateInputSchema>;
export type DependencyUpdateInput = z.infer<typeof DependencyUpdateInputSchema>;

import { z } from 'zod';

export const ResourceTypeSchema = z.enum(['work', 'material', 'cost']);
export const AccrualTypeSchema = z.enum(['start', 'prorated', 'end']);

/**
 * Resource inbound shapes (§3.5). Resources have no `version` column —
 * update is a plain partial of create fields (same as calendars/dependencies).
 *
 * Numeric fields (maxUnits, rates, costPerUse) are JS numbers on the wire;
 * the API service layer String()s them into Drizzle `numeric()` columns and
 * Number()s them back out for any computation.
 */
export const ResourceCreateInputSchema = z.object({
  name: z.string().min(1),
  resourceType: ResourceTypeSchema,
  email: z.string().email().nullable().optional(),
  maxUnits: z.number().positive().nullable().optional(),
  standardRate: z.number().nonnegative().nullable().optional(),
  overtimeRate: z.number().nonnegative().nullable().optional(),
  costPerUse: z.number().nonnegative().nullable().optional(),
  accrualType: AccrualTypeSchema.nullable().optional(),
  calendarId: z.uuid().nullable().optional(),
  skills: z.array(z.string()).optional(),
  userId: z.uuid().nullable().optional(),
});

/** Resources have no `version` column — update is a plain partial of create fields. */
export const ResourceUpdateInputSchema = ResourceCreateInputSchema.partial();

export type ResourceCreateInput = z.infer<typeof ResourceCreateInputSchema>;
export type ResourceUpdateInput = z.infer<typeof ResourceUpdateInputSchema>;
export type ResourceType = z.infer<typeof ResourceTypeSchema>;
export type AccrualType = z.infer<typeof AccrualTypeSchema>;

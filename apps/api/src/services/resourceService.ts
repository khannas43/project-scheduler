import type { ResourceCreateInput, ResourceUpdateInput } from '@pkg/schema';
import { asc, eq } from 'drizzle-orm';

import { db } from '../db/client.js';
import { assignments, resources } from '../db/schema/index.js';
import { BadRequestError, NotFoundError } from '../middleware/errors.js';
import { withSerializableRetry, writeAuditLog } from './scheduleRunner.js';

/**
 * Drizzle `numeric()` columns are string | null at the boundary.
 * Zod inbound shapes use JS numbers — String() on the way in (mirrors
 * dependencyService lagPercent). Number() for any computation lives in
 * assignmentService (computeWorkAndCost / overallocation).
 */
export function numericToDb(value: number | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return String(value);
}

/** Number() a DB numeric string; null stays null. */
export function numericFromDb(value: string | null): number | null {
  if (value === null) return null;
  return Number(value);
}

function toResourceValues(input: ResourceCreateInput | ResourceUpdateInput): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  if ('name' in input && input.name !== undefined) values.name = input.name;
  if ('resourceType' in input && input.resourceType !== undefined) {
    values.resourceType = input.resourceType;
  }
  if ('email' in input && input.email !== undefined) values.email = input.email;
  if ('maxUnits' in input && input.maxUnits !== undefined) {
    values.maxUnits = numericToDb(input.maxUnits);
  }
  if ('standardRate' in input && input.standardRate !== undefined) {
    values.standardRate = numericToDb(input.standardRate);
  }
  if ('overtimeRate' in input && input.overtimeRate !== undefined) {
    values.overtimeRate = numericToDb(input.overtimeRate);
  }
  if ('costPerUse' in input && input.costPerUse !== undefined) {
    values.costPerUse = numericToDb(input.costPerUse);
  }
  if ('accrualType' in input && input.accrualType !== undefined) {
    values.accrualType = input.accrualType;
  }
  if ('calendarId' in input && input.calendarId !== undefined) {
    values.calendarId = input.calendarId;
  }
  if ('skills' in input && input.skills !== undefined) values.skills = input.skills;
  if ('userId' in input && input.userId !== undefined) values.userId = input.userId;
  return values;
}

/** Global resource catalog — authorization already happened in the route preHandler. */
export async function listResources(): Promise<Array<typeof resources.$inferSelect>> {
  return db.select().from(resources).orderBy(asc(resources.name));
}

export async function createResource(
  input: ResourceCreateInput,
  actorUserId: string,
  projectId: string,
): Promise<typeof resources.$inferSelect> {
  return withSerializableRetry(async (tx) => {
    const [created] = await tx
      .insert(resources)
      .values({
        name: input.name,
        resourceType: input.resourceType,
        email: input.email ?? null,
        maxUnits: numericToDb(input.maxUnits) ?? null,
        standardRate: numericToDb(input.standardRate) ?? null,
        overtimeRate: numericToDb(input.overtimeRate) ?? null,
        costPerUse: numericToDb(input.costPerUse) ?? null,
        accrualType: input.accrualType ?? null,
        calendarId: input.calendarId ?? null,
        userId: input.userId ?? null,
        skills: input.skills ?? null,
      })
      .returning();

    if (!created) throw new Error('Failed to insert resource');

    await writeAuditLog(tx, {
      userId: actorUserId,
      projectId,
      action: 'resource.create',
      entityType: 'resource',
      entityId: created.id,
      after: created,
    });

    return created;
  }, db);
}

export async function updateResource(
  id: string,
  input: ResourceUpdateInput,
  actorUserId: string,
  projectId: string,
): Promise<typeof resources.$inferSelect> {
  return withSerializableRetry(async (tx) => {
    const [existing] = await tx.select().from(resources).where(eq(resources.id, id)).limit(1);
    if (!existing) throw new NotFoundError('Resource not found');

    const patch = toResourceValues(input);
    let updated = existing;
    if (Object.keys(patch).length > 0) {
      const [row] = await tx.update(resources).set(patch).where(eq(resources.id, id)).returning();
      if (!row) throw new NotFoundError('Resource not found');
      updated = row;
    }

    await writeAuditLog(tx, {
      userId: actorUserId,
      projectId,
      action: 'resource.update',
      entityType: 'resource',
      entityId: id,
      before: existing,
      after: updated,
    });

    return updated;
  }, db);
}

export async function deleteResource(
  id: string,
  actorUserId: string,
  projectId: string,
): Promise<{ deleted: true }> {
  return withSerializableRetry(async (tx) => {
    const [existing] = await tx.select().from(resources).where(eq(resources.id, id)).limit(1);
    if (!existing) throw new NotFoundError('Resource not found');

    const existingAssignments = await tx
      .select({ id: assignments.id })
      .from(assignments)
      .where(eq(assignments.resourceId, id))
      .limit(1);

    if (existingAssignments.length > 0) {
      throw new BadRequestError(
        'Cannot delete a resource with existing assignments — remove its assignments first',
      );
    }

    await tx.delete(resources).where(eq(resources.id, id));

    await writeAuditLog(tx, {
      userId: actorUserId,
      projectId,
      action: 'resource.delete',
      entityType: 'resource',
      entityId: id,
      before: existing,
    });

    return { deleted: true as const };
  }, db);
}

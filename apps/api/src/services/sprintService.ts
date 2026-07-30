import type { SprintCreateInput, SprintUpdateInput } from '@pkg/schema';
import { and, asc, eq, sql } from 'drizzle-orm';

import { db } from '../db/client.js';
import { projects, sprints } from '../db/schema/index.js';
import { ConflictError, NotFoundError } from '../middleware/errors.js';
import { withSerializableRetry, writeAuditLog } from './scheduleRunner.js';
import { numericToDb } from './resourceService.js';

type SprintCreateBody = Omit<SprintCreateInput, 'projectId'>;

export async function listSprints(
  projectId: string,
): Promise<Array<typeof sprints.$inferSelect>> {
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new NotFoundError('Project not found');

  return db
    .select()
    .from(sprints)
    .where(eq(sprints.projectId, projectId))
    .orderBy(asc(sprints.startDate), asc(sprints.name));
}

export async function createSprint(
  projectId: string,
  input: SprintCreateBody,
  userId: string,
): Promise<typeof sprints.$inferSelect> {
  return withSerializableRetry(async (tx) => {
    const [project] = await tx.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) throw new NotFoundError('Project not found');

    const [created] = await tx
      .insert(sprints)
      .values({
        projectId,
        name: input.name,
        goal: input.goal ?? null,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        capacity: numericToDb(input.capacity) ?? null,
        state: 'planned',
      })
      .returning();

    if (!created) throw new Error('Insert returned no row');

    await writeAuditLog(tx, {
      userId,
      projectId,
      action: 'sprint.create',
      entityType: 'sprint',
      entityId: created.id,
      after: created,
    });

    return created;
  }, db);
}

export async function updateSprint(
  sprintId: string,
  input: SprintUpdateInput,
  userId: string,
): Promise<typeof sprints.$inferSelect> {
  return withSerializableRetry(async (tx) => {
    const [existing] = await tx.select().from(sprints).where(eq(sprints.id, sprintId)).limit(1);
    if (!existing) throw new NotFoundError('Sprint not found');

    const { version, ...patch } = input;

    const [updated] = await tx
      .update(sprints)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.goal !== undefined ? { goal: patch.goal } : {}),
        ...(patch.startDate !== undefined ? { startDate: new Date(patch.startDate) } : {}),
        ...(patch.endDate !== undefined ? { endDate: new Date(patch.endDate) } : {}),
        ...(patch.capacity !== undefined ? { capacity: numericToDb(patch.capacity) ?? null } : {}),
        ...(patch.state !== undefined ? { state: patch.state } : {}),
        version: sql`${sprints.version} + 1`,
      })
      .where(and(eq(sprints.id, sprintId), eq(sprints.version, version)))
      .returning();

    if (!updated) {
      const [current] = await tx.select().from(sprints).where(eq(sprints.id, sprintId)).limit(1);
      throw new ConflictError('Sprint version conflict', current);
    }

    await writeAuditLog(tx, {
      userId,
      projectId: existing.projectId,
      action: 'sprint.update',
      entityType: 'sprint',
      entityId: sprintId,
      before: existing,
      after: updated,
    });

    return updated;
  }, db);
}

export async function deleteSprint(
  sprintId: string,
  userId: string,
): Promise<{ deleted: true }> {
  return withSerializableRetry(async (tx) => {
    const [existing] = await tx.select().from(sprints).where(eq(sprints.id, sprintId)).limit(1);
    if (!existing) throw new NotFoundError('Sprint not found');

    await tx.delete(sprints).where(eq(sprints.id, sprintId));

    await writeAuditLog(tx, {
      userId,
      projectId: existing.projectId,
      action: 'sprint.delete',
      entityType: 'sprint',
      entityId: sprintId,
      before: existing,
    });

    return { deleted: true as const };
  }, db);
}

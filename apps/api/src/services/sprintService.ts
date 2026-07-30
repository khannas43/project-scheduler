import type { SprintCreateInput, SprintUpdateInput } from '@pkg/schema';
import { and, asc, eq, sql } from 'drizzle-orm';

import { db } from '../db/client.js';
import { boardColumns, projects, sprints, tasks } from '../db/schema/index.js';
import { BadRequestError, ConflictError, NotFoundError } from '../middleware/errors.js';
import { maxBacklogRank, nextBacklogRank } from './backlogRank.js';
import { withSerializableRetry, writeAuditLog, type Db } from './scheduleRunner.js';
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

export interface CloseSprintResult {
  readonly sprint: typeof sprints.$inferSelect;
  readonly carriedOverTaskIds: readonly string[];
}

/**
 * Close a sprint: done tasks (in an isDone column) stay attached as history;
 * incomplete tasks (including no-column) are carried to another sprint or the
 * backlog with a fresh rank and cleared board column.
 */
export async function closeSprint(
  sprintId: string,
  carryOverToSprintId: string | null | undefined,
  userId: string,
): Promise<CloseSprintResult> {
  return withSerializableRetry(async (tx) => {
    const [existing] = await tx.select().from(sprints).where(eq(sprints.id, sprintId)).limit(1);
    if (!existing) throw new NotFoundError('Sprint not found');
    if (existing.state === 'closed') {
      throw new BadRequestError('Sprint is already closed');
    }

    const destinationId =
      carryOverToSprintId === undefined ? null : carryOverToSprintId;

    if (destinationId !== null) {
      if (destinationId === sprintId) {
        throw new BadRequestError('Cannot carry over incomplete tasks into the same sprint');
      }
      const [dest] = await tx.select().from(sprints).where(eq(sprints.id, destinationId)).limit(1);
      if (!dest || dest.projectId !== existing.projectId) {
        throw new NotFoundError('Carry-over sprint not found in this project');
      }
      if (dest.state === 'closed') {
        throw new BadRequestError('Cannot carry over into a closed sprint');
      }
    }

    const doneColumnIds = await loadDoneColumnIds(tx, existing.projectId);
    const sprintTasks = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.projectId, existing.projectId), eq(tasks.sprintId, sprintId)));

    const incomplete = sprintTasks.filter(
      (t) => !t.isSummary && (t.boardColumnId === null || !doneColumnIds.has(t.boardColumnId)),
    );

    const carriedOverTaskIds: string[] = [];
    let rankCursor = await maxBacklogRank(tx, existing.projectId);

    for (const task of incomplete) {
      rankCursor = nextBacklogRank(rankCursor);
      await tx
        .update(tasks)
        .set({
          sprintId: destinationId,
          boardColumnId: null,
          backlogRank: rankCursor,
        })
        .where(eq(tasks.id, task.id));
      carriedOverTaskIds.push(task.id);
    }

    const [closed] = await tx
      .update(sprints)
      .set({
        state: 'closed',
        version: sql`${sprints.version} + 1`,
      })
      .where(eq(sprints.id, sprintId))
      .returning();

    if (!closed) throw new Error('Sprint close update returned no row');

    await writeAuditLog(tx, {
      userId,
      projectId: existing.projectId,
      action: 'sprint.close',
      entityType: 'sprint',
      entityId: sprintId,
      before: existing,
      after: {
        sprint: closed,
        carryOverToSprintId: destinationId,
        carriedOverTaskIds,
      },
    });

    return { sprint: closed, carriedOverTaskIds };
  }, db);
}

async function loadDoneColumnIds(tx: Db, projectId: string): Promise<Set<string>> {
  const rows = await tx
    .select({ id: boardColumns.id })
    .from(boardColumns)
    .where(and(eq(boardColumns.projectId, projectId), eq(boardColumns.isDone, true)));
  return new Set(rows.map((r) => r.id));
}

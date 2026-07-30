import type { BoardColumnCreateInput, BoardColumnUpdateInput } from '@pkg/schema';
import { and, asc, count, eq, sql } from 'drizzle-orm';

import { db } from '../db/client.js';
import { boardColumns, projects, tasks } from '../db/schema/index.js';
import { ConflictError, NotFoundError } from '../middleware/errors.js';
import { withSerializableRetry, writeAuditLog, type Db } from './scheduleRunner.js';

type BoardColumnCreateBody = Omit<BoardColumnCreateInput, 'projectId'>;

export async function countTasksInColumn(tx: Db, boardColumnId: string): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(tasks)
    .where(eq(tasks.boardColumnId, boardColumnId));
  return Number(row?.n ?? 0);
}

export async function listBoardColumns(
  projectId: string,
): Promise<Array<typeof boardColumns.$inferSelect>> {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) throw new NotFoundError('Project not found');

  return db
    .select()
    .from(boardColumns)
    .where(eq(boardColumns.projectId, projectId))
    .orderBy(asc(boardColumns.sortOrder), asc(boardColumns.name));
}

export async function createBoardColumn(
  projectId: string,
  input: BoardColumnCreateBody,
  userId: string,
): Promise<typeof boardColumns.$inferSelect> {
  return withSerializableRetry(async (tx) => {
    const [project] = await tx.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) throw new NotFoundError('Project not found');

    const [created] = await tx
      .insert(boardColumns)
      .values({
        projectId,
        name: input.name,
        sortOrder: input.sortOrder,
        wipLimit: input.wipLimit ?? null,
      })
      .returning();

    if (!created) throw new Error('Insert returned no row');

    await writeAuditLog(tx, {
      userId,
      projectId,
      action: 'board_column.create',
      entityType: 'board_column',
      entityId: created.id,
      after: created,
    });

    return created;
  }, db);
}

export async function updateBoardColumn(
  columnId: string,
  input: BoardColumnUpdateInput,
  userId: string,
): Promise<typeof boardColumns.$inferSelect> {
  return withSerializableRetry(async (tx) => {
    const [existing] = await tx
      .select()
      .from(boardColumns)
      .where(eq(boardColumns.id, columnId))
      .limit(1);
    if (!existing) throw new NotFoundError('Board column not found');

    const { version, ...patch } = input;

    const [updated] = await tx
      .update(boardColumns)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
        ...(patch.wipLimit !== undefined ? { wipLimit: patch.wipLimit } : {}),
        version: sql`${boardColumns.version} + 1`,
      })
      .where(and(eq(boardColumns.id, columnId), eq(boardColumns.version, version)))
      .returning();

    if (!updated) {
      const [current] = await tx
        .select()
        .from(boardColumns)
        .where(eq(boardColumns.id, columnId))
        .limit(1);
      throw new ConflictError('Board column version conflict', current);
    }

    await writeAuditLog(tx, {
      userId,
      projectId: existing.projectId,
      action: 'board_column.update',
      entityType: 'board_column',
      entityId: columnId,
      before: existing,
      after: updated,
    });

    return updated;
  }, db);
}

export async function deleteBoardColumn(
  columnId: string,
  userId: string,
): Promise<{ deleted: true }> {
  return withSerializableRetry(async (tx) => {
    const [existing] = await tx
      .select()
      .from(boardColumns)
      .where(eq(boardColumns.id, columnId))
      .limit(1);
    if (!existing) throw new NotFoundError('Board column not found');

    await tx.delete(boardColumns).where(eq(boardColumns.id, columnId));

    await writeAuditLog(tx, {
      userId,
      projectId: existing.projectId,
      action: 'board_column.delete',
      entityType: 'board_column',
      entityId: columnId,
      before: existing,
    });

    return { deleted: true as const };
  }, db);
}

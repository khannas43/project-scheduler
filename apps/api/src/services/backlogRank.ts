import { generateKeyBetween } from 'fractional-indexing';
import { and, desc, eq, isNotNull } from 'drizzle-orm';

import { tasks } from '../db/schema/index.js';
import { BadRequestError, NotFoundError } from '../middleware/errors.js';
import type { Db } from './scheduleRunner.js';

/** Rank after `existingMaxRank` (or the first rank when null). */
export function nextBacklogRank(existingMaxRank: string | null): string {
  return generateKeyBetween(existingMaxRank, null);
}

/** Rank strictly between `before` and `after` (either may be null for ends). */
export function rankBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after);
}

/**
 * Reorder an agile task in the project backlog by placing it between optional
 * neighbors. Persists the new fractional rank on the task.
 */
export async function reorderTaskInBacklog(
  tx: Db,
  taskId: string,
  neighbors: { beforeTaskId?: string | null | undefined; afterTaskId?: string | null | undefined },
): Promise<typeof tasks.$inferSelect> {
  const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) throw new NotFoundError('Task not found');
  if (task.schedulingMode !== 'agile') {
    throw new BadRequestError('Only agile tasks can be reordered in the backlog');
  }

  let beforeRank: string | null = null;
  let afterRank: string | null = null;

  if (neighbors.beforeTaskId) {
    const [before] = await tx
      .select()
      .from(tasks)
      .where(eq(tasks.id, neighbors.beforeTaskId))
      .limit(1);
    if (!before || before.projectId !== task.projectId) {
      throw new NotFoundError('Before task not found in this project');
    }
    beforeRank = before.backlogRank;
  }

  if (neighbors.afterTaskId) {
    const [after] = await tx
      .select()
      .from(tasks)
      .where(eq(tasks.id, neighbors.afterTaskId))
      .limit(1);
    if (!after || after.projectId !== task.projectId) {
      throw new NotFoundError('After task not found in this project');
    }
    afterRank = after.backlogRank;
  }

  const backlogRank = rankBetween(beforeRank, afterRank);

  const [updated] = await tx
    .update(tasks)
    .set({ backlogRank })
    .where(eq(tasks.id, taskId))
    .returning();

  if (!updated) throw new Error('Backlog rank update returned no row');
  return updated;
}

/** Highest existing backlog rank in the project (lexicographic), or null. */
export async function maxBacklogRank(tx: Db, projectId: string): Promise<string | null> {
  const [row] = await tx
    .select({ backlogRank: tasks.backlogRank })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), isNotNull(tasks.backlogRank)))
    .orderBy(desc(tasks.backlogRank))
    .limit(1);
  return row?.backlogRank ?? null;
}

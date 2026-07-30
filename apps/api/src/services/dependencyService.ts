import type { DependencyCreateInput } from '@pkg/schema';
import { eq, or } from 'drizzle-orm';

import { db } from '../db/client.js';
import { projects, taskDependencies, tasks } from '../db/schema/index.js';
import { BadRequestError, NotFoundError } from '../middleware/errors.js';
import {
  assertGraphValid,
  loadProjectDependencies,
  rescheduleProject,
  withSerializableRetry,
  writeAuditLog,
  type Db,
  type MutationResult,
} from './scheduleRunner.js';

/** True when the task appears on either end of any dependency row. */
export async function hasDependencies(tx: Db, taskId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: taskDependencies.id })
    .from(taskDependencies)
    .where(
      or(eq(taskDependencies.predecessorId, taskId), eq(taskDependencies.successorId, taskId)),
    )
    .limit(1);
  return row !== undefined;
}

export async function createDependency(
  input: DependencyCreateInput,
  userId: string,
): Promise<MutationResult & { dependency: typeof taskDependencies.$inferSelect }> {
  return withSerializableRetry(async (tx) => {
    const [pred] = await tx.select().from(tasks).where(eq(tasks.id, input.predecessorId)).limit(1);
    const [succ] = await tx.select().from(tasks).where(eq(tasks.id, input.successorId)).limit(1);
    if (!pred || !succ) throw new NotFoundError('Predecessor or successor task not found');
    if (pred.projectId !== succ.projectId) {
      throw new BadRequestError('Dependencies must be within the same project');
    }

    const [project] = await tx.select().from(projects).where(eq(projects.id, pred.projectId)).limit(1);
    if (!project) throw new NotFoundError('Project not found');

    const taskRows = await tx.select().from(tasks).where(eq(tasks.projectId, pred.projectId));
    const existingDeps = await loadProjectDependencies(tx, taskRows);

    const prospective = [
      ...existingDeps,
      {
        id: '00000000-0000-4000-8000-000000000000',
        predecessorId: input.predecessorId,
        successorId: input.successorId,
        linkType: input.linkType,
        lagMinutes: input.lagMinutes,
        lagPercent: input.lagPercent === undefined || input.lagPercent === null ? null : String(input.lagPercent),
        createdAt: new Date(),
        updatedAt: new Date(),
      } satisfies typeof taskDependencies.$inferSelect,
    ];

    // Cycle / summary-link rejection → 409 before insert.
    assertGraphValid(taskRows, prospective, project.calendarId);

    const [created] = await tx
      .insert(taskDependencies)
      .values({
        predecessorId: input.predecessorId,
        successorId: input.successorId,
        linkType: input.linkType,
        lagMinutes: input.lagMinutes,
        lagPercent: input.lagPercent === undefined || input.lagPercent === null ? null : String(input.lagPercent),
      })
      .returning();

    if (!created) throw new Error('Insert returned no row');

    const result = await rescheduleProject(tx, pred.projectId);

    await writeAuditLog(tx, {
      userId,
      projectId: pred.projectId,
      action: 'dependency.create',
      entityType: 'dependency',
      entityId: created.id,
      after: created,
    });

    return { ...result, dependency: created };
  }, db);
}

export async function deleteDependency(
  dependencyId: string,
  userId: string,
): Promise<MutationResult> {
  return withSerializableRetry(async (tx) => {
    const [existing] = await tx
      .select()
      .from(taskDependencies)
      .where(eq(taskDependencies.id, dependencyId))
      .limit(1);
    if (!existing) throw new NotFoundError('Dependency not found');

    const [pred] = await tx.select().from(tasks).where(eq(tasks.id, existing.predecessorId)).limit(1);
    if (!pred) throw new NotFoundError('Predecessor task not found');

    await tx.delete(taskDependencies).where(eq(taskDependencies.id, dependencyId));

    const result = await rescheduleProject(tx, pred.projectId);

    await writeAuditLog(tx, {
      userId,
      projectId: pred.projectId,
      action: 'dependency.delete',
      entityType: 'dependency',
      entityId: dependencyId,
      before: existing,
    });

    return result;
  }, db);
}

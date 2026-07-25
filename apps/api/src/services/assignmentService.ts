import type { AssignmentCreateInput, AssignmentUpdateInput } from '@pkg/schema';
import { eq } from 'drizzle-orm';

import { db } from '../db/client.js';
import { assignments, resources, tasks } from '../db/schema/index.js';
import { BadRequestError, ConflictError, NotFoundError } from '../middleware/errors.js';
import { numericFromDb, numericToDb } from './resourceService.js';
import { withSerializableRetry, writeAuditLog } from './scheduleRunner.js';

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; cause?: { code?: string } };
  return e.code === '23505' || e.cause?.code === '23505';
}

export interface WorkAndCostInput {
  readonly durationMinutes: number | null;
  readonly standardRate: string | null;
  readonly costPerUse: string | null;
}

/**
 * Derive assignment work + cost from task duration, units, and resource rates.
 * Rates come in as Drizzle numeric strings — Number() here (the "way out").
 */
export function computeWorkAndCost(
  task: Pick<WorkAndCostInput, 'durationMinutes'>,
  resource: Pick<WorkAndCostInput, 'standardRate' | 'costPerUse'>,
  units: number,
): { workMinutes: number; cost: number } {
  const duration = task.durationMinutes ?? 0;
  const workMinutes = Math.round(duration * units);
  const rate = Number(resource.standardRate ?? 0);
  const costPerUse = Number(resource.costPerUse ?? 0);
  const cost = (workMinutes / 60) * rate + costPerUse;
  return { workMinutes, cost };
}

export interface OverallocationDay {
  readonly date: string;
  readonly totalUnits: number;
  readonly maxUnits: number;
}

export interface AssignmentSpan {
  readonly units: number;
  readonly earlyStart: Date;
  readonly earlyFinish: Date;
}

/** UTC calendar-day keys (YYYY-MM-DD) from start through finish inclusive. */
export function eachUtcDayInclusive(start: Date, end: Date): string[] {
  const days: string[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endMs = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  while (cursor.getTime() <= endMs) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/**
 * Day-bucket overallocation check (deliberately not working-minute granularity).
 * Pure — `getOverallocations` loads rows then calls this.
 */
export function findOverallocatedDays(
  maxUnits: number,
  spans: readonly AssignmentSpan[],
): OverallocationDay[] {
  const byDay = new Map<string, number>();
  for (const span of spans) {
    for (const day of eachUtcDayInclusive(span.earlyStart, span.earlyFinish)) {
      byDay.set(day, (byDay.get(day) ?? 0) + span.units);
    }
  }

  const over: OverallocationDay[] = [];
  for (const [date, totalUnits] of [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (totalUnits > maxUnits) {
      over.push({ date, totalUnits, maxUnits });
    }
  }
  return over;
}

export async function listAssignmentsForTask(
  taskId: string,
): Promise<Array<typeof assignments.$inferSelect>> {
  return db.select().from(assignments).where(eq(assignments.taskId, taskId));
}

export async function createAssignment(
  input: AssignmentCreateInput,
  actorUserId: string,
): Promise<typeof assignments.$inferSelect> {
  try {
    return await withSerializableRetry(async (tx) => {
      const [task] = await tx.select().from(tasks).where(eq(tasks.id, input.taskId)).limit(1);
      if (!task) throw new NotFoundError('Task not found');

      const [resource] = await tx
        .select()
        .from(resources)
        .where(eq(resources.id, input.resourceId))
        .limit(1);
      if (!resource) throw new NotFoundError('Resource not found');

      // Material/cost resources don't have a meaningful "% allocation". Reject
      // an explicit units value; when absent, treat as 1.0 for work/cost math.
      const unitsExplicit = input.units !== undefined && input.units !== null;
      if (resource.resourceType !== 'work' && unitsExplicit) {
        throw new BadRequestError(
          'units may only be set on work resources (material/cost resources have no % allocation)',
        );
      }
      const units = unitsExplicit ? input.units! : 1.0;

      const { workMinutes, cost } = computeWorkAndCost(task, resource, units);

      const [created] = await tx
        .insert(assignments)
        .values({
          taskId: input.taskId,
          resourceId: input.resourceId,
          units: numericToDb(units) ?? null,
          workMinutes,
          cost: String(cost),
        })
        .returning();

      if (!created) throw new Error('Failed to insert assignment');

      await writeAuditLog(tx, {
        userId: actorUserId,
        projectId: task.projectId,
        action: 'assignment.create',
        entityType: 'assignment',
        entityId: created.id,
        after: created,
      });

      return created;
    }, db);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError('Resource already assigned to this task');
    }
    throw error;
  }
}

export async function updateAssignment(
  id: string,
  input: AssignmentUpdateInput,
  actorUserId: string,
): Promise<typeof assignments.$inferSelect> {
  return withSerializableRetry(async (tx) => {
    const [existing] = await tx.select().from(assignments).where(eq(assignments.id, id)).limit(1);
    if (!existing) throw new NotFoundError('Assignment not found');

    const [task] = await tx.select().from(tasks).where(eq(tasks.id, existing.taskId)).limit(1);
    if (!task) throw new NotFoundError('Task not found');

    const [resource] = await tx
      .select()
      .from(resources)
      .where(eq(resources.id, existing.resourceId))
      .limit(1);
    if (!resource) throw new NotFoundError('Resource not found');

    if (resource.resourceType !== 'work') {
      throw new BadRequestError(
        'units may only be updated on work-resource assignments (material/cost resources have no % allocation)',
      );
    }

    const { workMinutes, cost } = computeWorkAndCost(task, resource, input.units);

    const [updated] = await tx
      .update(assignments)
      .set({
        units: numericToDb(input.units) ?? null,
        workMinutes,
        cost: String(cost),
      })
      .where(eq(assignments.id, id))
      .returning();

    if (!updated) throw new NotFoundError('Assignment not found');

    await writeAuditLog(tx, {
      userId: actorUserId,
      projectId: task.projectId,
      action: 'assignment.update',
      entityType: 'assignment',
      entityId: id,
      before: existing,
      after: updated,
    });

    return updated;
  }, db);
}

export async function deleteAssignment(
  id: string,
  actorUserId: string,
): Promise<{ deleted: true }> {
  return withSerializableRetry(async (tx) => {
    const [existing] = await tx.select().from(assignments).where(eq(assignments.id, id)).limit(1);
    if (!existing) throw new NotFoundError('Assignment not found');

    const [task] = await tx.select().from(tasks).where(eq(tasks.id, existing.taskId)).limit(1);
    if (!task) throw new NotFoundError('Task not found');

    await tx.delete(assignments).where(eq(assignments.id, id));

    await writeAuditLog(tx, {
      userId: actorUserId,
      projectId: task.projectId,
      action: 'assignment.delete',
      entityType: 'assignment',
      entityId: id,
      before: existing,
    });

    return { deleted: true as const };
  }, db);
}

/**
 * Overallocation for one resource across all projects, bucketed by calendar day.
 * `projectId` on the route only authorizes the call — the computation is global.
 * Skips non-work resources (overallocation is a work/%-allocation concept).
 */
export async function getOverallocations(resourceId: string): Promise<OverallocationDay[]> {
  const [resource] = await db.select().from(resources).where(eq(resources.id, resourceId)).limit(1);
  if (!resource) throw new NotFoundError('Resource not found');
  if (resource.resourceType !== 'work') return [];

  const rows = await db
    .select({
      units: assignments.units,
      earlyStart: tasks.earlyStart,
      earlyFinish: tasks.earlyFinish,
    })
    .from(assignments)
    .innerJoin(tasks, eq(assignments.taskId, tasks.id))
    .where(eq(assignments.resourceId, resourceId));

  const spans: AssignmentSpan[] = [];
  for (const row of rows) {
    if (!row.earlyStart || !row.earlyFinish) continue;
    const units = numericFromDb(row.units) ?? 1;
    spans.push({
      units,
      earlyStart: row.earlyStart,
      earlyFinish: row.earlyFinish,
    });
  }

  const maxUnits = numericFromDb(resource.maxUnits) ?? 1.0;
  return findOverallocatedDays(maxUnits, spans);
}

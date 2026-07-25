import { asc, eq, inArray } from 'drizzle-orm';

import { db } from '../db/client.js';
import { assignments, baselineTasks, baselines, projects, tasks } from '../db/schema/index.js';
import { BadRequestError, NotFoundError } from '../middleware/errors.js';
import { numericFromDb, numericToDb } from './resourceService.js';
import { withSerializableRetry, writeAuditLog, type Db } from './scheduleRunner.js';

const MAX_BASELINE_NUMBER = 10; // inclusive — slots 0..10

function minutesBetween(a: Date | null, b: Date | null): number | null {
  if (a === null || b === null) return null;
  return Math.round((a.getTime() - b.getTime()) / 60_000);
}

function costVariance(current: number | null, baseline: number | null): number | null {
  if (current === null || baseline === null) return null;
  return current - baseline;
}

/** Lowest unused baselineNumber in 0..10, or null when all 11 slots are taken. */
export function nextBaselineNumber(used: ReadonlySet<number>): number | null {
  for (let n = 0; n <= MAX_BASELINE_NUMBER; n += 1) {
    if (!used.has(n)) return n;
  }
  return null;
}

export async function createBaseline(
  projectId: string,
  name: string | null | undefined,
  actorUserId: string,
): Promise<typeof baselines.$inferSelect> {
  return withSerializableRetry(async (tx) => {
    const [project] = await tx.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) throw new NotFoundError('Project not found');

    const existing = await tx
      .select({ baselineNumber: baselines.baselineNumber })
      .from(baselines)
      .where(eq(baselines.projectId, projectId));

    const used = new Set(existing.map((b) => b.baselineNumber));
    const baselineNumber = nextBaselineNumber(used);
    if (baselineNumber === null) {
      throw new BadRequestError('All 11 baseline slots (0–10) are in use; clear one before saving');
    }

    const [created] = await tx
      .insert(baselines)
      .values({
        projectId,
        baselineNumber,
        name: name ?? null,
        capturedBy: actorUserId,
      })
      .returning();

    if (!created) throw new Error('Failed to insert baseline');

    const taskRows = await tx.select().from(tasks).where(eq(tasks.projectId, projectId));
    const taskIds = taskRows.map((t) => t.id);

    const assignmentRows =
      taskIds.length === 0
        ? []
        : await tx.select().from(assignments).where(inArray(assignments.taskId, taskIds));

    const workByTask = new Map<string, number>();
    const costByTask = new Map<string, number>();
    for (const a of assignmentRows) {
      workByTask.set(a.taskId, (workByTask.get(a.taskId) ?? 0) + (a.workMinutes ?? 0));
      const cost = numericFromDb(a.cost) ?? 0;
      costByTask.set(a.taskId, (costByTask.get(a.taskId) ?? 0) + cost);
    }

    if (taskRows.length > 0) {
      await tx.insert(baselineTasks).values(
        taskRows.map((t) => {
          const hasAssignments = workByTask.has(t.id) || costByTask.has(t.id);
          return {
            baselineId: created.id,
            taskId: t.id,
            start: t.earlyStart,
            finish: t.earlyFinish,
            durationMinutes: t.durationMinutes,
            workMinutes: hasAssignments ? (workByTask.get(t.id) ?? 0) : null,
            cost: hasAssignments ? numericToDb(costByTask.get(t.id) ?? 0) : null,
          };
        }),
      );
    }

    await writeAuditLog(tx, {
      userId: actorUserId,
      projectId,
      action: 'baseline.save',
      entityType: 'baseline',
      entityId: created.id,
      after: created,
    });

    return created;
  }, db);
}

export async function listBaselines(
  projectId: string,
): Promise<Array<typeof baselines.$inferSelect>> {
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new NotFoundError('Project not found');

  return db
    .select()
    .from(baselines)
    .where(eq(baselines.projectId, projectId))
    .orderBy(asc(baselines.baselineNumber));
}

export interface BaselineTaskVariance {
  readonly taskId: string;
  readonly taskName: string;
  readonly baselineStart: Date | null;
  readonly baselineFinish: Date | null;
  readonly baselineDurationMinutes: number | null;
  readonly baselineWorkMinutes: number | null;
  readonly baselineCost: number | null;
  readonly currentStart: Date | null;
  readonly currentFinish: Date | null;
  readonly currentDurationMinutes: number | null;
  readonly currentCost: number | null;
  readonly startVarianceMinutes: number | null;
  readonly finishVarianceMinutes: number | null;
  readonly durationVarianceMinutes: number | null;
  readonly costVariance: number | null;
}

export interface BaselineDetail {
  readonly baseline: typeof baselines.$inferSelect;
  readonly tasks: readonly BaselineTaskVariance[];
}

export async function getBaselineDetail(baselineId: string): Promise<BaselineDetail> {
  const [baseline] = await db.select().from(baselines).where(eq(baselines.id, baselineId)).limit(1);
  if (!baseline) throw new NotFoundError('Baseline not found');

  const snapRows = await db
    .select({
      snap: baselineTasks,
      task: tasks,
    })
    .from(baselineTasks)
    .innerJoin(tasks, eq(baselineTasks.taskId, tasks.id))
    .where(eq(baselineTasks.baselineId, baselineId));

  const taskIds = snapRows.map((r) => r.task.id);
  const assignmentRows =
    taskIds.length === 0
      ? []
      : await db.select().from(assignments).where(inArray(assignments.taskId, taskIds));

  const currentCostByTask = new Map<string, number | null>();
  for (const id of taskIds) {
    currentCostByTask.set(id, null);
  }
  for (const a of assignmentRows) {
    const prev = currentCostByTask.get(a.taskId);
    const add = numericFromDb(a.cost) ?? 0;
    currentCostByTask.set(a.taskId, (prev ?? 0) + add);
  }

  const detailTasks: BaselineTaskVariance[] = snapRows.map(({ snap, task }) => {
    const baselineCost = numericFromDb(snap.cost);
    const currentCost = currentCostByTask.get(task.id) ?? null;
    const currentStart = task.earlyStart;
    const currentFinish = task.earlyFinish;
    const currentDuration = task.durationMinutes;

    return {
      taskId: task.id,
      taskName: task.name,
      baselineStart: snap.start,
      baselineFinish: snap.finish,
      baselineDurationMinutes: snap.durationMinutes,
      baselineWorkMinutes: snap.workMinutes,
      baselineCost,
      currentStart,
      currentFinish,
      currentDurationMinutes: currentDuration,
      currentCost,
      startVarianceMinutes: minutesBetween(currentStart, snap.start),
      finishVarianceMinutes: minutesBetween(currentFinish, snap.finish),
      durationVarianceMinutes:
        currentDuration === null || snap.durationMinutes === null
          ? null
          : currentDuration - snap.durationMinutes,
      costVariance: costVariance(currentCost, baselineCost),
    };
  });

  return { baseline, tasks: detailTasks };
}

export async function clearBaseline(
  baselineId: string,
  actorUserId: string,
): Promise<void> {
  return withSerializableRetry(async (tx: Db) => {
    const [existing] = await tx.select().from(baselines).where(eq(baselines.id, baselineId)).limit(1);
    if (!existing) throw new NotFoundError('Baseline not found');

    await tx.delete(baselines).where(eq(baselines.id, baselineId));

    await writeAuditLog(tx, {
      userId: actorUserId,
      projectId: existing.projectId,
      action: 'baseline.clear',
      entityType: 'baseline',
      entityId: baselineId,
      before: existing,
    });
  }, db);
}

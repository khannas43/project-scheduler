import type {
  AssignmentCreateInput,
  AssignmentUpdateInput,
  TimephasedDayUpdateInput,
} from '@pkg/schema';
import {
  asCalendarId,
  asEpochMinutes,
  MINUTES_PER_DAY,
  type CompiledCalendar,
} from '@pkg/scheduler';
import { and, asc, eq } from 'drizzle-orm';

import { db } from '../db/client.js';
import {
  assignments,
  assignmentTimephased,
  projects,
  resources,
  tasks,
} from '../db/schema/index.js';
import { BadRequestError, ConflictError, NotFoundError } from '../middleware/errors.js';
import { numericFromDb, numericToDb } from './resourceService.js';
import {
  loadCompiledCalendars,
  withSerializableRetry,
  writeAuditLog,
  type Db,
} from './scheduleRunner.js';

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; cause?: { code?: string } };
  return e.code === '23505' || e.cause?.code === '23505';
}

function dateToEpochMinutes(d: Date): ReturnType<typeof asEpochMinutes> {
  return asEpochMinutes(Math.floor(d.getTime() / 60_000));
}

function toUtcMidnightMinutes(d: Date): ReturnType<typeof asEpochMinutes> {
  const ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return asEpochMinutes(ms / 60_000);
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
/** Planned cost from work minutes + resource rates (hourly standardRate + costPerUse). */
export function computeCostFromWork(
  resource: Pick<WorkAndCostInput, 'standardRate' | 'costPerUse'>,
  workMinutes: number,
): number {
  const rate = Number(resource.standardRate ?? 0);
  const costPerUse = Number(resource.costPerUse ?? 0);
  return (workMinutes / 60) * rate + costPerUse;
}

export function computeWorkAndCost(
  task: Pick<WorkAndCostInput, 'durationMinutes'>,
  resource: Pick<WorkAndCostInput, 'standardRate' | 'costPerUse'>,
  units: number,
): { workMinutes: number; cost: number } {
  const duration = task.durationMinutes ?? 0;
  const workMinutes = Math.round(duration * units);
  return { workMinutes, cost: computeCostFromWork(resource, workMinutes) };
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

export interface TimephasedBucket {
  readonly periodDate: string;
  readonly plannedWorkMinutes: number;
}

/** Default working-day length used when converting day units ↔ minutes. */
export const WORKING_MINUTES_PER_DAY = 480;

/** Snap units to a clean step (default 0.05) so values like 0.9104 become 0.90. */
export function roundUnits(units: number, step = 0.05): number {
  if (!Number.isFinite(units)) return units;
  if (units === 0) return 0;
  const rounded = Math.round(units / step) * step;
  return Math.round(rounded * 1000) / 1000;
}

export function dayUnitsFromMinutes(
  plannedWorkMinutes: number,
  minutesPerDay = WORKING_MINUTES_PER_DAY,
): number {
  if (minutesPerDay <= 0) return 0;
  return roundUnits(plannedWorkMinutes / minutesPerDay);
}

export function minutesFromDayUnits(
  units: number,
  minutesPerDay = WORKING_MINUTES_PER_DAY,
): number {
  return Math.max(0, Math.round(units * minutesPerDay));
}

/** Peak day-units across a contour — used as assignment.units after a day edit. */
export function peakUnitsFromBuckets(
  buckets: readonly { plannedWorkMinutes: number | null | undefined }[],
  minutesPerDay = WORKING_MINUTES_PER_DAY,
): number {
  let peak = 0;
  for (const b of buckets) {
    const u = dayUnitsFromMinutes(b.plannedWorkMinutes ?? 0, minutesPerDay);
    if (u > peak) peak = u;
  }
  return peak > 0 ? peak : 1;
}

/** Normalize DB/API period dates to YYYY-MM-DD. */
export function normalizePeriodDate(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
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
 * True when the compiled calendar has working-minute capacity on `periodDate`
 * (YYYY-MM-DD UTC): slots[dayIndex] - (slots[dayIndex-1] ?? 0) > 0.
 */
export function isWorkingDayOnCalendar(periodDate: string, calendar: CompiledCalendar): boolean {
  const dayMidnight = toUtcMidnightMinutes(new Date(`${periodDate}T00:00:00Z`));
  const dayIndex = (dayMidnight - calendar.horizonStart) / MINUTES_PER_DAY;
  if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex >= calendar.slots.length) {
    return false;
  }
  const prior = dayIndex > 0 ? (calendar.slots[dayIndex - 1] ?? 0) : 0;
  const capacity = (calendar.slots[dayIndex] ?? 0) - prior;
  return capacity > 0;
}

/**
 * Evenly distribute `workMinutes` across working days in [earlyStart, earlyFinish]
 * (UTC calendar days). Remainder goes to the last working day so the total matches
 * exactly. Returns [] when workMinutes ≤ 0 or there are no working days in range
 * (e.g. a zero-duration milestone).
 */
export function distributeWorkAcrossWorkingDays(
  workMinutes: number,
  taskEarlyStart: Date,
  taskEarlyFinish: Date,
  calendar: CompiledCalendar,
): TimephasedBucket[] {
  if (workMinutes <= 0) return [];

  const workingDays = eachUtcDayInclusive(taskEarlyStart, taskEarlyFinish).filter((d) =>
    isWorkingDayOnCalendar(d, calendar),
  );
  if (workingDays.length === 0) return [];

  const base = Math.floor(workMinutes / workingDays.length);
  const remainder = workMinutes - base * workingDays.length;

  return workingDays.map((periodDate, i) => ({
    periodDate,
    plannedWorkMinutes: i === workingDays.length - 1 ? base + remainder : base,
  }));
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

/**
 * Rebuild assignment_timephased for one assignment inside the caller's transaction.
 * Skips non-work resources and unscheduled tasks (null earlyStart/earlyFinish).
 */
export async function refreshTimephasedDistribution(tx: Db, assignmentId: string): Promise<void> {
  const [assignment] = await tx
    .select()
    .from(assignments)
    .where(eq(assignments.id, assignmentId))
    .limit(1);
  if (!assignment) return;

  const [resource] = await tx
    .select()
    .from(resources)
    .where(eq(resources.id, assignment.resourceId))
    .limit(1);
  if (!resource || resource.resourceType !== 'work') return;

  const [task] = await tx.select().from(tasks).where(eq(tasks.id, assignment.taskId)).limit(1);
  if (!task || !task.earlyStart || !task.earlyFinish) return;

  const [project] = await tx.select().from(projects).where(eq(projects.id, task.projectId)).limit(1);
  if (!project) return;

  const projectStart = project.startDate
    ? dateToEpochMinutes(project.startDate)
    : toUtcMidnightMinutes(new Date());

  const { calendars, defaultCalendarId } = await loadCompiledCalendars(tx, project, projectStart);
  const calendarId = asCalendarId(task.calendarId ?? project.calendarId);
  const calendar = calendars.get(calendarId) ?? calendars.get(defaultCalendarId);
  if (!calendar) return;

  await tx.delete(assignmentTimephased).where(eq(assignmentTimephased.assignmentId, assignmentId));

  const buckets = distributeWorkAcrossWorkingDays(
    assignment.workMinutes ?? 0,
    task.earlyStart,
    task.earlyFinish,
    calendar,
  );
  if (buckets.length === 0) return;

  await tx.insert(assignmentTimephased).values(
    buckets.map((b) => ({
      assignmentId,
      periodDate: b.periodDate,
      plannedWorkMinutes: b.plannedWorkMinutes,
      actualWorkMinutes: null,
    })),
  );
}

export async function listAssignmentsForTask(
  taskId: string,
): Promise<Array<typeof assignments.$inferSelect>> {
  return db.select().from(assignments).where(eq(assignments.taskId, taskId));
}

export async function listTimephasedForAssignment(
  assignmentId: string,
): Promise<Array<typeof assignmentTimephased.$inferSelect>> {
  return db
    .select()
    .from(assignmentTimephased)
    .where(eq(assignmentTimephased.assignmentId, assignmentId))
    .orderBy(asc(assignmentTimephased.periodDate));
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
      const units = unitsExplicit ? roundUnits(input.units!) : 1.0;

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

      await refreshTimephasedDistribution(tx, created.id);

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

    const patch: {
      units?: string | null;
      workMinutes?: number;
      cost?: string | null;
      actualWorkMinutes?: number | null;
      actualCost?: string | null;
    } = {};
    let refreshTimephased = false;

    if (input.units !== undefined) {
      if (resource.resourceType !== 'work') {
        throw new BadRequestError(
          'units may only be updated on work-resource assignments (material/cost resources have no % allocation)',
        );
      }
      const units = roundUnits(input.units);
      const { workMinutes, cost } = computeWorkAndCost(task, resource, units);
      patch.units = numericToDb(units) ?? null;
      patch.workMinutes = workMinutes;
      if (input.cost === undefined) patch.cost = String(cost);
      refreshTimephased = true;
    }

    if (input.workMinutes !== undefined) {
      const workMinutes = input.workMinutes;
      const duration = task.durationMinutes ?? 0;
      if (duration > 0) {
        const units = roundUnits(workMinutes / duration);
        if (resource.resourceType === 'work') {
          if (units <= 0) {
            throw new BadRequestError('workMinutes must be positive when the task has a duration');
          }
          patch.units = numericToDb(units) ?? null;
        }
      }
      patch.workMinutes = workMinutes;
      if (input.cost === undefined) {
        patch.cost = String(computeCostFromWork(resource, workMinutes));
      }
      refreshTimephased = true;
    }

    if (input.cost !== undefined) {
      patch.cost = input.cost === null ? null : String(input.cost);
    }

    if (input.actualWorkMinutes !== undefined) {
      patch.actualWorkMinutes = input.actualWorkMinutes;
    }
    if (input.actualCost !== undefined) {
      patch.actualCost = numericToDb(input.actualCost) ?? null;
    }

    const [updated] = await tx
      .update(assignments)
      .set(patch)
      .where(eq(assignments.id, id))
      .returning();

    if (!updated) throw new NotFoundError('Assignment not found');

    // Timephased planned work depends on units/work — rebuild when either changes.
    if (refreshTimephased) {
      await refreshTimephasedDistribution(tx, id);
    }

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

export interface TimephasedDayUpdateResult {
  readonly assignment: typeof assignments.$inferSelect;
  readonly timephased: Array<typeof assignmentTimephased.$inferSelect>;
}

/**
 * Set planned work for one calendar day without redistributing the whole contour.
 * Recomputes assignment.workMinutes as the sum of day buckets and snaps units to 0.05.
 */
export async function updateTimephasedDay(
  assignmentId: string,
  input: TimephasedDayUpdateInput,
  actorUserId: string,
): Promise<TimephasedDayUpdateResult> {
  return withSerializableRetry(async (tx) => {
    const [existing] = await tx
      .select()
      .from(assignments)
      .where(eq(assignments.id, assignmentId))
      .limit(1);
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
      throw new BadRequestError('Day allocation can only be edited for work-resource assignments');
    }
    if (!task.earlyStart || !task.earlyFinish) {
      throw new BadRequestError('Task must be scheduled before day allocation can be edited');
    }

    const spanDays = eachUtcDayInclusive(task.earlyStart, task.earlyFinish);
    if (!spanDays.includes(input.periodDate)) {
      throw new BadRequestError(
        `periodDate ${input.periodDate} is outside the task schedule (${spanDays[0]}…${spanDays[spanDays.length - 1]})`,
      );
    }

    const periodDate = normalizePeriodDate(input.periodDate);
    if (!periodDate) {
      throw new BadRequestError('periodDate must be YYYY-MM-DD');
    }

    const plannedWorkMinutes =
      input.plannedWorkMinutes !== undefined
        ? input.plannedWorkMinutes
        : minutesFromDayUnits(roundUnits(input.units ?? 0));

    // Seed an even contour once if nothing exists yet, then overlay this day.
    let currentBuckets = await tx
      .select()
      .from(assignmentTimephased)
      .where(eq(assignmentTimephased.assignmentId, assignmentId));
    if (currentBuckets.length === 0 && (existing.workMinutes ?? 0) > 0) {
      await refreshTimephasedDistribution(tx, assignmentId);
      currentBuckets = await tx
        .select()
        .from(assignmentTimephased)
        .where(eq(assignmentTimephased.assignmentId, assignmentId));
    }

    const dayRow = currentBuckets.find((b) => normalizePeriodDate(b.periodDate) === periodDate);
    const storedPeriodDate = dayRow
      ? (normalizePeriodDate(dayRow.periodDate) ?? periodDate)
      : periodDate;

    if (plannedWorkMinutes <= 0) {
      if (dayRow) {
        await tx
          .delete(assignmentTimephased)
          .where(
            and(
              eq(assignmentTimephased.assignmentId, assignmentId),
              eq(assignmentTimephased.periodDate, storedPeriodDate),
            ),
          );
      }
    } else if (dayRow) {
      await tx
        .update(assignmentTimephased)
        .set({ plannedWorkMinutes })
        .where(
          and(
            eq(assignmentTimephased.assignmentId, assignmentId),
            eq(assignmentTimephased.periodDate, storedPeriodDate),
          ),
        );
    } else {
      await tx.insert(assignmentTimephased).values({
        assignmentId,
        periodDate,
        plannedWorkMinutes,
        actualWorkMinutes: null,
      });
    }

    const buckets = await tx
      .select()
      .from(assignmentTimephased)
      .where(eq(assignmentTimephased.assignmentId, assignmentId))
      .orderBy(asc(assignmentTimephased.periodDate));

    const workMinutes = buckets.reduce((sum, b) => sum + (b.plannedWorkMinutes ?? 0), 0);
    // Peak day units — NOT work/duration average — so editing one day does not
    // rewrite the level shown for every other day of the assignment.
    const units = workMinutes > 0 ? peakUnitsFromBuckets(buckets) : 1;

    const [updated] = await tx
      .update(assignments)
      .set({
        workMinutes,
        units: numericToDb(units) ?? null,
        cost: String(computeCostFromWork(resource, workMinutes)),
      })
      .where(eq(assignments.id, assignmentId))
      .returning();

    if (!updated) throw new NotFoundError('Assignment not found');

    await writeAuditLog(tx, {
      userId: actorUserId,
      projectId: task.projectId,
      action: 'assignment.timephased.update',
      entityType: 'assignment',
      entityId: assignmentId,
      before: existing,
      after: { assignment: updated, periodDate, plannedWorkMinutes },
    });

    return { assignment: updated, timephased: buckets };
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

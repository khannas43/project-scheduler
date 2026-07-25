import {
  asCalendarId,
  asEpochMinutes,
  asTaskId,
  compileCalendar,
  expandRecurringExceptions,
  schedule,
  SchedulingError,
  validateGraph,
  type CalendarExceptionInput,
  type CompiledCalendar,
  type ConstraintType,
  type DependencyInput,
  type LinkType,
  type RawCalendarException,
  type SchedulerOutput,
  type SchedulingWarning,
  type TaskInput,
} from '@pkg/scheduler';
import { eq, inArray, or, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import * as schema from '../db/schema/index.js';
import {
  auditLog,
  calendarExceptions,
  calendars,
  projects,
  taskDependencies,
  tasks,
} from '../db/schema/index.js';
import { SchedulingConflictError } from '../middleware/errors.js';

export type Db = PostgresJsDatabase<typeof schema>;

const HORIZON_DAYS = 365 * 5;

export interface ComputedFieldSnapshot {
  readonly earlyStart: Date | null;
  readonly earlyFinish: Date | null;
  readonly lateStart: Date | null;
  readonly lateFinish: Date | null;
  readonly totalFloatMinutes: number | null;
  readonly freeFloatMinutes: number | null;
  readonly isCritical: boolean;
}

/** JSON-safe form of `@pkg/scheduler` SchedulingWarning (TaskId → string). */
export interface MutationWarning {
  readonly code: string;
  readonly taskIds: readonly string[];
  readonly message: string;
}

export interface MutationResult {
  readonly task: typeof tasks.$inferSelect | null;
  readonly affected: Array<typeof tasks.$inferSelect>;
  readonly projectVersion: number;
  readonly warnings: readonly MutationWarning[];
}

function toMutationWarnings(warnings: readonly SchedulingWarning[]): MutationWarning[] {
  return warnings.map((w) => ({
    code: w.code,
    taskIds: w.taskIds.map(String),
    message: w.message,
  }));
}

function dateToEpochMinutes(d: Date): ReturnType<typeof asEpochMinutes> {
  return asEpochMinutes(Math.floor(d.getTime() / 60_000));
}

function epochMinutesToDate(m: number): Date {
  return new Date(m * 60_000);
}

function toUtcMidnightMinutes(d: Date): ReturnType<typeof asEpochMinutes> {
  const ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return asEpochMinutes(ms / 60_000);
}

/** Postgres `time` → minutes from midnight (`HH:MM` or `HH:MM:SS`). */
export function timeToMinutes(value: string): number {
  const [hRaw, mRaw] = value.split(':');
  const h = Number(hRaw);
  const m = Number(mRaw ?? 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    throw new RangeError(`Invalid time value: ${value}`);
  }
  return h * 60 + m;
}

function parseRecurrence(value: unknown): { readonly type: 'annual' } | null {
  if (
    value &&
    typeof value === 'object' &&
    'type' in value &&
    (value as { type: unknown }).type === 'annual'
  ) {
    return { type: 'annual' };
  }
  return null;
}

/**
 * Map DB `calendar_exceptions` rows → expanded `CalendarExceptionInput[]`
 * (annual recurrence unrolled across the compile horizon).
 */
export function exceptionsFromDbRows(
  rows: readonly {
    exceptionDate: string;
    isWorking: boolean;
    startTime: string | null;
    finishTime: string | null;
    recurrence: unknown;
  }[],
  horizonStart: ReturnType<typeof asEpochMinutes>,
  horizonDays: number,
): CalendarExceptionInput[] {
  const raw = rows.map((ex): RawCalendarException => {
    const date = toUtcMidnightMinutes(new Date(`${ex.exceptionDate}T00:00:00Z`));
    const recurrence = parseRecurrence(ex.recurrence);
    if (ex.startTime && ex.finishTime) {
      return {
        date,
        isWorking: ex.isWorking,
        startMinute: timeToMinutes(ex.startTime),
        finishMinute: timeToMinutes(ex.finishTime),
        recurrence,
      };
    }
    if (ex.startTime) {
      return {
        date,
        isWorking: ex.isWorking,
        startMinute: timeToMinutes(ex.startTime),
        recurrence,
      };
    }
    if (ex.finishTime) {
      return {
        date,
        isWorking: ex.isWorking,
        finishMinute: timeToMinutes(ex.finishTime),
        recurrence,
      };
    }
    return {
      date,
      isWorking: ex.isWorking,
      recurrence,
    };
  });
  return expandRecurringExceptions(raw, horizonStart, horizonDays);
}

function isSerializationFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; cause?: { code?: string } };
  return e.code === '40001' || e.cause?.code === '40001';
}

/** §9.3: SERIALIZABLE reschedule transactions; retry once on serialisation failure. */
export async function withSerializableRetry<T>(fn: (tx: Db) => Promise<T>, db: Db): Promise<T> {
  const run = () => db.transaction((tx) => fn(tx as unknown as Db), { isolationLevel: 'serializable' });
  try {
    return await run();
  } catch (error) {
    if (isSerializationFailure(error)) {
      return await run();
    }
    throw error;
  }
}

export function mapSchedulingError(error: unknown): never {
  if (error instanceof SchedulingError) {
    throw new SchedulingConflictError(error.message, error.taskIds.map(String));
  }
  throw error;
}

export function computedFieldsEqual(a: ComputedFieldSnapshot, b: ComputedFieldSnapshot): boolean {
  const ts = (d: Date | null) => (d ? d.getTime() : null);
  return (
    ts(a.earlyStart) === ts(b.earlyStart) &&
    ts(a.earlyFinish) === ts(b.earlyFinish) &&
    ts(a.lateStart) === ts(b.lateStart) &&
    ts(a.lateFinish) === ts(b.lateFinish) &&
    a.totalFloatMinutes === b.totalFloatMinutes &&
    a.freeFloatMinutes === b.freeFloatMinutes &&
    a.isCritical === b.isCritical
  );
}

function snapshotComputed(row: typeof tasks.$inferSelect): ComputedFieldSnapshot {
  return {
    earlyStart: row.earlyStart,
    earlyFinish: row.earlyFinish,
    lateStart: row.lateStart,
    lateFinish: row.lateFinish,
    totalFloatMinutes: row.totalFloatMinutes,
    freeFloatMinutes: row.freeFloatMinutes,
    isCritical: row.isCritical,
  };
}

export function toTaskInputs(
  rows: Array<typeof tasks.$inferSelect>,
  defaultCalendarId: string,
): TaskInput[] {
  return rows
    .filter((t) => t.schedulingMode !== 'agile')
    .map((t) => ({
      id: asTaskId(t.id),
      parentId: t.parentId ? asTaskId(t.parentId) : null,
      isSummary: t.isSummary,
      durationMinutes: t.isSummary ? 0 : (t.durationMinutes ?? 0),
      calendarId: asCalendarId(t.calendarId ?? defaultCalendarId),
      // Required so schedule() can emit CONSTRAINT_OVERRIDES_DEPENDENCY etc.
      constraintType: (t.constraintType as ConstraintType | null) ?? null,
      constraintDate: t.constraintDate ? dateToEpochMinutes(t.constraintDate) : null,
      deadline: t.deadline ? dateToEpochMinutes(t.deadline) : null,
    }));
}

export function toDependencyInputs(rows: Array<typeof taskDependencies.$inferSelect>): DependencyInput[] {
  return rows.map((d) => ({
    predecessorId: asTaskId(d.predecessorId),
    successorId: asTaskId(d.successorId),
    linkType: d.linkType as LinkType,
    lagMinutes: d.lagMinutes,
    // numeric() columns come back as string | null from Drizzle.
    lagPercent: d.lagPercent === null ? null : Number(d.lagPercent),
  }));
}

/** Validate a prospective dependency graph before insert (cycles / summary-links). */
export function assertGraphValid(
  taskRows: Array<typeof tasks.$inferSelect>,
  depRows: Array<typeof taskDependencies.$inferSelect>,
  defaultCalendarId: string,
): void {
  try {
    validateGraph(toTaskInputs(taskRows, defaultCalendarId), toDependencyInputs(depRows));
  } catch (error) {
    mapSchedulingError(error);
  }
}

async function loadCompiledCalendars(
  tx: Db,
  project: typeof projects.$inferSelect,
  projectStart: ReturnType<typeof asEpochMinutes>,
): Promise<{
  calendars: ReadonlyMap<ReturnType<typeof asCalendarId>, CompiledCalendar>;
  defaultCalendarId: ReturnType<typeof asCalendarId>;
}> {
  const calendarRows = await tx
    .select()
    .from(calendars)
    .where(or(eq(calendars.projectId, project.id), eq(calendars.id, project.calendarId)));

  const calIds = calendarRows.map((c) => c.id);
  const exceptionRows =
    calIds.length === 0
      ? []
      : await tx.select().from(calendarExceptions).where(inArray(calendarExceptions.calendarId, calIds));

  const exceptionsByCal = new Map<string, typeof exceptionRows>();
  for (const ex of exceptionRows) {
    const list = exceptionsByCal.get(ex.calendarId) ?? [];
    list.push(ex);
    exceptionsByCal.set(ex.calendarId, list);
  }

  const horizonStart = toUtcMidnightMinutes(epochMinutesToDate(projectStart));
  const map = new Map<ReturnType<typeof asCalendarId>, CompiledCalendar>();

  for (const cal of calendarRows) {
    const id = asCalendarId(cal.id);
    const exceptions = exceptionsFromDbRows(
      exceptionsByCal.get(cal.id) ?? [],
      horizonStart,
      HORIZON_DAYS,
    );

    map.set(
      id,
      compileCalendar({
        horizonStart,
        horizonDays: HORIZON_DAYS,
        workingWeekdays: cal.workingDays,
        defaultStartMinute: timeToMinutes(cal.defaultStart),
        defaultFinishMinute: timeToMinutes(cal.defaultFinish),
        exceptions,
      }),
    );
  }

  const defaultCalendarId = asCalendarId(project.calendarId);
  if (!map.has(defaultCalendarId)) {
    throw new Error(`Project default calendar ${project.calendarId} is not loadable`);
  }

  return { calendars: map, defaultCalendarId };
}

export async function loadProjectDependencies(
  tx: Db,
  taskRows: Array<typeof tasks.$inferSelect>,
): Promise<Array<typeof taskDependencies.$inferSelect>> {
  const taskIds = taskRows.map((t) => t.id);
  if (taskIds.length === 0) return [];
  return tx.select().from(taskDependencies).where(inArray(taskDependencies.predecessorId, taskIds));
}

/**
 * Load the project graph, run schedule(), persist computed columns, bump
 * project.version. Returns tasks whose computed fields actually changed.
 */
export async function rescheduleProject(
  tx: Db,
  projectId: string,
  opts?: { focusTaskId?: string },
): Promise<MutationResult> {
  const [project] = await tx.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) {
    throw new Error(`Project ${projectId} not found during reschedule`);
  }

  const taskRows = await tx.select().from(tasks).where(eq(tasks.projectId, projectId));
  const dependencies = await loadProjectDependencies(tx, taskRows);

  const projectStart = project.startDate
    ? dateToEpochMinutes(project.startDate)
    : toUtcMidnightMinutes(new Date());

  const { calendars: compiled, defaultCalendarId } = await loadCompiledCalendars(tx, project, projectStart);

  let output: SchedulerOutput;
  try {
    output = schedule({
      projectStart,
      tasks: toTaskInputs(taskRows, project.calendarId),
      dependencies: toDependencyInputs(dependencies),
      calendars: compiled,
      defaultCalendarId,
    });
  } catch (error) {
    mapSchedulingError(error);
  }

  const beforeById = new Map(taskRows.map((t) => [t.id, snapshotComputed(t)]));
  const affectedIds: string[] = [];

  for (const row of taskRows) {
    const computed = output.tasks.get(asTaskId(row.id));
    if (!computed) continue;

    const next: ComputedFieldSnapshot = {
      earlyStart: epochMinutesToDate(computed.earlyStart),
      earlyFinish: epochMinutesToDate(computed.earlyFinish),
      lateStart: computed.lateStart === null ? null : epochMinutesToDate(computed.lateStart),
      lateFinish: computed.lateFinish === null ? null : epochMinutesToDate(computed.lateFinish),
      totalFloatMinutes: computed.totalFloatMinutes,
      freeFloatMinutes: computed.freeFloatMinutes,
      isCritical: computed.isCritical,
    };

    const prev = beforeById.get(row.id);
    if (prev && computedFieldsEqual(prev, next)) continue;

    await tx
      .update(tasks)
      .set({
        earlyStart: next.earlyStart,
        earlyFinish: next.earlyFinish,
        lateStart: next.lateStart,
        lateFinish: next.lateFinish,
        totalFloatMinutes: next.totalFloatMinutes,
        freeFloatMinutes: next.freeFloatMinutes,
        isCritical: next.isCritical,
      })
      .where(eq(tasks.id, row.id));
    affectedIds.push(row.id);
  }

  await tx
    .update(projects)
    .set({
      finishDate: epochMinutesToDate(output.projectFinish),
      version: sql`${projects.version} + 1`,
    })
    .where(eq(projects.id, projectId));

  const [bumped] = await tx
    .select({ version: projects.version })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  const refreshed =
    affectedIds.length === 0 ? [] : await tx.select().from(tasks).where(inArray(tasks.id, affectedIds));

  let focus: typeof tasks.$inferSelect | null = null;
  if (opts?.focusTaskId) {
    const [row] = await tx.select().from(tasks).where(eq(tasks.id, opts.focusTaskId)).limit(1);
    focus = row ?? null;
  }

  return {
    task: focus,
    affected: refreshed,
    projectVersion: bumped?.version ?? project.version + 1,
    warnings: toMutationWarnings(output.warnings),
  };
}

export async function writeAuditLog(
  tx: Db,
  entry: {
    userId: string;
    projectId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
  },
): Promise<void> {
  await tx.insert(auditLog).values({
    userId: entry.userId,
    projectId: entry.projectId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}

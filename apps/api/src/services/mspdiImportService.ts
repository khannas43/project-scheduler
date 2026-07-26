import {
  asCalendarId,
  asTaskId,
  validateGraph,
  type ConstraintType,
  type DependencyInput,
  type LinkType,
  type TaskInput,
} from '@pkg/scheduler';
import { and, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { randomUUID } from 'node:crypto';

import { db } from '../db/client.js';
import {
  assignments,
  calendarExceptions,
  calendars,
  projects,
  resources,
  taskDependencies,
  tasks,
} from '../db/schema/index.js';
import { BadRequestError, NotFoundError } from '../middleware/errors.js';
import {
  mapAccrueAt,
  mapConstraintType,
  mapLinkType,
  mapResourceType,
  mapTaskType,
} from './mspdiExportService.js';
import { numericToDb } from './resourceService.js';
import {
  mapSchedulingError,
  rescheduleProject,
  withSerializableRetry,
  writeAuditLog,
  type Db,
} from './scheduleRunner.js';
import { wbsCodeFromPath } from './wbs.js';

// --- Parsed intermediate shapes (mirror export Mspdi* fields as parse output) ---

export interface MspdiParsedDependency {
  readonly predecessorUid: number;
  readonly successorUid: number;
  readonly linkType: LinkType;
  readonly lagMinutes: number;
}

export interface MspdiParsedTask {
  readonly uid: number;
  readonly name: string;
  readonly parentUid: number | null;
  readonly wbsCode: string | null;
  readonly outlineLevel: number;
  readonly isSummary: boolean;
  readonly durationMinutes: number;
  readonly taskType: 'fixed_units' | 'fixed_duration' | 'fixed_work';
  readonly constraintType: ConstraintType;
  readonly constraintDate: Date | null;
  readonly deadline: Date | null;
  readonly earlyStart: Date | null;
  readonly earlyFinish: Date | null;
  readonly totalFloatMinutes: number | null;
  readonly freeFloatMinutes: number | null;
  readonly isCritical: boolean;
  readonly percentComplete: number | null;
  readonly actualStart: Date | null;
  readonly actualFinish: Date | null;
  readonly actualDurationMinutes: number | null;
}

export interface MspdiParsedResource {
  readonly uid: number;
  readonly name: string;
  readonly resourceType: 'work' | 'material' | 'cost';
  readonly maxUnits: number | null;
  readonly standardRate: number | null;
  readonly overtimeRate: number | null;
  readonly costPerUse: number | null;
  readonly accrualType: 'start' | 'end' | 'prorated';
  readonly calendarUid: number | null;
}

export interface MspdiParsedAssignment {
  readonly uid: number;
  readonly taskUid: number;
  readonly resourceUid: number;
  readonly units: number | null;
  readonly workMinutes: number | null;
  readonly cost: number | null;
  readonly actualWorkMinutes: number | null;
  readonly actualCost: number | null;
}

export interface MspdiParsedCalendarException {
  readonly exceptionDate: string;
  readonly isWorking: boolean;
  readonly startTime: string | null;
  readonly finishTime: string | null;
  readonly name: string | null;
}

export interface MspdiParsedCalendar {
  readonly uid: number;
  readonly name: string;
  readonly workingDays: readonly number[];
  readonly defaultStart: string;
  readonly defaultFinish: string;
  readonly exceptions: readonly MspdiParsedCalendarException[];
}

export interface MspdiParsedProject {
  readonly name: string;
  readonly startDate: Date | null;
  readonly finishDate: Date | null;
  readonly calendarUid: number;
  readonly tasks: readonly MspdiParsedTask[];
  readonly resources: readonly MspdiParsedResource[];
  readonly assignments: readonly MspdiParsedAssignment[];
  readonly calendars: readonly MspdiParsedCalendar[];
  readonly dependencies: readonly MspdiParsedDependency[];
}

// --- Reverse maps: invert export helpers by probing (never re-derive by hand) ---

const LINK_TYPES = ['FS', 'SS', 'FF', 'SF'] as const satisfies readonly LinkType[];
const CONSTRAINT_TYPES = [
  'asap',
  'alap',
  'mso',
  'mfo',
  'snet',
  'snlt',
  'fnet',
  'fnlt',
] as const satisfies readonly ConstraintType[];
const TASK_TYPES = ['fixed_units', 'fixed_duration', 'fixed_work'] as const;
const RESOURCE_TYPES = ['work', 'material', 'cost'] as const;
const ACCRUAL_TYPES = ['start', 'end', 'prorated'] as const;

export function unmapLinkType(code: number): LinkType {
  for (const lt of LINK_TYPES) {
    if (mapLinkType(lt) === code) return lt;
  }
  return 'FS';
}

export function unmapConstraintType(code: number): ConstraintType {
  for (const c of CONSTRAINT_TYPES) {
    if (mapConstraintType(c) === code) return c;
  }
  return 'asap';
}

export function unmapTaskType(code: number): 'fixed_units' | 'fixed_duration' | 'fixed_work' {
  for (const t of TASK_TYPES) {
    if (mapTaskType(t) === code) return t;
  }
  return 'fixed_duration';
}

export function unmapResourceType(code: number): 'work' | 'material' | 'cost' {
  for (const t of RESOURCE_TYPES) {
    if (mapResourceType(t) === code) return t;
  }
  return 'work';
}

export function unmapAccrueAt(code: number): 'start' | 'end' | 'prorated' {
  for (const a of ACCRUAL_TYPES) {
    if (mapAccrueAt(a) === code) return a;
  }
  return 'prorated';
}

/** PT{h}H{m}M{s}S (and partial forms) → whole minutes. */
export function parseMspdiDuration(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  if (typeof value !== 'string' || value.length === 0) return 0;
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(value.trim());
  if (!m) return 0;
  const hours = Number(m[1] ?? 0);
  const minutes = Number(m[2] ?? 0);
  const seconds = Number(m[3] ?? 0);
  return Math.max(0, hours * 60 + minutes + Math.round(seconds / 60));
}

/** Naive MSPDI datetime → Date treated as UTC (mirrors export stripping the Z). */
export function parseMspdiDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const s = String(value).trim();
  if (!s) return null;
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const withT = s.includes('T') ? s : `${s}T00:00:00`;
  const d = new Date(`${withT}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function num(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return fallback;
}

function str(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value);
}

function bool01(value: unknown): boolean {
  return num(value, 0) === 1 || value === true || value === '1';
}

function mspdiDayTypeToJsWeekday(dayType: number): number {
  // MSPDI DayType 1=Sun .. 7=Sat → JS 0=Sun .. 6=Sat
  return dayType - 1;
}

function normalizeTime(t: string): string {
  if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
  if (t.length >= 8) return t.slice(0, 8);
  return t || '09:00:00';
}

function dateOnly(isoOrDate: string): string {
  return isoOrDate.slice(0, 10);
}

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  trimValues: true,
  isArray: (tagName) =>
    [
      'Task',
      'Resource',
      'Assignment',
      'Calendar',
      'WeekDay',
      'Exception',
      'PredecessorLink',
      'WorkingTime',
    ].includes(tagName),
});

/**
 * Pure MSPDI XML → intermediate shape. No DB access.
 * Throws BadRequestError on malformed/unparseable XML.
 */
export function parseMspdiXml(xml: string): MspdiParsedProject {
  if (typeof xml !== 'string' || xml.trim().length === 0) {
    throw new BadRequestError('MSPDI XML body is required');
  }

  const validation = XMLValidator.validate(xml, { allowBooleanAttributes: true });
  if (validation !== true) {
    const detail =
      typeof validation === 'object' && validation && 'err' in validation
        ? String((validation as { err?: { msg?: string } }).err?.msg ?? 'invalid XML')
        : 'invalid XML';
    throw new BadRequestError(`Malformed MSPDI XML: ${detail}`);
  }

  let root: Record<string, unknown>;
  try {
    const parsed = xmlParser.parse(xml) as Record<string, unknown>;
    const project = parsed.Project;
    if (!project || typeof project !== 'object') {
      throw new BadRequestError('MSPDI XML must contain a <Project> root element');
    }
    root = project as Record<string, unknown>;
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
    throw new BadRequestError(
      `Failed to parse MSPDI XML: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }

  const calendarNodes = asArray(
    (root.Calendars as { Calendar?: unknown } | undefined)?.Calendar,
  ) as Array<Record<string, unknown>>;

  const calendarsParsed: MspdiParsedCalendar[] = calendarNodes.map((c) => {
    const weekDays = asArray((c.WeekDays as { WeekDay?: unknown } | undefined)?.WeekDay) as Array<
      Record<string, unknown>
    >;
    const workingDays: number[] = [];
    let defaultStart = '09:00:00';
    let defaultFinish = '17:00:00';
    for (const wd of weekDays) {
      const dayType = num(wd.DayType, 0);
      const jsDay = mspdiDayTypeToJsWeekday(dayType);
      if (jsDay < 0 || jsDay > 6) continue;
      if (bool01(wd.DayWorking)) {
        workingDays.push(jsDay);
        const wt = asArray(
          (wd.WorkingTimes as { WorkingTime?: unknown } | undefined)?.WorkingTime,
        )[0] as Record<string, unknown> | undefined;
        if (wt) {
          defaultStart = normalizeTime(str(wt.FromTime) || defaultStart);
          defaultFinish = normalizeTime(str(wt.ToTime) || defaultFinish);
        }
      }
    }

    const exceptions = asArray(
      (c.Exceptions as { Exception?: unknown } | undefined)?.Exception,
    ) as Array<Record<string, unknown>>;

    return {
      uid: num(c.UID),
      name: str(c.Name) || `Calendar ${num(c.UID)}`,
      workingDays: workingDays.length > 0 ? workingDays : [1, 2, 3, 4, 5],
      defaultStart,
      defaultFinish,
      exceptions: exceptions.map((ex) => {
        const period = (ex.TimePeriod ?? {}) as Record<string, unknown>;
        const from = str(period.FromDate);
        return {
          exceptionDate: dateOnly(from || '1970-01-01'),
          isWorking: bool01(ex.DayWorking),
          startTime: null,
          finishTime: null,
          name: str(ex.Name) || null,
        };
      }),
    };
  });

  const taskNodes = asArray((root.Tasks as { Task?: unknown } | undefined)?.Task) as Array<
    Record<string, unknown>
  >;

  // Parent from OutlineLevel stack (MSPDI convention — export doesn't emit ParentUID).
  const levelParent: Array<number | undefined> = [];
  const tasksParsed: MspdiParsedTask[] = [];
  const dependencies: MspdiParsedDependency[] = [];

  for (const t of taskNodes) {
    const uid = num(t.UID);
    const outlineLevel = Math.max(1, num(t.OutlineLevel, 1));
    const parentUid =
      outlineLevel <= 1 ? null : (levelParent[outlineLevel - 1] ?? null);
    levelParent[outlineLevel] = uid;
    levelParent.length = outlineLevel + 1;

    const predLinks = asArray(
      (t as { PredecessorLink?: unknown }).PredecessorLink,
    ) as Array<Record<string, unknown>>;
    for (const link of predLinks) {
      dependencies.push({
        predecessorUid: num(link.PredecessorUID),
        successorUid: uid,
        linkType: unmapLinkType(num(link.Type, 1)),
        lagMinutes: Math.round(num(link.LinkLag, 0) / 10),
      });
    }

    const constraintType = unmapConstraintType(num(t.ConstraintType, 0));
    tasksParsed.push({
      uid,
      name: str(t.Name) || `Task ${uid}`,
      parentUid,
      wbsCode: str(t.WBS) || null,
      outlineLevel,
      isSummary: bool01(t.Summary),
      durationMinutes: parseMspdiDuration(t.Duration),
      taskType: unmapTaskType(num(t.Type, 1)),
      constraintType,
      constraintDate:
        constraintType === 'asap' ? null : parseMspdiDate(t.ConstraintDate),
      deadline: parseMspdiDate(t.Deadline),
      earlyStart: parseMspdiDate(t.Start),
      earlyFinish: parseMspdiDate(t.Finish),
      totalFloatMinutes: t.TotalSlack === undefined ? null : parseMspdiDuration(t.TotalSlack),
      freeFloatMinutes: t.FreeSlack === undefined ? null : parseMspdiDuration(t.FreeSlack),
      isCritical: bool01(t.Critical),
      percentComplete: t.PercentComplete === undefined ? null : num(t.PercentComplete, 0),
      actualStart: parseMspdiDate(t.ActualStart),
      actualFinish: parseMspdiDate(t.ActualFinish),
      actualDurationMinutes:
        t.ActualDuration === undefined ? null : parseMspdiDuration(t.ActualDuration),
    });
  }

  const resourceNodes = asArray(
    (root.Resources as { Resource?: unknown } | undefined)?.Resource,
  ) as Array<Record<string, unknown>>;

  const resourcesParsed: MspdiParsedResource[] = resourceNodes.map((r) => ({
    uid: num(r.UID),
    name: str(r.Name) || `Resource ${num(r.UID)}`,
    resourceType: unmapResourceType(num(r.Type, 1)),
    maxUnits: r.MaxUnits === undefined ? null : num(r.MaxUnits, 1),
    standardRate: r.StandardRate === undefined ? null : num(r.StandardRate),
    overtimeRate: r.OvertimeRate === undefined ? null : num(r.OvertimeRate),
    costPerUse: r.CostPerUse === undefined ? null : num(r.CostPerUse),
    accrualType: unmapAccrueAt(num(r.AccrueAt, 3)),
    calendarUid: r.CalendarUID === undefined ? null : num(r.CalendarUID),
  }));

  const assignmentNodes = asArray(
    (root.Assignments as { Assignment?: unknown } | undefined)?.Assignment,
  ) as Array<Record<string, unknown>>;

  const assignmentsParsed: MspdiParsedAssignment[] = assignmentNodes.map((a) => ({
    uid: num(a.UID),
    taskUid: num(a.TaskUID),
    resourceUid: num(a.ResourceUID),
    units: a.Units === undefined ? null : num(a.Units, 1),
    workMinutes: a.Work === undefined ? null : parseMspdiDuration(a.Work),
    cost: a.Cost === undefined ? null : num(a.Cost),
    actualWorkMinutes: a.ActualWork === undefined ? null : parseMspdiDuration(a.ActualWork),
    actualCost: a.ActualCost === undefined ? null : num(a.ActualCost),
  }));

  return {
    name: str(root.Name) || 'Imported project',
    startDate: parseMspdiDate(root.StartDate),
    finishDate: parseMspdiDate(root.FinishDate),
    calendarUid: num(root.CalendarUID, 0),
    tasks: tasksParsed,
    resources: resourcesParsed,
    assignments: assignmentsParsed,
    calendars: calendarsParsed,
    dependencies,
  };
}

/** Structural validation against the engine — call before wiping project tasks. */
export function validateParsedMspdiGraph(
  parsed: MspdiParsedProject,
  defaultCalendarId: string,
): void {
  const calId = asCalendarId(defaultCalendarId);
  const taskInputs: TaskInput[] = parsed.tasks.map((t) => ({
    id: asTaskId(`uid-${t.uid}`),
    parentId: t.parentUid === null ? null : asTaskId(`uid-${t.parentUid}`),
    isSummary: t.isSummary,
    durationMinutes: t.isSummary ? 0 : t.durationMinutes,
    calendarId: calId,
    constraintType: t.constraintType,
    constraintDate: null,
    deadline: null,
  }));

  const depInputs: DependencyInput[] = parsed.dependencies.map((d) => ({
    predecessorId: asTaskId(`uid-${d.predecessorUid}`),
    successorId: asTaskId(`uid-${d.successorUid}`),
    linkType: d.linkType,
    lagMinutes: d.lagMinutes,
    lagPercent: null,
  }));

  try {
    validateGraph(taskInputs, depInputs);
  } catch (error) {
    mapSchedulingError(error);
  }
}

function hoursPerDayFromTimes(start: string, finish: string): string {
  const toMin = (t: string) => {
    const [h, m] = normalizeTime(t).split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const mins = Math.max(0, toMin(finish) - toMin(start));
  return String(mins / 60 || 8);
}

async function matchOrCreateCalendar(
  tx: Db,
  projectId: string,
  parsed: MspdiParsedCalendar,
): Promise<string> {
  const [existing] = await tx
    .select()
    .from(calendars)
    .where(
      and(
        ilike(calendars.name, parsed.name),
        or(isNull(calendars.projectId), eq(calendars.projectId, projectId)),
      ),
    )
    .limit(1);

  if (existing) return existing.id;

  const [created] = await tx
    .insert(calendars)
    .values({
      name: parsed.name,
      projectId,
      workingDays: [...parsed.workingDays],
      hoursPerDay: hoursPerDayFromTimes(parsed.defaultStart, parsed.defaultFinish),
      defaultStart: normalizeTime(parsed.defaultStart),
      defaultFinish: normalizeTime(parsed.defaultFinish),
    })
    .returning();

  if (!created) throw new Error('Failed to insert calendar');

  if (parsed.exceptions.length > 0) {
    await tx.insert(calendarExceptions).values(
      parsed.exceptions.map((ex) => ({
        calendarId: created.id,
        exceptionDate: ex.exceptionDate,
        isWorking: ex.isWorking,
        startTime: ex.startTime,
        finishTime: ex.finishTime,
        name: ex.name,
      })),
    );
  }

  return created.id;
}

async function matchOrCreateResource(
  tx: Db,
  parsed: MspdiParsedResource,
  calendarId: string | null,
): Promise<string> {
  const [existing] = await tx
    .select()
    .from(resources)
    .where(ilike(resources.name, parsed.name))
    .limit(1);

  if (existing) return existing.id;

  const [created] = await tx
    .insert(resources)
    .values({
      name: parsed.name,
      resourceType: parsed.resourceType,
      maxUnits: numericToDb(parsed.maxUnits) ?? null,
      standardRate: numericToDb(parsed.standardRate) ?? null,
      overtimeRate: numericToDb(parsed.overtimeRate) ?? null,
      costPerUse: numericToDb(parsed.costPerUse) ?? null,
      accrualType: parsed.accrualType,
      calendarId,
    })
    .returning();

  if (!created) throw new Error('Failed to insert resource');
  return created.id;
}

/**
 * Replace the project's tasks/deps/assignments from an MSPDI XML document.
 * Resources/calendars are match-or-create by case-insensitive name (not wiped).
 */
export async function importProjectMspdi(
  projectId: string,
  xml: string,
  actorUserId: string,
): Promise<{ taskCount: number; resourceCount: number; calendarCount: number }> {
  const parsed = parseMspdiXml(xml);

  return withSerializableRetry(async (tx) => {
    const [project] = await tx.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) throw new NotFoundError('Project not found');

    // Validate graph before any destructive writes.
    validateParsedMspdiGraph(parsed, project.calendarId);

    const calendarUidToId = new Map<number, string>();
    for (const cal of parsed.calendars) {
      const id = await matchOrCreateCalendar(tx, projectId, cal);
      calendarUidToId.set(cal.uid, id);
    }

    const defaultCalendarId =
      calendarUidToId.get(parsed.calendarUid) ??
      calendarUidToId.values().next().value ??
      project.calendarId;

    if (defaultCalendarId !== project.calendarId) {
      await tx
        .update(projects)
        .set({ calendarId: defaultCalendarId, version: sql`${projects.version} + 1` })
        .where(eq(projects.id, projectId));
    }

    const resourceUidToId = new Map<number, string>();
    for (const res of parsed.resources) {
      const calId =
        res.calendarUid !== null ? (calendarUidToId.get(res.calendarUid) ?? null) : null;
      const id = await matchOrCreateResource(tx, res, calId);
      resourceUidToId.set(res.uid, id);
    }

    // Wipe project tasks — cascades deps / assignments / timephased.
    await tx.delete(tasks).where(eq(tasks.projectId, projectId));

    const taskUidToId = new Map<number, string>();
    const wbsPathByUid = new Map<number, string>();
    const siblingIndexByParent = new Map<string, number>();

    // Insert in file order (outline order) so parents exist before children.
    for (const [index, t] of parsed.tasks.entries()) {
      const id = randomUUID();
      taskUidToId.set(t.uid, id);

      let wbsPath: string;
      if (t.wbsCode && /^\d+(\.\d+)*$/.test(t.wbsCode)) {
        wbsPath = t.wbsCode;
      } else {
        const parentKey = t.parentUid === null ? 'root' : String(t.parentUid);
        const next = (siblingIndexByParent.get(parentKey) ?? 0) + 1;
        siblingIndexByParent.set(parentKey, next);
        const parentPath = t.parentUid === null ? null : (wbsPathByUid.get(t.parentUid) ?? null);
        wbsPath = parentPath ? `${parentPath}.${next}` : String(next);
      }
      wbsPathByUid.set(t.uid, wbsPath);

      const parentId = t.parentUid === null ? null : (taskUidToId.get(t.parentUid) ?? null);
      const sortOrder = index;

      await tx.insert(tasks).values({
        id,
        projectId,
        parentId,
        name: t.name,
        isSummary: t.isSummary,
        isMilestone: !t.isSummary && t.durationMinutes === 0,
        schedulingMode: 'cpm',
        durationMinutes: t.isSummary ? null : t.durationMinutes,
        taskType: t.taskType,
        constraintType: t.isSummary ? null : t.constraintType,
        constraintDate: t.constraintDate,
        deadline: t.deadline,
        calendarId: null,
        sortOrder,
        wbsPath,
        wbsCode: wbsCodeFromPath(wbsPath),
        percentComplete: t.percentComplete === null ? null : String(t.percentComplete),
        actualStart: t.actualStart,
        actualFinish: t.actualFinish,
        actualDurationMinutes: t.actualDurationMinutes,
        isCritical: false,
      });
    }

    if (parsed.dependencies.length > 0) {
      await tx.insert(taskDependencies).values(
        parsed.dependencies.map((d) => ({
          predecessorId: taskUidToId.get(d.predecessorUid)!,
          successorId: taskUidToId.get(d.successorUid)!,
          linkType: d.linkType,
          lagMinutes: d.lagMinutes,
          lagPercent: null,
        })),
      );
    }

    const assignmentValues = parsed.assignments
      .map((a) => {
        const taskId = taskUidToId.get(a.taskUid);
        const resourceId = resourceUidToId.get(a.resourceUid);
        if (!taskId || !resourceId) return null;
        return {
          taskId,
          resourceId,
          units: numericToDb(a.units) ?? null,
          workMinutes: a.workMinutes,
          cost: a.cost === null ? null : String(a.cost),
          actualWorkMinutes: a.actualWorkMinutes,
          actualCost: a.actualCost === null ? null : String(a.actualCost),
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    if (assignmentValues.length > 0) {
      await tx.insert(assignments).values(assignmentValues);
    }

    await rescheduleProject(tx, projectId);

    await writeAuditLog(tx, {
      userId: actorUserId,
      projectId,
      action: 'project.import_xml',
      entityType: 'project',
      entityId: projectId,
      after: {
        taskCount: parsed.tasks.length,
        dependencyCount: parsed.dependencies.length,
        resourceCount: parsed.resources.length,
        calendarCount: parsed.calendars.length,
      },
    });

    return {
      taskCount: parsed.tasks.length,
      resourceCount: parsed.resources.length,
      calendarCount: parsed.calendars.length,
    };
  }, db);
}

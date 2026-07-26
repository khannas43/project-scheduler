import { resolveLagMinutes } from '@pkg/scheduler';
import { asc, eq, inArray } from 'drizzle-orm';

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
import { NotFoundError } from '../middleware/errors.js';
import { numericFromDb } from './resourceService.js';

/** Plain data shapes for the pure builder — no Drizzle types required at the call site. */
export interface MspdiProject {
  readonly name: string;
  readonly startDate: Date | null;
  readonly finishDate: Date | null;
  readonly calendarId: string;
}

export interface MspdiTask {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly wbsPath: string | null;
  readonly wbsCode: string | null;
  readonly isSummary: boolean;
  readonly durationMinutes: number | null;
  readonly taskType: string | null;
  readonly constraintType: string | null;
  readonly constraintDate: Date | null;
  readonly deadline: Date | null;
  readonly earlyStart: Date | null;
  readonly earlyFinish: Date | null;
  readonly totalFloatMinutes: number | null;
  readonly freeFloatMinutes: number | null;
  readonly isCritical: boolean;
  readonly percentComplete: string | null;
  readonly actualStart: Date | null;
  readonly actualFinish: Date | null;
  readonly actualDurationMinutes: number | null;
  readonly calendarId: string | null;
}

export interface MspdiDependency {
  readonly predecessorId: string;
  readonly successorId: string;
  readonly linkType: string;
  readonly lagMinutes: number;
  readonly lagPercent: string | null;
}

export interface MspdiResource {
  readonly id: string;
  readonly name: string;
  readonly resourceType: string;
  readonly maxUnits: string | null;
  readonly standardRate: string | null;
  readonly overtimeRate: string | null;
  readonly costPerUse: string | null;
  readonly accrualType: string | null;
  readonly calendarId: string | null;
}

export interface MspdiAssignment {
  readonly id: string;
  readonly taskId: string;
  readonly resourceId: string;
  readonly units: string | null;
  readonly workMinutes: number | null;
  readonly cost: string | null;
  readonly actualWorkMinutes: number | null;
  readonly actualCost: string | null;
}

export interface MspdiCalendarException {
  readonly exceptionDate: string; // YYYY-MM-DD
  readonly isWorking: boolean;
  readonly startTime: string | null;
  readonly finishTime: string | null;
  readonly name: string | null;
}

export interface MspdiCalendar {
  readonly id: string;
  readonly name: string;
  /** 0=Sunday .. 6=Saturday (matches DB / @pkg/scheduler). */
  readonly workingDays: readonly number[];
  readonly defaultStart: string; // HH:MM[:SS]
  readonly defaultFinish: string;
  readonly exceptions: readonly MspdiCalendarException[];
}

// --- MSPDI numeric code maps (Microsoft Learn Type element docs) ---

/** Task Type: 0=Fixed Units, 1=Fixed Duration, 2=Fixed Work. */
export function mapTaskType(taskType: string | null): number {
  switch (taskType) {
    case 'fixed_units':
      return 0;
    case 'fixed_work':
      return 2;
    case 'fixed_duration':
    default:
      return 1;
  }
}

/**
 * ConstraintType → MSPDI codes.
 * asap→0, alap→1, mso→2, mfo→3, snet→4, snlt→5, fnet→6, fnlt→7; null→0.
 */
export function mapConstraintType(constraintType: string | null): number {
  switch (constraintType) {
    case 'alap':
      return 1;
    case 'mso':
      return 2;
    case 'mfo':
      return 3;
    case 'snet':
      return 4;
    case 'snlt':
      return 5;
    case 'fnet':
      return 6;
    case 'fnlt':
      return 7;
    case 'asap':
    case null:
    default:
      return 0;
  }
}

/**
 * PredecessorLink Type — Microsoft Learn MSPDI codes:
 * FF=0, FS=1, SF=2, SS=3 (note: differs from some transposed cheat-sheets).
 */
export function mapLinkType(linkType: string): number {
  switch (linkType) {
    case 'SS':
      return 3;
    case 'FF':
      return 0;
    case 'SF':
      return 2;
    case 'FS':
    default:
      return 1;
  }
}

/**
 * Resource Type — Microsoft Learn MSPDI Resource/Type:
 * 0=Material, 1=Work, 2=Cost (VBA PjResourceTypes inverts Work/Material — do not use those).
 */
export function mapResourceType(resourceType: string): number {
  switch (resourceType) {
    case 'material':
      return 0;
    case 'cost':
      return 2;
    case 'work':
    default:
      return 1;
  }
}

/** AccrueAt: start→1, end→2, prorated→3. */
export function mapAccrueAt(accrualType: string | null): number {
  switch (accrualType) {
    case 'start':
      return 1;
    case 'end':
      return 2;
    case 'prorated':
    default:
      return 3;
  }
}

/** ISO 8601 naive local datetime — strip timezone suffix. */
export function formatMspdiDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  const iso = d.toISOString(); // 2026-01-15T09:00:00.000Z
  return iso.slice(0, 19);
}

/** MSPDI duration: PT{h}H{m}M0S from whole minutes. */
export function formatMspdiDuration(minutes: number | null | undefined): string {
  const total = Math.max(0, Math.round(minutes ?? 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `PT${h}H${m}M0S`;
}

/** OutlineLevel from wbsPath depth ('1.2.3' → 3; empty/null → 1). */
export function outlineLevelFromWbsPath(wbsPath: string | null): number {
  if (!wbsPath || wbsPath.length === 0) return 1;
  return wbsPath.split('.').filter(Boolean).length;
}

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function tag(name: string, value: string | number | boolean): string {
  return `<${name}>${escapeXml(String(value))}</${name}>`;
}

function optionalTag(name: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return tag(name, value);
}

function normalizeTime(t: string): string {
  // DB time may be '09:00:00' or '09:00' — MSPDI prefers HH:MM:SS.
  if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
  if (t.length >= 8) return t.slice(0, 8);
  return t;
}

function jsWeekdayToMspdiDayType(jsDay: number): number {
  // JS/DB: 0=Sun .. 6=Sat → MSPDI DayType: 1=Sun .. 7=Sat
  return jsDay + 1;
}

/**
 * Pure MSPDI XML builder — no DB access. Callers load rows and pass them in.
 */
export function buildMspdiXml(
  project: MspdiProject,
  taskRows: readonly MspdiTask[],
  deps: readonly MspdiDependency[],
  resourceRows: readonly MspdiResource[],
  assignmentRows: readonly MspdiAssignment[],
  calendarRows: readonly MspdiCalendar[],
): string {
  const taskUidById = new Map<string, number>();
  taskRows.forEach((t, i) => taskUidById.set(t.id, i));

  const resourceUidById = new Map<string, number>();
  resourceRows.forEach((r, i) => resourceUidById.set(r.id, i));

  const calendarUidById = new Map<string, number>();
  calendarRows.forEach((c, i) => calendarUidById.set(c.id, i));

  const projectCalendarUid = calendarUidById.get(project.calendarId) ?? 0;

  const workByTask = new Map<string, number>();
  for (const a of assignmentRows) {
    workByTask.set(a.taskId, (workByTask.get(a.taskId) ?? 0) + (a.workMinutes ?? 0));
  }

  const depsBySuccessor = new Map<string, MspdiDependency[]>();
  for (const d of deps) {
    const list = depsBySuccessor.get(d.successorId) ?? [];
    list.push(d);
    depsBySuccessor.set(d.successorId, list);
  }

  const durationByTaskId = new Map(taskRows.map((t) => [t.id, t.durationMinutes ?? 0]));

  const taskXml = taskRows
    .map((t, index) => {
      const uid = index;
      const id = index + 1;
      const pct =
        t.percentComplete === null || t.percentComplete === undefined
          ? 0
          : Math.round(Number(t.percentComplete));
      const constraintCode = mapConstraintType(t.constraintType);
      const emitConstraintDate =
        t.constraintType !== null && t.constraintType !== undefined && t.constraintType !== 'asap';

      const predLinks = (depsBySuccessor.get(t.id) ?? [])
        .map((d) => {
          const predUid = taskUidById.get(d.predecessorId);
          if (predUid === undefined) return '';
          const predDuration = durationByTaskId.get(d.predecessorId) ?? 0;
          const lagPercent =
            d.lagPercent === null || d.lagPercent === undefined ? null : Number(d.lagPercent);
          const lagMinutes = resolveLagMinutes(d.lagMinutes, lagPercent, predDuration);
          const linkLag = lagMinutes * 10;
          return [
            '<PredecessorLink>',
            tag('PredecessorUID', predUid),
            tag('Type', mapLinkType(d.linkType)),
            tag('LinkLag', linkLag),
            '</PredecessorLink>',
          ].join('');
        })
        .join('');

      const parts = [
        '<Task>',
        tag('UID', uid),
        tag('ID', id),
        tag('Name', t.name),
        tag('Type', mapTaskType(t.taskType)),
        tag('Summary', t.isSummary ? 1 : 0),
        tag('OutlineLevel', outlineLevelFromWbsPath(t.wbsPath)),
        tag('WBS', t.wbsCode ?? String(id)),
        optionalTag('Start', formatMspdiDate(t.earlyStart)),
        optionalTag('Finish', formatMspdiDate(t.earlyFinish)),
        tag('Duration', formatMspdiDuration(t.durationMinutes)),
        tag('Work', formatMspdiDuration(workByTask.get(t.id) ?? 0)),
        tag('PercentComplete', pct),
        tag('Critical', t.isCritical ? 1 : 0),
        tag('TotalSlack', formatMspdiDuration(t.totalFloatMinutes)),
        tag('FreeSlack', formatMspdiDuration(t.freeFloatMinutes)),
        tag('ConstraintType', constraintCode),
        emitConstraintDate ? optionalTag('ConstraintDate', formatMspdiDate(t.constraintDate)) : '',
        optionalTag('Deadline', formatMspdiDate(t.deadline)),
        optionalTag('ActualStart', formatMspdiDate(t.actualStart)),
        optionalTag('ActualFinish', formatMspdiDate(t.actualFinish)),
        t.actualDurationMinutes !== null && t.actualDurationMinutes !== undefined
          ? tag('ActualDuration', formatMspdiDuration(t.actualDurationMinutes))
          : '',
        predLinks,
        '</Task>',
      ];
      return parts.filter(Boolean).join('');
    })
    .join('');

  const resourceXml = resourceRows
    .map((r, index) => {
      const calUid =
        r.calendarId && calendarUidById.has(r.calendarId)
          ? calendarUidById.get(r.calendarId)!
          : projectCalendarUid;
      return [
        '<Resource>',
        tag('UID', index),
        tag('Name', r.name),
        tag('Type', mapResourceType(r.resourceType)),
        tag('MaxUnits', numericFromDb(r.maxUnits) ?? 1),
        optionalTag('StandardRate', numericFromDb(r.standardRate)),
        optionalTag('OvertimeRate', numericFromDb(r.overtimeRate)),
        optionalTag('CostPerUse', numericFromDb(r.costPerUse)),
        tag('AccrueAt', mapAccrueAt(r.accrualType)),
        tag('CalendarUID', calUid),
        '</Resource>',
      ]
        .filter(Boolean)
        .join('');
    })
    .join('');

  const assignmentXml = assignmentRows
    .map((a, index) => {
      const taskUid = taskUidById.get(a.taskId);
      const resourceUid = resourceUidById.get(a.resourceId);
      if (taskUid === undefined || resourceUid === undefined) return '';
      return [
        '<Assignment>',
        tag('UID', index),
        tag('TaskUID', taskUid),
        tag('ResourceUID', resourceUid),
        tag('Units', numericFromDb(a.units) ?? 1),
        tag('Work', formatMspdiDuration(a.workMinutes)),
        tag('Cost', numericFromDb(a.cost) ?? 0),
        a.actualWorkMinutes !== null && a.actualWorkMinutes !== undefined
          ? tag('ActualWork', formatMspdiDuration(a.actualWorkMinutes))
          : '',
        a.actualCost !== null && a.actualCost !== undefined
          ? tag('ActualCost', numericFromDb(a.actualCost) ?? 0)
          : '',
        '</Assignment>',
      ]
        .filter(Boolean)
        .join('');
    })
    .join('');

  const calendarXml = calendarRows
    .map((c, index) => {
      const workingSet = new Set(c.workingDays);
      const weekDays = Array.from({ length: 7 }, (_, jsDay) => {
        const dayType = jsWeekdayToMspdiDayType(jsDay);
        const isWorking = workingSet.has(jsDay) ? 1 : 0;
        if (!isWorking) {
          return `<WeekDay>${tag('DayType', dayType)}${tag('DayWorking', 0)}</WeekDay>`;
        }
        return [
          '<WeekDay>',
          tag('DayType', dayType),
          tag('DayWorking', 1),
          '<WorkingTimes><WorkingTime>',
          tag('FromTime', normalizeTime(c.defaultStart)),
          tag('ToTime', normalizeTime(c.defaultFinish)),
          '</WorkingTime></WorkingTimes>',
          '</WeekDay>',
        ].join('');
      }).join('');

      const exceptions =
        c.exceptions.length === 0
          ? ''
          : `<Exceptions>${c.exceptions
              .map((ex) => {
                const from = `${ex.exceptionDate}T00:00:00`;
                const to = `${ex.exceptionDate}T23:59:59`;
                return [
                  '<Exception>',
                  ex.name ? tag('Name', ex.name) : '',
                  '<TimePeriod>',
                  tag('FromDate', from),
                  tag('ToDate', to),
                  '</TimePeriod>',
                  tag('DayWorking', ex.isWorking ? 1 : 0),
                  '</Exception>',
                ]
                  .filter(Boolean)
                  .join('');
              })
              .join('')}</Exceptions>`;

      return [
        '<Calendar>',
        tag('UID', index),
        tag('Name', c.name),
        `<WeekDays>${weekDays}</WeekDays>`,
        exceptions,
        '</Calendar>',
      ]
        .filter(Boolean)
        .join('');
    })
    .join('');

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Project>',
    tag('Name', project.name),
    optionalTag('StartDate', formatMspdiDate(project.startDate)),
    optionalTag('FinishDate', formatMspdiDate(project.finishDate)),
    tag('CalendarUID', projectCalendarUid),
    `<Tasks>${taskXml}</Tasks>`,
    `<Resources>${resourceXml}</Resources>`,
    `<Assignments>${assignmentXml}</Assignments>`,
    `<Calendars>${calendarXml}</Calendars>`,
    '</Project>',
  ]
    .filter(Boolean)
    .join('');
}

function slugFilename(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'project'}.xml`;
}

/** Load project graph and return MSPDI XML + download filename. */
export async function exportProjectMspdi(projectId: string): Promise<{
  xml: string;
  filename: string;
}> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new NotFoundError('Project not found');

  const taskRows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .orderBy(asc(tasks.wbsPath), asc(tasks.sortOrder));

  const taskIds = taskRows.map((t) => t.id);
  const depRows =
    taskIds.length === 0
      ? []
      : await db
          .select()
          .from(taskDependencies)
          .where(inArray(taskDependencies.successorId, taskIds));

  const assignmentRows =
    taskIds.length === 0
      ? []
      : await db.select().from(assignments).where(inArray(assignments.taskId, taskIds));

  const resourceIds = [...new Set(assignmentRows.map((a) => a.resourceId))];
  const resourceRows =
    resourceIds.length === 0
      ? []
      : await db.select().from(resources).where(inArray(resources.id, resourceIds));

  const calendarIdSet = new Set<string>([project.calendarId]);
  for (const t of taskRows) {
    if (t.calendarId) calendarIdSet.add(t.calendarId);
  }
  for (const r of resourceRows) {
    if (r.calendarId) calendarIdSet.add(r.calendarId);
  }
  const calendarIds = [...calendarIdSet];

  const calendarsExact =
    calendarIds.length === 0
      ? []
      : await db.select().from(calendars).where(inArray(calendars.id, calendarIds));

  const exceptionRows =
    calendarsExact.length === 0
      ? []
      : await db
          .select()
          .from(calendarExceptions)
          .where(
            inArray(
              calendarExceptions.calendarId,
              calendarsExact.map((c) => c.id),
            ),
          );

  const exceptionsByCal = new Map<string, MspdiCalendarException[]>();
  for (const ex of exceptionRows) {
    const list = exceptionsByCal.get(ex.calendarId) ?? [];
    list.push({
      exceptionDate: String(ex.exceptionDate),
      isWorking: ex.isWorking,
      startTime: ex.startTime,
      finishTime: ex.finishTime,
      name: ex.name,
    });
    exceptionsByCal.set(ex.calendarId, list);
  }

  // Preserve calendarIds order so project's default calendar UID is stable/findable.
  const orderedCalendars: MspdiCalendar[] = calendarIds
    .map((id) => calendarsExact.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => ({
      id: c.id,
      name: c.name,
      workingDays: c.workingDays,
      defaultStart: c.defaultStart,
      defaultFinish: c.defaultFinish,
      exceptions: exceptionsByCal.get(c.id) ?? [],
    }));

  const xml = buildMspdiXml(
    {
      name: project.name,
      startDate: project.startDate,
      finishDate: project.finishDate,
      calendarId: project.calendarId,
    },
    taskRows,
    depRows,
    resourceRows,
    assignmentRows,
    orderedCalendars,
  );

  return { xml, filename: slugFilename(project.name) };
}

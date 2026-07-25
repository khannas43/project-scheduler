import { and, desc, eq } from 'drizzle-orm';

import { db } from '../db/client.js';
import { assignments, baselineTasks, baselines, projects, tasks } from '../db/schema/index.js';
import { NotFoundError } from '../middleware/errors.js';
import { numericFromDb } from './resourceService.js';

export function clamp01(n: number): number {
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

/**
 * Linear PV accrual between baseline start/finish; milestones (start === finish)
 * are a step function: 0 before start, 1 at/after.
 */
export function plannedValueFraction(
  asOf: Date,
  start: Date | null,
  finish: Date | null,
): number {
  if (start === null || finish === null) return 0;
  const s = start.getTime();
  const f = finish.getTime();
  const t = asOf.getTime();
  if (s === f) {
    return t >= s ? 1 : 0;
  }
  return clamp01((t - s) / (f - s));
}

export interface EvmTaskRow {
  readonly taskId: string;
  readonly isSummary: boolean;
  readonly percentComplete: number | null;
  readonly baselineCost: number | null;
  readonly baselineStart: Date | null;
  readonly baselineFinish: Date | null;
}

export interface EarnedValueTotals {
  readonly bac: number;
  readonly pv: number;
  readonly ev: number;
  readonly ac: number;
  readonly spi: number | null;
  readonly cpi: number | null;
}

/** Leaf-only EVM aggregation — summaries are skipped even if present in `rows`. */
export function computeEarnedValueTotals(
  rows: readonly EvmTaskRow[],
  asOfDate: Date,
  leafAssignmentActualCosts: readonly (number | null)[],
): EarnedValueTotals {
  let bac = 0;
  let pv = 0;
  let ev = 0;

  for (const row of rows) {
    if (row.isSummary) continue;
    const cost = row.baselineCost ?? 0;
    bac += cost;
    const pct = (row.percentComplete ?? 0) / 100;
    ev += pct * cost;
    pv += cost * plannedValueFraction(asOfDate, row.baselineStart, row.baselineFinish);
  }

  const ac = leafAssignmentActualCosts.reduce<number>((sum, c) => sum + (c ?? 0), 0);
  const spi = pv > 0 ? ev / pv : null;
  const cpi = ac > 0 ? ev / ac : null;

  return { bac, pv, ev, ac, spi, cpi };
}

export function toUtcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addUtcDays(d: Date, days: number): Date {
  const next = new Date(d.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function atUtcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Sample PV across [min leaf baseline.start, max leaf baseline.finish],
 * inclusive of both endpoints, at `granularityDays` spacing.
 */
export function samplePvCurve(
  rows: readonly EvmTaskRow[],
  granularityDays: number,
): Array<{ date: string; pv: number }> {
  const leaves = rows.filter((r) => !r.isSummary);
  let minStart: Date | null = null;
  let maxFinish: Date | null = null;
  for (const row of leaves) {
    if (row.baselineStart !== null) {
      if (minStart === null || row.baselineStart < minStart) minStart = row.baselineStart;
    }
    if (row.baselineFinish !== null) {
      if (maxFinish === null || row.baselineFinish > maxFinish) maxFinish = row.baselineFinish;
    }
  }
  if (minStart === null || maxFinish === null) return [];

  const start = atUtcMidnight(minStart);
  const end = atUtcMidnight(maxFinish);
  const points: Array<{ date: string; pv: number }> = [];
  let cursor = start;
  const step = Math.max(1, granularityDays);

  while (cursor.getTime() < end.getTime()) {
    const totals = computeEarnedValueTotals(leaves, cursor, []);
    points.push({ date: toUtcDateString(cursor), pv: totals.pv });
    cursor = addUtcDays(cursor, step);
  }
  const endTotals = computeEarnedValueTotals(leaves, end, []);
  points.push({ date: toUtcDateString(end), pv: endTotals.pv });
  return points;
}

export interface EarnedValueResult extends EarnedValueTotals {
  readonly baselineId: string;
  readonly asOfDate: string;
}

export interface SCurveResult {
  readonly points: Array<{ date: string; pv: number }>;
  readonly current: { date: string; ev: number; ac: number };
}

async function resolveBaseline(
  projectId: string,
  baselineId?: string,
): Promise<typeof baselines.$inferSelect> {
  if (baselineId) {
    const [row] = await db
      .select()
      .from(baselines)
      .where(eq(baselines.id, baselineId))
      .limit(1);
    if (!row || row.projectId !== projectId) {
      throw new NotFoundError('Baseline not found');
    }
    return row;
  }

  const [latest] = await db
    .select()
    .from(baselines)
    .where(eq(baselines.projectId, projectId))
    .orderBy(desc(baselines.capturedAt))
    .limit(1);

  if (!latest) {
    throw new NotFoundError('No baseline captured yet');
  }
  return latest;
}

async function loadEvmRows(baselineId: string): Promise<EvmTaskRow[]> {
  const joined = await db
    .select({
      taskId: tasks.id,
      isSummary: tasks.isSummary,
      percentComplete: tasks.percentComplete,
      baselineCost: baselineTasks.cost,
      baselineStart: baselineTasks.start,
      baselineFinish: baselineTasks.finish,
    })
    .from(baselineTasks)
    .innerJoin(tasks, eq(baselineTasks.taskId, tasks.id))
    .where(eq(baselineTasks.baselineId, baselineId));

  return joined.map((r) => ({
    taskId: r.taskId,
    isSummary: r.isSummary,
    percentComplete: r.percentComplete === null ? null : Number(r.percentComplete),
    baselineCost: numericFromDb(r.baselineCost),
    baselineStart: r.baselineStart,
    baselineFinish: r.baselineFinish,
  }));
}

/** AC over leaf-task assignments only — running total, independent of asOfDate. */
async function loadLeafActualCosts(projectId: string): Promise<Array<number | null>> {
  const rows = await db
    .select({ actualCost: assignments.actualCost })
    .from(assignments)
    .innerJoin(tasks, eq(assignments.taskId, tasks.id))
    .where(and(eq(tasks.projectId, projectId), eq(tasks.isSummary, false)));

  return rows.map((r) => numericFromDb(r.actualCost));
}

export async function computeEarnedValue(
  projectId: string,
  options?: { baselineId?: string; asOfDate?: Date },
): Promise<EarnedValueResult> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new NotFoundError('Project not found');

  const baseline = await resolveBaseline(projectId, options?.baselineId);
  const asOfDate = options?.asOfDate ?? project.statusDate ?? new Date();
  const rows = await loadEvmRows(baseline.id);
  const actualCosts = await loadLeafActualCosts(projectId);
  const totals = computeEarnedValueTotals(rows, asOfDate, actualCosts);

  return {
    baselineId: baseline.id,
    asOfDate: asOfDate.toISOString(),
    ...totals,
  };
}

export async function computeSCurve(
  projectId: string,
  options?: { baselineId?: string; granularityDays?: number },
): Promise<SCurveResult> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new NotFoundError('Project not found');

  const baseline = await resolveBaseline(projectId, options?.baselineId);
  const granularityDays = options?.granularityDays ?? 7;
  const rows = await loadEvmRows(baseline.id);
  const points = samplePvCurve(rows, granularityDays);

  const asOfDate = project.statusDate ?? new Date();
  const actualCosts = await loadLeafActualCosts(projectId);
  const totals = computeEarnedValueTotals(rows, asOfDate, actualCosts);

  return {
    points,
    current: {
      date: toUtcDateString(asOfDate),
      ev: totals.ev,
      ac: totals.ac,
    },
  };
}

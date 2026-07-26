import { desc, eq, inArray } from 'drizzle-orm';

import { db } from '../db/client.js';
import { assignments, baselines, projects, resources, tasks } from '../db/schema/index.js';
import { NotFoundError } from '../middleware/errors.js';
import { getOverallocations, type OverallocationDay } from './assignmentService.js';
import { getBaselineDetail } from './baselineService.js';
import { computeEarnedValue } from './earnedValueService.js';
import { loadTaskReportRows, type TaskReportRow } from './reportDataService.js';
import { numericFromDb } from './resourceService.js';

export interface ProjectSummaryReport {
  readonly projectId: string;
  readonly projectName: string;
  readonly status: string;
  readonly statusDate: Date | null;
  readonly startDate: Date | null;
  readonly finishDate: Date | null;
  readonly taskCounts: {
    readonly total: number;
    readonly summary: number;
    readonly leaf: number;
    readonly milestone: number;
    readonly critical: number;
    readonly completed: number;
  };
  readonly overallPercentComplete: number | null;
  readonly cost: {
    readonly baselineId: string;
    readonly bac: number;
    readonly pv: number;
    readonly ev: number;
    readonly ac: number;
    readonly spi: number | null;
    readonly cpi: number | null;
  } | null;
}

export interface CriticalTaskReportRow {
  readonly wbsCode: string | null;
  readonly name: string;
  readonly isSummary: boolean;
  readonly earlyStart: Date | null;
  readonly earlyFinish: Date | null;
  readonly durationMinutes: number | null;
  readonly totalFloatMinutes: number | null;
  readonly percentComplete: number | null;
}

export interface MilestoneReportRow {
  readonly wbsCode: string | null;
  readonly name: string;
  readonly earlyFinish: Date | null;
  readonly deadline: Date | null;
  readonly percentComplete: number | null;
  readonly isCritical: boolean;
}

export interface OverallocatedResourceReportRow {
  readonly resourceId: string;
  readonly resourceName: string;
  readonly overallocatedDayCount: number;
  readonly days: OverallocationDay[];
}

export interface CostOverviewReport {
  readonly rows: Array<{
    readonly wbsCode: string | null;
    readonly name: string;
    readonly cost: number | null;
  }>;
  readonly totalCost: number;
  readonly unassignedTaskCount: number;
}

export type SlipReason = 'deadline_missed' | 'behind_baseline';

export interface SlippingTaskReportRow {
  readonly taskId: string;
  readonly wbsCode: string | null;
  readonly name: string;
  readonly reasons: SlipReason[];
  readonly varianceMinutes: number;
}

export interface SummaryTaskCountInput {
  readonly id: string;
  readonly parentId: string | null;
  readonly isSummary: boolean;
  readonly isMilestone: boolean;
  readonly isCritical: boolean;
  readonly percentComplete: string | null;
  readonly durationMinutes: number | null;
}

/** Duration-weighted % over root tasks — same formula as summaryRollup one level down. */
export function computeOverallPercentComplete(
  roots: readonly Pick<SummaryTaskCountInput, 'percentComplete' | 'durationMinutes'>[],
): number | null {
  if (roots.length === 0) return null;

  let weighted = 0;
  let totalDuration = 0;
  for (const root of roots) {
    const duration = root.durationMinutes ?? 0;
    const pct = numericFromDb(root.percentComplete) ?? 0;
    weighted += pct * duration;
    totalDuration += duration;
  }
  if (totalDuration === 0) return null;
  return weighted / totalDuration;
}

export function countTasksForSummary(taskRows: readonly SummaryTaskCountInput[]): {
  total: number;
  summary: number;
  leaf: number;
  milestone: number;
  critical: number;
  completed: number;
} {
  let summary = 0;
  let leaf = 0;
  let milestone = 0;
  let critical = 0;
  let completed = 0;

  for (const t of taskRows) {
    if (t.isSummary) summary += 1;
    else leaf += 1;
    if (t.isMilestone) milestone += 1;
    if (t.isCritical) critical += 1;
    if (!t.isSummary && numericFromDb(t.percentComplete) === 100) completed += 1;
  }

  return {
    total: taskRows.length,
    summary,
    leaf,
    milestone,
    critical,
    completed,
  };
}

export function buildCostOverviewFromRows(rows: readonly TaskReportRow[]): CostOverviewReport {
  const leaves = rows.filter((r) => !r.isSummary);
  const sorted = [...leaves].sort((a, b) => {
    if (a.cost === null && b.cost === null) return 0;
    if (a.cost === null) return 1;
    if (b.cost === null) return -1;
    return b.cost - a.cost;
  });

  let totalCost = 0;
  let unassignedTaskCount = 0;
  for (const row of sorted) {
    if (row.cost === null) unassignedTaskCount += 1;
    else totalCost += row.cost;
  }

  return {
    rows: sorted.map((r) => ({ wbsCode: r.wbsCode, name: r.name, cost: r.cost })),
    totalCost,
    unassignedTaskCount,
  };
}

export function compareDateAscNullsLast(a: Date | null, b: Date | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.getTime() - b.getTime();
}

function minutesBetween(later: Date, earlier: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / 60_000);
}

export function mergeSlippingTasks(
  deadlineMisses: readonly SlippingTaskReportRow[],
  baselineSlips: readonly SlippingTaskReportRow[],
): SlippingTaskReportRow[] {
  const byId = new Map<string, SlippingTaskReportRow>();

  for (const row of [...deadlineMisses, ...baselineSlips]) {
    const existing = byId.get(row.taskId);
    if (!existing) {
      byId.set(row.taskId, {
        ...row,
        reasons: [...row.reasons],
      });
      continue;
    }
    const reasons = [...new Set([...existing.reasons, ...row.reasons])];
    byId.set(row.taskId, {
      taskId: existing.taskId,
      wbsCode: existing.wbsCode,
      name: existing.name,
      reasons,
      varianceMinutes: Math.max(existing.varianceMinutes, row.varianceMinutes),
    });
  }

  return [...byId.values()].sort((a, b) => b.varianceMinutes - a.varianceMinutes);
}

export function deadlineMissesFromRows(rows: readonly TaskReportRow[]):
  SlippingTaskReportRow[] {
  const out: SlippingTaskReportRow[] = [];
  for (const row of rows) {
    if (row.deadline === null || row.earlyFinish === null) continue;
    if (row.earlyFinish <= row.deadline) continue;
    out.push({
      taskId: row.id,
      wbsCode: row.wbsCode,
      name: row.name,
      reasons: ['deadline_missed'],
      varianceMinutes: minutesBetween(row.earlyFinish, row.deadline),
    });
  }
  return out;
}

export async function getProjectSummary(projectId: string): Promise<ProjectSummaryReport> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new NotFoundError('Project not found');

  const taskRows = await db
    .select({
      id: tasks.id,
      parentId: tasks.parentId,
      isSummary: tasks.isSummary,
      isMilestone: tasks.isMilestone,
      isCritical: tasks.isCritical,
      percentComplete: tasks.percentComplete,
      durationMinutes: tasks.durationMinutes,
    })
    .from(tasks)
    .where(eq(tasks.projectId, projectId));

  const roots = taskRows.filter((t) => t.parentId === null);
  const taskCounts = countTasksForSummary(taskRows);
  const overallPercentComplete = computeOverallPercentComplete(roots);

  const [latestBaseline] = await db
    .select({ id: baselines.id })
    .from(baselines)
    .where(eq(baselines.projectId, projectId))
    .orderBy(desc(baselines.capturedAt))
    .limit(1);

  let cost: ProjectSummaryReport['cost'] = null;
  if (latestBaseline) {
    const ev = await computeEarnedValue(projectId, { baselineId: latestBaseline.id });
    cost = {
      baselineId: ev.baselineId,
      bac: ev.bac,
      pv: ev.pv,
      ev: ev.ev,
      ac: ev.ac,
      spi: ev.spi,
      cpi: ev.cpi,
    };
  }

  return {
    projectId: project.id,
    projectName: project.name,
    status: project.status,
    statusDate: project.statusDate,
    startDate: project.startDate,
    finishDate: project.finishDate,
    taskCounts,
    overallPercentComplete,
    cost,
  };
}

export async function getCriticalTasksReport(projectId: string): Promise<CriticalTaskReportRow[]> {
  const rows = await loadTaskReportRows(projectId);
  return rows
    .filter((r) => r.isCritical)
    .sort((a, b) => compareDateAscNullsLast(a.earlyStart, b.earlyStart))
    .map((r) => ({
      wbsCode: r.wbsCode,
      name: r.name,
      isSummary: r.isSummary,
      earlyStart: r.earlyStart,
      earlyFinish: r.earlyFinish,
      durationMinutes: r.durationMinutes,
      totalFloatMinutes: r.totalFloatMinutes,
      percentComplete: r.percentComplete,
    }));
}

export async function getMilestoneReport(projectId: string): Promise<MilestoneReportRow[]> {
  const rows = await loadTaskReportRows(projectId);
  return rows
    .filter((r) => r.isMilestone)
    .sort((a, b) => compareDateAscNullsLast(a.earlyFinish, b.earlyFinish))
    .map((r) => ({
      wbsCode: r.wbsCode,
      name: r.name,
      earlyFinish: r.earlyFinish,
      deadline: r.deadline,
      percentComplete: r.percentComplete,
      isCritical: r.isCritical,
    }));
}

export async function getOverallocatedResourcesReport(
  projectId: string,
): Promise<OverallocatedResourceReportRow[]> {
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new NotFoundError('Project not found');

  const assigned = await db
    .selectDistinct({ resourceId: assignments.resourceId })
    .from(assignments)
    .innerJoin(tasks, eq(assignments.taskId, tasks.id))
    .where(eq(tasks.projectId, projectId));

  const resourceIds = assigned.map((r) => r.resourceId);
  if (resourceIds.length === 0) return [];

  const allResources = await db.select().from(resources).where(inArray(resources.id, resourceIds));
  const nameById = new Map(allResources.map((r) => [r.id, r.name]));

  const out: OverallocatedResourceReportRow[] = [];
  for (const resourceId of resourceIds) {
    const days = await getOverallocations(resourceId);
    if (days.length === 0) continue;
    out.push({
      resourceId,
      resourceName: nameById.get(resourceId) ?? resourceId,
      overallocatedDayCount: days.length,
      days,
    });
  }

  return out.sort((a, b) => b.overallocatedDayCount - a.overallocatedDayCount);
}

export async function getCostOverviewReport(projectId: string): Promise<CostOverviewReport> {
  const rows = await loadTaskReportRows(projectId);
  return buildCostOverviewFromRows(rows);
}

/** Same ownership check as earnedValueService's private resolveBaseline. */
async function assertBaselineBelongsToProject(
  projectId: string,
  baselineId: string,
): Promise<void> {
  const [row] = await db.select().from(baselines).where(eq(baselines.id, baselineId)).limit(1);
  if (!row || row.projectId !== projectId) {
    throw new NotFoundError('Baseline not found');
  }
}

export async function getSlippingTasksReport(
  projectId: string,
  baselineId?: string,
): Promise<SlippingTaskReportRow[]> {
  const rows = await loadTaskReportRows(projectId);
  const deadlineMisses = deadlineMissesFromRows(rows);

  let baselineSlips: SlippingTaskReportRow[] = [];
  if (baselineId !== undefined) {
    await assertBaselineBelongsToProject(projectId, baselineId);
    const detail = await getBaselineDetail(baselineId);
    const byId = new Map(rows.map((r) => [r.id, r]));
    baselineSlips = [];
    for (const t of detail.tasks) {
      if (t.finishVarianceMinutes === null || t.finishVarianceMinutes <= 0) continue;
      const reportRow = byId.get(t.taskId);
      baselineSlips.push({
        taskId: t.taskId,
        wbsCode: reportRow?.wbsCode ?? null,
        name: reportRow?.name ?? t.taskName,
        reasons: ['behind_baseline'],
        varianceMinutes: t.finishVarianceMinutes,
      });
    }
  }

  return mergeSlippingTasks(deadlineMisses, baselineSlips);
}

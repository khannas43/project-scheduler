import {
  getOverallocatedResourcesReport,
  getProjectSummary,
  getSlippingTasksReport,
  type MilestoneReportRow,
  type OverallocatedResourceReportRow,
  type ProjectSummaryReport,
  type SlippingTaskReportRow,
} from './builtinReportsService.js';
import { computeSCurve, type SCurveResult } from './earnedValueService.js';
import { listProjectsForUser } from './projectService.js';
import { loadTaskReportRows, type TaskReportRow } from './reportDataService.js';

export type ProjectHealth = 'on_track' | 'at_risk' | 'behind' | 'no_baseline' | 'unknown';

export interface ProjectDashboardSummary {
  readonly projectId: string;
  readonly projectName: string;
  readonly status: string;
  readonly health: ProjectHealth;
  readonly overallPercentComplete: number | null;
  readonly baselineId: string | null;
  readonly spi: number | null;
  readonly cpi: number | null;
  readonly criticalTaskCount: number;
  readonly overallocatedResourceCount: number;
}

export interface ProgressBreakdown {
  readonly notStarted: number;
  readonly inProgress: number;
  readonly completed: number;
  readonly milestone: number;
}

export interface InProgressActivityRow {
  readonly taskId: string;
  readonly wbsCode: string | null;
  readonly name: string;
  readonly percentComplete: number;
  readonly earlyStart: Date | null;
  readonly earlyFinish: Date | null;
  readonly isCritical: boolean;
  readonly resourceNames: string;
}

export interface NearCriticalRow {
  readonly taskId: string;
  readonly wbsCode: string | null;
  readonly name: string;
  readonly totalFloatMinutes: number | null;
  readonly percentComplete: number | null;
  readonly earlyFinish: Date | null;
  readonly isCritical: boolean;
}

export interface PhaseProgressRow {
  readonly taskId: string;
  readonly wbsCode: string | null;
  readonly name: string;
  readonly percentComplete: number;
  readonly isCritical: boolean;
}

export interface OverallocSummaryRow {
  readonly resourceId: string;
  readonly resourceName: string;
  readonly overallocatedDayCount: number;
}

export interface ProjectDashboard extends ProjectDashboardSummary {
  readonly startDate: Date | null;
  readonly finishDate: Date | null;
  readonly statusDate: Date | null;
  readonly taskCounts: ProjectSummaryReport['taskCounts'];
  readonly earnedValue: ProjectSummaryReport['cost'];
  readonly progressBreakdown: ProgressBreakdown;
  readonly phaseProgress: PhaseProgressRow[];
  readonly topInProgress: InProgressActivityRow[];
  readonly nearCritical: NearCriticalRow[];
  readonly upcomingMilestones: MilestoneReportRow[];
  readonly slippingTaskCount: number;
  readonly topSlippingTasks: SlippingTaskReportRow[];
  readonly topOverallocated: OverallocSummaryRow[];
  readonly sCurve: SCurveResult | null;
}

const NEAR_CRITICAL_FLOAT_MINUTES = 480; // 1 working day

/**
 * Derive a single health label from summary EV metrics.
 * Worse of available SPI/CPI governs — one bad metric is not masked by a good one.
 */
export function computeProjectHealth(cost: ProjectSummaryReport['cost']): ProjectHealth {
  if (cost === null) return 'no_baseline';
  const { spi, cpi } = cost;
  if (spi === null && cpi === null) return 'unknown';
  const worse = Math.min(spi ?? Infinity, cpi ?? Infinity);
  if (worse < 0.9) return 'behind';
  if (worse < 1.0) return 'at_risk';
  return 'on_track';
}

export function computeProgressBreakdown(rows: readonly TaskReportRow[]): ProgressBreakdown {
  let notStarted = 0;
  let inProgress = 0;
  let completed = 0;
  let milestone = 0;

  for (const row of rows) {
    if (row.isMilestone) {
      milestone += 1;
      continue;
    }
    if (row.isSummary) continue;
    const pct = row.percentComplete ?? 0;
    if (pct >= 100) completed += 1;
    else if (pct > 0) inProgress += 1;
    else notStarted += 1;
  }

  return { notStarted, inProgress, completed, milestone };
}

/** Top leaf activities currently in progress (0 < % < 100). */
export function selectTopInProgress(
  rows: readonly TaskReportRow[],
  limit = 5,
): InProgressActivityRow[] {
  return rows
    .filter((r) => !r.isSummary && !r.isMilestone)
    .filter((r) => {
      const pct = r.percentComplete ?? 0;
      return pct > 0 && pct < 100;
    })
    .sort((a, b) => {
      const pctDiff = (b.percentComplete ?? 0) - (a.percentComplete ?? 0);
      if (pctDiff !== 0) return pctDiff;
      const aFinish = a.earlyFinish?.getTime() ?? Number.POSITIVE_INFINITY;
      const bFinish = b.earlyFinish?.getTime() ?? Number.POSITIVE_INFINITY;
      return aFinish - bFinish;
    })
    .slice(0, limit)
    .map((r) => ({
      taskId: r.id,
      wbsCode: r.wbsCode,
      name: r.name,
      percentComplete: r.percentComplete ?? 0,
      earlyStart: r.earlyStart,
      earlyFinish: r.earlyFinish,
      isCritical: r.isCritical,
      resourceNames: r.resourceNames,
    }));
}

/** Critical or near-critical leaf tasks (float ≤ 1 working day). */
export function selectNearCritical(
  rows: readonly TaskReportRow[],
  limit = 5,
): NearCriticalRow[] {
  return rows
    .filter((r) => !r.isSummary)
    .filter((r) => {
      if (r.isCritical) return true;
      if (r.totalFloatMinutes === null) return false;
      return r.totalFloatMinutes <= NEAR_CRITICAL_FLOAT_MINUTES;
    })
    .sort((a, b) => {
      const af = a.totalFloatMinutes ?? (a.isCritical ? 0 : Number.POSITIVE_INFINITY);
      const bf = b.totalFloatMinutes ?? (b.isCritical ? 0 : Number.POSITIVE_INFINITY);
      return af - bf;
    })
    .slice(0, limit)
    .map((r) => ({
      taskId: r.id,
      wbsCode: r.wbsCode,
      name: r.name,
      totalFloatMinutes: r.totalFloatMinutes,
      percentComplete: r.percentComplete,
      earlyFinish: r.earlyFinish,
      isCritical: r.isCritical,
    }));
}

/** Root-level WBS phases for a progress bar chart. */
export function selectPhaseProgress(rows: readonly TaskReportRow[]): PhaseProgressRow[] {
  return rows
    .filter((r) => {
      if (!r.wbsCode) return false;
      // Root codes: "1", "2" — not "1.1"
      return !r.wbsCode.includes('.');
    })
    .sort((a, b) => (a.wbsCode ?? '').localeCompare(b.wbsCode ?? '', undefined, { numeric: true }))
    .map((r) => ({
      taskId: r.id,
      wbsCode: r.wbsCode,
      name: r.name,
      percentComplete: r.percentComplete ?? 0,
      isCritical: r.isCritical,
    }));
}

export function summarizeOverallocations(
  rows: readonly OverallocatedResourceReportRow[],
  limit = 5,
): OverallocSummaryRow[] {
  return rows.slice(0, limit).map((r) => ({
    resourceId: r.resourceId,
    resourceName: r.resourceName,
    overallocatedDayCount: r.overallocatedDayCount,
  }));
}

export async function getProjectDashboardSummary(
  projectId: string,
): Promise<ProjectDashboardSummary> {
  const summary = await getProjectSummary(projectId);
  const overallocated = await getOverallocatedResourcesReport(projectId);
  const health = computeProjectHealth(summary.cost);

  return {
    projectId,
    projectName: summary.projectName,
    status: summary.status,
    health,
    overallPercentComplete: summary.overallPercentComplete,
    baselineId: summary.cost?.baselineId ?? null,
    spi: summary.cost?.spi ?? null,
    cpi: summary.cost?.cpi ?? null,
    criticalTaskCount: summary.taskCounts.critical,
    overallocatedResourceCount: overallocated.length,
  };
}

export async function getProjectDashboard(projectId: string): Promise<ProjectDashboard> {
  const [projectSummary, overallocated, taskRows] = await Promise.all([
    getProjectSummary(projectId),
    getOverallocatedResourcesReport(projectId),
    loadTaskReportRows(projectId),
  ]);

  const health = computeProjectHealth(projectSummary.cost);
  const baselineId = projectSummary.cost?.baselineId ?? null;
  const now = new Date();

  const upcomingMilestones: MilestoneReportRow[] = taskRows
    .filter((r) => r.isMilestone)
    .filter((m) => m.earlyFinish !== null && m.earlyFinish >= now)
    .sort((a, b) => {
      const at = a.earlyFinish?.getTime() ?? Number.POSITIVE_INFINITY;
      const bt = b.earlyFinish?.getTime() ?? Number.POSITIVE_INFINITY;
      return at - bt;
    })
    .slice(0, 5)
    .map((r) => ({
      wbsCode: r.wbsCode,
      name: r.name,
      earlyFinish: r.earlyFinish,
      deadline: r.deadline,
      percentComplete: r.percentComplete,
      isCritical: r.isCritical,
    }));

  const slipping = await getSlippingTasksReport(projectId, baselineId ?? undefined);

  let sCurve: SCurveResult | null = null;
  if (baselineId) {
    try {
      sCurve = await computeSCurve(projectId, { baselineId, granularityDays: 7 });
    } catch {
      sCurve = null;
    }
  }

  return {
    projectId,
    projectName: projectSummary.projectName,
    status: projectSummary.status,
    health,
    overallPercentComplete: projectSummary.overallPercentComplete,
    baselineId,
    spi: projectSummary.cost?.spi ?? null,
    cpi: projectSummary.cost?.cpi ?? null,
    criticalTaskCount: projectSummary.taskCounts.critical,
    overallocatedResourceCount: overallocated.length,
    startDate: projectSummary.startDate,
    finishDate: projectSummary.finishDate,
    statusDate: projectSummary.statusDate,
    taskCounts: projectSummary.taskCounts,
    earnedValue: projectSummary.cost,
    progressBreakdown: computeProgressBreakdown(taskRows),
    phaseProgress: selectPhaseProgress(taskRows),
    topInProgress: selectTopInProgress(taskRows, 5),
    nearCritical: selectNearCritical(taskRows, 5),
    upcomingMilestones,
    slippingTaskCount: slipping.length,
    topSlippingTasks: slipping.slice(0, 5),
    topOverallocated: summarizeOverallocations(overallocated, 5),
    sCurve,
  };
}

/**
 * Cross-project rollup for the signed-in user.
 * N+1 over membership is intentional at this app's scale.
 */
export async function getPortfolioDashboard(
  userId: string,
): Promise<ProjectDashboardSummary[]> {
  const projects = await listProjectsForUser(userId);
  return Promise.all(projects.map((p) => getProjectDashboardSummary(p.id)));
}

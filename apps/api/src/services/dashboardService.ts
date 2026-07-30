import {
  getMilestoneReport,
  getOverallocatedResourcesReport,
  getProjectSummary,
  getSlippingTasksReport,
  type MilestoneReportRow,
  type ProjectSummaryReport,
  type SlippingTaskReportRow,
} from './builtinReportsService.js';
import { listProjectsForUser } from './projectService.js';

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

export interface ProjectDashboard extends ProjectDashboardSummary {
  readonly upcomingMilestones: MilestoneReportRow[];
  readonly slippingTaskCount: number;
  readonly topSlippingTasks: SlippingTaskReportRow[];
}

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
  const summary = await getProjectDashboardSummary(projectId);
  const now = new Date();

  const milestones = await getMilestoneReport(projectId);
  const upcomingMilestones = milestones
    .filter((m) => m.earlyFinish !== null && new Date(m.earlyFinish) >= now)
    .slice(0, 5);

  const slipping = await getSlippingTasksReport(projectId, summary.baselineId ?? undefined);

  return {
    ...summary,
    upcomingMilestones,
    slippingTaskCount: slipping.length,
    topSlippingTasks: slipping.slice(0, 5),
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

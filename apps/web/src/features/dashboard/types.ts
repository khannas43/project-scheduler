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

export interface MilestoneReportRow {
  readonly wbsCode: string | null;
  readonly name: string;
  readonly earlyFinish: string | null;
  readonly deadline: string | null;
  readonly percentComplete: number | null;
  readonly isCritical: boolean;
}

export interface SlippingTaskReportRow {
  readonly taskId: string;
  readonly wbsCode: string | null;
  readonly name: string;
  readonly reasons: readonly string[];
  readonly varianceMinutes: number;
}

export interface ProjectDashboard extends ProjectDashboardSummary {
  readonly upcomingMilestones: readonly MilestoneReportRow[];
  readonly slippingTaskCount: number;
  readonly topSlippingTasks: readonly SlippingTaskReportRow[];
}

export const HEALTH_LABELS: Record<ProjectHealth, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  behind: 'Behind',
  no_baseline: 'No baseline',
  unknown: 'Unknown',
};

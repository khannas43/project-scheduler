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
  readonly earlyStart: string | null;
  readonly earlyFinish: string | null;
  readonly isCritical: boolean;
  readonly resourceNames: string;
}

export interface NearCriticalRow {
  readonly taskId: string;
  readonly wbsCode: string | null;
  readonly name: string;
  readonly totalFloatMinutes: number | null;
  readonly percentComplete: number | null;
  readonly earlyFinish: string | null;
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

export interface TaskCounts {
  readonly total: number;
  readonly summary: number;
  readonly leaf: number;
  readonly milestone: number;
  readonly critical: number;
  readonly completed: number;
}

export interface EarnedValueSnapshot {
  readonly baselineId: string;
  readonly bac: number;
  readonly pv: number;
  readonly ev: number;
  readonly ac: number;
  readonly spi: number | null;
  readonly cpi: number | null;
}

export interface SCurvePoint {
  readonly date: string;
  readonly pv: number;
}

export interface SCurvePayload {
  readonly points: readonly SCurvePoint[];
  readonly current: {
    readonly date: string;
    readonly ev: number;
    readonly ac: number;
  };
}

export interface ProjectDashboard extends ProjectDashboardSummary {
  readonly startDate: string | null;
  readonly finishDate: string | null;
  readonly statusDate: string | null;
  readonly taskCounts: TaskCounts;
  readonly earnedValue: EarnedValueSnapshot | null;
  readonly progressBreakdown: ProgressBreakdown;
  readonly phaseProgress: readonly PhaseProgressRow[];
  readonly topInProgress: readonly InProgressActivityRow[];
  readonly nearCritical: readonly NearCriticalRow[];
  readonly upcomingMilestones: readonly MilestoneReportRow[];
  readonly slippingTaskCount: number;
  readonly topSlippingTasks: readonly SlippingTaskReportRow[];
  readonly topOverallocated: readonly OverallocSummaryRow[];
  readonly sCurve: SCurvePayload | null;
}

export const HEALTH_LABELS: Record<ProjectHealth, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  behind: 'Behind',
  no_baseline: 'No baseline',
  unknown: 'Unknown',
};

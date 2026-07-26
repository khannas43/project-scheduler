export type ReportKind =
  | 'summary'
  | 'critical-tasks'
  | 'milestones'
  | 'overallocated-resources'
  | 'cost-overview'
  | 'slipping-tasks';

export interface ProjectSummaryReport {
  readonly projectId: string;
  readonly projectName: string;
  readonly status: string;
  readonly statusDate: string | null;
  readonly startDate: string | null;
  readonly finishDate: string | null;
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
  readonly earlyStart: string | null;
  readonly earlyFinish: string | null;
  readonly durationMinutes: number | null;
  readonly totalFloatMinutes: number | null;
  readonly percentComplete: number | null;
}

export interface MilestoneReportRow {
  readonly wbsCode: string | null;
  readonly name: string;
  readonly earlyFinish: string | null;
  readonly deadline: string | null;
  readonly percentComplete: number | null;
  readonly isCritical: boolean;
}

export interface OverallocationDay {
  readonly date: string;
  readonly totalUnits: number;
  readonly maxUnits: number;
}

export interface OverallocatedResourceReportRow {
  readonly resourceId: string;
  readonly resourceName: string;
  readonly overallocatedDayCount: number;
  readonly days: readonly OverallocationDay[];
}

export interface CostOverviewReport {
  readonly rows: ReadonlyArray<{
    readonly wbsCode: string | null;
    readonly name: string;
    readonly cost: number | null;
  }>;
  readonly totalCost: number;
  readonly unassignedTaskCount: number;
}

export interface SlippingTaskReportRow {
  readonly taskId: string;
  readonly wbsCode: string | null;
  readonly name: string;
  readonly reasons: readonly string[];
  readonly varianceMinutes: number;
}

export const REPORT_OPTIONS: ReadonlyArray<{ kind: ReportKind; label: string }> = [
  { kind: 'summary', label: 'Project summary' },
  { kind: 'critical-tasks', label: 'Critical tasks' },
  { kind: 'milestones', label: 'Milestones' },
  { kind: 'overallocated-resources', label: 'Overallocated resources' },
  { kind: 'cost-overview', label: 'Cost overview' },
  { kind: 'slipping-tasks', label: 'Slipping tasks' },
];

import { apiRequest, apiRequestBlob, downloadBlob } from '../../lib/apiClient.js';

import type {
  CostOverviewReport,
  CriticalTaskReportRow,
  MilestoneReportRow,
  OverallocatedResourceReportRow,
  ProjectSummaryReport,
  SlippingTaskReportRow,
} from './types.js';

export function getProjectSummaryReport(projectId: string): Promise<ProjectSummaryReport> {
  return apiRequest<ProjectSummaryReport>(`/api/projects/${projectId}/reports/summary`);
}

export function getCriticalTasksReport(projectId: string): Promise<CriticalTaskReportRow[]> {
  return apiRequest<CriticalTaskReportRow[]>(
    `/api/projects/${projectId}/reports/critical-tasks`,
  );
}

export function getMilestonesReport(projectId: string): Promise<MilestoneReportRow[]> {
  return apiRequest<MilestoneReportRow[]>(`/api/projects/${projectId}/reports/milestones`);
}

export function getOverallocatedResourcesReport(
  projectId: string,
): Promise<OverallocatedResourceReportRow[]> {
  return apiRequest<OverallocatedResourceReportRow[]>(
    `/api/projects/${projectId}/reports/overallocated-resources`,
  );
}

export function getCostOverviewReport(projectId: string): Promise<CostOverviewReport> {
  return apiRequest<CostOverviewReport>(`/api/projects/${projectId}/reports/cost-overview`);
}

export function getSlippingTasksReport(
  projectId: string,
  baselineId?: string,
): Promise<SlippingTaskReportRow[]> {
  const qs = baselineId ? `?baselineId=${encodeURIComponent(baselineId)}` : '';
  return apiRequest<SlippingTaskReportRow[]>(
    `/api/projects/${projectId}/reports/slipping-tasks${qs}`,
  );
}

async function downloadExport(
  projectId: string,
  format: 'csv' | 'excel' | 'pdf',
  fallbackFilename: string,
): Promise<void> {
  const { blob, filename } = await apiRequestBlob(
    `/api/projects/${projectId}/export/${format}`,
  );
  downloadBlob(blob, filename ?? fallbackFilename);
}

export function downloadProjectCsv(projectId: string): Promise<void> {
  return downloadExport(projectId, 'csv', 'project.csv');
}

export function downloadProjectExcel(projectId: string): Promise<void> {
  return downloadExport(projectId, 'excel', 'project.xlsx');
}

export function downloadProjectPdf(projectId: string): Promise<void> {
  return downloadExport(projectId, 'pdf', 'project.pdf');
}

// —— Custom / saved reports ——

export type SavedReportColumn =
  | 'wbsCode'
  | 'name'
  | 'isSummary'
  | 'isMilestone'
  | 'earlyStart'
  | 'earlyFinish'
  | 'deadline'
  | 'durationMinutes'
  | 'percentComplete'
  | 'isCritical'
  | 'totalFloatMinutes'
  | 'resourceNames'
  | 'cost';

export interface SavedReportFilters {
  readonly isCritical?: boolean;
  readonly isMilestone?: boolean;
  readonly includeSummaries?: boolean;
  readonly hasResources?: boolean;
  readonly minPercentComplete?: number;
  readonly maxPercentComplete?: number;
}

export interface SavedReportDefinition {
  readonly columns: readonly SavedReportColumn[];
  readonly filters?: SavedReportFilters;
  readonly sort?: {
    readonly column: SavedReportColumn;
    readonly direction: 'asc' | 'desc';
  };
}

export interface SavedReportSummary {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly definition: SavedReportDefinition;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CustomReportRunResult {
  readonly projectName: string;
  readonly columns: readonly SavedReportColumn[];
  readonly columnLabels: readonly string[];
  readonly rows: ReadonlyArray<Record<string, string | number | boolean | null>>;
  readonly rowCount: number;
  readonly reportId?: string;
  readonly reportName?: string;
}

export function listSavedReports(projectId: string): Promise<SavedReportSummary[]> {
  return apiRequest<SavedReportSummary[]>(`/api/projects/${projectId}/saved-reports`);
}

export function createSavedReport(
  projectId: string,
  input: { name: string; definition: SavedReportDefinition },
): Promise<SavedReportSummary> {
  return apiRequest<SavedReportSummary>(`/api/projects/${projectId}/saved-reports`, {
    method: 'POST',
    body: input,
  });
}

export function updateSavedReport(
  projectId: string,
  reportId: string,
  input: { name?: string; definition?: SavedReportDefinition },
): Promise<SavedReportSummary> {
  return apiRequest<SavedReportSummary>(
    `/api/projects/${projectId}/saved-reports/${reportId}`,
    { method: 'PATCH', body: input },
  );
}

export function deleteSavedReport(projectId: string, reportId: string): Promise<void> {
  return apiRequest<void>(`/api/projects/${projectId}/saved-reports/${reportId}`, {
    method: 'DELETE',
  });
}

export function previewCustomReport(
  projectId: string,
  definition: SavedReportDefinition,
): Promise<CustomReportRunResult> {
  return apiRequest<CustomReportRunResult>(
    `/api/projects/${projectId}/saved-reports/preview`,
    { method: 'POST', body: { definition } },
  );
}

export function runSavedReport(
  projectId: string,
  reportId: string,
): Promise<CustomReportRunResult> {
  return apiRequest<CustomReportRunResult>(
    `/api/projects/${projectId}/saved-reports/${reportId}/run`,
  );
}

export async function downloadSavedReportCsv(
  projectId: string,
  reportId: string,
  fallbackFilename = 'report.csv',
): Promise<void> {
  const { blob, filename } = await apiRequestBlob(
    `/api/projects/${projectId}/saved-reports/${reportId}/export/csv`,
  );
  downloadBlob(blob, filename ?? fallbackFilename);
}

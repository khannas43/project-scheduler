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

import { apiRequest } from '../../lib/apiClient.js';

export interface AuditLogListItem {
  readonly id: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly userId: string;
  readonly userEmail: string;
  readonly userFullName: string;
  readonly createdAt: string;
  readonly before: unknown;
  readonly after: unknown;
}

export interface AuditLogListResult {
  readonly items: readonly AuditLogListItem[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface AuditLogListParams {
  readonly action?: string;
  readonly entityType?: string;
  readonly userId?: string;
  readonly from?: string;
  readonly to?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export function listProjectAuditLog(
  projectId: string,
  params: AuditLogListParams = {},
): Promise<AuditLogListResult> {
  const qs = new URLSearchParams();
  if (params.action) qs.set('action', params.action);
  if (params.entityType) qs.set('entityType', params.entityType);
  if (params.userId) qs.set('userId', params.userId);
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  if (params.offset !== undefined) qs.set('offset', String(params.offset));
  const query = qs.toString();
  return apiRequest<AuditLogListResult>(
    `/api/projects/${projectId}/audit-log${query ? `?${query}` : ''}`,
  );
}

export function formatAuditAction(action: string): string {
  return action.replace(/[._]/g, ' ');
}

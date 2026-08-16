import { useQuery } from '@tanstack/react-query';

import * as activityApi from '../api.js';
import type { AuditLogListParams } from '../api.js';

export function auditLogQueryKey(projectId: string, params: AuditLogListParams) {
  return ['audit-log', projectId, params] as const;
}

export function useProjectAuditLog(projectId: string, params: AuditLogListParams) {
  return useQuery({
    queryKey: auditLogQueryKey(projectId, params),
    queryFn: () => activityApi.listProjectAuditLog(projectId, params),
    enabled: Boolean(projectId),
  });
}

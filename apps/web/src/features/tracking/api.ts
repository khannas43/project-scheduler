import { apiRequest } from '../../lib/apiClient.js';

import type { Baseline, BaselineDetail, EarnedValue, SCurve } from './types.js';

export function listBaselines(projectId: string): Promise<Baseline[]> {
  return apiRequest<Baseline[]>(`/api/projects/${projectId}/baselines`);
}

export function createBaseline(
  projectId: string,
  name?: string | null,
): Promise<Baseline> {
  return apiRequest<Baseline>(`/api/projects/${projectId}/baselines`, {
    method: 'POST',
    body: { name: name ?? null },
  });
}

export function getBaselineDetail(baselineId: string): Promise<BaselineDetail> {
  return apiRequest<BaselineDetail>(`/api/baselines/${baselineId}`);
}

export function getEarnedValue(
  projectId: string,
  opts?: { baselineId?: string; asOfDate?: string },
): Promise<EarnedValue> {
  const qs = new URLSearchParams();
  if (opts?.baselineId) qs.set('baselineId', opts.baselineId);
  if (opts?.asOfDate) qs.set('asOfDate', opts.asOfDate);
  const suffix = qs.size > 0 ? `?${qs}` : '';
  return apiRequest<EarnedValue>(`/api/projects/${projectId}/earned-value${suffix}`);
}

export function getSCurve(
  projectId: string,
  opts?: { baselineId?: string; granularityDays?: number },
): Promise<SCurve> {
  const qs = new URLSearchParams();
  if (opts?.baselineId) qs.set('baselineId', opts.baselineId);
  if (opts?.granularityDays !== undefined) {
    qs.set('granularityDays', String(opts.granularityDays));
  }
  const suffix = qs.size > 0 ? `?${qs}` : '';
  return apiRequest<SCurve>(`/api/projects/${projectId}/s-curve${suffix}`);
}

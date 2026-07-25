import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '../../../lib/apiClient.js';
import { useErrorBanner } from '../../../stores/errorBanner.js';
import * as trackingApi from '../api.js';

export function baselinesQueryKey(projectId: string) {
  return ['baselines', projectId] as const;
}

export function baselineDetailQueryKey(baselineId: string) {
  return ['baseline', baselineId] as const;
}

export function earnedValueQueryKey(projectId: string, baselineId?: string) {
  return ['earned-value', projectId, baselineId ?? 'latest'] as const;
}

export function sCurveQueryKey(projectId: string, baselineId?: string) {
  return ['s-curve', projectId, baselineId ?? 'latest'] as const;
}

export function useBaselines(projectId: string) {
  return useQuery({
    queryKey: baselinesQueryKey(projectId),
    queryFn: () => trackingApi.listBaselines(projectId),
    enabled: Boolean(projectId),
  });
}

export function useBaselineDetail(baselineId: string | null) {
  return useQuery({
    queryKey: baselineDetailQueryKey(baselineId ?? ''),
    queryFn: () => trackingApi.getBaselineDetail(baselineId!),
    enabled: Boolean(baselineId),
  });
}

export function useEarnedValue(projectId: string, baselineId?: string) {
  return useQuery({
    queryKey: earnedValueQueryKey(projectId, baselineId),
    queryFn: () => {
      const opts: { baselineId?: string } = {};
      if (baselineId !== undefined) opts.baselineId = baselineId;
      return trackingApi.getEarnedValue(projectId, opts);
    },
    enabled: Boolean(projectId),
    retry: false,
  });
}

export function useSCurve(projectId: string, baselineId?: string) {
  return useQuery({
    queryKey: sCurveQueryKey(projectId, baselineId),
    queryFn: () => {
      const opts: { baselineId?: string } = {};
      if (baselineId !== undefined) opts.baselineId = baselineId;
      return trackingApi.getSCurve(projectId, opts);
    },
    enabled: Boolean(projectId),
    retry: false,
  });
}

function showMutationError(
  showBanner: (err: ApiError | Error) => void,
  err: unknown,
): void {
  if (err instanceof ApiError) {
    showBanner(err);
    return;
  }
  if (err instanceof Error) {
    showBanner(err);
  }
}

export function useCreateBaseline(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: (name?: string | null) => trackingApi.createBaseline(projectId, name),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: baselinesQueryKey(projectId) });
      await queryClient.invalidateQueries({ queryKey: ['earned-value', projectId] });
      await queryClient.invalidateQueries({ queryKey: ['s-curve', projectId] });
    },
    onError: (err) => showMutationError(showBanner, err),
  });
}

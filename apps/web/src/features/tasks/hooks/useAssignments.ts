import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useErrorBanner } from '../../../stores/errorBanner.js';
import * as tasksApi from '../api.js';
import type { AssignmentRow, TaskTreeResponse } from '../types.js';
import { tasksQueryKey } from './useTaskTree.js';

export function assignmentTimephasedQueryKey(assignmentId: string) {
  return ['assignments', assignmentId, 'timephased'] as const;
}

/**
 * Lazy timephased distribution fetch — enabled only when a row's distribution
 * panel is expanded (same pattern as OverallocationBadge).
 */
export function useAssignmentTimephased(assignmentId: string, enabled = false) {
  return useQuery({
    queryKey: assignmentTimephasedQueryKey(assignmentId),
    queryFn: () => tasksApi.getAssignmentTimephased(assignmentId),
    enabled: Boolean(assignmentId && enabled),
  });
}

/** Load timephased contours for many assignments (resource calendar day load). */
export function useAssignmentsTimephasedMap(assignmentIds: readonly string[]) {
  const stableIds = useMemo(
    () => [...new Set(assignmentIds.filter(Boolean))].sort(),
    [assignmentIds],
  );

  const queries = useQueries({
    queries: stableIds.map((id) => ({
      queryKey: assignmentTimephasedQueryKey(id),
      queryFn: () => tasksApi.getAssignmentTimephased(id),
      enabled: Boolean(id),
      staleTime: 15_000,
    })),
  });

  const dataStamp = queries.map((q) => `${q.dataUpdatedAt}:${q.data?.length ?? 0}`).join('|');

  return useMemo(() => {
    const map = new Map<string, readonly tasksApi.AssignmentTimephasedRow[]>();
    for (let i = 0; i < stableIds.length; i += 1) {
      const id = stableIds[i];
      const data = queries[i]?.data;
      if (id && data) map.set(id, data);
    }
    return map;
    // dataStamp tracks per-query cache updates without depending on the queries array identity.
  }, [stableIds, dataStamp]);
}

/**
 * Assignment mutations — same non-optimistic pattern as useCreateDependency:
 * mutate, then merge the returned row into ['tasks', projectId].assignments
 * (append / replace / remove). No local schedule() preview.
 */
export function useCreateAssignment(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: (input: { taskId: string; resourceId: string; units?: number | null }) =>
      tasksApi.createAssignment(input),

    onError: (err) => {
      if (err instanceof Error) showBanner(err);
    },

    onSuccess: (created) => {
      const key = tasksQueryKey(projectId);
      const current = queryClient.getQueryData<TaskTreeResponse>(key);
      if (!current) {
        void queryClient.invalidateQueries({ queryKey: key });
        return;
      }
      const already = current.assignments.some((a) => a.id === created.id);
      queryClient.setQueryData<TaskTreeResponse>(key, {
        ...current,
        assignments: already ? current.assignments : [...current.assignments, created],
      });
    },
  });
}

export function useUpdateAssignment(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: (input: { assignmentId: string } & tasksApi.AssignmentUpdateInput) => {
      const { assignmentId, ...patch } = input;
      return tasksApi.updateAssignment(assignmentId, patch);
    },

    onError: (err) => {
      if (err instanceof Error) showBanner(err);
    },

    onSuccess: (updated: AssignmentRow) => {
      const key = tasksQueryKey(projectId);
      const current = queryClient.getQueryData<TaskTreeResponse>(key);
      if (!current) {
        void queryClient.invalidateQueries({ queryKey: key });
        return;
      }
      queryClient.setQueryData<TaskTreeResponse>(key, {
        ...current,
        assignments: current.assignments.map((a) => (a.id === updated.id ? updated : a)),
      });
    },
  });
}

export function useDeleteAssignment(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: (assignmentId: string) => tasksApi.deleteAssignment(assignmentId),

    onError: (err) => {
      if (err instanceof Error) showBanner(err);
    },

    onSuccess: (_res, assignmentId) => {
      const key = tasksQueryKey(projectId);
      const current = queryClient.getQueryData<TaskTreeResponse>(key);
      if (!current) {
        void queryClient.invalidateQueries({ queryKey: key });
        return;
      }
      queryClient.setQueryData<TaskTreeResponse>(key, {
        ...current,
        assignments: current.assignments.filter((a) => a.id !== assignmentId),
      });
    },
  });
}

/** Patch one day's planned units/work; merges assignment row + refreshes timephased cache. */
export function useUpdateTimephasedDay(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: (input: {
      assignmentId: string;
      periodDate: string;
      units?: number;
      plannedWorkMinutes?: number;
    }) => {
      const { assignmentId, ...body } = input;
      return tasksApi.updateAssignmentTimephasedDay(assignmentId, body);
    },

    onError: (err) => {
      if (err instanceof Error) showBanner(err);
    },

    onSuccess: (result, vars) => {
      const key = tasksQueryKey(projectId);
      const current = queryClient.getQueryData<TaskTreeResponse>(key);
      if (current) {
        queryClient.setQueryData<TaskTreeResponse>(key, {
          ...current,
          assignments: current.assignments.map((a) =>
            a.id === result.assignment.id ? result.assignment : a,
          ),
        });
      } else {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      queryClient.setQueryData(
        assignmentTimephasedQueryKey(vars.assignmentId),
        result.timephased,
      );
    },
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
    mutationFn: (input: { assignmentId: string; units: number }) =>
      tasksApi.updateAssignment(input.assignmentId, { units: input.units }),

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

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useErrorBanner } from '../../../stores/errorBanner.js';
import * as tasksApi from '../api.js';
import { mergeAffectedIntoTree } from '../optimisticEdit.js';
import type { TaskTreeResponse } from '../types.js';
import { tasksQueryKey } from './useTaskTree.js';

/**
 * Create a dependency via POST /api/dependencies.
 * No optimistic local schedule preview — the server validates the graph
 * (including cycle rejection as SchedulingConflictError → 409).
 * On success, merge affected CPM rows the same way task edits do, and append
 * the created dependency so the Gantt arrow appears without a full refetch.
 */
export function useCreateDependency(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: (input: { predecessorId: string; successorId: string }) =>
      tasksApi.createDependency({
        predecessorId: input.predecessorId,
        successorId: input.successorId,
        linkType: 'FS',
        lagMinutes: 0,
      }),

    onError: (err) => {
      // Includes scheduling_conflict (cycle) — detail is the user-facing message.
      if (err instanceof Error) {
        showBanner(err);
      }
    },

    onSuccess: (res) => {
      const key = tasksQueryKey(projectId);
      const current = queryClient.getQueryData<TaskTreeResponse>(key);
      if (!current) {
        void queryClient.invalidateQueries({ queryKey: key });
        return;
      }

      const merged = mergeAffectedIntoTree(current, res);
      const already = merged.dependencies.some((d) => d.id === res.dependency.id);
      queryClient.setQueryData<TaskTreeResponse>(key, {
        ...merged,
        dependencies: already ? merged.dependencies : [...merged.dependencies, res.dependency],
      });
    },
  });
}

/**
 * Delete a dependency via DELETE /api/dependencies/:id.
 * On success, drop the link from cache and merge rescheduled CPM rows.
 */
export function useDeleteDependency(projectId: string) {
  const queryClient = useQueryClient();
  const showBanner = useErrorBanner((s) => s.show);

  return useMutation({
    mutationFn: (dependencyId: string) => tasksApi.deleteDependency(dependencyId),

    onError: (err) => {
      if (err instanceof Error) {
        showBanner(err);
      }
    },

    onSuccess: (res, dependencyId) => {
      const key = tasksQueryKey(projectId);
      const current = queryClient.getQueryData<TaskTreeResponse>(key);
      if (!current) {
        void queryClient.invalidateQueries({ queryKey: key });
        return;
      }

      const merged = mergeAffectedIntoTree(current, res);
      queryClient.setQueryData<TaskTreeResponse>(key, {
        ...merged,
        dependencies: merged.dependencies.filter((d) => d.id !== dependencyId),
      });
    },
  });
}

/**
 * Replace a task's predecessors with the given predecessor task ids (FS, lag 0).
 * Diffs against the current tree cache, then deletes/creates sequentially.
 */
export function useSetTaskPredecessors(projectId: string) {
  const queryClient = useQueryClient();
  const createDep = useCreateDependency(projectId);
  const deleteDep = useDeleteDependency(projectId);
  const showBanner = useErrorBanner((s) => s.show);

  return useCallback(
    async (successorId: string, predecessorIds: readonly string[]) => {
      const key = tasksQueryKey(projectId);
      const current = queryClient.getQueryData<TaskTreeResponse>(key);
      if (!current) {
        showBanner(new Error('Task tree is not loaded'));
        return;
      }

      const uniquePredIds = [...new Set(predecessorIds)];
      if (uniquePredIds.includes(successorId)) {
        showBanner(new Error('A task cannot be its own predecessor'));
        return;
      }

      const existing = current.dependencies.filter((d) => d.successorId === successorId);
      const existingPredIds = new Set(existing.map((d) => d.predecessorId));
      const nextPredIds = new Set(uniquePredIds);

      const toRemove = existing.filter((d) => !nextPredIds.has(d.predecessorId));
      const toAdd = uniquePredIds.filter((id) => !existingPredIds.has(id));

      for (const dep of toRemove) {
        await deleteDep.mutateAsync(dep.id);
      }
      for (const predecessorId of toAdd) {
        await createDep.mutateAsync({ predecessorId, successorId });
      }
    },
    [projectId, queryClient, createDep, deleteDep, showBanner],
  );
}

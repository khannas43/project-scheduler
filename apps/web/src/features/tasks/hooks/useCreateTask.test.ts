import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TaskRow } from '../types.js';
import { useCreateTask } from './useCreateTask.js';
import { tasksQueryKey } from './useTaskTree.js';

vi.mock('../api.js', () => ({
  createTask: vi.fn(),
  getTaskTree: vi.fn(),
}));

import * as tasksApi from '../api.js';

const projectId = '22222222-2222-4222-8222-222222222222';

function createdTask(): TaskRow {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    projectId,
    parentId: null,
    wbsPath: '3',
    wbsCode: '3',
    sortOrder: 2,
    name: 'New work',
    notes: null,
    isMilestone: false,
    isSummary: false,
    schedulingMode: 'cpm',
    durationMinutes: 480,
    taskType: null,
    isEffortDriven: true,
    isManuallyScheduled: false,
    constraintType: null,
    constraintDate: null,
    deadline: null,
    calendarId: null,
    earlyStart: '2026-01-05T09:00:00.000Z',
    earlyFinish: '2026-01-05T17:00:00.000Z',
    lateStart: null,
    lateFinish: null,
    totalFloatMinutes: 0,
    freeFloatMinutes: 0,
    isCritical: false,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

describe('useCreateTask', () => {
  beforeEach(() => {
    vi.mocked(tasksApi.createTask).mockReset();
  });

  it('posts createTask and invalidates the task tree', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    vi.mocked(tasksApi.createTask).mockResolvedValue(createdTask());

    const { result } = renderHook(() => useCreateTask(projectId), {
      wrapper: wrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({
        name: 'New work',
        durationMinutes: 480,
      });
    });

    expect(tasksApi.createTask).toHaveBeenCalledWith(projectId, {
      name: 'New work',
      parentId: null,
      isSummary: false,
      isMilestone: false,
      durationMinutes: 480,
    });

    // placeAtWbs omitted when not provided
    expect(vi.mocked(tasksApi.createTask).mock.calls[0]?.[1]).not.toHaveProperty('placeAtWbs');

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: tasksQueryKey(projectId) });
    });
  });
});

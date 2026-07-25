import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../../lib/apiClient.js';
import { useErrorBanner } from '../../../stores/errorBanner.js';
import type { AssignmentRow, TaskRow, TaskTreeResponse } from '../types.js';
import {
  useAssignmentTimephased,
  useCreateAssignment,
  useDeleteAssignment,
  useUpdateAssignment,
} from './useAssignments.js';
import { tasksQueryKey } from './useTaskTree.js';

vi.mock('../api.js', () => ({
  createAssignment: vi.fn(),
  updateAssignment: vi.fn(),
  deleteAssignment: vi.fn(),
  getAssignmentTimephased: vi.fn(),
  getTaskTree: vi.fn(),
  patchTask: vi.fn(),
  createDependency: vi.fn(),
}));

import * as tasksApi from '../api.js';

const projectId = '22222222-2222-4222-8222-222222222222';
const taskId = '33333333-3333-4333-8333-333333333333';
const resId = '44444444-4444-4444-8444-444444444444';

function baseTask(): TaskRow {
  return {
    id: taskId,
    projectId,
    parentId: null,
    wbsPath: '1',
    wbsCode: '1',
    sortOrder: 0,
    name: 'Foundation',
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
    earlyStart: null,
    earlyFinish: null,
    lateStart: null,
    lateFinish: null,
    totalFloatMinutes: null,
    freeFloatMinutes: null,
    isCritical: false,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function baseTree(): TaskTreeResponse {
  return {
    projectVersion: 1,
    calendars: [],
    dependencies: [],
    assignments: [],
    tasks: [baseTask()],
  };
}

function assignment(partial: Partial<AssignmentRow> = {}): AssignmentRow {
  return {
    id: 'a1',
    taskId,
    resourceId: resId,
    units: '1',
    workMinutes: 480,
    actualWorkMinutes: null,
    cost: '400',
    actualCost: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

describe('useCreateAssignment', () => {
  beforeEach(() => {
    useErrorBanner.getState().clear();
    vi.mocked(tasksApi.createAssignment).mockReset();
    vi.mocked(tasksApi.updateAssignment).mockReset();
    vi.mocked(tasksApi.deleteAssignment).mockReset();
  });

  it('appends the created assignment into the tasks cache', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    client.setQueryData(tasksQueryKey(projectId), baseTree());
    const created = assignment({ id: 'a-new', units: '0.5', workMinutes: 240, cost: '200' });
    vi.mocked(tasksApi.createAssignment).mockResolvedValue(created);

    const { result } = renderHook(() => useCreateAssignment(projectId), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({ taskId, resourceId: resId, units: 0.5 });
    });

    const cached = client.getQueryData<TaskTreeResponse>(tasksQueryKey(projectId));
    expect(cached?.assignments).toHaveLength(1);
    expect(cached?.assignments[0]).toEqual(created);
  });

  it('invalidates when no cache entry exists', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    vi.mocked(tasksApi.createAssignment).mockResolvedValue(assignment());

    const { result } = renderHook(() => useCreateAssignment(projectId), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({ taskId, resourceId: resId });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: tasksQueryKey(projectId) });
  });

  it('surfaces errors on the banner', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    vi.mocked(tasksApi.createAssignment).mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'conflict',
        detail: 'Resource already assigned to this task',
        title: 'ConflictError',
      }),
    );

    const { result } = renderHook(() => useCreateAssignment(projectId), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      try {
        await result.current.mutateAsync({ taskId, resourceId: resId });
      } catch {
        // expected
      }
    });

    await waitFor(() => {
      expect(useErrorBanner.getState().message).toBe('Resource already assigned to this task');
    });
  });
});

describe('useUpdateAssignment / useDeleteAssignment', () => {
  beforeEach(() => {
    vi.mocked(tasksApi.updateAssignment).mockReset();
    vi.mocked(tasksApi.deleteAssignment).mockReset();
  });

  it('replaces the updated assignment in the cache', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    client.setQueryData(tasksQueryKey(projectId), {
      ...baseTree(),
      assignments: [assignment()],
    });
    const updated = assignment({ units: '2', workMinutes: 960, cost: '800' });
    vi.mocked(tasksApi.updateAssignment).mockResolvedValue(updated);

    const { result } = renderHook(() => useUpdateAssignment(projectId), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({ assignmentId: 'a1', units: 2 });
    });

    const cached = client.getQueryData<TaskTreeResponse>(tasksQueryKey(projectId));
    expect(cached?.assignments[0]?.units).toBe('2');
    expect(cached?.assignments[0]?.workMinutes).toBe(960);
  });

  it('removes the deleted assignment from the cache', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    client.setQueryData(tasksQueryKey(projectId), {
      ...baseTree(),
      assignments: [assignment(), assignment({ id: 'a2', resourceId: 'other' })],
    });
    vi.mocked(tasksApi.deleteAssignment).mockResolvedValue({ deleted: true });

    const { result } = renderHook(() => useDeleteAssignment(projectId), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync('a1');
    });

    const cached = client.getQueryData<TaskTreeResponse>(tasksQueryKey(projectId));
    expect(cached?.assignments).toHaveLength(1);
    expect(cached?.assignments[0]?.id).toBe('a2');
  });
});

describe('useAssignmentTimephased', () => {
  it('does not fetch when disabled', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    renderHook(() => useAssignmentTimephased('a1', false), {
      wrapper: createWrapper(client),
    });
    expect(tasksApi.getAssignmentTimephased).not.toHaveBeenCalled();
  });
});

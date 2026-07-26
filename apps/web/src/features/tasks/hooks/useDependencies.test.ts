import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../../lib/apiClient.js';
import { useErrorBanner } from '../../../stores/errorBanner.js';
import type {
  DependencyMutationResponse,
  DependencyRow,
  TaskMutationResponse,
  TaskRow,
  TaskTreeResponse,
} from '../types.js';
import { useCreateDependency, useDeleteDependency } from './useDependencies.js';
import { tasksQueryKey } from './useTaskTree.js';

vi.mock('../api.js', () => ({
  createDependency: vi.fn(),
  deleteDependency: vi.fn(),
  patchTask: vi.fn(),
  getTaskTree: vi.fn(),
}));

import * as tasksApi from '../api.js';

const projectId = '22222222-2222-4222-8222-222222222222';
const predId = '33333333-3333-4333-8333-333333333333';
const succId = '44444444-4444-4444-8444-444444444444';
const depId = '55555555-5555-4555-8555-555555555555';
const calendarId = '11111111-1111-4111-8111-111111111111';

function baseTask(id: string, overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id,
    projectId,
    parentId: null,
    wbsPath: id === predId ? '1' : '2',
    wbsCode: id === predId ? '1' : '2',
    sortOrder: id === predId ? 0 : 1,
    name: id === predId ? 'Foundation' : 'Framing',
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
    isCritical: true,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function baseTree(): TaskTreeResponse {
  return {
    projectVersion: 1,
    calendars: [
      {
        id: calendarId,
        name: 'Standard',
        projectId,
        workingDays: [1, 2, 3, 4, 5],
        hoursPerDay: '8',
        defaultStart: '09:00:00',
        defaultFinish: '17:00:00',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    dependencies: [],
    assignments: [],
    tasks: [baseTask(predId), baseTask(succId)],
  };
}

function createdDependency(): DependencyRow {
  return {
    id: depId,
    predecessorId: predId,
    successorId: succId,
    linkType: 'FS',
    lagMinutes: 0,
    lagPercent: null,
    createdAt: '2026-01-10T00:00:00.000Z',
    updatedAt: '2026-01-10T00:00:00.000Z',
  };
}

function mutationResponse(
  overrides: Partial<DependencyMutationResponse> = {},
): DependencyMutationResponse {
  const affectedSucc = baseTask(succId, {
    earlyStart: '2026-01-06T09:00:00.000Z',
    earlyFinish: '2026-01-06T17:00:00.000Z',
    version: 2,
  });
  return {
    task: null,
    affected: [affectedSucc],
    projectVersion: 2,
    warnings: [],
    dependency: createdDependency(),
    ...overrides,
  };
}

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

describe('useCreateDependency', () => {
  beforeEach(() => {
    useErrorBanner.getState().clear();
    vi.mocked(tasksApi.createDependency).mockReset();
  });

  it('merges affected tasks and appends the new dependency into the tasks cache', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    client.setQueryData(tasksQueryKey(projectId), baseTree());

    const res = mutationResponse();
    vi.mocked(tasksApi.createDependency).mockResolvedValue(res);

    const { result } = renderHook(() => useCreateDependency(projectId), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({ predecessorId: predId, successorId: succId });
    });

    expect(tasksApi.createDependency).toHaveBeenCalledWith({
      predecessorId: predId,
      successorId: succId,
      linkType: 'FS',
      lagMinutes: 0,
    });

    const cached = client.getQueryData<TaskTreeResponse>(tasksQueryKey(projectId));
    expect(cached?.projectVersion).toBe(2);
    expect(cached?.tasks.find((t) => t.id === succId)?.earlyStart).toBe(
      '2026-01-06T09:00:00.000Z',
    );
    expect(cached?.tasks.find((t) => t.id === succId)?.version).toBe(2);
    expect(cached?.dependencies).toHaveLength(1);
    expect(cached?.dependencies[0]).toEqual(res.dependency);
  });

  it('surfaces a 409 scheduling_conflict via useErrorBanner with the server detail', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    client.setQueryData(tasksQueryKey(projectId), baseTree());

    const cycleError = new ApiError({
      status: 409,
      code: 'scheduling_conflict',
      detail: 'Dependency would create a cycle involving tasks A → B → A',
      title: 'SchedulingConflictError',
      taskIds: [predId, succId],
    });
    vi.mocked(tasksApi.createDependency).mockRejectedValue(cycleError);

    const { result } = renderHook(() => useCreateDependency(projectId), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      try {
        await result.current.mutateAsync({ predecessorId: predId, successorId: succId });
      } catch {
        // expected — mutation rejects after onError
      }
    });

    await waitFor(() => {
      const banner = useErrorBanner.getState();
      expect(banner.message).toBe(cycleError.detail);
      expect(banner.code).toBe('scheduling_conflict');
    });

    // Cache unchanged on failure.
    expect(client.getQueryData<TaskTreeResponse>(tasksQueryKey(projectId))).toEqual(baseTree());
  });

  it('invalidates the tasks query when no cache entry exists on success', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    vi.mocked(tasksApi.createDependency).mockResolvedValue(mutationResponse());

    const { result } = renderHook(() => useCreateDependency(projectId), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({ predecessorId: predId, successorId: succId });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: tasksQueryKey(projectId) });
    expect(client.getQueryData(tasksQueryKey(projectId))).toBeUndefined();
  });
});

describe('useDeleteDependency', () => {
  beforeEach(() => {
    useErrorBanner.getState().clear();
    vi.mocked(tasksApi.deleteDependency).mockReset();
  });

  it('removes the dependency from cache and merges affected tasks', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const tree = baseTree();
    client.setQueryData(tasksQueryKey(projectId), {
      ...tree,
      dependencies: [createdDependency()],
    });

    const res: TaskMutationResponse = {
      task: null,
      affected: [baseTask(succId, { earlyStart: '2026-01-05T09:00:00.000Z', version: 3 })],
      projectVersion: 3,
      warnings: [],
    };
    vi.mocked(tasksApi.deleteDependency).mockResolvedValue(res);

    const { result } = renderHook(() => useDeleteDependency(projectId), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync(depId);
    });

    expect(tasksApi.deleteDependency).toHaveBeenCalledWith(depId);
    const cached = client.getQueryData<TaskTreeResponse>(tasksQueryKey(projectId));
    expect(cached?.dependencies).toEqual([]);
    expect(cached?.projectVersion).toBe(3);
  });
});

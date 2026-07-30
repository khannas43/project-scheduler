import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project } from '../../projects/index.js';
import type { TaskRow, TaskTreeResponse } from '../types.js';
import { useUndoStack } from '../undoStack.js';
import { projectQueryKey, useTaskEdit } from './useTaskEdit.js';
import { useUndoRedo } from './useUndoRedo.js';
import { tasksQueryKey } from './useTaskTree.js';

vi.mock('../api.js', () => ({
  patchTask: vi.fn(),
  getTaskTree: vi.fn(),
}));

vi.mock('../../projects/index.js', () => ({
  projectsApi: {
    getProject: vi.fn(),
  },
}));

import * as tasksApi from '../api.js';
import { projectsApi } from '../../projects/index.js';

const projectId = '22222222-2222-4222-8222-222222222222';
const taskId = '33333333-3333-4333-8333-333333333333';
const calendarId = '11111111-1111-4111-8111-111111111111';

function baseProject(): Project {
  return {
    id: projectId,
    name: 'Demo',
    description: null,
    status: 'active',
    startDate: '2026-01-05T00:00:00.000Z',
    finishDate: null,
    statusDate: null,
    calendarId,
    ownerId: '55555555-5555-4555-8555-555555555555',
    isArchived: false,
    settings: {
      dateFormat: 'yyyy-mm-dd',
      dateTimeDisplay: 'date',
      activeBaselineId: null,
      showBaselineOnGantt: false,
      storyPointScale: 'fibonacci',
    },
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function baseTask(version: number): TaskRow {
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
    earlyStart: '2026-01-05T09:00:00.000Z',
    earlyFinish: '2026-01-05T17:00:00.000Z',
    lateStart: null,
    lateFinish: null,
    totalFloatMinutes: 0,
    freeFloatMinutes: 0,
    isCritical: true,
    storyPoints: null,
    sprintId: null,
    boardColumnId: null,
    backlogRank: null,
    version,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function baseTree(version: number): TaskTreeResponse {
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
    tasks: [baseTask(version)],
  };
}

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useUndoRedo + useTaskEdit', () => {
  beforeEach(() => {
    useUndoStack.getState().clear();
    vi.mocked(tasksApi.patchTask).mockReset();
    vi.mocked(projectsApi.getProject).mockResolvedValue(baseProject());
  });

  it('undo issues patchTask with the live cache version, not a stale captured one', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    client.setQueryData(tasksQueryKey(projectId), baseTree(2));
    client.setQueryData(projectQueryKey(projectId), baseProject());

    vi.mocked(tasksApi.patchTask).mockImplementation(async (id, body) => ({
      task: { ...baseTask(body.version + 1), name: body.name ?? 'Foundation', id },
      affected: [],
      projectVersion: 2,
      warnings: [],
    }));

    const { result } = renderHook(
      () => {
        const edit = useTaskEdit(projectId);
        const undoRedo = useUndoRedo(projectId, edit.mutate);
        return { edit, undoRedo };
      },
      { wrapper: createWrapper(client) },
    );

    await act(async () => {
      await result.current.edit.mutateAsync({
        taskId,
        version: 2,
        name: 'Slab',
      });
    });

    await waitFor(() => {
      expect(useUndoStack.getState().canUndo()).toBe(true);
    });

    // Simulate a concurrent bump of the task version in the live cache
    // (e.g. another reconcile) before the user hits Undo.
    const bumped: TaskTreeResponse = {
      ...baseTree(7),
      tasks: [{ ...baseTask(7), name: 'Slab' }],
    };
    client.setQueryData(tasksQueryKey(projectId), bumped);

    vi.mocked(tasksApi.patchTask).mockClear();
    vi.mocked(tasksApi.patchTask).mockResolvedValue({
      task: { ...baseTask(8), name: 'Foundation' },
      affected: [],
      projectVersion: 3,
      warnings: [],
    });

    await act(async () => {
      result.current.undoRedo.undo();
    });

    await waitFor(() => {
      expect(tasksApi.patchTask).toHaveBeenCalledWith(taskId, {
        version: 7,
        name: 'Foundation',
      });
    });
  });

  it('attaches keyboard shortcuts only while mounted', () => {
    const client = new QueryClient();
    client.setQueryData(tasksQueryKey(projectId), baseTree(1));
    client.setQueryData(projectQueryKey(projectId), baseProject());

    const mutate = vi.fn();
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useUndoRedo(projectId, mutate), {
      wrapper: createWrapper(client),
    });

    const keydownAdds = addSpy.mock.calls.filter((c) => c[0] === 'keydown');
    expect(keydownAdds.length).toBeGreaterThanOrEqual(1);

    unmount();

    const keydownRemoves = removeSpy.mock.calls.filter((c) => c[0] === 'keydown');
    expect(keydownRemoves.length).toBeGreaterThanOrEqual(1);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('Cmd+Z triggers undo when not focused in an input', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    client.setQueryData(tasksQueryKey(projectId), baseTree(1));
    client.setQueryData(projectQueryKey(projectId), baseProject());

    useUndoStack.getState().bindProject(projectId);
    useUndoStack.getState().push({
      taskId,
      before: { name: 'Foundation' },
      after: { name: 'Slab' },
    });

    const mutate = vi.fn();
    renderHook(() => useUndoRedo(projectId, mutate), { wrapper: createWrapper(client) });

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true }),
      );
    });

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId,
        version: 1,
        name: 'Foundation',
        source: 'undo',
      }),
    );
  });

  it('does not handle Cmd+Z while typing in an input', () => {
    const client = new QueryClient();
    client.setQueryData(tasksQueryKey(projectId), baseTree(1));
    useUndoStack.getState().bindProject(projectId);
    useUndoStack.getState().push({
      taskId,
      before: { name: 'Foundation' },
      after: { name: 'Slab' },
    });

    const mutate = vi.fn();
    renderHook(() => useUndoRedo(projectId, mutate), { wrapper: createWrapper(client) });

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'z',
        metaKey: true,
        bubbles: true,
      }),
    );

    expect(mutate).not.toHaveBeenCalled();
    input.remove();
  });
});

describe('useUndoRedo lifecycle', () => {
  it('clears the stack on unmount', () => {
    const client = new QueryClient();
    useUndoStack.getState().bindProject(projectId);
    useUndoStack.getState().push({
      taskId,
      before: { name: 'A' },
      after: { name: 'B' },
    });

    const { unmount } = renderHook(() => useUndoRedo(projectId, vi.fn()), {
      wrapper: createWrapper(client),
    });
    expect(useUndoStack.getState().canUndo()).toBe(true);
    unmount();
    expect(useUndoStack.getState().history).toHaveLength(0);
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SprintRow } from '../../sprints/types.js';
import type { TaskRow, TaskTreeResponse } from '../../tasks/types.js';
import { BacklogPage } from './BacklogPage.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const sprintId = '22222222-2222-4222-8222-222222222222';
const taskA = '55555555-5555-4555-8555-555555555555';
const taskB = '66666666-6666-4666-8666-666666666666';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to?: string }) => (
    <a href={to ?? '#'}>{children}</a>
  ),
  useParams: () => ({ projectId }),
}));

vi.mock('../../sprints/hooks/useSprints.js', () => ({
  useSprints: vi.fn(),
  useCreateSprint: vi.fn(),
}));

vi.mock('../hooks/useBoard.js', () => ({
  useReorderBacklogRank: vi.fn(),
  usePatchTaskSprint: vi.fn(),
}));

vi.mock('../../tasks/hooks/useTaskTree.js', () => ({
  useTaskTree: vi.fn(),
}));

import { useCreateSprint, useSprints } from '../../sprints/hooks/useSprints.js';
import { useTaskTree } from '../../tasks/hooks/useTaskTree.js';
import { usePatchTaskSprint, useReorderBacklogRank } from '../hooks/useBoard.js';

function task(partial: Partial<TaskRow> & Pick<TaskRow, 'id' | 'name'>): TaskRow {
  return {
    projectId,
    parentId: null,
    wbsPath: '1',
    wbsCode: '1',
    sortOrder: 0,
    notes: null,
    isMilestone: false,
    isSummary: false,
    schedulingMode: 'agile',
    durationMinutes: null,
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
    storyPoints: null,
    sprintId: null,
    boardColumnId: null,
    backlogRank: 'a0',
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function sprint(partial?: Partial<SprintRow>): SprintRow {
  return {
    id: sprintId,
    projectId,
    name: 'Sprint 1',
    goal: null,
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-01-14T00:00:00.000Z',
    capacity: null,
    state: 'planned',
    version: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('BacklogPage', () => {
  const reorderMutateAsync = vi.fn();
  const patchMutateAsync = vi.fn();

  beforeEach(() => {
    reorderMutateAsync.mockReset();
    patchMutateAsync.mockReset();
    reorderMutateAsync.mockResolvedValue(task({ id: taskA, name: 'Alpha' }));
    patchMutateAsync.mockResolvedValue({});

    vi.mocked(useSprints).mockReturnValue({
      data: [sprint()],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useSprints>);

    vi.mocked(useCreateSprint).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useCreateSprint>);

    vi.mocked(useReorderBacklogRank).mockReturnValue({
      mutateAsync: reorderMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useReorderBacklogRank>);

    vi.mocked(usePatchTaskSprint).mockReturnValue({
      mutateAsync: patchMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof usePatchTaskSprint>);
  });

  it('reorders within the backlog section on drop', async () => {
    const tree: TaskTreeResponse = {
      tasks: [
        task({ id: taskA, name: 'Alpha', backlogRank: 'a0', wbsCode: '1' }),
        task({ id: taskB, name: 'Beta', backlogRank: 'a1', wbsCode: '2' }),
      ],
      dependencies: [],
      calendars: [],
      assignments: [],
      projectVersion: 1,
    };
    vi.mocked(useTaskTree).mockReturnValue({
      data: tree,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useTaskTree>);

    wrap(<BacklogPage />);

    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    const alpha = screen.getByText('Alpha').closest('.backlog-item')!;
    const beta = screen.getByText('Beta').closest('.backlog-item')!;

    const dataTransfer = {
      effectAllowed: 'move',
      dropEffect: 'move',
      setData: vi.fn(),
      getData: vi.fn(() => taskB),
    };

    fireEvent.dragStart(beta, { dataTransfer });
    fireEvent.dragOver(alpha, { dataTransfer });
    fireEvent.drop(alpha, { dataTransfer });

    await waitFor(() => {
      expect(reorderMutateAsync).toHaveBeenCalledWith({
        taskId: taskB,
        beforeTaskId: taskA,
        afterTaskId: null,
      });
    });
    expect(patchMutateAsync).not.toHaveBeenCalled();
  });

  it('patches sprintId and lands the task at the drop point when dropping across sections', async () => {
    const tree: TaskTreeResponse = {
      tasks: [
        task({ id: taskA, name: 'Alpha', sprintId: null, version: 3 }),
        task({ id: taskB, name: 'Beta', sprintId, backlogRank: 'b0' }),
      ],
      dependencies: [],
      calendars: [],
      assignments: [],
      projectVersion: 1,
    };
    vi.mocked(useTaskTree).mockReturnValue({
      data: tree,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useTaskTree>);

    wrap(<BacklogPage />);

    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    const alpha = screen.getByText('Alpha').closest('.backlog-item')!;
    const sprintSection = screen.getByRole('region', { name: /sprint 1/i });

    const dataTransfer = {
      effectAllowed: 'move',
      dropEffect: 'move',
      setData: vi.fn(),
      getData: vi.fn(() => taskA),
    };

    fireEvent.dragStart(alpha, { dataTransfer });
    fireEvent.dragOver(sprintSection, { dataTransfer });
    fireEvent.drop(sprintSection, { dataTransfer });

    // sprintId patches first, then the task is placed after Beta (the only
    // existing member of the destination section) rather than keeping
    // whatever rank it had back in the backlog.
    await waitFor(() => {
      expect(patchMutateAsync).toHaveBeenCalledWith({
        taskId: taskA,
        version: 3,
        sprintId,
      });
    });
    await waitFor(() => {
      expect(reorderMutateAsync).toHaveBeenCalledWith({
        taskId: taskA,
        beforeTaskId: null,
        afterTaskId: taskB,
      });
    });
  });
});

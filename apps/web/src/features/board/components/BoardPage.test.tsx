import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BoardColumnRow } from '../types.js';
import type { SprintRow } from '../../sprints/types.js';
import type { TaskRow, TaskTreeResponse } from '../../tasks/types.js';
import { BoardPage } from './BoardPage.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const sprintId = '22222222-2222-4222-8222-222222222222';
const colTodo = '33333333-3333-4333-8333-333333333333';
const colDoing = '44444444-4444-4444-8444-444444444444';
const taskId = '55555555-5555-4555-8555-555555555555';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to?: string }) => (
    <a href={to ?? '#'}>{children}</a>
  ),
  useParams: () => ({ projectId }),
}));

vi.mock('../../sprints/hooks/useSprints.js', () => ({
  useSprints: vi.fn(),
}));

vi.mock('../hooks/useBoard.js', () => ({
  useBoardColumns: vi.fn(),
  useMoveTaskBoardColumn: vi.fn(),
  useCreateBoardColumn: vi.fn(),
  useUpdateBoardColumn: vi.fn(),
  useDeleteBoardColumn: vi.fn(),
}));

vi.mock('../../tasks/hooks/useTaskTree.js', () => ({
  useTaskTree: vi.fn(),
}));

vi.mock('../../resources/hooks/useResources.js', () => ({
  useResources: vi.fn(),
}));

import { useResources } from '../../resources/hooks/useResources.js';
import { useSprints } from '../../sprints/hooks/useSprints.js';
import { useTaskTree } from '../../tasks/hooks/useTaskTree.js';
import { useBoardColumns, useMoveTaskBoardColumn } from '../hooks/useBoard.js';

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
    storyPoints: '3',
    sprintId,
    boardColumnId: colTodo,
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
    state: 'active',
    version: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function column(partial: Partial<BoardColumnRow> & Pick<BoardColumnRow, 'id' | 'name'>): BoardColumnRow {
  return {
    projectId,
    sortOrder: 0,
    wipLimit: null,
    isDone: false,
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

describe('BoardPage', () => {
  const moveMutateAsync = vi.fn();

  beforeEach(() => {
    moveMutateAsync.mockReset();
    moveMutateAsync.mockResolvedValue(task({ id: taskId, name: 'Story' }));

    vi.mocked(useSprints).mockReturnValue({
      data: [sprint()],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useSprints>);

    vi.mocked(useBoardColumns).mockReturnValue({
      data: [
        column({ id: colTodo, name: 'To do', sortOrder: 0 }),
        column({ id: colDoing, name: 'Doing', sortOrder: 1, wipLimit: 2 }),
      ],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useBoardColumns>);

    const tree: TaskTreeResponse = {
      tasks: [task({ id: taskId, name: 'Story', boardColumnId: colTodo })],
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

    vi.mocked(useResources).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useResources>);

    vi.mocked(useMoveTaskBoardColumn).mockReturnValue({
      mutateAsync: moveMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useMoveTaskBoardColumn>);
  });

  it('drops a card onto another column and calls moveTaskBoardColumn', async () => {
    wrap(<BoardPage />);

    expect(await screen.findByText('Story')).toBeInTheDocument();
    const card = screen.getByText('Story').closest('.board-card');
    expect(card).toBeTruthy();

    const doing = screen.getByRole('region', { name: /doing/i });
    const dataTransfer = {
      effectAllowed: 'move',
      dropEffect: 'move',
      setData: vi.fn(),
      getData: vi.fn(() => taskId),
    };

    fireEvent.dragStart(card!, { dataTransfer });
    fireEvent.dragOver(doing, { dataTransfer });
    fireEvent.drop(doing, { dataTransfer });

    await waitFor(() => {
      expect(moveMutateAsync).toHaveBeenCalledWith({
        taskId,
        boardColumnId: colDoing,
      });
    });
  });

  it('groups cards into epic swimlanes when Group by is Epic', async () => {
    const epicId = '77777777-7777-4777-8777-777777777777';
    const tree: TaskTreeResponse = {
      tasks: [
        task({
          id: epicId,
          name: 'Checkout epic',
          isSummary: true,
          sprintId: null,
          boardColumnId: null,
          storyPoints: null,
        }),
        task({
          id: taskId,
          name: 'Story',
          parentId: epicId,
          boardColumnId: colTodo,
        }),
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

    wrap(<BoardPage />);

    fireEvent.change(screen.getByLabelText('Group by'), { target: { value: 'epic' } });

    expect(await screen.findByText('Checkout epic')).toBeInTheDocument();
    expect(screen.getByText('Story')).toBeInTheDocument();
  });
});

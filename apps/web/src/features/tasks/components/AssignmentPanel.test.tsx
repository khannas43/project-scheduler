import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AssignmentRow, TaskRow } from '../types.js';
import { AssignmentPanel } from './AssignmentPanel.js';

vi.mock('../../resources/api.js', () => ({
  listResources: vi.fn(),
  createResource: vi.fn(),
  updateResource: vi.fn(),
  deleteResource: vi.fn(),
  getOverallocations: vi.fn(),
}));

vi.mock('../api.js', () => ({
  createAssignment: vi.fn(),
  updateAssignment: vi.fn(),
  deleteAssignment: vi.fn(),
  getAssignmentTimephased: vi.fn(),
  getTaskTree: vi.fn(),
  patchTask: vi.fn(),
  createDependency: vi.fn(),
}));

import * as resourcesApi from '../../resources/api.js';
import * as tasksApi from '../api.js';

const projectId = '22222222-2222-4222-8222-222222222222';
const taskId = '33333333-3333-4333-8333-333333333333';
const otherTaskId = '44444444-4444-4444-8444-444444444444';
const resA = '55555555-5555-4555-8555-555555555555';
const resB = '66666666-6666-4666-8666-666666666666';

function task(overrides: Partial<TaskRow> = {}): TaskRow {
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
    storyPoints: null,
    sprintId: null,
    boardColumnId: null,
    backlogRank: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function assignment(partial: Partial<AssignmentRow> & Pick<AssignmentRow, 'id' | 'taskId' | 'resourceId'>): AssignmentRow {
  return {
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

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('AssignmentPanel', () => {
  beforeEach(() => {
    vi.mocked(resourcesApi.listResources).mockResolvedValue([
      {
        id: resA,
        name: 'Alice',
        resourceType: 'work',
        email: null,
        maxUnits: '1',
        standardRate: '50',
        overtimeRate: null,
        costPerUse: '0',
        accrualType: null,
        calendarId: null,
        skills: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: resB,
        name: 'Bob',
        resourceType: 'work',
        email: null,
        maxUnits: '1',
        standardRate: '60',
        overtimeRate: null,
        costPerUse: '0',
        accrualType: null,
        calendarId: null,
        skills: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    vi.mocked(tasksApi.createAssignment).mockReset();
    vi.mocked(tasksApi.updateAssignment).mockReset();
    vi.mocked(tasksApi.deleteAssignment).mockReset();
    vi.mocked(tasksApi.getAssignmentTimephased).mockReset();
    vi.mocked(tasksApi.getAssignmentTimephased).mockResolvedValue([
      {
        id: 'tp1',
        assignmentId: 'a1',
        periodDate: '2026-01-05',
        plannedWorkMinutes: 240,
        actualWorkMinutes: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'tp2',
        assignmentId: 'a1',
        periodDate: '2026-01-06',
        plannedWorkMinutes: 240,
        actualWorkMinutes: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });

  it('filters to the current task assignments only', async () => {
    wrap(
      <AssignmentPanel
        projectId={projectId}
        task={task()}
        assignments={[
          assignment({ id: 'a1', taskId, resourceId: resA }),
          assignment({ id: 'a2', taskId: otherTaskId, resourceId: resB }),
        ]}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /edit assignment for alice/i })).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: /edit assignment for bob/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('480')).toBeInTheDocument();
    expect(screen.getByText('400')).toBeInTheDocument();
  });

  it('adds an assignment via createAssignment', async () => {
    const user = userEvent.setup();
    vi.mocked(tasksApi.createAssignment).mockResolvedValue(
      assignment({ id: 'a-new', taskId, resourceId: resB, units: '0.5', workMinutes: 240, cost: '200' }),
    );

    wrap(
      <AssignmentPanel
        projectId={projectId}
        task={task()}
        assignments={[assignment({ id: 'a1', taskId, resourceId: resA })]}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Bob/i })).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText(/resource to assign/i), resB);
    await user.clear(screen.getByLabelText(/^units$/i));
    await user.type(screen.getByLabelText(/^units$/i), '0.5');
    await user.click(screen.getByRole('button', { name: /add assignment/i }));

    await waitFor(() => {
      expect(tasksApi.createAssignment).toHaveBeenCalledWith({
        taskId,
        resourceId: resB,
        units: 0.5,
      });
    });
  });

  it('removes an assignment', async () => {
    const user = userEvent.setup();
    vi.mocked(tasksApi.deleteAssignment).mockResolvedValue({ deleted: true });

    wrap(
      <AssignmentPanel
        projectId={projectId}
        task={task()}
        assignments={[assignment({ id: 'a1', taskId, resourceId: resA })]}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /remove/i }));

    await waitFor(() => {
      expect(tasksApi.deleteAssignment).toHaveBeenCalledWith('a1');
    });
  });

  it('edits units, work, and cost from the row editor', async () => {
    const user = userEvent.setup();
    vi.mocked(tasksApi.updateAssignment).mockResolvedValue(
      assignment({
        id: 'a1',
        taskId,
        resourceId: resA,
        units: '0.5',
        workMinutes: 240,
        cost: '200',
      }),
    );

    wrap(
      <AssignmentPanel
        projectId={projectId}
        task={task()}
        assignments={[
          assignment({
            id: 'a1',
            taskId,
            resourceId: resA,
            units: '1',
            workMinutes: 480,
            cost: '400',
          }),
        ]}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /edit assignment for alice/i })).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: /^edit$/i }));

    const workInput = screen.getByRole('textbox', { name: /^work minutes for alice$/i });
    await user.clear(workInput);
    await user.type(workInput, '240');

    const costInput = screen.getByRole('textbox', { name: /^cost for alice$/i });
    await user.clear(costInput);
    await user.type(costInput, '200');

    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(tasksApi.updateAssignment).toHaveBeenCalledWith('a1', {
        workMinutes: 240,
        cost: 200,
      });
    });
  });

  it('does not fetch timephased until View distribution is expanded', async () => {
    const user = userEvent.setup();

    wrap(
      <AssignmentPanel
        projectId={projectId}
        task={task()}
        assignments={[assignment({ id: 'a1', taskId, resourceId: resA })]}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /edit assignment for alice/i })).toBeInTheDocument(),
    );
    expect(tasksApi.getAssignmentTimephased).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /view distribution/i }));

    await waitFor(() => {
      expect(tasksApi.getAssignmentTimephased).toHaveBeenCalledWith('a1');
      expect(screen.getByText('2026-01-05')).toBeInTheDocument();
      expect(screen.getByText('2026-01-06')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /hide distribution/i }));
    expect(screen.queryByText('2026-01-05')).not.toBeInTheDocument();
  });
});

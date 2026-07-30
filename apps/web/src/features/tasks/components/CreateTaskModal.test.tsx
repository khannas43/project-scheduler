import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { TaskRow } from '../types.js';
import { CreateTaskModal, suggestWbsCode } from './CreateTaskModal.js';

function parentTask(): TaskRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    projectId: 'p1',
    parentId: null,
    wbsPath: '2',
    wbsCode: '2',
    sortOrder: 1,
    name: 'Design',
    notes: null,
    isMilestone: false,
    isSummary: true,
    schedulingMode: 'cpm',
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
    backlogRank: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('suggestWbsCode', () => {
  it('suggests the next child / root outline code', () => {
    const parent = parentTask();
    const child = {
      ...parent,
      id: '22222222-2222-4222-8222-222222222222',
      parentId: parent.id,
      wbsPath: '2.1',
      wbsCode: '2.1',
      name: 'Wireframes',
      isSummary: false,
      sortOrder: 0,
    };
    expect(suggestWbsCode([parent, child], parent)).toBe('2.2');
    expect(suggestWbsCode([parent], null)).toBe('2');
  });
});

describe('CreateTaskModal', () => {
  it('submits a root task with an editable WBS placement', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <CreateTaskModal
        parent={null}
        suggestedWbs="3"
        isPending={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText(/task name/i), 'Pour slab');
    const wbs = screen.getByLabelText(/wbs code/i);
    await user.clear(wbs);
    await user.type(wbs, '2.5');
    await user.clear(screen.getByLabelText(/^duration \(days\)$/i));
    await user.type(screen.getByLabelText(/^duration \(days\)$/i), '2');
    await user.click(screen.getByRole('button', { name: /^add task$/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Pour slab',
      parentId: null,
      placeAtWbs: '2.5',
      isSummary: false,
      isMilestone: false,
      durationMinutes: 960,
    });
  });

  it('submits a milestone with zero duration', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <CreateTaskModal
        parent={null}
        suggestedWbs="4"
        isPending={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText(/task name/i), 'Go-live');
    await user.click(screen.getByRole('checkbox', { name: /milestone/i }));
    expect(screen.queryByLabelText(/^duration \(days\)$/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^add task$/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Go-live',
      parentId: null,
      placeAtWbs: '4',
      isSummary: false,
      isMilestone: true,
      durationMinutes: 0,
    });
  });

  it('submits a subtask at a nested WBS like 2.5.1', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const parent = parentTask();
    render(
      <CreateTaskModal
        parent={parent}
        suggestedWbs="2.5"
        isPending={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText(/subtask name/i), 'Rebar');
    const wbs = screen.getByLabelText(/wbs code/i);
    await user.clear(wbs);
    await user.type(wbs, '2.5.1');
    await user.click(screen.getByRole('button', { name: /^add subtask$/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Rebar',
      parentId: parent.id,
      placeAtWbs: '2.5.1',
      isSummary: false,
      isMilestone: false,
      durationMinutes: 480,
    });
  });
});

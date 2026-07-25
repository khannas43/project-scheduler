import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { TaskRow } from '../types.js';
import { TaskGrid } from './TaskGrid.js';

function task(partial: Partial<TaskRow> & Pick<TaskRow, 'id' | 'name'>): TaskRow {
  return {
    projectId: 'p1',
    parentId: null,
    wbsPath: '1',
    wbsCode: '1',
    sortOrder: 0,
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
    version: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('TaskGrid', () => {
  it('commits an inline name edit on Enter with version (§9.1)', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const rows = [task({ id: 't1', name: 'Dig', version: 2 })];

    render(<TaskGrid tasks={rows} highlightedTaskId={null} onEdit={onEdit} />);

    expect(screen.getByRole('columnheader', { name: /wbs/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /early start/i })).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dig' }));
    const input = screen.getByLabelText(/edit name/i);
    await user.clear(input);
    await user.type(input, 'Excavate{Enter}');

    expect(onEdit).toHaveBeenCalledWith({
      taskId: 't1',
      version: 2,
      name: 'Excavate',
    });
  });

  it('commits duration on blur', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <TaskGrid
        tasks={[task({ id: 't1', name: 'Dig', durationMinutes: 480, version: 4 })]}
        highlightedTaskId={null}
        onEdit={onEdit}
      />,
    );

    await user.click(screen.getByRole('button', { name: '480' }));
    const input = screen.getByLabelText(/edit duration/i);
    await user.clear(input);
    await user.type(input, '960');
    await user.tab();

    expect(onEdit).toHaveBeenCalledWith({
      taskId: 't1',
      version: 4,
      durationMinutes: 960,
    });
  });

  it('renders nested rows in pre-order WBS order (child after parent despite sortOrder collision)', () => {
    const onEdit = vi.fn();
    const nested = [
      task({
        id: 'c2',
        name: 'Child of B',
        parentId: 'r2',
        wbsPath: '2.1',
        wbsCode: '2.1',
        sortOrder: 0,
        isCritical: false,
      }),
      task({
        id: 'r1',
        name: 'Root A',
        parentId: null,
        wbsPath: '1',
        wbsCode: '1',
        sortOrder: 0,
        isCritical: false,
      }),
      task({
        id: 'r2',
        name: 'Root B',
        parentId: null,
        wbsPath: '2',
        wbsCode: '2',
        sortOrder: 1,
        isCritical: false,
      }),
      task({
        id: 's10',
        name: 'Tenth under A',
        parentId: 'r1',
        wbsPath: '1.10',
        wbsCode: '1.10',
        sortOrder: 9,
        isCritical: false,
      }),
      task({
        id: 's9',
        name: 'Ninth under A',
        parentId: 'r1',
        wbsPath: '1.9',
        wbsCode: '1.9',
        sortOrder: 8,
        isCritical: false,
      }),
    ];

    render(<TaskGrid tasks={nested} highlightedTaskId={null} onEdit={onEdit} />);

    const rows = screen.getAllByRole('row').slice(1); // skip header
    expect(rows.map((row) => row.getAttribute('data-task-id'))).toEqual([
      'r1',
      's9',
      's10',
      'r2',
      'c2',
    ]);
  });
});

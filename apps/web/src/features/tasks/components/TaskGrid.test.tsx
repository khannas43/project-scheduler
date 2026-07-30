import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { DependencyRow, TaskRow } from '../types.js';
import { dateInputToConstraintIso, isoToDateInputValue } from './DateCell.js';
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
    storyPoints: null,
    sprintId: null,
    boardColumnId: null,
    backlogRank: null,
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

    render(
      <TaskGrid
        tasks={rows}
        highlightedTaskId={null}
        collapsedIds={new Set()}
        onToggleCollapse={vi.fn()}
        onEdit={onEdit}
      />,
    );

    expect(screen.getByRole('columnheader', { name: /wbs/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /start date/i })).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: /critical for/i })).getByRole('button', {
        name: /^yes$/i,
      }),
    ).toHaveAttribute('aria-pressed', 'true');

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

  it('commits predecessors from WBS codes on blur', async () => {
    const user = userEvent.setup();
    const onSetPredecessors = vi.fn();
    const pred = task({ id: 't0', name: 'Site', wbsCode: '1', wbsPath: '1', sortOrder: 0 });
    const succ = task({
      id: 't1',
      name: 'Dig',
      wbsCode: '2',
      wbsPath: '2',
      sortOrder: 1,
      durationMinutes: 480,
      version: 4,
    });
    const deps: DependencyRow[] = [];

    render(
      <TaskGrid
        tasks={[pred, succ]}
        dependencies={deps}
        highlightedTaskId={null}
        collapsedIds={new Set()}
        onToggleCollapse={vi.fn()}
        onEdit={vi.fn()}
        onSetPredecessors={onSetPredecessors}
      />,
    );

    expect(screen.getByRole('columnheader', { name: /predecessors/i })).toBeInTheDocument();
    const cells = screen.getAllByRole('button', { name: '—' });
    // Duration and predecessors both show — for Dig; click the last empty edit trigger in Dig's row.
    await user.click(cells[cells.length - 1]!);
    const input = screen.getByLabelText(/edit predecessors for 2/i);
    await user.clear(input);
    await user.type(input, '1');
    await user.tab();

    expect(onSetPredecessors).toHaveBeenCalledWith('t1', ['t0']);
  });

  it('commits a start-date edit as an MSO constraint (same path as Gantt drag-move)', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <TaskGrid
        tasks={[
          task({
            id: 't1',
            name: 'Dig',
            version: 5,
            earlyStart: '2026-01-05T09:00:00.000Z',
            earlyFinish: '2026-01-05T17:00:00.000Z',
          }),
        ]}
        highlightedTaskId={null}
        collapsedIds={new Set()}
        onToggleCollapse={vi.fn()}
        onEdit={onEdit}
      />,
    );

    await user.click(screen.getByLabelText(/edit start date/i));
    await user.click(screen.getByRole('button', { name: '2026-01-07' }));

    expect(onEdit).toHaveBeenCalledWith({
      taskId: 't1',
      version: 5,
      constraintType: 'mso',
      constraintDate: '2026-01-07T09:00:00.000Z',
    });
  });

  it('commits a finish-date edit as an MFO constraint', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <TaskGrid
        tasks={[
          task({
            id: 't1',
            name: 'Dig',
            version: 5,
            earlyStart: '2026-01-05T09:00:00.000Z',
            earlyFinish: '2026-01-05T17:00:00.000Z',
          }),
        ]}
        highlightedTaskId={null}
        collapsedIds={new Set()}
        onToggleCollapse={vi.fn()}
        onEdit={onEdit}
      />,
    );

    await user.click(screen.getByLabelText(/edit finish date/i));
    await user.click(screen.getByRole('button', { name: '2026-01-08' }));

    expect(onEdit).toHaveBeenCalledWith({
      taskId: 't1',
      version: 5,
      constraintType: 'mfo',
      constraintDate: '2026-01-08T17:00:00.000Z',
    });
  });

  it('date helpers map UTC calendar days for the date input', () => {
    expect(isoToDateInputValue('2026-01-05T09:00:00.000Z')).toBe('2026-01-05');
    expect(dateInputToConstraintIso('2026-01-07', '2026-01-05T09:00:00.000Z', 9 * 60)).toBe(
      '2026-01-07T09:00:00.000Z',
    );
  });

  it('exposes Reset columns to restore the default header order', async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      'project-scheduler.task-grid-column-order',
      JSON.stringify(['name', 'wbsCode']),
    );

    render(
      <TaskGrid
        tasks={[task({ id: 't1', name: 'Dig' })]}
        highlightedTaskId={null}
        collapsedIds={new Set()}
        onToggleCollapse={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    const headers = () =>
      screen.getAllByRole('columnheader').map((h) => h.textContent?.trim() ?? '');
    expect(headers()[0]).toMatch(/name/i);

    await user.click(screen.getByRole('button', { name: /reset columns/i }));
    expect(headers()[0]).toMatch(/wbs/i);
  });

  it('commits duration in working days (converted to minutes) on blur', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <TaskGrid
        tasks={[task({ id: 't1', name: 'Dig', durationMinutes: 480, version: 4 })]}
        highlightedTaskId={null}
        collapsedIds={new Set()}
        onToggleCollapse={vi.fn()}
        onEdit={onEdit}
      />,
    );

    expect(screen.getByRole('columnheader', { name: /duration \(days\)/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '1' }));
    const input = screen.getByLabelText(/edit duration/i);
    await user.clear(input);
    await user.type(input, '2');
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

    render(
      <TaskGrid
        tasks={nested}
        highlightedTaskId={null}
        collapsedIds={new Set()}
        onToggleCollapse={vi.fn()}
        onEdit={onEdit}
      />,
    );

    const rows = screen.getAllByRole('row').slice(1); // skip header
    expect(rows.map((row) => row.getAttribute('data-task-id'))).toEqual([
      'r1',
      's9',
      's10',
      'r2',
      'c2',
    ]);
  });

  it('toggles critical override via the Critical Yes/No control', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <TaskGrid
        tasks={[task({ id: 't1', name: 'Dig', version: 7, isCritical: false })]}
        highlightedTaskId={null}
        collapsedIds={new Set()}
        onToggleCollapse={vi.fn()}
        onEdit={onEdit}
      />,
    );

    await user.click(
      within(screen.getByRole('group', { name: /critical for 1/i })).getByRole('button', {
        name: /^yes$/i,
      }),
    );
    expect(onEdit).toHaveBeenCalledWith({
      taskId: 't1',
      version: 7,
      criticalOverride: true,
    });
  });

  it('marks a task as a milestone via Yes/No and zeros duration', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <TaskGrid
        tasks={[
          task({
            id: 't1',
            name: 'Dig',
            version: 7,
            isMilestone: false,
            durationMinutes: 480,
          }),
        ]}
        highlightedTaskId={null}
        collapsedIds={new Set()}
        onToggleCollapse={vi.fn()}
        onEdit={onEdit}
      />,
    );

    await user.click(
      within(screen.getByRole('group', { name: /milestone for 1/i })).getByRole('button', {
        name: /^yes$/i,
      }),
    );
    expect(onEdit).toHaveBeenCalledWith({
      taskId: 't1',
      version: 7,
      isMilestone: true,
      durationMinutes: 0,
    });
  });

  it('unmarks a milestone via Yes/No and restores a working-day duration', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <TaskGrid
        tasks={[
          task({
            id: 't1',
            name: 'Kickoff',
            version: 7,
            isMilestone: true,
            durationMinutes: 0,
          }),
        ]}
        highlightedTaskId={null}
        collapsedIds={new Set()}
        onToggleCollapse={vi.fn()}
        onEdit={onEdit}
      />,
    );

    await user.click(
      within(screen.getByRole('group', { name: /milestone for 1/i })).getByRole('button', {
        name: /^no$/i,
      }),
    );
    expect(onEdit).toHaveBeenCalledWith({
      taskId: 't1',
      version: 7,
      isMilestone: false,
      durationMinutes: 480,
    });
  });

  it('calls onDeleteTask from the row Delete action', async () => {
    const user = userEvent.setup();
    const onDeleteTask = vi.fn();
    const row = task({ id: 't1', name: 'Dig', wbsCode: '1.2' });
    render(
      <TaskGrid
        tasks={[row]}
        highlightedTaskId={null}
        collapsedIds={new Set()}
        onToggleCollapse={vi.fn()}
        onDeleteTask={onDeleteTask}
        onEdit={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /delete 1\.2/i }));
    expect(onDeleteTask).toHaveBeenCalledWith(row);
  });

  it('collapses WBS children when a parent group is toggled', async () => {
    const user = userEvent.setup();
    const onToggleCollapse = vi.fn();
    const parent = task({
      id: 'r1',
      name: 'Root A',
      wbsPath: '1',
      wbsCode: '1',
      isSummary: true,
    });
    const child = task({
      id: 'c1',
      name: 'Child',
      parentId: 'r1',
      wbsPath: '1.1',
      wbsCode: '1.1',
    });

    const { rerender } = render(
      <TaskGrid
        tasks={[parent, child]}
        highlightedTaskId={null}
        collapsedIds={new Set()}
        onToggleCollapse={onToggleCollapse}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.getByText('Child')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /collapse 1/i }));
    expect(onToggleCollapse).toHaveBeenCalledWith('r1');

    rerender(
      <TaskGrid
        tasks={[parent, child]}
        highlightedTaskId={null}
        collapsedIds={new Set(['r1'])}
        onToggleCollapse={onToggleCollapse}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.queryByText('Child')).not.toBeInTheDocument();
    expect(screen.getByText('Root A')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /expand 1/i })).toBeInTheDocument();
  });

  it('confirms mode switch before committing schedulingMode', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <TaskGrid
        tasks={[task({ id: 't1', name: 'Dig', version: 5, schedulingMode: 'cpm' })]}
        highlightedTaskId={null}
        collapsedIds={new Set()}
        onToggleCollapse={vi.fn()}
        onEdit={onEdit}
      />,
    );

    expect(screen.getByRole('columnheader', { name: /mode/i })).toBeInTheDocument();
    const modeGroup = screen.getByRole('group', { name: /mode for/i });
    await user.click(within(modeGroup).getByRole('button', { name: /^agile$/i }));

    expect(screen.getByRole('dialog', { name: /switch to agile/i })).toBeInTheDocument();
    expect(screen.getByText('durationMinutes')).toBeInTheDocument();
    expect(onEdit).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /switch mode/i }));
    expect(onEdit).toHaveBeenCalledWith({
      taskId: 't1',
      version: 5,
      schedulingMode: 'agile',
    });
  });

  it('cancels mode switch without calling onEdit', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <TaskGrid
        tasks={[task({ id: 't1', name: 'Dig', version: 5, schedulingMode: 'agile' })]}
        highlightedTaskId={null}
        collapsedIds={new Set()}
        onToggleCollapse={vi.fn()}
        onEdit={onEdit}
      />,
    );

    const modeGroup = screen.getByRole('group', { name: /mode for/i });
    await user.click(within(modeGroup).getByRole('button', { name: /^cpm$/i }));
    expect(screen.getByRole('dialog', { name: /switch to cpm/i })).toBeInTheDocument();
    expect(screen.getByText('storyPoints')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('dialog', { name: /switch to cpm/i })).not.toBeInTheDocument();
    expect(onEdit).not.toHaveBeenCalled();
  });
});

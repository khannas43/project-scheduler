import { describe, expect, it } from 'vitest';

import {
  plannedPercentThroughStatusDate,
  proposePercentUpdates,
  proposeRescheduleIncomplete,
  proposeSetPercentUpdates,
  type ProgressTaskCandidate,
} from '../src/services/progressUpdateService.js';

function candidate(
  partial: Partial<ProgressTaskCandidate> & Pick<ProgressTaskCandidate, 'taskId' | 'taskName'>,
): ProgressTaskCandidate {
  return {
    isSummary: false,
    isMilestone: false,
    earlyStart: new Date('2026-08-10T09:00:00.000Z'),
    earlyFinish: new Date('2026-08-20T17:00:00.000Z'),
    percentComplete: 0,
    actualStart: null,
    actualFinish: null,
    constraintType: null,
    constraintDate: null,
    ...partial,
  };
}

describe('plannedPercentThroughStatusDate', () => {
  it('returns 0 before start, 100 after finish, and interpolates in between', () => {
    const start = new Date('2026-08-10T00:00:00.000Z');
    const finish = new Date('2026-08-20T00:00:00.000Z');
    expect(plannedPercentThroughStatusDate(start, finish, new Date('2026-08-05T00:00:00.000Z'), false)).toBe(
      0,
    );
    expect(plannedPercentThroughStatusDate(start, finish, new Date('2026-08-20T00:00:00.000Z'), false)).toBe(
      100,
    );
    expect(plannedPercentThroughStatusDate(start, finish, new Date('2026-08-15T00:00:00.000Z'), false)).toBe(
      50,
    );
  });

  it('treats milestones as 0/100 at the start instant', () => {
    const start = new Date('2026-08-10T09:00:00.000Z');
    expect(plannedPercentThroughStatusDate(start, start, new Date('2026-08-10T08:00:00.000Z'), true)).toBe(
      0,
    );
    expect(plannedPercentThroughStatusDate(start, start, new Date('2026-08-10T09:00:00.000Z'), true)).toBe(
      100,
    );
  });
});

describe('proposePercentUpdates', () => {
  it('only raises percent and never decreases existing progress', () => {
    const statusDate = new Date('2026-08-15T00:00:00.000Z');
    const changes = proposePercentUpdates(
      [
        candidate({
          taskId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          taskName: 'Behind',
          percentComplete: 10,
        }),
        candidate({
          taskId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          taskName: 'Ahead',
          percentComplete: 80,
        }),
      ],
      statusDate,
    );

    expect(changes).toHaveLength(1);
    expect(changes[0]?.taskName).toBe('Behind');
    expect(changes[0]?.toPercent).toBeGreaterThan(10);
    expect(changes[0]?.actualStart).toBeTruthy();
  });

  it('respects taskIds scope', () => {
    const statusDate = new Date('2026-08-20T00:00:00.000Z');
    const keep = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const skip = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const changes = proposePercentUpdates(
      [
        candidate({ taskId: keep, taskName: 'Keep' }),
        candidate({ taskId: skip, taskName: 'Skip' }),
      ],
      statusDate,
      { taskIds: [keep] },
    );
    expect(changes.map((c) => c.taskId)).toEqual([keep]);
  });
});

describe('proposeRescheduleIncomplete', () => {
  it('proposes SNET at status date for incomplete tasks that started earlier', () => {
    const statusDate = new Date('2026-08-18T00:00:00.000Z');
    const changes = proposeRescheduleIncomplete(
      [
        candidate({
          taskId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          taskName: 'In progress',
          percentComplete: 40,
          earlyStart: new Date('2026-08-10T09:00:00.000Z'),
        }),
        candidate({
          taskId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          taskName: 'Future',
          percentComplete: 0,
          earlyStart: new Date('2026-08-25T09:00:00.000Z'),
        }),
        candidate({
          taskId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          taskName: 'Done',
          percentComplete: 100,
          earlyStart: new Date('2026-08-01T09:00:00.000Z'),
        }),
      ],
      statusDate,
    );

    expect(changes).toHaveLength(1);
    expect(changes[0]?.taskName).toBe('In progress');
    expect(changes[0]?.constraintType).toBe('snet');
    expect(changes[0]?.constraintDate).toBe(statusDate.toISOString());
  });

  it('skips hard-constrained tasks', () => {
    const statusDate = new Date('2026-08-18T00:00:00.000Z');
    const changes = proposeRescheduleIncomplete(
      [
        candidate({
          taskId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          taskName: 'Pinned',
          constraintType: 'mso',
          percentComplete: 20,
          earlyStart: new Date('2026-08-10T09:00:00.000Z'),
        }),
      ],
      statusDate,
    );
    expect(changes).toEqual([]);
  });
});

describe('proposeSetPercentUpdates', () => {
  it('sets scoped tasks to an explicit percent including lowers', () => {
    const changes = proposeSetPercentUpdates(
      [
        candidate({
          taskId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          taskName: 'A',
          percentComplete: 80,
        }),
        candidate({
          taskId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          taskName: 'B',
          percentComplete: 10,
        }),
      ],
      50,
      { taskIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] },
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]?.toPercent).toBe(50);
    expect(changes[0]?.fromPercent).toBe(80);
  });
});

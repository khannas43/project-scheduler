import { describe, expect, it } from 'vitest';

import { WORKING_MINUTES_PER_DAY } from '../src/services/assignmentService.js';
import {
  proposeLevelingMoves,
  type LevelingCandidate,
} from '../src/services/levelingService.js';

function candidate(
  partial: Partial<LevelingCandidate> &
    Pick<LevelingCandidate, 'taskId' | 'taskName' | 'resourceId'>,
): LevelingCandidate {
  return {
    resourceName: 'Crew A',
    units: 1,
    earlyStart: new Date('2026-08-17T09:00:00.000Z'),
    earlyFinish: new Date('2026-08-19T17:00:00.000Z'),
    freeFloatMinutes: WORKING_MINUTES_PER_DAY * 3,
    totalFloatMinutes: WORKING_MINUTES_PER_DAY * 5,
    constraintType: null,
    constraintDate: null,
    isCritical: false,
    isSummary: false,
    isMilestone: false,
    schedulingMode: 'cpm',
    ...partial,
  };
}

describe('proposeLevelingMoves', () => {
  it('delays a non-critical task to relieve same-day overload', () => {
    const resourceId = '11111111-1111-4111-8111-111111111111';
    const candidates = [
      candidate({
        taskId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        taskName: 'A',
        resourceId,
        earlyStart: new Date('2026-08-17T09:00:00.000Z'),
        earlyFinish: new Date('2026-08-17T17:00:00.000Z'),
        freeFloatMinutes: 0,
        isCritical: true,
      }),
      candidate({
        taskId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        taskName: 'B',
        resourceId,
        earlyStart: new Date('2026-08-17T09:00:00.000Z'),
        earlyFinish: new Date('2026-08-17T17:00:00.000Z'),
        freeFloatMinutes: WORKING_MINUTES_PER_DAY * 2,
        isCritical: false,
      }),
    ];

    const { moves, remainingOverallocations } = proposeLevelingMoves(
      candidates,
      new Map([[resourceId, 1]]),
    );

    expect(moves.length).toBeGreaterThanOrEqual(1);
    expect(moves[0]?.taskId).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    expect(moves[0]?.constraintType).toBe('snet');
    expect(remainingOverallocations).toEqual([]);
  });

  it('skips hard-constrained and milestone tasks', () => {
    const resourceId = '11111111-1111-4111-8111-111111111111';
    const candidates = [
      candidate({
        taskId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        taskName: 'Pinned',
        resourceId,
        constraintType: 'mso',
        freeFloatMinutes: 9999,
      }),
      candidate({
        taskId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        taskName: 'Mile',
        resourceId,
        isMilestone: true,
        freeFloatMinutes: 9999,
      }),
    ];

    const { moves } = proposeLevelingMoves(candidates, new Map([[resourceId, 0.5]]));
    expect(moves).toEqual([]);
  });

  it('only delays tasks in taskIds while still counting others toward load', () => {
    const resourceId = '11111111-1111-4111-8111-111111111111';
    const taskA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const taskB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const taskC = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const candidates = [
      candidate({
        taskId: taskA,
        taskName: 'A',
        resourceId,
        earlyStart: new Date('2026-08-17T09:00:00.000Z'),
        earlyFinish: new Date('2026-08-17T17:00:00.000Z'),
        freeFloatMinutes: WORKING_MINUTES_PER_DAY * 3,
        isCritical: false,
      }),
      candidate({
        taskId: taskB,
        taskName: 'B',
        resourceId,
        earlyStart: new Date('2026-08-17T09:00:00.000Z'),
        earlyFinish: new Date('2026-08-17T17:00:00.000Z'),
        freeFloatMinutes: WORKING_MINUTES_PER_DAY * 4,
        isCritical: false,
      }),
      candidate({
        taskId: taskC,
        taskName: 'C',
        resourceId,
        earlyStart: new Date('2026-08-17T09:00:00.000Z'),
        earlyFinish: new Date('2026-08-17T17:00:00.000Z'),
        freeFloatMinutes: WORKING_MINUTES_PER_DAY * 5,
        isCritical: false,
      }),
    ];

    const { moves } = proposeLevelingMoves(candidates, new Map([[resourceId, 1]]), {
      taskIds: [taskB],
    });

    expect(moves.length).toBeGreaterThanOrEqual(1);
    expect(moves.every((m) => m.taskId === taskB)).toBe(true);
  });
});

import { SchedulingError } from '@pkg/scheduler';
import { describe, expect, it } from 'vitest';

import {
  ConflictError,
  SchedulingConflictError,
} from '../src/middleware/errors.js';
import {
  assertGraphValid,
  computedFieldsEqual,
  mapSchedulingError,
  percentCompleteWritebackValue,
  toDependencyInputs,
  toTaskInputs,
} from '../src/services/scheduleRunner.js';

describe('version-conflict ConflictError (§9.1)', () => {
  it('carries the current server-side row for the 409 body', () => {
    const current = { id: 't1', version: 7, name: 'Pour foundation' };
    const err = new ConflictError('Task version conflict', current);
    expect(err.status).toBe(409);
    expect(err.code).toBe('conflict');
    expect(err.current).toEqual(current);
  });
});

describe('cycle-rejection SchedulingConflictError', () => {
  it('mapSchedulingError turns SchedulingError into a 409 with taskIds', () => {
    try {
      mapSchedulingError(new SchedulingError('Cycle detected', ['a' as never, 'b' as never]));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(SchedulingConflictError);
      const sc = error as SchedulingConflictError;
      expect(sc.status).toBe(409);
      expect(sc.code).toBe('scheduling_conflict');
      expect(sc.taskIds).toEqual(['a', 'b']);
    }
  });

  it('assertGraphValid rejects a self-cycle via FS A→B→A', () => {
    const cal = '11111111-1111-4111-8111-111111111111';
    const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    const taskRows = [
      {
        id: a,
        projectId: 'p',
        parentId: null,
        wbsPath: '1',
        wbsCode: '1',
        sortOrder: 0,
        name: 'A',
        notes: null,
        isMilestone: false,
        isSummary: false,
        schedulingMode: 'cpm',
        durationMinutes: 60,
        taskType: null,
        isEffortDriven: true,
        isManuallyScheduled: false,
        constraintType: null,
        constraintDate: null,
        deadline: null,
        calendarId: cal,
        earlyStart: null,
        earlyFinish: null,
        lateStart: null,
        lateFinish: null,
        totalFloatMinutes: null,
        freeFloatMinutes: null,
        isCritical: false,
        criticalOverride: null,
        percentComplete: null,
        actualStart: null,
        actualFinish: null,
        actualDurationMinutes: null,
        remainingDurationMinutes: null,
        storyPoints: null,
        sprintId: null,
        boardColumnId: null,
        backlogRank: null,
        version: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: b,
        projectId: 'p',
        parentId: null,
        wbsPath: '2',
        wbsCode: '2',
        sortOrder: 1,
        name: 'B',
        notes: null,
        isMilestone: false,
        isSummary: false,
        schedulingMode: 'cpm',
        durationMinutes: 60,
        taskType: null,
        isEffortDriven: true,
        isManuallyScheduled: false,
        constraintType: null,
        constraintDate: null,
        deadline: null,
        calendarId: cal,
        earlyStart: null,
        earlyFinish: null,
        lateStart: null,
        lateFinish: null,
        totalFloatMinutes: null,
        freeFloatMinutes: null,
        isCritical: false,
        criticalOverride: null,
        percentComplete: null,
        actualStart: null,
        actualFinish: null,
        actualDurationMinutes: null,
        remainingDurationMinutes: null,
        storyPoints: null,
        sprintId: null,
        boardColumnId: null,
        backlogRank: null,
        version: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const deps = [
      {
        id: 'd1',
        predecessorId: a,
        successorId: b,
        linkType: 'FS',
        lagMinutes: 0,
        lagPercent: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'd2',
        predecessorId: b,
        successorId: a,
        linkType: 'FS',
        lagMinutes: 0,
        lagPercent: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    expect(() => assertGraphValid(taskRows, deps, cal)).toThrow(SchedulingConflictError);

    // Sanity: the converters produce the shapes validateGraph expects.
    expect(toTaskInputs(taskRows, cal)).toHaveLength(2);
    expect(toDependencyInputs(deps)).toHaveLength(2);
  });
});

describe('toDependencyInputs lagPercent conversion', () => {
  it('converts a numeric() string lagPercent row into a JS number', () => {
    const [dep] = toDependencyInputs([
      {
        id: 'd1',
        predecessorId: 'a',
        successorId: 'b',
        linkType: 'FS',
        lagMinutes: 0,
        lagPercent: '50',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    expect(dep!.lagPercent).toBe(50);
    expect(typeof dep!.lagPercent).toBe('number');
  });

  it('passes through a null lagPercent unchanged', () => {
    const [dep] = toDependencyInputs([
      {
        id: 'd1',
        predecessorId: 'a',
        successorId: 'b',
        linkType: 'FS',
        lagMinutes: 0,
        lagPercent: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    expect(dep!.lagPercent).toBeNull();
  });
});

describe('toTaskInputs percentComplete', () => {
  it('Number()s the numeric() column string for the engine', () => {
    const cal = '11111111-1111-4111-8111-111111111111';
    const [input] = toTaskInputs(
      [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          projectId: 'p',
          parentId: null,
          wbsPath: '1',
          wbsCode: '1',
          sortOrder: 0,
          name: 'A',
          notes: null,
          isMilestone: false,
          isSummary: false,
          schedulingMode: 'cpm',
          durationMinutes: 60,
          taskType: null,
          isEffortDriven: true,
          isManuallyScheduled: false,
          constraintType: null,
          constraintDate: null,
          deadline: null,
          calendarId: cal,
          earlyStart: null,
          earlyFinish: null,
          lateStart: null,
          lateFinish: null,
          totalFloatMinutes: null,
          freeFloatMinutes: null,
          isCritical: false,
          criticalOverride: null,
          percentComplete: '42.50',
          actualStart: null,
          actualFinish: null,
          actualDurationMinutes: null,
          remainingDurationMinutes: null,
          storyPoints: null,
          sprintId: null,
          boardColumnId: null,
          backlogRank: null,
          version: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      cal,
    );
    expect(input!.percentComplete).toBe(42.5);
  });
});

describe('percentCompleteWritebackValue (leaf vs summary)', () => {
  it('omits percentComplete for leaves so reschedule never clobbers a direct edit', () => {
    expect(percentCompleteWritebackValue(false, 75)).toBeUndefined();
    expect(percentCompleteWritebackValue(false, null)).toBeUndefined();
  });

  it('persists the engine value for summaries (including null)', () => {
    expect(percentCompleteWritebackValue(true, 25)).toBe('25');
    expect(percentCompleteWritebackValue(true, null)).toBeNull();
  });
});

describe('computedFieldsEqual (affected-set filter)', () => {
  it('treats identical snapshots as unchanged', () => {
    const snap = {
      earlyStart: new Date('2026-01-01T09:00:00Z'),
      earlyFinish: new Date('2026-01-01T17:00:00Z'),
      lateStart: null,
      lateFinish: null,
      totalFloatMinutes: null,
      freeFloatMinutes: null,
      isCritical: true,
    };
    expect(computedFieldsEqual(snap, { ...snap })).toBe(true);
  });

  it('detects a float change', () => {
    const a = {
      earlyStart: null,
      earlyFinish: null,
      lateStart: null,
      lateFinish: null,
      totalFloatMinutes: 0,
      freeFloatMinutes: 0,
      isCritical: true,
    };
    expect(computedFieldsEqual(a, { ...a, totalFloatMinutes: 60, isCritical: false })).toBe(false);
  });
});

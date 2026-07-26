import { describe, expect, it } from 'vitest';

import {
  buildCostOverviewFromRows,
  compareDateAscNullsLast,
  computeOverallPercentComplete,
  deadlineMissesFromRows,
  mergeSlippingTasks,
  type SlippingTaskReportRow,
} from '../src/services/builtinReportsService.js';
import type { TaskReportRow } from '../src/services/reportDataService.js';

function row(partial: Partial<TaskReportRow> & Pick<TaskReportRow, 'id' | 'name'>): TaskReportRow {
  return {
    wbsCode: '1',
    isSummary: false,
    isMilestone: false,
    earlyStart: null,
    earlyFinish: null,
    deadline: null,
    durationMinutes: 480,
    percentComplete: 0,
    isCritical: false,
    totalFloatMinutes: 0,
    resourceNames: '',
    cost: null,
    ...partial,
  };
}

describe('computeOverallPercentComplete', () => {
  it('returns null when there are no root tasks', () => {
    expect(computeOverallPercentComplete([])).toBeNull();
  });

  it('returns null when total root duration is 0', () => {
    expect(
      computeOverallPercentComplete([
        { percentComplete: '50', durationMinutes: 0 },
        { percentComplete: '100', durationMinutes: null },
      ]),
    ).toBeNull();
  });

  it('computes the duration-weighted average (null pct treated as 0)', () => {
    // (50*480 + 0*240) / (480+240) = 24000/720 = 33.333…
    expect(
      computeOverallPercentComplete([
        { percentComplete: '50', durationMinutes: 480 },
        { percentComplete: null, durationMinutes: 240 },
      ]),
    ).toBeCloseTo(33.333333, 5);
  });
});

describe('buildCostOverviewFromRows', () => {
  it('sums non-null costs and counts unassigned (null) separately from zero-cost', () => {
    const result = buildCostOverviewFromRows([
      row({ id: 'a', name: 'A', cost: 100, isSummary: false }),
      row({ id: 'b', name: 'B', cost: null, isSummary: false }),
      row({ id: 'c', name: 'C', cost: 0, isSummary: false }),
      row({ id: 'sum', name: 'Summary', cost: 999, isSummary: true }),
    ]);

    expect(result.totalCost).toBe(100);
    expect(result.unassignedTaskCount).toBe(1);
    expect(result.rows.map((r) => r.name)).toEqual(['A', 'C', 'B']);
    expect(result.rows.find((r) => r.name === 'Summary')).toBeUndefined();
  });
});

describe('mergeSlippingTasks', () => {
  it('unions reasons and takes max variance when a task trips both signals', () => {
    const deadline: SlippingTaskReportRow[] = [
      {
        taskId: 't1',
        wbsCode: '1',
        name: 'Pour',
        reasons: ['deadline_missed'],
        varianceMinutes: 120,
      },
    ];
    const baseline: SlippingTaskReportRow[] = [
      {
        taskId: 't1',
        wbsCode: '1',
        name: 'Pour',
        reasons: ['behind_baseline'],
        varianceMinutes: 480,
      },
      {
        taskId: 't2',
        wbsCode: '2',
        name: 'Cure',
        reasons: ['behind_baseline'],
        varianceMinutes: 60,
      },
    ];

    const merged = mergeSlippingTasks(deadline, baseline);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({
      taskId: 't1',
      varianceMinutes: 480,
      reasons: expect.arrayContaining(['deadline_missed', 'behind_baseline']),
    });
    expect(merged[0]!.reasons).toHaveLength(2);
    expect(merged[1]!.taskId).toBe('t2');
  });

  it('builds deadline_missed rows from report data', () => {
    const misses = deadlineMissesFromRows([
      row({
        id: 'late',
        name: 'Late',
        deadline: new Date('2026-01-10T17:00:00.000Z'),
        earlyFinish: new Date('2026-01-10T19:00:00.000Z'),
      }),
      row({
        id: 'ok',
        name: 'On time',
        deadline: new Date('2026-01-10T17:00:00.000Z'),
        earlyFinish: new Date('2026-01-10T17:00:00.000Z'),
      }),
    ]);
    expect(misses).toHaveLength(1);
    expect(misses[0]).toMatchObject({
      taskId: 'late',
      reasons: ['deadline_missed'],
      varianceMinutes: 120,
    });
  });
});

describe('milestone sort — null earlyFinish last', () => {
  it('orders dated milestones before undated ones', () => {
    const a = new Date('2026-02-01T00:00:00.000Z');
    const b = new Date('2026-01-01T00:00:00.000Z');
    const dates = [null, a, b];
    dates.sort(compareDateAscNullsLast);
    expect(dates).toEqual([b, a, null]);
  });
});

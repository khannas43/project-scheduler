import { describe, expect, it } from 'vitest';

import type { ProjectSummaryReport } from '../src/services/builtinReportsService.js';
import {
  computeProgressBreakdown,
  computeProjectHealth,
  selectNearCritical,
  selectPhaseProgress,
  selectTopInProgress,
} from '../src/services/dashboardService.js';
import type { TaskReportRow } from '../src/services/reportDataService.js';

function cost(
  partial: Partial<NonNullable<ProjectSummaryReport['cost']>> = {},
): NonNullable<ProjectSummaryReport['cost']> {
  return {
    baselineId: '11111111-1111-4111-8111-111111111111',
    bac: 1000,
    pv: 500,
    ev: 500,
    ac: 500,
    spi: 1,
    cpi: 1,
    ...partial,
  };
}

function row(partial: Partial<TaskReportRow> & Pick<TaskReportRow, 'id' | 'name'>): TaskReportRow {
  return {
    wbsCode: null,
    isSummary: false,
    isMilestone: false,
    earlyStart: null,
    earlyFinish: null,
    deadline: null,
    durationMinutes: 480,
    percentComplete: 0,
    isCritical: false,
    totalFloatMinutes: 960,
    resourceNames: '',
    cost: null,
    ...partial,
  };
}

describe('computeProjectHealth', () => {
  it('returns no_baseline when cost is null', () => {
    expect(computeProjectHealth(null)).toBe('no_baseline');
  });

  it('returns unknown when both spi and cpi are null', () => {
    expect(computeProjectHealth(cost({ spi: null, cpi: null }))).toBe('unknown');
  });

  it('returns behind when the worse metric is under 0.9', () => {
    expect(computeProjectHealth(cost({ spi: 0.85, cpi: 1.1 }))).toBe('behind');
  });

  it('returns at_risk when the worse metric is under 1.0 (worse metric governs)', () => {
    expect(computeProjectHealth(cost({ spi: 1.02, cpi: 0.95 }))).toBe('at_risk');
  });

  it('returns on_track when both available metrics are at least 1.0', () => {
    expect(computeProjectHealth(cost({ spi: 1.1, cpi: 1.05 }))).toBe('on_track');
  });
});

describe('dashboard derivations', () => {
  const sample: TaskReportRow[] = [
    row({ id: '1', name: 'Phase', wbsCode: '1', isSummary: true, percentComplete: 40 }),
    row({ id: '2', name: 'Done leaf', wbsCode: '1.1', percentComplete: 100 }),
    row({
      id: '3',
      name: 'Active A',
      wbsCode: '1.2',
      percentComplete: 70,
      isCritical: true,
      totalFloatMinutes: 0,
    }),
    row({ id: '4', name: 'Active B', wbsCode: '1.3', percentComplete: 20, totalFloatMinutes: 240 }),
    row({ id: '5', name: 'Not started', wbsCode: '1.4', percentComplete: 0 }),
    row({ id: '6', name: 'Milestone', wbsCode: '1.5', isMilestone: true, percentComplete: 0 }),
  ];

  it('computes progress breakdown for leaf tasks', () => {
    expect(computeProgressBreakdown(sample)).toEqual({
      notStarted: 1,
      inProgress: 2,
      completed: 1,
      milestone: 1,
    });
  });

  it('selects top in-progress by percent complete', () => {
    const top = selectTopInProgress(sample, 5);
    expect(top.map((t) => t.name)).toEqual(['Active A', 'Active B']);
  });

  it('selects near-critical by float', () => {
    const near = selectNearCritical(sample, 5);
    expect(near.map((t) => t.name)).toEqual(['Active A', 'Active B']);
  });

  it('selects root phase progress', () => {
    expect(selectPhaseProgress(sample).map((p) => p.name)).toEqual(['Phase']);
  });
});

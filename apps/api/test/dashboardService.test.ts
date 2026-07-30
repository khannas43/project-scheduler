import { describe, expect, it } from 'vitest';

import { computeProjectHealth } from '../src/services/dashboardService.js';
import type { ProjectSummaryReport } from '../src/services/builtinReportsService.js';

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

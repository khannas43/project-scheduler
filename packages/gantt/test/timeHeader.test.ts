import { describe, expect, it } from 'vitest';

import { MINUTES_PER_DAY } from '../src/constants.js';
import {
  dayIndexToUtcDate,
  formatTickLabel,
  tickStepDays,
} from '../src/layers/timeHeader.js';

describe('tickStepDays', () => {
  it('uses denser ticks when days are wide', () => {
    expect(tickStepDays(64)).toBe(1);
    expect(tickStepDays(24)).toBe(7);
    expect(tickStepDays(12)).toBe(7);
    expect(tickStepDays(6)).toBe(14);
    expect(tickStepDays(3)).toBe(30);
  });
});

describe('formatTickLabel', () => {
  const origin = Date.UTC(2026, 0, 1); // Thu Jan 1 2026

  it('shows weekday + day at day zoom', () => {
    expect(formatTickLabel(0, origin, 64)).toBe('Thu 1');
    expect(formatTickLabel(1, origin, 64)).toBe('Fri 2');
  });

  it('shows day-of-month when day columns are mid-width', () => {
    expect(formatTickLabel(0, origin, 30)).toBe('Jan 1');
    expect(formatTickLabel(4, origin, 30)).toBe('5');
  });

  it('shows month labels at coarse zoom', () => {
    expect(formatTickLabel(0, origin, 6)).toBe('Jan 2026');
  });
});

describe('dayIndexToUtcDate', () => {
  it('offsets whole calendar days from the origin', () => {
    const origin = Date.UTC(2026, 0, 1);
    expect(dayIndexToUtcDate(0, origin).toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(dayIndexToUtcDate(10, origin).toISOString()).toBe('2026-01-11T00:00:00.000Z');
    expect(MINUTES_PER_DAY).toBe(1440);
  });
});

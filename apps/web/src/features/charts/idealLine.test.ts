import { describe, expect, it } from 'vitest';

import {
  burndownIdealLine,
  burnupIdealLine,
  currentMarker,
  progressAlongSprint,
  rangePosition,
} from './idealLine.js';

describe('ideal-line math', () => {
  it('builds two-point burndown and burnup ideals', () => {
    expect(burndownIdealLine(13)).toEqual([
      { x: 0, y: 13 },
      { x: 1, y: 0 },
    ]);
    expect(burnupIdealLine(13)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 13 },
    ]);
  });

  it('classifies today relative to the sprint range', () => {
    const start = '2026-01-05T00:00:00.000Z';
    const end = '2026-01-19T00:00:00.000Z';
    expect(rangePosition('2026-01-01T12:00:00.000Z', start, end)).toBe('before');
    expect(rangePosition('2026-01-12T12:00:00.000Z', start, end)).toBe('in-range');
    expect(rangePosition('2026-01-25T12:00:00.000Z', start, end)).toBe('after');
  });

  it('computes fractional progress and clips out-of-range markers', () => {
    const start = '2026-01-05T00:00:00.000Z';
    const end = '2026-01-19T00:00:00.000Z'; // 14 days
    expect(progressAlongSprint('2026-01-12T00:00:00.000Z', start, end)).toBeCloseTo(0.5);
    expect(currentMarker('2026-01-12T00:00:00.000Z', start, end, 7)).toEqual({
      x: 0.5,
      y: 7,
    });
    expect(currentMarker('2026-01-01T00:00:00.000Z', start, end, 7)).toBeNull();
    expect(currentMarker('2026-01-25T00:00:00.000Z', start, end, 7)).toBeNull();
  });
});

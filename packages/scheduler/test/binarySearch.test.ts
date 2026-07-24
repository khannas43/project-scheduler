import { describe, expect, it } from 'vitest';

import { lowerBound, upperBound } from '../src/binarySearch.js';

const SORTED = Int32Array.from([10, 10, 20, 20, 20, 30]);

describe('lowerBound', () => {
  it('finds the first index >= target when target is present', () => {
    expect(lowerBound(SORTED, 20)).toBe(2);
  });

  it('finds the insertion point when target is absent', () => {
    expect(lowerBound(SORTED, 15)).toBe(2);
  });

  it('returns 0 when target is smaller than every element', () => {
    expect(lowerBound(SORTED, 0)).toBe(0);
  });

  it('returns the array length when target is larger than every element', () => {
    expect(lowerBound(SORTED, 100)).toBe(SORTED.length);
  });

  it('handles an empty array', () => {
    expect(lowerBound(new Int32Array(0), 5)).toBe(0);
  });
});

describe('upperBound', () => {
  it('finds the first index strictly > target when target is present (past the whole run of duplicates)', () => {
    expect(upperBound(SORTED, 20)).toBe(5);
  });

  it('finds the same insertion point as lowerBound when target is absent', () => {
    expect(upperBound(SORTED, 15)).toBe(2);
  });

  it('returns 0 when target is smaller than every element', () => {
    expect(upperBound(SORTED, 0)).toBe(0);
  });

  it('returns the array length when target is >= every element', () => {
    expect(upperBound(SORTED, 30)).toBe(SORTED.length);
  });

  it('handles an empty array', () => {
    expect(upperBound(new Int32Array(0), 5)).toBe(0);
  });
});

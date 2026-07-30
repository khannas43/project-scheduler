import { describe, expect, it } from 'vitest';

import { nextBacklogRank, rankBetween } from '../src/services/backlogRank.js';

describe('rankBetween / nextBacklogRank', () => {
  it('generates a first rank when both sides are null', () => {
    const rank = rankBetween(null, null);
    expect(typeof rank).toBe('string');
    expect(rank.length).toBeGreaterThan(0);
    expect(nextBacklogRank(null)).toBe(rank);
  });

  it('places a rank after the last (before=null)', () => {
    const afterLast = nextBacklogRank('a0');
    expect(afterLast > 'a0').toBe(true);
    expect(rankBetween('a0', null)).toBe(afterLast);
  });

  it('places a rank before the first (after=null neighbor is the current first)', () => {
    const beforeFirst = rankBetween(null, 'a0');
    expect(beforeFirst < 'a0').toBe(true);
  });

  it('places a rank lexicographically between two adjacent ranks', () => {
    const mid = rankBetween('a0', 'a1');
    expect(mid > 'a0').toBe(true);
    expect(mid < 'a1').toBe(true);
  });

  it('can force a longer key when squeezed between close neighbors', () => {
    // Repeatedly bisect until the generated key is longer than either neighbor.
    const lo = 'a0';
    let hi = 'a1';
    let mid = rankBetween(lo, hi);
    for (let i = 0; i < 20 && mid.length <= Math.max(lo.length, hi.length); i += 1) {
      hi = mid;
      mid = rankBetween(lo, hi);
    }
    expect(mid > lo).toBe(true);
    expect(mid < hi).toBe(true);
    expect(mid.length).toBeGreaterThan(Math.max(lo.length, hi.length));
  });
});

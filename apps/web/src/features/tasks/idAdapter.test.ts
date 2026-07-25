import { describe, expect, it } from 'vitest';

import { TaskIdAdapter } from './idAdapter.js';

/**
 * Source UUIDs in reverse / gapped *ordering* (not sequential by any natural key).
 * Mirrors packages/gantt/test/taskIndex.test.ts: proves lookup is map-based, not
 * "position in a sorted list coincides with numeric id".
 */
function gappedSourceOrder(): string[] {
  return [
    '00000000-0000-4000-8000-000000000300', // assigned numeric 0
    '00000000-0000-4000-8000-000000000100', // assigned numeric 1
    '00000000-0000-4000-8000-000000000200', // assigned numeric 2
  ];
}

describe('TaskIdAdapter', () => {
  it('round-trips uuid ↔ numeric for every entry', () => {
    const ids = gappedSourceOrder();
    const adapter = new TaskIdAdapter(ids);

    for (let i = 0; i < ids.length; i += 1) {
      const uuid = ids[i]!;
      expect(adapter.toNumeric(uuid)).toBe(i);
      expect(adapter.toUuid(i)).toBe(uuid);
    }
  });

  it('does not treat UUID suffix / source order as the numeric id', () => {
    const ids = gappedSourceOrder();
    const adapter = new TaskIdAdapter(ids);

    // Naïve approaches that would fail:
    // - numeric id === parseInt(last segment) → 300/100/200
    // - numeric id === index in lexicographic UUID order → different permutation
    expect(adapter.toNumeric(ids[0]!)).toBe(0);
    expect(adapter.toNumeric(ids[0]!)).not.toBe(300);
    expect(adapter.toUuid(1)).toBe(ids[1]);
    expect(adapter.toUuid(1)).not.toBe(ids[0]);

    // Lexicographic order would put ...100 before ...200 before ...300
    const lexFirst = [...ids].sort()[0]!;
    expect(lexFirst.endsWith('100')).toBe(true);
    expect(adapter.toNumeric(lexFirst)).toBe(1); // array index, not lex rank 0
    expect(adapter.toUuid(0)).toBe(ids[0]); // still the reverse-order head
  });

  it('returns undefined for unknown ids (no array-index fallback)', () => {
    const adapter = new TaskIdAdapter(gappedSourceOrder());
    expect(adapter.toNumeric('missing')).toBeUndefined();
    expect(adapter.toUuid(99)).toBeUndefined();
    // Size is 3 — numeric 3 is out of range even though arrays are 0-indexed
    expect(adapter.toUuid(3)).toBeUndefined();
  });
});

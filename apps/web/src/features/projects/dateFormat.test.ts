import { describe, expect, it } from 'vitest';

import { formatProjectDate, toDateInputValue } from './dateFormat.js';

describe('formatProjectDate', () => {
  const iso = '2026-07-24T09:30:00.000Z';

  it('formats ISO date-only by default', () => {
    expect(formatProjectDate(iso, { dateFormat: 'yyyy-mm-dd', dateTimeDisplay: 'date' })).toBe(
      '2026-07-24',
    );
  });

  it('formats dd-mmm-yyyy and datetime', () => {
    expect(formatProjectDate(iso, { dateFormat: 'dd-mmm-yyyy', dateTimeDisplay: 'date' })).toBe(
      '24-Jul-2026',
    );
    expect(formatProjectDate(iso, { dateFormat: 'yyyy-mm-dd', dateTimeDisplay: 'datetime' })).toBe(
      '2026-07-24 09:30',
    );
  });

  it('returns em dash for empty', () => {
    expect(formatProjectDate(null, null)).toBe('—');
  });
});

describe('toDateInputValue', () => {
  it('returns YYYY-MM-DD for date inputs', () => {
    expect(toDateInputValue('2026-07-24T09:30:00.000Z')).toBe('2026-07-24');
  });
});

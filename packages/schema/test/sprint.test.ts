import { describe, expect, it } from 'vitest';

import {
  SprintCreateInputSchema,
  SprintUpdateInputSchema,
} from '../src/sprint.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('SprintCreateInputSchema', () => {
  it('accepts a valid sprint', () => {
    const result = SprintCreateInputSchema.safeParse({
      projectId: PROJECT_ID,
      name: 'Sprint 1',
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-15T00:00:00.000Z',
      capacity: 40,
    });
    expect(result.success).toBe(true);
  });

  it('rejects endDate <= startDate', () => {
    const result = SprintCreateInputSchema.safeParse({
      projectId: PROJECT_ID,
      name: 'Sprint 1',
      startDate: '2026-01-15T00:00:00.000Z',
      endDate: '2026-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});

describe('SprintUpdateInputSchema', () => {
  it('requires version', () => {
    expect(SprintUpdateInputSchema.safeParse({ name: 'x' }).success).toBe(false);
  });

  it('validates dates only when both are present', () => {
    expect(
      SprintUpdateInputSchema.safeParse({
        version: 0,
        startDate: '2026-02-01T00:00:00.000Z',
      }).success,
    ).toBe(true);

    expect(
      SprintUpdateInputSchema.safeParse({
        version: 0,
        startDate: '2026-02-10T00:00:00.000Z',
        endDate: '2026-02-01T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('accepts planned/active state but rejects closed (must use close endpoint)', () => {
    expect(
      SprintUpdateInputSchema.safeParse({ version: 1, state: 'active' }).success,
    ).toBe(true);
    expect(
      SprintUpdateInputSchema.safeParse({ version: 1, state: 'closed' }).success,
    ).toBe(false);
  });
});

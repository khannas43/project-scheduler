import { describe, expect, it } from 'vitest';

import {
  ResourceCreateInputSchema,
  ResourceUpdateInputSchema,
} from '../src/resource.js';

const validCreate = {
  name: 'Alice',
  resourceType: 'work' as const,
};

describe('ResourceCreateInputSchema', () => {
  it('accepts a minimal work resource', () => {
    const result = ResourceCreateInputSchema.safeParse(validCreate);
    expect(result.success).toBe(true);
  });

  it('accepts numeric rate fields as JS numbers', () => {
    const result = ResourceCreateInputSchema.safeParse({
      ...validCreate,
      maxUnits: 1,
      standardRate: 75.5,
      overtimeRate: 100,
      costPerUse: 0,
      accrualType: 'prorated',
      email: 'alice@example.com',
      skills: ['concrete'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.standardRate).toBe(75.5);
      expect(typeof result.data.standardRate).toBe('number');
    }
  });

  it('rejects non-positive maxUnits', () => {
    expect(
      ResourceCreateInputSchema.safeParse({ ...validCreate, maxUnits: 0 }).success,
    ).toBe(false);
  });

  it('rejects unknown resourceType', () => {
    expect(
      ResourceCreateInputSchema.safeParse({ ...validCreate, resourceType: 'people' }).success,
    ).toBe(false);
  });
});

describe('ResourceUpdateInputSchema', () => {
  it('accepts a partial patch (no version)', () => {
    const result = ResourceUpdateInputSchema.safeParse({ name: 'Bob', standardRate: 80 });
    expect(result.success).toBe(true);
  });
});

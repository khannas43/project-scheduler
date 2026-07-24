import { describe, expect, it } from 'vitest';

import {
  DependencyCreateInputSchema,
  DependencyUpdateInputSchema,
} from '../src/dependency.js';

const PREDECESSOR_ID = '550e8400-e29b-41d4-a716-446655440000';
const SUCCESSOR_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

const validCreate = {
  predecessorId: PREDECESSOR_ID,
  successorId: SUCCESSOR_ID,
  linkType: 'FS' as const,
};

describe('DependencyCreateInputSchema', () => {
  it('accepts a minimal FS link', () => {
    const result = DependencyCreateInputSchema.safeParse(validCreate);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lagMinutes).toBe(0);
    }
  });

  it('accepts lagMinutes and lagPercent', () => {
    const result = DependencyCreateInputSchema.safeParse({
      ...validCreate,
      linkType: 'SS',
      lagMinutes: -480,
      lagPercent: 25,
    });
    expect(result.success).toBe(true);
  });

  it('accepts all four link types', () => {
    for (const linkType of ['FS', 'SS', 'FF', 'SF'] as const) {
      expect(
        DependencyCreateInputSchema.safeParse({ ...validCreate, linkType }).success,
      ).toBe(true);
    }
  });

  it('rejects an unknown linkType', () => {
    expect(
      DependencyCreateInputSchema.safeParse({
        ...validCreate,
        linkType: 'XX',
      }).success,
    ).toBe(false);
  });

  it('rejects a self-link (predecessorId === successorId) via refine (§3.4)', () => {
    const result = DependencyCreateInputSchema.safeParse({
      predecessorId: PREDECESSOR_ID,
      successorId: PREDECESSOR_ID,
      linkType: 'FS',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => /predecessor|successor|self|differ|same/i.test(m))).toBe(
        true,
      );
    }
  });

  it('rejects an invalid UUID', () => {
    expect(
      DependencyCreateInputSchema.safeParse({
        ...validCreate,
        predecessorId: 'not-a-uuid',
      }).success,
    ).toBe(false);
  });
});

describe('DependencyUpdateInputSchema', () => {
  it('requires version for optimistic locking (§9.1)', () => {
    expect(DependencyUpdateInputSchema.safeParse({ lagMinutes: 60 }).success).toBe(false);
  });

  it('accepts a partial patch with version', () => {
    const result = DependencyUpdateInputSchema.safeParse({
      version: 1,
      lagMinutes: 120,
      linkType: 'FF',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a self-link when both ids are present in the patch', () => {
    const result = DependencyUpdateInputSchema.safeParse({
      version: 1,
      predecessorId: PREDECESSOR_ID,
      successorId: PREDECESSOR_ID,
    });
    expect(result.success).toBe(false);
  });

  it('allows updating only successorId (self-check deferred when predecessor absent)', () => {
    expect(
      DependencyUpdateInputSchema.safeParse({
        version: 1,
        successorId: SUCCESSOR_ID,
      }).success,
    ).toBe(true);
  });
});

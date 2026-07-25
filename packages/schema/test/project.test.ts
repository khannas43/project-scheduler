import { describe, expect, it } from 'vitest';

import { ProjectCreateInputSchema, ProjectUpdateInputSchema } from '../src/project.js';

const CALENDAR_ID = '550e8400-e29b-41d4-a716-446655440000';
const OWNER_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

const validCreate = {
  name: 'Bridge retrofit',
  status: 'active',
  calendarId: CALENDAR_ID,
  ownerId: OWNER_ID,
};

describe('ProjectCreateInputSchema', () => {
  it('accepts a minimal valid create payload', () => {
    const result = ProjectCreateInputSchema.safeParse(validCreate);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Bridge retrofit');
      expect(result.data.calendarId).toBe(CALENDAR_ID);
    }
  });

  it('accepts optional description, startDate, and isArchived', () => {
    const result = ProjectCreateInputSchema.safeParse({
      ...validCreate,
      description: 'Phase 1',
      startDate: '2026-08-01T00:00:00Z',
      isArchived: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing name', () => {
    const rest = {
      status: validCreate.status,
      calendarId: validCreate.calendarId,
      ownerId: validCreate.ownerId,
    };
    expect(ProjectCreateInputSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an invalid calendarId UUID (bad version nibble)', () => {
    const result = ProjectCreateInputSchema.safeParse({
      ...validCreate,
      calendarId: '00000000-0000-0000-0000-000000000001',
    });
    expect(result.success).toBe(false);
  });

  it('strips finishDate by omission (§3.2 computed) rather than rejecting', () => {
    const result = ProjectCreateInputSchema.safeParse({
      ...validCreate,
      finishDate: '2026-12-31T00:00:00Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('finishDate');
    }
  });

  it('does not declare finishDate on the schema shape', () => {
    expect(ProjectCreateInputSchema.shape).not.toHaveProperty('finishDate');
  });
});

describe('ProjectUpdateInputSchema', () => {
  it('requires version for optimistic locking (§9.1)', () => {
    expect(ProjectUpdateInputSchema.safeParse({ name: 'Renamed' }).success).toBe(false);
  });

  it('accepts a partial patch with version', () => {
    const result = ProjectUpdateInputSchema.safeParse({ name: 'Renamed', version: 3 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe(3);
      expect(result.data.name).toBe('Renamed');
    }
  });

  it('accepts version-only (no other fields)', () => {
    expect(ProjectUpdateInputSchema.safeParse({ version: 0 }).success).toBe(true);
  });

  it('strips finishDate by omission on update too', () => {
    const result = ProjectUpdateInputSchema.safeParse({
      version: 1,
      finishDate: '2026-12-31T00:00:00Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('finishDate');
    }
  });

  it('accepts nullable statusDate on update', () => {
    const set = ProjectUpdateInputSchema.safeParse({
      version: 1,
      statusDate: '2026-08-14T00:00:00Z',
    });
    expect(set.success).toBe(true);
    if (set.success) expect(set.data.statusDate).toBe('2026-08-14T00:00:00Z');

    const clear = ProjectUpdateInputSchema.safeParse({ version: 2, statusDate: null });
    expect(clear.success).toBe(true);
    if (clear.success) expect(clear.data.statusDate).toBeNull();
  });
});

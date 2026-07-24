import { describe, expect, it } from 'vitest';

import { CalendarCreateInputSchema, CalendarUpdateInputSchema } from '../src/calendar.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';

const validCreate = {
  name: 'Standard Mon–Fri',
  workingDays: [1, 2, 3, 4, 5],
  hoursPerDay: 8,
  defaultStart: '09:00:00',
  defaultFinish: '17:00:00',
};

describe('CalendarCreateInputSchema', () => {
  it('accepts a global template (projectId null / omitted)', () => {
    const omitted = CalendarCreateInputSchema.safeParse(validCreate);
    expect(omitted.success).toBe(true);

    const explicitNull = CalendarCreateInputSchema.safeParse({
      ...validCreate,
      projectId: null,
    });
    expect(explicitNull.success).toBe(true);
  });

  it('accepts a project-scoped calendar', () => {
    const result = CalendarCreateInputSchema.safeParse({
      ...validCreate,
      projectId: PROJECT_ID,
    });
    expect(result.success).toBe(true);
  });

  it('accepts HH:MM time forms via z.iso.time()', () => {
    const result = CalendarCreateInputSchema.safeParse({
      ...validCreate,
      defaultStart: '09:00',
      defaultFinish: '17:00',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid time', () => {
    expect(
      CalendarCreateInputSchema.safeParse({
        ...validCreate,
        defaultStart: '9:00:00',
      }).success,
    ).toBe(false);
  });

  it('rejects a non-integer weekday', () => {
    expect(
      CalendarCreateInputSchema.safeParse({
        ...validCreate,
        workingDays: [1, 2.5, 3],
      }).success,
    ).toBe(false);
  });

  it('rejects a weekday outside 0–6', () => {
    expect(
      CalendarCreateInputSchema.safeParse({
        ...validCreate,
        workingDays: [1, 2, 7],
      }).success,
    ).toBe(false);
  });
});

describe('CalendarUpdateInputSchema', () => {
  it('accepts a partial patch without version (calendars have no version column)', () => {
    const result = CalendarUpdateInputSchema.safeParse({
      workingDays: [1, 2, 3, 4, 5, 6],
      hoursPerDay: 10,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a name-only rename', () => {
    expect(CalendarUpdateInputSchema.safeParse({ name: 'Renamed' }).success).toBe(true);
  });

  it('strips a stray version field by omission', () => {
    const result = CalendarUpdateInputSchema.safeParse({ name: 'Renamed', version: 2 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('version');
    }
  });
});

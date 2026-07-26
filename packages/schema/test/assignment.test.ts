import { describe, expect, it } from 'vitest';

import {
  AssignmentCreateInputSchema,
  AssignmentUpdateInputSchema,
  TimephasedDayUpdateInputSchema,
} from '../src/assignment.js';

const TASK_ID = '550e8400-e29b-41d4-a716-446655440000';
const RESOURCE_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

describe('AssignmentCreateInputSchema', () => {
  it('accepts taskId + resourceId without units', () => {
    const result = AssignmentCreateInputSchema.safeParse({
      taskId: TASK_ID,
      resourceId: RESOURCE_ID,
    });
    expect(result.success).toBe(true);
  });

  it('accepts positive units', () => {
    const result = AssignmentCreateInputSchema.safeParse({
      taskId: TASK_ID,
      resourceId: RESOURCE_ID,
      units: 0.5,
    });
    expect(result.success).toBe(true);
  });

  it('rejects zero/negative units', () => {
    expect(
      AssignmentCreateInputSchema.safeParse({
        taskId: TASK_ID,
        resourceId: RESOURCE_ID,
        units: 0,
      }).success,
    ).toBe(false);
  });
});

describe('AssignmentUpdateInputSchema', () => {
  it('accepts units only', () => {
    expect(AssignmentUpdateInputSchema.safeParse({ units: 1.25 }).success).toBe(true);
  });

  it('accepts workMinutes and cost', () => {
    expect(AssignmentUpdateInputSchema.safeParse({ workMinutes: 240 }).success).toBe(true);
    expect(AssignmentUpdateInputSchema.safeParse({ cost: 125.5 }).success).toBe(true);
    expect(AssignmentUpdateInputSchema.safeParse({ workMinutes: 240, cost: 100 }).success).toBe(
      true,
    );
  });

  it('rejects units and workMinutes together', () => {
    expect(
      AssignmentUpdateInputSchema.safeParse({ units: 1, workMinutes: 480 }).success,
    ).toBe(false);
  });

  it('accepts actualWorkMinutes / actualCost without units', () => {
    expect(
      AssignmentUpdateInputSchema.safeParse({ actualWorkMinutes: 120, actualCost: 50 }).success,
    ).toBe(true);
    expect(AssignmentUpdateInputSchema.safeParse({ actualCost: null }).success).toBe(true);
  });

  it('rejects empty object (at least one field required)', () => {
    expect(AssignmentUpdateInputSchema.safeParse({}).success).toBe(false);
  });

  it('rejects negative actualCost', () => {
    expect(AssignmentUpdateInputSchema.safeParse({ actualCost: -1 }).success).toBe(false);
  });
});

describe('TimephasedDayUpdateInputSchema', () => {
  it('accepts day units or planned minutes', () => {
    expect(
      TimephasedDayUpdateInputSchema.safeParse({ periodDate: '2026-01-05', units: 0.5 }).success,
    ).toBe(true);
    expect(
      TimephasedDayUpdateInputSchema.safeParse({
        periodDate: '2026-01-05',
        plannedWorkMinutes: 240,
      }).success,
    ).toBe(true);
    expect(
      TimephasedDayUpdateInputSchema.safeParse({ periodDate: '2026-01-05', units: 0 }).success,
    ).toBe(true);
  });

  it('rejects both fields or bad dates', () => {
    expect(
      TimephasedDayUpdateInputSchema.safeParse({
        periodDate: '2026-01-05',
        units: 1,
        plannedWorkMinutes: 480,
      }).success,
    ).toBe(false);
    expect(
      TimephasedDayUpdateInputSchema.safeParse({ periodDate: '01-05-2026', units: 1 }).success,
    ).toBe(false);
  });
});

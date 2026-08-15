import { describe, expect, it } from 'vitest';

import { UserCreateInputSchema } from '../src/user.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('UserCreateInputSchema', () => {
  it('accepts a create payload', () => {
    const result = UserCreateInputSchema.safeParse({
      projectId: PROJECT_ID,
      email: 'planner@example.gov.in',
      fullName: 'Asha Rao',
      password: 'secret123',
      createResource: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a short password', () => {
    expect(
      UserCreateInputSchema.safeParse({
        projectId: PROJECT_ID,
        email: 'planner@example.gov.in',
        fullName: 'Asha Rao',
        password: 'short',
      }).success,
    ).toBe(false);
  });
});

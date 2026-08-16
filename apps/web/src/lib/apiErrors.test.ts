import { describe, expect, it } from 'vitest';

import { ApiError } from './apiClient.js';
import { formatApiErrorMessage, formatValidationErrors } from './apiErrors.js';

describe('formatValidationErrors', () => {
  it('formats Fastify-style instancePath messages', () => {
    expect(
      formatValidationErrors([
        { instancePath: '/email', message: 'Invalid email' },
        { instancePath: '/password', message: 'Required' },
      ]),
    ).toBe('email: Invalid email; password: Required');
  });
});

describe('formatApiErrorMessage', () => {
  it('prefers validation fields for validation_error', () => {
    const err = new ApiError({
      status: 400,
      code: 'validation_error',
      detail: 'Request failed schema validation',
      errors: [{ instancePath: '/name', message: 'Required' }],
    });
    expect(formatApiErrorMessage(err)).toBe('name: Required');
  });

  it('uses detail for domain ApiError', () => {
    const err = new ApiError({
      status: 401,
      code: 'unauthorized',
      detail: 'Invalid email or password',
    });
    expect(formatApiErrorMessage(err)).toBe('Invalid email or password');
  });
});

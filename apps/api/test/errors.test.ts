import { describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import {
  AppError,
  BadRequestError,
  assertNoStackLeak,
  problemFromUnknownError,
} from '../src/middleware/errors.js';

describe('problemFromUnknownError', () => {
  it('maps AppError to problem+json fields', () => {
    const problem = problemFromUnknownError(new BadRequestError('bad input'));
    expect(problem).toMatchObject({
      status: 400,
      code: 'bad_request',
      detail: 'bad input',
    });
    assertNoStackLeak(problem);
  });

  it('never puts unexpected Error message or stack into 500 detail', () => {
    const err = new Error('SECRET_DB_PASSWORD=hunter2\n    at secretFn (/tmp/secret.ts:1:1)');
    const problem = problemFromUnknownError(err);
    expect(problem.status).toBe(500);
    expect(problem.detail).toBe('An unexpected error occurred');
    expect(problem.code).toBe('internal_server_error');
    expect(JSON.stringify(problem)).not.toContain('SECRET_DB');
    expect(JSON.stringify(problem)).not.toContain('secretFn');
    assertNoStackLeak(problem);
  });

  it('maps Fastify-style 4xx without leaking stack', () => {
    const err = Object.assign(new Error('Unexpected token'), {
      statusCode: 400,
      code: 'FST_ERR_CTP_INVALID_JSON_BODY',
      name: 'FastifyError',
      stack: 'Error: Unexpected token\n    at Parser.parse',
    });
    const problem = problemFromUnknownError(err);
    expect(problem.status).toBe(400);
    expect(problem.detail).toBe('Unexpected token');
    assertNoStackLeak(problem);
  });
});

describe.sequential('error handler integration', () => {
  it('returns 500 problem+json without stack for thrown Error', async () => {
    const app = await buildApp();
    try {
      app.get('/__test/boom', async () => {
        throw new Error('do-not-leak-this-stack-trace');
      });
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/__test/boom' });
      expect(res.statusCode).toBe(500);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      const body = res.json() as Record<string, unknown>;
      expect(body).toMatchObject({
        status: 500,
        code: 'internal_server_error',
        detail: 'An unexpected error occurred',
      });
      expect(body).not.toHaveProperty('stack');
      expect(JSON.stringify(body)).not.toContain('do-not-leak');
      assertNoStackLeak(body);
    } finally {
      await app.close();
    }
  });

  it('returns AppError detail for domain errors', async () => {
    const app = await buildApp();
    try {
      app.get('/__test/domain', async () => {
        throw new AppError('forbidden', 403, 'nope');
      });
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/__test/domain' });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({
        code: 'forbidden',
        detail: 'nope',
        status: 403,
      });
    } finally {
      await app.close();
    }
  });

  it('returns problem+json 404 for unknown routes', async () => {
    const app = await buildApp();
    try {
      await app.ready();
      const res = await app.inject({ method: 'GET', url: '/__no_such_route' });
      expect(res.statusCode).toBe(404);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(res.json()).toMatchObject({ code: 'not_found', status: 404 });
    } finally {
      await app.close();
    }
  });

  it('liveness is up without requiring DB semantics', async () => {
    const app = await buildApp();
    try {
      await app.ready();
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: 'ok', check: 'liveness' });
    } finally {
      await app.close();
    }
  });
});

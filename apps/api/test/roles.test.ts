import { describe, expect, it } from 'vitest';

import { signAccessToken } from '../src/lib/jwt.js';
import { buildApp } from '../src/app.js';

describe('role management routes', () => {
  it('GET /api/roles rejects unauthenticated requests with 401', async () => {
    const fastify = await buildApp();

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/roles?projectId=00000000-0000-4000-8000-000000000001',
    });

    expect(response.statusCode).toBe(401);
    await fastify.close();
  });

  it('GET /api/permissions rejects unauthenticated requests with 401', async () => {
    const fastify = await buildApp();

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/permissions?projectId=00000000-0000-4000-8000-000000000001',
    });

    expect(response.statusCode).toBe(401);
    await fastify.close();
  });

  it('POST /api/roles rejects unauthenticated requests with 401', async () => {
    const fastify = await buildApp();

    const response = await fastify.inject({
      method: 'POST',
      url: '/api/roles',
      payload: {
        projectId: '00000000-0000-4000-8000-000000000001',
        name: 'Custom',
        permissionKeys: ['project.view'],
      },
    });

    expect(response.statusCode).toBe(401);
    await fastify.close();
  });

  it('PATCH /api/roles/:id rejects unauthenticated requests with 401', async () => {
    const fastify = await buildApp();

    const response = await fastify.inject({
      method: 'PATCH',
      url: '/api/roles/00000000-0000-4000-8000-000000000002',
      payload: {
        projectId: '00000000-0000-4000-8000-000000000001',
        name: 'Renamed',
      },
    });

    expect(response.statusCode).toBe(401);
    await fastify.close();
  });

  it('authenticated GET /api/roles without projectId is 403 (fail closed)', async () => {
    const fastify = await buildApp();
    const token = await signAccessToken('00000000-0000-4000-8000-000000000099', 'admin@example.com');

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/roles',
      headers: { authorization: `Bearer ${token}` },
    });

    // Zod may 400 on missing querystring, or the guard 403s if query validation is skipped.
    // Either is fail-closed; prefer asserting not 200.
    expect([400, 403]).toContain(response.statusCode);
    await fastify.close();
  });

  it('authenticated POST /api/roles without projectId is rejected', async () => {
    const fastify = await buildApp();
    const token = await signAccessToken('00000000-0000-4000-8000-000000000099', 'admin@example.com');

    const response = await fastify.inject({
      method: 'POST',
      url: '/api/roles',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Custom',
        permissionKeys: ['project.view'],
      },
    });

    expect([400, 403]).toContain(response.statusCode);
    await fastify.close();
  });
});

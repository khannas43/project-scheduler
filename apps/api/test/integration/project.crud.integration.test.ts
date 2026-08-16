import { beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { seedIdentity } from './seedIdentity.js';

describe('project.crud integration', () => {
  let accessToken: string;

  beforeAll(async () => {
    const { adminEmail } = await seedIdentity();
    const app = await buildApp();
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: adminEmail, password: process.env.SEED_ADMIN_PASSWORD ?? 'change-me' },
    });
    expect(login.statusCode).toBe(200);
    accessToken = (login.json() as { accessToken: string }).accessToken;
    await app.close();
  }, 120_000);

  it('creates a project then lists and gets it', async () => {
    const app = await buildApp();
    const headers = { authorization: `Bearer ${accessToken}` };

    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers,
      payload: { name: 'Integration Project', status: 'active' },
    });
    expect(created.statusCode).toBe(201);
    const project = created.json() as { id: string; name: string };
    expect(project.name).toBe('Integration Project');

    const listed = await app.inject({ method: 'GET', url: '/api/projects', headers });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: project.id })]),
    );

    const got = await app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}`,
      headers,
    });
    expect(got.statusCode).toBe(200);
    expect(got.json()).toMatchObject({ id: project.id, name: 'Integration Project' });

    await app.close();
  });

  it('creates a task on the project', async () => {
    const app = await buildApp();
    const headers = { authorization: `Bearer ${accessToken}` };

    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers,
      payload: { name: 'Task Host', status: 'active' },
    });
    const projectId = (created.json() as { id: string }).id;

    const taskRes = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/tasks`,
      headers,
      payload: { name: 'First task', durationMinutes: 480 },
    });
    expect(taskRes.statusCode).toBe(201);
    expect(taskRes.json()).toMatchObject({ name: 'First task', projectId });

    const list = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/tasks`,
      headers,
    });
    expect(list.statusCode).toBe(200);
    const body = list.json() as { tasks: Array<{ name: string }> };
    expect(body.tasks).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'First task' })]),
    );

    await app.close();
  });
});

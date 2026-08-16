import { beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { env } from '../../src/env.js';
import { seedIdentity } from './seedIdentity.js';

describe('auth.login integration', () => {
  let adminEmail: string;

  beforeAll(async () => {
    const seeded = await seedIdentity();
    adminEmail = seeded.adminEmail;
  }, 120_000);

  it('logs in with seeded admin credentials', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: adminEmail, password: env.SEED_ADMIN_PASSWORD },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { accessToken: string; user: { email: string } };
    expect(body.accessToken).toBeTruthy();
    expect(body.user.email).toBe(adminEmail);
    expect(res.cookies.some((c) => c.name === 'refreshToken')).toBe(true);
    await app.close();
  });

  it('rejects bad password', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: adminEmail, password: 'wrong-password' },
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

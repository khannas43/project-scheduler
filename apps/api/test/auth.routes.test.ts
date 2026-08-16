import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UnauthorizedError } from '../src/middleware/errors.js';
import { buildTestApp } from './helpers/app.js';

vi.mock('../src/services/authService.js', () => ({
  login: vi.fn(),
  refresh: vi.fn(),
}));

const { login, refresh } = await import('../src/services/authService.js');

describe('auth routes', () => {
  beforeEach(() => {
    vi.mocked(login).mockReset();
    vi.mocked(refresh).mockReset();
  });

  it('POST /api/auth/login returns tokens and sets refresh cookie', async () => {
    vi.mocked(login).mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: {
        id: '00000000-0000-4000-8000-000000000099',
        email: 'admin@example.com',
        fullName: 'Admin',
      },
    });
    const app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'admin@example.com', password: 'change-me' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      accessToken: 'access-token',
      user: { email: 'admin@example.com', fullName: 'Admin' },
    });
    expect(res.cookies.some((c) => c.name === 'refreshToken' && c.value === 'refresh-token')).toBe(
      true,
    );
    expect(login).toHaveBeenCalledWith('admin@example.com', 'change-me');
    await app.close();
  });

  it('POST /api/auth/login maps UnauthorizedError to 401', async () => {
    vi.mocked(login).mockRejectedValue(new UnauthorizedError('Invalid email or password'));
    const app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'admin@example.com', password: 'wrong' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'unauthorized' });
    await app.close();
  });

  it('POST /api/auth/refresh requires cookie', async () => {
    const app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
    });

    expect(res.statusCode).toBe(401);
    expect(refresh).not.toHaveBeenCalled();
    await app.close();
  });

  it('POST /api/auth/refresh rotates tokens when cookie present', async () => {
    vi.mocked(refresh).mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });
    const app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: { refreshToken: 'old-refresh' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ accessToken: 'new-access' });
    expect(refresh).toHaveBeenCalledWith('old-refresh');
    await app.close();
  });

  it('POST /api/auth/logout clears cookie with 204', async () => {
    const app = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
    });

    expect(res.statusCode).toBe(204);
    const cleared = res.cookies.find((c) => c.name === 'refreshToken');
    expect(cleared?.value === '' || cleared?.value === undefined || Number(cleared?.maxAge) <= 0).toBe(
      true,
    );
    await app.close();
  });
});

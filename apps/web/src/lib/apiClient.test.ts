import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiRequest, configureApiClient } from '../lib/apiClient.js';

describe('apiRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('attaches the Bearer access token from memory', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    configureApiClient({
      accessToken: 'tok-123',
      getAccessToken: () => 'tok-123',
      setAccessToken: vi.fn(),
      onAuthFailure: vi.fn(),
    });

    await apiRequest<{ ok: boolean }>('/api/projects');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer tok-123');
    expect(init.credentials).toBe('include');
  });

  it('on 401 refreshes once then retries the original request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 401, detail: 'expired', code: 'unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/problem+json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessToken: 'new-tok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [1] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const setAccessToken = vi.fn();
    configureApiClient({
      accessToken: 'old-tok',
      getAccessToken: () => (setAccessToken.mock.calls.length ? 'new-tok' : 'old-tok'),
      setAccessToken,
      onAuthFailure: vi.fn(),
    });

    const result = await apiRequest<{ items: number[] }>('/api/projects');

    expect(result).toEqual({ items: [1] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/api/auth/refresh');
    expect(setAccessToken).toHaveBeenCalledWith('new-tok');
  });

  it('surfaces RFC 7807 code and detail on non-auth failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 409,
            detail: 'Task version conflict',
            code: 'conflict',
            current: { version: 2 },
          }),
          { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    );

    configureApiClient({
      accessToken: 'tok',
      getAccessToken: () => 'tok',
      setAccessToken: vi.fn(),
      onAuthFailure: vi.fn(),
    });

    await expect(apiRequest('/api/tasks/x', { method: 'PATCH', body: {} })).rejects.toSatisfy(
      (err: unknown) => {
        expect(err).toBeInstanceOf(ApiError);
        const e = err as ApiError;
        expect(e.status).toBe(409);
        expect(e.code).toBe('conflict');
        expect(e.detail).toBe('Task version conflict');
        expect(e.problem.current).toEqual({ version: 2 });
        return true;
      },
    );
  });

  it('maps Failed to fetch to api_unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    configureApiClient({
      accessToken: null,
      getAccessToken: () => null,
      setAccessToken: vi.fn(),
      onAuthFailure: vi.fn(),
    });

    await expect(apiRequest('/api/auth/login', { method: 'POST', body: {} })).rejects.toSatisfy(
      (err: unknown) => {
        expect(err).toBeInstanceOf(ApiError);
        const e = err as ApiError;
        expect(e.code).toBe('api_unreachable');
        expect(e.detail).toMatch(/port 3100/i);
        return true;
      },
    );
  });

  it('maps Vite proxy ECONNREFUSED body to api_unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('http proxy error: Error: connect ECONNREFUSED 127.0.0.1:3100', {
          status: 500,
          statusText: 'Internal Server Error',
        }),
      ),
    );

    configureApiClient({
      accessToken: 'tok',
      getAccessToken: () => 'tok',
      setAccessToken: vi.fn(),
      onAuthFailure: vi.fn(),
    });

    await expect(apiRequest('/api/projects')).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe('api_unreachable');
      return true;
    });
  });
});

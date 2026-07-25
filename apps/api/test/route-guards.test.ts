import { PERMISSIONS, type PermissionKey } from '@pkg/rbac';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import type { PermissionPreHandler } from '../src/middleware/permissions.js';

const KNOWN_PERMISSION_KEYS: ReadonlySet<PermissionKey> = new Set(Object.values(PERMISSIONS).map((p) => p.key));

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function isPermissionPreHandler(fn: unknown): fn is PermissionPreHandler {
  return typeof fn === 'function' && 'permissionKey' in fn;
}

function isExemptFromPermissionGuard(config: unknown): boolean {
  if (typeof config !== 'object' || config === null) return false;
  const c = config as { public?: unknown; authOnly?: unknown };
  // public: pre-auth endpoints (login/refresh). authOnly: authenticated but
  // project-unscoped mutators (POST /api/projects) — no project to resolve.
  return c.public === true || c.authOnly === true;
}

/**
 * §6.4 (risk R5): the single highest-value test in the suite. A new route
 * that forgets its permission guard fails closed at runtime (§6.3) — this
 * test is what turns that into a loud, immediate CI failure instead of a
 * silent authorization hole discovered later.
 */
describe('route-guard drift (§6.4)', () => {
  it('every non-GET route has a requirePermission guard referencing a real permission, unless explicitly public', async () => {
    const fastify = await buildApp();
    await fastify.ready();

    // Sanity check on the collection mechanism itself — a passing test with
    // zero routes examined would be a false negative, not a clean bill of health.
    expect(fastify.routeTable.length).toBeGreaterThan(0);

    const missingGuard: string[] = [];
    const unknownPermissionKey: string[] = [];
    const authOnlyPaths: string[] = [];

    for (const route of fastify.routeTable) {
      if (SAFE_METHODS.has(route.method)) {
        continue;
      }

      if (isExemptFromPermissionGuard(route.config)) {
        if (
          typeof route.config === 'object' &&
          route.config !== null &&
          (route.config as { authOnly?: unknown }).authOnly === true
        ) {
          authOnlyPaths.push(`${route.method} ${route.path}`);
        }
        continue;
      }

      const guard = route.preHandlers.find(isPermissionPreHandler);

      if (!guard) {
        missingGuard.push(`${route.method} ${route.path}`);
        continue;
      }

      if (!KNOWN_PERMISSION_KEYS.has(guard.permissionKey)) {
        unknownPermissionKey.push(`${route.method} ${route.path} -> '${guard.permissionKey}'`);
      }
    }

    expect(missingGuard, 'routes missing a requirePermission preHandler (or a PUBLIC/AUTH_ONLY route config marker)').toEqual(
      [],
    );
    expect(
      unknownPermissionKey,
      "routes calling requirePermission with a key that isn't in @pkg/rbac's PERMISSIONS registry",
    ).toEqual([]);

    // POST /api/projects is intentionally auth-only (no project to resolve yet).
    expect(authOnlyPaths).toContain('POST /api/projects');

    // Calendar-exception mutators (and the list GET) must use calendar.manage.
    const byKey = (method: string, path: string) => {
      const route = fastify.routeTable.find((r) => r.method === method && r.path === path);
      expect(route, `${method} ${path} should be registered`).toBeDefined();
      const guard = route!.preHandlers.find(isPermissionPreHandler);
      expect(guard?.permissionKey).toBe(PERMISSIONS.CALENDAR_MANAGE.key);
    };
    byKey('GET', '/api/calendars/:id/exceptions');
    byKey('POST', '/api/calendars/:id/exceptions');
    byKey('DELETE', '/api/calendar-exceptions/:id');

    await fastify.close();
  });
});

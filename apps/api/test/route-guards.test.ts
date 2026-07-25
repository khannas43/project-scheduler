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
    const byKey = (method: string, path: string, key: PermissionKey) => {
      const route = fastify.routeTable.find((r) => r.method === method && r.path === path);
      expect(route, `${method} ${path} should be registered`).toBeDefined();
      const guard = route!.preHandlers.find(isPermissionPreHandler);
      expect(guard?.permissionKey).toBe(key);
    };
    byKey('GET', '/api/calendars/:id/exceptions', PERMISSIONS.CALENDAR_MANAGE.key);
    byKey('POST', '/api/calendars/:id/exceptions', PERMISSIONS.CALENDAR_MANAGE.key);
    byKey('DELETE', '/api/calendar-exceptions/:id', PERMISSIONS.CALENDAR_MANAGE.key);

    // Resource pool + assignment mutators (and their GETs that carry guards).
    byKey('POST', '/api/resources', PERMISSIONS.RESOURCE_CREATE.key);
    byKey('PATCH', '/api/resources/:id', PERMISSIONS.RESOURCE_EDIT.key);
    byKey('DELETE', '/api/resources/:id', PERMISSIONS.RESOURCE_EDIT.key);
    byKey('GET', '/api/resources', PERMISSIONS.RESOURCE_VIEW.key);
    byKey('GET', '/api/resources/:id/overallocations', PERMISSIONS.RESOURCE_VIEW.key);
    byKey('POST', '/api/assignments', PERMISSIONS.RESOURCE_ASSIGN.key);
    byKey('PATCH', '/api/assignments/:id', PERMISSIONS.RESOURCE_ASSIGN.key);
    byKey('DELETE', '/api/assignments/:id', PERMISSIONS.RESOURCE_ASSIGN.key);
    // GET is skipped by the SAFE_METHODS loop above — assert the guard key explicitly.
    byKey('GET', '/api/assignments/:id/timephased', PERMISSIONS.RESOURCE_ASSIGN.key);

    // Baselines — GETs need explicit assertion (SAFE_METHODS filter skips them).
    byKey('POST', '/api/projects/:id/baselines', PERMISSIONS.BASELINE_SAVE.key);
    byKey('GET', '/api/projects/:id/baselines', PERMISSIONS.BASELINE_VIEW.key);
    byKey('GET', '/api/baselines/:id', PERMISSIONS.BASELINE_VIEW.key);
    byKey('DELETE', '/api/baselines/:id', PERMISSIONS.BASELINE_CLEAR.key);

    await fastify.close();
  });
});

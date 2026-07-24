import { PERMISSIONS, type PermissionKey } from '@pkg/rbac';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import type { PermissionPreHandler } from '../src/middleware/permissions.js';

const KNOWN_PERMISSION_KEYS: ReadonlySet<PermissionKey> = new Set(Object.values(PERMISSIONS).map((p) => p.key));

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function isPermissionPreHandler(fn: unknown): fn is PermissionPreHandler {
  return typeof fn === 'function' && 'permissionKey' in fn;
}

function isPublicRoute(config: unknown): boolean {
  return typeof config === 'object' && config !== null && (config as { public?: unknown }).public === true;
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

    for (const route of fastify.routeTable) {
      if (SAFE_METHODS.has(route.method)) {
        continue;
      }

      if (isPublicRoute(route.config)) {
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

    expect(missingGuard, 'routes missing a requirePermission preHandler (or a PUBLIC_ROUTE_CONFIG marker)').toEqual(
      [],
    );
    expect(
      unknownPermissionKey,
      "routes calling requirePermission with a key that isn't in @pkg/rbac's PERMISSIONS registry",
    ).toEqual([]);

    await fastify.close();
  });
});

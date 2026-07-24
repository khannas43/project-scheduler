import type { PermissionKey } from '@pkg/rbac';
import { eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';

import { db } from '../db/client.js';
import { tasks } from '../db/schema/index.js';
import { getEffectivePermissions } from '../services/permissionService.js';
import { ForbiddenError, UnauthorizedError } from './errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    permissionsCache?: Map<string, Set<PermissionKey>>;
  }
}

/**
 * Resolves the project a request is scoped to, per §6.2 ("resolves the
 * project from the route (task → project)"). Route tables in §5.2 reuse
 * `:id` across many resource types, so disambiguation uses the *registered*
 * route pattern (request.routeOptions.url) rather than the param name —
 * reliable without renaming every route's params.
 *
 * Extend the prefix list as more resource types gain permission-guarded
 * routes (e.g. `/api/dependencies/:id` -> dependency -> task -> project).
 */
async function resolveProjectId(request: FastifyRequest): Promise<string | undefined> {
  const params = request.params as Record<string, unknown>;
  const id = typeof params.id === 'string' ? params.id : undefined;
  if (!id) {
    return undefined;
  }

  const routePath = request.routeOptions.url ?? '';

  if (routePath.startsWith('/api/projects/')) {
    return id;
  }

  if (routePath.startsWith('/api/tasks/')) {
    const [task] = await db.select({ projectId: tasks.projectId }).from(tasks).where(eq(tasks.id, id)).limit(1);
    return task?.projectId;
  }

  return undefined;
}

/**
 * The preHandler returned by requirePermission(), tagged with the key it was
 * built with. The route-guard drift test (§6.4) reads `.permissionKey` off
 * of registered preHandlers to verify it's a real, registered permission —
 * this is the single source of truth; nothing duplicates the key elsewhere.
 */
export interface PermissionPreHandler {
  (request: FastifyRequest): Promise<void>;
  readonly permissionKey: PermissionKey;
}

/** §6.2/§6.3: fail closed — an unresolved project or missing permission is a 403, never a silent pass. */
export function requirePermission(key: PermissionKey): PermissionPreHandler {
  const permissionGuard = async function permissionGuard(request: FastifyRequest): Promise<void> {
    if (!request.user) {
      throw new UnauthorizedError();
    }

    const projectId = await resolveProjectId(request);
    if (!projectId) {
      throw new ForbiddenError('Could not resolve a project for this request');
    }

    request.permissionsCache ??= new Map();
    let granted = request.permissionsCache.get(projectId);
    if (!granted) {
      granted = await getEffectivePermissions(request.user.id, projectId);
      request.permissionsCache.set(projectId, granted);
    }

    if (!granted.has(key)) {
      throw new ForbiddenError(`Missing permission: ${key}`);
    }
  } as PermissionPreHandler;

  Object.defineProperty(permissionGuard, 'permissionKey', { value: key, enumerable: true });

  return permissionGuard;
}

import type { PermissionKey } from '@pkg/rbac';
import { eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';

import { db } from '../db/client.js';
import {
  assignments,
  baselines,
  calendarExceptions,
  calendars,
  taskDependencies,
  tasks,
} from '../db/schema/index.js';
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
 * Exported for unit tests covering the dependency branches.
 */
export async function resolveProjectId(request: FastifyRequest): Promise<string | undefined> {
  const params = request.params as Record<string, unknown>;
  const id = typeof params.id === 'string' ? params.id : undefined;
  const routePath = request.routeOptions.url ?? '';

  if (routePath.startsWith('/api/projects/')) {
    return id;
  }

  if (routePath.startsWith('/api/tasks/')) {
    if (!id) return undefined;
    const [task] = await db.select({ projectId: tasks.projectId }).from(tasks).where(eq(tasks.id, id)).limit(1);
    return task?.projectId;
  }

  // POST /api/dependencies — no :id; project comes from body.predecessorId → task.
  // DELETE /api/dependencies/:id — :id is a dependency id, not a task/project.
  if (routePath.startsWith('/api/dependencies')) {
    if (!id) {
      const body = request.body as Record<string, unknown> | null | undefined;
      const predecessorId =
        body && typeof body === 'object' && typeof body.predecessorId === 'string'
          ? body.predecessorId
          : undefined;
      if (!predecessorId) return undefined;
      const [task] = await db
        .select({ projectId: tasks.projectId })
        .from(tasks)
        .where(eq(tasks.id, predecessorId))
        .limit(1);
      return task?.projectId;
    }

    const [row] = await db
      .select({ projectId: tasks.projectId })
      .from(taskDependencies)
      .innerJoin(tasks, eq(taskDependencies.predecessorId, tasks.id))
      .where(eq(taskDependencies.id, id))
      .limit(1);
    return row?.projectId;
  }

  // POST /api/assignments — no :id; project comes from body.taskId → task.
  // PATCH/DELETE /api/assignments/:id — :id is an assignment id.
  if (routePath.startsWith('/api/assignments')) {
    if (!id) {
      const body = request.body as Record<string, unknown> | null | undefined;
      const taskId =
        body && typeof body === 'object' && typeof body.taskId === 'string' ? body.taskId : undefined;
      if (!taskId) return undefined;
      const [task] = await db
        .select({ projectId: tasks.projectId })
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .limit(1);
      return task?.projectId;
    }

    const [row] = await db
      .select({ projectId: tasks.projectId })
      .from(assignments)
      .innerJoin(tasks, eq(assignments.taskId, tasks.id))
      .where(eq(assignments.id, id))
      .limit(1);
    return row?.projectId;
  }

  // GET/POST /api/calendars/:id/exceptions — :id is a calendar id.
  if (routePath.startsWith('/api/calendars/')) {
    if (!id) return undefined;
    const [calendar] = await db
      .select({ projectId: calendars.projectId })
      .from(calendars)
      .where(eq(calendars.id, id))
      .limit(1);
    // May be null for global templates — requirePermission fails closed on falsy.
    return calendar?.projectId ?? undefined;
  }

  // DELETE /api/calendar-exceptions/:id — :id is an exception id.
  if (routePath.startsWith('/api/calendar-exceptions/')) {
    if (!id) return undefined;
    const [row] = await db
      .select({ projectId: calendars.projectId })
      .from(calendarExceptions)
      .innerJoin(calendars, eq(calendarExceptions.calendarId, calendars.id))
      .where(eq(calendarExceptions.id, id))
      .limit(1);
    return row?.projectId ?? undefined;
  }

  // GET/DELETE /api/baselines/:id — :id is a baseline id (direct FK to project).
  if (routePath.startsWith('/api/baselines/')) {
    if (!id) return undefined;
    const [row] = await db
      .select({ projectId: baselines.projectId })
      .from(baselines)
      .where(eq(baselines.id, id))
      .limit(1);
    return row?.projectId;
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

async function assertHasPermission(
  request: FastifyRequest,
  key: PermissionKey,
  projectId: string,
): Promise<void> {
  if (!request.user) {
    throw new UnauthorizedError();
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
}

function tagPermissionPreHandler(
  permissionGuard: (request: FastifyRequest) => Promise<void>,
  key: PermissionKey,
): PermissionPreHandler {
  const tagged = permissionGuard as PermissionPreHandler;
  Object.defineProperty(tagged, 'permissionKey', { value: key, enumerable: true });
  return tagged;
}

/** §6.2/§6.3: fail closed — an unresolved project or missing permission is a 403, never a silent pass. */
export function requirePermission(key: PermissionKey): PermissionPreHandler {
  return tagPermissionPreHandler(async function permissionGuard(request: FastifyRequest): Promise<void> {
    if (!request.user) {
      throw new UnauthorizedError();
    }

    const projectId = await resolveProjectId(request);
    if (!projectId) {
      throw new ForbiddenError('Could not resolve a project for this request');
    }

    await assertHasPermission(request, key, projectId);
  }, key);
}

/**
 * Like requirePermission, but the project id comes from a caller-supplied
 * extractor (query/body) rather than the route `:id`. Used for global
 * resources (roles, permissions) that still authorize against a project
 * membership — the projectId authorizes the caller only; it does not scope
 * the returned/mutated data.
 */
export function requirePermissionForProject(
  key: PermissionKey,
  getProjectId: (request: FastifyRequest) => string | undefined,
): PermissionPreHandler {
  return tagPermissionPreHandler(async function permissionGuard(request: FastifyRequest): Promise<void> {
    if (!request.user) {
      throw new UnauthorizedError();
    }

    const projectId = getProjectId(request);
    if (!projectId) {
      throw new ForbiddenError('Could not resolve a project for this request');
    }

    await assertHasPermission(request, key, projectId);
  }, key);
}

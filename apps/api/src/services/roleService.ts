import { asc, eq, inArray } from 'drizzle-orm';

import { db } from '../db/client.js';
import { permissions, rolePermissions, roles } from '../db/schema/index.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../middleware/errors.js';
import { withSerializableRetry, writeAuditLog } from './scheduleRunner.js';

export interface RoleView {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly isSystem: boolean;
  readonly permissionKeys: string[];
}

export interface PermissionView {
  readonly id: string;
  readonly key: string;
  readonly category: string;
  readonly description: string;
}

export interface CreateRoleInput {
  readonly name: string;
  readonly description?: string | null;
  readonly permissionKeys: string[];
}

export interface UpdateRoleInput {
  readonly name?: string;
  readonly description?: string | null;
  readonly permissionKeys?: string[];
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; cause?: { code?: string } };
  return e.code === '23505' || e.cause?.code === '23505';
}

async function resolvePermissionIds(permissionKeys: readonly string[]): Promise<string[]> {
  if (permissionKeys.length === 0) {
    return [];
  }

  const uniqueKeys = [...new Set(permissionKeys)];
  const rows = await db
    .select({ id: permissions.id, key: permissions.key })
    .from(permissions)
    .where(inArray(permissions.key, uniqueKeys));

  if (rows.length !== uniqueKeys.length) {
    const known = new Set(rows.map((row) => row.key));
    const unknown = uniqueKeys.filter((key) => !known.has(key));
    throw new BadRequestError(`Unknown permission key(s): ${unknown.join(', ')}`);
  }

  return rows.map((row) => row.id);
}

/** Global role catalog — authorization already happened in the route preHandler. */
export async function listRoles(): Promise<RoleView[]> {
  const roleRows = await db.select().from(roles).orderBy(asc(roles.name));
  if (roleRows.length === 0) return [];

  const grantRows = await db
    .select({
      roleId: rolePermissions.roleId,
      key: permissions.key,
    })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId));

  const keysByRole = new Map<string, string[]>();
  for (const row of grantRows) {
    const list = keysByRole.get(row.roleId) ?? [];
    list.push(row.key);
    keysByRole.set(row.roleId, list);
  }

  return roleRows.map((role) => ({
    id: role.id,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissionKeys: keysByRole.get(role.id) ?? [],
  }));
}

export async function listPermissions(): Promise<PermissionView[]> {
  const rows = await db
    .select({
      id: permissions.id,
      key: permissions.key,
      category: permissions.category,
      description: permissions.description,
    })
    .from(permissions)
    .orderBy(asc(permissions.category), asc(permissions.key));

  return rows;
}

export async function createRole(
  input: CreateRoleInput,
  actorUserId: string,
  projectId: string,
): Promise<RoleView> {
  const permissionIds = await resolvePermissionIds(input.permissionKeys);

  try {
    return await withSerializableRetry(async (tx) => {
      const [created] = await tx
        .insert(roles)
        .values({
          name: input.name,
          description: input.description ?? null,
          isSystem: false,
        })
        .returning();

      if (!created) {
        throw new Error('Failed to insert role');
      }

      if (permissionIds.length > 0) {
        await tx.insert(rolePermissions).values(
          permissionIds.map((permissionId) => ({
            roleId: created.id,
            permissionId,
          })),
        );
      }

      const permissionKeys = [...input.permissionKeys];
      const view: RoleView = {
        id: created.id,
        name: created.name,
        description: created.description,
        isSystem: created.isSystem,
        permissionKeys,
      };

      await writeAuditLog(tx, {
        userId: actorUserId,
        projectId,
        action: 'role.create',
        entityType: 'role',
        entityId: created.id,
        after: view,
      });

      return view;
    }, db);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(`Role name already exists: ${input.name}`);
    }
    throw error;
  }
}

export async function updateRole(
  id: string,
  input: UpdateRoleInput,
  actorUserId: string,
  projectId: string,
): Promise<RoleView> {
  const permissionIds =
    input.permissionKeys !== undefined ? await resolvePermissionIds(input.permissionKeys) : undefined;

  try {
    return await withSerializableRetry(async (tx) => {
      const [existing] = await tx.select().from(roles).where(eq(roles.id, id)).limit(1);
      if (!existing) {
        throw new NotFoundError('Role not found');
      }
      if (existing.isSystem) {
        // Policy denial, not a resource conflict — system roles are immutable (§6.3).
        throw new ForbiddenError('System roles are immutable');
      }

      const beforeKeys = await tx
        .select({ key: permissions.key })
        .from(rolePermissions)
        .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .where(eq(rolePermissions.roleId, id));

      const before: RoleView = {
        id: existing.id,
        name: existing.name,
        description: existing.description,
        isSystem: existing.isSystem,
        permissionKeys: beforeKeys.map((row) => row.key),
      };

      const patch: { name?: string; description?: string | null } = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.description !== undefined) patch.description = input.description;

      let updated = existing;
      if (Object.keys(patch).length > 0) {
        const [row] = await tx.update(roles).set(patch).where(eq(roles.id, id)).returning();
        if (!row) {
          throw new NotFoundError('Role not found');
        }
        updated = row;
      }

      if (permissionIds !== undefined) {
        await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
        if (permissionIds.length > 0) {
          await tx.insert(rolePermissions).values(
            permissionIds.map((permissionId) => ({
              roleId: id,
              permissionId,
            })),
          );
        }
      }

      const after: RoleView = {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        isSystem: updated.isSystem,
        permissionKeys:
          input.permissionKeys !== undefined
            ? [...input.permissionKeys]
            : before.permissionKeys,
      };

      await writeAuditLog(tx, {
        userId: actorUserId,
        projectId,
        action: 'role.update',
        entityType: 'role',
        entityId: id,
        before,
        after,
      });

      return after;
    }, db);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(`Role name already exists: ${input.name ?? id}`);
    }
    throw error;
  }
}

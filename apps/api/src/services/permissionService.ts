import type { PermissionKey } from '@pkg/rbac';
import { and, eq } from 'drizzle-orm';

import { db } from '../db/client.js';
import { permissions, projectMembers, rolePermissions } from '../db/schema/index.js';

/**
 * A user's effective permission set on a project is the union of permissions
 * granted to their role on that project (PROJECT_SCOPE.md §3.1). No
 * project_members row for this (user, project) pair means an empty set —
 * fail closed (§6.3).
 */
export async function getEffectivePermissions(userId: string, projectId: string): Promise<Set<PermissionKey>> {
  const rows = await db
    .select({ key: permissions.key })
    .from(projectMembers)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, projectMembers.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(and(eq(projectMembers.userId, userId), eq(projectMembers.projectId, projectId)));

  return new Set(rows.map((row) => row.key as PermissionKey));
}

import argon2 from 'argon2';
import { eq, inArray, sql } from 'drizzle-orm';

import { PERMISSIONS, SYSTEM_ROLES } from '@pkg/rbac';

import { db, sql as pgConnection } from './client.js';
import { env } from './env.js';
import { permissions, rolePermissions, roles, users } from './schema/index.js';

/** Mirrors @pkg/rbac's PERMISSIONS registry into the database (§6.1). */
async function seedPermissions(): Promise<void> {
  const rows = Object.values(PERMISSIONS).map((p) => ({
    key: p.key,
    category: p.category,
    description: p.description,
  }));

  await db
    .insert(permissions)
    .values(rows)
    .onConflictDoUpdate({
      target: permissions.key,
      set: {
        category: sql`excluded.category`,
        description: sql`excluded.description`,
      },
    });
}

/**
 * Upserts the five seeded roles (§3.3) and reconciles each one's
 * role_permissions to exactly match @pkg/rbac's SYSTEM_ROLES — safe to rerun,
 * self-correcting if the registry changes.
 */
async function seedSystemRoles(): Promise<void> {
  for (const roleDef of Object.values(SYSTEM_ROLES)) {
    const [roleRow] = await db
      .insert(roles)
      .values({ name: roleDef.name, description: roleDef.description, isSystem: roleDef.isSystem })
      .onConflictDoUpdate({
        target: roles.name,
        set: { description: roleDef.description, isSystem: roleDef.isSystem },
      })
      .returning({ id: roles.id });

    if (!roleRow) {
      throw new Error(`Failed to upsert role: ${roleDef.name}`);
    }

    const granted = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(inArray(permissions.key, [...roleDef.permissions]));

    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleRow.id));

    if (granted.length > 0) {
      await db.insert(rolePermissions).values(granted.map((p) => ({ roleId: roleRow.id, permissionId: p.id })));
    }
  }
}

/**
 * A single bootstrap admin account so someone can log in. Not assigned to any
 * project — RBAC is project-scoped (project_members, §3.1), and there's no
 * project yet for a fresh instance to attach one to. The admin gains the
 * Admin role's permissions on a project the normal way, via project_members,
 * once one exists.
 */
async function seedAdminUser(): Promise<void> {
  const passwordHash = await argon2.hash(env.SEED_ADMIN_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: env.ARGON2_MEMORY_KB,
  });

  await db
    .insert(users)
    .values({
      email: env.SEED_ADMIN_EMAIL,
      passwordHash,
      fullName: 'Admin',
      isActive: true,
    })
    .onConflictDoNothing({ target: users.email });
}

async function main() {
  await seedPermissions();
  await seedSystemRoles();
  await seedAdminUser();
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void pgConnection.end();
  });

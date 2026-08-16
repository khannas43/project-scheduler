import argon2 from 'argon2';
import { eq, inArray, sql } from 'drizzle-orm';

import { PERMISSIONS, SYSTEM_ROLES } from '@pkg/rbac';

import { db } from '../../src/db/client.js';
import { env } from '../../src/env.js';
import { permissions, rolePermissions, roles, users } from '../../src/db/schema/index.js';

/** Seed permissions, system roles, and admin — shared by integration tests. */
export async function seedIdentity(): Promise<{ adminId: string; adminEmail: string }> {
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

  for (const roleDef of Object.values(SYSTEM_ROLES)) {
    const [roleRow] = await db
      .insert(roles)
      .values({ name: roleDef.name, description: roleDef.description, isSystem: roleDef.isSystem })
      .onConflictDoUpdate({
        target: roles.name,
        set: { description: roleDef.description, isSystem: roleDef.isSystem },
      })
      .returning({ id: roles.id });

    if (!roleRow) throw new Error(`Failed to upsert role: ${roleDef.name}`);

    const granted = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(inArray(permissions.key, [...roleDef.permissions]));

    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleRow.id));
    if (granted.length > 0) {
      await db.insert(rolePermissions).values(granted.map((p) => ({ roleId: roleRow.id, permissionId: p.id })));
    }
  }

  const passwordHash = await argon2.hash(env.SEED_ADMIN_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: env.ARGON2_MEMORY_KB,
  });

  const [admin] = await db
    .insert(users)
    .values({
      email: env.SEED_ADMIN_EMAIL,
      passwordHash,
      fullName: 'Admin',
      isActive: true,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: { passwordHash, isActive: true },
    })
    .returning({ id: users.id, email: users.email });

  if (!admin) throw new Error('Failed to upsert admin user');
  return { adminId: admin.id, adminEmail: admin.email };
}

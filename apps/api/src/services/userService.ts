import { SYSTEM_ROLES } from '@pkg/rbac';
import type { UserCreateInput, UserUpdateInput } from '@pkg/schema';
import argon2 from 'argon2';
import { asc, eq } from 'drizzle-orm';

import { db } from '../db/client.js';
import { env } from '../env.js';
import { projectMembers, resources, roles, users } from '../db/schema/index.js';
import { BadRequestError, ConflictError, NotFoundError } from '../middleware/errors.js';
import { sendMail } from './emailService.js';
import { withSerializableRetry, writeAuditLog } from './scheduleRunner.js';

export interface UserView {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
}

function toView(row: typeof users.$inferSelect): UserView {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; cause?: { code?: string } };
  return e.code === '23505' || e.cause?.code === '23505';
}

export async function listUsers(): Promise<UserView[]> {
  const rows = await db.select().from(users).orderBy(asc(users.fullName));
  return rows.map(toView);
}

export async function createUser(
  input: UserCreateInput,
  actorUserId: string,
): Promise<UserView> {
  const passwordHash = await argon2.hash(input.password, {
    type: argon2.argon2id,
    memoryCost: env.ARGON2_MEMORY_KB,
  });

  const created = await withSerializableRetry(async (tx) => {
    let row: typeof users.$inferSelect;
    try {
      const [inserted] = await tx
        .insert(users)
        .values({
          email: input.email,
          fullName: input.fullName.trim(),
          passwordHash,
          isActive: input.isActive ?? true,
        })
        .returning();
      if (!inserted) throw new Error('User insert returned no row');
      row = inserted;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('A user with that email already exists');
      }
      throw error;
    }

    if (input.roleId) {
      const [role] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.id, input.roleId)).limit(1);
      if (!role) throw new BadRequestError('Role not found');
      await tx.insert(projectMembers).values({
        userId: row.id,
        projectId: input.projectId,
        roleId: input.roleId,
      });
    }

    if (input.createResource) {
      await tx.insert(resources).values({
        name: row.fullName,
        resourceType: 'work',
        email: row.email,
        userId: row.id,
        maxUnits: '1',
        accrualType: 'prorated',
      });
    }

    await writeAuditLog(tx, {
      userId: actorUserId,
      projectId: input.projectId,
      action: 'user.create',
      entityType: 'user',
      entityId: row.id,
      after: { email: row.email, fullName: row.fullName, roleId: input.roleId ?? null },
    });

    return row;
  }, db);

  if (input.sendWelcomeEmail) {
    const loginUrl = `${env.APP_BASE_URL.replace(/\/$/, '')}/login`;
    await sendMail({
      to: created.email,
      subject: 'Your project scheduler account',
      text: [
        `Hello ${created.fullName},`,
        '',
        'An account was created for you on Project Scheduler.',
        `Sign in at: ${loginUrl}`,
        `Email: ${created.email}`,
        `Temporary password: ${input.password}`,
        '',
        'Change this password after you first sign in if your administrator asks you to.',
      ].join('\n'),
    });
  }

  return toView(created);
}

export async function updateUser(
  userId: string,
  input: UserUpdateInput,
  actorUserId: string,
): Promise<UserView> {
  return withSerializableRetry(async (tx) => {
    const [existing] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!existing) throw new NotFoundError('User not found');

    if (input.isActive === false && userId === actorUserId) {
      throw new BadRequestError('You cannot deactivate your own account');
    }

    const passwordHash =
      input.password !== undefined
        ? await argon2.hash(input.password, {
            type: argon2.argon2id,
            memoryCost: env.ARGON2_MEMORY_KB,
          })
        : undefined;

    const [updated] = await tx
      .update(users)
      .set({
        ...(input.fullName !== undefined ? { fullName: input.fullName.trim() } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(passwordHash !== undefined ? { passwordHash } : {}),
      })
      .where(eq(users.id, userId))
      .returning();
    if (!updated) throw new Error('User update returned no row');

    await writeAuditLog(tx, {
      userId: actorUserId,
      projectId: input.projectId,
      action: 'user.update',
      entityType: 'user',
      entityId: userId,
      before: { fullName: existing.fullName, isActive: existing.isActive },
      after: { fullName: updated.fullName, isActive: updated.isActive, passwordChanged: Boolean(passwordHash) },
    });

    return toView(updated);
  }, db);
}

export async function assertNotLastAdmin(projectId: string, userId: string): Promise<void> {
  const [adminRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, SYSTEM_ROLES.ADMIN.name))
    .limit(1);
  if (!adminRole) return;

  const members = await db
    .select({ userId: projectMembers.userId, roleId: projectMembers.roleId })
    .from(projectMembers)
    .where(eq(projectMembers.projectId, projectId));

  const adminIds = members.filter((m) => m.roleId === adminRole.id).map((m) => m.userId);
  if (adminIds.length === 1 && adminIds[0] === userId) {
    throw new BadRequestError('Cannot remove or demote the last Admin on this project');
  }
}

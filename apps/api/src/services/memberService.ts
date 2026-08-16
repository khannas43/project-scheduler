import { and, asc, eq } from 'drizzle-orm';

import { db } from '../db/client.js';
import { projectMembers, roles, users } from '../db/schema/index.js';
import { BadRequestError, ConflictError, NotFoundError } from '../middleware/errors.js';
import { withSerializableRetry, writeAuditLog } from './scheduleRunner.js';
import { assertNotLastAdmin } from './userService.js';

export interface MemberView {
  readonly userId: string;
  readonly email: string;
  readonly fullName: string;
  readonly isActive: boolean;
  readonly roleId: string;
  readonly roleName: string;
}

export interface RoleOption {
  readonly id: string;
  readonly name: string;
  readonly isSystem: boolean;
}

export interface MembersPayload {
  readonly members: readonly MemberView[];
  readonly roles: readonly RoleOption[];
}

export async function listMembers(projectId: string): Promise<MembersPayload> {
  const memberRows = await db
    .select({
      userId: users.id,
      email: users.email,
      fullName: users.fullName,
      isActive: users.isActive,
      roleId: roles.id,
      roleName: roles.name,
    })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .innerJoin(roles, eq(roles.id, projectMembers.roleId))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(asc(users.fullName));

  const roleRows = await db
    .select({ id: roles.id, name: roles.name, isSystem: roles.isSystem })
    .from(roles)
    .orderBy(asc(roles.name));

  return { members: memberRows, roles: roleRows };
}

export async function addMember(
  projectId: string,
  input: { userId: string; roleId: string },
  actorUserId: string,
): Promise<MemberView> {
  return withSerializableRetry(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, input.userId)).limit(1);
    if (!user) throw new NotFoundError('User not found');
    if (!user.isActive) throw new BadRequestError('Cannot add an inactive user');

    const [role] = await tx.select().from(roles).where(eq(roles.id, input.roleId)).limit(1);
    if (!role) throw new BadRequestError('Role not found');

    const [existing] = await tx
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, input.userId)))
      .limit(1);
    if (existing) throw new ConflictError('User is already a member of this project');

    await tx.insert(projectMembers).values({
      userId: input.userId,
      projectId,
      roleId: input.roleId,
    });

    await writeAuditLog(tx, {
      userId: actorUserId,
      projectId,
      action: 'member.add',
      entityType: 'project_member',
      entityId: input.userId,
      after: { roleId: input.roleId, roleName: role.name },
    });

    return {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      isActive: user.isActive,
      roleId: role.id,
      roleName: role.name,
    };
  }, db);
}

export async function updateMemberRole(
  projectId: string,
  userId: string,
  roleId: string,
  actorUserId: string,
): Promise<MemberView> {
  await assertNotLastAdmin(projectId, userId);

  return withSerializableRetry(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new NotFoundError('User not found');

    const [role] = await tx.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!role) throw new BadRequestError('Role not found');

    const [updated] = await tx
      .update(projectMembers)
      .set({ roleId })
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .returning();
    if (!updated) throw new NotFoundError('Member not found');

    await writeAuditLog(tx, {
      userId: actorUserId,
      projectId,
      action: 'member.update',
      entityType: 'project_member',
      entityId: userId,
      after: { roleId, roleName: role.name },
    });

    return {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      isActive: user.isActive,
      roleId: role.id,
      roleName: role.name,
    };
  }, db);
}

export async function removeMember(
  projectId: string,
  userId: string,
  actorUserId: string,
): Promise<void> {
  await assertNotLastAdmin(projectId, userId);

  return withSerializableRetry(async (tx) => {
    const deleted = await tx
      .delete(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .returning({ userId: projectMembers.userId });
    if (deleted.length === 0) throw new NotFoundError('Member not found');

    await writeAuditLog(tx, {
      userId: actorUserId,
      projectId,
      action: 'member.remove',
      entityType: 'project_member',
      entityId: userId,
    });
  }, db);
}

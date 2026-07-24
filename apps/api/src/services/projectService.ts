import { SYSTEM_ROLES } from '@pkg/rbac';
import type { ProjectCreateInput, ProjectUpdateInput } from '@pkg/schema';
import { and, eq, sql } from 'drizzle-orm';

import { db } from '../db/client.js';
import { auditLog, calendars, projectMembers, projects, roles } from '../db/schema/index.js';
import { ConflictError, NotFoundError } from '../middleware/errors.js';
import { withSerializableRetry, writeAuditLog } from './scheduleRunner.js';

/** Body for POST /api/projects — ownerId comes from the authenticated user. */
export type ProjectCreateBody = Omit<ProjectCreateInput, 'ownerId' | 'calendarId'> & {
  calendarId?: string | undefined;
};

const DEFAULT_CALENDAR = {
  name: 'Standard Mon–Fri',
  workingDays: [1, 2, 3, 4, 5],
  hoursPerDay: '8',
  defaultStart: '09:00',
  defaultFinish: '17:00',
} as const;

/** Projects the user is a member of — membership is the list-route authorization. */
export async function listProjectsForUser(userId: string): Promise<Array<typeof projects.$inferSelect>> {
  const rows = await db
    .select({ project: projects })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .where(eq(projectMembers.userId, userId));

  return rows.map((r) => r.project);
}

export async function getProject(projectId: string): Promise<typeof projects.$inferSelect> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new NotFoundError('Project not found');
  return project;
}

/**
 * Create a project, default calendar (when needed), and Admin membership for
 * the creator — all in one transaction.
 *
 * Calendar bootstrap: insert calendar with projectId null → insert project
 * referencing it → update calendar.projectId (calendarId is NOT NULL on projects).
 */
export async function createProject(
  input: ProjectCreateBody,
  userId: string,
): Promise<typeof projects.$inferSelect> {
  return withSerializableRetry(async (tx) => {
    let calendarId = input.calendarId;

    if (!calendarId) {
      const [cal] = await tx
        .insert(calendars)
        .values({
          name: DEFAULT_CALENDAR.name,
          projectId: null,
          workingDays: [...DEFAULT_CALENDAR.workingDays],
          hoursPerDay: DEFAULT_CALENDAR.hoursPerDay,
          defaultStart: DEFAULT_CALENDAR.defaultStart,
          defaultFinish: DEFAULT_CALENDAR.defaultFinish,
        })
        .returning();
      if (!cal) throw new Error('Calendar insert returned no row');
      calendarId = cal.id;
    } else {
      const [existingCal] = await tx
        .select({ id: calendars.id })
        .from(calendars)
        .where(eq(calendars.id, calendarId))
        .limit(1);
      if (!existingCal) throw new NotFoundError('Calendar not found');
    }

    const [created] = await tx
      .insert(projects)
      .values({
        name: input.name,
        description: input.description ?? null,
        status: input.status,
        startDate: input.startDate ? new Date(input.startDate) : null,
        calendarId,
        ownerId: userId,
        isArchived: input.isArchived ?? false,
      })
      .returning();

    if (!created) throw new Error('Project insert returned no row');

    // Point the auto-created calendar back at the project (skip if caller supplied one).
    if (!input.calendarId) {
      await tx.update(calendars).set({ projectId: created.id }).where(eq(calendars.id, calendarId));
    }

    const [adminRole] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, SYSTEM_ROLES.ADMIN.name))
      .limit(1);
    if (!adminRole) {
      throw new Error(`System role '${SYSTEM_ROLES.ADMIN.name}' is not seeded`);
    }

    await tx.insert(projectMembers).values({
      userId,
      projectId: created.id,
      roleId: adminRole.id,
    });

    await writeAuditLog(tx, {
      userId,
      projectId: created.id,
      action: 'project.create',
      entityType: 'project',
      entityId: created.id,
      after: created,
    });

    return created;
  }, db);
}

export async function updateProject(
  projectId: string,
  input: ProjectUpdateInput,
  userId: string,
): Promise<typeof projects.$inferSelect> {
  return withSerializableRetry(async (tx) => {
    const [existing] = await tx.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!existing) throw new NotFoundError('Project not found');

    const { version, ownerId: _ownerId, ...patch } = input;
    void _ownerId;

    const [updated] = await tx
      .update(projects)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.startDate !== undefined
          ? { startDate: patch.startDate ? new Date(patch.startDate) : null }
          : {}),
        ...(patch.calendarId !== undefined ? { calendarId: patch.calendarId } : {}),
        ...(patch.isArchived !== undefined ? { isArchived: patch.isArchived } : {}),
        version: sql`${projects.version} + 1`,
      })
      .where(and(eq(projects.id, projectId), eq(projects.version, version)))
      .returning();

    if (!updated) {
      const [current] = await tx.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      throw new ConflictError('Project version conflict', current);
    }

    await writeAuditLog(tx, {
      userId,
      projectId,
      action: 'project.update',
      entityType: 'project',
      entityId: projectId,
      before: existing,
      after: updated,
    });

    return updated;
  }, db);
}

export async function deleteProject(projectId: string, userId: string): Promise<void> {
  return withSerializableRetry(async (tx) => {
    const [existing] = await tx.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!existing) throw new NotFoundError('Project not found');

    // audit_log.project_id is ON DELETE NO ACTION — clear FKs before the delete,
    // then record the deletion with a null projectId (entityId still set).
    await tx.update(auditLog).set({ projectId: null }).where(eq(auditLog.projectId, projectId));
    await tx.delete(projects).where(eq(projects.id, projectId));

    await writeAuditLog(tx, {
      userId,
      projectId: null,
      action: 'project.delete',
      entityType: 'project',
      entityId: projectId,
      before: existing,
    });
  }, db);
}

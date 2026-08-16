import { and, eq, ilike, inArray, or } from 'drizzle-orm';

import { db } from '../db/client.js';
import { env } from '../env.js';
import { assignments, projects, resources, tasks, users } from '../db/schema/index.js';
import { BadRequestError, NotFoundError } from '../middleware/errors.js';
import { isEmailConfigured, sendMail, type SendMailResult } from './emailService.js';
import { writeAuditLog, withSerializableRetry } from './scheduleRunner.js';

export interface NotifyResult {
  readonly emailed: readonly SendMailResult[];
  readonly skipped: readonly string[];
  readonly smtpConfigured: boolean;
}

function formatDate(value: Date | null): string {
  if (!value) return '—';
  return value.toISOString().slice(0, 10);
}

function projectUrl(projectId: string): string {
  return `${env.APP_BASE_URL.replace(/\/$/, '')}/projects/${projectId}`;
}

async function usersForTask(taskId: string): Promise<Array<typeof users.$inferSelect>> {
  const assigned = await db
    .select({
      userId: resources.userId,
      email: resources.email,
    })
    .from(assignments)
    .innerJoin(resources, eq(resources.id, assignments.resourceId))
    .where(eq(assignments.taskId, taskId));

  if (assigned.length === 0) return [];

  const userIds = assigned.map((a) => a.userId).filter((id): id is string => Boolean(id));
  const emails = assigned.map((a) => a.email).filter((e): e is string => Boolean(e && e.trim()));

  const filters = [];
  if (userIds.length > 0) filters.push(inArray(users.id, userIds));
  for (const email of emails) {
    filters.push(ilike(users.email, email));
  }
  if (filters.length === 0) return [];

  return db
    .select()
    .from(users)
    .where(and(eq(users.isActive, true), or(...filters)));
}

async function tasksForUserInProject(
  projectId: string,
  userId: string,
): Promise<Array<typeof tasks.$inferSelect>> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new NotFoundError('User not found');

  const resourceRows = await db
    .select({ id: resources.id })
    .from(resources)
    .where(or(eq(resources.userId, userId), ilike(resources.email, user.email)));
  if (resourceRows.length === 0) return [];

  const assigned = await db
    .select({ task: tasks })
    .from(assignments)
    .innerJoin(tasks, eq(tasks.id, assignments.taskId))
    .where(
      and(
        eq(tasks.projectId, projectId),
        inArray(
          assignments.resourceId,
          resourceRows.map((r) => r.id),
        ),
      ),
    );

  const seen = new Set<string>();
  const out: Array<typeof tasks.$inferSelect> = [];
  for (const row of assigned) {
    if (seen.has(row.task.id)) continue;
    seen.add(row.task.id);
    out.push(row.task);
  }
  return out;
}

export async function notifyTaskAssignees(
  taskId: string,
  actorUserId: string,
  note?: string,
): Promise<NotifyResult> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) throw new NotFoundError('Task not found');

  const [project] = await db.select().from(projects).where(eq(projects.id, task.projectId)).limit(1);
  if (!project) throw new NotFoundError('Project not found');

  const recipients = await usersForTask(taskId);
  if (recipients.length === 0) {
    throw new BadRequestError(
      'No login user is linked to this task. Assign a resource that matches a user email, or create the user with “Also create a work resource”.',
    );
  }

  const link = projectUrl(task.projectId);
  const emailed: SendMailResult[] = [];
  for (const user of recipients) {
    const text = [
      `Hello ${user.fullName},`,
      '',
      `You have a task on ${project.name}:`,
      `${task.wbsCode ? `${task.wbsCode} ` : ''}${task.name}`,
      `Start: ${formatDate(task.earlyStart)}   Finish: ${formatDate(task.earlyFinish)}`,
      note ? `\nNote from the planner:\n${note}\n` : '',
      `Open the project: ${link}`,
    ].join('\n');

    emailed.push(
      await sendMail({
        to: user.email,
        subject: `[${project.name}] Task: ${task.name}`,
        text,
      }),
    );
  }

  await withSerializableRetry(async (tx) => {
    await writeAuditLog(tx, {
      userId: actorUserId,
      projectId: task.projectId,
      action: 'task.notify',
      entityType: 'task',
      entityId: taskId,
      after: { recipients: emailed.map((e) => e.to), smtpConfigured: isEmailConfigured() },
    });
  }, db);

  return { emailed, skipped: [], smtpConfigured: isEmailConfigured() };
}

export async function notifyMemberTasks(
  projectId: string,
  userId: string,
  actorUserId: string,
  note?: string,
): Promise<NotifyResult> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new NotFoundError('Project not found');

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.isActive) throw new NotFoundError('User not found');

  const assigned = await tasksForUserInProject(projectId, userId);
  if (assigned.length === 0) {
    throw new BadRequestError(
      'This member has no assigned tasks. Assign them as a resource (matching email or linked user) first.',
    );
  }

  const link = projectUrl(projectId);
  const lines = assigned.map((t) => {
    const wbs = t.wbsCode ? `${t.wbsCode} ` : '';
    return `• ${wbs}${t.name}  (${formatDate(t.earlyStart)} → ${formatDate(t.earlyFinish)})`;
  });

  const result = await sendMail({
    to: user.email,
    subject: `[${project.name}] Your assigned tasks`,
    text: [
      `Hello ${user.fullName},`,
      '',
      `These tasks on ${project.name} are assigned to you:`,
      '',
      ...lines,
      note ? `\nNote from the planner:\n${note}\n` : '',
      `Open the project: ${link}`,
    ].join('\n'),
  });

  await withSerializableRetry(async (tx) => {
    await writeAuditLog(tx, {
      userId: actorUserId,
      projectId,
      action: 'member.notify_tasks',
      entityType: 'user',
      entityId: userId,
      after: { taskCount: assigned.length, delivered: result.delivered },
    });
  }, db);

  return { emailed: [result], skipped: [], smtpConfigured: isEmailConfigured() };
}

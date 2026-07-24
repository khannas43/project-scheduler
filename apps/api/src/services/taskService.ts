import type { TaskCreateInput, TaskMoveInput, TaskUpdateInput } from '@pkg/schema';
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import { db } from '../db/client.js';
import { calendars, projects, taskDependencies, tasks } from '../db/schema/index.js';
import { BadRequestError, ConflictError, NotFoundError } from '../middleware/errors.js';
import {
  rescheduleProject,
  withSerializableRetry,
  writeAuditLog,
  type MutationResult,
} from './scheduleRunner.js';
import { childWbsPath, wbsCodeFromPath } from './wbs.js';

type TaskCreateBody = Omit<TaskCreateInput, 'projectId'>;

function rejectSummaryDurationOrConstraint(
  isSummary: boolean,
  input: { durationMinutes?: number | null | undefined; constraintType?: string | null | undefined },
): void {
  if (!isSummary) return;
  if (input.durationMinutes !== undefined && input.durationMinutes !== null) {
    throw new BadRequestError('Summary tasks cannot have durationMinutes set (§4.7)');
  }
  if (input.constraintType !== undefined && input.constraintType !== null) {
    throw new BadRequestError('Summary tasks cannot have constraintType set (§4.7)');
  }
}

async function nextSiblingPlacement(
  projectId: string,
  parentId: string | null,
): Promise<{ sortOrder: number; wbsPath: string }> {
  const siblings =
    parentId === null
      ? await db
          .select({ sortOrder: tasks.sortOrder })
          .from(tasks)
          .where(and(eq(tasks.projectId, projectId), isNull(tasks.parentId)))
          .orderBy(asc(tasks.sortOrder))
      : await db
          .select({ sortOrder: tasks.sortOrder })
          .from(tasks)
          .where(and(eq(tasks.projectId, projectId), eq(tasks.parentId, parentId)))
          .orderBy(asc(tasks.sortOrder));

  const maxSort = siblings.reduce((m, s) => Math.max(m, s.sortOrder ?? 0), -1);
  const sortOrder = maxSort + 1;

  let parentPath: string | null = null;
  if (parentId) {
    const [parent] = await db
      .select({ wbsPath: tasks.wbsPath })
      .from(tasks)
      .where(eq(tasks.id, parentId))
      .limit(1);
    if (!parent) throw new NotFoundError('Parent task not found');
    parentPath = parent.wbsPath;
  }

  return { sortOrder, wbsPath: childWbsPath(parentPath, siblings.length + 1) };
}

/** §5.3: full tree in one response — flat array + parent pointers. */
export async function listProjectTasks(projectId: string): Promise<{
  tasks: Array<typeof tasks.$inferSelect>;
  dependencies: Array<typeof taskDependencies.$inferSelect>;
  calendars: Array<typeof calendars.$inferSelect>;
  projectVersion: number;
}> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new NotFoundError('Project not found');

  const taskRows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .orderBy(asc(tasks.sortOrder));

  const taskIds = taskRows.map((t) => t.id);
  const dependencies =
    taskIds.length === 0
      ? []
      : await db.select().from(taskDependencies).where(inArray(taskDependencies.predecessorId, taskIds));

  const projectCalendars = await db
    .select()
    .from(calendars)
    .where(or(eq(calendars.projectId, projectId), eq(calendars.id, project.calendarId)));

  return {
    tasks: taskRows,
    dependencies,
    calendars: projectCalendars,
    projectVersion: project.version,
  };
}

export async function createTask(
  projectId: string,
  input: TaskCreateBody,
  userId: string,
): Promise<typeof tasks.$inferSelect> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new NotFoundError('Project not found');

  const isSummary = input.isSummary ?? false;
  rejectSummaryDurationOrConstraint(isSummary, input);

  const parentId = input.parentId === undefined ? null : input.parentId;
  if (parentId) {
    const [parent] = await db.select().from(tasks).where(eq(tasks.id, parentId)).limit(1);
    if (!parent || parent.projectId !== projectId) {
      throw new NotFoundError('Parent task not found in this project');
    }
  }

  const { sortOrder, wbsPath } = await nextSiblingPlacement(projectId, parentId);

  const [created] = await db
    .insert(tasks)
    .values({
      projectId,
      parentId,
      name: input.name,
      notes: input.notes ?? null,
      isMilestone: input.isMilestone ?? false,
      isSummary,
      schedulingMode: input.schedulingMode ?? 'cpm',
      durationMinutes: isSummary ? null : (input.durationMinutes ?? null),
      taskType: input.taskType ?? null,
      isEffortDriven: input.isEffortDriven ?? true,
      isManuallyScheduled: input.isManuallyScheduled ?? false,
      constraintType: isSummary ? null : (input.constraintType ?? null),
      constraintDate: input.constraintDate ? new Date(input.constraintDate) : null,
      deadline: input.deadline ? new Date(input.deadline) : null,
      calendarId: input.calendarId ?? null,
      sortOrder,
      wbsPath,
      wbsCode: wbsCodeFromPath(wbsPath),
    })
    .returning();

  if (!created) throw new Error('Insert returned no row');

  await writeAuditLog(db, {
    userId,
    projectId,
    action: 'task.create',
    entityType: 'task',
    entityId: created.id,
    after: created,
  });

  return created;
}

export async function updateTask(
  taskId: string,
  input: TaskUpdateInput,
  userId: string,
): Promise<MutationResult> {
  return withSerializableRetry(async (tx) => {
    const [existing] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!existing) throw new NotFoundError('Task not found');

    const nextIsSummary = input.isSummary ?? existing.isSummary;
    rejectSummaryDurationOrConstraint(nextIsSummary, {
      durationMinutes: input.durationMinutes,
      constraintType: input.constraintType,
    });

    const { version, projectId: _p, parentId: _parent, ...patch } = input;
    void _p;
    void _parent;

    const [updated] = await tx
      .update(tasks)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        ...(patch.isMilestone !== undefined ? { isMilestone: patch.isMilestone } : {}),
        ...(patch.isSummary !== undefined ? { isSummary: patch.isSummary } : {}),
        ...(patch.schedulingMode !== undefined ? { schedulingMode: patch.schedulingMode } : {}),
        ...(patch.durationMinutes !== undefined
          ? { durationMinutes: nextIsSummary ? null : patch.durationMinutes }
          : {}),
        ...(patch.taskType !== undefined ? { taskType: patch.taskType } : {}),
        ...(patch.isEffortDriven !== undefined ? { isEffortDriven: patch.isEffortDriven } : {}),
        ...(patch.isManuallyScheduled !== undefined
          ? { isManuallyScheduled: patch.isManuallyScheduled }
          : {}),
        ...(patch.constraintType !== undefined
          ? { constraintType: nextIsSummary ? null : patch.constraintType }
          : {}),
        ...(patch.constraintDate !== undefined
          ? { constraintDate: patch.constraintDate ? new Date(patch.constraintDate) : null }
          : {}),
        ...(patch.deadline !== undefined
          ? { deadline: patch.deadline ? new Date(patch.deadline) : null }
          : {}),
        ...(patch.calendarId !== undefined ? { calendarId: patch.calendarId } : {}),
        version: sql`${tasks.version} + 1`,
      })
      .where(and(eq(tasks.id, taskId), eq(tasks.version, version)))
      .returning();

    if (!updated) {
      const [current] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
      throw new ConflictError('Task version conflict', current);
    }

    const result = await rescheduleProject(tx, existing.projectId, { focusTaskId: taskId });

    await writeAuditLog(tx, {
      userId,
      projectId: existing.projectId,
      action: 'task.update',
      entityType: 'task',
      entityId: taskId,
      before: existing,
      after: result.task,
    });

    return result;
  }, db);
}

export async function deleteTask(taskId: string, userId: string): Promise<MutationResult> {
  return withSerializableRetry(async (tx) => {
    const [existing] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!existing) throw new NotFoundError('Task not found');

    await tx.delete(tasks).where(eq(tasks.id, taskId));

    const result = await rescheduleProject(tx, existing.projectId);

    await writeAuditLog(tx, {
      userId,
      projectId: existing.projectId,
      action: 'task.delete',
      entityType: 'task',
      entityId: taskId,
      before: existing,
    });

    return { ...result, task: null };
  }, db);
}

/**
 * §3.7 WBS rewrite + reschedule. Single UPDATE rewrites the moved task and
 * its subtree: `new_prefix || subpath(wbs_path, nlevel(old_path))`.
 */
export async function moveTask(
  taskId: string,
  input: TaskMoveInput,
  userId: string,
): Promise<MutationResult> {
  return withSerializableRetry(async (tx) => {
    const [existing] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!existing) throw new NotFoundError('Task not found');
    if (!existing.wbsPath) throw new BadRequestError('Task has no wbs_path to rewrite');

    const oldPath = existing.wbsPath;
    const newParentId = input.parentId;

    let parentPath: string | null = null;
    if (newParentId) {
      const [parent] = await tx.select().from(tasks).where(eq(tasks.id, newParentId)).limit(1);
      if (!parent || parent.projectId !== existing.projectId) {
        throw new NotFoundError('Parent task not found in this project');
      }
      if (parent.wbsPath === oldPath || (parent.wbsPath?.startsWith(`${oldPath}.`) ?? false)) {
        throw new BadRequestError('Cannot move a task under its own descendant');
      }
      parentPath = parent.wbsPath;
    }

    // sortOrder is the sibling index among peers; WBS label is 1-based.
    const newPath = childWbsPath(parentPath, input.sortOrder + 1);

    await tx.execute(sql`
      UPDATE tasks
      SET
        wbs_path = ${newPath}::ltree || subpath(wbs_path, nlevel(${oldPath}::ltree)),
        wbs_code = (${newPath}::ltree || subpath(wbs_path, nlevel(${oldPath}::ltree)))::text
      WHERE wbs_path <@ ${oldPath}::ltree
        AND project_id = ${existing.projectId}::uuid
    `);

    await tx
      .update(tasks)
      .set({
        parentId: newParentId,
        sortOrder: input.sortOrder,
        wbsPath: newPath,
        wbsCode: wbsCodeFromPath(newPath),
      })
      .where(eq(tasks.id, taskId));

    const result = await rescheduleProject(tx, existing.projectId, { focusTaskId: taskId });

    await writeAuditLog(tx, {
      userId,
      projectId: existing.projectId,
      action: 'task.move',
      entityType: 'task',
      entityId: taskId,
      before: { wbsPath: oldPath, parentId: existing.parentId, sortOrder: existing.sortOrder },
      after: { wbsPath: newPath, parentId: newParentId, sortOrder: input.sortOrder },
    });

    return result;
  }, db);
}

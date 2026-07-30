import type { TaskCreateInput, TaskMoveInput, TaskUpdateInput } from '@pkg/schema';
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import { db } from '../db/client.js';
import { assignments, boardColumns, calendars, projects, sprints, taskDependencies, tasks } from '../db/schema/index.js';
import { BadRequestError, ConflictError, NotFoundError } from '../middleware/errors.js';
import { maxBacklogRank, nextBacklogRank, reorderTaskInBacklog } from './backlogRank.js';
import { countTasksInColumn } from './boardColumnService.js';
import { hasDependencies } from './dependencyService.js';
import {
  rescheduleProject,
  withSerializableRetry,
  writeAuditLog,
  type Db,
  type MutationResult,
} from './scheduleRunner.js';
import { childWbsPath, parseWbsInsertTarget, wbsCodeFromPath } from './wbs.js';

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

/** Mode-specific fields that must not be written under the wrong planning mode. */
function rejectCrossModeFields(
  effectiveMode: string,
  patch: {
    storyPoints?: number | null | undefined;
    sprintId?: string | null | undefined;
    durationMinutes?: number | null | undefined;
    constraintType?: string | null | undefined;
    constraintDate?: string | null | undefined;
    deadline?: string | null | undefined;
    taskType?: string | null | undefined;
  },
): void {
  if (effectiveMode === 'cpm') {
    if (patch.storyPoints !== undefined) {
      throw new BadRequestError('storyPoints is only valid for agile tasks');
    }
    if (patch.sprintId !== undefined) {
      throw new BadRequestError('sprintId is only valid for agile tasks');
    }
  }
  if (effectiveMode === 'agile') {
    if (patch.durationMinutes !== undefined) {
      throw new BadRequestError('durationMinutes is only valid for CPM tasks');
    }
    if (patch.constraintType !== undefined) {
      throw new BadRequestError('constraintType is only valid for CPM tasks');
    }
    if (patch.constraintDate !== undefined) {
      throw new BadRequestError('constraintDate is only valid for CPM tasks');
    }
    if (patch.deadline !== undefined) {
      throw new BadRequestError('deadline is only valid for CPM tasks');
    }
    if (patch.taskType !== undefined) {
      throw new BadRequestError('taskType is only valid for CPM tasks');
    }
  }
}

async function assertSprintInProject(
  tx: Db,
  sprintId: string,
  projectId: string,
): Promise<void> {
  const [sprint] = await tx.select().from(sprints).where(eq(sprints.id, sprintId)).limit(1);
  if (!sprint || sprint.projectId !== projectId) {
    throw new NotFoundError('Sprint not found in this project');
  }
}

async function nextSiblingPlacement(
  tx: Db,
  projectId: string,
  parentId: string | null,
): Promise<{ sortOrder: number; wbsPath: string }> {
  const siblings =
    parentId === null
      ? await tx
          .select({ sortOrder: tasks.sortOrder })
          .from(tasks)
          .where(and(eq(tasks.projectId, projectId), isNull(tasks.parentId)))
          .orderBy(asc(tasks.sortOrder))
      : await tx
          .select({ sortOrder: tasks.sortOrder })
          .from(tasks)
          .where(and(eq(tasks.projectId, projectId), eq(tasks.parentId, parentId)))
          .orderBy(asc(tasks.sortOrder));

  const maxSort = siblings.reduce((m, s) => Math.max(m, s.sortOrder ?? 0), -1);
  const sortOrder = maxSort + 1;

  let parentPath: string | null = null;
  if (parentId) {
    const [parent] = await tx
      .select({ wbsPath: tasks.wbsPath })
      .from(tasks)
      .where(eq(tasks.id, parentId))
      .limit(1);
    if (!parent) throw new NotFoundError('Parent task not found');
    parentPath = parent.wbsPath;
  }

  return { sortOrder, wbsPath: childWbsPath(parentPath, siblings.length + 1) };
}

/**
 * Make room at `insertSortOrder` under a parent by bumping later siblings
 * (and their subtrees) up one outline slot — highest index first to avoid
 * temporary path collisions.
 */
async function shiftSiblingsForInsert(
  tx: Db,
  projectId: string,
  parentId: string | null,
  parentPath: string | null,
  insertSortOrder: number,
): Promise<void> {
  const siblingRows =
    parentId === null
      ? await tx
          .select()
          .from(tasks)
          .where(and(eq(tasks.projectId, projectId), isNull(tasks.parentId)))
          .orderBy(asc(tasks.sortOrder))
      : await tx
          .select()
          .from(tasks)
          .where(and(eq(tasks.projectId, projectId), eq(tasks.parentId, parentId)))
          .orderBy(asc(tasks.sortOrder));

  const toShift = siblingRows
    .filter((s) => (s.sortOrder ?? 0) >= insertSortOrder)
    .sort((a, b) => (b.sortOrder ?? 0) - (a.sortOrder ?? 0));

  for (const sibling of toShift) {
    if (!sibling.wbsPath) continue;
    const oldPath = sibling.wbsPath;
    const newSort = (sibling.sortOrder ?? 0) + 1;
    const newPath = childWbsPath(parentPath, newSort + 1);

    await tx.execute(sql`
      UPDATE tasks
      SET
        wbs_path = ${newPath}::ltree || subpath(wbs_path, nlevel(${oldPath}::ltree)),
        wbs_code = (${newPath}::ltree || subpath(wbs_path, nlevel(${oldPath}::ltree)))::text
      WHERE wbs_path <@ ${oldPath}::ltree
        AND project_id = ${projectId}::uuid
    `);

    await tx
      .update(tasks)
      .set({
        sortOrder: newSort,
        wbsPath: newPath,
        wbsCode: wbsCodeFromPath(newPath),
      })
      .where(eq(tasks.id, sibling.id));
  }
}

async function resolveCreatePlacement(
  tx: Db,
  projectId: string,
  input: TaskCreateBody,
): Promise<{ parentId: string | null; sortOrder: number; wbsPath: string }> {
  if (input.placeAtWbs) {
    let target;
    try {
      target = parseWbsInsertTarget(input.placeAtWbs);
    } catch {
      throw new BadRequestError(`Invalid placeAtWbs: ${input.placeAtWbs}`);
    }

    let parentId: string | null = null;
    let parentPath: string | null = target.parentPath;
    if (target.parentPath) {
      const [parent] = await tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.projectId, projectId), eq(tasks.wbsPath, target.parentPath)))
        .limit(1);
      if (!parent) {
        throw new BadRequestError(
          `Parent WBS ${target.parentPath} not found — create it before ${input.placeAtWbs}`,
        );
      }
      parentId = parent.id;
      parentPath = parent.wbsPath;
    }
    // placeAtWbs is authoritative for parent/position; parentId in the body is ignored.

    const siblings =
      parentId === null
        ? await tx
            .select({ sortOrder: tasks.sortOrder })
            .from(tasks)
            .where(and(eq(tasks.projectId, projectId), isNull(tasks.parentId)))
        : await tx
            .select({ sortOrder: tasks.sortOrder })
            .from(tasks)
            .where(and(eq(tasks.projectId, projectId), eq(tasks.parentId, parentId)));

    // Clamp into [0, siblingCount] so oversized codes append instead of leaving gaps.
    const insertSortOrder = Math.min(Math.max(target.siblingIndex - 1, 0), siblings.length);
    await shiftSiblingsForInsert(tx, projectId, parentId, parentPath, insertSortOrder);
    return {
      parentId,
      sortOrder: insertSortOrder,
      wbsPath: childWbsPath(parentPath, insertSortOrder + 1),
    };
  }

  const parentId = input.parentId === undefined ? null : input.parentId;
  if (parentId) {
    const [parent] = await tx.select().from(tasks).where(eq(tasks.id, parentId)).limit(1);
    if (!parent || parent.projectId !== projectId) {
      throw new NotFoundError('Parent task not found in this project');
    }
  }
  const placement = await nextSiblingPlacement(tx, projectId, parentId);
  return { parentId, ...placement };
}

/** §5.3: full tree in one response — flat array + parent pointers + assignments. */
export async function listProjectTasks(projectId: string): Promise<{
  tasks: Array<typeof tasks.$inferSelect>;
  dependencies: Array<typeof taskDependencies.$inferSelect>;
  calendars: Array<typeof calendars.$inferSelect>;
  assignments: Array<typeof assignments.$inferSelect>;
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

  const assignmentRows =
    taskIds.length === 0
      ? []
      : await db.select().from(assignments).where(inArray(assignments.taskId, taskIds));

  const projectCalendars = await db
    .select()
    .from(calendars)
    .where(or(eq(calendars.projectId, projectId), eq(calendars.id, project.calendarId)));

  return {
    tasks: taskRows,
    dependencies,
    calendars: projectCalendars,
    assignments: assignmentRows,
    projectVersion: project.version,
  };
}

export async function createTask(
  projectId: string,
  input: TaskCreateBody,
  userId: string,
): Promise<typeof tasks.$inferSelect> {
  return withSerializableRetry(async (tx) => {
    const [project] = await tx.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) throw new NotFoundError('Project not found');

    const isSummary = input.isSummary ?? false;
    rejectSummaryDurationOrConstraint(isSummary, input);

    const { parentId, sortOrder, wbsPath } = await resolveCreatePlacement(tx, projectId, input);

    if (parentId) {
      const [parent] = await tx.select().from(tasks).where(eq(tasks.id, parentId)).limit(1);
      if (!parent || parent.projectId !== projectId) {
        throw new NotFoundError('Parent task not found in this project');
      }

      // Adding a child under a leaf promotes the parent to a summary (WBS group).
      if (!parent.isSummary) {
        await tx
          .update(tasks)
          .set({
            isSummary: true,
            durationMinutes: null,
            constraintType: null,
            constraintDate: null,
          })
          .where(eq(tasks.id, parentId));
      }
    }

    const isMilestone = !isSummary && (input.isMilestone ?? false);
    const durationMinutes = isSummary
      ? null
      : isMilestone
        ? (input.durationMinutes ?? 0)
        : (input.durationMinutes ?? null);

    const schedulingMode = input.schedulingMode ?? 'cpm';
    rejectCrossModeFields(schedulingMode, input);

    if (input.sprintId) {
      await assertSprintInProject(tx, input.sprintId, projectId);
    }

    const backlogRank =
      schedulingMode === 'agile'
        ? await nextBacklogRank(await maxBacklogRank(tx, projectId))
        : null;

    const [created] = await tx
      .insert(tasks)
      .values({
        projectId,
        parentId,
        name: input.name,
        notes: input.notes ?? null,
        isMilestone,
        isSummary,
        schedulingMode,
        durationMinutes,
        taskType: input.taskType ?? null,
        isEffortDriven: input.isEffortDriven ?? true,
        isManuallyScheduled: input.isManuallyScheduled ?? false,
        constraintType: isSummary ? null : (input.constraintType ?? null),
        constraintDate: input.constraintDate ? new Date(input.constraintDate) : null,
        deadline: input.deadline ? new Date(input.deadline) : null,
        calendarId: input.calendarId ?? null,
        storyPoints:
          input.storyPoints === undefined
            ? null
            : input.storyPoints === null
              ? null
              : String(input.storyPoints),
        sprintId: input.sprintId ?? null,
        backlogRank,
        sortOrder,
        wbsPath,
        wbsCode: wbsCodeFromPath(wbsPath),
      })
      .returning();

    if (!created) throw new Error('Insert returned no row');

    await writeAuditLog(tx, {
      userId,
      projectId,
      action: 'task.create',
      entityType: 'task',
      entityId: created.id,
      after: created,
    });

    // Schedule so the new task appears on the Gantt with CPM dates.
    await rescheduleProject(tx, projectId, { focusTaskId: created.id });

    const [fresh] = await tx.select().from(tasks).where(eq(tasks.id, created.id)).limit(1);
    if (!fresh) throw new Error('Created task missing after reschedule');
    return fresh;
  }, db);
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

    const modeChanging =
      patch.schedulingMode !== undefined && patch.schedulingMode !== existing.schedulingMode;
    const effectiveMode = patch.schedulingMode ?? existing.schedulingMode;

    if (modeChanging && patch.schedulingMode === 'agile') {
      if (nextIsSummary || existing.isSummary) {
        throw new BadRequestError('Summary tasks cannot switch to agile mode');
      }
      if (await hasDependencies(tx, taskId)) {
        throw new BadRequestError(
          'Cannot switch to agile mode while the task has dependencies — remove its dependencies first',
        );
      }
    }

    rejectCrossModeFields(effectiveMode, patch);

    if (patch.sprintId) {
      await assertSprintInProject(tx, patch.sprintId, existing.projectId);
    }

    // Milestones are zero-duration leaf markers — not summaries.
    let nextIsMilestone = nextIsSummary
      ? false
      : patch.isMilestone !== undefined
        ? patch.isMilestone
        : existing.isMilestone;
    // A positive duration edit clears the milestone flag (same as MS Project).
    if (
      !nextIsSummary &&
      patch.isMilestone === undefined &&
      patch.durationMinutes !== undefined &&
      patch.durationMinutes !== null &&
      patch.durationMinutes > 0
    ) {
      nextIsMilestone = false;
    }

    let nextDuration =
      patch.durationMinutes !== undefined
        ? nextIsSummary
          ? null
          : patch.durationMinutes
        : undefined;
    // Marking as milestone forces duration 0 unless the client sent an explicit duration.
    if (patch.isMilestone === true && !nextIsSummary && nextDuration === undefined) {
      nextDuration = 0;
    }

    const milestoneChanged = nextIsMilestone !== existing.isMilestone;

    // Mode-switch field clearing / backlog placement.
    let modeClear: Record<string, unknown> = {};
    if (modeChanging && patch.schedulingMode === 'agile') {
      const backlogRank = await nextBacklogRank(await maxBacklogRank(tx, existing.projectId));
      modeClear = {
        durationMinutes: null,
        constraintType: null,
        constraintDate: null,
        deadline: null,
        criticalOverride: null,
        earlyStart: null,
        earlyFinish: null,
        lateStart: null,
        lateFinish: null,
        totalFloatMinutes: null,
        freeFloatMinutes: null,
        isCritical: false,
        backlogRank,
      };
      // Duration was cleared by the mode switch — don't also apply a CPM duration patch.
      nextDuration = undefined;
    } else if (modeChanging && patch.schedulingMode === 'cpm') {
      modeClear = {
        storyPoints: null,
        sprintId: null,
        boardColumnId: null,
        backlogRank: null,
      };
    }

    const [updated] = await tx
      .update(tasks)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        ...(milestoneChanged || patch.isMilestone !== undefined
          ? { isMilestone: nextIsMilestone }
          : {}),
        ...(patch.isSummary !== undefined ? { isSummary: patch.isSummary } : {}),
        ...(patch.schedulingMode !== undefined ? { schedulingMode: patch.schedulingMode } : {}),
        ...(nextDuration !== undefined ? { durationMinutes: nextDuration } : {}),
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
        ...(patch.percentComplete !== undefined
          ? {
              percentComplete:
                patch.percentComplete === null ? null : String(patch.percentComplete),
            }
          : {}),
        ...(patch.actualStart !== undefined
          ? { actualStart: patch.actualStart ? new Date(patch.actualStart) : null }
          : {}),
        ...(patch.actualFinish !== undefined
          ? { actualFinish: patch.actualFinish ? new Date(patch.actualFinish) : null }
          : {}),
        ...(patch.actualDurationMinutes !== undefined
          ? { actualDurationMinutes: patch.actualDurationMinutes }
          : {}),
        ...(patch.remainingDurationMinutes !== undefined
          ? { remainingDurationMinutes: patch.remainingDurationMinutes }
          : {}),
        ...(patch.criticalOverride !== undefined
          ? { criticalOverride: patch.criticalOverride }
          : {}),
        ...(patch.storyPoints !== undefined
          ? {
              storyPoints: patch.storyPoints === null ? null : String(patch.storyPoints),
            }
          : {}),
        ...(patch.sprintId !== undefined ? { sprintId: patch.sprintId } : {}),
        ...modeClear,
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

/** POST /api/tasks/:id/backlog-rank — reposition an agile task among neighbors. */
export async function reorderTaskBacklog(
  taskId: string,
  neighbors: { beforeTaskId?: string | null | undefined; afterTaskId?: string | null | undefined },
  userId: string,
): Promise<typeof tasks.$inferSelect> {
  return withSerializableRetry(async (tx) => {
    const [existing] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!existing) throw new NotFoundError('Task not found');

    const updated = await reorderTaskInBacklog(tx, taskId, neighbors);

    await writeAuditLog(tx, {
      userId,
      projectId: existing.projectId,
      action: 'task.backlog_rank',
      entityType: 'task',
      entityId: taskId,
      before: { backlogRank: existing.backlogRank },
      after: { backlogRank: updated.backlogRank },
    });

    return updated;
  }, db);
}

/** POST /api/tasks/:id/board-column — move an agile card into / out of a column. */
export async function moveTaskBoardColumn(
  taskId: string,
  boardColumnId: string | null,
  userId: string,
): Promise<typeof tasks.$inferSelect> {
  return withSerializableRetry(async (tx) => {
    const [existing] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!existing) throw new NotFoundError('Task not found');
    if (existing.schedulingMode !== 'agile') {
      throw new BadRequestError('Only agile tasks can be moved on the board');
    }

    if (boardColumnId !== null) {
      const [column] = await tx
        .select()
        .from(boardColumns)
        .where(eq(boardColumns.id, boardColumnId))
        .limit(1);
      if (!column || column.projectId !== existing.projectId) {
        throw new NotFoundError('Board column not found in this project');
      }

      if (column.wipLimit !== null && existing.boardColumnId !== boardColumnId) {
        const currentCount = await countTasksInColumn(tx, boardColumnId);
        if (currentCount >= column.wipLimit) {
          throw new BadRequestError(
            `Cannot move task into column — WIP limit of ${column.wipLimit} would be exceeded`,
          );
        }
      }
    }

    const [updated] = await tx
      .update(tasks)
      .set({ boardColumnId })
      .where(eq(tasks.id, taskId))
      .returning();

    if (!updated) throw new Error('Board column update returned no row');

    await writeAuditLog(tx, {
      userId,
      projectId: existing.projectId,
      action: 'task.board_column',
      entityType: 'task',
      entityId: taskId,
      before: { boardColumnId: existing.boardColumnId },
      after: { boardColumnId: updated.boardColumnId },
    });

    return updated;
  }, db);
}

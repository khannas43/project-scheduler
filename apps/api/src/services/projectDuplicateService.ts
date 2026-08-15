import { SYSTEM_ROLES } from '@pkg/rbac';
import { eq, inArray, or } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { db } from '../db/client.js';
import {
  assignments,
  assignmentTimephased,
  boardColumns,
  calendarExceptions,
  calendars,
  projectMembers,
  projects,
  roles,
  sprints,
  taskDependencies,
  tasks,
} from '../db/schema/index.js';
import { BadRequestError, NotFoundError } from '../middleware/errors.js';
import { rescheduleProject, withSerializableRetry, writeAuditLog } from './scheduleRunner.js';

export interface DuplicateProjectInput {
  readonly name?: string;
}

export interface DuplicateProjectResult {
  readonly project: typeof projects.$inferSelect;
  readonly taskCount: number;
  readonly assignmentCount: number;
}

/**
 * Deep-copy a project into a new project owned by the actor.
 * Copies: project row, project calendars + exceptions, board columns, sprints,
 * tasks (+ tracking fields), dependencies, assignments (+ timephased).
 * Skips: baselines, audit log, other members. Resources stay shared by id.
 */
export async function duplicateProject(
  sourceProjectId: string,
  input: DuplicateProjectInput,
  userId: string,
): Promise<DuplicateProjectResult> {
  return withSerializableRetry(async (tx) => {
    const [source] = await tx.select().from(projects).where(eq(projects.id, sourceProjectId)).limit(1);
    if (!source) throw new NotFoundError('Project not found');

    const newName = (input.name?.trim() || `${source.name} (copy)`).slice(0, 200);
    if (!newName) throw new BadRequestError('Name is required');

    // Calendars owned by the source project (and the project's default calendar if global).
    const sourceCals = await tx
      .select()
      .from(calendars)
      .where(
        or(eq(calendars.projectId, sourceProjectId), eq(calendars.id, source.calendarId)),
      );

    const calendarIdMap = new Map<string, string>();
    for (const cal of sourceCals) {
      const newId = randomUUID();
      calendarIdMap.set(cal.id, newId);
      await tx.insert(calendars).values({
        id: newId,
        name: cal.name,
        projectId: null,
        workingDays: [...cal.workingDays],
        hoursPerDay: cal.hoursPerDay,
        defaultStart: cal.defaultStart,
        defaultFinish: cal.defaultFinish,
      });

      const exceptions = await tx
        .select()
        .from(calendarExceptions)
        .where(eq(calendarExceptions.calendarId, cal.id));
      if (exceptions.length > 0) {
        await tx.insert(calendarExceptions).values(
          exceptions.map((ex) => ({
            id: randomUUID(),
            calendarId: newId,
            exceptionDate: ex.exceptionDate,
            isWorking: ex.isWorking,
            startTime: ex.startTime,
            finishTime: ex.finishTime,
            name: ex.name,
            recurrence: ex.recurrence,
          })),
        );
      }
    }

    const newCalendarId = calendarIdMap.get(source.calendarId);
    if (!newCalendarId) {
      throw new Error('Source project calendar was not copied');
    }

    const [created] = await tx
      .insert(projects)
      .values({
        name: newName,
        description: source.description,
        status: source.status,
        startDate: source.startDate,
        finishDate: null,
        statusDate: source.statusDate,
        calendarId: newCalendarId,
        ownerId: userId,
        isArchived: false,
        settings: source.settings ?? {},
        category: source.category,
        templateKey: source.templateKey,
      })
      .returning();
    if (!created) throw new Error('Project insert returned no row');

    for (const [, newId] of calendarIdMap) {
      await tx.update(calendars).set({ projectId: created.id }).where(eq(calendars.id, newId));
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

    const sourceBoard = await tx
      .select()
      .from(boardColumns)
      .where(eq(boardColumns.projectId, sourceProjectId));
    const boardIdMap = new Map<string, string>();
    for (const col of sourceBoard) {
      const newId = randomUUID();
      boardIdMap.set(col.id, newId);
      await tx.insert(boardColumns).values({
        id: newId,
        projectId: created.id,
        name: col.name,
        sortOrder: col.sortOrder,
        wipLimit: col.wipLimit,
        isDone: col.isDone,
      });
    }

    const sourceSprints = await tx.select().from(sprints).where(eq(sprints.projectId, sourceProjectId));
    const sprintIdMap = new Map<string, string>();
    for (const sp of sourceSprints) {
      const newId = randomUUID();
      sprintIdMap.set(sp.id, newId);
      await tx.insert(sprints).values({
        id: newId,
        projectId: created.id,
        name: sp.name,
        goal: sp.goal,
        startDate: sp.startDate,
        endDate: sp.endDate,
        capacity: sp.capacity,
        state: sp.state,
      });
    }

    const sourceTasks = await tx.select().from(tasks).where(eq(tasks.projectId, sourceProjectId));
    // Parents before children: sort by wbs path depth then path.
    sourceTasks.sort((a, b) => {
      const da = a.wbsPath ? String(a.wbsPath).split('.').length : 0;
      const dbDepth = b.wbsPath ? String(b.wbsPath).split('.').length : 0;
      if (da !== dbDepth) return da - dbDepth;
      return String(a.wbsPath ?? '').localeCompare(String(b.wbsPath ?? ''));
    });

    const taskIdMap = new Map<string, string>();
    for (const t of sourceTasks) {
      const newId = randomUUID();
      taskIdMap.set(t.id, newId);
    }

    for (const t of sourceTasks) {
      await tx.insert(tasks).values({
        id: taskIdMap.get(t.id)!,
        projectId: created.id,
        parentId: t.parentId ? (taskIdMap.get(t.parentId) ?? null) : null,
        wbsPath: t.wbsPath,
        wbsCode: t.wbsCode,
        sortOrder: t.sortOrder,
        name: t.name,
        notes: t.notes,
        isMilestone: t.isMilestone,
        isSummary: t.isSummary,
        schedulingMode: t.schedulingMode,
        durationMinutes: t.durationMinutes,
        taskType: t.taskType,
        isEffortDriven: t.isEffortDriven,
        isManuallyScheduled: t.isManuallyScheduled,
        constraintType: t.constraintType,
        constraintDate: t.constraintDate,
        deadline: t.deadline,
        calendarId: t.calendarId ? (calendarIdMap.get(t.calendarId) ?? null) : null,
        percentComplete: t.percentComplete,
        actualStart: t.actualStart,
        actualFinish: t.actualFinish,
        actualDurationMinutes: t.actualDurationMinutes,
        remainingDurationMinutes: t.remainingDurationMinutes,
        storyPoints: t.storyPoints,
        sprintId: t.sprintId ? (sprintIdMap.get(t.sprintId) ?? null) : null,
        boardColumnId: t.boardColumnId ? (boardIdMap.get(t.boardColumnId) ?? null) : null,
        backlogRank: t.backlogRank,
        criticalOverride: t.criticalOverride,
        isCritical: false,
      });
    }

    const sourceTaskIds = sourceTasks.map((t) => t.id);
    let depCount = 0;
    if (sourceTaskIds.length > 0) {
      const deps = await tx
        .select()
        .from(taskDependencies)
        .where(inArray(taskDependencies.successorId, sourceTaskIds));
      if (deps.length > 0) {
        await tx.insert(taskDependencies).values(
          deps.map((d) => ({
            predecessorId: taskIdMap.get(d.predecessorId)!,
            successorId: taskIdMap.get(d.successorId)!,
            linkType: d.linkType,
            lagMinutes: d.lagMinutes,
            lagPercent: d.lagPercent,
          })),
        );
        depCount = deps.length;
      }
    }

    let assignmentCount = 0;
    if (sourceTaskIds.length > 0) {
      const sourceAssignments = await tx
        .select()
        .from(assignments)
        .where(inArray(assignments.taskId, sourceTaskIds));
      const assignmentIdMap = new Map<string, string>();
      for (const a of sourceAssignments) {
        const newId = randomUUID();
        assignmentIdMap.set(a.id, newId);
        await tx.insert(assignments).values({
          id: newId,
          taskId: taskIdMap.get(a.taskId)!,
          resourceId: a.resourceId,
          units: a.units,
          workMinutes: a.workMinutes,
          actualWorkMinutes: a.actualWorkMinutes,
          cost: a.cost,
          actualCost: a.actualCost,
        });
      }
      assignmentCount = sourceAssignments.length;

      const oldAssignmentIds = sourceAssignments.map((a) => a.id);
      if (oldAssignmentIds.length > 0) {
        const tp = await tx
          .select()
          .from(assignmentTimephased)
          .where(inArray(assignmentTimephased.assignmentId, oldAssignmentIds));
        if (tp.length > 0) {
          await tx.insert(assignmentTimephased).values(
            tp.map((row) => ({
              id: randomUUID(),
              assignmentId: assignmentIdMap.get(row.assignmentId)!,
              periodDate: row.periodDate,
              plannedWorkMinutes: row.plannedWorkMinutes,
              actualWorkMinutes: row.actualWorkMinutes,
            })),
          );
        }
      }
    }

    await rescheduleProject(tx, created.id);

    const [fresh] = await tx.select().from(projects).where(eq(projects.id, created.id)).limit(1);

    await writeAuditLog(tx, {
      userId,
      projectId: created.id,
      action: 'project.duplicate',
      entityType: 'project',
      entityId: created.id,
      after: {
        sourceProjectId,
        taskCount: sourceTasks.length,
        dependencyCount: depCount,
        assignmentCount,
      },
    });

    return {
      project: fresh ?? created,
      taskCount: sourceTasks.length,
      assignmentCount,
    };
  }, db);
}

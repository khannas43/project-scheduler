import { eq, inArray, sql } from 'drizzle-orm';

import { db } from '../db/client.js';
import { projects, tasks } from '../db/schema/index.js';
import { BadRequestError, NotFoundError } from '../middleware/errors.js';
import { rescheduleProject, withSerializableRetry, writeAuditLog } from './scheduleRunner.js';

const HARD_CONSTRAINTS = new Set(['mso', 'mfo']);

export interface ProgressUpdateInput {
  readonly dryRun?: boolean;
  /** ISO timestamp — stored as project status date and used for calculations. */
  readonly statusDate: string;
  /** When set, only these leaf tasks are considered. */
  readonly taskIds?: readonly string[];
  /** Raise % complete to planned progress through status date (never decreases). */
  readonly updateAsScheduled?: boolean;
  /**
   * Set scoped leaf tasks to this % (0–100). When set, overrides updateAsScheduled
   * for percent changes (can raise or lower).
   */
  readonly setPercentComplete?: number;
  /** Push incomplete work that overlaps before status date to SNET = status date. */
  readonly rescheduleIncomplete?: boolean;
}

export interface ProgressPercentChange {
  readonly taskId: string;
  readonly taskName: string;
  readonly fromPercent: number;
  readonly toPercent: number;
  readonly actualStart: string | null;
  readonly actualFinish: string | null;
  readonly reason: string;
}

export interface ProgressRescheduleChange {
  readonly taskId: string;
  readonly taskName: string;
  readonly fromStart: string | null;
  readonly toStart: string;
  readonly constraintType: 'snet';
  readonly constraintDate: string;
  readonly reason: string;
}

export interface ProgressEligibleTask {
  readonly taskId: string;
  readonly taskName: string;
  readonly percentComplete: number;
  readonly earlyStart: string | null;
  readonly earlyFinish: string | null;
}

export interface ProgressUpdateResult {
  readonly dryRun: boolean;
  readonly statusDate: string;
  readonly percentChanges: readonly ProgressPercentChange[];
  readonly rescheduleChanges: readonly ProgressRescheduleChange[];
  readonly eligibleTasks: readonly ProgressEligibleTask[];
  readonly projectVersion?: number;
}

export interface ProgressTaskCandidate {
  readonly taskId: string;
  readonly taskName: string;
  readonly isSummary: boolean;
  readonly isMilestone: boolean;
  readonly earlyStart: Date | null;
  readonly earlyFinish: Date | null;
  readonly percentComplete: number | null;
  readonly actualStart: Date | null;
  readonly actualFinish: Date | null;
  readonly constraintType: string | null;
  readonly constraintDate: Date | null;
}

function roundPct(n: number): number {
  return Math.round(n * 100) / 100;
}

function currentPct(c: ProgressTaskCandidate): number {
  return c.percentComplete == null || Number.isNaN(c.percentComplete) ? 0 : c.percentComplete;
}

/**
 * Planned % complete if the task tracked exactly to schedule through statusDate.
 * Calendar-span heuristic (no calendar working-time split in v1).
 */
export function plannedPercentThroughStatusDate(
  earlyStart: Date | null,
  earlyFinish: Date | null,
  statusDate: Date,
  isMilestone: boolean,
): number {
  if (!earlyStart) return 0;
  if (isMilestone) {
    return statusDate.getTime() >= earlyStart.getTime() ? 100 : 0;
  }
  if (!earlyFinish) return 0;
  if (statusDate.getTime() <= earlyStart.getTime()) return 0;
  if (statusDate.getTime() >= earlyFinish.getTime()) return 100;
  const total = earlyFinish.getTime() - earlyStart.getTime();
  if (total <= 0) return statusDate.getTime() >= earlyStart.getTime() ? 100 : 0;
  return roundPct(((statusDate.getTime() - earlyStart.getTime()) / total) * 100);
}

export function proposePercentUpdates(
  candidates: readonly ProgressTaskCandidate[],
  statusDate: Date,
  options: { taskIds?: readonly string[] } = {},
): ProgressPercentChange[] {
  const taskFilter = options.taskIds ? new Set(options.taskIds) : null;
  const out: ProgressPercentChange[] = [];

  for (const c of candidates) {
    if (c.isSummary) continue;
    if (taskFilter && !taskFilter.has(c.taskId)) continue;
    if (!c.earlyStart) continue;

    const from = currentPct(c);
    if (from >= 100) continue;

    const to = plannedPercentThroughStatusDate(
      c.earlyStart,
      c.earlyFinish,
      statusDate,
      c.isMilestone,
    );
    if (to <= from) continue;

    let actualStart: string | null =
      c.actualStart?.toISOString() ?? (to > 0 ? c.earlyStart.toISOString() : null);
    let actualFinish: string | null = c.actualFinish?.toISOString() ?? null;
    if (to >= 100 && c.earlyFinish) {
      actualFinish = c.actualFinish?.toISOString() ?? c.earlyFinish.toISOString();
    }

    out.push({
      taskId: c.taskId,
      taskName: c.taskName,
      fromPercent: from,
      toPercent: to,
      actualStart,
      actualFinish,
      reason:
        to >= 100
          ? 'Should be complete by the status date per current schedule.'
          : 'Raise % complete to match planned progress through the status date.',
    });
  }

  return out.sort((a, b) => a.taskName.localeCompare(b.taskName));
}

/** Set leaf tasks in scope to an explicit % (can raise or lower). */
export function proposeSetPercentUpdates(
  candidates: readonly ProgressTaskCandidate[],
  setPercent: number,
  options: { taskIds?: readonly string[] } = {},
): ProgressPercentChange[] {
  const target = Math.round(Math.min(100, Math.max(0, setPercent)) * 100) / 100;
  const taskFilter = options.taskIds ? new Set(options.taskIds) : null;
  const out: ProgressPercentChange[] = [];

  for (const c of candidates) {
    if (c.isSummary) continue;
    if (taskFilter && !taskFilter.has(c.taskId)) continue;

    const from = currentPct(c);
    if (from === target) continue;

    let actualStart: string | null = c.actualStart?.toISOString() ?? null;
    let actualFinish: string | null = c.actualFinish?.toISOString() ?? null;
    if (target > 0 && !actualStart && c.earlyStart) {
      actualStart = c.earlyStart.toISOString();
    }
    if (target >= 100 && c.earlyFinish) {
      actualFinish = c.actualFinish?.toISOString() ?? c.earlyFinish.toISOString();
    } else if (target < 100) {
      actualFinish = null;
    }
    if (target <= 0) {
      actualStart = null;
      actualFinish = null;
    }

    out.push({
      taskId: c.taskId,
      taskName: c.taskName,
      fromPercent: from,
      toPercent: target,
      actualStart,
      actualFinish,
      reason: `Set percent complete to ${target}%.`,
    });
  }

  return out.sort((a, b) => a.taskName.localeCompare(b.taskName));
}

export function proposeRescheduleIncomplete(
  candidates: readonly ProgressTaskCandidate[],
  statusDate: Date,
  options: { taskIds?: readonly string[] } = {},
): ProgressRescheduleChange[] {
  const taskFilter = options.taskIds ? new Set(options.taskIds) : null;
  const out: ProgressRescheduleChange[] = [];
  const statusIso = statusDate.toISOString();

  for (const c of candidates) {
    if (c.isSummary) continue;
    if (taskFilter && !taskFilter.has(c.taskId)) continue;
    if (currentPct(c) >= 100) continue;
    if (!c.earlyStart) continue;
    if (HARD_CONSTRAINTS.has((c.constraintType ?? '').toLowerCase())) continue;

    // Only move work that was planned to be in progress (or finished) before status date.
    if (c.earlyStart.getTime() >= statusDate.getTime()) continue;

    const existingSnet =
      (c.constraintType ?? '').toLowerCase() === 'snet' && c.constraintDate
        ? c.constraintDate.getTime()
        : null;
    if (existingSnet !== null && existingSnet >= statusDate.getTime()) continue;

    out.push({
      taskId: c.taskId,
      taskName: c.taskName,
      fromStart: c.earlyStart.toISOString(),
      toStart: statusIso,
      constraintType: 'snet',
      constraintDate: statusIso,
      reason: 'Reschedule remaining work to start no earlier than the status date.',
    });
  }

  return out.sort((a, b) => a.taskName.localeCompare(b.taskName));
}

export function collectProgressEligibleTasks(
  candidates: readonly ProgressTaskCandidate[],
): ProgressEligibleTask[] {
  return candidates
    .filter((c) => !c.isSummary)
    .map((c) => ({
      taskId: c.taskId,
      taskName: c.taskName,
      percentComplete: currentPct(c),
      earlyStart: c.earlyStart?.toISOString() ?? null,
      earlyFinish: c.earlyFinish?.toISOString() ?? null,
    }))
    .sort((a, b) => a.taskName.localeCompare(b.taskName));
}

async function loadProgressCandidates(projectId: string): Promise<ProgressTaskCandidate[]> {
  const rows = await db.select().from(tasks).where(eq(tasks.projectId, projectId));
  return rows.map((t) => ({
    taskId: t.id,
    taskName: t.name,
    isSummary: t.isSummary,
    isMilestone: t.isMilestone,
    earlyStart: t.earlyStart,
    earlyFinish: t.earlyFinish,
    percentComplete: t.percentComplete === null ? null : Number(t.percentComplete),
    actualStart: t.actualStart,
    actualFinish: t.actualFinish,
    constraintType: t.constraintType,
    constraintDate: t.constraintDate,
  }));
}

/**
 * Preview or apply progress update: set status date, optionally raise % as scheduled,
 * optionally SNET-reschedule incomplete work that started before the status date.
 */
export async function updateProjectProgress(
  projectId: string,
  input: ProgressUpdateInput,
  actorUserId: string,
): Promise<ProgressUpdateResult> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new NotFoundError('Project not found');

  const statusDate = new Date(input.statusDate);
  if (Number.isNaN(statusDate.getTime())) {
    throw new BadRequestError('statusDate must be a valid ISO date');
  }

  const updateAsScheduled = input.updateAsScheduled !== false;
  const rescheduleIncomplete = input.rescheduleIncomplete === true;
  const dryRun = input.dryRun !== false;
  const setPercent =
    input.setPercentComplete !== undefined && input.setPercentComplete !== null
      ? input.setPercentComplete
      : null;

  if (setPercent !== null && (!Number.isFinite(setPercent) || setPercent < 0 || setPercent > 100)) {
    throw new BadRequestError('setPercentComplete must be between 0 and 100');
  }

  const candidates = await loadProgressCandidates(projectId);
  const eligibleTasks = collectProgressEligibleTasks(candidates);
  const scope = input.taskIds ? { taskIds: input.taskIds } : {};

  const percentChanges =
    setPercent !== null
      ? proposeSetPercentUpdates(candidates, setPercent, scope)
      : updateAsScheduled
        ? proposePercentUpdates(candidates, statusDate, scope)
        : [];
  const rescheduleChanges = rescheduleIncomplete
    ? proposeRescheduleIncomplete(candidates, statusDate, scope)
    : [];

  if (dryRun) {
    return {
      dryRun: true,
      statusDate: statusDate.toISOString(),
      percentChanges,
      rescheduleChanges,
      eligibleTasks,
    };
  }

  const touchedIds = new Set<string>([
    ...percentChanges.map((c) => c.taskId),
    ...rescheduleChanges.map((c) => c.taskId),
  ]);

  return withSerializableRetry(async (tx) => {
    const [updatedProject] = await tx
      .update(projects)
      .set({
        statusDate,
        version: sql`${projects.version} + 1`,
      })
      .where(eq(projects.id, projectId))
      .returning();

    if (!updatedProject) throw new NotFoundError('Project not found');

    if (touchedIds.size > 0) {
      const existing = await tx.select().from(tasks).where(inArray(tasks.id, [...touchedIds]));
      const byId = new Map(existing.map((t) => [t.id, t]));

      const pctById = new Map(percentChanges.map((c) => [c.taskId, c]));
      const resById = new Map(rescheduleChanges.map((c) => [c.taskId, c]));

      for (const taskId of touchedIds) {
        const row = byId.get(taskId);
        if (!row || row.projectId !== projectId) {
          throw new BadRequestError(`Task ${taskId} is not in this project`);
        }
        const pct = pctById.get(taskId);
        const res = resById.get(taskId);
        await tx
          .update(tasks)
          .set({
            ...(pct
              ? {
                  percentComplete: String(pct.toPercent),
                  actualStart: pct.actualStart ? new Date(pct.actualStart) : null,
                  actualFinish: pct.actualFinish ? new Date(pct.actualFinish) : null,
                }
              : {}),
            ...(res
              ? {
                  constraintType: 'snet' as const,
                  constraintDate: new Date(res.constraintDate),
                }
              : {}),
            version: sql`${tasks.version} + 1`,
          })
          .where(eq(tasks.id, taskId));
      }
    }

    const needsReschedule = percentChanges.length > 0 || rescheduleChanges.length > 0;
    const scheduleResult = needsReschedule
      ? await rescheduleProject(tx, projectId)
      : { projectVersion: updatedProject.version };

    await writeAuditLog(tx, {
      userId: actorUserId,
      projectId,
      action: 'project.progress_update',
      entityType: 'project',
      entityId: projectId,
      after: {
        statusDate: statusDate.toISOString(),
        percentChangeCount: percentChanges.length,
        rescheduleCount: rescheduleChanges.length,
        updateAsScheduled: setPercent === null && updateAsScheduled,
        setPercentComplete: setPercent,
        rescheduleIncomplete,
      },
    });

    return {
      dryRun: false,
      statusDate: statusDate.toISOString(),
      percentChanges,
      rescheduleChanges,
      eligibleTasks,
      projectVersion: scheduleResult.projectVersion,
    };
  }, db);
}

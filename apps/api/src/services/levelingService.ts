import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '../db/client.js';
import { assignments, projects, resources, tasks } from '../db/schema/index.js';
import { BadRequestError, NotFoundError } from '../middleware/errors.js';
import {
  eachUtcDayInclusive,
  findOverallocatedDays,
  WORKING_MINUTES_PER_DAY,
  type OverallocationDay,
} from './assignmentService.js';
import { numericFromDb } from './resourceService.js';
import { rescheduleProject, withSerializableRetry, writeAuditLog } from './scheduleRunner.js';

const HARD_CONSTRAINTS = new Set(['mso', 'mfo']);
const DEFAULT_MAX_MOVES = 40;
const LEVELING_UNDO_KEY = 'levelingUndo';

export type LevelWithinFloat = 'free' | 'total';

export interface LevelProjectInput {
  readonly dryRun?: boolean;
  readonly resourceIds?: readonly string[];
  /** When set, only these tasks may be delayed; others still count toward load. */
  readonly taskIds?: readonly string[];
  readonly withinFloat?: LevelWithinFloat;
  readonly maxMoves?: number;
}

export interface EligibleLevelingTask {
  readonly taskId: string;
  readonly taskName: string;
  readonly resourceNames: readonly string[];
}

export interface LevelingCandidate {
  readonly taskId: string;
  readonly taskName: string;
  readonly resourceId: string;
  readonly resourceName: string;
  readonly units: number;
  readonly earlyStart: Date;
  readonly earlyFinish: Date;
  readonly freeFloatMinutes: number;
  readonly totalFloatMinutes: number;
  readonly constraintType: string | null;
  readonly constraintDate: Date | null;
  readonly isCritical: boolean;
  readonly isSummary: boolean;
  readonly isMilestone: boolean;
  readonly schedulingMode: string;
}

export interface LevelingMove {
  readonly taskId: string;
  readonly taskName: string;
  readonly resourceId: string;
  readonly resourceName: string;
  readonly fromStart: string;
  readonly toStart: string;
  readonly delayMinutes: number;
  readonly constraintType: 'snet';
  readonly constraintDate: string;
  readonly reason: string;
}

export interface RemainingOverallocation {
  readonly resourceId: string;
  readonly resourceName: string;
  readonly days: readonly OverallocationDay[];
}

export interface LevelProjectResult {
  readonly dryRun: boolean;
  readonly moves: readonly LevelingMove[];
  readonly remainingOverallocations: readonly RemainingOverallocation[];
  /** Tasks that can be delayed (non-critical, float, work assignments). */
  readonly eligibleTasks: readonly EligibleLevelingTask[];
  readonly projectVersion?: number;
  readonly canUndo?: boolean;
}

export interface LevelUndoResult {
  readonly restoredTaskCount: number;
  readonly projectVersion: number;
}

interface MutableSpan {
  taskId: string;
  taskName: string;
  resourceId: string;
  resourceName: string;
  units: number;
  earlyStart: Date;
  earlyFinish: Date;
  remainingFloat: number;
  constraintType: string | null;
  constraintDate: Date | null;
}

interface LevelingUndoTask {
  readonly taskId: string;
  readonly constraintType: string | null;
  readonly constraintDate: string | null;
}

interface LevelingUndoSnapshot {
  readonly appliedAt: string;
  readonly tasks: readonly LevelingUndoTask[];
}

function isEligible(c: LevelingCandidate, withinFloat: LevelWithinFloat): boolean {
  if (c.isSummary || c.isMilestone) return false;
  if (c.schedulingMode === 'agile') return false;
  if (c.isCritical) return false;
  if (HARD_CONSTRAINTS.has((c.constraintType ?? '').toLowerCase())) return false;
  const float = withinFloat === 'free' ? c.freeFloatMinutes : c.totalFloatMinutes;
  return float > 0;
}

function spansDay(start: Date, finish: Date, day: string): boolean {
  return eachUtcDayInclusive(start, finish).includes(day);
}

function readUndoSnapshot(settings: unknown): LevelingUndoSnapshot | null {
  if (!settings || typeof settings !== 'object') return null;
  const raw = (settings as Record<string, unknown>)[LEVELING_UNDO_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const snap = raw as Partial<LevelingUndoSnapshot>;
  if (typeof snap.appliedAt !== 'string' || !Array.isArray(snap.tasks)) return null;
  return { appliedAt: snap.appliedAt, tasks: snap.tasks as LevelingUndoTask[] };
}

function withUndoSnapshot(
  settings: Record<string, unknown>,
  snapshot: LevelingUndoSnapshot | null,
): Record<string, unknown> {
  const next = { ...settings };
  if (snapshot === null) {
    delete next[LEVELING_UNDO_KEY];
  } else {
    next[LEVELING_UNDO_KEY] = snapshot;
  }
  return next;
}

export function collectEligibleTasks(
  candidates: readonly LevelingCandidate[],
  options: {
    withinFloat?: LevelWithinFloat;
    resourceIds?: readonly string[];
  } = {},
): EligibleLevelingTask[] {
  const withinFloat = options.withinFloat ?? 'free';
  const resourceFilter = options.resourceIds ? new Set(options.resourceIds) : null;
  const byTask = new Map<string, { taskName: string; resources: Set<string> }>();

  for (const c of candidates) {
    if (resourceFilter && !resourceFilter.has(c.resourceId)) continue;
    if (!isEligible(c, withinFloat)) continue;
    const entry = byTask.get(c.taskId) ?? { taskName: c.taskName, resources: new Set<string>() };
    entry.resources.add(c.resourceName);
    byTask.set(c.taskId, entry);
  }

  return [...byTask.entries()]
    .map(([taskId, v]) => ({
      taskId,
      taskName: v.taskName,
      resourceNames: [...v.resources].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.taskName.localeCompare(b.taskName));
}

/**
 * Pure greedy heuristic: for each overallocated day (earliest first), delay the
 * eligible task with the most remaining float by one calendar day (counts as 480
 * working minutes of float).
 */
export function proposeLevelingMoves(
  candidates: readonly LevelingCandidate[],
  resourceMaxUnits: ReadonlyMap<string, number>,
  options: {
    withinFloat?: LevelWithinFloat;
    maxMoves?: number;
    resourceIds?: readonly string[];
    taskIds?: readonly string[];
  } = {},
): { moves: LevelingMove[]; remainingOverallocations: RemainingOverallocation[] } {
  const withinFloat = options.withinFloat ?? 'free';
  const maxMoves = options.maxMoves ?? DEFAULT_MAX_MOVES;
  const resourceFilter = options.resourceIds ? new Set(options.resourceIds) : null;
  const taskFilter = options.taskIds ? new Set(options.taskIds) : null;

  const nameByResource = new Map<string, string>();
  for (const c of candidates) {
    nameByResource.set(c.resourceId, c.resourceName);
  }

  const spans: MutableSpan[] = [];
  for (const c of candidates) {
    if (resourceFilter && !resourceFilter.has(c.resourceId)) continue;
    if (taskFilter && !taskFilter.has(c.taskId)) continue;
    if (!isEligible(c, withinFloat)) continue;
    const float = withinFloat === 'free' ? c.freeFloatMinutes : c.totalFloatMinutes;
    spans.push({
      taskId: c.taskId,
      taskName: c.taskName,
      resourceId: c.resourceId,
      resourceName: c.resourceName,
      units: c.units,
      earlyStart: new Date(c.earlyStart),
      earlyFinish: new Date(c.earlyFinish),
      remainingFloat: float,
      constraintType: c.constraintType,
      constraintDate: c.constraintDate,
    });
  }

  const loadSpans: MutableSpan[] = [];
  for (const c of candidates) {
    if (resourceFilter && !resourceFilter.has(c.resourceId)) continue;
    loadSpans.push({
      taskId: c.taskId,
      taskName: c.taskName,
      resourceId: c.resourceId,
      resourceName: c.resourceName,
      units: c.units,
      earlyStart: new Date(c.earlyStart),
      earlyFinish: new Date(c.earlyFinish),
      remainingFloat: 0,
      constraintType: c.constraintType,
      constraintDate: c.constraintDate,
    });
  }

  const moves: LevelingMove[] = [];

  const syncLoadFromEligible = () => {
    const byTask = new Map(spans.map((s) => [s.taskId, s]));
    for (const ls of loadSpans) {
      const updated = byTask.get(ls.taskId);
      if (updated) {
        ls.earlyStart = new Date(updated.earlyStart);
        ls.earlyFinish = new Date(updated.earlyFinish);
      }
    }
  };

  for (let pass = 0; pass < maxMoves; pass += 1) {
    syncLoadFromEligible();

    let picked:
      | {
          day: string;
          resourceId: string;
          span: MutableSpan;
          over: OverallocationDay;
        }
      | null = null;

    const resourceIds = [...new Set(loadSpans.map((s) => s.resourceId))].sort((a, b) =>
      a.localeCompare(b),
    );
    for (const resourceId of resourceIds) {
      const maxUnits = resourceMaxUnits.get(resourceId) ?? 1;
      const resourceLoad = loadSpans.filter((s) => s.resourceId === resourceId);
      const days = findOverallocatedDays(
        maxUnits,
        resourceLoad.map((s) => ({
          units: s.units,
          earlyStart: s.earlyStart,
          earlyFinish: s.earlyFinish,
        })),
      );
      if (days.length === 0) continue;

      for (const over of days) {
        const candidatesOnDay = spans
          .filter(
            (s) =>
              s.resourceId === resourceId &&
              s.remainingFloat >= WORKING_MINUTES_PER_DAY &&
              spansDay(s.earlyStart, s.earlyFinish, over.date),
          )
          .sort((a, b) => {
            if (b.remainingFloat !== a.remainingFloat) return b.remainingFloat - a.remainingFloat;
            return b.earlyStart.getTime() - a.earlyStart.getTime();
          });

        const span = candidatesOnDay[0];
        if (!span) continue;
        picked = { day: over.date, resourceId, span, over };
        break;
      }
      if (picked) break;
    }

    if (!picked) break;

    const fromStart = new Date(picked.span.earlyStart);
    const proposed = new Date(fromStart);
    proposed.setUTCDate(proposed.getUTCDate() + 1);
    if (picked.span.constraintType === 'snet' && picked.span.constraintDate) {
      if (picked.span.constraintDate.getTime() >= proposed.getTime()) {
        picked.span.remainingFloat = 0;
        continue;
      }
    }

    const delayMinutes = WORKING_MINUTES_PER_DAY;
    const durationMs = picked.span.earlyFinish.getTime() - picked.span.earlyStart.getTime();
    picked.span.earlyStart = proposed;
    picked.span.earlyFinish = new Date(proposed.getTime() + durationMs);
    picked.span.remainingFloat -= delayMinutes;
    picked.span.constraintType = 'snet';
    picked.span.constraintDate = proposed;

    moves.push({
      taskId: picked.span.taskId,
      taskName: picked.span.taskName,
      resourceId: picked.resourceId,
      resourceName: picked.span.resourceName,
      fromStart: fromStart.toISOString(),
      toStart: proposed.toISOString(),
      delayMinutes,
      constraintType: 'snet',
      constraintDate: proposed.toISOString(),
      reason: `Relieve ${picked.span.resourceName} overload on ${picked.day} (${picked.over.totalUnits.toFixed(2)} > ${picked.over.maxUnits})`,
    });
  }

  syncLoadFromEligible();
  const remainingOverallocations: RemainingOverallocation[] = [];
  for (const resourceId of [...new Set(loadSpans.map((s) => s.resourceId))].sort((a, b) =>
    a.localeCompare(b),
  )) {
    const maxUnits = resourceMaxUnits.get(resourceId) ?? 1;
    const days = findOverallocatedDays(
      maxUnits,
      loadSpans
        .filter((s) => s.resourceId === resourceId)
        .map((s) => ({
          units: s.units,
          earlyStart: s.earlyStart,
          earlyFinish: s.earlyFinish,
        })),
    );
    if (days.length > 0) {
      remainingOverallocations.push({
        resourceId,
        resourceName: nameByResource.get(resourceId) ?? resourceId,
        days,
      });
    }
  }

  return { moves, remainingOverallocations };
}

async function loadLevelingCandidates(projectId: string): Promise<{
  candidates: LevelingCandidate[];
  resourceMaxUnits: Map<string, number>;
  resourceNames: Map<string, string>;
}> {
  const rows = await db
    .select({
      taskId: tasks.id,
      taskName: tasks.name,
      resourceId: resources.id,
      resourceName: resources.name,
      units: assignments.units,
      earlyStart: tasks.earlyStart,
      earlyFinish: tasks.earlyFinish,
      freeFloatMinutes: tasks.freeFloatMinutes,
      totalFloatMinutes: tasks.totalFloatMinutes,
      constraintType: tasks.constraintType,
      constraintDate: tasks.constraintDate,
      isCritical: tasks.isCritical,
      isSummary: tasks.isSummary,
      isMilestone: tasks.isMilestone,
      schedulingMode: tasks.schedulingMode,
      maxUnits: resources.maxUnits,
      resourceType: resources.resourceType,
    })
    .from(assignments)
    .innerJoin(tasks, eq(assignments.taskId, tasks.id))
    .innerJoin(resources, eq(assignments.resourceId, resources.id))
    .where(and(eq(tasks.projectId, projectId), eq(resources.resourceType, 'work')));

  const candidates: LevelingCandidate[] = [];
  const resourceMaxUnits = new Map<string, number>();
  const resourceNames = new Map<string, string>();

  for (const row of rows) {
    if (!row.earlyStart || !row.earlyFinish) continue;
    resourceMaxUnits.set(row.resourceId, numericFromDb(row.maxUnits) ?? 1);
    resourceNames.set(row.resourceId, row.resourceName);
    candidates.push({
      taskId: row.taskId,
      taskName: row.taskName,
      resourceId: row.resourceId,
      resourceName: row.resourceName,
      units: numericFromDb(row.units) ?? 1,
      earlyStart: row.earlyStart,
      earlyFinish: row.earlyFinish,
      freeFloatMinutes: row.freeFloatMinutes ?? 0,
      totalFloatMinutes: row.totalFloatMinutes ?? 0,
      constraintType: row.constraintType,
      constraintDate: row.constraintDate,
      isCritical: row.isCritical,
      isSummary: row.isSummary,
      isMilestone: row.isMilestone,
      schedulingMode: row.schedulingMode,
    });
  }

  return { candidates, resourceMaxUnits, resourceNames };
}

function buildRemaining(
  candidates: readonly LevelingCandidate[],
  resourceMaxUnits: ReadonlyMap<string, number>,
  resourceIds?: readonly string[],
): RemainingOverallocation[] {
  const remainingAfter: RemainingOverallocation[] = [];
  const loadByResource = new Map<
    string,
    { name: string; spans: { units: number; earlyStart: Date; earlyFinish: Date }[] }
  >();
  for (const c of candidates) {
    if (resourceIds && !resourceIds.includes(c.resourceId)) continue;
    const entry = loadByResource.get(c.resourceId) ?? { name: c.resourceName, spans: [] };
    entry.spans.push({
      units: c.units,
      earlyStart: c.earlyStart,
      earlyFinish: c.earlyFinish,
    });
    loadByResource.set(c.resourceId, entry);
  }
  for (const [resourceId, entry] of [...loadByResource.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const days = findOverallocatedDays(resourceMaxUnits.get(resourceId) ?? 1, entry.spans);
    if (days.length > 0) {
      remainingAfter.push({
        resourceId,
        resourceName: entry.name,
        days,
      });
    }
  }
  return remainingAfter;
}

/**
 * Preview or apply heuristic resource leveling for a project.
 * Apply writes SNET constraints, stores an undo snapshot, then reschedules once.
 */
export async function levelProject(
  projectId: string,
  input: LevelProjectInput,
  actorUserId: string,
): Promise<LevelProjectResult> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new NotFoundError('Project not found');

  const dryRun = input.dryRun !== false;
  const withinFloat = input.withinFloat ?? 'free';
  const maxMoves = input.maxMoves ?? DEFAULT_MAX_MOVES;

  if (maxMoves < 1 || maxMoves > 200) {
    throw new BadRequestError('maxMoves must be between 1 and 200');
  }

  const { candidates, resourceMaxUnits } = await loadLevelingCandidates(projectId);
  const proposeOpts: {
    withinFloat: LevelWithinFloat;
    maxMoves: number;
    resourceIds?: readonly string[];
    taskIds?: readonly string[];
  } = { withinFloat, maxMoves };
  if (input.resourceIds) {
    proposeOpts.resourceIds = input.resourceIds;
  }
  if (input.taskIds) {
    proposeOpts.taskIds = input.taskIds;
  }
  const eligibleOpts: {
    withinFloat: LevelWithinFloat;
    resourceIds?: readonly string[];
  } = { withinFloat };
  if (input.resourceIds) {
    eligibleOpts.resourceIds = input.resourceIds;
  }
  const eligibleTasks = collectEligibleTasks(candidates, eligibleOpts);
  const { moves, remainingOverallocations } = proposeLevelingMoves(
    candidates,
    resourceMaxUnits,
    proposeOpts,
  );

  const existingUndo = readUndoSnapshot(project.settings);
  if (dryRun || moves.length === 0) {
    return {
      dryRun: true,
      moves,
      remainingOverallocations,
      eligibleTasks,
      canUndo: existingUndo !== null,
    };
  }

  const byTask = new Map<string, LevelingMove>();
  for (const move of moves) {
    byTask.set(move.taskId, move);
  }
  const uniqueMoves = [...byTask.values()];
  const taskIds = uniqueMoves.map((m) => m.taskId);

  return withSerializableRetry(async (tx) => {
    const existing = await tx.select().from(tasks).where(inArray(tasks.id, taskIds));
    const byId = new Map(existing.map((t) => [t.id, t]));

    const undoTasks: LevelingUndoTask[] = [];
    for (const move of uniqueMoves) {
      const row = byId.get(move.taskId);
      if (!row || row.projectId !== projectId) {
        throw new BadRequestError(`Task ${move.taskId} is not in this project`);
      }
      undoTasks.push({
        taskId: row.id,
        constraintType: row.constraintType,
        constraintDate: row.constraintDate ? row.constraintDate.toISOString() : null,
      });
      await tx
        .update(tasks)
        .set({
          constraintType: 'snet',
          constraintDate: new Date(move.constraintDate),
          version: sql`${tasks.version} + 1`,
        })
        .where(eq(tasks.id, move.taskId));
    }

    const result = await rescheduleProject(tx, projectId);

    const settings =
      project.settings && typeof project.settings === 'object'
        ? (project.settings as Record<string, unknown>)
        : {};
    const undoSnapshot: LevelingUndoSnapshot = {
      appliedAt: new Date().toISOString(),
      tasks: undoTasks,
    };
    await tx
      .update(projects)
      .set({
        settings: withUndoSnapshot(settings, undoSnapshot),
        version: sql`${projects.version} + 1`,
      })
      .where(eq(projects.id, projectId));

    await writeAuditLog(tx, {
      userId: actorUserId,
      projectId,
      action: 'project.level_resources',
      entityType: 'project',
      entityId: projectId,
      after: {
        moveCount: uniqueMoves.length,
        taskIds,
        withinFloat,
      },
    });

    return {
      dryRun: false,
      moves: uniqueMoves,
      remainingOverallocations: [] as RemainingOverallocation[],
      eligibleTasks,
      projectVersion: result.projectVersion + 1,
      canUndo: true,
    };
  }, db).then(async (applied) => {
    const after = await loadLevelingCandidates(projectId);
    return {
      ...applied,
      remainingOverallocations: buildRemaining(
        after.candidates,
        after.resourceMaxUnits,
        input.resourceIds,
      ),
    };
  });
}

/** Restore constraints from the last leveling apply and reschedule. */
export async function undoLevelProject(
  projectId: string,
  actorUserId: string,
): Promise<LevelUndoResult> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new NotFoundError('Project not found');

  const snapshot = readUndoSnapshot(project.settings);
  if (!snapshot || snapshot.tasks.length === 0) {
    throw new BadRequestError('No leveling apply to undo');
  }

  const taskIds = snapshot.tasks.map((t) => t.taskId);

  return withSerializableRetry(async (tx) => {
    const existing = await tx.select().from(tasks).where(inArray(tasks.id, taskIds));
    const byId = new Map(existing.map((t) => [t.id, t]));

    for (const entry of snapshot.tasks) {
      const row = byId.get(entry.taskId);
      if (!row || row.projectId !== projectId) continue;
      await tx
        .update(tasks)
        .set({
          constraintType: entry.constraintType,
          constraintDate: entry.constraintDate ? new Date(entry.constraintDate) : null,
          version: sql`${tasks.version} + 1`,
        })
        .where(eq(tasks.id, entry.taskId));
    }

    const result = await rescheduleProject(tx, projectId);

    const settings =
      project.settings && typeof project.settings === 'object'
        ? (project.settings as Record<string, unknown>)
        : {};
    await tx
      .update(projects)
      .set({
        settings: withUndoSnapshot(settings, null),
        version: sql`${projects.version} + 1`,
      })
      .where(eq(projects.id, projectId));

    await writeAuditLog(tx, {
      userId: actorUserId,
      projectId,
      action: 'project.level_resources_undo',
      entityType: 'project',
      entityId: projectId,
      after: { restoredTaskCount: snapshot.tasks.length },
    });

    return {
      restoredTaskCount: snapshot.tasks.length,
      projectVersion: result.projectVersion + 1,
    };
  }, db);
}

import {
  asCalendarId,
  asEpochMinutes,
  asTaskId,
  compileCalendar,
  schedule,
  type ConstraintType,
  type LinkType,
} from '@pkg/scheduler';

import type { Project } from '../projects/index.js';

import type { TaskEditPatch, TaskRow, TaskTreeResponse } from './types.js';

const HORIZON_DAYS = 365 * 5;

export function isoToEpochMinutes(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 60_000);
}

export function epochMinutesToIso(minutes: number): string {
  return new Date(minutes * 60_000).toISOString();
}

/** Postgres `time` → minutes from midnight (`HH:MM` or `HH:MM:SS`). */
export function timeToMinutes(value: string): number {
  const [hRaw, mRaw] = value.split(':');
  const h = Number(hRaw);
  const m = Number(mRaw ?? 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    throw new RangeError(`Invalid time value: ${value}`);
  }
  return h * 60 + m;
}

function toUtcMidnightMinutes(d: Date): number {
  const ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return ms / 60_000;
}

export function projectStartEpochMinutes(project: Project): number {
  if (project.startDate) {
    return isoToEpochMinutes(project.startDate);
  }
  return toUtcMidnightMinutes(new Date());
}

/** Apply inbound edit fields onto one task row (immutable). */
export function applyPatchToTree(tree: TaskTreeResponse, patch: TaskEditPatch): TaskTreeResponse {
  const tasks = tree.tasks.map((task) => {
    if (task.id !== patch.taskId) return task;
    const isMilestone = patch.isMilestone !== undefined ? patch.isMilestone : task.isMilestone;
    const durationMinutes =
      patch.durationMinutes !== undefined
        ? patch.durationMinutes
        : isMilestone && patch.isMilestone === true
          ? 0
          : task.durationMinutes;
    let next: TaskRow = {
      ...task,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.isMilestone !== undefined ? { isMilestone: patch.isMilestone } : {}),
      durationMinutes,
      ...(patch.constraintType !== undefined ? { constraintType: patch.constraintType } : {}),
      ...(patch.constraintDate !== undefined ? { constraintDate: patch.constraintDate } : {}),
      ...(patch.criticalOverride !== undefined
        ? {
            criticalOverride: patch.criticalOverride,
            ...(patch.criticalOverride !== null ? { isCritical: patch.criticalOverride } : {}),
          }
        : {}),
      ...(patch.sprintId !== undefined ? { sprintId: patch.sprintId } : {}),
      ...(patch.storyPoints !== undefined
        ? { storyPoints: patch.storyPoints === null ? null : String(patch.storyPoints) }
        : {}),
    };

    if (patch.schedulingMode !== undefined && patch.schedulingMode !== task.schedulingMode) {
      if (patch.schedulingMode === 'agile') {
        next = {
          ...next,
          schedulingMode: 'agile',
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
        };
      } else {
        next = {
          ...next,
          schedulingMode: 'cpm',
          storyPoints: null,
          sprintId: null,
          boardColumnId: null,
          backlogRank: null,
        };
      }
    } else if (patch.schedulingMode !== undefined) {
      next = { ...next, schedulingMode: patch.schedulingMode };
    }

    return next;
  });
  return { ...tree, tasks };
}

/**
 * Local ~5ms preview: patch → schedule() → merge CPM fields into the tree.
 *
 * Calendar exceptions are deliberately omitted (`exceptions: []`). The task-tree
 * endpoint does not return `calendar_exceptions`, so this optimistic preview can
 * drift from the server near an exception date. onSuccess's `affected` list is
 * authoritative — do not invent an exceptions fetch for this round.
 */
export function recomputeOptimisticTree(
  tree: TaskTreeResponse,
  project: Project,
): TaskTreeResponse {
  const projectStart = asEpochMinutes(projectStartEpochMinutes(project));
  const horizonStart = asEpochMinutes(
    toUtcMidnightMinutes(new Date(projectStart * 60_000)),
  );
  const defaultCalendarId = asCalendarId(project.calendarId);

  const calendars = new Map(
    tree.calendars.map((cal) => {
      const id = asCalendarId(cal.id);
      const compiled = compileCalendar({
        horizonStart,
        horizonDays: HORIZON_DAYS,
        workingWeekdays: cal.workingDays,
        defaultStartMinute: timeToMinutes(cal.defaultStart),
        defaultFinishMinute: timeToMinutes(cal.defaultFinish),
        // Deliberate approximation — see comment above.
        exceptions: [],
      });
      return [id, compiled] as const;
    }),
  );

  if (!calendars.has(defaultCalendarId)) {
    // Can't schedule without the project calendar; leave the patched tree as-is.
    return tree;
  }

  const taskInputs = tree.tasks
    .filter((t) => t.schedulingMode !== 'agile')
    .map((t) => ({
      id: asTaskId(t.id),
      parentId: t.parentId ? asTaskId(t.parentId) : null,
      isSummary: t.isSummary,
      durationMinutes: t.isSummary ? 0 : (t.durationMinutes ?? 0),
      calendarId: asCalendarId(t.calendarId ?? project.calendarId),
      // Pass constraints so a drag-move (MSO) optimistic preview matches the server.
      constraintType: (t.constraintType as ConstraintType | null) ?? null,
      constraintDate: t.constraintDate ? asEpochMinutes(isoToEpochMinutes(t.constraintDate)) : null,
    }));

  const dependencies = tree.dependencies.map((d) => ({
    predecessorId: asTaskId(d.predecessorId),
    successorId: asTaskId(d.successorId),
    linkType: d.linkType as LinkType,
    lagMinutes: d.lagMinutes,
  }));

  let output;
  try {
    output = schedule({
      projectStart,
      tasks: taskInputs,
      dependencies,
      calendars,
      defaultCalendarId,
    });
  } catch {
    // Graph validation / horizon failures: keep the patched inputs, skip CPM merge.
    return tree;
  }

  const tasks = tree.tasks.map((task) => {
    const computed = output.tasks.get(asTaskId(task.id));
    if (!computed) return task;
    return {
      ...task,
      earlyStart: epochMinutesToIso(computed.earlyStart),
      earlyFinish: epochMinutesToIso(computed.earlyFinish),
      lateStart: computed.lateStart === null ? null : epochMinutesToIso(computed.lateStart),
      lateFinish: computed.lateFinish === null ? null : epochMinutesToIso(computed.lateFinish),
      totalFloatMinutes: computed.totalFloatMinutes,
      freeFloatMinutes: computed.freeFloatMinutes,
      isCritical: task.criticalOverride ?? computed.isCritical,
    };
  });

  return { ...tree, tasks };
}

/** §7.2 onMutate: patch then local schedule into a new cache value. */
export function applyOptimisticEdit(
  snapshot: TaskTreeResponse,
  project: Project,
  patch: TaskEditPatch,
): TaskTreeResponse {
  const patched = applyPatchToTree(snapshot, patch);
  return recomputeOptimisticTree(patched, project);
}

/** §7.2 onSuccess: merge focus + affected by id; bump projectVersion. */
export function mergeAffectedIntoTree(
  tree: TaskTreeResponse,
  res: {
    readonly task: TaskRow | null;
    readonly affected: readonly TaskRow[];
    readonly projectVersion: number;
  },
): TaskTreeResponse {
  const byId = new Map<string, TaskRow>();
  for (const row of res.affected) {
    byId.set(row.id, row);
  }
  if (res.task) {
    byId.set(res.task.id, res.task);
  }

  if (byId.size === 0) {
    return { ...tree, projectVersion: res.projectVersion };
  }

  const tasks = tree.tasks.map((task) => byId.get(task.id) ?? task);
  return { ...tree, tasks, projectVersion: res.projectVersion };
}

export function wbsDepth(wbsCode: string | null | undefined): number {
  if (!wbsCode) return 0;
  return wbsCode.split('.').length - 1;
}

/**
 * Pre-order tree walk by WBS path. `sortOrder` is only unique within a sibling
 * group (resets per parent), so it cannot flatten the tree correctly.
 * Segments are compared numerically so '1.10' sorts after '1.9'.
 */
export function compareWbsPath(a: string | null | undefined, b: string | null | undefined): number {
  const as = (a ?? '').split('.').filter(Boolean).map(Number);
  const bs = (b ?? '').split('.').filter(Boolean).map(Number);
  const len = Math.max(as.length, bs.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (as[i] ?? -1) - (bs[i] ?? -1);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function sortTasksForGrid(tasks: readonly TaskRow[]): TaskRow[] {
  return [...tasks].sort((a, b) => compareWbsPath(a.wbsPath, b.wbsPath));
}

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  compileCalendar,
  workingMinutesBetween,
  type CalendarCompilationInput,
  type CompiledCalendar,
} from '../src/calendar.js';
import { applyLag, resolveLagMinutes } from '../src/lag.js';
import { schedule, type SchedulerOutput, type SchedulingWarning } from '../src/schedule.js';
import type { ConstraintType, DependencyInput, LinkType, TaskInput } from '../src/taskTypes.js';
import { asCalendarId, asEpochMinutes, asTaskId, type CalendarId } from '../src/types.js';

/**
 * §11.2-style invariants asserted against the 200-reference-plan fixture.
 * Not a fast-check generator suite — fixed assertions over one large realistic
 * schedule, as a working example of what "invariant holds over this output"
 * looks like in this package.
 */

const CASE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'golden/200-reference-plan');

type GoldenCalendarJson = Omit<CalendarCompilationInput, 'horizonStart'> & {
  horizonStart: number;
  exceptions?: Array<{
    date: number;
    isWorking: boolean;
    startMinute?: number;
    finishMinute?: number;
  }>;
};

interface GoldenInput {
  projectStart: number;
  defaultCalendarId: string;
  calendars: Record<string, GoldenCalendarJson>;
  tasks: Array<{
    id: string;
    parentId: string | null;
    isSummary: boolean;
    durationMinutes: number;
    calendarId: string;
    constraintType?: ConstraintType | null;
    constraintDate?: number | null;
    deadline?: number | null;
  }>;
  dependencies: Array<{
    predecessorId: string;
    successorId: string;
    linkType: LinkType;
    lagMinutes: number;
    lagPercent?: number | null;
  }>;
}

function loadPlan(): {
  input: GoldenInput;
  tasks: TaskInput[];
  dependencies: DependencyInput[];
  calendars: Map<CalendarId, CompiledCalendar>;
  defaultCalendarId: CalendarId;
  output: SchedulerOutput;
} {
  const input = JSON.parse(readFileSync(join(CASE_DIR, 'input.json'), 'utf-8')) as GoldenInput;
  const calendars = new Map<CalendarId, CompiledCalendar>();
  for (const [id, cal] of Object.entries(input.calendars)) {
    const exceptions = cal.exceptions?.map((ex) => ({
      ...ex,
      date: asEpochMinutes(ex.date),
    }));
    calendars.set(
      asCalendarId(id),
      compileCalendar({
        horizonStart: asEpochMinutes(cal.horizonStart),
        horizonDays: cal.horizonDays,
        workingWeekdays: cal.workingWeekdays,
        defaultStartMinute: cal.defaultStartMinute,
        defaultFinishMinute: cal.defaultFinishMinute,
        ...(exceptions !== undefined ? { exceptions } : {}),
      }),
    );
  }
  const defaultCalendarId = asCalendarId(input.defaultCalendarId);
  const tasks: TaskInput[] = input.tasks.map((t) => ({
    id: asTaskId(t.id),
    parentId: t.parentId === null ? null : asTaskId(t.parentId),
    isSummary: t.isSummary,
    durationMinutes: t.durationMinutes,
    calendarId: asCalendarId(t.calendarId),
    constraintType: t.constraintType ?? null,
    constraintDate: t.constraintDate == null ? null : asEpochMinutes(t.constraintDate),
    deadline: t.deadline == null ? null : asEpochMinutes(t.deadline),
  }));
  const dependencies: DependencyInput[] = input.dependencies.map((d) => ({
    predecessorId: asTaskId(d.predecessorId),
    successorId: asTaskId(d.successorId),
    linkType: d.linkType,
    lagMinutes: d.lagMinutes,
    lagPercent: d.lagPercent ?? null,
  }));
  const output = schedule({
    projectStart: asEpochMinutes(input.projectStart),
    tasks,
    dependencies,
    calendars,
    defaultCalendarId,
  });
  return { input, tasks, dependencies, calendars, defaultCalendarId, output };
}

function serializeOutput(output: SchedulerOutput): string {
  const tasks: Record<string, unknown> = {};
  for (const [id, t] of [...output.tasks.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
    tasks[String(id)] = {
      earlyStart: Number(t.earlyStart),
      earlyFinish: Number(t.earlyFinish),
      lateStart: t.lateStart === null ? null : Number(t.lateStart),
      lateFinish: t.lateFinish === null ? null : Number(t.lateFinish),
      totalFloatMinutes: t.totalFloatMinutes,
      freeFloatMinutes: t.freeFloatMinutes,
      isCritical: t.isCritical,
    };
  }
  return JSON.stringify({
    projectFinish: Number(output.projectFinish),
    criticalPath: output.criticalPath.map(String),
    tasks,
    warnings: output.warnings.map((w: SchedulingWarning) => ({
      code: w.code,
      taskIds: w.taskIds.map(String),
      message: w.message,
    })),
  });
}

describe('200-reference-plan invariants (§11.2 / §13 item 34)', () => {
  const { input, tasks, dependencies, calendars, defaultCalendarId, output } = loadPlan();
  const taskById = new Map(tasks.map((t) => [t.id, t] as const));
  const leafIds = new Set(tasks.filter((t) => !t.isSummary).map((t) => t.id));

  it('fixture is large and exercises the required warning codes', () => {
    expect(leafIds.size).toBeGreaterThanOrEqual(190);
    expect(leafIds.size).toBeLessThanOrEqual(220);
    const codes = new Set(output.warnings.map((w) => w.code));
    expect(codes.has('CONSTRAINT_OVERRIDES_DEPENDENCY')).toBe(true);
    expect(codes.has('DEADLINE_MISSED')).toBe(true);
    expect(output.criticalPath.length).toBeGreaterThan(20);
    expect(output.criticalPath.length).toBeLessThan(leafIds.size);
  });

  it('no successor early date precedes its predecessor link (all four link types, with lag)', () => {
    for (const dep of dependencies) {
      if (!leafIds.has(dep.predecessorId) || !leafIds.has(dep.successorId)) {
        continue;
      }
      const predTask = taskById.get(dep.predecessorId)!;
      const succTask = taskById.get(dep.successorId)!;
      const pred = output.tasks.get(dep.predecessorId)!;
      const succ = output.tasks.get(dep.successorId)!;
      const succCal = calendars.get(succTask.calendarId)!;
      const lag = resolveLagMinutes(dep.lagMinutes, dep.lagPercent, predTask.durationMinutes);

      switch (dep.linkType) {
        case 'FS': {
          const minStart = applyLag(pred.earlyFinish, lag, succCal);
          expect(succ.earlyStart, `${dep.predecessorId}→${dep.successorId} FS`).toBeGreaterThanOrEqual(minStart);
          break;
        }
        case 'SS': {
          const minStart = applyLag(pred.earlyStart, lag, succCal);
          expect(succ.earlyStart, `${dep.predecessorId}→${dep.successorId} SS`).toBeGreaterThanOrEqual(minStart);
          break;
        }
        case 'FF': {
          const minFinish = applyLag(pred.earlyFinish, lag, succCal);
          expect(succ.earlyFinish, `${dep.predecessorId}→${dep.successorId} FF`).toBeGreaterThanOrEqual(minFinish);
          break;
        }
        case 'SF': {
          const minFinish = applyLag(pred.earlyStart, lag, succCal);
          expect(succ.earlyFinish, `${dep.predecessorId}→${dep.successorId} SF`).toBeGreaterThanOrEqual(minFinish);
          break;
        }
      }
    }
  });

  it('totalFloatMinutes >= freeFloatMinutes for every leaf task', () => {
    for (const id of leafIds) {
      const t = output.tasks.get(id)!;
      expect(t.totalFloatMinutes, String(id)).not.toBeNull();
      expect(t.freeFloatMinutes, String(id)).not.toBeNull();
      expect(t.totalFloatMinutes!, String(id)).toBeGreaterThanOrEqual(t.freeFloatMinutes!);
    }
  });

  it('critical path is non-empty and every critical leaf has a critical predecessor (or none)', () => {
    expect(output.criticalPath.length).toBeGreaterThan(0);
    const critical = new Set(output.criticalPath.map(String));

    const predsOf = new Map<string, string[]>();
    for (const dep of dependencies) {
      const succ = String(dep.successorId);
      const pred = String(dep.predecessorId);
      if (!critical.has(succ) || !leafIds.has(dep.predecessorId) || !leafIds.has(dep.successorId)) {
        continue;
      }
      const list = predsOf.get(succ) ?? [];
      list.push(pred);
      predsOf.set(succ, list);
    }

    for (const id of critical) {
      const preds = predsOf.get(id) ?? [];
      if (preds.length === 0) {
        continue; // project-start root
      }
      expect(
        preds.some((p) => critical.has(p)),
        `critical task ${id} has no critical predecessor (preds=${preds.join(',')})`,
      ).toBe(true);
    }
  });

  it('every leaf spans exactly its duration in working time on its own calendar', () => {
    // §11.2 "no scheduled time falls in non-working time": earlyStart may sit
    // on a non-working boundary (e.g. a holiday 9am handoff) while work itself
    // only consumes working minutes — workingMinutesBetween === duration.
    for (const id of leafIds) {
      const task = taskById.get(id)!;
      const sched = output.tasks.get(id)!;
      const cal = calendars.get(task.calendarId)!;
      expect(
        workingMinutesBetween(sched.earlyStart, sched.earlyFinish, cal),
        String(id),
      ).toBe(task.durationMinutes);
    }
  });

  it('schedule() is deterministic: re-running on the same input is byte-identical', () => {
    const again = schedule({
      projectStart: asEpochMinutes(input.projectStart),
      tasks,
      dependencies,
      calendars,
      defaultCalendarId,
    });
    expect(serializeOutput(again)).toBe(serializeOutput(output));
  });
});

import { describe, expect, it } from 'vitest';

import { compileCalendar, type CalendarCompilationInput } from '../src/calendar.js';
import { schedule, type SchedulerInput } from '../src/schedule.js';
import { SchedulingError } from '../src/graphValidation.js';
import type { DependencyInput, TaskInput } from '../src/taskTypes.js';
import { asCalendarId, asEpochMinutes, asTaskId, MINUTES_PER_DAY } from '../src/types.js';

const MONDAY = asEpochMinutes(4 * MINUTES_PER_DAY);
const NINE_AM = 9 * 60;
const FIVE_PM = 17 * 60;

const CAL = asCalendarId('cal-1');

const MON_FRI_9_5: CalendarCompilationInput = {
  horizonStart: MONDAY,
  horizonDays: 30,
  workingWeekdays: [1, 2, 3, 4, 5],
  defaultStartMinute: NINE_AM,
  defaultFinishMinute: FIVE_PM,
};

const calendars = new Map([[CAL, compileCalendar(MON_FRI_9_5)]]);
const projectStart = asEpochMinutes(MONDAY + NINE_AM);

function leaf(id: string, parentId: string | null, durationMinutes: number): TaskInput {
  return {
    id: asTaskId(id),
    parentId: parentId === null ? null : asTaskId(parentId),
    isSummary: false,
    durationMinutes,
    calendarId: CAL,
  };
}

function summary(id: string, parentId: string | null): TaskInput {
  return {
    id: asTaskId(id),
    parentId: parentId === null ? null : asTaskId(parentId),
    isSummary: true,
    durationMinutes: 0,
    calendarId: CAL,
  };
}

function fs(predecessorId: string, successorId: string): DependencyInput {
  return {
    predecessorId: asTaskId(predecessorId),
    successorId: asTaskId(successorId),
    linkType: 'FS',
    lagMinutes: 0,
    lagPercent: null,
  };
}

function baseInput(overrides: Partial<SchedulerInput> = {}): SchedulerInput {
  return {
    projectStart,
    tasks: [],
    dependencies: [],
    calendars,
    defaultCalendarId: CAL,
    ...overrides,
  };
}

describe('schedule() (§4.1)', () => {
  it('a single task defines projectFinish, has zero float, and is critical', () => {
    const tasks = [leaf('A', null, 240)];
    const output = schedule(baseInput({ tasks }));

    const a = output.tasks.get(asTaskId('A'));
    expect(a?.earlyStart).toBe(projectStart);
    expect(a?.totalFloatMinutes).toBe(0);
    expect(a?.isCritical).toBe(true);
    expect(output.projectFinish).toBe(a?.earlyFinish);
    expect(output.criticalPath).toEqual([asTaskId('A')]);
  });

  it('a parallel shorter task has positive float and is excluded from the critical path', () => {
    const tasks = [leaf('A', null, 240), leaf('B', null, 240), leaf('Short', null, 60)];
    const deps = [fs('A', 'B')]; // A->B is the 8h critical chain; Short (1h) is slack.
    const output = schedule(baseInput({ tasks, dependencies: deps }));

    const short = output.tasks.get(asTaskId('Short'));
    expect(short?.totalFloatMinutes).toBeGreaterThan(0);
    expect(short?.isCritical).toBe(false);
    expect(output.criticalPath).toEqual([asTaskId('A'), asTaskId('B')]);
  });

  it('a summary task appears in the output with null late/float fields and rolled-up dates', () => {
    const tasks = [summary('S', null), leaf('A', 'S', 240)];
    const output = schedule(baseInput({ tasks }));

    const s = output.tasks.get(asTaskId('S'));
    const a = output.tasks.get(asTaskId('A'));
    expect(s?.earlyStart).toBe(a?.earlyStart);
    expect(s?.earlyFinish).toBe(a?.earlyFinish);
    expect(s?.lateStart).toBeNull();
    expect(s?.lateFinish).toBeNull();
    expect(s?.totalFloatMinutes).toBeNull();
    expect(s?.freeFloatMinutes).toBeNull();
    expect(s?.isCritical).toBe(true); // its only child is the critical (sole) task
  });

  it('rejects an invalid graph before running any pass', () => {
    const tasks = [leaf('A', null, 60), leaf('B', null, 60)];
    const deps = [fs('A', 'B'), fs('B', 'A')]; // cycle

    expect(() => schedule(baseInput({ tasks, dependencies: deps }))).toThrow(SchedulingError);
  });

  it('rejects a defaultCalendarId that is not in the compiled calendars map', () => {
    expect(() => schedule(baseInput({ defaultCalendarId: asCalendarId('does-not-exist') }))).toThrow();
  });

  it('produces no warnings (constraint types are not implemented yet — Phase 2)', () => {
    const tasks = [leaf('A', null, 60)];
    const output = schedule(baseInput({ tasks }));

    expect(output.warnings).toEqual([]);
  });
});

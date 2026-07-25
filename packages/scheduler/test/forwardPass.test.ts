import { describe, expect, it } from 'vitest';

import { addWorkingMinutes, compileCalendar, subtractWorkingMinutes, type CalendarCompilationInput } from '../src/calendar.js';
import { runForwardPass, type DependencyInput, type LinkType, type TaskInput } from '../src/forwardPass.js';
import type { ConstraintType } from '../src/taskTypes.js';
import { asCalendarId, asEpochMinutes, asTaskId, MINUTES_PER_DAY, type EpochMinutes } from '../src/types.js';

// Same anchor as calendar.test.ts: day 4 since epoch (1970-01-05) was a Monday.
const MONDAY = asEpochMinutes(4 * MINUTES_PER_DAY);
const NINE_AM = 9 * 60;
const FIVE_PM = 17 * 60;
const ONE_PM = 13 * 60;

const CAL = asCalendarId('cal-1');
const CAL_24_7 = asCalendarId('cal-24-7');

const MON_FRI_9_5: CalendarCompilationInput = {
  horizonStart: MONDAY,
  horizonDays: 30,
  workingWeekdays: [1, 2, 3, 4, 5],
  defaultStartMinute: NINE_AM,
  defaultFinishMinute: FIVE_PM,
};

const calendars = new Map([
  [CAL, compileCalendar(MON_FRI_9_5)],
  [
    CAL_24_7,
    compileCalendar({
      horizonStart: MONDAY,
      horizonDays: 30,
      workingWeekdays: [0, 1, 2, 3, 4, 5, 6],
      defaultStartMinute: 0,
      defaultFinishMinute: MINUTES_PER_DAY,
    }),
  ],
]);

function task(
  id: string,
  durationMinutes: number,
  calendarId = CAL,
  isSummary = false,
  constraintType: ConstraintType | null = null,
  constraintDate: EpochMinutes | null = null,
): TaskInput {
  return {
    id: asTaskId(id),
    parentId: null,
    isSummary,
    durationMinutes,
    calendarId,
    constraintType,
    constraintDate,
  };
}

function dep(
  predecessorId: string,
  successorId: string,
  linkType: LinkType = 'FS',
  lagMinutes = 0,
  lagPercent: number | null = null,
): DependencyInput {
  return {
    predecessorId: asTaskId(predecessorId),
    successorId: asTaskId(successorId),
    linkType,
    lagMinutes,
    lagPercent,
  };
}

function fs(predecessorId: string, successorId: string, lagMinutes = 0): DependencyInput {
  return dep(predecessorId, successorId, 'FS', lagMinutes);
}

const projectStart = asEpochMinutes(MONDAY + NINE_AM); // Monday 9am, a working instant
const cal = calendars.get(CAL)!;

describe('runForwardPass — all link types + lag (§4.4)', () => {
  it('a single task with no predecessors starts at projectStart', () => {
    const tasks = [task('A', 480)]; // 8 hours = one full working day
    const { results: result } = runForwardPass(projectStart, tasks, [], calendars);

    expect(result.get(asTaskId('A'))).toEqual({
      earlyStart: projectStart,
      earlyFinish: asEpochMinutes(MONDAY + FIVE_PM),
    });
  });

  it('a simple FS chain: successor starts exactly when predecessor finishes', () => {
    const tasks = [task('A', 240), task('B', 120)]; // A: 4h, B: 2h
    const deps = [fs('A', 'B')];
    const { results: result } = runForwardPass(projectStart, tasks, deps, calendars);

    const a = result.get(asTaskId('A'));
    const b = result.get(asTaskId('B'));
    expect(a?.earlyFinish).toBe(asEpochMinutes(MONDAY + ONE_PM)); // 9am + 4h = 1pm
    expect(b?.earlyStart).toBe(a?.earlyFinish);
    expect(b?.earlyFinish).toBe(asEpochMinutes(MONDAY + ONE_PM + 120));
  });

  it('FS with positive lag: successor starts lag minutes after predecessor finishes', () => {
    const tasks = [task('A', 240), task('B', 60)];
    const deps = [fs('A', 'B', 60)]; // 1 hour lag
    const { results: result } = runForwardPass(projectStart, tasks, deps, calendars);

    const a = result.get(asTaskId('A'));
    const b = result.get(asTaskId('B'));
    // A finishes 1pm; +60 lag minutes of working time -> 2pm (still within the working day).
    expect(b?.earlyStart).toBe(asEpochMinutes((a?.earlyFinish ?? 0) + 60));
  });

  it('convergence: a task with two predecessors starts at the later of their finishes', () => {
    const tasks = [task('A', 480), task('B', 120), task('C', 60)]; // A: full day, B: 2h
    const deps = [fs('A', 'C'), fs('B', 'C')];
    const { results: result } = runForwardPass(projectStart, tasks, deps, calendars);

    const a = result.get(asTaskId('A'));
    const b = result.get(asTaskId('B'));
    const c = result.get(asTaskId('C'));
    expect(a?.earlyFinish).toBeGreaterThan(b?.earlyFinish ?? 0);
    expect(c?.earlyStart).toBe(a?.earlyFinish); // the later one wins
  });

  it('independent tasks with no dependencies all start at projectStart', () => {
    const tasks = [task('A', 60), task('B', 120), task('C', 30)];
    const { results: result } = runForwardPass(projectStart, tasks, [], calendars);

    for (const id of ['A', 'B', 'C']) {
      expect(result.get(asTaskId(id))?.earlyStart).toBe(projectStart);
    }
  });

  it('each task uses its own calendar', () => {
    const tasks = [task('A', 480, CAL), task('B', 480, CAL_24_7)];
    const { results: result } = runForwardPass(projectStart, tasks, [], calendars);

    // Mon-Fri 9-5 calendar: 480 min lands exactly at 5pm.
    expect(result.get(asTaskId('A'))?.earlyFinish).toBe(asEpochMinutes(MONDAY + FIVE_PM));
    // 24/7 calendar: 480 min is plain addition from projectStart.
    expect(result.get(asTaskId('B'))?.earlyFinish).toBe(asEpochMinutes(projectStart + 480));
  });

  it('a milestone (zero duration) has earlyFinish === earlyStart', () => {
    const tasks = [task('A', 240), task('M', 0)];
    const deps = [fs('A', 'M')];
    const { results: result } = runForwardPass(projectStart, tasks, deps, calendars);

    const m = result.get(asTaskId('M'));
    expect(m?.earlyFinish).toBe(m?.earlyStart);
  });

  it('excludes summary tasks from the computed schedule entirely', () => {
    const tasks = [task('Summary', 0, CAL, true), task('Leaf', 60)];
    const { results: result } = runForwardPass(projectStart, tasks, [], calendars);

    expect(result.has(asTaskId('Summary'))).toBe(false);
    expect(result.has(asTaskId('Leaf'))).toBe(true);
  });

  it('SS with positive lag: successor starts lag after predecessor starts', () => {
    const tasks = [task('A', 240), task('B', 240)];
    const deps = [dep('A', 'B', 'SS', 60)];
    const { results: result } = runForwardPass(projectStart, tasks, deps, calendars);

    const a = result.get(asTaskId('A'))!;
    const b = result.get(asTaskId('B'))!;
    expect(b.earlyStart).toBe(addWorkingMinutes(a.earlyStart, 60, cal));
    expect(b.earlyFinish).toBe(addWorkingMinutes(b.earlyStart, 240, cal));
  });

  it('FF: successor early-finish matches predecessor early-finish (lag 0)', () => {
    const tasks = [task('A', 480), task('B', 240)];
    const deps = [dep('A', 'B', 'FF', 0)];
    const { results: result } = runForwardPass(projectStart, tasks, deps, calendars);

    const a = result.get(asTaskId('A'))!;
    const b = result.get(asTaskId('B'))!;
    expect(b.earlyFinish).toBe(a.earlyFinish);
    expect(b.earlyStart).toBe(subtractWorkingMinutes(a.earlyFinish, 240, cal));
  });

  it('SF with positive lag: successor finish is driven from predecessor start + lag', () => {
    const tasks = [task('A', 240), task('B', 120)];
    const deps = [dep('A', 'B', 'SF', 240)];
    const { results: result } = runForwardPass(projectStart, tasks, deps, calendars);

    const a = result.get(asTaskId('A'))!;
    const b = result.get(asTaskId('B'))!;
    const candidateFinish = addWorkingMinutes(a.earlyStart, 240, cal);
    expect(b.earlyFinish).toBe(candidateFinish);
    expect(b.earlyStart).toBe(subtractWorkingMinutes(candidateFinish, 120, cal));
  });

  it('negative lag (lead) on FS pulls the successor earlier', () => {
    const tasks = [task('A', 240), task('B', 240)];
    const deps = [fs('A', 'B', -60)];
    const { results: result } = runForwardPass(projectStart, tasks, deps, calendars);

    const a = result.get(asTaskId('A'))!;
    const b = result.get(asTaskId('B'))!;
    expect(b.earlyStart).toBe(subtractWorkingMinutes(a.earlyFinish, 60, cal));
  });

  it('lagPercent replaces lagMinutes as a percentage of predecessor duration', () => {
    const tasks = [task('A', 240), task('B', 60)];
    // 50% of 240 = 120; lagMinutes is ignored when lagPercent is set.
    const deps = [dep('A', 'B', 'FS', 9999, 50)];
    const { results: result } = runForwardPass(projectStart, tasks, deps, calendars);

    const a = result.get(asTaskId('A'))!;
    const b = result.get(asTaskId('B'))!;
    expect(b.earlyStart).toBe(addWorkingMinutes(a.earlyFinish, 120, cal));
  });

  it('throws when a task references a calendar that was not compiled', () => {
    const tasks = [task('A', 60, asCalendarId('unknown'))];

    expect(() => runForwardPass(projectStart, tasks, [], calendars)).toThrow();
  });
});

describe('runForwardPass — constraints (§4.4 / §13 item 29)', () => {
  it('SNET no-op when dependency start is already later than constraintDate', () => {
    const tasks = [
      task('A', 240),
      task('B', 60, CAL, false, 'snet', asEpochMinutes(MONDAY + NINE_AM)),
    ];
    const { results, warnings } = runForwardPass(projectStart, tasks, [fs('A', 'B')], calendars);
    const a = results.get(asTaskId('A'))!;
    const b = results.get(asTaskId('B'))!;
    expect(b.earlyStart).toBe(a.earlyFinish); // dep wins; SNET at 9am is earlier
    expect(warnings).toEqual([]);
  });

  it('SNET pushes earlyStart later when constraintDate is after depEarlyStart', () => {
    const constraintDate = asEpochMinutes(MONDAY + ONE_PM + 60); // Mon 2pm
    const tasks = [task('A', 240), task('B', 60, CAL, false, 'snet', constraintDate)];
    const { results, warnings } = runForwardPass(projectStart, tasks, [fs('A', 'B')], calendars);
    expect(results.get(asTaskId('B'))!.earlyStart).toBe(constraintDate);
    expect(warnings).toEqual([]);
  });

  it('FNET no-op when unconstrained finish already meets constraintDate', () => {
    const tasks = [
      task('A', 240),
      task('B', 240, CAL, false, 'fnet', asEpochMinutes(MONDAY + ONE_PM)), // 1pm; B finishes 5pm
    ];
    const { results, warnings } = runForwardPass(projectStart, tasks, [fs('A', 'B')], calendars);
    const b = results.get(asTaskId('B'))!;
    expect(b.earlyStart).toBe(asEpochMinutes(MONDAY + ONE_PM));
    expect(b.earlyFinish).toBe(asEpochMinutes(MONDAY + FIVE_PM));
    expect(warnings).toEqual([]);
  });

  it('FNET pushes finish later and re-derives earlyStart backward', () => {
    const constraintDate = asEpochMinutes(MONDAY + FIVE_PM); // force finish at 5pm
    // A 60min → B would start ~10am and finish ~2pm unconstrained; FNET 5pm stretches it.
    const tasks = [task('A', 60), task('B', 240, CAL, false, 'fnet', constraintDate)];
    const { results, warnings } = runForwardPass(projectStart, tasks, [fs('A', 'B')], calendars);
    const b = results.get(asTaskId('B'))!;
    expect(b.earlyFinish).toBe(constraintDate);
    expect(b.earlyStart).toBe(subtractWorkingMinutes(constraintDate, 240, cal));
    expect(warnings).toEqual([]);
  });

  it('MSO hard-overrides dependency start and emits CONSTRAINT_OVERRIDES_DEPENDENCY', () => {
    const mso = asEpochMinutes(MONDAY + ONE_PM + 120); // Mon 3pm; dep would start at 1pm
    const tasks = [task('A', 240), task('B', 60, CAL, false, 'mso', mso)];
    const { results, warnings } = runForwardPass(projectStart, tasks, [fs('A', 'B')], calendars);
    expect(results.get(asTaskId('B'))!.earlyStart).toBe(mso);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe('CONSTRAINT_OVERRIDES_DEPENDENCY');
    expect(warnings[0]?.taskIds.map(String)).toEqual(['B']);
  });

  it('MSO with constraintDate equal to depEarlyStart emits no warning', () => {
    const tasks = [task('A', 240), task('B', 60, CAL, false, 'mso', asEpochMinutes(MONDAY + ONE_PM))];
    const { results, warnings } = runForwardPass(projectStart, tasks, [fs('A', 'B')], calendars);
    expect(results.get(asTaskId('B'))!.earlyStart).toBe(asEpochMinutes(MONDAY + ONE_PM));
    expect(warnings).toEqual([]);
  });

  it('MFO hard-overrides finish and emits CONSTRAINT_OVERRIDES_DEPENDENCY when start moves', () => {
    const mfo = asEpochMinutes(MONDAY + FIVE_PM); // finish 5pm; unconstrained B (after A@1pm, 60min) finishes 2pm
    const tasks = [task('A', 240), task('B', 60, CAL, false, 'mfo', mfo)];
    const { results, warnings } = runForwardPass(projectStart, tasks, [fs('A', 'B')], calendars);
    const b = results.get(asTaskId('B'))!;
    expect(b.earlyFinish).toBe(mfo);
    expect(b.earlyStart).toBe(subtractWorkingMinutes(mfo, 60, cal));
    expect(warnings[0]?.code).toBe('CONSTRAINT_OVERRIDES_DEPENDENCY');
  });

  it('SNLT does not move the task; emits SOFT_CONSTRAINT_VIOLATED when violated', () => {
    const snlt = asEpochMinutes(MONDAY + NINE_AM); // 9am; B starts at 1pm after A
    const tasks = [task('A', 240), task('B', 60, CAL, false, 'snlt', snlt)];
    const { results, warnings } = runForwardPass(projectStart, tasks, [fs('A', 'B')], calendars);
    expect(results.get(asTaskId('B'))!.earlyStart).toBe(asEpochMinutes(MONDAY + ONE_PM));
    expect(warnings[0]?.code).toBe('SOFT_CONSTRAINT_VIOLATED');
  });

  it('SNLT emits no warning when satisfied', () => {
    const snlt = asEpochMinutes(MONDAY + FIVE_PM); // 5pm; B starts 1pm — ok
    const tasks = [task('A', 240), task('B', 60, CAL, false, 'snlt', snlt)];
    const { warnings } = runForwardPass(projectStart, tasks, [fs('A', 'B')], calendars);
    expect(warnings).toEqual([]);
  });

  it('FNLT does not move the task; emits SOFT_CONSTRAINT_VIOLATED when violated', () => {
    const fnlt = asEpochMinutes(MONDAY + ONE_PM); // 1pm; B finishes 2pm
    const tasks = [task('A', 240), task('B', 60, CAL, false, 'fnlt', fnlt)];
    const { results, warnings } = runForwardPass(projectStart, tasks, [fs('A', 'B')], calendars);
    expect(results.get(asTaskId('B'))!.earlyFinish).toBe(asEpochMinutes(MONDAY + ONE_PM + 60));
    expect(warnings[0]?.code).toBe('SOFT_CONSTRAINT_VIOLATED');
  });

  it('FNLT emits no warning when satisfied', () => {
    const fnlt = asEpochMinutes(MONDAY + FIVE_PM);
    const tasks = [task('A', 240), task('B', 60, CAL, false, 'fnlt', fnlt)];
    const { warnings } = runForwardPass(projectStart, tasks, [fs('A', 'B')], calendars);
    expect(warnings).toEqual([]);
  });

  it('throws when a date-requiring constraint has a null constraintDate', () => {
    const tasks = [task('A', 60, CAL, false, 'snet', null)];
    expect(() => runForwardPass(projectStart, tasks, [], calendars)).toThrow(/requires a constraintDate/);
  });

  it('ALAP with successors throws', () => {
    const tasks = [task('A', 60, CAL, false, 'alap', null), task('B', 60)];
    expect(() => runForwardPass(projectStart, tasks, [fs('A', 'B')], calendars)).toThrow(/successors/);
  });

  it('ALAP with no successors also throws (not half-implemented)', () => {
    const tasks = [task('A', 60, CAL, false, 'alap', null)];
    expect(() => runForwardPass(projectStart, tasks, [], calendars)).toThrow(/not yet implemented/);
  });
});

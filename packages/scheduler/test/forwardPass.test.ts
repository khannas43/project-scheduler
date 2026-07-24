import { describe, expect, it } from 'vitest';

import { compileCalendar, type CalendarCompilationInput } from '../src/calendar.js';
import { runForwardPass, type DependencyInput, type TaskInput } from '../src/forwardPass.js';
import { asCalendarId, asEpochMinutes, asTaskId, MINUTES_PER_DAY } from '../src/types.js';

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

function task(id: string, durationMinutes: number, calendarId = CAL, isSummary = false): TaskInput {
  return { id: asTaskId(id), isSummary, durationMinutes, calendarId };
}

function fs(predecessorId: string, successorId: string, lagMinutes = 0): DependencyInput {
  return { predecessorId: asTaskId(predecessorId), successorId: asTaskId(successorId), linkType: 'FS', lagMinutes };
}

const projectStart = asEpochMinutes(MONDAY + NINE_AM); // Monday 9am, a working instant

describe('runForwardPass — FS links only (§4.4)', () => {
  it('a single task with no predecessors starts at projectStart', () => {
    const tasks = [task('A', 480)]; // 8 hours = one full working day
    const result = runForwardPass(projectStart, tasks, [], calendars);

    expect(result.get(asTaskId('A'))).toEqual({
      earlyStart: projectStart,
      earlyFinish: asEpochMinutes(MONDAY + FIVE_PM),
    });
  });

  it('a simple FS chain: successor starts exactly when predecessor finishes', () => {
    const tasks = [task('A', 240), task('B', 120)]; // A: 4h, B: 2h
    const deps = [fs('A', 'B')];
    const result = runForwardPass(projectStart, tasks, deps, calendars);

    const a = result.get(asTaskId('A'));
    const b = result.get(asTaskId('B'));
    expect(a?.earlyFinish).toBe(asEpochMinutes(MONDAY + ONE_PM)); // 9am + 4h = 1pm
    expect(b?.earlyStart).toBe(a?.earlyFinish);
    expect(b?.earlyFinish).toBe(asEpochMinutes(MONDAY + ONE_PM + 120));
  });

  it('FS with positive lag: successor starts lag minutes after predecessor finishes', () => {
    const tasks = [task('A', 240), task('B', 60)];
    const deps = [fs('A', 'B', 60)]; // 1 hour lag
    const result = runForwardPass(projectStart, tasks, deps, calendars);

    const a = result.get(asTaskId('A'));
    const b = result.get(asTaskId('B'));
    // A finishes 1pm; +60 lag minutes of working time -> 2pm (still within the working day).
    expect(b?.earlyStart).toBe(asEpochMinutes((a?.earlyFinish ?? 0) + 60));
  });

  it('convergence: a task with two predecessors starts at the later of their finishes', () => {
    const tasks = [task('A', 480), task('B', 120), task('C', 60)]; // A: full day, B: 2h
    const deps = [fs('A', 'C'), fs('B', 'C')];
    const result = runForwardPass(projectStart, tasks, deps, calendars);

    const a = result.get(asTaskId('A'));
    const b = result.get(asTaskId('B'));
    const c = result.get(asTaskId('C'));
    expect(a?.earlyFinish).toBeGreaterThan(b?.earlyFinish ?? 0);
    expect(c?.earlyStart).toBe(a?.earlyFinish); // the later one wins
  });

  it('independent tasks with no dependencies all start at projectStart', () => {
    const tasks = [task('A', 60), task('B', 120), task('C', 30)];
    const result = runForwardPass(projectStart, tasks, [], calendars);

    for (const id of ['A', 'B', 'C']) {
      expect(result.get(asTaskId(id))?.earlyStart).toBe(projectStart);
    }
  });

  it('each task uses its own calendar', () => {
    const tasks = [task('A', 480, CAL), task('B', 480, CAL_24_7)];
    const result = runForwardPass(projectStart, tasks, [], calendars);

    // Mon-Fri 9-5 calendar: 480 min lands exactly at 5pm.
    expect(result.get(asTaskId('A'))?.earlyFinish).toBe(asEpochMinutes(MONDAY + FIVE_PM));
    // 24/7 calendar: 480 min is plain addition from projectStart.
    expect(result.get(asTaskId('B'))?.earlyFinish).toBe(asEpochMinutes(projectStart + 480));
  });

  it('a milestone (zero duration) has earlyFinish === earlyStart', () => {
    const tasks = [task('A', 240), task('M', 0)];
    const deps = [fs('A', 'M')];
    const result = runForwardPass(projectStart, tasks, deps, calendars);

    const m = result.get(asTaskId('M'));
    expect(m?.earlyFinish).toBe(m?.earlyStart);
  });

  it('excludes summary tasks from the computed schedule entirely', () => {
    const tasks = [task('Summary', 0, CAL, true), task('Leaf', 60)];
    const result = runForwardPass(projectStart, tasks, [], calendars);

    expect(result.has(asTaskId('Summary'))).toBe(false);
    expect(result.has(asTaskId('Leaf'))).toBe(true);
  });

  it('rejects a non-FS link type (not yet implemented)', () => {
    const tasks = [task('A', 60), task('B', 60)];
    const deps: DependencyInput[] = [{ predecessorId: asTaskId('A'), successorId: asTaskId('B'), linkType: 'SS', lagMinutes: 0 }];

    expect(() => runForwardPass(projectStart, tasks, deps, calendars)).toThrow();
  });

  it('rejects negative lag (not yet implemented)', () => {
    const tasks = [task('A', 60), task('B', 60)];
    const deps = [fs('A', 'B', -30)];

    expect(() => runForwardPass(projectStart, tasks, deps, calendars)).toThrow();
  });

  it('throws when a task references a calendar that was not compiled', () => {
    const tasks = [task('A', 60, asCalendarId('unknown'))];

    expect(() => runForwardPass(projectStart, tasks, [], calendars)).toThrow();
  });
});

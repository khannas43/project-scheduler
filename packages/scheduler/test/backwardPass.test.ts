import { describe, expect, it } from 'vitest';

import { addWorkingMinutes, compileCalendar, subtractWorkingMinutes, type CalendarCompilationInput } from '../src/calendar.js';
import { runBackwardPass } from '../src/backwardPass.js';
import type { DependencyInput, LinkType, TaskInput } from '../src/forwardPass.js';
import { asCalendarId, asEpochMinutes, asTaskId, MINUTES_PER_DAY } from '../src/types.js';

// Same anchor as the other test files: day 4 since epoch (1970-01-05) was a Monday.
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

function task(id: string, durationMinutes: number, calendarId = CAL, isSummary = false): TaskInput {
  return { id: asTaskId(id), parentId: null, isSummary, durationMinutes, calendarId };
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

const projectFinish = asEpochMinutes(MONDAY + FIVE_PM); // Monday 5pm
const cal = calendars.get(CAL)!;

describe('runBackwardPass — all link types + lag (§4.5)', () => {
  it('a single task with no successors finishes at projectFinish', () => {
    const tasks = [task('A', 480)]; // one full working day
    const result = runBackwardPass(projectFinish, tasks, [], calendars);

    expect(result.get(asTaskId('A'))).toEqual({
      lateFinish: projectFinish,
      lateStart: asEpochMinutes(MONDAY + NINE_AM),
    });
  });

  it('a simple FS chain: predecessor finishes exactly when successor starts', () => {
    const tasks = [task('A', 240), task('B', 120)];
    const deps = [fs('A', 'B')];
    const result = runBackwardPass(projectFinish, tasks, deps, calendars);

    const a = result.get(asTaskId('A'));
    const b = result.get(asTaskId('B'));
    expect(b?.lateFinish).toBe(projectFinish);
    expect(a?.lateFinish).toBe(b?.lateStart);
  });

  it('FS with positive lag: predecessor must finish lag minutes before successor starts', () => {
    const tasks = [task('A', 60), task('B', 60)];
    const deps = [fs('A', 'B', 60)];
    const result = runBackwardPass(projectFinish, tasks, deps, calendars);

    const a = result.get(asTaskId('A'));
    const b = result.get(asTaskId('B'));
    expect(a?.lateFinish).toBe(asEpochMinutes((b?.lateStart ?? 0) - 60));
  });

  it('divergence: a predecessor of two successors finishes at the earlier of their required starts', () => {
    const tasks = [task('A', 60), task('B', 120), task('C', 60)];
    const deps = [fs('A', 'B'), fs('A', 'C')];
    const result = runBackwardPass(projectFinish, tasks, deps, calendars);

    const b = result.get(asTaskId('B'));
    const c = result.get(asTaskId('C'));
    const a = result.get(asTaskId('A'));
    expect(b?.lateStart).toBeLessThan(c?.lateStart ?? Infinity);
    expect(a?.lateFinish).toBe(b?.lateStart); // the earlier one constrains A
  });

  it('a milestone (zero duration) has lateStart === lateFinish', () => {
    const tasks = [task('M', 0), task('B', 240)];
    const deps = [fs('M', 'B')];
    const result = runBackwardPass(projectFinish, tasks, deps, calendars);

    const m = result.get(asTaskId('M'));
    expect(m?.lateStart).toBe(m?.lateFinish);
  });

  it('excludes summary tasks from the computed schedule entirely', () => {
    const tasks = [task('Summary', 0, CAL, true), task('Leaf', 60)];
    const result = runBackwardPass(projectFinish, tasks, [], calendars);

    expect(result.has(asTaskId('Summary'))).toBe(false);
    expect(result.has(asTaskId('Leaf'))).toBe(true);
  });

  it('FF: predecessor late-finish matches successor late-finish (lag 0)', () => {
    const tasks = [task('A', 480), task('B', 240)];
    const deps = [dep('A', 'B', 'FF', 0)];
    const result = runBackwardPass(projectFinish, tasks, deps, calendars);

    const a = result.get(asTaskId('A'))!;
    const b = result.get(asTaskId('B'))!;
    expect(a.lateFinish).toBe(b.lateFinish);
    expect(a.lateStart).toBe(subtractWorkingMinutes(a.lateFinish, 480, cal));
  });

  it('SS with positive lag: predecessor late-start derives from successor late-start − lag', () => {
    const tasks = [task('A', 240), task('B', 240)];
    const deps = [dep('A', 'B', 'SS', 60)];
    const result = runBackwardPass(projectFinish, tasks, deps, calendars);

    const a = result.get(asTaskId('A'))!;
    const b = result.get(asTaskId('B'))!;
    const candidateStart = subtractWorkingMinutes(b.lateStart, 60, cal);
    expect(a.lateFinish).toBe(addWorkingMinutes(candidateStart, 240, cal));
  });

  it('negative lag (lead) on FS pushes the predecessor later', () => {
    const tasks = [task('A', 60), task('B', 60)];
    const deps = [fs('A', 'B', -30)];
    const result = runBackwardPass(projectFinish, tasks, deps, calendars);

    const a = result.get(asTaskId('A'))!;
    const b = result.get(asTaskId('B'))!;
    // Unapplying a negative lag adds working minutes to the successor's late start.
    expect(a.lateFinish).toBe(addWorkingMinutes(b.lateStart, 30, cal));
  });

  it('is consistent with the forward pass on a critical chain: no float when the chain exactly fills the horizon', async () => {
    const { runForwardPass } = await import('../src/forwardPass.js');
    const tasks = [task('A', 240), task('B', 240)];
    const deps = [fs('A', 'B')];
    const projectStart = asEpochMinutes(MONDAY + NINE_AM);
    const finish = asEpochMinutes(MONDAY + FIVE_PM);

    const { results: forward } = runForwardPass(projectStart, tasks, deps, calendars);
    const backward = runBackwardPass(finish, tasks, deps, calendars);

    // The chain exactly fills the working day with no slack, so early == late for every task.
    for (const id of ['A', 'B']) {
      expect(forward.get(asTaskId(id))?.earlyStart).toBe(backward.get(asTaskId(id))?.lateStart);
      expect(forward.get(asTaskId(id))?.earlyFinish).toBe(backward.get(asTaskId(id))?.lateFinish);
    }
  });
});

import { describe, expect, it } from 'vitest';

import { compileCalendar, type CalendarCompilationInput } from '../src/calendar.js';
import { computeFloat, extractCriticalPath } from '../src/float.js';
import { runBackwardPass } from '../src/backwardPass.js';
import { runForwardPass, type DependencyInput, type TaskInput } from '../src/forwardPass.js';
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

function task(id: string, durationMinutes: number): TaskInput {
  return { id: asTaskId(id), parentId: null, isSummary: false, durationMinutes, calendarId: CAL };
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

const projectStart = asEpochMinutes(MONDAY + NINE_AM);

/** Runs both passes and computeFloat together — the shape every test here needs. */
function schedule(tasks: TaskInput[], deps: DependencyInput[], projectFinish: ReturnType<typeof asEpochMinutes>) {
  const forward = runForwardPass(projectStart, tasks, deps, calendars);
  const backward = runBackwardPass(projectFinish, tasks, deps, calendars);
  return { forward, backward, float: computeFloat(forward, backward, deps) };
}

describe('computeFloat (§4.6)', () => {
  it('a lone critical chain that exactly fills the horizon has zero float and is critical', () => {
    const tasks = [task('A', 240), task('B', 240)];
    const deps = [fs('A', 'B')];
    const { float } = schedule(tasks, deps, asEpochMinutes(MONDAY + FIVE_PM));

    for (const id of ['A', 'B']) {
      const f = float.get(asTaskId(id));
      expect(f?.totalFloatMinutes).toBe(0);
      expect(f?.freeFloatMinutes).toBe(0);
      expect(f?.isCritical).toBe(true);
    }
  });

  it('a parallel path shorter than the critical path has positive float and is not critical', () => {
    // A (4h) -> C (4h) is critical (fills the 8h day exactly, matching projectFinish).
    // B (2h), also A's successor... no: give B no relation to the critical chain except
    // sharing the same finish deadline, so it clearly has slack.
    const tasks = [task('A', 240), task('B', 240), task('Short', 60)];
    const deps = [fs('A', 'B')];
    // projectFinish gives the critical chain (A->B, 8h) zero float; Short (1h, standalone)
    // has no dependency at all so it necessarily has slack against the same finish.
    const { float } = schedule(tasks, deps, asEpochMinutes(MONDAY + FIVE_PM));

    const short = float.get(asTaskId('Short'));
    expect(short?.totalFloatMinutes).toBeGreaterThan(0);
    expect(short?.isCritical).toBe(false);
  });

  it('free float: a task with slack before its successor must start reports that slack, not the chain total float', () => {
    // A (1h) -> B (1h) -> C (1h), but the project finish leaves 5h of slack overall.
    // A's free float is bounded by when B actually starts, not the full chain slack.
    const tasks = [task('A', 60), task('B', 60), task('C', 60)];
    const deps = [fs('A', 'B'), fs('B', 'C')];
    // 8h working day, chain only needs 3h -> 5h of total float on every task.
    const { forward, float } = schedule(tasks, deps, asEpochMinutes(MONDAY + FIVE_PM));

    const a = float.get(asTaskId('A'));
    const aForward = forward.get(asTaskId('A'));
    const bForward = forward.get(asTaskId('B'));
    expect(a?.totalFloatMinutes).toBeGreaterThan(0);
    // A's free float is exactly B's early start minus A's early finish — zero here,
    // since nothing delays B from starting the instant A finishes in the forward pass.
    expect(a?.freeFloatMinutes).toBe((bForward?.earlyStart ?? 0) - (aForward?.earlyFinish ?? 0));
  });

  it('a task with no successors has free float equal to its total float', () => {
    const tasks = [task('A', 60)];
    const { float } = schedule(tasks, [], asEpochMinutes(MONDAY + FIVE_PM));

    const a = float.get(asTaskId('A'));
    expect(a?.freeFloatMinutes).toBe(a?.totalFloatMinutes);
  });

  it('total float is negative for an over-constrained schedule (deadline earlier than the work needs)', () => {
    // A week of buffer before MONDAY so the backward pass has room to reach
    // before projectStart without running off the front of the horizon —
    // over-constraint means late_start ends up before early_start by
    // definition, and early_start here is pinned to the very first working
    // instant in the calendar (see the calendar-day/subtraction commentary
    // in calendar.test.ts's round-trip test for why that matters).
    const wideCal = asCalendarId('cal-wide');
    const wideCalendars = new Map([
      [
        wideCal,
        compileCalendar({
          ...MON_FRI_9_5,
          horizonStart: asEpochMinutes(MONDAY - 7 * MINUTES_PER_DAY),
          horizonDays: 37,
        }),
      ],
    ]);
    const tasks: TaskInput[] = [
      { id: asTaskId('A'), parentId: null, isSummary: false, durationMinutes: 480, calendarId: wideCal },
    ];

    const forward = runForwardPass(projectStart, tasks, [], wideCalendars);
    // Finish the project at 1pm, but A needs until 5pm -> negative float.
    const backward = runBackwardPass(asEpochMinutes(MONDAY + 13 * 60), tasks, [], wideCalendars);
    const float = computeFloat(forward, backward, []);

    const a = float.get(asTaskId('A'));
    expect(a?.totalFloatMinutes).toBeLessThan(0);
    expect(a?.isCritical).toBe(true); // negative float is still <= the 0 threshold
  });
});

describe('extractCriticalPath (§4.6)', () => {
  it('returns only the critical tasks, ordered by early start', () => {
    const tasks = [task('A', 240), task('B', 240), task('Short', 60)];
    const deps = [fs('A', 'B')];
    const { forward, float } = schedule(tasks, deps, asEpochMinutes(MONDAY + FIVE_PM));

    const criticalPath = extractCriticalPath(float, forward);

    expect(criticalPath).toEqual([asTaskId('A'), asTaskId('B')]);
  });
});

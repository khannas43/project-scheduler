import { describe, expect, it } from 'vitest';

import { compileCalendar, type CalendarCompilationInput } from '../src/calendar.js';
import { computeFloat } from '../src/float.js';
import { runForwardPass, type DependencyInput } from '../src/forwardPass.js';
import { rollupSummaries } from '../src/summaryRollup.js';
import type { TaskInput } from '../src/taskTypes.js';
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

function leaf(
  id: string,
  parentId: string | null,
  durationMinutes: number,
  percentComplete?: number | null,
): TaskInput {
  return {
    id: asTaskId(id),
    parentId: parentId === null ? null : asTaskId(parentId),
    isSummary: false,
    durationMinutes,
    calendarId: CAL,
    ...(percentComplete !== undefined ? { percentComplete } : {}),
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

const projectStart = asEpochMinutes(MONDAY + NINE_AM);

describe('rollupSummaries (§4.7)', () => {
  it('a summary spans the earliest start and latest finish of its direct children', () => {
    const tasks = [summary('S', null), leaf('A', 'S', 60), leaf('B', 'S', 120)];
    const deps: DependencyInput[] = [];
    const { results: forward } = runForwardPass(projectStart, tasks, deps, calendars);
    const float = computeFloat(forward, new Map([...forward].map(([id, f]) => [id, { ...f, lateStart: f.earlyStart, lateFinish: f.earlyFinish }])), deps);

    const rollup = rollupSummaries(tasks, forward, float, calendars);
    const s = rollup.get(asTaskId('S'));

    // Both A and B start at projectStart (no dependency between them); B is longer.
    expect(s?.earlyStart).toBe(projectStart);
    expect(s?.earlyFinish).toBe(forward.get(asTaskId('B'))?.earlyFinish);
  });

  it('duration is the working minutes spanned, not the sum of children durations', () => {
    // A (1h) -> B (1h) in sequence: children sum to 2h, but they're contiguous,
    // so the summary's spanned duration should also be 2h here (no gap) —
    // the point is this is *computed from the span*, not summed directly.
    const tasks = [summary('S', null), leaf('A', 'S', 60), leaf('B', 'S', 60)];
    const deps = [fs('A', 'B')];
    const { results: forward } = runForwardPass(projectStart, tasks, deps, calendars);
    const float = computeFloat(forward, new Map([...forward].map(([id, f]) => [id, { ...f, lateStart: f.earlyStart, lateFinish: f.earlyFinish }])), deps);

    const rollup = rollupSummaries(tasks, forward, float, calendars);
    const s = rollup.get(asTaskId('S'));

    expect(s?.durationMinutes).toBe(120);
  });

  it('a summary is critical if any direct child is critical', () => {
    const tasks = [summary('S', null), leaf('Critical', 'S', 240), leaf('Slack', 'S', 60)];
    const deps: DependencyInput[] = [];
    const { results: forward } = runForwardPass(projectStart, tasks, deps, calendars);
    // Give Critical zero float (late === early) and Slack plenty of float.
    const backward = new Map([
      [asTaskId('Critical'), { lateStart: forward.get(asTaskId('Critical'))!.earlyStart, lateFinish: forward.get(asTaskId('Critical'))!.earlyFinish }],
      [asTaskId('Slack'), { lateStart: asEpochMinutes(forward.get(asTaskId('Slack'))!.earlyStart + 10_000), lateFinish: asEpochMinutes(forward.get(asTaskId('Slack'))!.earlyFinish + 10_000) }],
    ]);
    const float = computeFloat(forward, backward, deps);

    const rollup = rollupSummaries(tasks, forward, float, calendars);
    expect(rollup.get(asTaskId('S'))?.isCritical).toBe(true);
  });

  it('a summary is not critical when no direct child is critical', () => {
    const tasks = [summary('S', null), leaf('A', 'S', 60)];
    const { results: forward } = runForwardPass(projectStart, tasks, [], calendars);
    const backward = new Map([
      [asTaskId('A'), { lateStart: asEpochMinutes(forward.get(asTaskId('A'))!.earlyStart + 10_000), lateFinish: asEpochMinutes(forward.get(asTaskId('A'))!.earlyFinish + 10_000) }],
    ]);
    const float = computeFloat(forward, backward, []);

    const rollup = rollupSummaries(tasks, forward, float, calendars);
    expect(rollup.get(asTaskId('S'))?.isCritical).toBe(false);
  });

  it('rolls up multi-level WBS trees bottom-up (a summary of summaries)', () => {
    const tasks = [
      summary('Root', null),
      summary('Mid', 'Root'),
      leaf('Leaf1', 'Mid', 60),
      leaf('Leaf2', 'Mid', 120),
      leaf('Sibling', 'Root', 30),
    ];
    const { results: forward } = runForwardPass(projectStart, tasks, [], calendars);
    const float = computeFloat(forward, new Map([...forward].map(([id, f]) => [id, { ...f, lateStart: f.earlyStart, lateFinish: f.earlyFinish }])), []);

    const rollup = rollupSummaries(tasks, forward, float, calendars);
    const mid = rollup.get(asTaskId('Mid'));
    const root = rollup.get(asTaskId('Root'));

    expect(mid?.earlyFinish).toBe(forward.get(asTaskId('Leaf2'))?.earlyFinish);
    // Root's span must account for Mid's rolled-up finish, not just its direct leaf child.
    expect(root?.earlyFinish).toBe(mid?.earlyFinish);
  });

  it('throws for a summary task with no children', () => {
    const tasks = [summary('Empty', null)];

    expect(() => rollupSummaries(tasks, new Map(), new Map(), calendars)).toThrow();
  });

  it('rolls up percentComplete as a duration-weighted average (null child → 0)', () => {
    // A 100% × 60 + B 0% × 120 + C null × 60 → (6000 + 0 + 0) / 240 = 25
    const tasks = [
      summary('S', null),
      leaf('A', 'S', 60, 100),
      leaf('B', 'S', 120, 0),
      leaf('C', 'S', 60, null),
    ];
    const { results: forward } = runForwardPass(projectStart, tasks, [], calendars);
    const float = computeFloat(
      forward,
      new Map(
        [...forward].map(([id, f]) => [
          id,
          { lateStart: f.earlyStart, lateFinish: f.earlyFinish },
        ]),
      ),
      [],
    );

    const rollup = rollupSummaries(tasks, forward, float, calendars);
    expect(rollup.get(asTaskId('S'))?.percentComplete).toBe(25);
  });

  it('returns null percentComplete when total child duration is zero (milestones)', () => {
    const tasks = [
      summary('S', null),
      leaf('M1', 'S', 0, 100),
      leaf('M2', 'S', 0, 50),
    ];
    const { results: forward } = runForwardPass(projectStart, tasks, [], calendars);
    const float = computeFloat(
      forward,
      new Map(
        [...forward].map(([id, f]) => [
          id,
          { lateStart: f.earlyStart, lateFinish: f.earlyFinish },
        ]),
      ),
      [],
    );

    const rollup = rollupSummaries(tasks, forward, float, calendars);
    expect(rollup.get(asTaskId('S'))?.percentComplete).toBeNull();
  });

  it('composes nested percentComplete bottom-up (grandparent uses mid rollup)', () => {
    // Mid: (100×60 + 50×120) / 180 = 66.666…
    // Both leaves start together → Mid.durationMinutes = 120 (span of Leaf2).
    // Root: (Mid.pct×120 + Sibling 0%×30) / 150 = Mid.pct × 120 / 150
    const tasks = [
      summary('Root', null),
      summary('Mid', 'Root'),
      leaf('Leaf1', 'Mid', 60, 100),
      leaf('Leaf2', 'Mid', 120, 50),
      leaf('Sibling', 'Root', 30, 0),
    ];
    const { results: forward } = runForwardPass(projectStart, tasks, [], calendars);
    const float = computeFloat(
      forward,
      new Map(
        [...forward].map(([id, f]) => [
          id,
          { lateStart: f.earlyStart, lateFinish: f.earlyFinish },
        ]),
      ),
      [],
    );

    const rollup = rollupSummaries(tasks, forward, float, calendars);
    const midPct = (100 * 60 + 50 * 120) / 180;
    const midDuration = rollup.get(asTaskId('Mid'))?.durationMinutes;
    expect(midDuration).toBe(120);
    expect(rollup.get(asTaskId('Mid'))?.percentComplete).toBeCloseTo(midPct, 10);

    const rootPct = (midPct * 120 + 0 * 30) / 150;
    expect(rollup.get(asTaskId('Root'))?.percentComplete).toBeCloseTo(rootPct, 10);
  });
});

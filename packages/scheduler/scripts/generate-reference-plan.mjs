/* eslint-disable no-undef -- Node script (console); not part of the package runtime */
/**
 * One-shot generator for packages/scheduler/test/golden/200-reference-plan/.
 * Run from repo root after `pnpm --filter @pkg/scheduler build`:
 *   node packages/scheduler/scripts/generate-reference-plan.mjs
 *
 * Spine tasks use full-day (480 min) durations so calendar packing doesn't
 * insert float gaps that fracture the classical critical-path chain.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  addWorkingMinutes,
  asCalendarId,
  asEpochMinutes,
  asTaskId,
  compileCalendar,
  MINUTES_PER_DAY,
  schedule,
} from '../dist/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '../test/golden/200-reference-plan');

const MONDAY = 4 * MINUTES_PER_DAY; // 5760 — 1970-01-05
const NINE_AM = 9 * 60;
const FIVE_PM = 17 * 60;
const EIGHT_AM = 8 * 60;
const SIX_PM = 18 * 60;
const PROJECT_START = MONDAY + NINE_AM; // 6300
const DAY = 480; // full Mon–Fri working day

const CAL_CONT = 'cal-cont'; // 24/7 — critical spine (avoids weekend float artifacts)
const CAL_STD = 'cal-std'; // Mon–Fri 9–5 + holiday — side streams
const CAL_OPS = 'cal-ops'; // Mon–Sat longer hours — handful of ops tasks

// Wednesday of week 2 — holiday on the standard calendar only.
const HOLIDAY = MONDAY + 9 * MINUTES_PER_DAY;

const contCalendar = {
  horizonStart: MONDAY,
  horizonDays: 200,
  workingWeekdays: [0, 1, 2, 3, 4, 5, 6],
  defaultStartMinute: 0,
  defaultFinishMinute: MINUTES_PER_DAY,
};

const stdCalendar = {
  horizonStart: MONDAY,
  horizonDays: 200,
  workingWeekdays: [1, 2, 3, 4, 5],
  defaultStartMinute: NINE_AM,
  defaultFinishMinute: FIVE_PM,
  exceptions: [{ date: HOLIDAY, isWorking: false }],
};

const opsCalendar = {
  horizonStart: MONDAY,
  horizonDays: 200,
  workingWeekdays: [1, 2, 3, 4, 5, 6], // Mon–Sat
  defaultStartMinute: EIGHT_AM,
  defaultFinishMinute: SIX_PM,
};

const tasks = [];
const deps = [];

function summary(id, parentId) {
  tasks.push({
    id,
    parentId,
    isSummary: true,
    durationMinutes: 0,
    calendarId: CAL_CONT,
  });
}

function leaf(id, parentId, durationMinutes, extras = {}) {
  tasks.push({
    id,
    parentId,
    isSummary: false,
    durationMinutes,
    calendarId: extras.calendarId ?? CAL_CONT,
    constraintType: extras.constraintType ?? null,
    constraintDate: extras.constraintDate ?? null,
    deadline: extras.deadline ?? null,
  });
}

function link(pred, succ, linkType = 'FS', lagMinutes = 0, lagPercent = null) {
  deps.push({ predecessorId: pred, successorId: succ, linkType, lagMinutes, lagPercent });
}

function fsChain(ids) {
  for (let i = 0; i < ids.length - 1; i += 1) {
    link(ids[i], ids[i + 1], 'FS', 0);
  }
}

// --- WBS -------------------------------------------------------------------
summary('ROOT', null);
summary('P1', 'ROOT');
summary('P2', 'ROOT');
summary('P2N', 'P2');
summary('P2C', 'P2');
summary('P3', 'ROOT');
summary('P3A', 'P3');
summary('P3B', 'P3');
summary('P4', 'ROOT');
summary('P5', 'ROOT');

// Critical spine on 24/7 calendar: 480-minute FS chains
// (P1 → P2N → P3A → P4 → P5). Contiguous time ⇒ classical TF=0 chain.
const p1 = [];
for (let i = 1; i <= 30; i += 1) {
  const id = `P1T${String(i).padStart(2, '0')}`;
  p1.push(id);
  leaf(id, 'P1', DAY);
}
fsChain(p1);

const p2n = [];
for (let i = 1; i <= 34; i += 1) {
  const id = `P2NT${String(i).padStart(2, '0')}`;
  p2n.push(id);
  leaf(id, 'P2N', DAY);
}
fsChain(p2n);
link('P1T30', 'P2NT01', 'FS', 0);

const p3a = [];
for (let i = 1; i <= 28; i += 1) {
  const id = `P3AT${String(i).padStart(2, '0')}`;
  p3a.push(id);
  leaf(id, 'P3A', DAY);
}
fsChain(p3a);
link('P2NT34', 'P3AT01', 'FS', 0);

const p4 = [];
for (let i = 1; i <= 22; i += 1) {
  const id = `P4T${String(i).padStart(2, '0')}`;
  p4.push(id);
  leaf(id, 'P4', DAY);
}
fsChain(p4);
link('P3AT28', 'P4T01', 'FS', 0);

const p5 = [];
for (let i = 1; i <= 16; i += 1) {
  const id = `P5T${String(i).padStart(2, '0')}`;
  p5.push(id);
  leaf(id, 'P5', DAY);
}
fsChain(p5);
link('P4T22', 'P5T01', 'FS', 0);

// Parallel infra on business calendars — hosts non-FS links / lag forms / ops
const p2c = [];
for (let i = 1; i <= 32; i += 1) {
  const id = `P2CT${String(i).padStart(2, '0')}`;
  p2c.push(id);
  leaf(id, 'P2C', 240, { calendarId: i % 5 === 0 ? CAL_OPS : CAL_STD });
}
fsChain(p2c);
// No link from the cont spine into P2C: handing a contiguous-time finish to a
// Mon–Fri successor would park earlyStart on a weekend. P2C starts at
// projectStart on its own calendars (parallel float stream).
link('P2CT05', 'P2CT08', 'SS', 120);
link('P2CT20', 'P2CT23', 'FF', 0);
link('P2CT12', 'P2CT14', 'FS', -60); // lead
link('P2CT25', 'P2CT27', 'FS', 0, 50); // 50% lag of pred duration
link('P2CT28', 'P2CT30', 'SF', 0);

// Side app stream
const p3b = [];
for (let i = 1; i <= 20; i += 1) {
  const id = `P3BT${String(i).padStart(2, '0')}`;
  p3b.push(id);
  leaf(id, 'P3B', 180 + (i % 3) * 60, { calendarId: CAL_STD });
}
fsChain(p3b);
link('P2CT16', 'P3BT01', 'FS', 0);

// Planning spur with positive lag (independent tip on business calendar —
// not hung off the cont spine, which would hand off a weekend earlyStart)
leaf('P1S01', 'P1', 240, { calendarId: CAL_STD });
leaf('P1S02', 'P1', 180, { calendarId: CAL_STD });
link('P1S01', 'P1S02', 'FS', 60);

// --- Specialty: constraints / deadline / hard-override spur ---------------
// SNET chain starts at projectStart on cal-std (independent of cont spine).
leaf('SPEC_SNET', 'P1', 120, {
  calendarId: CAL_STD,
  constraintType: 'snet',
  constraintDate: MONDAY + MINUTES_PER_DAY + NINE_AM, // Tue 9am
});

leaf('SPEC_FNET', 'P1', 120, {
  calendarId: CAL_STD,
  constraintType: 'fnet',
  constraintDate: MONDAY + MINUTES_PER_DAY + FIVE_PM,
});
link('SPEC_SNET', 'SPEC_FNET', 'FS', 0);

leaf('SPEC_SNLT', 'P1', 60, {
  calendarId: CAL_STD,
  constraintType: 'snlt',
  constraintDate: PROJECT_START, // violated
});
link('SPEC_FNET', 'SPEC_SNLT', 'FS', 0);

leaf('SPEC_FNLT', 'P1', 60, {
  calendarId: CAL_STD,
  constraintType: 'fnlt',
  constraintDate: MONDAY + 10 * MINUTES_PER_DAY + FIVE_PM, // satisfied
});
link('SPEC_SNLT', 'SPEC_FNLT', 'FS', 0);

leaf('SPEC_ASAP', 'P1', 60, { calendarId: CAL_STD, constraintType: 'asap' });
link('SPEC_FNLT', 'SPEC_ASAP', 'FS', 0);

// MSO override spur off P2C (non-critical)
leaf('SPEC_MSO_A', 'P2C', 240, { calendarId: CAL_STD });
leaf('SPEC_MSO_B', 'P2C', 60, {
  calendarId: CAL_STD,
  constraintType: 'mso',
  constraintDate: PROJECT_START + 5 * MINUTES_PER_DAY, // patched below
});
link('P2CT04', 'SPEC_MSO_A', 'FS', 0);
link('SPEC_MSO_A', 'SPEC_MSO_B', 'FS', 0);

// MFO override on side stream — patched after unconstrained probe
leaf('SPEC_MFO', 'P3B', 60, {
  calendarId: CAL_STD,
  constraintType: 'mfo',
  constraintDate: PROJECT_START + FIVE_PM, // placeholder; patched below
});
link('P3BT04', 'SPEC_MFO', 'FS', 0);

// Deadline miss — tip on cal-cont after P4T06 (same calendar as spine handoff)
leaf('SPEC_DEADLINE', 'P4', 240, {
  calendarId: CAL_CONT,
  deadline: PROJECT_START,
});
link('P4T06', 'SPEC_DEADLINE', 'FS', 0);

const schedulable = tasks.filter((t) => !t.isSummary);
console.log('schedulable tasks:', schedulable.length);
console.log('summaries:', tasks.length - schedulable.length);
console.log('dependencies:', deps.length);

function compiledCalendars() {
  return new Map([
    [
      asCalendarId(CAL_CONT),
      compileCalendar({
        ...contCalendar,
        horizonStart: asEpochMinutes(contCalendar.horizonStart),
      }),
    ],
    [
      asCalendarId(CAL_STD),
      compileCalendar({
        ...stdCalendar,
        horizonStart: asEpochMinutes(stdCalendar.horizonStart),
        exceptions: stdCalendar.exceptions.map((e) => ({ ...e, date: asEpochMinutes(e.date) })),
      }),
    ],
    [
      asCalendarId(CAL_OPS),
      compileCalendar({
        ...opsCalendar,
        horizonStart: asEpochMinutes(opsCalendar.horizonStart),
      }),
    ],
  ]);
}

function toSchedulerInput(taskList) {
  return {
    projectStart: asEpochMinutes(PROJECT_START),
    tasks: taskList.map((t) => ({
      id: asTaskId(t.id),
      parentId: t.parentId === null ? null : asTaskId(t.parentId),
      isSummary: t.isSummary,
      durationMinutes: t.durationMinutes,
      calendarId: asCalendarId(t.calendarId),
      constraintType: t.constraintType,
      constraintDate: t.constraintDate == null ? null : asEpochMinutes(t.constraintDate),
      deadline: t.deadline == null ? null : asEpochMinutes(t.deadline),
    })),
    dependencies: deps.map((d) => ({
      predecessorId: asTaskId(d.predecessorId),
      successorId: asTaskId(d.successorId),
      linkType: d.linkType,
      lagMinutes: d.lagMinutes,
      lagPercent: d.lagPercent,
    })),
    calendars: compiledCalendars(),
    defaultCalendarId: asCalendarId(CAL_CONT),
  };
}

{
  const std = compiledCalendars().get(asCalendarId(CAL_STD));

  // Probe without hard constraints so we can place MSO/MFO relative to the
  // dependency-derived dates (and keep them off the project-finish driver).
  const softTasks = tasks.map((t) =>
    t.constraintType === 'mso' || t.constraintType === 'mfo'
      ? { ...t, constraintType: null, constraintDate: null }
      : t,
  );
  const probe = schedule(toSchedulerInput(softTasks));

  const a = probe.tasks.get(asTaskId('SPEC_MSO_A'));
  if (!a) throw new Error('SPEC_MSO_A missing from probe');
  tasks.find((t) => t.id === 'SPEC_MSO_B').constraintDate = Number(
    addWorkingMinutes(a.earlyFinish, 120, std),
  );

  const mfoProbe = probe.tasks.get(asTaskId('SPEC_MFO'));
  if (!mfoProbe) throw new Error('SPEC_MFO missing from probe');
  tasks.find((t) => t.id === 'SPEC_MFO').constraintDate = Number(
    addWorkingMinutes(mfoProbe.earlyFinish, 120, std),
  );
}

const output = schedule(toSchedulerInput(tasks));
const warningCodes = new Set(output.warnings.map((w) => w.code));
console.log('warnings:', [...warningCodes]);
console.log('critical path length:', output.criticalPath.length);
console.log('projectFinish:', Number(output.projectFinish));

// Connectedness check (leaf critical path only)
{
  const crit = new Set(output.criticalPath.map(String));
  const preds = new Map();
  for (const d of deps) {
    if (!crit.has(d.successorId)) continue;
    const list = preds.get(d.successorId) ?? [];
    list.push(d.predecessorId);
    preds.set(d.successorId, list);
  }
  const orphans = [];
  for (const id of crit) {
    const p = preds.get(id) ?? [];
    if (p.length === 0) continue;
    if (!p.some((x) => crit.has(x))) orphans.push({ id, p });
  }
  console.log('critical orphans (no critical pred):', orphans.length, orphans.slice(0, 15));
  if (orphans.length > 0) {
    throw new Error('critical path not connected — adjust generator');
  }
}

if (!warningCodes.has('CONSTRAINT_OVERRIDES_DEPENDENCY')) {
  throw new Error('expected CONSTRAINT_OVERRIDES_DEPENDENCY');
}
if (!warningCodes.has('DEADLINE_MISSED')) {
  throw new Error('expected DEADLINE_MISSED');
}
if (output.criticalPath.length < 20) {
  throw new Error(`critical path too short: ${output.criticalPath.length}`);
}
if (schedulable.length < 190 || schedulable.length > 220) {
  throw new Error(`schedulable count out of range: ${schedulable.length}`);
}

const expectedTasks = {};
for (const [id, t] of output.tasks) {
  expectedTasks[String(id)] = {
    earlyStart: Number(t.earlyStart),
    earlyFinish: Number(t.earlyFinish),
    lateStart: t.lateStart === null ? null : Number(t.lateStart),
    lateFinish: t.lateFinish === null ? null : Number(t.lateFinish),
    totalFloatMinutes: t.totalFloatMinutes,
    freeFloatMinutes: t.freeFloatMinutes,
    isCritical: t.isCritical,
  };
}

mkdirSync(OUT, { recursive: true });
writeFileSync(
  join(OUT, 'input.json'),
  `${JSON.stringify(
    {
      projectStart: PROJECT_START,
      defaultCalendarId: CAL_CONT,
      calendars: {
        [CAL_CONT]: contCalendar,
        [CAL_STD]: stdCalendar,
        [CAL_OPS]: opsCalendar,
      },
      tasks,
      dependencies: deps,
    },
    null,
    2,
  )}\n`,
);
writeFileSync(
  join(OUT, 'expected.json'),
  `${JSON.stringify(
    {
      projectFinish: Number(output.projectFinish),
      criticalPath: output.criticalPath.map(String),
      tasks: expectedTasks,
      warnings: output.warnings.map((w) => ({
        code: w.code,
        taskIds: w.taskIds.map(String),
      })),
    },
    null,
    2,
  )}\n`,
);

const sampleIds = [
  'P1T01',
  'P1T02',
  'P1T03',
  'SPEC_SNET',
  'SPEC_MSO_A',
  'SPEC_MSO_B',
  'SPEC_MFO',
  'SPEC_DEADLINE',
  'SPEC_SNLT',
  'P2CT05',
  'P2CT08',
  'P2CT10',
  'P2CT12',
  'P2CT14',
  'P2CT25',
  'P2CT27',
  'P5T16',
];
console.log('\n--- sample dates ---');
for (const id of sampleIds) {
  console.log(id, JSON.stringify(expectedTasks[id]));
}
console.log('SPEC_MSO_B constraintDate', tasks.find((t) => t.id === 'SPEC_MSO_B').constraintDate);
console.log('done →', OUT);

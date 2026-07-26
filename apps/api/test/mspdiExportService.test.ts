import { describe, expect, it } from 'vitest';

import {
  buildMspdiXml,
  formatMspdiDate,
  formatMspdiDuration,
  mapConstraintType,
  mapLinkType,
  mapResourceType,
  mapTaskType,
  outlineLevelFromWbsPath,
  type MspdiAssignment,
  type MspdiCalendar,
  type MspdiDependency,
  type MspdiProject,
  type MspdiResource,
  type MspdiTask,
} from '../src/services/mspdiExportService.js';

/**
 * Hand-computed golden fixture (no MS Project install available):
 *
 * Task A (UID 0, ID 1): duration 480 min → Duration PT8H0M0S
 *   constraintType snet → ConstraintType 4
 *   constraintDate 2026-01-15T09:00:00Z → ConstraintDate 2026-01-15T09:00:00
 * Task B (UID 1, ID 2): duration 240 min → PT4H0M0S, percentComplete 50.4 → 50
 * Dependency A→B FS with lagMinutes 60 → LinkLag 600 (tenths of a minute)
 *   Type FS → 1 (Microsoft Learn MSPDI PredecessorLink Type)
 * Resource R (UID 0): work → Type 1, MaxUnits 1, AccrueAt prorated → 3
 * Assignment: units 1, workMinutes 480 → Work PT8H0M0S, Cost 400
 * Calendar: Mon–Fri (JS days 1–5), exception 2026-01-19 non-working
 */

function assertWellFormedXml(xml: string): void {
  // Stack-based tag balance check — sufficient for our generated MSPDI (no CDATA/namespaces).
  const tagRe = /<\/?([A-Za-z][A-Za-z0-9]*)\b[^>]*\/?>/g;
  const stack: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(xml)) !== null) {
    const full = match[0]!;
    const name = match[1]!;
    if (full.startsWith('<?')) continue;
    if (full.endsWith('/>')) continue;
    if (full.startsWith('</')) {
      const open = stack.pop();
      expect(open, `unexpected close </${name}>`).toBe(name);
      continue;
    }
    stack.push(name);
  }
  expect(stack, `unclosed tags: ${stack.join(', ')}`).toEqual([]);
  expect(xml).toMatch(/^<\?xml /);
  expect(xml).toContain('<Project>');
  expect(xml).toContain('</Project>');
}

function textContent(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([^<]*)</${tag}>`);
  const m = xml.match(re);
  return m?.[1] ?? null;
}

function allTextContents(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g');
  return [...xml.matchAll(re)].map((m) => m[1]!);
}

function taskBlock(xml: string, uid: number): string {
  const re = new RegExp(`<Task><UID>${uid}</UID>[\\s\\S]*?</Task>`);
  const m = xml.match(re);
  expect(m, `missing Task UID ${uid}`).toBeTruthy();
  return m![0]!;
}

const CAL_ID = 'cal-1';
const TASK_A = 'task-a';
const TASK_B = 'task-b';
const RES_ID = 'res-1';

const project: MspdiProject = {
  name: 'Bridge retrofit',
  startDate: new Date('2026-01-15T09:00:00.000Z'),
  finishDate: new Date('2026-01-20T17:00:00.000Z'),
  calendarId: CAL_ID,
};

const calendar: MspdiCalendar = {
  id: CAL_ID,
  name: 'Standard',
  workingDays: [1, 2, 3, 4, 5],
  defaultStart: '09:00:00',
  defaultFinish: '17:00:00',
  exceptions: [
    {
      exceptionDate: '2026-01-19',
      isWorking: false,
      startTime: null,
      finishTime: null,
      name: 'Holiday',
    },
  ],
};

function baseTask(partial: Partial<MspdiTask> & Pick<MspdiTask, 'id' | 'name'>): MspdiTask {
  return {
    parentId: null,
    wbsPath: '1',
    wbsCode: '1',
    isSummary: false,
    durationMinutes: 480,
    taskType: 'fixed_duration',
    constraintType: null,
    constraintDate: null,
    deadline: null,
    earlyStart: new Date('2026-01-15T09:00:00.000Z'),
    earlyFinish: new Date('2026-01-15T17:00:00.000Z'),
    totalFloatMinutes: 0,
    freeFloatMinutes: 0,
    isCritical: true,
    percentComplete: null,
    actualStart: null,
    actualFinish: null,
    actualDurationMinutes: null,
    calendarId: null,
    ...partial,
  };
}

describe('MSPDI mapping helpers', () => {
  it('maps task / constraint / link / resource type codes', () => {
    expect(mapTaskType(null)).toBe(1);
    expect(mapTaskType('fixed_units')).toBe(0);
    expect(mapTaskType('fixed_duration')).toBe(1);
    expect(mapTaskType('fixed_work')).toBe(2);

    expect(mapConstraintType(null)).toBe(0);
    expect(mapConstraintType('asap')).toBe(0);
    expect(mapConstraintType('snet')).toBe(4);
    expect(mapConstraintType('fnlt')).toBe(7);

    // Microsoft Learn PredecessorLink Type: FF=0 FS=1 SF=2 SS=3
    expect(mapLinkType('FF')).toBe(0);
    expect(mapLinkType('FS')).toBe(1);
    expect(mapLinkType('SF')).toBe(2);
    expect(mapLinkType('SS')).toBe(3);

    // Microsoft Learn Resource Type: Material=0 Work=1 Cost=2
    expect(mapResourceType('material')).toBe(0);
    expect(mapResourceType('work')).toBe(1);
    expect(mapResourceType('cost')).toBe(2);
  });

  it('formats naive dates and PT durations', () => {
    expect(formatMspdiDate(new Date('2026-01-15T09:00:00.000Z'))).toBe('2026-01-15T09:00:00');
    expect(formatMspdiDuration(480)).toBe('PT8H0M0S');
    expect(formatMspdiDuration(0)).toBe('PT0H0M0S');
    expect(formatMspdiDuration(90)).toBe('PT1H30M0S');
  });

  it('derives OutlineLevel from wbsPath depth', () => {
    expect(outlineLevelFromWbsPath('1')).toBe(1);
    expect(outlineLevelFromWbsPath('1.2.3')).toBe(3);
    expect(outlineLevelFromWbsPath(null)).toBe(1);
  });
});

describe('buildMspdiXml — golden fixture', () => {
  const tasks: MspdiTask[] = [
    baseTask({
      id: TASK_A,
      name: 'Pour foundation',
      wbsPath: '1',
      wbsCode: '1',
      durationMinutes: 480,
      constraintType: 'snet',
      constraintDate: new Date('2026-01-15T09:00:00.000Z'),
      percentComplete: '100',
    }),
    baseTask({
      id: TASK_B,
      name: 'Cure',
      wbsPath: '2',
      wbsCode: '2',
      durationMinutes: 240,
      earlyStart: new Date('2026-01-16T09:00:00.000Z'),
      earlyFinish: new Date('2026-01-16T13:00:00.000Z'),
      percentComplete: '50.4',
      isCritical: false,
      totalFloatMinutes: 120,
      freeFloatMinutes: 60,
    }),
  ];

  const deps: MspdiDependency[] = [
    {
      predecessorId: TASK_A,
      successorId: TASK_B,
      linkType: 'FS',
      lagMinutes: 60,
      lagPercent: null,
    },
  ];

  const resources: MspdiResource[] = [
    {
      id: RES_ID,
      name: 'Crew A',
      resourceType: 'work',
      maxUnits: '1',
      standardRate: '50',
      overtimeRate: null,
      costPerUse: '0',
      accrualType: 'prorated',
      calendarId: CAL_ID,
    },
  ];

  const assignments: MspdiAssignment[] = [
    {
      id: 'asg-1',
      taskId: TASK_A,
      resourceId: RES_ID,
      units: '1',
      workMinutes: 480,
      cost: '400',
      actualWorkMinutes: null,
      actualCost: null,
    },
  ];

  it('emits the hand-traced Duration / ConstraintType / LinkLag / Type values', () => {
    const xml = buildMspdiXml(project, tasks, deps, resources, assignments, [calendar]);
    assertWellFormedXml(xml);

    expect(textContent(xml, 'Name')).toBe('Bridge retrofit');
    expect(textContent(xml, 'StartDate')).toBe('2026-01-15T09:00:00');
    expect(textContent(xml, 'CalendarUID')).toBe('0');

    const a = taskBlock(xml, 0);
    expect(textContent(a, 'ID')).toBe('1');
    expect(textContent(a, 'Duration')).toBe('PT8H0M0S');
    expect(textContent(a, 'ConstraintType')).toBe('4');
    expect(textContent(a, 'ConstraintDate')).toBe('2026-01-15T09:00:00');
    expect(textContent(a, 'Work')).toBe('PT8H0M0S');
    expect(textContent(a, 'PercentComplete')).toBe('100');
    expect(textContent(a, 'Critical')).toBe('1');

    const b = taskBlock(xml, 1);
    expect(textContent(b, 'ID')).toBe('2');
    expect(textContent(b, 'Duration')).toBe('PT4H0M0S');
    expect(textContent(b, 'PercentComplete')).toBe('50'); // round(50.4)
    expect(textContent(b, 'PredecessorUID')).toBe('0');
    expect(textContent(b, 'Type')).toBe('1'); // FS — first Type inside PredecessorLink; Task Type also 1
    // Task Type and PredecessorLink Type are both 1 here — assert LinkLag uniquely.
    expect(textContent(b, 'LinkLag')).toBe('600');

    expect(xml).toContain('<Resource>');
    const resourceTypes = allTextContents(xml.match(/<Resource>[\s\S]*?<\/Resource>/)![0]!, 'Type');
    expect(resourceTypes).toContain('1'); // work
    expect(textContent(xml.match(/<Resource>[\s\S]*?<\/Resource>/)![0]!, 'MaxUnits')).toBe('1');
    expect(textContent(xml.match(/<Resource>[\s\S]*?<\/Resource>/)![0]!, 'AccrueAt')).toBe('3');

    const asg = xml.match(/<Assignment>[\s\S]*?<\/Assignment>/)![0]!;
    expect(textContent(asg, 'TaskUID')).toBe('0');
    expect(textContent(asg, 'ResourceUID')).toBe('0');
    expect(textContent(asg, 'Work')).toBe('PT8H0M0S');
    expect(textContent(asg, 'Cost')).toBe('400');
    expect(asg).not.toContain('<ActualWork>');
    expect(asg).not.toContain('<ActualCost>');

    expect(xml).toContain('<Exception>');
    expect(xml).toContain('<FromDate>2026-01-19T00:00:00</FromDate>');
    expect(xml).toContain('<DayWorking>0</DayWorking>');
  });

  it('resolves lagPercent into LinkLag the same way resolveLagMinutes does', () => {
    const percentDeps: MspdiDependency[] = [
      {
        predecessorId: TASK_A,
        successorId: TASK_B,
        linkType: 'FS',
        lagMinutes: 999, // ignored when lagPercent set
        lagPercent: '25', // 25% of 480 = 120 min → LinkLag 1200
      },
    ];
    const xml = buildMspdiXml(project, tasks, percentDeps, resources, assignments, [calendar]);
    const b = taskBlock(xml, 1);
    expect(textContent(b, 'LinkLag')).toBe('1200');
  });
});

describe('buildMspdiXml — milestone and omitted-nulls', () => {
  it('exports a zero-duration milestone as PT0H0M0S', () => {
    const tasks: MspdiTask[] = [
      baseTask({
        id: 'mile',
        name: 'Handover',
        durationMinutes: 0,
        earlyStart: new Date('2026-01-20T17:00:00.000Z'),
        earlyFinish: new Date('2026-01-20T17:00:00.000Z'),
      }),
    ];
    const xml = buildMspdiXml(project, tasks, [], [], [], [calendar]);
    assertWellFormedXml(xml);
    expect(textContent(taskBlock(xml, 0), 'Duration')).toBe('PT0H0M0S');
  });

  it('omits ConstraintDate / Deadline / Actual* when null (no empty tags)', () => {
    const tasks: MspdiTask[] = [
      baseTask({
        id: 'plain',
        name: 'Plain task',
        constraintType: null,
        constraintDate: null,
        deadline: null,
        actualStart: null,
        actualFinish: null,
        actualDurationMinutes: null,
      }),
    ];
    const xml = buildMspdiXml(project, tasks, [], [], [], [calendar]);
    assertWellFormedXml(xml);
    const t = taskBlock(xml, 0);
    expect(t).not.toContain('<ConstraintDate');
    expect(t).not.toContain('<Deadline');
    expect(t).not.toContain('<ActualStart');
    expect(t).not.toContain('<ActualFinish');
    expect(t).not.toContain('<ActualDuration');
    expect(textContent(t, 'ConstraintType')).toBe('0');
  });

  it('omits ConstraintDate for asap even when a constraintDate value is present', () => {
    const tasks: MspdiTask[] = [
      baseTask({
        id: 'asap',
        name: 'ASAP task',
        constraintType: 'asap',
        constraintDate: new Date('2026-01-15T09:00:00.000Z'),
      }),
    ];
    const xml = buildMspdiXml(project, tasks, [], [], [], [calendar]);
    const t = taskBlock(xml, 0);
    expect(t).not.toContain('<ConstraintDate');
  });
});

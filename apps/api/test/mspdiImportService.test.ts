import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BadRequestError, SchedulingConflictError } from '../src/middleware/errors.js';
import {
  buildMspdiXml,
  type MspdiAssignment,
  type MspdiCalendar,
  type MspdiDependency,
  type MspdiProject,
  type MspdiResource,
  type MspdiTask,
} from '../src/services/mspdiExportService.js';

const writeAuditLog = vi.fn(async () => undefined);
const rescheduleProject = vi.fn(async () => ({
  task: null,
  affected: [],
  projectVersion: 1,
  warnings: [],
}));
const withSerializableRetry = vi.fn(
  async (fn: (tx: unknown) => Promise<unknown>, _db?: unknown) => {
    void _db;
    return fn(tx);
  },
);

const deleteWhere = vi.fn(async () => undefined);
const insertValues = vi.fn((vals?: unknown) => {
  void vals;
});
const insertReturning = vi.fn();
const updateSet = vi.fn(() => ({ where: vi.fn(async () => undefined) }));

let selectHandlers: Array<() => unknown> = [];

const tx = {
  select: vi.fn(() => {
    const handler = selectHandlers.shift();
    if (!handler) throw new Error('Unexpected tx.select()');
    return handler();
  }),
  insert: vi.fn(() => ({
    values: (vals: unknown) => {
      insertValues(vals);
      return { returning: insertReturning };
    },
  })),
  delete: vi.fn(() => ({
    where: () => deleteWhere(),
  })),
  update: vi.fn(() => ({
    set: () => updateSet(),
  })),
};

vi.mock('../src/db/client.js', () => ({
  db: {},
}));

vi.mock('../src/services/scheduleRunner.js', async () => {
  const actual = await vi.importActual<typeof import('../src/services/scheduleRunner.js')>(
    '../src/services/scheduleRunner.js',
  );
  return {
    ...actual,
    withSerializableRetry: (fn: (tx: unknown) => Promise<unknown>, dbArg: unknown) =>
      withSerializableRetry(fn, dbArg),
    writeAuditLog: (...args: unknown[]) => {
      void args;
      return writeAuditLog();
    },
    rescheduleProject: (...args: unknown[]) => {
      void args;
      return rescheduleProject();
    },
  };
});

const {
  parseMspdiXml,
  parseMspdiDuration,
  parseMspdiDate,
  unmapLinkType,
  unmapConstraintType,
  unmapTaskType,
  unmapResourceType,
  validateParsedMspdiGraph,
  importProjectMspdi,
} = await import('../src/services/mspdiImportService.js');

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

const cyclicXml = `<?xml version="1.0" encoding="UTF-8"?>
<Project>
  <Name>Cycle</Name>
  <CalendarUID>0</CalendarUID>
  <Tasks>
    <Task>
      <UID>0</UID><ID>1</ID><Name>A</Name><Type>1</Type><Summary>0</Summary>
      <OutlineLevel>1</OutlineLevel><WBS>1</WBS>
      <Duration>PT1H0M0S</Duration><Work>PT0H0M0S</Work><PercentComplete>0</PercentComplete>
      <Critical>0</Critical><TotalSlack>PT0H0M0S</TotalSlack><FreeSlack>PT0H0M0S</FreeSlack>
      <ConstraintType>0</ConstraintType>
      <PredecessorLink><PredecessorUID>1</PredecessorUID><Type>1</Type><LinkLag>0</LinkLag></PredecessorLink>
    </Task>
    <Task>
      <UID>1</UID><ID>2</ID><Name>B</Name><Type>1</Type><Summary>0</Summary>
      <OutlineLevel>1</OutlineLevel><WBS>2</WBS>
      <Duration>PT1H0M0S</Duration><Work>PT0H0M0S</Work><PercentComplete>0</PercentComplete>
      <Critical>0</Critical><TotalSlack>PT0H0M0S</TotalSlack><FreeSlack>PT0H0M0S</FreeSlack>
      <ConstraintType>0</ConstraintType>
      <PredecessorLink><PredecessorUID>0</PredecessorUID><Type>1</Type><LinkLag>0</LinkLag></PredecessorLink>
    </Task>
  </Tasks>
  <Resources></Resources>
  <Assignments></Assignments>
  <Calendars>
    <Calendar><UID>0</UID><Name>Standard</Name>
      <WeekDays>
        <WeekDay><DayType>2</DayType><DayWorking>1</DayWorking>
          <WorkingTimes><WorkingTime><FromTime>09:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes>
        </WeekDay>
      </WeekDays>
    </Calendar>
  </Calendars>
</Project>`;

describe('MSPDI reverse mappers (invert export maps)', () => {
  it('round-trips every link / constraint / task / resource code', () => {
    expect(unmapLinkType(0)).toBe('FF');
    expect(unmapLinkType(1)).toBe('FS');
    expect(unmapLinkType(2)).toBe('SF');
    expect(unmapLinkType(3)).toBe('SS');

    expect(unmapConstraintType(0)).toBe('asap');
    expect(unmapConstraintType(4)).toBe('snet');
    expect(unmapConstraintType(7)).toBe('fnlt');

    expect(unmapTaskType(0)).toBe('fixed_units');
    expect(unmapTaskType(1)).toBe('fixed_duration');
    expect(unmapTaskType(2)).toBe('fixed_work');

    expect(unmapResourceType(0)).toBe('material');
    expect(unmapResourceType(1)).toBe('work');
    expect(unmapResourceType(2)).toBe('cost');
  });

  it('parses PT durations and naive dates as UTC', () => {
    expect(parseMspdiDuration('PT8H0M0S')).toBe(480);
    expect(parseMspdiDuration('PT1H30M0S')).toBe(90);
    expect(parseMspdiDuration('PT0H0M0S')).toBe(0);
    expect(parseMspdiDate('2026-01-15T09:00:00')?.toISOString()).toBe('2026-01-15T09:00:00.000Z');
  });
});

describe('parseMspdiXml — export round-trip', () => {
  it('reverse-maps buildMspdiXml output back to the original field values', () => {
    const xml = buildMspdiXml(project, tasks, deps, resources, assignments, [calendar]);
    const parsed = parseMspdiXml(xml);

    expect(parsed.name).toBe('Bridge retrofit');
    expect(parsed.startDate?.toISOString()).toBe('2026-01-15T09:00:00.000Z');
    expect(parsed.calendarUid).toBe(0);

    expect(parsed.tasks).toHaveLength(2);
    const a = parsed.tasks[0]!;
    const b = parsed.tasks[1]!;

    expect(a.name).toBe('Pour foundation');
    expect(a.durationMinutes).toBe(480);
    expect(a.taskType).toBe('fixed_duration');
    expect(a.constraintType).toBe('snet');
    expect(a.constraintDate?.toISOString()).toBe('2026-01-15T09:00:00.000Z');
    expect(a.percentComplete).toBe(100);
    expect(a.wbsCode).toBe('1');
    expect(a.isCritical).toBe(true);

    expect(b.name).toBe('Cure');
    expect(b.durationMinutes).toBe(240);
    // Export rounds 50.4 → 50 before writing PercentComplete.
    expect(b.percentComplete).toBe(50);
    expect(b.totalFloatMinutes).toBe(120);
    expect(b.freeFloatMinutes).toBe(60);

    expect(parsed.dependencies).toHaveLength(1);
    expect(parsed.dependencies[0]).toMatchObject({
      predecessorUid: 0,
      successorUid: 1,
      linkType: 'FS',
      lagMinutes: 60,
    });

    expect(parsed.resources[0]).toMatchObject({
      name: 'Crew A',
      resourceType: 'work',
      maxUnits: 1,
      standardRate: 50,
      accrualType: 'prorated',
      calendarUid: 0,
    });

    expect(parsed.assignments[0]).toMatchObject({
      taskUid: 0,
      resourceUid: 0,
      units: 1,
      workMinutes: 480,
      cost: 400,
      actualWorkMinutes: null,
      actualCost: null,
    });

    expect(parsed.calendars[0]?.name).toBe('Standard');
    expect(parsed.calendars[0]?.workingDays).toEqual([1, 2, 3, 4, 5]);
    expect(parsed.calendars[0]?.exceptions[0]?.exceptionDate).toBe('2026-01-19');
  });

  it('rejects malformed XML with BadRequestError', () => {
    expect(() => parseMspdiXml('<Project><Name>Broken')).toThrow(BadRequestError);
    expect(() => parseMspdiXml('')).toThrow(BadRequestError);
    expect(() => parseMspdiXml('<NotAProject/>')).toThrow(BadRequestError);
  });
});

describe('validateParsedMspdiGraph', () => {
  it('rejects a dependency cycle before any import writes', () => {
    const xml = buildMspdiXml(project, tasks, deps, resources, assignments, [calendar]);
    const parsed = parseMspdiXml(xml);
    const cyclic = {
      ...parsed,
      dependencies: [
        { predecessorUid: 0, successorUid: 1, linkType: 'FS' as const, lagMinutes: 0 },
        { predecessorUid: 1, successorUid: 0, linkType: 'FS' as const, lagMinutes: 0 },
      ],
    };

    expect(() => validateParsedMspdiGraph(cyclic, CAL_ID)).toThrow(SchedulingConflictError);
  });
});

describe('importProjectMspdi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectHandlers = [];
    deleteWhere.mockClear();
    insertValues.mockClear();
    withSerializableRetry.mockImplementation(
      async (fn: (txArg: unknown) => Promise<unknown>, _db?: unknown) => {
        void _db;
        return fn(tx);
      },
    );
  });

  it('does not delete tasks when the file graph has a cycle', async () => {
    selectHandlers.push(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ id: 'proj', calendarId: CAL_ID, version: 0 }],
        }),
      }),
    }));

    await expect(importProjectMspdi('proj', cyclicXml, 'user-1')).rejects.toBeInstanceOf(
      SchedulingConflictError,
    );
    expect(deleteWhere).not.toHaveBeenCalled();
    expect(rescheduleProject).not.toHaveBeenCalled();
  });

  it('match-or-creates resources by name — second import does not grow the pool', async () => {
    const xml = buildMspdiXml(project, tasks, deps, resources, assignments, [calendar]);

    const queueSuccessfulImport = (resourceAlreadyExists: boolean) => {
      selectHandlers.push(() => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ id: 'proj', calendarId: CAL_ID, version: 1 }],
          }),
        }),
      }));
      selectHandlers.push(() => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ id: CAL_ID, name: 'Standard' }],
          }),
        }),
      }));
      selectHandlers.push(() => ({
        from: () => ({
          where: () => ({
            limit: async () =>
              resourceAlreadyExists ? [{ id: RES_ID, name: 'Crew A' }] : [],
          }),
        }),
      }));
      if (!resourceAlreadyExists) {
        insertReturning.mockResolvedValueOnce([{ id: RES_ID, name: 'Crew A' }]);
      }
    };

    queueSuccessfulImport(false);
    await importProjectMspdi('proj', xml, 'user-1');

    queueSuccessfulImport(true);
    insertValues.mockClear();
    insertReturning.mockReset();
    deleteWhere.mockClear();

    await importProjectMspdi('proj', xml, 'user-1');

    const resourceInserts = insertValues.mock.calls.filter((call) => {
      const vals = call[0] as unknown;
      if (Array.isArray(vals)) return false;
      return (
        typeof vals === 'object' &&
        vals !== null &&
        'resourceType' in vals &&
        (vals as { name?: string }).name === 'Crew A'
      );
    });
    expect(resourceInserts).toHaveLength(0);
    expect(deleteWhere).toHaveBeenCalled();
  });
});

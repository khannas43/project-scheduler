import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { compileCalendar, type CalendarCompilationInput } from '../src/calendar.js';
import { schedule } from '../src/schedule.js';
import type { ConstraintType, DependencyInput, LinkType, TaskInput } from '../src/taskTypes.js';
import { asCalendarId, asEpochMinutes, asTaskId } from '../src/types.js';

const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), 'golden');

interface GoldenTaskInput {
  id: string;
  parentId: string | null;
  isSummary: boolean;
  durationMinutes: number;
  calendarId: string;
  constraintType?: ConstraintType | null;
  constraintDate?: number | null;
}

interface GoldenDependencyInput {
  predecessorId: string;
  successorId: string;
  linkType: LinkType;
  lagMinutes: number;
  lagPercent?: number | null;
}

interface GoldenInput {
  projectStart: number;
  defaultCalendarId: string;
  calendar: Omit<CalendarCompilationInput, 'horizonStart'> & { horizonStart: number };
  tasks: GoldenTaskInput[];
  dependencies: GoldenDependencyInput[];
}

interface GoldenExpectedTask {
  earlyStart: number;
  earlyFinish: number;
  lateStart: number | null;
  lateFinish: number | null;
  totalFloatMinutes: number | null;
  freeFloatMinutes: number | null;
  isCritical: boolean;
}

interface GoldenExpectedWarning {
  code: string;
  taskIds: string[];
  message?: string;
}

interface GoldenExpected {
  projectFinish: number;
  criticalPath: string[];
  tasks: Record<string, GoldenExpectedTask>;
  warnings?: GoldenExpectedWarning[];
}

const caseNames = readdirSync(GOLDEN_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

/**
 * §11.1: "The highest-value asset in the repository." These are currently
 * hand-computed and self-verified, not MS-Project-exported — see each
 * case's notes.md. Cross-checking against real MS Project output remains
 * open (needs access this environment doesn't have); the case shape
 * (input.json/expected.json/notes.md) is deliberately the one §11.1
 * describes, so real cases can be dropped in without touching this harness.
 */
describe('golden-file corpus (§11.1)', () => {
  it('found at least one case', () => {
    expect(caseNames.length).toBeGreaterThan(0);
  });

  for (const caseName of caseNames) {
    it(caseName, () => {
      const caseDir = join(GOLDEN_DIR, caseName);
      const input = JSON.parse(readFileSync(join(caseDir, 'input.json'), 'utf-8')) as GoldenInput;
      const expected = JSON.parse(readFileSync(join(caseDir, 'expected.json'), 'utf-8')) as GoldenExpected;

      const defaultCalendarId = asCalendarId(input.defaultCalendarId);
      const calendars = new Map([
        [
          defaultCalendarId,
          compileCalendar({ ...input.calendar, horizonStart: asEpochMinutes(input.calendar.horizonStart) }),
        ],
      ]);

      const tasks: TaskInput[] = input.tasks.map((t) => ({
        id: asTaskId(t.id),
        parentId: t.parentId === null ? null : asTaskId(t.parentId),
        isSummary: t.isSummary,
        durationMinutes: t.durationMinutes,
        calendarId: asCalendarId(t.calendarId),
        constraintType: t.constraintType ?? null,
        constraintDate: t.constraintDate === undefined || t.constraintDate === null ? null : asEpochMinutes(t.constraintDate),
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

      expect(output.projectFinish).toBe(expected.projectFinish);
      expect(output.criticalPath.map(String)).toEqual(expected.criticalPath);

      for (const [id, expectedTask] of Object.entries(expected.tasks)) {
        const actual = output.tasks.get(asTaskId(id));
        expect(actual, `task ${id} missing from schedule() output`).toBeDefined();
        expect(actual).toEqual(expectedTask);
      }

      if (expected.warnings !== undefined) {
        expect(
          output.warnings.map((w) => ({
            code: w.code,
            taskIds: w.taskIds.map(String),
          })),
        ).toEqual(expected.warnings.map((w) => ({ code: w.code, taskIds: w.taskIds })));
      } else {
        expect(output.warnings).toEqual([]);
      }
    });
  }
});

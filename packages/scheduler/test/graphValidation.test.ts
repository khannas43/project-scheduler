import { describe, expect, it } from 'vitest';

import { SchedulingError, validateGraph } from '../src/graphValidation.js';
import type { DependencyInput, TaskInput } from '../src/taskTypes.js';
import { asCalendarId, asTaskId } from '../src/types.js';

const DUMMY_CALENDAR = asCalendarId('cal');

function task(id: string, parentId: string | null = null, isSummary = false): TaskInput {
  return {
    id: asTaskId(id),
    parentId: parentId === null ? null : asTaskId(parentId),
    isSummary,
    durationMinutes: 60,
    calendarId: DUMMY_CALENDAR,
  };
}

function edge(predecessorId: string, successorId: string): DependencyInput {
  return {
    predecessorId: asTaskId(predecessorId),
    successorId: asTaskId(successorId),
    linkType: 'FS',
    lagMinutes: 0,
    lagPercent: null,
  };
}

describe('validateGraph — cycle detection (§4.3)', () => {
  it('accepts an empty graph', () => {
    expect(() => validateGraph([], [])).not.toThrow();
  });

  it('accepts a simple linear chain', () => {
    const tasks = [task('A'), task('B'), task('C')];
    const deps = [edge('A', 'B'), edge('B', 'C')];

    expect(() => validateGraph(tasks, deps)).not.toThrow();
  });

  it('rejects a self-loop', () => {
    const tasks = [task('A')];
    const deps = [edge('A', 'A')];

    expect(() => validateGraph(tasks, deps)).toThrow(SchedulingError);
  });

  it('rejects a simple cycle and names every task in it', () => {
    const tasks = [task('A'), task('B'), task('C')];
    const deps = [edge('A', 'B'), edge('B', 'C'), edge('C', 'A')];

    try {
      validateGraph(tasks, deps);
      expect.fail('expected validateGraph to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SchedulingError);
      const schedulingError = err as SchedulingError;
      expect(new Set(schedulingError.taskIds)).toEqual(new Set([asTaskId('A'), asTaskId('B'), asTaskId('C')]));
    }
  });

  it('finds a cycle in a component that is not the first task visited', () => {
    const tasks = [task('X'), task('Y'), task('A'), task('B')];
    // X -> Y is a harmless chain; A <-> B is the cycle, visited second.
    const deps = [edge('X', 'Y'), edge('A', 'B'), edge('B', 'A')];

    expect(() => validateGraph(tasks, deps)).toThrow(SchedulingError);
  });

  it('does not blow the stack on a long chain (proves the DFS is iterative, not recursive)', () => {
    const depth = 20_000;
    const tasks = Array.from({ length: depth }, (_, i) => task(`T${i}`));
    const deps = Array.from({ length: depth - 1 }, (_, i) => edge(`T${i}`, `T${i + 1}`));

    expect(() => validateGraph(tasks, deps)).not.toThrow();
  });
});

describe('validateGraph — orphan check (§4.3)', () => {
  it('rejects a dependency whose predecessor does not exist', () => {
    const tasks = [task('B')];
    const deps = [edge('missing', 'B')];

    try {
      validateGraph(tasks, deps);
      expect.fail('expected validateGraph to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SchedulingError);
      expect((err as SchedulingError).taskIds).toContainEqual(asTaskId('missing'));
    }
  });

  it('rejects a dependency whose successor does not exist', () => {
    const tasks = [task('A')];
    const deps = [edge('A', 'missing')];

    try {
      validateGraph(tasks, deps);
      expect.fail('expected validateGraph to throw');
    } catch (err) {
      expect((err as SchedulingError).taskIds).toContainEqual(asTaskId('missing'));
    }
  });
});

describe('validateGraph — summary link check (§4.3)', () => {
  it('allows a dependency between a summary and an unrelated task', () => {
    const tasks = [task('Summary', null, true), task('Child', 'Summary'), task('Unrelated')];
    const deps = [edge('Summary', 'Unrelated')];

    expect(() => validateGraph(tasks, deps)).not.toThrow();
  });

  it('rejects a dependency between a summary and its direct child', () => {
    const tasks = [task('Summary', null, true), task('Child', 'Summary')];
    const deps = [edge('Summary', 'Child')];

    expect(() => validateGraph(tasks, deps)).toThrow(SchedulingError);
  });

  it('rejects a dependency between a summary and a grandchild', () => {
    const tasks = [task('Summary', null, true), task('Mid', 'Summary', true), task('Grandchild', 'Mid')];
    const deps = [edge('Summary', 'Grandchild')];

    expect(() => validateGraph(tasks, deps)).toThrow(SchedulingError);
  });

  it('rejects the link regardless of direction (descendant -> summary)', () => {
    const tasks = [task('Summary', null, true), task('Child', 'Summary')];
    const deps = [edge('Child', 'Summary')];

    expect(() => validateGraph(tasks, deps)).toThrow(SchedulingError);
  });
});

describe('validateGraph — holistic', () => {
  it('accepts a realistic small WBS with cross-summary dependencies', () => {
    const tasks = [
      task('Phase1', null, true),
      task('Phase1.Design', 'Phase1'),
      task('Phase1.Build', 'Phase1'),
      task('Phase2', null, true),
      task('Phase2.Deploy', 'Phase2'),
    ];
    const deps = [edge('Phase1.Design', 'Phase1.Build'), edge('Phase1.Build', 'Phase2.Deploy')];

    expect(() => validateGraph(tasks, deps)).not.toThrow();
  });
});

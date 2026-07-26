import { describe, expect, it } from 'vitest';

import {
  formatPredecessorDisplay,
  parsePredecessorWbsCodes,
  resolvePredecessorIds,
} from './predecessors.js';
import type { DependencyRow, TaskRow } from './types.js';

function task(partial: Partial<TaskRow> & Pick<TaskRow, 'id' | 'name' | 'wbsCode'>): TaskRow {
  return {
    projectId: 'p1',
    parentId: null,
    wbsPath: partial.wbsCode,
    sortOrder: 0,
    notes: null,
    isMilestone: false,
    isSummary: false,
    schedulingMode: 'cpm',
    durationMinutes: 480,
    taskType: null,
    isEffortDriven: true,
    isManuallyScheduled: false,
    constraintType: null,
    constraintDate: null,
    deadline: null,
    calendarId: null,
    earlyStart: null,
    earlyFinish: null,
    lateStart: null,
    lateFinish: null,
    totalFloatMinutes: null,
    freeFloatMinutes: null,
    isCritical: false,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('parsePredecessorWbsCodes', () => {
  it('splits comma/semicolon lists and strips link-type suffixes', () => {
    expect(parsePredecessorWbsCodes('1.1, 1.2FS; 2 SS+1d')).toEqual(['1.1', '1.2', '2']);
  });

  it('returns empty for blank input', () => {
    expect(parsePredecessorWbsCodes('  ')).toEqual([]);
  });
});

describe('resolvePredecessorIds / formatPredecessorDisplay', () => {
  const a = task({ id: 'a', name: 'A', wbsCode: '1' });
  const b = task({ id: 'b', name: 'B', wbsCode: '1.1' });
  const c = task({ id: 'c', name: 'C', wbsCode: '2' });

  it('resolves WBS codes to ids and rejects unknown / self', () => {
    expect(resolvePredecessorIds(c.id, ['1', '1.1'], [a, b, c])).toEqual(['a', 'b']);
    expect(() => resolvePredecessorIds(c.id, ['9'], [a, b, c])).toThrow(/Unknown WBS/);
    expect(() => resolvePredecessorIds(c.id, ['2'], [a, b, c])).toThrow(/own predecessor/);
  });

  it('formats predecessor WBS codes in numeric order', () => {
    const deps: DependencyRow[] = [
      {
        id: 'd1',
        predecessorId: 'c',
        successorId: 'b',
        linkType: 'FS',
        lagMinutes: 0,
        lagPercent: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'd2',
        predecessorId: 'a',
        successorId: 'b',
        linkType: 'FS',
        lagMinutes: 0,
        lagPercent: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const byId = new Map([
      [a.id, a],
      [b.id, b],
      [c.id, c],
    ]);
    expect(formatPredecessorDisplay(b.id, deps, byId)).toBe('1, 2');
  });
});

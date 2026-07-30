import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_TASK_GRID_COLUMN_ORDER,
  loadColumnOrder,
  moveColumnOrder,
  normalizeColumnOrder,
  saveColumnOrder,
} from './columnOrder.js';

describe('task grid column order', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('normalizeColumnOrder drops unknown ids and appends missing defaults', () => {
    expect(normalizeColumnOrder(['earlyStart', 'name', 'nope', 'name'])).toEqual([
      'earlyStart',
      'name',
      'wbsCode',
      'schedulingMode',
      'durationMinutes',
      'predecessors',
      'earlyFinish',
      'totalFloatMinutes',
      'isCritical',
      'isMilestone',
      'resources',
      'actions',
    ]);
  });

  it('moveColumnOrder relocates a column before the drop target', () => {
    const order = ['a', 'b', 'c', 'd'];
    expect(moveColumnOrder(order, 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
    expect(moveColumnOrder(order, 'a', 'c')).toEqual(['b', 'a', 'c', 'd']);
    expect(moveColumnOrder(order, 'b', 'b')).toEqual(order);
  });

  it('load/save round-trips through localStorage', () => {
    const custom = moveColumnOrder([...DEFAULT_TASK_GRID_COLUMN_ORDER], 'totalFloatMinutes', 'wbsCode');
    saveColumnOrder(custom);
    expect(loadColumnOrder()).toEqual(custom);
  });
});

import { describe, expect, it } from 'vitest';

import { lookupDependencyEndpoints } from '../src/layers/arrows.js';
import { buildTaskById } from '../src/taskIndex.js';
import type { GanttTask } from '../src/types.js';

function task(partial: Pick<GanttTask, 'id' | 'name' | 'row'>): GanttTask {
  return {
    startMinutes: partial.row * 1440,
    durationMinutes: 1440,
    progress: 0,
    isCritical: false,
    ...partial,
  };
}

describe('lookupDependencyEndpoints (arrows.ts)', () => {
  it('does not treat dependency ids as array indices', () => {
    // Array order is reverse of id order; ids have gaps.
    const tasks = [
      task({ id: 50, name: 'Succ', row: 0 }),
      task({ id: 10, name: 'Pred', row: 1 }),
    ];
    const tasksById = buildTaskById(tasks);

    const ends = lookupDependencyEndpoints(
      { predecessorId: 10, successorId: 50 },
      tasksById,
    );

    expect(ends?.predecessor.name).toBe('Pred');
    expect(ends?.successor.name).toBe('Succ');
    expect(ends?.predecessor.row).toBe(1);
    expect(ends?.successor.row).toBe(0);

    // Regression: the old `tasks[dep.predecessorId]` path.
    expect(tasks[10]).toBeUndefined();
    expect(tasks[50]).toBeUndefined();
    expect(tasks[0]?.name).toBe('Succ'); // would have been the wrong "predecessor"
  });
});

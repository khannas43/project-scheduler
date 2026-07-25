import { describe, expect, it } from 'vitest';

import { BAR_HEIGHT, BAR_VPAD } from '../src/constants.js';
import { buildSpatialIndex, hitTest } from '../src/hitTest.js';
import { lookupDependencyEndpoints } from '../src/layers/arrows.js';
import { buildTaskById, lookupTask } from '../src/taskIndex.js';
import type { GanttDependency, GanttTask } from '../src/types.js';
import { ROW_HEIGHT } from '../src/viewport.js';

/**
 * Fixture where id !== array index: reverse order, gapped ids.
 * Indexing `tasks[id]` would resolve the wrong task (or undefined).
 */
function misalignedTasks(): GanttTask[] {
  return [
    {
      id: 300,
      name: 'Charlie',
      row: 0,
      startMinutes: 0,
      durationMinutes: 1440,
      progress: 0.5,
      isCritical: false,
      isSummary: false,
    },
    {
      id: 100,
      name: 'Alice',
      row: 1,
      startMinutes: 1440,
      durationMinutes: 2880,
      progress: 0.2,
      isCritical: true,
      isSummary: false,
    },
    {
      id: 200,
      name: 'Bob',
      row: 2,
      startMinutes: 4320,
      durationMinutes: 1440,
      progress: 0,
      isCritical: false,
      isSummary: false,
    },
  ];
}

describe('id ≠ array-index resolution', () => {
  const tasks = misalignedTasks();
  const tasksById = buildTaskById(tasks);

  it('buildTaskById maps by id, not position', () => {
    expect(tasks[0]?.id).toBe(300);
    expect(tasksById.get(100)?.name).toBe('Alice');
    expect(tasksById.get(200)?.name).toBe('Bob');
    expect(tasksById.get(300)?.name).toBe('Charlie');
    // Demonstrates the bug this fixes: id-as-index is wrong here.
    expect(tasks[100]).toBeUndefined();
    expect(tasks[0]?.name).not.toBe('Alice');
  });

  it('hitTest returns the stored task id; lookupTask resolves the correct task', () => {
    // Spatial bars as drawBars would emit — taskId is the real id, y from row.
    const index = buildSpatialIndex(
      tasks.map((task) => ({
        x: 100,
        y: task.row * ROW_HEIGHT + BAR_VPAD,
        w: 50,
        h: BAR_HEIGHT,
        taskId: task.id,
      })),
    );

    // Pointer over Alice's bar (row 1).
    const hitId = hitTest(index, 125, ROW_HEIGHT + BAR_VPAD + 5);
    expect(hitId).toBe(100);
    expect(lookupTask(tasksById, hitId)?.name).toBe('Alice');

    // Naïve `tasks[hitId]` would miss; `tasks[1]` is Alice only by coincidence of row.
    expect(tasks[hitId!]).toBeUndefined();

    // Pointer over Charlie (row 0) — id 300, not index 0.
    const charlieId = hitTest(index, 125, BAR_VPAD + 5);
    expect(charlieId).toBe(300);
    expect(lookupTask(tasksById, charlieId)?.name).toBe('Charlie');
    expect(tasks[charlieId!]).toBeUndefined();
    // Index 0 happens to be Charlie today; index-as-id for 300 still fails.
    expect(lookupTask(tasksById, 300)?.row).toBe(0);
  });

  it('lookupDependencyEndpoints resolves by id across gaps and reverse order', () => {
    const dep: GanttDependency = { predecessorId: 300, successorId: 100 };
    const ends = lookupDependencyEndpoints(dep, tasksById);
    expect(ends).not.toBeNull();
    expect(ends?.predecessor.name).toBe('Charlie');
    expect(ends?.successor.name).toBe('Alice');

    // The broken pattern would use tasks[300] / tasks[100] → undefined.
    expect(tasks[dep.predecessorId]).toBeUndefined();
    expect(tasks[dep.successorId]).toBeUndefined();

    const missing = lookupDependencyEndpoints(
      { predecessorId: 300, successorId: 999 },
      tasksById,
    );
    expect(missing).toBeNull();
  });
});

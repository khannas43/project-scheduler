import { MINUTES_PER_DAY } from './constants.js';
import type { GanttDependency, GanttTask } from './types.js';

export interface SyntheticProject {
  readonly tasks: readonly GanttTask[];
  readonly dependencies: readonly GanttDependency[];
}

/** Small deterministic PRNG so the benchmark set is stable across reloads. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Synthetic task generator for the 10k-task benchmark only — not domain data.
 * Parameterize `n` (default 10_000). Durations/starts are randomized but
 * reasonable; a sparse FS chain gives the arrows layer something to draw.
 */
export function generateSyntheticProject(n = 10_000, seed = 1): SyntheticProject {
  if (n < 0 || !Number.isInteger(n)) {
    throw new RangeError(`n must be a non-negative integer, got ${n}`);
  }

  const rand = mulberry32(seed);
  const tasks: GanttTask[] = [];
  const dependencies: GanttDependency[] = [];

  // Spread work across ~18 months so horizontal virtualisation matters.
  const horizonMinutes = 540 * MINUTES_PER_DAY;

  for (let i = 0; i < n; i++) {
    const durationDays = 1 + Math.floor(rand() * 14);
    const startMinutes = Math.floor(rand() * (horizonMinutes - durationDays * MINUTES_PER_DAY));
    tasks.push({
      id: i,
      name: `Task ${i + 1}`,
      row: i,
      startMinutes,
      durationMinutes: durationDays * MINUTES_PER_DAY,
      progress: rand(),
      isCritical: rand() < 0.12,
      isSummary: false,
    });
  }

  // ~1 dependency per 4 tasks — enough arrows to stress Path2D batching,
  // sparse enough that most visible rows still have at most one link.
  for (let i = 1; i < n; i++) {
    if (rand() < 0.25) {
      const lookback = 1 + Math.floor(rand() * Math.min(i, 8));
      dependencies.push({
        predecessorId: i - lookback,
        successorId: i,
      });
    }
  }

  return { tasks, dependencies };
}

import { BAR_HEIGHT, BAR_VPAD, MINUTES_PER_DAY, PIXELS_PER_DAY, ROW_HEIGHT } from '../constants.js';
import type { GanttDependency, GanttTask, ViewportState } from '../types.js';
import { isBarInTimeWindow, minutesToX, visibleRowRange } from '../viewport.js';

export interface ArrowsDrawInput {
  readonly ctx: CanvasRenderingContext2D;
  readonly tasks: readonly GanttTask[];
  /** id → task; required because `id` is not an array index. */
  readonly tasksById: ReadonlyMap<number, GanttTask>;
  readonly dependencies: readonly GanttDependency[];
  readonly viewport: ViewportState;
  readonly pixelsPerMinute?: number;
}

export interface ResolvedDependency {
  readonly predecessor: GanttTask;
  readonly successor: GanttTask;
}

/**
 * Resolve dependency endpoints by id via the task map — never `tasks[id]`.
 * Returns null if either endpoint is missing.
 */
export function lookupDependencyEndpoints(
  dep: GanttDependency,
  tasksById: ReadonlyMap<number, GanttTask>,
): ResolvedDependency | null {
  const predecessor = tasksById.get(dep.predecessorId);
  const successor = tasksById.get(dep.successorId);
  if (!predecessor || !successor) return null;
  return { predecessor, successor };
}

/**
 * Layer 2 — dependency arrows. Redrawn on data or viewport change (§8.2).
 * Orthogonal elbows batched into one Path2D (§8.5) for the prototype.
 */
export function drawArrows(input: ArrowsDrawInput): void {
  const { ctx, tasks, tasksById, dependencies, viewport } = input;
  const ppm = input.pixelsPerMinute ?? PIXELS_PER_DAY / MINUTES_PER_DAY;
  const { width, height, scrollLeft, scrollTop } = viewport;

  ctx.clearRect(0, 0, width, height);

  const range = visibleRowRange({
    scrollTop,
    viewportHeight: height,
    taskCount: tasks.length,
  });

  const windowStart = scrollLeft / ppm;
  const windowEnd = (scrollLeft + width) / ppm;

  const path = new Path2D();
  let any = false;

  for (const dep of dependencies) {
    const ends = lookupDependencyEndpoints(dep, tasksById);
    if (!ends) continue;
    const { predecessor: pred, successor: succ } = ends;

    const predEnd = pred.startMinutes + pred.durationMinutes;
    const succEnd = succ.startMinutes + succ.durationMinutes;
    // Skip if both bars are fully outside the time window.
    if (
      !isBarInTimeWindow(pred.startMinutes, predEnd, windowStart, windowEnd) &&
      !isBarInTimeWindow(succ.startMinutes, succEnd, windowStart, windowEnd)
    ) {
      continue;
    }

    // Cull vertically if both rows are far outside the viewport overscan.
    if (
      (pred.row < range.start - 2 && succ.row < range.start - 2) ||
      (pred.row >= range.end + 2 && succ.row >= range.end + 2)
    ) {
      continue;
    }

    const x1 = minutesToX(predEnd, scrollLeft, ppm);
    const y1 = pred.row * ROW_HEIGHT - scrollTop + BAR_VPAD + BAR_HEIGHT / 2;
    const x2 = minutesToX(succ.startMinutes, scrollLeft, ppm);
    const y2 = succ.row * ROW_HEIGHT - scrollTop + BAR_VPAD + BAR_HEIGHT / 2;

    appendElbow(path, x1, y1, x2, y2, pred.row, succ.row);
    any = true;
  }

  if (!any) return;

  ctx.strokeStyle = '#6b7280';
  ctx.lineWidth = 1.25;
  ctx.lineJoin = 'round';
  ctx.stroke(path);
}

function appendElbow(
  path: Path2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  predRow: number,
  succRow: number,
): void {
  path.moveTo(x1, y1);

  if (x2 >= x1) {
    // Successor starts after predecessor ends — three-segment elbow (§8.5).
    const midX = x1 + Math.max(8, (x2 - x1) / 2);
    path.lineTo(midX, y1);
    path.lineTo(midX, y2);
    path.lineTo(x2, y2);
  } else {
    // Successor starts before predecessor ends — route around (§8.5).
    const gap = Math.abs(succRow - predRow) <= 1 ? 6 : 12;
    const down = y1 < y2 ? y1 + gap : y1 - gap;
    path.lineTo(x1 + 8, y1);
    path.lineTo(x1 + 8, down);
    path.lineTo(x2 - 8, down);
    path.lineTo(x2 - 8, y2);
    path.lineTo(x2, y2);
  }

  // Arrowhead
  const ah = 5;
  path.moveTo(x2, y2);
  path.lineTo(x2 - ah, y2 - ah * 0.6);
  path.moveTo(x2, y2);
  path.lineTo(x2 - ah, y2 + ah * 0.6);
}

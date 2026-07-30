import { BAR_HEIGHT, BAR_VPAD, MINUTES_PER_DAY, PIXELS_PER_DAY, ROW_HEIGHT } from '../constants.js';
import { buildSpatialIndex, type SpatialBar } from '../hitTest.js';
import type { GanttTask, ViewportState } from '../types.js';
import { isBarInTimeWindow, minutesToX, visibleRowRange } from '../viewport.js';

export interface BarsDrawInput {
  readonly ctx: CanvasRenderingContext2D;
  readonly tasks: readonly GanttTask[];
  readonly viewport: ViewportState;
  readonly pixelsPerMinute?: number;
}

export interface BarsDrawResult {
  /** Spatial index rebuilt on every bars-layer repaint (§8.4). */
  readonly spatialIndex: Float32Array;
}

/**
 * Layer 3 — task bars + progress. Redrawn on data or viewport change (§8.2).
 * Only visible rows (+ overscan) and in-window bars are drawn (§8.3).
 */
export function drawBars(input: BarsDrawInput): BarsDrawResult {
  const { ctx, tasks, viewport } = input;
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
  const spatial: SpatialBar[] = [];

  for (let i = range.start; i < range.end; i++) {
    const task = tasks[i];
    if (!task) continue;

    const end = task.startMinutes + task.durationMinutes;
    if (!isBarInTimeWindow(task.startMinutes, end, windowStart, windowEnd)) continue;

    const x = minutesToX(task.startMinutes, scrollLeft, ppm);
    const w = Math.max(2, task.durationMinutes * ppm);
    const y = task.row * ROW_HEIGHT - scrollTop + BAR_VPAD;

    // Agile (amber) never shares the critical branch — Round 1 forces isCritical=false.
    ctx.fillStyle = task.isAgile ? '#d97706' : task.isCritical ? '#dc2626' : '#3b82f6';
    roundRect(ctx, x, y, w, BAR_HEIGHT, 3);
    ctx.fill();

    if (task.progress > 0) {
      ctx.fillStyle = task.isAgile ? '#92400e' : task.isCritical ? '#991b1b' : '#1d4ed8';
      const pw = Math.max(0, Math.min(w, w * task.progress));
      roundRect(ctx, x, y, pw, BAR_HEIGHT, 3);
      ctx.fill();
    }

    // Duration cue when the bar is wide enough (calendar days on the axis).
    if (w >= 36 && task.durationMinutes > 0) {
      const days = task.durationMinutes / MINUTES_PER_DAY;
      const label = Number.isInteger(days) ? `${days}d` : `${Math.round(days * 10) / 10}d`;
      ctx.fillStyle = '#ffffff';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + 4, y + BAR_HEIGHT / 2, Math.max(0, w - 8));
    }

    spatial.push({ x, y, w, h: BAR_HEIGHT, taskId: task.id });
  }

  return { spatialIndex: buildSpatialIndex(spatial) };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

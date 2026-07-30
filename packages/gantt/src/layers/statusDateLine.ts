import type { ViewportState } from '../types.js';
import { minutesToX } from '../viewport.js';

export interface StatusDateLineDrawInput {
  readonly ctx: CanvasRenderingContext2D;
  readonly viewport: ViewportState;
  readonly pixelsPerMinute: number;
  readonly originUtcMs: number;
  /** null = no status date set — clear the layer and draw nothing. */
  readonly statusDateUtcMs: number | null;
}

/**
 * Vertical status-date marker — dashed full-height line at the project's
 * status date. Drawn above bars so it remains visible when crossing a task.
 */
export function drawStatusDateLine(input: StatusDateLineDrawInput): void {
  const { ctx, viewport, pixelsPerMinute, originUtcMs, statusDateUtcMs } = input;
  const { width, height, scrollLeft } = viewport;

  ctx.clearRect(0, 0, width, height);

  if (statusDateUtcMs === null) return;

  const minutesFromOrigin = (statusDateUtcMs - originUtcMs) / 60_000;
  const x = minutesToX(minutesFromOrigin, scrollLeft, pixelsPerMinute);

  if (x < 0 || x > width) return;

  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = '#7c3aed';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(Math.round(x) + 0.5, 0);
  ctx.lineTo(Math.round(x) + 0.5, height);
  ctx.stroke();
  ctx.restore();
}

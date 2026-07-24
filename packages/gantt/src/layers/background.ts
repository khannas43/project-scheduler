import { MINUTES_PER_DAY, PIXELS_PER_DAY, ROW_HEIGHT } from '../constants.js';
import type { ViewportState } from '../types.js';

export interface BackgroundDrawInput {
  readonly ctx: CanvasRenderingContext2D;
  readonly viewport: ViewportState;
  readonly pixelsPerMinute?: number;
  /** Working weekdays 0=Sun..6=Sat; default Mon–Fri. */
  readonly workingDays?: readonly number[];
}

/**
 * Layer 1 — background (grid, non-working time). Redrawn on viewport change only (§8.2).
 */
export function drawBackground(input: BackgroundDrawInput): void {
  const { ctx, viewport } = input;
  const ppm = input.pixelsPerMinute ?? PIXELS_PER_DAY / MINUTES_PER_DAY;
  const workingDays = input.workingDays ?? [1, 2, 3, 4, 5];
  const working = new Set(workingDays);

  const { width, height, scrollLeft, scrollTop } = viewport;
  ctx.clearRect(0, 0, width, height);

  // Base
  ctx.fillStyle = '#f7f8fa';
  ctx.fillRect(0, 0, width, height);

  // Day columns + weekend shading
  const dayWidth = MINUTES_PER_DAY * ppm;
  const firstDay = Math.floor(scrollLeft / dayWidth) - 1;
  const lastDay = Math.ceil((scrollLeft + width) / dayWidth) + 1;

  for (let d = firstDay; d <= lastDay; d++) {
    const x = d * dayWidth - scrollLeft;
    const weekday = ((d % 7) + 7) % 7;
    if (!working.has(weekday)) {
      ctx.fillStyle = '#eef0f4';
      ctx.fillRect(x, 0, dayWidth, height);
    }
    ctx.strokeStyle = '#dde1e8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, height);
    ctx.stroke();
  }

  // Horizontal row lines
  const firstRow = Math.floor(scrollTop / ROW_HEIGHT);
  const lastRow = Math.ceil((scrollTop + height) / ROW_HEIGHT);
  ctx.strokeStyle = '#e5e8ef';
  ctx.lineWidth = 1;
  for (let r = firstRow; r <= lastRow; r++) {
    const y = r * ROW_HEIGHT - scrollTop;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(width, Math.round(y) + 0.5);
    ctx.stroke();
  }
}

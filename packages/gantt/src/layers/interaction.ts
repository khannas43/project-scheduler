import { BAR_HEIGHT, BAR_VPAD, MINUTES_PER_DAY, PIXELS_PER_DAY, ROW_HEIGHT } from '../constants.js';
import { lookupTask } from '../taskIndex.js';
import type { GanttTask, ViewportState } from '../types.js';
import { minutesToX } from '../viewport.js';

export interface InteractionDrawInput {
  readonly ctx: CanvasRenderingContext2D;
  readonly viewport: ViewportState;
  readonly tasks: readonly GanttTask[];
  /** id → task; required because `id` is not an array index. */
  readonly tasksById: ReadonlyMap<number, GanttTask>;
  readonly hoverTaskId: number | null;
  readonly dragGhost: DragGhost | null;
  readonly pixelsPerMinute?: number;
}

export type DragGhost =
  | { readonly kind: 'move'; readonly taskId: number; readonly startMinutes: number }
  | { readonly kind: 'resize'; readonly taskId: number; readonly durationMinutes: number }
  | { readonly kind: 'link'; readonly fromTaskId: number; readonly toX: number; readonly toY: number };

/**
 * Layer 4 — drag ghost / hover. Redrawn on every pointer move (§8.2).
 * Move/resize/link interaction lives in GanttView; this layer paints the outline + ghost.
 */
export function drawInteraction(input: InteractionDrawInput): void {
  const { ctx, viewport, tasksById, hoverTaskId, dragGhost } = input;
  const ppm = input.pixelsPerMinute ?? PIXELS_PER_DAY / MINUTES_PER_DAY;
  const { width, height, scrollLeft, scrollTop } = viewport;

  ctx.clearRect(0, 0, width, height);

  const hover = lookupTask(tasksById, hoverTaskId);
  if (hover) {
    const x = minutesToX(hover.startMinutes, scrollLeft, ppm);
    const w = Math.max(2, hover.durationMinutes * ppm);
    const y = hover.row * ROW_HEIGHT - scrollTop + BAR_VPAD;
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 1, y - 1, w + 2, BAR_HEIGHT + 2);
  }

  if (!dragGhost) return;

  if (dragGhost.kind === 'link') {
    drawLinkGhost(ctx, tasksById, dragGhost, scrollLeft, scrollTop, ppm);
    return;
  }

  const task = lookupTask(tasksById, dragGhost.taskId);
  if (!task) return;

  const startMinutes = dragGhost.kind === 'move' ? dragGhost.startMinutes : task.startMinutes;
  const durationMinutes =
    dragGhost.kind === 'resize' ? dragGhost.durationMinutes : task.durationMinutes;
  const x = minutesToX(startMinutes, scrollLeft, ppm);
  const w = Math.max(2, durationMinutes * ppm);
  const y = task.row * ROW_HEIGHT - scrollTop + BAR_VPAD;
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#111827';
  ctx.fillRect(x, y, w, BAR_HEIGHT);
  ctx.globalAlpha = 1;
}

function drawLinkGhost(
  ctx: CanvasRenderingContext2D,
  tasksById: ReadonlyMap<number, GanttTask>,
  ghost: Extract<DragGhost, { kind: 'link' }>,
  scrollLeft: number,
  scrollTop: number,
  ppm: number,
): void {
  const from = lookupTask(tasksById, ghost.fromTaskId);
  if (!from) return;

  const fromEnd = from.startMinutes + from.durationMinutes;
  const x1 = minutesToX(fromEnd, scrollLeft, ppm);
  const y1 = from.row * ROW_HEIGHT - scrollTop + BAR_VPAD + BAR_HEIGHT / 2;
  const x2 = ghost.toX;
  const y2 = ghost.toY;

  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Small arrowhead at the pointer tip (angle of the rubber-band line).
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const ah = 6;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - ah * Math.cos(angle - 0.4), y2 - ah * Math.sin(angle - 0.4));
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - ah * Math.cos(angle + 0.4), y2 - ah * Math.sin(angle + 0.4));
  ctx.stroke();
}

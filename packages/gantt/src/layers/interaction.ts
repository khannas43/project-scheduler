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

export interface DragGhost {
  readonly taskId: number;
  readonly startMinutes: number;
}

/**
 * Layer 4 — drag ghost / hover. Redrawn on every pointer move (§8.2).
 * Drag-to-move lives in GanttView; this layer paints the hover outline and ghost.
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

  if (dragGhost) {
    const task = lookupTask(tasksById, dragGhost.taskId);
    if (task) {
      const x = minutesToX(dragGhost.startMinutes, scrollLeft, ppm);
      const w = Math.max(2, task.durationMinutes * ppm);
      const y = task.row * ROW_HEIGHT - scrollTop + BAR_VPAD;
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#111827';
      ctx.fillRect(x, y, w, BAR_HEIGHT);
      ctx.globalAlpha = 1;
    }
  }
}

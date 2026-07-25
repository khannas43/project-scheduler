import { MINUTES_PER_DAY, PIXELS_PER_DAY, RESIZE_EDGE_PX, ROW_HEIGHT } from './constants.js';
import { snapDurationMinutes, snapMinutesToDay } from './drag.js';
import { hitTest } from './hitTest.js';
import { drawArrows } from './layers/arrows.js';
import { drawBackground } from './layers/background.js';
import { drawBars } from './layers/bars.js';
import { drawInteraction, type DragGhost } from './layers/interaction.js';
import { buildTaskById, lookupTask } from './taskIndex.js';
import type { GanttDependency, GanttTask, ViewportState } from './types.js';
import { minutesToX, xToMinutes } from './viewport.js';

export interface GanttViewOptions {
  readonly container: HTMLElement;
  readonly tasks: readonly GanttTask[];
  readonly dependencies: readonly GanttDependency[];
  readonly pixelsPerMinute?: number;
  readonly onHover?: (taskId: number | null) => void;
  /** Fired on pointerup when a non-summary bar was dragged to a new day-snapped start. */
  readonly onCommitMove?: (taskId: number, newStartMinutes: number) => void;
  /** Fired on pointerup when a non-summary bar's right edge was resized to a new duration. */
  readonly onCommitResize?: (taskId: number, newDurationMinutes: number) => void;
}

type LayerName = 'background' | 'arrows' | 'bars' | 'interaction';

interface ActiveDrag {
  readonly pointerId: number;
  readonly taskId: number;
  readonly originStartMinutes: number;
  /** Pointer minutes − bar start at pointerdown (keeps grab point under the cursor). */
  readonly grabOffsetMinutes: number;
  currentStartMinutes: number;
}

interface ActiveResize {
  readonly pointerId: number;
  readonly taskId: number;
  readonly startMinutes: number;
  readonly originDurationMinutes: number;
  currentDurationMinutes: number;
}

/**
 * Four-layer canvas Gantt (§8.2). Each layer is its own `<canvas>`; dirty
 * flags ensure redraws follow the invalidation table:
 *
 * - background  — viewport change only
 * - arrows/bars — data or viewport change
 * - interaction — every pointer move
 */
export class GanttView {
  readonly container: HTMLElement;
  private readonly stack: HTMLElement;
  private readonly canvases: Record<LayerName, HTMLCanvasElement>;
  private readonly contexts: Record<LayerName, CanvasRenderingContext2D>;
  private readonly dirty: Record<LayerName, boolean> = {
    background: true,
    arrows: true,
    bars: true,
    interaction: true,
  };

  private tasks: readonly GanttTask[];
  private tasksById: ReadonlyMap<number, GanttTask>;
  private dependencies: readonly GanttDependency[];
  private readonly pixelsPerMinute: number;
  private readonly onHover: ((taskId: number | null) => void) | undefined;
  private readonly onCommitMove: ((taskId: number, newStartMinutes: number) => void) | undefined;
  private readonly onCommitResize: ((taskId: number, newDurationMinutes: number) => void) | undefined;

  private viewport: ViewportState = { scrollTop: 0, scrollLeft: 0, width: 0, height: 0 };
  private spatialIndex: Float32Array = new Float32Array(0);
  private hoverTaskId: number | null = null;
  private dragGhost: DragGhost | null = null;
  private drag: ActiveDrag | null = null;
  private resizeDrag: ActiveResize | null = null;
  private raf = 0;
  private dpr = 1;

  private readonly onWheel: (e: WheelEvent) => void;
  private readonly onPointerDown: (e: PointerEvent) => void;
  private readonly onPointerMove: (e: PointerEvent) => void;
  private readonly onPointerUp: (e: PointerEvent) => void;
  private readonly onPointerLeave: () => void;
  private readonly onResize: () => void;

  constructor(options: GanttViewOptions) {
    this.container = options.container;
    this.tasks = options.tasks;
    this.tasksById = buildTaskById(options.tasks);
    this.dependencies = options.dependencies;
    this.pixelsPerMinute = options.pixelsPerMinute ?? PIXELS_PER_DAY / MINUTES_PER_DAY;
    this.onHover = options.onHover;
    this.onCommitMove = options.onCommitMove;
    this.onCommitResize = options.onCommitResize;

    this.stack = document.createElement('div');
    this.stack.style.cssText =
      'position:relative;width:100%;height:100%;overflow:hidden;touch-action:none;';
    this.container.appendChild(this.stack);

    this.canvases = {
      background: this.makeCanvas(1),
      arrows: this.makeCanvas(2),
      bars: this.makeCanvas(3),
      interaction: this.makeCanvas(4),
    };
    this.contexts = {
      background: require2d(this.canvases.background),
      arrows: require2d(this.canvases.arrows),
      bars: require2d(this.canvases.bars),
      interaction: require2d(this.canvases.interaction),
    };

    this.onWheel = (e) => {
      e.preventDefault();
      this.scrollBy(e.deltaX, e.deltaY);
    };
    this.onPointerDown = (e) => this.handlePointerDown(e);
    this.onPointerMove = (e) => this.handlePointerMove(e);
    this.onPointerUp = (e) => this.handlePointerUp(e);
    this.onPointerLeave = () => {
      if (!this.drag && !this.resizeDrag) {
        this.setHover(null);
        this.stack.style.cursor = '';
      }
    };
    this.onResize = () => this.resize();

    this.stack.addEventListener('wheel', this.onWheel, { passive: false });
    this.stack.addEventListener('pointerdown', this.onPointerDown);
    this.stack.addEventListener('pointermove', this.onPointerMove);
    this.stack.addEventListener('pointerup', this.onPointerUp);
    this.stack.addEventListener('pointercancel', this.onPointerUp);
    this.stack.addEventListener('pointerleave', this.onPointerLeave);
    window.addEventListener('resize', this.onResize);

    this.resize();
  }

  get taskCount(): number {
    return this.tasks.length;
  }

  get contentHeight(): number {
    return this.tasks.length * ROW_HEIGHT;
  }

  getViewport(): ViewportState {
    return this.viewport;
  }

  /** Test seam — active move-drag state, if any. */
  getActiveDrag(): Readonly<ActiveDrag> | null {
    return this.drag;
  }

  /** Test seam — active resize-drag state, if any. */
  getActiveResize(): Readonly<ActiveResize> | null {
    return this.resizeDrag;
  }

  setData(tasks: readonly GanttTask[], dependencies: readonly GanttDependency[]): void {
    this.tasks = tasks;
    this.tasksById = buildTaskById(tasks);
    this.dependencies = dependencies;
    this.dirty.arrows = true;
    this.dirty.bars = true;
    this.dirty.interaction = true;
    this.schedule();
  }

  setScroll(scrollLeft: number, scrollTop: number): void {
    const maxTop = Math.max(0, this.contentHeight - this.viewport.height);
    const nextLeft = Math.max(0, scrollLeft);
    const nextTop = Math.min(maxTop, Math.max(0, scrollTop));
    if (nextLeft === this.viewport.scrollLeft && nextTop === this.viewport.scrollTop) return;

    this.viewport = { ...this.viewport, scrollLeft: nextLeft, scrollTop: nextTop };
    this.dirty.background = true;
    this.dirty.arrows = true;
    this.dirty.bars = true;
    this.dirty.interaction = true;
    this.schedule();
  }

  scrollBy(dx: number, dy: number): void {
    this.setScroll(this.viewport.scrollLeft + dx, this.viewport.scrollTop + dy);
  }

  setHover(taskId: number | null): void {
    if (taskId === this.hoverTaskId) return;
    this.hoverTaskId = taskId;
    this.dirty.interaction = true;
    this.schedule();
    this.onHover?.(taskId);
  }

  setDragGhost(ghost: DragGhost | null): void {
    this.dragGhost = ghost;
    this.dirty.interaction = true;
    this.schedule();
  }

  /** Force a synchronous paint of all dirty layers (used by the FPS harness). */
  paint(): void {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    this.flush();
  }

  destroy(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.stack.removeEventListener('wheel', this.onWheel);
    this.stack.removeEventListener('pointerdown', this.onPointerDown);
    this.stack.removeEventListener('pointermove', this.onPointerMove);
    this.stack.removeEventListener('pointerup', this.onPointerUp);
    this.stack.removeEventListener('pointercancel', this.onPointerUp);
    this.stack.removeEventListener('pointerleave', this.onPointerLeave);
    window.removeEventListener('resize', this.onResize);
    this.stack.remove();
  }

  private makeCanvas(z: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.setAttribute('aria-hidden', 'true');
    c.style.cssText = `position:absolute;inset:0;width:100%;height:100%;z-index:${z};`;
    this.stack.appendChild(c);
    return c;
  }

  private resize(): void {
    const rect = this.stack.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    this.dpr = window.devicePixelRatio || 1;

    for (const name of Object.keys(this.canvases) as LayerName[]) {
      const canvas = this.canvases[name];
      canvas.width = Math.floor(width * this.dpr);
      canvas.height = Math.floor(height * this.dpr);
      const ctx = this.contexts[name];
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    this.viewport = { ...this.viewport, width, height };
    this.dirty.background = true;
    this.dirty.arrows = true;
    this.dirty.bars = true;
    this.dirty.interaction = true;
    this.schedule();
  }

  private pointerLocal(e: PointerEvent): { x: number; y: number } {
    const rect = this.stack.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private barPixelGeometry(task: GanttTask): { x: number; w: number } {
    const x = minutesToX(task.startMinutes, this.viewport.scrollLeft, this.pixelsPerMinute);
    const w = Math.max(2, task.durationMinutes * this.pixelsPerMinute);
    return { x, w };
  }

  /** True when the pointer is within RESIZE_EDGE_PX of the bar's right edge. */
  private isNearRightResizeEdge(pointerX: number, task: GanttTask): boolean {
    const { x, w } = this.barPixelGeometry(task);
    return pointerX >= x + w - RESIZE_EDGE_PX && pointerX <= x + w;
  }

  private updateHoverCursor(x: number, y: number): void {
    if (this.drag || this.resizeDrag) return;
    const taskId = hitTest(this.spatialIndex, x, y);
    const task = lookupTask(this.tasksById, taskId);
    if (task && !task.isSummary && this.isNearRightResizeEdge(x, task)) {
      this.stack.style.cursor = 'ew-resize';
    } else {
      this.stack.style.cursor = '';
    }
  }

  private handlePointerDown(e: PointerEvent): void {
    if (this.drag || this.resizeDrag) return;
    // Ensure spatial index is current before hit-testing.
    this.paint();

    const { x, y } = this.pointerLocal(e);
    const taskId = hitTest(this.spatialIndex, x, y);
    if (taskId === null) return;

    const task = lookupTask(this.tasksById, taskId);
    if (!task || task.isSummary) return;

    this.stack.setPointerCapture(e.pointerId);

    if (this.isNearRightResizeEdge(x, task)) {
      this.resizeDrag = {
        pointerId: e.pointerId,
        taskId,
        startMinutes: task.startMinutes,
        originDurationMinutes: task.durationMinutes,
        currentDurationMinutes: task.durationMinutes,
      };
      this.stack.style.cursor = 'ew-resize';
      this.setDragGhost({
        kind: 'resize',
        taskId,
        durationMinutes: task.durationMinutes,
      });
      e.preventDefault();
      return;
    }

    const pointerMinutes = xToMinutes(x, this.viewport.scrollLeft, this.pixelsPerMinute);
    const grabOffsetMinutes = pointerMinutes - task.startMinutes;

    this.drag = {
      pointerId: e.pointerId,
      taskId,
      originStartMinutes: task.startMinutes,
      grabOffsetMinutes,
      currentStartMinutes: task.startMinutes,
    };
    this.stack.style.cursor = '';
    this.setDragGhost({ kind: 'move', taskId, startMinutes: task.startMinutes });
    e.preventDefault();
  }

  private handlePointerMove(e: PointerEvent): void {
    if (this.resizeDrag && e.pointerId === this.resizeDrag.pointerId) {
      const { x } = this.pointerLocal(e);
      const pointerMinutes = xToMinutes(x, this.viewport.scrollLeft, this.pixelsPerMinute);
      const snapped = snapDurationMinutes(pointerMinutes - this.resizeDrag.startMinutes);
      if (snapped !== this.resizeDrag.currentDurationMinutes) {
        this.resizeDrag.currentDurationMinutes = snapped;
        this.setDragGhost({
          kind: 'resize',
          taskId: this.resizeDrag.taskId,
          durationMinutes: snapped,
        });
      }
      return;
    }

    if (this.drag && e.pointerId === this.drag.pointerId) {
      const { x } = this.pointerLocal(e);
      const pointerMinutes = xToMinutes(x, this.viewport.scrollLeft, this.pixelsPerMinute);
      const snapped = snapMinutesToDay(pointerMinutes - this.drag.grabOffsetMinutes);
      if (snapped !== this.drag.currentStartMinutes) {
        this.drag.currentStartMinutes = snapped;
        this.setDragGhost({
          kind: 'move',
          taskId: this.drag.taskId,
          startMinutes: snapped,
        });
      }
      return;
    }

    const { x, y } = this.pointerLocal(e);
    const id = hitTest(this.spatialIndex, x, y);
    this.setHover(id);
    this.updateHoverCursor(x, y);
  }

  private handlePointerUp(e: PointerEvent): void {
    if (this.resizeDrag && e.pointerId === this.resizeDrag.pointerId) {
      const { taskId, originDurationMinutes, currentDurationMinutes, pointerId } = this.resizeDrag;
      this.resizeDrag = null;

      if (this.stack.hasPointerCapture(pointerId)) {
        this.stack.releasePointerCapture(pointerId);
      }
      this.setDragGhost(null);
      this.stack.style.cursor = '';

      if (currentDurationMinutes !== originDurationMinutes) {
        this.onCommitResize?.(taskId, currentDurationMinutes);
      }
      return;
    }

    if (!this.drag || e.pointerId !== this.drag.pointerId) return;

    const { taskId, originStartMinutes, currentStartMinutes, pointerId } = this.drag;
    this.drag = null;

    if (this.stack.hasPointerCapture(pointerId)) {
      this.stack.releasePointerCapture(pointerId);
    }
    this.setDragGhost(null);

    if (currentStartMinutes !== originStartMinutes) {
      this.onCommitMove?.(taskId, currentStartMinutes);
    }
  }

  private schedule(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.flush();
    });
  }

  private flush(): void {
    const vp = this.viewport;
    const ppm = this.pixelsPerMinute;

    if (this.dirty.background) {
      drawBackground({ ctx: this.contexts.background, viewport: vp, pixelsPerMinute: ppm });
      this.dirty.background = false;
    }
    if (this.dirty.arrows) {
      drawArrows({
        ctx: this.contexts.arrows,
        tasks: this.tasks,
        tasksById: this.tasksById,
        dependencies: this.dependencies,
        viewport: vp,
        pixelsPerMinute: ppm,
      });
      this.dirty.arrows = false;
    }
    if (this.dirty.bars) {
      const { spatialIndex } = drawBars({
        ctx: this.contexts.bars,
        tasks: this.tasks,
        viewport: vp,
        pixelsPerMinute: ppm,
      });
      this.spatialIndex = spatialIndex;
      this.dirty.bars = false;
    }
    if (this.dirty.interaction) {
      drawInteraction({
        ctx: this.contexts.interaction,
        viewport: vp,
        tasks: this.tasks,
        tasksById: this.tasksById,
        hoverTaskId: this.hoverTaskId,
        dragGhost: this.dragGhost,
        pixelsPerMinute: ppm,
      });
      this.dirty.interaction = false;
    }
  }
}

function require2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('CanvasRenderingContext2D unavailable');
  return ctx;
}

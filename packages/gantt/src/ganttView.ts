import {
  HEADER_HEIGHT,
  MINUTES_PER_DAY,
  PIXELS_PER_DAY,
  RESIZE_EDGE_PX,
  ROW_HEIGHT,
} from './constants.js';
import { snapDurationMinutes, snapMinutesToDay } from './drag.js';
import { hitTest } from './hitTest.js';
import { drawArrows } from './layers/arrows.js';
import { drawBackground } from './layers/background.js';
import { drawBars } from './layers/bars.js';
import { drawInteraction, type DragGhost } from './layers/interaction.js';
import { drawStatusDateLine } from './layers/statusDateLine.js';
import { drawTimeHeader } from './layers/timeHeader.js';
import { buildTaskById, lookupTask } from './taskIndex.js';
import type { GanttDependency, GanttTask, ViewportState } from './types.js';
import { minutesToX, xToMinutes } from './viewport.js';

export interface GanttViewOptions {
  readonly container: HTMLElement;
  readonly tasks: readonly GanttTask[];
  readonly dependencies: readonly GanttDependency[];
  readonly pixelsPerMinute?: number;
  /** ISO date/time for day 0 on the timescale (usually project start). */
  readonly originDateIso?: string | null;
  /** ISO date/time for the vertical status-date progress line (cleared when null/unset). */
  readonly statusDateIso?: string | null;
  readonly onHover?: (taskId: number | null) => void;
  /** Fired on pointerup when a non-summary bar was dragged to a new day-snapped start. */
  readonly onCommitMove?: (taskId: number, newStartMinutes: number) => void;
  /** Fired on pointerup when a non-summary bar's right edge was resized to a new duration. */
  readonly onCommitResize?: (taskId: number, newDurationMinutes: number) => void;
  /** Fired on pointerup when Shift+right-edge drag lands on a different non-summary task. */
  readonly onCommitLink?: (predecessorId: number, successorId: number) => void;
}

type LayerName = 'background' | 'arrows' | 'bars' | 'statusLine' | 'interaction';

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

interface ActiveLink {
  readonly pointerId: number;
  readonly fromTaskId: number;
}

interface ActivePan {
  readonly pointerId: number;
  readonly originClientX: number;
  readonly originClientY: number;
  readonly originScrollLeft: number;
  readonly originScrollTop: number;
}

/**
 * Four-layer canvas Gantt (§8.2) plus a sticky date header. Each chart layer
 * is its own `<canvas>`; dirty flags ensure redraws follow the invalidation
 * table:
 *
 * - background / header — viewport change only
 * - arrows/bars — data or viewport change
 * - interaction — every pointer move
 */
export class GanttView {
  readonly container: HTMLElement;
  private readonly root: HTMLElement;
  private readonly headerCanvas: HTMLCanvasElement;
  private readonly headerCtx: CanvasRenderingContext2D;
  private readonly stack: HTMLElement;
  private readonly canvases: Record<LayerName, HTMLCanvasElement>;
  private readonly contexts: Record<LayerName, CanvasRenderingContext2D>;
  private readonly dirty: Record<LayerName, boolean> & { header: boolean } = {
    header: true,
    background: true,
    arrows: true,
    bars: true,
    statusLine: true,
    interaction: true,
  };

  private tasks: readonly GanttTask[];
  private tasksById: ReadonlyMap<number, GanttTask>;
  private dependencies: readonly GanttDependency[];
  private pixelsPerMinute: number;
  private originUtcMs: number;
  private statusDateUtcMs: number | null;
  private readonly onHover: ((taskId: number | null) => void) | undefined;
  private readonly onCommitMove: ((taskId: number, newStartMinutes: number) => void) | undefined;
  private readonly onCommitResize: ((taskId: number, newDurationMinutes: number) => void) | undefined;
  private readonly onCommitLink: ((predecessorId: number, successorId: number) => void) | undefined;

  private viewport: ViewportState = { scrollTop: 0, scrollLeft: 0, width: 0, height: 0 };
  private spatialIndex: Float32Array = new Float32Array(0);
  private hoverTaskId: number | null = null;
  private dragGhost: DragGhost | null = null;
  private drag: ActiveDrag | null = null;
  private resizeDrag: ActiveResize | null = null;
  private linkDrag: ActiveLink | null = null;
  private pan: ActivePan | null = null;
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
    this.originUtcMs = parseOriginUtcMs(options.originDateIso);
    this.statusDateUtcMs = parseStatusDateUtcMs(options.statusDateIso);
    this.onHover = options.onHover;
    this.onCommitMove = options.onCommitMove;
    this.onCommitResize = options.onCommitResize;
    this.onCommitLink = options.onCommitLink;

    this.root = document.createElement('div');
    this.root.style.cssText =
      'display:flex;flex-direction:column;width:100%;height:100%;overflow:hidden;';
    this.container.appendChild(this.root);

    this.headerCanvas = document.createElement('canvas');
    this.headerCanvas.setAttribute('aria-hidden', 'true');
    this.headerCanvas.style.cssText = `display:block;width:100%;height:${HEADER_HEIGHT}px;flex:0 0 ${HEADER_HEIGHT}px;cursor:grab;touch-action:none;`;
    this.root.appendChild(this.headerCanvas);
    this.headerCtx = require2d(this.headerCanvas);

    this.stack = document.createElement('div');
    this.stack.style.cssText =
      'position:relative;flex:1 1 auto;min-height:0;width:100%;overflow:hidden;touch-action:none;cursor:grab;';
    this.root.appendChild(this.stack);

    this.canvases = {
      background: this.makeCanvas(1),
      arrows: this.makeCanvas(2),
      bars: this.makeCanvas(3),
      statusLine: this.makeCanvas(4),
      interaction: this.makeCanvas(5),
    };
    this.contexts = {
      background: require2d(this.canvases.background),
      arrows: require2d(this.canvases.arrows),
      bars: require2d(this.canvases.bars),
      statusLine: require2d(this.canvases.statusLine),
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
      if (!this.drag && !this.resizeDrag && !this.linkDrag && !this.pan) {
        this.setHover(null);
        this.setIdleCursor();
      }
    };
    this.onResize = () => this.resize();

    for (const el of [this.stack, this.headerCanvas]) {
      el.addEventListener('wheel', this.onWheel, { passive: false });
      el.addEventListener('pointerdown', this.onPointerDown);
      el.addEventListener('pointermove', this.onPointerMove);
      el.addEventListener('pointerup', this.onPointerUp);
      el.addEventListener('pointercancel', this.onPointerUp);
      el.addEventListener('pointerleave', this.onPointerLeave);
    }
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

  /** Test seam — active link-drag state, if any. */
  getActiveLink(): Readonly<ActiveLink> | null {
    return this.linkDrag;
  }

  /** Test seam — active pan-drag state, if any. */
  getActivePan(): Readonly<ActivePan> | null {
    return this.pan;
  }

  /** Test seam — current drag ghost (move / resize / link preview). */
  getDragGhost(): DragGhost | null {
    return this.dragGhost;
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

  getPixelsPerMinute(): number {
    return this.pixelsPerMinute;
  }

  /** Change horizontal zoom (e.g. Day / Week / Month presets) and repaint. */
  setPixelsPerMinute(pixelsPerMinute: number): void {
    if (!(pixelsPerMinute > 0) || pixelsPerMinute === this.pixelsPerMinute) return;
    this.pixelsPerMinute = pixelsPerMinute;
    this.dirty.header = true;
    this.dirty.background = true;
    this.dirty.arrows = true;
    this.dirty.bars = true;
    this.dirty.statusLine = true;
    this.dirty.interaction = true;
    this.schedule();
  }

  /** Update day-0 date used by the timescale header labels. */
  setOriginDateIso(originDateIso: string | null | undefined): void {
    const next = parseOriginUtcMs(originDateIso);
    if (next === this.originUtcMs) return;
    this.originUtcMs = next;
    this.dirty.header = true;
    this.dirty.statusLine = true;
    this.schedule();
  }

  /** Update / clear the vertical status-date progress line. */
  setStatusDateIso(statusDateIso: string | null | undefined): void {
    const next = parseStatusDateUtcMs(statusDateIso);
    if (next === this.statusDateUtcMs) return;
    this.statusDateUtcMs = next;
    this.dirty.statusLine = true;
    this.schedule();
  }

  setScroll(scrollLeft: number, scrollTop: number): void {
    const maxTop = Math.max(0, this.contentHeight - this.viewport.height);
    const nextLeft = Math.max(0, scrollLeft);
    const nextTop = Math.min(maxTop, Math.max(0, scrollTop));
    if (nextLeft === this.viewport.scrollLeft && nextTop === this.viewport.scrollTop) return;

    this.viewport = { ...this.viewport, scrollLeft: nextLeft, scrollTop: nextTop };
    this.dirty.header = true;
    this.dirty.background = true;
    this.dirty.arrows = true;
    this.dirty.bars = true;
    this.dirty.statusLine = true;
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

  /**
   * Composite header + background + arrows + bars + status line into one PNG
   * data URL (skips the interaction overlay — hover/drag ghosts shouldn't
   * appear in the snapshot).
   */
  exportToPngDataUrl(): string {
    this.paint();
    const body = this.canvases.background;
    const out = document.createElement('canvas');
    out.width = body.width;
    out.height = this.headerCanvas.height + body.height;
    const ctx = out.getContext('2d');
    if (!ctx) throw new Error('CanvasRenderingContext2D unavailable');
    ctx.drawImage(this.headerCanvas, 0, 0);
    const y = this.headerCanvas.height;
    for (const name of ['background', 'arrows', 'bars', 'statusLine'] as const) {
      ctx.drawImage(this.canvases[name], 0, y);
    }
    return out.toDataURL('image/png');
  }

  destroy(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    for (const el of [this.stack, this.headerCanvas]) {
      el.removeEventListener('wheel', this.onWheel);
      el.removeEventListener('pointerdown', this.onPointerDown);
      el.removeEventListener('pointermove', this.onPointerMove);
      el.removeEventListener('pointerup', this.onPointerUp);
      el.removeEventListener('pointercancel', this.onPointerUp);
      el.removeEventListener('pointerleave', this.onPointerLeave);
    }
    window.removeEventListener('resize', this.onResize);
    this.root.remove();
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

    this.headerCanvas.width = Math.floor(width * this.dpr);
    this.headerCanvas.height = Math.floor(HEADER_HEIGHT * this.dpr);
    this.headerCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    for (const name of Object.keys(this.canvases) as LayerName[]) {
      const canvas = this.canvases[name];
      canvas.width = Math.floor(width * this.dpr);
      canvas.height = Math.floor(height * this.dpr);
      const ctx = this.contexts[name];
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    this.viewport = { ...this.viewport, width, height };
    this.dirty.header = true;
    this.dirty.background = true;
    this.dirty.arrows = true;
    this.dirty.bars = true;
    this.dirty.statusLine = true;
    this.dirty.interaction = true;
    this.schedule();
  }

  private pointerLocal(e: PointerEvent): { x: number; y: number } {
    const rect = this.stack.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private captureTarget(e: PointerEvent): HTMLElement {
    return e.currentTarget instanceof HTMLElement ? e.currentTarget : this.stack;
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

  private setIdleCursor(): void {
    this.stack.style.cursor = 'grab';
    this.headerCanvas.style.cursor = 'grab';
  }

  private updateHoverCursor(x: number, y: number): void {
    if (this.drag || this.resizeDrag || this.linkDrag || this.pan) return;
    const taskId = hitTest(this.spatialIndex, x, y);
    const task = lookupTask(this.tasksById, taskId);
    if (task && isMovableBar(task) && this.isNearRightResizeEdge(x, task)) {
      this.stack.style.cursor = 'ew-resize';
    } else if (task && isMovableBar(task)) {
      this.stack.style.cursor = 'default';
    } else {
      this.setIdleCursor();
    }
  }

  private beginPan(e: PointerEvent): void {
    const target = this.captureTarget(e);
    target.setPointerCapture(e.pointerId);
    this.pan = {
      pointerId: e.pointerId,
      originClientX: e.clientX,
      originClientY: e.clientY,
      originScrollLeft: this.viewport.scrollLeft,
      originScrollTop: this.viewport.scrollTop,
    };
    this.stack.style.cursor = 'grabbing';
    this.headerCanvas.style.cursor = 'grabbing';
    this.setHover(null);
    e.preventDefault();
  }

  private handlePointerDown(e: PointerEvent): void {
    if (this.drag || this.resizeDrag || this.linkDrag || this.pan) return;

    // Middle / aux button always pans; header strip always pans.
    const onHeader = e.currentTarget === this.headerCanvas;
    if (e.button === 1 || onHeader) {
      this.beginPan(e);
      return;
    }
    if (e.button !== 0) return;

    // Ensure spatial index is current before hit-testing.
    this.paint();

    const { x, y } = this.pointerLocal(e);
    // Clicks that land outside the chart body (e.g. header) already panned.
    if (y < 0 || y > this.viewport.height) {
      this.beginPan(e);
      return;
    }

    const taskId = hitTest(this.spatialIndex, x, y);
    if (taskId === null) {
      this.beginPan(e);
      return;
    }

    const task = lookupTask(this.tasksById, taskId);
    if (!task || !isMovableBar(task)) {
      this.beginPan(e);
      return;
    }

    this.stack.setPointerCapture(e.pointerId);

    if (this.isNearRightResizeEdge(x, task)) {
      // Shift+right-edge starts a link-drag; plain right-edge still resizes.
      if (e.shiftKey) {
        this.linkDrag = { pointerId: e.pointerId, fromTaskId: taskId };
        this.stack.style.cursor = '';
        this.setDragGhost({ kind: 'link', fromTaskId: taskId, toX: x, toY: y });
        e.preventDefault();
        return;
      }

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
    if (this.pan && e.pointerId === this.pan.pointerId) {
      const dx = e.clientX - this.pan.originClientX;
      const dy = e.clientY - this.pan.originClientY;
      // Dragging right reveals earlier dates (scroll left decreases).
      this.setScroll(this.pan.originScrollLeft - dx, this.pan.originScrollTop - dy);
      return;
    }

    if (this.linkDrag && e.pointerId === this.linkDrag.pointerId) {
      const { x, y } = this.pointerLocal(e);
      this.setDragGhost({
        kind: 'link',
        fromTaskId: this.linkDrag.fromTaskId,
        toX: x,
        toY: y,
      });
      return;
    }

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

    if (e.currentTarget === this.headerCanvas) {
      this.headerCanvas.style.cursor = 'grab';
      return;
    }

    const { x, y } = this.pointerLocal(e);
    const id = hitTest(this.spatialIndex, x, y);
    this.setHover(id);
    this.updateHoverCursor(x, y);
  }

  private handlePointerUp(e: PointerEvent): void {
    if (this.pan && e.pointerId === this.pan.pointerId) {
      const { pointerId } = this.pan;
      this.pan = null;
      const target = this.captureTarget(e);
      if (target.hasPointerCapture(pointerId)) {
        target.releasePointerCapture(pointerId);
      }
      this.setIdleCursor();
      return;
    }

    if (this.linkDrag && e.pointerId === this.linkDrag.pointerId) {
      const { fromTaskId, pointerId } = this.linkDrag;
      this.linkDrag = null;

      if (this.stack.hasPointerCapture(pointerId)) {
        this.stack.releasePointerCapture(pointerId);
      }
      this.setDragGhost(null);
      this.setIdleCursor();

      const { x, y } = this.pointerLocal(e);
      // Ensure spatial index is current for the drop hit-test.
      this.paint();
      const toTaskId = hitTest(this.spatialIndex, x, y);
      if (toTaskId === null || toTaskId === fromTaskId) return;
      const target = lookupTask(this.tasksById, toTaskId);
      if (!target || !isMovableBar(target)) return;
      this.onCommitLink?.(fromTaskId, toTaskId);
      return;
    }

    if (this.resizeDrag && e.pointerId === this.resizeDrag.pointerId) {
      const { taskId, originDurationMinutes, currentDurationMinutes, pointerId } = this.resizeDrag;
      this.resizeDrag = null;

      if (this.stack.hasPointerCapture(pointerId)) {
        this.stack.releasePointerCapture(pointerId);
      }
      this.setDragGhost(null);
      this.setIdleCursor();

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
    this.setIdleCursor();

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

    if (this.dirty.header) {
      drawTimeHeader({
        ctx: this.headerCtx,
        width: vp.width,
        height: HEADER_HEIGHT,
        scrollLeft: vp.scrollLeft,
        pixelsPerMinute: ppm,
        originUtcMs: this.originUtcMs,
      });
      this.dirty.header = false;
    }
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
    if (this.dirty.statusLine) {
      drawStatusDateLine({
        ctx: this.contexts.statusLine,
        viewport: vp,
        pixelsPerMinute: ppm,
        originUtcMs: this.originUtcMs,
        statusDateUtcMs: this.statusDateUtcMs,
      });
      this.dirty.statusLine = false;
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

/** Summary and agile bars refuse move/resize/link (server would reject anyway). */
function isMovableBar(task: GanttTask): boolean {
  return !task.isSummary && !task.isAgile;
}

function parseOriginUtcMs(originDateIso: string | null | undefined): number {
  if (!originDateIso) return 0;
  const ms = Date.parse(originDateIso);
  return Number.isFinite(ms) ? ms : 0;
}

/** Unset / unparseable → null so the status-line layer draws nothing. */
function parseStatusDateUtcMs(statusDateIso: string | null | undefined): number | null {
  if (!statusDateIso) return null;
  const ms = Date.parse(statusDateIso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MINUTES_PER_DAY, PIXELS_PER_DAY, RESIZE_EDGE_PX, ROW_HEIGHT } from '../src/constants.js';
import { snapDurationMinutes } from '../src/drag.js';
import { GanttView } from '../src/ganttView.js';
import type { GanttTask } from '../src/types.js';

function stubCanvas(): void {
  function Path2DStub(this: { moveTo: () => void; lineTo: () => void; rect: () => void }): void {
    this.moveTo = () => undefined;
    this.lineTo = () => undefined;
    this.rect = () => undefined;
  }
  (globalThis as unknown as { Path2D: unknown }).Path2D = Path2DStub;

  HTMLCanvasElement.prototype.getContext = vi.fn(() => {
    const noop = vi.fn();
    const ctx = new Proxy(
      { globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textBaseline: '' },
      {
        get(target, prop) {
          if (prop in target) return (target as Record<string | symbol, unknown>)[prop];
          return noop;
        },
        set(target, prop, value) {
          (target as Record<string | symbol, unknown>)[prop] = value;
          return true;
        },
      },
    );
    return ctx as unknown as CanvasRenderingContext2D;
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

function task(partial: Partial<GanttTask> & Pick<GanttTask, 'id' | 'row' | 'startMinutes'>): GanttTask {
  return {
    name: `T${partial.id}`,
    durationMinutes: MINUTES_PER_DAY,
    progress: 0,
    isCritical: false,
    isSummary: false,
    ...partial,
  };
}

function dispatch(
  el: HTMLElement,
  type: string,
  init: PointerEventInit & { clientX: number; clientY: number },
): void {
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, ...init }));
}

function setupStack(view: GanttView): HTMLElement {
  const stack = view.container.firstElementChild as HTMLElement;
  Object.defineProperty(stack, 'getBoundingClientRect', {
    value: () => ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400 }),
  });
  view.paint();
  return stack;
}

describe('snapDurationMinutes', () => {
  it('snaps to whole days and clamps to at least one day', () => {
    expect(snapDurationMinutes(MINUTES_PER_DAY * 2.4)).toBe(2 * MINUTES_PER_DAY);
    expect(snapDurationMinutes(MINUTES_PER_DAY * 0.4)).toBe(MINUTES_PER_DAY);
    expect(snapDurationMinutes(-100)).toBe(MINUTES_PER_DAY);
    expect(snapDurationMinutes(0)).toBe(MINUTES_PER_DAY);
  });
});

describe('GanttView drag-to-resize', () => {
  let host: HTMLDivElement;
  let setPointerCapture: ReturnType<typeof vi.fn>;
  let releasePointerCapture: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    stubCanvas();
    host = document.createElement('div');
    Object.defineProperty(host, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400 }),
    });
    document.body.appendChild(host);

    setPointerCapture = vi.fn();
    releasePointerCapture = vi.fn();
    HTMLElement.prototype.setPointerCapture = setPointerCapture as unknown as (
      pointerId: number,
    ) => void;
    HTMLElement.prototype.releasePointerCapture = releasePointerCapture as unknown as (
      pointerId: number,
    ) => void;
    HTMLElement.prototype.hasPointerCapture = (() => true) as typeof HTMLElement.prototype.hasPointerCapture;
  });

  afterEach(() => {
    host.remove();
    vi.restoreAllMocks();
  });

  it('starts a resize when grabbed near the right edge, and a move elsewhere', () => {
    const onCommitMove = vi.fn();
    const onCommitResize = vi.fn();
    const view = new GanttView({
      container: host,
      tasks: [task({ id: 10, row: 0, startMinutes: 0, durationMinutes: 2 * MINUTES_PER_DAY })],
      dependencies: [],
      onCommitMove,
      onCommitResize,
    });
    const stack = setupStack(view);
    const ppm = PIXELS_PER_DAY / MINUTES_PER_DAY;
    const barW = 2 * MINUTES_PER_DAY * ppm;
    const y = ROW_HEIGHT / 2;

    // Near right edge → resize.
    dispatch(stack, 'pointerdown', { clientX: barW - 2, clientY: y });
    expect(view.getActiveResize()?.taskId).toBe(10);
    expect(view.getActiveDrag()).toBeNull();
    dispatch(stack, 'pointerup', { clientX: barW - 2, clientY: y });

    // Mid-bar → move.
    dispatch(stack, 'pointerdown', { clientX: barW / 2, clientY: y });
    expect(view.getActiveDrag()?.taskId).toBe(10);
    expect(view.getActiveResize()).toBeNull();
    dispatch(stack, 'pointerup', { clientX: barW / 2, clientY: y });

    // Just outside the edge threshold but still on the bar → move.
    dispatch(stack, 'pointerdown', {
      clientX: barW - RESIZE_EDGE_PX - 1,
      clientY: y,
    });
    expect(view.getActiveDrag()?.taskId).toBe(10);
    expect(view.getActiveResize()).toBeNull();
    dispatch(stack, 'pointerup', { clientX: barW - RESIZE_EDGE_PX - 1, clientY: y });

    view.destroy();
  });

  it('snaps duration and clamps to one day when dragged past the left edge', () => {
    const onCommitResize = vi.fn();
    const view = new GanttView({
      container: host,
      tasks: [task({ id: 3, row: 0, startMinutes: 0, durationMinutes: 3 * MINUTES_PER_DAY })],
      dependencies: [],
      onCommitResize,
    });
    const stack = setupStack(view);
    const ppm = PIXELS_PER_DAY / MINUTES_PER_DAY;
    const barW = 3 * MINUTES_PER_DAY * ppm;
    const y = ROW_HEIGHT / 2;

    dispatch(stack, 'pointerdown', { clientX: barW - 1, clientY: y });
    expect(view.getActiveResize()).not.toBeNull();

    // Drag well past the bar start (negative duration candidate) → clamp to 1 day.
    dispatch(stack, 'pointermove', { clientX: -50, clientY: y });
    expect(view.getActiveResize()?.currentDurationMinutes).toBe(MINUTES_PER_DAY);

    // Drag to ~2.6 days past start → snap to 3 days (unchanged origin).
    dispatch(stack, 'pointermove', {
      clientX: 2.6 * MINUTES_PER_DAY * ppm,
      clientY: y,
    });
    expect(view.getActiveResize()?.currentDurationMinutes).toBe(3 * MINUTES_PER_DAY);

    // Drag to ~4.4 days → snap to 4 days and commit.
    dispatch(stack, 'pointermove', {
      clientX: 4.4 * MINUTES_PER_DAY * ppm,
      clientY: y,
    });
    expect(view.getActiveResize()?.currentDurationMinutes).toBe(4 * MINUTES_PER_DAY);

    dispatch(stack, 'pointerup', {
      clientX: 4.4 * MINUTES_PER_DAY * ppm,
      clientY: y,
    });
    expect(releasePointerCapture).toHaveBeenCalledWith(1);
    expect(onCommitResize).toHaveBeenCalledWith(3, 4 * MINUTES_PER_DAY);
    expect(view.getActiveResize()).toBeNull();
    view.destroy();
  });

  it('refuses to start a resize on a summary bar', () => {
    const onCommitResize = vi.fn();
    const view = new GanttView({
      container: host,
      tasks: [
        task({
          id: 1,
          row: 0,
          startMinutes: 0,
          durationMinutes: 2 * MINUTES_PER_DAY,
          isSummary: true,
        }),
      ],
      dependencies: [],
      onCommitResize,
    });
    const stack = setupStack(view);
    const ppm = PIXELS_PER_DAY / MINUTES_PER_DAY;
    const barW = 2 * MINUTES_PER_DAY * ppm;

    dispatch(stack, 'pointerdown', { clientX: barW - 1, clientY: ROW_HEIGHT / 2 });
    expect(view.getActiveResize()).toBeNull();
    expect(setPointerCapture).not.toHaveBeenCalled();
    expect(onCommitResize).not.toHaveBeenCalled();
    view.destroy();
  });

  it('does not fire onCommitResize when the snapped duration is unchanged', () => {
    const onCommitResize = vi.fn();
    const view = new GanttView({
      container: host,
      tasks: [task({ id: 8, row: 0, startMinutes: 0, durationMinutes: 2 * MINUTES_PER_DAY })],
      dependencies: [],
      onCommitResize,
    });
    const stack = setupStack(view);
    const ppm = PIXELS_PER_DAY / MINUTES_PER_DAY;
    const barW = 2 * MINUTES_PER_DAY * ppm;
    const y = ROW_HEIGHT / 2;

    dispatch(stack, 'pointerdown', { clientX: barW - 1, clientY: y });
    // Small nudge that still snaps to 2 days.
    dispatch(stack, 'pointermove', { clientX: barW + 3, clientY: y });
    dispatch(stack, 'pointerup', { clientX: barW + 3, clientY: y });

    expect(onCommitResize).not.toHaveBeenCalled();
    view.destroy();
  });

  it('sets ew-resize cursor when hovering near the right edge', () => {
    const view = new GanttView({
      container: host,
      tasks: [task({ id: 5, row: 0, startMinutes: 0, durationMinutes: 2 * MINUTES_PER_DAY })],
      dependencies: [],
    });
    const stack = setupStack(view);
    const ppm = PIXELS_PER_DAY / MINUTES_PER_DAY;
    const barW = 2 * MINUTES_PER_DAY * ppm;
    const y = ROW_HEIGHT / 2;

    dispatch(stack, 'pointermove', { clientX: barW - 2, clientY: y });
    expect(stack.style.cursor).toBe('ew-resize');

    dispatch(stack, 'pointermove', { clientX: barW / 2, clientY: y });
    expect(stack.style.cursor).toBe('');

    view.destroy();
  });
});

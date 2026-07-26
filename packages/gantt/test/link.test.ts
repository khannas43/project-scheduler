/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MINUTES_PER_DAY, PIXELS_PER_DAY, ROW_HEIGHT } from '../src/constants.js';
import { GanttView } from '../src/ganttView.js';
import type { GanttTask } from '../src/types.js';
import { stubStackRect } from './dom.js';

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
  const stack = stubStackRect(view);
  // Constructor resize() ran before the stack rect was stubbed (1×1 viewport),
  // which culls later bars via the time window — re-measure then paint.
  window.dispatchEvent(new Event('resize'));
  view.paint();
  return stack;
}

describe('GanttView drag-to-link', () => {
  let host: HTMLDivElement;
  let setPointerCapture: ReturnType<typeof vi.fn>;
  let releasePointerCapture: ReturnType<typeof vi.fn>;
  const ppm = PIXELS_PER_DAY / MINUTES_PER_DAY;

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

  it('Shift+right-edge starts a link; plain right-edge still starts a resize', () => {
    const onCommitLink = vi.fn();
    const onCommitResize = vi.fn();
    const view = new GanttView({
      container: host,
      tasks: [task({ id: 1, row: 0, startMinutes: 0, durationMinutes: 2 * MINUTES_PER_DAY })],
      dependencies: [],
      onCommitLink,
      onCommitResize,
    });
    const stack = setupStack(view);
    const barW = 2 * MINUTES_PER_DAY * ppm;
    const y = ROW_HEIGHT / 2;

    dispatch(stack, 'pointerdown', { clientX: barW - 2, clientY: y, shiftKey: true });
    expect(view.getActiveLink()?.fromTaskId).toBe(1);
    expect(view.getActiveResize()).toBeNull();
    dispatch(stack, 'pointerup', { clientX: barW - 2, clientY: y, shiftKey: true });

    dispatch(stack, 'pointerdown', { clientX: barW - 2, clientY: y, shiftKey: false });
    expect(view.getActiveResize()?.taskId).toBe(1);
    expect(view.getActiveLink()).toBeNull();
    dispatch(stack, 'pointerup', { clientX: barW - 2, clientY: y });

    view.destroy();
  });

  it('updates ghost line coordinates on pointermove', () => {
    const view = new GanttView({
      container: host,
      tasks: [task({ id: 1, row: 0, startMinutes: 0, durationMinutes: MINUTES_PER_DAY })],
      dependencies: [],
    });
    const stack = setupStack(view);
    const barW = MINUTES_PER_DAY * ppm;
    const y = ROW_HEIGHT / 2;

    dispatch(stack, 'pointerdown', { clientX: barW - 1, clientY: y, shiftKey: true });
    const startGhost = view.getDragGhost();
    expect(startGhost).toEqual({
      kind: 'link',
      fromTaskId: 1,
      toX: barW - 1,
      toY: y,
    });

    dispatch(stack, 'pointermove', { clientX: 120, clientY: 90, shiftKey: true });
    expect(view.getDragGhost()).toEqual({
      kind: 'link',
      fromTaskId: 1,
      toX: 120,
      toY: 90,
    });

    dispatch(stack, 'pointerup', { clientX: 120, clientY: 90, shiftKey: true });
    expect(view.getDragGhost()).toBeNull();
    view.destroy();
  });

  it('fires onCommitLink with predecessor/successor order on a valid drop', () => {
    const onCommitLink = vi.fn();
    const view = new GanttView({
      container: host,
      tasks: [
        task({ id: 10, row: 0, startMinutes: 0, durationMinutes: MINUTES_PER_DAY }),
        task({ id: 20, row: 1, startMinutes: 2 * MINUTES_PER_DAY, durationMinutes: MINUTES_PER_DAY }),
      ],
      dependencies: [],
      onCommitLink,
    });
    const stack = setupStack(view);
    const fromEdgeX = MINUTES_PER_DAY * ppm - 1;
    const toX = 2 * MINUTES_PER_DAY * ppm + 4;
    const toY = ROW_HEIGHT + ROW_HEIGHT / 2;

    dispatch(stack, 'pointerdown', { clientX: fromEdgeX, clientY: ROW_HEIGHT / 2, shiftKey: true });
    dispatch(stack, 'pointermove', { clientX: toX, clientY: toY, shiftKey: true });
    dispatch(stack, 'pointerup', { clientX: toX, clientY: toY, shiftKey: true });

    expect(releasePointerCapture).toHaveBeenCalledWith(1);
    expect(onCommitLink).toHaveBeenCalledWith(10, 20);
    expect(view.getActiveLink()).toBeNull();
    view.destroy();
  });

  it('does not fire onCommitLink for empty space, same task, or summary', () => {
    const onCommitLink = vi.fn();
    const view = new GanttView({
      container: host,
      tasks: [
        task({ id: 1, row: 0, startMinutes: 0, durationMinutes: MINUTES_PER_DAY }),
        task({
          id: 2,
          row: 1,
          startMinutes: 0,
          durationMinutes: MINUTES_PER_DAY,
          isSummary: true,
        }),
      ],
      dependencies: [],
      onCommitLink,
    });
    const stack = setupStack(view);
    const fromEdgeX = MINUTES_PER_DAY * ppm - 1;
    const y0 = ROW_HEIGHT / 2;

    // Empty space.
    dispatch(stack, 'pointerdown', { clientX: fromEdgeX, clientY: y0, shiftKey: true });
    dispatch(stack, 'pointerup', { clientX: 400, clientY: 300, shiftKey: true });
    expect(onCommitLink).not.toHaveBeenCalled();

    // Same task.
    dispatch(stack, 'pointerdown', { clientX: fromEdgeX, clientY: y0, shiftKey: true });
    dispatch(stack, 'pointerup', { clientX: fromEdgeX - 4, clientY: y0, shiftKey: true });
    expect(onCommitLink).not.toHaveBeenCalled();

    // Summary target.
    dispatch(stack, 'pointerdown', { clientX: fromEdgeX, clientY: y0, shiftKey: true });
    dispatch(stack, 'pointerup', {
      clientX: MINUTES_PER_DAY * ppm / 2,
      clientY: ROW_HEIGHT + ROW_HEIGHT / 2,
      shiftKey: true,
    });
    expect(onCommitLink).not.toHaveBeenCalled();

    view.destroy();
  });
});

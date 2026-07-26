/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MINUTES_PER_DAY, PIXELS_PER_DAY, ROW_HEIGHT } from '../src/constants.js';
import { snapMinutesToDay } from '../src/drag.js';
import { GanttView } from '../src/ganttView.js';
import type { GanttTask } from '../src/types.js';
import { stubStackRect } from './dom.js';

function stubCanvas(): void {
  // happy-dom has no Path2D; arrows layer only needs a constructible stub.
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

describe('snapMinutesToDay', () => {
  it('rounds to the nearest whole-day boundary', () => {
    expect(snapMinutesToDay(0)).toBe(0);
    expect(snapMinutesToDay(MINUTES_PER_DAY / 2 - 1)).toBe(0);
    expect(snapMinutesToDay(MINUTES_PER_DAY / 2)).toBe(MINUTES_PER_DAY);
    expect(snapMinutesToDay(MINUTES_PER_DAY * 2 + 100)).toBe(MINUTES_PER_DAY * 2);
    expect(snapMinutesToDay(-(MINUTES_PER_DAY / 2) - 1)).toBe(-MINUTES_PER_DAY);
  });
});

describe('GanttView drag-to-move', () => {
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
    // Capture is requested on the internal stack; stub via prototype so the
    // stack element created inside GanttView picks it up.
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

  it('refuses to start a drag on a summary bar', () => {
    const onCommitMove = vi.fn();
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
      onCommitMove,
    });
    const stack = stubStackRect(view);
    view.paint();

    const ppm = PIXELS_PER_DAY / MINUTES_PER_DAY;
    dispatch(stack, 'pointerdown', { clientX: ppm * (MINUTES_PER_DAY / 2), clientY: ROW_HEIGHT / 2 });

    // Summary bars are not movable — empty/summary hits pan the viewport instead.
    expect(view.getActiveDrag()).toBeNull();
    expect(view.getActivePan()).not.toBeNull();
    expect(onCommitMove).not.toHaveBeenCalled();
    view.destroy();
  });

  it('requests pointer capture, snaps on move, and commits on release when changed', () => {
    const onCommitMove = vi.fn();
    const view = new GanttView({
      container: host,
      tasks: [task({ id: 42, row: 0, startMinutes: 0, durationMinutes: MINUTES_PER_DAY })],
      dependencies: [],
      onCommitMove,
    });
    const stack = stubStackRect(view);
    view.paint();

    const ppm = PIXELS_PER_DAY / MINUTES_PER_DAY;
    // Grab near the left of the bar.
    dispatch(stack, 'pointerdown', { clientX: 2, clientY: ROW_HEIGHT / 2 });
    expect(setPointerCapture).toHaveBeenCalledWith(1);
    expect(view.getActiveDrag()?.taskId).toBe(42);

    // Move ~1.6 days to the right → snaps to 2 days.
    dispatch(stack, 'pointermove', {
      clientX: 2 + 1.6 * MINUTES_PER_DAY * ppm,
      clientY: ROW_HEIGHT / 2,
    });
    expect(view.getActiveDrag()?.currentStartMinutes).toBe(2 * MINUTES_PER_DAY);

    dispatch(stack, 'pointerup', { clientX: 2 + 1.6 * MINUTES_PER_DAY * ppm, clientY: ROW_HEIGHT / 2 });
    expect(releasePointerCapture).toHaveBeenCalledWith(1);
    expect(onCommitMove).toHaveBeenCalledWith(42, 2 * MINUTES_PER_DAY);
    expect(view.getActiveDrag()).toBeNull();
    view.destroy();
  });

  it('does not fire onCommitMove when the snapped position is unchanged', () => {
    const onCommitMove = vi.fn();
    const view = new GanttView({
      container: host,
      tasks: [task({ id: 7, row: 0, startMinutes: MINUTES_PER_DAY, durationMinutes: MINUTES_PER_DAY })],
      dependencies: [],
      onCommitMove,
    });
    const stack = stubStackRect(view);
    view.paint();

    const ppm = PIXELS_PER_DAY / MINUTES_PER_DAY;
    const barX = MINUTES_PER_DAY * ppm + 2;
    dispatch(stack, 'pointerdown', { clientX: barX, clientY: ROW_HEIGHT / 2 });
    // Small move that still snaps to the same day.
    dispatch(stack, 'pointermove', { clientX: barX + 5, clientY: ROW_HEIGHT / 2 });
    dispatch(stack, 'pointerup', { clientX: barX + 5, clientY: ROW_HEIGHT / 2 });

    expect(onCommitMove).not.toHaveBeenCalled();
    view.destroy();
  });
});

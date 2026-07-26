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
          if (prop in target) return Reflect.get(target, prop);
          return noop;
        },
        set(target, prop, value) {
          Reflect.set(target, prop, value);
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

describe('GanttView pan', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    stubCanvas();
    host = document.createElement('div');
    document.body.appendChild(host);
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
  });

  afterEach(() => {
    host.remove();
  });

  it('pans the viewport when dragging empty chart space', () => {
    const view = new GanttView({
      container: host,
      tasks: [task({ id: 1, row: 0, startMinutes: 0 })],
      dependencies: [],
    });
    const stack = stubStackRect(view);
    view.setScroll(200, 0);
    view.paint();

    // Far to the right of the first-day bar.
    dispatch(stack, 'pointerdown', { clientX: 400, clientY: ROW_HEIGHT / 2, button: 0 });
    expect(view.getActivePan()).not.toBeNull();

    dispatch(stack, 'pointermove', { clientX: 300, clientY: ROW_HEIGHT / 2, button: 0 });
    // Dragging left by 100px scrolls right by 100px.
    expect(view.getViewport().scrollLeft).toBe(300);

    dispatch(stack, 'pointerup', { clientX: 300, clientY: ROW_HEIGHT / 2, button: 0 });
    expect(view.getActivePan()).toBeNull();
    view.destroy();
  });

  it('pans with the middle mouse button even over a bar', () => {
    const view = new GanttView({
      container: host,
      tasks: [task({ id: 1, row: 0, startMinutes: 0 })],
      dependencies: [],
    });
    const stack = stubStackRect(view);
    view.setScroll(100, 0);
    view.paint();

    const ppm = PIXELS_PER_DAY / MINUTES_PER_DAY;
    dispatch(stack, 'pointerdown', {
      clientX: (MINUTES_PER_DAY / 2) * ppm,
      clientY: ROW_HEIGHT / 2,
      button: 1,
    });
    expect(view.getActiveDrag()).toBeNull();
    expect(view.getActivePan()).not.toBeNull();

    // Drag left → reveal later dates (scrollLeft increases).
    dispatch(stack, 'pointermove', { clientX: 0, clientY: ROW_HEIGHT / 2, button: 1 });
    expect(view.getViewport().scrollLeft).toBeGreaterThan(100);

    view.destroy();
  });
});

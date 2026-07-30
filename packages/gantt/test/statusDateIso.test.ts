/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MINUTES_PER_DAY } from '../src/constants.js';
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

describe('GanttView.setStatusDateIso', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    stubCanvas();
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
    vi.restoreAllMocks();
  });

  it('schedules a repaint when the status date changes, and is a no-op for the same ISO', () => {
    const tasks: GanttTask[] = [
      {
        id: 1,
        name: 'A',
        row: 0,
        startMinutes: 0,
        durationMinutes: MINUTES_PER_DAY,
        progress: 0,
        isCritical: false,
        isSummary: false,
      },
    ];
    const view = new GanttView({ container: host, tasks, dependencies: [] });
    stubStackRect(view);
    view.paint();

    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

    view.setStatusDateIso('2026-01-15T00:00:00.000Z');
    expect(raf).toHaveBeenCalledTimes(1);

    // Flush pending raf so schedule() can queue again on the next change.
    view.paint();
    raf.mockClear();

    view.setStatusDateIso('2026-01-15T00:00:00.000Z');
    expect(raf).not.toHaveBeenCalled();

    view.setStatusDateIso(null);
    expect(raf).toHaveBeenCalledTimes(1);

    view.destroy();
  });
});

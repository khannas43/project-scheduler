/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MINUTES_PER_DAY,
  pixelsPerMinuteForScale,
  SCALE_PIXELS_PER_DAY,
} from '../src/constants.js';
import { GanttView } from '../src/ganttView.js';

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

describe('time scale presets', () => {
  beforeEach(() => {
    stubCanvas();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('maps Day / Week / Month to pixels-per-minute', () => {
    expect(pixelsPerMinuteForScale('week')).toBe(SCALE_PIXELS_PER_DAY.week / MINUTES_PER_DAY);
    expect(pixelsPerMinuteForScale('day')).toBeGreaterThan(pixelsPerMinuteForScale('week'));
    expect(pixelsPerMinuteForScale('month')).toBeLessThan(pixelsPerMinuteForScale('week'));
  });

  it('GanttView.setPixelsPerMinute updates zoom', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });

    const view = new GanttView({
      container,
      tasks: [],
      dependencies: [],
      pixelsPerMinute: pixelsPerMinuteForScale('week'),
    });

    expect(view.getPixelsPerMinute()).toBe(pixelsPerMinuteForScale('week'));
    view.setPixelsPerMinute(pixelsPerMinuteForScale('day'));
    expect(view.getPixelsPerMinute()).toBe(pixelsPerMinuteForScale('day'));

    view.destroy();
  });
});

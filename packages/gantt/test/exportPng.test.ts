/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MINUTES_PER_DAY } from '../src/constants.js';
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
      {
        globalAlpha: 1,
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        font: '',
        textBaseline: '',
        drawImage: vi.fn(),
        setTransform: vi.fn(),
      },
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

  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,COMPOSITED');
}

describe('GanttView.exportToPngDataUrl', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    stubCanvas();
    container = document.createElement('div');
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400 }),
    });
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
  });

  it('paints layers and composites background/arrows/bars onto an offscreen canvas', () => {
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
    const view = new GanttView({ container, tasks, dependencies: [] });
    // Match stack rect used for resize.
    const stack = container.firstElementChild as HTMLElement;
    Object.defineProperty(stack, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400 }),
    });
    view.paint();

    const dataUrl = view.exportToPngDataUrl();
    expect(dataUrl).toBe('data:image/png;base64,COMPOSITED');

    // Offscreen composite canvas's context should have drawn three layer images.
    const contexts = vi.mocked(HTMLCanvasElement.prototype.getContext).mock.results;
    const lastCtx = contexts[contexts.length - 1]?.value as { drawImage: ReturnType<typeof vi.fn> };
    expect(lastCtx.drawImage.mock.calls.length).toBeGreaterThanOrEqual(3);

    view.destroy();
  });
});

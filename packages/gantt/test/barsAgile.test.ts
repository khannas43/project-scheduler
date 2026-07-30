import { describe, expect, it, vi } from 'vitest';

import { MINUTES_PER_DAY, PIXELS_PER_DAY } from '../src/constants.js';
import { drawBars } from '../src/layers/bars.js';
import type { GanttTask, ViewportState } from '../src/types.js';

function stubCtx(): CanvasRenderingContext2D & {
  fillStyle: string;
  fill: ReturnType<typeof vi.fn>;
  fillText: ReturnType<typeof vi.fn>;
  clearRect: ReturnType<typeof vi.fn>;
} {
  const noop = vi.fn();
  return {
    clearRect: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    fillStyle: '',
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    arcTo: noop,
    quadraticCurveTo: noop,
    closePath: noop,
    font: '',
    textBaseline: '',
  } as unknown as CanvasRenderingContext2D & {
    fillStyle: string;
    fill: ReturnType<typeof vi.fn>;
    fillText: ReturnType<typeof vi.fn>;
    clearRect: ReturnType<typeof vi.fn>;
  };
}

describe('drawBars agile fill', () => {
  it('uses amber fill for isAgile bars', () => {
    const ctx = stubCtx();
    const viewport: ViewportState = {
      width: 800,
      height: 400,
      scrollLeft: 0,
      scrollTop: 0,
    };
    const task: GanttTask = {
      id: 1,
      name: 'Story',
      row: 0,
      startMinutes: 0,
      durationMinutes: MINUTES_PER_DAY,
      progress: 0,
      isCritical: false,
      isSummary: false,
      isAgile: true,
    };

    drawBars({
      ctx,
      tasks: [task],
      viewport,
      pixelsPerMinute: PIXELS_PER_DAY / MINUTES_PER_DAY,
    });

    expect(ctx.fillStyle).toBe('#d97706');
    expect(ctx.fill).toHaveBeenCalled();
  });
});

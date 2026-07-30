import { describe, expect, it, vi } from 'vitest';

import { MINUTES_PER_DAY, PIXELS_PER_DAY } from '../src/constants.js';
import { drawStatusDateLine } from '../src/layers/statusDateLine.js';
import type { ViewportState } from '../src/types.js';
import { minutesToX } from '../src/viewport.js';

function stubCtx(): CanvasRenderingContext2D & {
  clearRect: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  setLineDash: ReturnType<typeof vi.fn>;
  beginPath: ReturnType<typeof vi.fn>;
  moveTo: ReturnType<typeof vi.fn>;
  lineTo: ReturnType<typeof vi.fn>;
  stroke: ReturnType<typeof vi.fn>;
} {
  return {
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setLineDash: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: '',
    lineWidth: 1,
  } as unknown as CanvasRenderingContext2D & {
    clearRect: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    restore: ReturnType<typeof vi.fn>;
    setLineDash: ReturnType<typeof vi.fn>;
    beginPath: ReturnType<typeof vi.fn>;
    moveTo: ReturnType<typeof vi.fn>;
    lineTo: ReturnType<typeof vi.fn>;
    stroke: ReturnType<typeof vi.fn>;
  };
}

const viewport: ViewportState = {
  width: 800,
  height: 400,
  scrollLeft: 0,
  scrollTop: 0,
};

const ppm = PIXELS_PER_DAY / MINUTES_PER_DAY;
const originUtcMs = Date.UTC(2026, 0, 1);

describe('drawStatusDateLine', () => {
  it('clears and draws nothing when statusDateUtcMs is null', () => {
    const ctx = stubCtx();
    drawStatusDateLine({
      ctx,
      viewport,
      pixelsPerMinute: ppm,
      originUtcMs,
      statusDateUtcMs: null,
    });

    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 400);
    expect(ctx.stroke).not.toHaveBeenCalled();
    expect(ctx.moveTo).not.toHaveBeenCalled();
  });

  it('draws a full-height dashed line at the expected x when on-screen', () => {
    const ctx = stubCtx();
    // Status date = origin + 2 calendar days.
    const statusDateUtcMs = originUtcMs + 2 * 24 * 60 * 60 * 1000;
    const minutesFromOrigin = (statusDateUtcMs - originUtcMs) / 60_000;
    const expectedX = minutesToX(minutesFromOrigin, viewport.scrollLeft, ppm);

    drawStatusDateLine({
      ctx,
      viewport,
      pixelsPerMinute: ppm,
      originUtcMs,
      statusDateUtcMs,
    });

    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 400);
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.setLineDash).toHaveBeenCalledWith([5, 4]);
    expect(ctx.strokeStyle).toBe('#7c3aed');
    expect(ctx.moveTo).toHaveBeenCalledWith(Math.round(expectedX) + 0.5, 0);
    expect(ctx.lineTo).toHaveBeenCalledWith(Math.round(expectedX) + 0.5, 400);
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('clears and draws nothing when the status date is scrolled off-screen', () => {
    const ctx = stubCtx();
    const statusDateUtcMs = originUtcMs; // x = 0 when scrollLeft = 0
    const scrolled: ViewportState = { ...viewport, scrollLeft: 900 }; // pushes x negative

    drawStatusDateLine({
      ctx,
      viewport: scrolled,
      pixelsPerMinute: ppm,
      originUtcMs,
      statusDateUtcMs,
    });

    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 400);
    expect(ctx.stroke).not.toHaveBeenCalled();
    expect(ctx.moveTo).not.toHaveBeenCalled();
  });
});

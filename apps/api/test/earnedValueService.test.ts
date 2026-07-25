import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotFoundError } from '../src/middleware/errors.js';

/**
 * Hand-computed 2-task scenario (golden-style):
 *
 *   Task A — cost 100, start 2026-01-01T00:00Z, finish 2026-01-11T00:00Z (10 days),
 *            percentComplete 50%
 *   Task B — cost 200, start 2026-01-01T00:00Z, finish 2026-01-11T00:00Z,
 *            percentComplete 100%
 *   asOf   — 2026-01-06T00:00Z (exactly halfway → fraction 0.5)
 *   AC     — 180 (from leaf assignment actualCosts)
 *
 *   BAC = 100 + 200 = 300
 *   EV  = 0.50×100 + 1.00×200 = 250
 *   PV  = 0.5×100 + 0.5×200 = 150
 *   SPI = 250 / 150 ≈ 1.6667
 *   CPI = 250 / 180 ≈ 1.3889
 */
const START = new Date('2026-01-01T00:00:00.000Z');
const FINISH = new Date('2026-01-11T00:00:00.000Z');
const AS_OF = new Date('2026-01-06T00:00:00.000Z');

type DbSelectHandler = () => unknown;
let dbSelectHandlers: DbSelectHandler[] = [];

vi.mock('../src/db/client.js', () => ({
  db: {
    select: vi.fn(() => {
      const handler = dbSelectHandlers.shift();
      if (!handler) {
        throw new Error('Unexpected db.select() — queue a handler in the test');
      }
      return handler();
    }),
  },
}));

const {
  clamp01,
  plannedValueFraction,
  computeEarnedValueTotals,
  samplePvCurve,
  computeEarnedValue,
} = await import('../src/services/earnedValueService.js');

describe('clamp01 / plannedValueFraction', () => {
  it('clamps to [0, 1]', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0.25)).toBe(0.25);
    expect(clamp01(2)).toBe(1);
  });

  it('treats a milestone (start === finish) as a step function', () => {
    const mile = new Date('2026-02-01T00:00:00.000Z');
    expect(plannedValueFraction(new Date('2026-01-31T23:59:59.000Z'), mile, mile)).toBe(0);
    expect(plannedValueFraction(mile, mile, mile)).toBe(1);
    expect(plannedValueFraction(new Date('2026-02-02T00:00:00.000Z'), mile, mile)).toBe(1);
  });

  it('returns 0 when start or finish is null', () => {
    expect(plannedValueFraction(AS_OF, null, FINISH)).toBe(0);
    expect(plannedValueFraction(AS_OF, START, null)).toBe(0);
  });
});

describe('computeEarnedValueTotals (hand-computed scenario)', () => {
  const rows = [
    {
      taskId: 'a',
      isSummary: false,
      percentComplete: 50,
      baselineCost: 100,
      baselineStart: START,
      baselineFinish: FINISH,
    },
    {
      taskId: 'b',
      isSummary: false,
      percentComplete: 100,
      baselineCost: 200,
      baselineStart: START,
      baselineFinish: FINISH,
    },
  ];

  it('matches the hand-traced BAC/PV/EV/AC/SPI/CPI', () => {
    const totals = computeEarnedValueTotals(rows, AS_OF, [100, 80]);
    expect(totals.bac).toBe(300);
    expect(totals.ev).toBe(250);
    expect(totals.pv).toBe(150);
    expect(totals.ac).toBe(180);
    expect(totals.spi).toBeCloseTo(250 / 150, 10);
    expect(totals.cpi).toBeCloseTo(250 / 180, 10);
  });

  it('excludes summary rows from every sum (even if their baseline cost is huge)', () => {
    const withSummary = [
      ...rows,
      {
        taskId: 'summary',
        isSummary: true,
        percentComplete: 100,
        baselineCost: 9999,
        baselineStart: START,
        baselineFinish: FINISH,
      },
    ];
    const totals = computeEarnedValueTotals(withSummary, AS_OF, [180]);
    expect(totals.bac).toBe(300);
    expect(totals.ev).toBe(250);
    expect(totals.pv).toBe(150);
  });

  it('returns null SPI/CPI on divide-by-zero (never NaN/Infinity)', () => {
    const zero = computeEarnedValueTotals(
      [
        {
          taskId: 'm',
          isSummary: false,
          percentComplete: 0,
          baselineCost: 0,
          baselineStart: START,
          baselineFinish: FINISH,
        },
      ],
      AS_OF,
      [],
    );
    expect(zero.spi).toBeNull();
    expect(zero.cpi).toBeNull();
  });
});

describe('samplePvCurve', () => {
  it('includes both endpoints and samples at the requested granularity', () => {
    const rows = [
      {
        taskId: 'a',
        isSummary: false,
        percentComplete: 0,
        baselineCost: 100,
        baselineStart: START,
        baselineFinish: FINISH,
      },
    ];
    const points = samplePvCurve(rows, 5);
    expect(points[0]?.date).toBe('2026-01-01');
    expect(points[points.length - 1]?.date).toBe('2026-01-11');
    expect(points[0]?.pv).toBe(0);
    expect(points[points.length - 1]?.pv).toBe(100);
  });
});

describe('computeEarnedValue — no baseline', () => {
  beforeEach(() => {
    dbSelectHandlers = [];
  });

  it('throws NotFoundError when the project has no captured baseline', async () => {
    dbSelectHandlers.push(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ id: 'proj', statusDate: null }],
        }),
      }),
    }));
    dbSelectHandlers.push(() => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => [],
          }),
        }),
      }),
    }));

    await expect(computeEarnedValue('proj')).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof NotFoundError && /no baseline captured yet/i.test(err.message),
    );
  });
});

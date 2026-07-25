export interface Baseline {
  readonly id: string;
  readonly projectId: string;
  readonly baselineNumber: number;
  readonly name: string | null;
  readonly capturedAt: string;
  readonly capturedBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface BaselineTaskVariance {
  readonly taskId: string;
  readonly taskName: string;
  readonly baselineStart: string | null;
  readonly baselineFinish: string | null;
  readonly baselineDurationMinutes: number | null;
  readonly baselineWorkMinutes: number | null;
  readonly baselineCost: number | null;
  readonly currentStart: string | null;
  readonly currentFinish: string | null;
  readonly currentDurationMinutes: number | null;
  readonly currentCost: number | null;
  readonly startVarianceMinutes: number | null;
  readonly finishVarianceMinutes: number | null;
  readonly durationVarianceMinutes: number | null;
  readonly costVariance: number | null;
}

export interface BaselineDetail {
  readonly baseline: Baseline;
  readonly tasks: readonly BaselineTaskVariance[];
}

export interface EarnedValue {
  readonly baselineId: string;
  readonly asOfDate: string;
  readonly bac: number;
  readonly pv: number;
  readonly ev: number;
  readonly ac: number;
  readonly spi: number | null;
  readonly cpi: number | null;
}

export interface SCurvePoint {
  readonly date: string;
  readonly pv: number;
}

export interface SCurve {
  readonly points: readonly SCurvePoint[];
  readonly current: {
    readonly date: string;
    readonly ev: number;
    readonly ac: number;
  };
}

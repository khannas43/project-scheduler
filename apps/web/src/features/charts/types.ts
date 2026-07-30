/** Client shapes for agile chart endpoints. */

export interface VelocitySprintRow {
  readonly sprintId: string;
  readonly sprintName: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly completedPoints: number;
}

export interface SprintPointsSummary {
  readonly sprintId: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly totalPoints: number;
  readonly completedPoints: number;
  readonly remainingPoints: number;
}

/** Client shapes for board-column API responses. */

export interface BoardColumnRow {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly sortOrder: number;
  /** Null = unbounded WIP. */
  readonly wipLimit: number | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateBoardColumnInput {
  readonly name: string;
  readonly sortOrder: number;
  readonly wipLimit?: number | null;
}

export interface UpdateBoardColumnInput {
  readonly version: number;
  readonly name?: string;
  readonly sortOrder?: number;
  readonly wipLimit?: number | null;
}

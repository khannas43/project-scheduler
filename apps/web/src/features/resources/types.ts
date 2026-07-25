/** Client shapes matching apps/api resource / overallocation responses. */

export type ResourceType = 'work' | 'material' | 'cost';
export type AccrualType = 'start' | 'prorated' | 'end';

/**
 * Resource row from GET /api/resources.
 * Numeric columns are string | null on the wire (Drizzle numeric()), matching AssignmentRow.
 */
export interface Resource {
  readonly id: string;
  readonly name: string;
  readonly resourceType: ResourceType | string;
  readonly email: string | null;
  readonly maxUnits: string | null;
  readonly standardRate: string | null;
  readonly overtimeRate: string | null;
  readonly costPerUse: string | null;
  readonly accrualType: AccrualType | string | null;
  readonly calendarId: string | null;
  readonly skills: readonly string[] | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Wire numbers for create/update — API Zod schemas expect JS numbers. */
export interface CreateResourceInput {
  readonly name: string;
  readonly resourceType: ResourceType;
  readonly email?: string | null;
  readonly maxUnits?: number | null;
  readonly standardRate?: number | null;
  readonly overtimeRate?: number | null;
  readonly costPerUse?: number | null;
  readonly accrualType?: AccrualType | null;
  readonly calendarId?: string | null;
  readonly skills?: readonly string[];
}

export type UpdateResourceInput = Partial<CreateResourceInput>;

export interface OverallocationDay {
  readonly date: string;
  readonly totalUnits: number;
  readonly maxUnits: number;
}

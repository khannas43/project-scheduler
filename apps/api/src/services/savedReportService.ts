import {
  SAVED_REPORT_COLUMN_LABELS,
  SavedReportDefinitionSchema,
  type SavedReportColumn,
  type SavedReportCreateBody,
  type SavedReportDefinition,
  type SavedReportUpdateBody,
} from '@pkg/schema';
import { and, asc, eq } from 'drizzle-orm';

import { db } from '../db/client.js';
import { projects, savedReports } from '../db/schema/index.js';
import { BadRequestError, NotFoundError } from '../middleware/errors.js';
import { escapeCsvField } from './csvExportService.js';
import { loadTaskReport, type TaskReportRow } from './reportDataService.js';
import { writeAuditLog } from './scheduleRunner.js';

export interface SavedReportSummary {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly definition: SavedReportDefinition;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CustomReportRunResult {
  readonly projectName: string;
  readonly columns: readonly SavedReportColumn[];
  readonly columnLabels: readonly string[];
  readonly rows: ReadonlyArray<Record<string, string | number | boolean | null>>;
  readonly rowCount: number;
}

function toIso(value: Date): string {
  return value.toISOString();
}

function parseDefinition(raw: unknown): SavedReportDefinition {
  const parsed = SavedReportDefinitionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestError('Invalid saved report definition');
  }
  return parsed.data;
}

function serializeReport(row: typeof savedReports.$inferSelect): SavedReportSummary {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    definition: parseDefinition(row.definition),
    createdBy: row.createdBy,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function cellValue(
  row: TaskReportRow,
  column: SavedReportColumn,
): string | number | boolean | null {
  switch (column) {
    case 'wbsCode':
      return row.wbsCode;
    case 'name':
      return row.name;
    case 'isSummary':
      return row.isSummary;
    case 'isMilestone':
      return row.isMilestone;
    case 'earlyStart':
      return row.earlyStart ? row.earlyStart.toISOString() : null;
    case 'earlyFinish':
      return row.earlyFinish ? row.earlyFinish.toISOString() : null;
    case 'deadline':
      return row.deadline ? row.deadline.toISOString() : null;
    case 'durationMinutes':
      return row.durationMinutes;
    case 'percentComplete':
      return row.percentComplete;
    case 'isCritical':
      return row.isCritical;
    case 'totalFloatMinutes':
      return row.totalFloatMinutes;
    case 'resourceNames':
      return row.resourceNames;
    case 'cost':
      return row.cost;
    default: {
      const _exhaustive: never = column;
      return _exhaustive;
    }
  }
}

function compareValues(
  a: string | number | boolean | null,
  b: string | number | boolean | null,
): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b ? 0 : a ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

/**
 * Pure: filter + sort + project columns from TaskReportRow[].
 * Exported for unit tests.
 */
export function applySavedReportDefinition(
  rows: readonly TaskReportRow[],
  definition: SavedReportDefinition,
): CustomReportRunResult['rows'] {
  const filters = definition.filters ?? {};
  let filtered = [...rows];

  if (filters.isCritical !== undefined) {
    filtered = filtered.filter((r) => r.isCritical === filters.isCritical);
  }
  if (filters.isMilestone !== undefined) {
    filtered = filtered.filter((r) => r.isMilestone === filters.isMilestone);
  }
  if (filters.includeSummaries === false) {
    filtered = filtered.filter((r) => !r.isSummary);
  }
  if (filters.hasResources !== undefined) {
    filtered = filtered.filter((r) =>
      filters.hasResources ? r.resourceNames.length > 0 : r.resourceNames.length === 0,
    );
  }
  if (filters.minPercentComplete !== undefined) {
    const min = filters.minPercentComplete;
    filtered = filtered.filter(
      (r) => r.percentComplete !== null && r.percentComplete >= min,
    );
  }
  if (filters.maxPercentComplete !== undefined) {
    const max = filters.maxPercentComplete;
    filtered = filtered.filter(
      (r) => r.percentComplete !== null && r.percentComplete <= max,
    );
  }

  if (definition.sort) {
    const { column, direction } = definition.sort;
    const sign = direction === 'desc' ? -1 : 1;
    filtered.sort(
      (a, b) => sign * compareValues(cellValue(a, column), cellValue(b, column)),
    );
  }

  return filtered.map((row) => {
    const out: Record<string, string | number | boolean | null> = {};
    for (const column of definition.columns) {
      out[column] = cellValue(row, column);
    }
    return out;
  });
}

async function assertProjectExists(projectId: string): Promise<void> {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) throw new NotFoundError('Project not found');
}

export async function listSavedReports(projectId: string): Promise<SavedReportSummary[]> {
  await assertProjectExists(projectId);
  const rows = await db
    .select()
    .from(savedReports)
    .where(eq(savedReports.projectId, projectId))
    .orderBy(asc(savedReports.name));
  return rows.map(serializeReport);
}

export async function getSavedReport(
  projectId: string,
  reportId: string,
): Promise<SavedReportSummary> {
  const [row] = await db
    .select()
    .from(savedReports)
    .where(and(eq(savedReports.id, reportId), eq(savedReports.projectId, projectId)))
    .limit(1);
  if (!row) throw new NotFoundError('Saved report not found');
  return serializeReport(row);
}

export async function createSavedReport(
  projectId: string,
  body: SavedReportCreateBody,
  userId: string,
): Promise<SavedReportSummary> {
  await assertProjectExists(projectId);
  const [created] = await db
    .insert(savedReports)
    .values({
      projectId,
      name: body.name,
      definition: body.definition,
      createdBy: userId,
    })
    .returning();
  if (!created) throw new Error('Saved report insert returned no row');

  await writeAuditLog(db, {
    userId,
    projectId,
    action: 'saved_report.create',
    entityType: 'saved_report',
    entityId: created.id,
    after: { name: created.name, definition: created.definition },
  });

  return serializeReport(created);
}

export async function updateSavedReport(
  projectId: string,
  reportId: string,
  body: SavedReportUpdateBody,
  userId: string,
): Promise<SavedReportSummary> {
  if (body.name === undefined && body.definition === undefined) {
    throw new BadRequestError('Provide name and/or definition to update');
  }

  const existing = await getSavedReport(projectId, reportId);
  const [updated] = await db
    .update(savedReports)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.definition !== undefined ? { definition: body.definition } : {}),
    })
    .where(and(eq(savedReports.id, reportId), eq(savedReports.projectId, projectId)))
    .returning();
  if (!updated) throw new NotFoundError('Saved report not found');

  await writeAuditLog(db, {
    userId,
    projectId,
    action: 'saved_report.update',
    entityType: 'saved_report',
    entityId: reportId,
    before: { name: existing.name, definition: existing.definition },
    after: { name: updated.name, definition: updated.definition },
  });

  return serializeReport(updated);
}

export async function deleteSavedReport(
  projectId: string,
  reportId: string,
  userId: string,
): Promise<void> {
  const existing = await getSavedReport(projectId, reportId);
  await db
    .delete(savedReports)
    .where(and(eq(savedReports.id, reportId), eq(savedReports.projectId, projectId)));

  await writeAuditLog(db, {
    userId,
    projectId,
    action: 'saved_report.delete',
    entityType: 'saved_report',
    entityId: reportId,
    before: { name: existing.name, definition: existing.definition },
  });
}

export async function runCustomReport(
  projectId: string,
  definition: SavedReportDefinition,
): Promise<CustomReportRunResult> {
  const { projectName, rows } = await loadTaskReport(projectId);
  const projected = applySavedReportDefinition(rows, definition);
  return {
    projectName,
    columns: definition.columns,
    columnLabels: definition.columns.map((c) => SAVED_REPORT_COLUMN_LABELS[c]),
    rows: projected,
    rowCount: projected.length,
  };
}

export async function runSavedReport(
  projectId: string,
  reportId: string,
): Promise<CustomReportRunResult & { reportId: string; reportName: string }> {
  const report = await getSavedReport(projectId, reportId);
  const result = await runCustomReport(projectId, report.definition);
  return { ...result, reportId: report.id, reportName: report.name };
}

/** Build CSV from a custom report run (selected columns only). */
export function buildCustomReportCsv(result: CustomReportRunResult): string {
  const header = result.columnLabels.map(escapeCsvField).join(',');
  const lines = result.rows.map((row) =>
    result.columns
      .map((col) => {
        const value = row[col];
        if (value === null || value === undefined) return '';
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        return escapeCsvField(String(value));
      })
      .join(','),
  );
  return `${[header, ...lines].join('\r\n')}\r\n`;
}

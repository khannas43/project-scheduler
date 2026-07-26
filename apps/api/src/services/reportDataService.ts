import { asc, eq, inArray } from 'drizzle-orm';

import { db } from '../db/client.js';
import { assignments, projects, resources, tasks } from '../db/schema/index.js';
import { NotFoundError } from '../middleware/errors.js';
import { numericFromDb } from './resourceService.js';

/** One row per task for CSV / Excel / PDF export — including summaries. */
export interface TaskReportRow {
  readonly wbsCode: string | null;
  readonly name: string;
  readonly isSummary: boolean;
  readonly earlyStart: Date | null;
  readonly earlyFinish: Date | null;
  readonly durationMinutes: number | null;
  readonly percentComplete: number | null;
  readonly isCritical: boolean;
  readonly totalFloatMinutes: number | null;
  /** Comma-joined assigned resource names; empty string when none. */
  readonly resourceNames: string;
  /**
   * Sum of assignment costs. `null` when the task has no assignments
   * (same distinction as baselineService — not silently collapsed to 0).
   */
  readonly cost: number | null;
}

export interface TaskReportSourceTask {
  readonly id: string;
  readonly wbsPath: string | null;
  readonly wbsCode: string | null;
  readonly name: string;
  readonly isSummary: boolean;
  readonly earlyStart: Date | null;
  readonly earlyFinish: Date | null;
  readonly durationMinutes: number | null;
  readonly percentComplete: string | null;
  readonly isCritical: boolean;
  readonly totalFloatMinutes: number | null;
  readonly sortOrder: number | null;
}

export interface TaskReportSourceAssignment {
  readonly taskId: string;
  readonly resourceId: string;
  readonly cost: string | null;
}

export interface TaskReportSourceResource {
  readonly id: string;
  readonly name: string;
}

/**
 * Pure assembler — joins tasks/assignments/resources into report rows.
 * Exported for unit tests (cost null-vs-zero, ordering) without a DB.
 */
export function assembleTaskReportRows(
  taskRows: readonly TaskReportSourceTask[],
  assignmentRows: readonly TaskReportSourceAssignment[],
  resourceRows: readonly TaskReportSourceResource[],
): TaskReportRow[] {
  const resourceNameById = new Map(resourceRows.map((r) => [r.id, r.name]));

  const assignedTaskIds = new Set<string>();
  const costByTask = new Map<string, number>();
  const namesByTask = new Map<string, string[]>();

  for (const a of assignmentRows) {
    assignedTaskIds.add(a.taskId);
    const add = numericFromDb(a.cost) ?? 0;
    costByTask.set(a.taskId, (costByTask.get(a.taskId) ?? 0) + add);

    const resourceName = resourceNameById.get(a.resourceId);
    if (resourceName) {
      const list = namesByTask.get(a.taskId) ?? [];
      list.push(resourceName);
      namesByTask.set(a.taskId, list);
    }
  }

  const ordered = [...taskRows].sort((a, b) => {
    const pathA = a.wbsPath ?? '';
    const pathB = b.wbsPath ?? '';
    if (pathA !== pathB) return pathA < pathB ? -1 : 1;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });

  return ordered.map((t) => {
    const names = namesByTask.get(t.id) ?? [];
    names.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const hasAssignments = assignedTaskIds.has(t.id);
    return {
      wbsCode: t.wbsCode,
      name: t.name,
      isSummary: t.isSummary,
      earlyStart: t.earlyStart,
      earlyFinish: t.earlyFinish,
      durationMinutes: t.durationMinutes,
      percentComplete: numericFromDb(t.percentComplete),
      isCritical: t.isCritical,
      totalFloatMinutes: t.totalFloatMinutes,
      resourceNames: names.join(', '),
      cost: hasAssignments ? (costByTask.get(t.id) ?? 0) : null,
    };
  });
}

/** Load project + report rows in one place (only DB touch for report exports). */
export async function loadTaskReport(projectId: string): Promise<{
  projectName: string;
  rows: TaskReportRow[];
}> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new NotFoundError('Project not found');

  const taskRows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .orderBy(asc(tasks.wbsPath), asc(tasks.sortOrder));

  const taskIds = taskRows.map((t) => t.id);
  const assignmentRows =
    taskIds.length === 0
      ? []
      : await db.select().from(assignments).where(inArray(assignments.taskId, taskIds));

  const resourceIds = [...new Set(assignmentRows.map((a) => a.resourceId))];
  const resourceRows =
    resourceIds.length === 0
      ? []
      : await db.select().from(resources).where(inArray(resources.id, resourceIds));

  return {
    projectName: project.name,
    rows: assembleTaskReportRows(taskRows, assignmentRows, resourceRows),
  };
}

export async function loadTaskReportRows(projectId: string): Promise<TaskReportRow[]> {
  const { rows } = await loadTaskReport(projectId);
  return rows;
}

export function slugExportFilename(projectName: string, extension: string): string {
  const slug = projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'project'}.${extension}`;
}

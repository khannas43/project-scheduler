import { SYSTEM_ROLES } from '@pkg/rbac';
import {
  asCalendarId,
  asTaskId,
  validateGraph,
  type DependencyInput,
  type LinkType,
  type TaskInput,
} from '@pkg/scheduler';
import { asc, eq, sql } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { randomUUID } from 'node:crypto';

import { db } from '../db/client.js';
import { calendars, projectMembers, projects, roles, taskDependencies, tasks } from '../db/schema/index.js';
import { BadRequestError, NotFoundError } from '../middleware/errors.js';
import { escapeCsvField } from './csvExportService.js';
import type { ProjectCreateBody } from './projectService.js';
import {
  mapSchedulingError,
  rescheduleProject,
  withSerializableRetry,
  writeAuditLog,
} from './scheduleRunner.js';
import { wbsCodeFromPath } from './wbs.js';

/** Working minutes in the default Mon–Fri 8h calendar day. */
export const MINUTES_PER_DAY = 480;

const MAX_TASK_ROWS = 5_000;

const LINK_TYPES = new Set<LinkType>(['FS', 'SS', 'FF', 'SF']);

export const IMPORT_HEADERS = [
  'Task ID',
  'Name',
  'Parent Task ID',
  'Duration (days)',
  'Milestone',
  'Summary',
  'Predecessors',
  'Notes',
] as const;

/** Sample rows shipped in the downloadable template. */
export const TEMPLATE_SAMPLE_ROWS: readonly (readonly string[])[] = [
  ['1', 'Initiation', '', '', 'false', 'true', '', 'Phase container'],
  ['2', 'Kickoff meeting', '1', '0.5', 'false', 'false', '', ''],
  ['3', 'Gather requirements', '1', '5', 'false', 'false', '2:FS', ''],
  ['4', 'Design', '1', '8', 'false', 'false', '3:FS', ''],
  ['5', 'Build', '', '', 'false', 'true', '', ''],
  ['6', 'Backend', '5', '10', 'false', 'false', '4:FS', ''],
  ['7', 'Frontend', '5', '10', 'false', 'false', '4:FS', ''],
  ['8', 'Launch', '', '0', 'true', 'false', '6:FS,7:FS', 'Go-live milestone'],
];

export interface SpreadsheetPredecessor {
  readonly predecessorTaskId: string;
  readonly linkType: LinkType;
  readonly lagMinutes: number;
}

export interface SpreadsheetTaskRow {
  readonly rowNumber: number;
  readonly taskId: string;
  readonly name: string;
  readonly parentTaskId: string | null;
  readonly durationMinutes: number | null;
  readonly isMilestone: boolean;
  readonly isSummary: boolean;
  readonly predecessors: readonly SpreadsheetPredecessor[];
  readonly notes: string | null;
}

export interface SpreadsheetParseResult {
  readonly tasks: readonly SpreadsheetTaskRow[];
  readonly dependencyCount: number;
}

export interface CreateFromSpreadsheetResult {
  readonly project: typeof projects.$inferSelect;
  readonly taskCount: number;
  readonly dependencyCount: number;
}

export type SpreadsheetImportMode = 'replace' | 'merge';

export interface ImportIntoProjectResult {
  readonly mode: SpreadsheetImportMode;
  readonly taskCount: number;
  readonly dependencyCount: number;
  readonly projectVersion: number;
  /** UUIDs of tasks inserted by this import (empty only if file had no task rows). */
  readonly createdTaskIds: readonly string[];
}

const DEFAULT_CALENDAR = {
  name: 'Standard Mon–Fri',
  workingDays: [1, 2, 3, 4, 5],
  hoursPerDay: '8',
  defaultStart: '09:00',
  defaultFinish: '17:00',
} as const;

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

const HEADER_ALIASES: Record<string, (typeof IMPORT_HEADERS)[number]> = {
  'task id': 'Task ID',
  taskid: 'Task ID',
  id: 'Task ID',
  name: 'Name',
  'task name': 'Name',
  'parent task id': 'Parent Task ID',
  'parent id': 'Parent Task ID',
  parent: 'Parent Task ID',
  'duration (days)': 'Duration (days)',
  'duration days': 'Duration (days)',
  duration: 'Duration (days)',
  milestone: 'Milestone',
  'is milestone': 'Milestone',
  summary: 'Summary',
  'is summary': 'Summary',
  predecessors: 'Predecessors',
  preds: 'Predecessors',
  predecessor: 'Predecessors',
  notes: 'Notes',
  note: 'Notes',
};

function mapHeader(raw: string): (typeof IMPORT_HEADERS)[number] | null {
  return HEADER_ALIASES[normalizeHeader(raw)] ?? null;
}

function parseBoolean(raw: string, field: string, rowNumber: number): boolean {
  const v = raw.trim().toLowerCase();
  if (v === '' || v === 'false' || v === 'no' || v === 'n' || v === '0') return false;
  if (v === 'true' || v === 'yes' || v === 'y' || v === '1') return true;
  throw new BadRequestError(`Row ${rowNumber}: invalid ${field} value "${raw}" (use true/false)`);
}

function parseDurationDays(raw: string, rowNumber: number): number | null {
  const v = raw.trim();
  if (v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) {
    throw new BadRequestError(`Row ${rowNumber}: Duration (days) must be a non-negative number`);
  }
  return Math.round(n * MINUTES_PER_DAY);
}

/**
 * Predecessor tokens: `T1`, `T1:FS`, `T1:FS:+2d`, `T1:SS:-1d`
 * Lag unit is working days (converted with MINUTES_PER_DAY).
 */
export function parsePredecessorsCell(raw: string, rowNumber: number): SpreadsheetPredecessor[] {
  const trimmed = raw.trim();
  if (trimmed === '') return [];

  const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean);
  const out: SpreadsheetPredecessor[] = [];

  for (const part of parts) {
    const match = /^([^:]+)(?::(FS|SS|FF|SF))?(?::([+-]?\d+(?:\.\d+)?)d?)?$/i.exec(part);
    if (!match) {
      throw new BadRequestError(
        `Row ${rowNumber}: invalid predecessor "${part}" (expected TaskID, TaskID:FS, or TaskID:FS:+2d)`,
      );
    }
    const predecessorTaskId = match[1]!.trim();
    if (!predecessorTaskId) {
      throw new BadRequestError(`Row ${rowNumber}: empty predecessor id in "${part}"`);
    }
    const linkType = (match[2]?.toUpperCase() ?? 'FS') as LinkType;
    if (!LINK_TYPES.has(linkType)) {
      throw new BadRequestError(`Row ${rowNumber}: invalid link type in "${part}"`);
    }
    const lagDays = match[3] !== undefined ? Number(match[3]) : 0;
    if (!Number.isFinite(lagDays)) {
      throw new BadRequestError(`Row ${rowNumber}: invalid lag in "${part}"`);
    }
    out.push({
      predecessorTaskId,
      linkType,
      lagMinutes: Math.round(lagDays * MINUTES_PER_DAY),
    });
  }

  return out;
}

/** Minimal RFC 4180 CSV parser — returns rows of string cells. */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let i = 0;
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell);
    cell = '';
  };
  const pushRow = () => {
    // Skip trailing completely empty lines
    if (row.length === 1 && row[0] === '' && rows.length > 0) {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      pushCell();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      pushCell();
      pushRow();
      i += text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    if (ch === '\n') {
      pushCell();
      pushRow();
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }

  if (cell.length > 0 || row.length > 0) {
    pushCell();
    pushRow();
  }

  return rows;
}

function rowsFromMatrix(matrix: string[][]): SpreadsheetParseResult {
  if (matrix.length === 0) {
    throw new BadRequestError('File is empty');
  }

  const headerCells = matrix[0]!.map((c) => c.trim());
  const columnIndex = new Map<(typeof IMPORT_HEADERS)[number], number>();

  for (let i = 0; i < headerCells.length; i += 1) {
    const mapped = mapHeader(headerCells[i]!);
    if (mapped && !columnIndex.has(mapped)) {
      columnIndex.set(mapped, i);
    }
  }

  if (!columnIndex.has('Task ID') || !columnIndex.has('Name')) {
    throw new BadRequestError('Missing required columns: Task ID and Name');
  }

  const get = (cells: string[], header: (typeof IMPORT_HEADERS)[number]): string => {
    const idx = columnIndex.get(header);
    if (idx === undefined) return '';
    return cells[idx]?.trim() ?? '';
  };

  const parsedTasks: SpreadsheetTaskRow[] = [];
  const seenIds = new Set<string>();

  for (let r = 1; r < matrix.length; r += 1) {
    const cells = matrix[r]!;
    const rowNumber = r + 1;
    const allEmpty = cells.every((c) => c.trim() === '');
    if (allEmpty) continue;

    const taskId = get(cells, 'Task ID');
    const name = get(cells, 'Name');
    if (!taskId) throw new BadRequestError(`Row ${rowNumber}: Task ID is required`);
    if (!name) throw new BadRequestError(`Row ${rowNumber}: Name is required`);
    if (seenIds.has(taskId)) {
      throw new BadRequestError(`Row ${rowNumber}: duplicate Task ID "${taskId}"`);
    }
    seenIds.add(taskId);

    const parentRaw = get(cells, 'Parent Task ID');
    const parentTaskId = parentRaw === '' ? null : parentRaw;
    const durationMinutes = parseDurationDays(get(cells, 'Duration (days)'), rowNumber);
    const isMilestone = parseBoolean(get(cells, 'Milestone'), 'Milestone', rowNumber);
    let isSummary = parseBoolean(get(cells, 'Summary'), 'Summary', rowNumber);
    const predecessors = parsePredecessorsCell(get(cells, 'Predecessors'), rowNumber);
    const notesRaw = get(cells, 'Notes');
    const notes = notesRaw === '' ? null : notesRaw;

    if (isMilestone && isSummary) {
      throw new BadRequestError(`Row ${rowNumber}: task cannot be both Milestone and Summary`);
    }

    parsedTasks.push({
      rowNumber,
      taskId,
      name,
      parentTaskId,
      durationMinutes: isMilestone ? 0 : durationMinutes,
      isMilestone,
      isSummary,
      predecessors,
      notes,
    });

    if (parsedTasks.length > MAX_TASK_ROWS) {
      throw new BadRequestError(`Too many tasks (max ${MAX_TASK_ROWS})`);
    }
  }

  if (parsedTasks.length === 0) {
    throw new BadRequestError('No task rows found (need at least one data row)');
  }

  // Infer summary from children when Summary was left false.
  const childrenOf = new Map<string, string[]>();
  for (const t of parsedTasks) {
    if (t.parentTaskId) {
      const list = childrenOf.get(t.parentTaskId) ?? [];
      list.push(t.taskId);
      childrenOf.set(t.parentTaskId, list);
    }
  }

  const byId = new Map(parsedTasks.map((t) => [t.taskId, t]));
  const normalized: SpreadsheetTaskRow[] = parsedTasks.map((t) => {
    const hasChildren = (childrenOf.get(t.taskId)?.length ?? 0) > 0;
    const isSummary = t.isSummary || hasChildren;
    if (isSummary && t.isMilestone) {
      throw new BadRequestError(`Row ${t.rowNumber}: summary tasks cannot be milestones`);
    }
    if (t.parentTaskId && !byId.has(t.parentTaskId)) {
      throw new BadRequestError(
        `Row ${t.rowNumber}: Parent Task ID "${t.parentTaskId}" does not exist in the file`,
      );
    }
    for (const pred of t.predecessors) {
      if (!byId.has(pred.predecessorTaskId)) {
        throw new BadRequestError(
          `Row ${t.rowNumber}: predecessor "${pred.predecessorTaskId}" does not exist in the file`,
        );
      }
      if (pred.predecessorTaskId === t.taskId) {
        throw new BadRequestError(`Row ${t.rowNumber}: task cannot depend on itself`);
      }
    }
    return {
      ...t,
      isSummary,
      durationMinutes: isSummary ? null : (t.isMilestone ? 0 : (t.durationMinutes ?? MINUTES_PER_DAY)),
      isMilestone: isSummary ? false : t.isMilestone || t.durationMinutes === 0,
    };
  });

  const parentOf = new Map(normalized.map((t) => [t.taskId, t.parentTaskId]));
  for (const t of normalized) {
    const seen = new Set<string>();
    let cur: string | null = t.taskId;
    while (cur) {
      if (seen.has(cur)) {
        throw new BadRequestError(`Parent cycle detected involving Task ID "${cur}"`);
      }
      seen.add(cur);
      cur = parentOf.get(cur) ?? null;
    }
  }

  let dependencyCount = 0;
  for (const t of normalized) dependencyCount += t.predecessors.length;

  return { tasks: normalized, dependencyCount };
}

function orderTasksParentsFirst(rows: readonly SpreadsheetTaskRow[]): SpreadsheetTaskRow[] {
  const byId = new Map(rows.map((t) => [t.taskId, t]));
  const children = new Map<string | null, SpreadsheetTaskRow[]>();
  for (const t of rows) {
    const key = t.parentTaskId;
    const list = children.get(key) ?? [];
    list.push(t);
    children.set(key, list);
  }

  const out: SpreadsheetTaskRow[] = [];
  const visit = (parentId: string | null) => {
    for (const child of children.get(parentId) ?? []) {
      if (!byId.has(child.taskId)) continue;
      out.push(child);
      visit(child.taskId);
    }
  };
  visit(null);

  if (out.length !== rows.length) {
    // Orphan under missing parent already rejected; leftover = cycle already caught.
    throw new BadRequestError('Could not order tasks by parent hierarchy');
  }
  return out;
}

export function validateSpreadsheetGraph(
  parsed: SpreadsheetParseResult,
  defaultCalendarId: string,
): void {
  const calId = asCalendarId(defaultCalendarId);
  const idToEngine = new Map<string, ReturnType<typeof asTaskId>>();
  for (const t of parsed.tasks) {
    idToEngine.set(t.taskId, asTaskId(`sheet-${t.taskId}`));
  }

  const taskInputs: TaskInput[] = parsed.tasks.map((t) => ({
    id: idToEngine.get(t.taskId)!,
    parentId: t.parentTaskId ? idToEngine.get(t.parentTaskId)! : null,
    isSummary: t.isSummary,
    durationMinutes: t.isSummary ? 0 : (t.durationMinutes ?? 0),
    calendarId: calId,
    constraintType: 'asap',
    constraintDate: null,
    deadline: null,
  }));

  const depInputs: DependencyInput[] = [];
  for (const t of parsed.tasks) {
    for (const pred of t.predecessors) {
      depInputs.push({
        predecessorId: idToEngine.get(pred.predecessorTaskId)!,
        successorId: idToEngine.get(t.taskId)!,
        linkType: pred.linkType,
        lagMinutes: pred.lagMinutes,
        lagPercent: null,
      });
    }
  }

  try {
    validateGraph(taskInputs, depInputs);
  } catch (error) {
    mapSchedulingError(error);
  }
}

export function parseSpreadsheetCsv(text: string): SpreadsheetParseResult {
  return rowsFromMatrix(parseCsvText(text));
}

export async function parseSpreadsheetExcel(buffer: Buffer): Promise<SpreadsheetParseResult> {
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs typings expect Buffer; Node Buffer is compatible at runtime.
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new BadRequestError('Could not read Excel file — upload a valid .xlsx workbook');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new BadRequestError('Excel workbook has no sheets');

  const matrix: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      while (cells.length < colNumber - 1) cells.push('');
      const text =
        cell.text !== undefined && cell.text !== null
          ? String(cell.text)
          : cell.value === null || cell.value === undefined
            ? ''
            : String(cell.value);
      cells.push(text);
    });
    matrix.push(cells);
  });

  return rowsFromMatrix(matrix);
}

export async function parseSpreadsheetFile(
  filename: string,
  content: Buffer,
): Promise<SpreadsheetParseResult> {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv')) {
    return parseSpreadsheetCsv(content.toString('utf8'));
  }
  if (lower.endsWith('.xlsx')) {
    return parseSpreadsheetExcel(content);
  }
  throw new BadRequestError('Unsupported file type — use .csv or .xlsx');
}

export function buildImportTemplateCsv(): string {
  const lines = [
    IMPORT_HEADERS.map(escapeCsvField).join(','),
    ...TEMPLATE_SAMPLE_ROWS.map((row) => row.map(escapeCsvField).join(',')),
  ];
  return `${lines.join('\r\n')}\r\n`;
}

export async function buildImportTemplateExcel(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'project-scheduler';
  const sheet = workbook.addWorksheet('Tasks', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = IMPORT_HEADERS.map((header) => ({
    header,
    key: header,
    width: header === 'Name' || header === 'Notes' ? 28 : header === 'Predecessors' ? 18 : 14,
  }));
  sheet.getRow(1).font = { bold: true };

  for (const sample of TEMPLATE_SAMPLE_ROWS) {
    sheet.addRow([...sample]);
  }

  // Instructions sheet
  const help = workbook.addWorksheet('Instructions');
  help.getColumn(1).width = 92;
  const instructions = [
    'How to use this template',
    '',
    '1. Fill the Tasks sheet (keep the header row).',
    '2. Task ID must be unique within the file (e.g. 1, 2, A1).',
    '3. Parent Task ID nests a task under another Task ID (leave blank for top-level).',
    '4. Duration (days) uses 8-hour working days. Leave blank on summary rows.',
    '5. Milestone = true for zero-duration milestones.',
    '6. Summary = true for phase/container rows (also auto-detected when children exist).',
    '7. Predecessors: comma-separated refs — TaskID, TaskID:FS, or TaskID:FS:+2d (lag in days).',
    '   Link types: FS (default), SS, FF, SF.',
    '8. Save as .xlsx or export Tasks as CSV, then create a project with “From spreadsheet”.',
  ];
  instructions.forEach((line, idx) => {
    help.getCell(idx + 1, 1).value = line;
    if (idx === 0) help.getCell(idx + 1, 1).font = { bold: true, size: 14 };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Create a project and populate tasks/dependencies from a CSV or Excel upload.
 */
export async function createProjectFromSpreadsheet(
  input: ProjectCreateBody,
  filename: string,
  content: Buffer,
  userId: string,
): Promise<CreateFromSpreadsheetResult> {
  const parsed = await parseSpreadsheetFile(filename, content);
  // Provisional calendar id for graph validation only — real id assigned in TX.
  validateSpreadsheetGraph(parsed, '00000000-0000-4000-8000-000000000001');

  const ordered = orderTasksParentsFirst(parsed.tasks);

  return withSerializableRetry(async (tx) => {
    const [cal] = await tx
      .insert(calendars)
      .values({
        name: DEFAULT_CALENDAR.name,
        projectId: null,
        workingDays: [...DEFAULT_CALENDAR.workingDays],
        hoursPerDay: DEFAULT_CALENDAR.hoursPerDay,
        defaultStart: DEFAULT_CALENDAR.defaultStart,
        defaultFinish: DEFAULT_CALENDAR.defaultFinish,
      })
      .returning();
    if (!cal) throw new Error('Calendar insert returned no row');

    const [created] = await tx
      .insert(projects)
      .values({
        name: input.name,
        description: input.description ?? null,
        status: input.status,
        startDate: input.startDate ? new Date(input.startDate) : null,
        calendarId: cal.id,
        ownerId: userId,
        isArchived: input.isArchived ?? false,
      })
      .returning();
    if (!created) throw new Error('Project insert returned no row');

    await tx.update(calendars).set({ projectId: created.id }).where(eq(calendars.id, cal.id));

    const [adminRole] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, SYSTEM_ROLES.ADMIN.name))
      .limit(1);
    if (!adminRole) {
      throw new Error(`System role '${SYSTEM_ROLES.ADMIN.name}' is not seeded`);
    }

    await tx.insert(projectMembers).values({
      userId,
      projectId: created.id,
      roleId: adminRole.id,
    });

    const { taskCount, dependencyCount } = await insertSpreadsheetTasks(tx, {
      projectId: created.id,
      ordered,
      rootWbsOffset: 0,
      sortOrderOffset: 0,
    });

    await rescheduleProject(tx, created.id);

    const [fresh] = await tx.select().from(projects).where(eq(projects.id, created.id)).limit(1);

    await writeAuditLog(tx, {
      userId,
      projectId: created.id,
      action: 'project.create_from_spreadsheet',
      entityType: 'project',
      entityId: created.id,
      after: {
        taskCount,
        dependencyCount,
        filename,
      },
    });

    return {
      project: fresh ?? created,
      taskCount,
      dependencyCount,
    };
  }, db);
}

type Tx = Parameters<Parameters<typeof withSerializableRetry>[0]>[0];

async function insertSpreadsheetTasks(
  tx: Tx,
  options: {
    projectId: string;
    ordered: readonly SpreadsheetTaskRow[];
    rootWbsOffset: number;
    sortOrderOffset: number;
  },
): Promise<{ taskCount: number; dependencyCount: number; createdTaskIds: readonly string[] }> {
  const { projectId, ordered, rootWbsOffset, sortOrderOffset } = options;
  const taskIdToUuid = new Map<string, string>();
  const createdTaskIds: string[] = [];
  const wbsPathByTaskId = new Map<string, string>();
  const siblingIndexByParent = new Map<string, number>();

  for (const [index, t] of ordered.entries()) {
    const id = randomUUID();
    taskIdToUuid.set(t.taskId, id);
    createdTaskIds.push(id);

    const parentKey = t.parentTaskId === null ? 'root' : t.parentTaskId;
    const next = (siblingIndexByParent.get(parentKey) ?? 0) + 1;
    siblingIndexByParent.set(parentKey, next);
    const parentPath = t.parentTaskId === null ? null : (wbsPathByTaskId.get(t.parentTaskId) ?? null);
    let wbsPath = parentPath ? `${parentPath}.${next}` : String(next);
    if (t.parentTaskId === null && rootWbsOffset > 0) {
      wbsPath = String(rootWbsOffset + next);
    }
    wbsPathByTaskId.set(t.taskId, wbsPath);

    await tx.insert(tasks).values({
      id,
      projectId,
      parentId: t.parentTaskId ? taskIdToUuid.get(t.parentTaskId)! : null,
      name: t.name,
      notes: t.notes,
      isSummary: t.isSummary,
      isMilestone: t.isMilestone,
      schedulingMode: 'cpm',
      durationMinutes: t.isSummary ? null : t.durationMinutes,
      taskType: 'fixed_duration',
      constraintType: t.isSummary ? null : 'asap',
      sortOrder: sortOrderOffset + index,
      wbsPath,
      wbsCode: wbsCodeFromPath(wbsPath),
      isCritical: false,
    });
  }

  const depValues: Array<{
    predecessorId: string;
    successorId: string;
    linkType: LinkType;
    lagMinutes: number;
    lagPercent: null;
  }> = [];

  for (const t of ordered) {
    for (const pred of t.predecessors) {
      depValues.push({
        predecessorId: taskIdToUuid.get(pred.predecessorTaskId)!,
        successorId: taskIdToUuid.get(t.taskId)!,
        linkType: pred.linkType,
        lagMinutes: pred.lagMinutes,
        lagPercent: null,
      });
    }
  }

  if (depValues.length > 0) {
    await tx.insert(taskDependencies).values(depValues);
  }

  return { taskCount: ordered.length, dependencyCount: depValues.length, createdTaskIds };
}

async function maxRootWbsIndex(tx: Tx, projectId: string): Promise<number> {
  const rows = await tx
    .select({ wbsPath: tasks.wbsPath })
    .from(tasks)
    .where(eq(tasks.projectId, projectId));
  let max = 0;
  for (const row of rows) {
    if (!row.wbsPath) continue;
    const root = Number(String(row.wbsPath).split('.')[0]);
    if (Number.isFinite(root) && root > max) max = root;
  }
  return max;
}

async function maxSortOrder(tx: Tx, projectId: string): Promise<number> {
  const rows = await tx
    .select({ sortOrder: tasks.sortOrder })
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .orderBy(asc(tasks.sortOrder));
  let max = -1;
  for (const row of rows) {
    if (row.sortOrder != null && row.sortOrder > max) max = row.sortOrder;
  }
  return max;
}

/**
 * Import a CSV/Excel task list into an existing project.
 * - replace: wipe project tasks (cascades deps/assignments), then insert
 * - merge: append imported tasks as new WBS roots (no matching by Task ID)
 */
export async function importSpreadsheetIntoProject(
  projectId: string,
  filename: string,
  content: Buffer,
  mode: SpreadsheetImportMode,
  userId: string,
): Promise<ImportIntoProjectResult> {
  const parsed = await parseSpreadsheetFile(filename, content);
  const ordered = orderTasksParentsFirst(parsed.tasks);

  return withSerializableRetry(async (tx) => {
    const [project] = await tx.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) throw new NotFoundError('Project not found');

    validateSpreadsheetGraph(parsed, project.calendarId);

    let rootWbsOffset = 0;
    let sortOrderOffset = 0;

    if (mode === 'replace') {
      await tx.delete(tasks).where(eq(tasks.projectId, projectId));
    } else {
      rootWbsOffset = await maxRootWbsIndex(tx, projectId);
      sortOrderOffset = (await maxSortOrder(tx, projectId)) + 1;
    }

    const { taskCount, dependencyCount, createdTaskIds } = await insertSpreadsheetTasks(tx, {
      projectId,
      ordered,
      rootWbsOffset,
      sortOrderOffset,
    });

    const schedule = await rescheduleProject(tx, projectId);

    await tx
      .update(projects)
      .set({ version: sql`${projects.version} + 1` })
      .where(eq(projects.id, projectId));

    await writeAuditLog(tx, {
      userId,
      projectId,
      action: 'project.import_spreadsheet',
      entityType: 'project',
      entityId: projectId,
      after: { mode, taskCount, dependencyCount, filename },
    });

    return {
      mode,
      taskCount,
      dependencyCount,
      projectVersion: schedule.projectVersion + 1,
      createdTaskIds,
    };
  }, db);
}

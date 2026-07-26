import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { buildCsv, escapeCsvField } from '../src/services/csvExportService.js';
import { buildExcelBuffer } from '../src/services/excelExportService.js';
import { buildPdfBuffer } from '../src/services/pdfExportService.js';
import {
  assembleTaskReportRows,
  type TaskReportRow,
  type TaskReportSourceAssignment,
  type TaskReportSourceResource,
  type TaskReportSourceTask,
} from '../src/services/reportDataService.js';

function task(
  partial: Partial<TaskReportSourceTask> & Pick<TaskReportSourceTask, 'id' | 'name' | 'wbsPath'>,
): TaskReportSourceTask {
  return {
    wbsCode: partial.wbsPath,
    isSummary: false,
    earlyStart: null,
    earlyFinish: null,
    durationMinutes: 480,
    percentComplete: null,
    isCritical: false,
    totalFloatMinutes: 0,
    sortOrder: 0,
    ...partial,
  };
}

function sampleRows(): TaskReportRow[] {
  return assembleTaskReportRows(
    [
      task({
        id: 't1',
        name: 'Design, "phase 1"',
        wbsPath: '1',
        earlyStart: new Date('2026-01-15T09:00:00.000Z'),
        earlyFinish: new Date('2026-01-15T17:00:00.000Z'),
        durationMinutes: 480,
        percentComplete: '25',
        isCritical: true,
      }),
      task({
        id: 't2',
        name: 'Summary',
        wbsPath: '2',
        isSummary: true,
        durationMinutes: null,
      }),
    ],
    [
      { taskId: 't1', resourceId: 'r1', cost: '100.5' },
      { taskId: 't1', resourceId: 'r2', cost: '50' },
    ],
    [
      { id: 'r1', name: 'Alice' },
      { id: 'r2', name: 'Bob' },
    ],
  );
}

describe('assembleTaskReportRows — cost null vs zero', () => {
  it('keeps cost null when a task has no assignments (does not collapse to 0)', () => {
    const tasks: TaskReportSourceTask[] = [
      task({ id: 'bare', name: 'Unassigned', wbsPath: '1' }),
      task({ id: 'zero', name: 'Zero-cost assign', wbsPath: '2' }),
    ];
    const assignments: TaskReportSourceAssignment[] = [
      { taskId: 'zero', resourceId: 'r1', cost: '0' },
    ];
    const resources: TaskReportSourceResource[] = [{ id: 'r1', name: 'Crew' }];

    const rows = assembleTaskReportRows(tasks, assignments, resources);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.cost).toBeNull();
    expect(rows[0]!.resourceNames).toBe('');
    expect(rows[1]!.cost).toBe(0);
    expect(rows[1]!.resourceNames).toBe('Crew');
  });

  it('sums assignment costs and joins resource names', () => {
    const rows = sampleRows();
    expect(rows[0]!.cost).toBe(150.5);
    expect(rows[0]!.resourceNames).toBe('Alice, Bob');
    expect(rows[1]!.cost).toBeNull();
  });
});

describe('buildCsv — RFC 4180 quoting', () => {
  it('quotes fields containing comma, quote, or newline and doubles internal quotes', () => {
    expect(escapeCsvField('plain')).toBe('plain');
    expect(escapeCsvField('Design, phase')).toBe('"Design, phase"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');

    const csv = buildCsv(sampleRows());
    expect(csv).toContain('"Design, ""phase 1"""');
    // Header + two data rows, CRLF terminated.
    expect(csv.split('\r\n').filter((l) => l.length > 0)).toHaveLength(3);
  });
});

describe('buildExcelBuffer — date cell type', () => {
  it('writes earlyStart/earlyFinish as Excel Date cells, not text', async () => {
    const buffer = await buildExcelBuffer('Demo Project', sampleRows());
    const workbook = new ExcelJS.Workbook();
    // exceljs's Buffer typings disagree with Node 22's Buffer brand — cast at the boundary.
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

    const sheet = workbook.worksheets[0]!;
    const dataRow = sheet.getRow(2);
    const startCell = dataRow.getCell(4); // Early Start
    const finishCell = dataRow.getCell(5); // Early Finish

    expect(startCell.type).toBe(ExcelJS.ValueType.Date);
    expect(finishCell.type).toBe(ExcelJS.ValueType.Date);
    expect(startCell.value).toBeInstanceOf(Date);
    expect((startCell.value as Date).toISOString()).toBe('2026-01-15T09:00:00.000Z');
  });
});

describe('buildPdfBuffer — pagination', () => {
  it('adds pages when the row set exceeds one page height', async () => {
    const many: TaskReportRow[] = Array.from({ length: 80 }, (_, i) => ({
      wbsCode: String(i + 1),
      name: `Task ${i + 1}`,
      isSummary: false,
      earlyStart: new Date('2026-01-01T09:00:00.000Z'),
      earlyFinish: new Date('2026-01-01T17:00:00.000Z'),
      durationMinutes: 480,
      percentComplete: 0,
      isCritical: false,
      totalFloatMinutes: 0,
      resourceNames: '',
      cost: null,
    }));

    const buffer = await buildPdfBuffer('Big Project', many, {
      generatedAt: new Date('2026-07-26T00:00:00.000Z'),
    });

    // PDF page objects: count /Type /Page (not /Pages).
    const text = buffer.toString('latin1');
    const pageObjects = text.match(/\/Type\s*\/Page[^s]/g) ?? [];
    expect(pageObjects.length).toBeGreaterThan(1);
  });
});

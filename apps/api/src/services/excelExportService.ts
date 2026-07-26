import ExcelJS from 'exceljs';

import type { TaskReportRow } from './reportDataService.js';

const DATE_NUM_FMT = 'yyyy-mm-dd hh:mm';

const COLUMNS: Array<{
  header: string;
  key: string;
  width: number;
  date?: boolean;
}> = [
  { header: 'WBS', key: 'wbsCode', width: 12 },
  { header: 'Name', key: 'name', width: 36 },
  { header: 'Summary', key: 'isSummary', width: 10 },
  { header: 'Early Start', key: 'earlyStart', width: 20, date: true },
  { header: 'Early Finish', key: 'earlyFinish', width: 20, date: true },
  { header: 'Duration (min)', key: 'durationMinutes', width: 14 },
  { header: '% Complete', key: 'percentComplete', width: 12 },
  { header: 'Critical', key: 'isCritical', width: 10 },
  { header: 'Total Float (min)', key: 'totalFloatMinutes', width: 16 },
  { header: 'Resources', key: 'resourceNames', width: 28 },
  { header: 'Cost', key: 'cost', width: 12 },
];

const SUMMARY_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE8EEF5' },
};

/** Pure Excel renderer — Date cells use real Excel dates (not ISO strings). */
export async function buildExcelBuffer(
  projectName: string,
  rows: readonly TaskReportRow[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'project-scheduler';
  const sheet = workbook.addWorksheet(projectName.slice(0, 31) || 'Tasks', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = COLUMNS.map((c) =>
    c.date
      ? { header: c.header, key: c.key, width: c.width, style: { numFmt: DATE_NUM_FMT } }
      : { header: c.header, key: c.key, width: c.width },
  );

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };

  for (const row of rows) {
    const excelRow = sheet.addRow({
      wbsCode: row.wbsCode ?? '',
      name: row.name,
      isSummary: row.isSummary,
      earlyStart: row.earlyStart ?? null,
      earlyFinish: row.earlyFinish ?? null,
      durationMinutes: row.durationMinutes,
      percentComplete: row.percentComplete,
      isCritical: row.isCritical,
      totalFloatMinutes: row.totalFloatMinutes,
      resourceNames: row.resourceNames,
      cost: row.cost,
    });

    // Ensure date columns are typed as Date (exceljs ValueType.Date), not text.
    const startCell = excelRow.getCell('earlyStart');
    const finishCell = excelRow.getCell('earlyFinish');
    if (row.earlyStart) {
      startCell.value = row.earlyStart;
      startCell.numFmt = DATE_NUM_FMT;
    } else {
      startCell.value = null;
    }
    if (row.earlyFinish) {
      finishCell.value = row.earlyFinish;
      finishCell.numFmt = DATE_NUM_FMT;
    } else {
      finishCell.value = null;
    }

    if (row.isSummary) {
      excelRow.font = { bold: true };
      excelRow.fill = SUMMARY_FILL;
    }
  }

  // Reasonable autofit: widen columns that exceed the seed width.
  for (const col of sheet.columns) {
    if (!col || col.eachCell === undefined) continue;
    let max = typeof col.width === 'number' ? col.width : 10;
    col.eachCell({ includeEmpty: false }, (cell) => {
      const text =
        cell.value instanceof Date
          ? cell.value.toISOString()
          : cell.value === null || cell.value === undefined
            ? ''
            : String(cell.value);
      max = Math.min(48, Math.max(max, text.length + 2));
    });
    col.width = max;
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

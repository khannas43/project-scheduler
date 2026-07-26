import type { TaskReportRow } from './reportDataService.js';

const HEADERS = [
  'WBS',
  'Name',
  'Summary',
  'Early Start',
  'Early Finish',
  'Duration (min)',
  '% Complete',
  'Critical',
  'Total Float (min)',
  'Resources',
  'Cost',
] as const;

/** RFC 4180: wrap fields that contain comma, quote, or newline; double internal quotes. */
export function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatDate(value: Date | null): string {
  return value ? value.toISOString() : '';
}

function formatNullable(value: number | boolean | null): string {
  if (value === null) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function rowToFields(row: TaskReportRow): string[] {
  return [
    row.wbsCode ?? '',
    row.name,
    formatNullable(row.isSummary),
    formatDate(row.earlyStart),
    formatDate(row.earlyFinish),
    formatNullable(row.durationMinutes),
    formatNullable(row.percentComplete),
    formatNullable(row.isCritical),
    formatNullable(row.totalFloatMinutes),
    row.resourceNames,
    formatNullable(row.cost),
  ];
}

/** Pure CSV renderer over TaskReportRow[] — RFC 4180 quoting. */
export function buildCsv(rows: readonly TaskReportRow[]): string {
  const lines = [
    HEADERS.map(escapeCsvField).join(','),
    ...rows.map((row) => rowToFields(row).map(escapeCsvField).join(',')),
  ];
  return `${lines.join('\r\n')}\r\n`;
}

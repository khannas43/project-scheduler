import PDFDocument from 'pdfkit';

import type { TaskReportRow } from './reportDataService.js';

const MARGIN = 40;
const ROW_HEIGHT = 16;
const HEADER_BAND = 52;
const FONT_SIZE = 8;
const TITLE_SIZE = 14;

type PdfColumnKey =
  | 'wbsCode'
  | 'name'
  | 'earlyStart'
  | 'earlyFinish'
  | 'durationMinutes'
  | 'percentComplete'
  | 'isCritical'
  | 'resourceNames'
  | 'cost';

/** Fixed x-offsets for a compact task-list table (points from left margin). */
const COLS: ReadonlyArray<{ key: PdfColumnKey; label: string; x: number; width: number }> = [
  { key: 'wbsCode', label: 'WBS', x: 0, width: 48 },
  { key: 'name', label: 'Name', x: 48, width: 130 },
  { key: 'earlyStart', label: 'Start', x: 178, width: 72 },
  { key: 'earlyFinish', label: 'Finish', x: 250, width: 72 },
  { key: 'durationMinutes', label: 'Dur', x: 322, width: 36 },
  { key: 'percentComplete', label: '%', x: 358, width: 28 },
  { key: 'isCritical', label: 'Crit', x: 386, width: 28 },
  { key: 'resourceNames', label: 'Resources', x: 414, width: 90 },
  { key: 'cost', label: 'Cost', x: 504, width: 48 },
];

function formatCell(row: TaskReportRow, key: PdfColumnKey): string {
  switch (key) {
    case 'wbsCode':
      return row.wbsCode ?? '';
    case 'name':
      return row.name;
    case 'earlyStart':
      return row.earlyStart ? row.earlyStart.toISOString().slice(0, 10) : '';
    case 'earlyFinish':
      return row.earlyFinish ? row.earlyFinish.toISOString().slice(0, 10) : '';
    case 'durationMinutes':
      return row.durationMinutes === null ? '' : String(row.durationMinutes);
    case 'percentComplete':
      return row.percentComplete === null ? '' : String(row.percentComplete);
    case 'isCritical':
      return row.isCritical ? 'Y' : '';
    case 'resourceNames':
      return row.resourceNames;
    case 'cost':
      return row.cost === null ? '' : String(row.cost);
    default:
      return '';
  }
}

function truncate(text: string, width: number, fontSize: number): string {
  // ~0.5 × fontSize pts per character for Helvetica — good enough for clipping.
  const maxChars = Math.max(3, Math.floor(width / (fontSize * 0.5)));
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1)}…`;
}

/**
 * Pure PDF renderer — fixed-column table with manual pagination
 * (pdfkit has no built-in table primitive).
 */
export function buildPdfBuffer(
  projectName: string,
  rows: readonly TaskReportRow[],
  options?: { generatedAt?: Date },
): Promise<Buffer> {
  const generatedAt = options?.generatedAt ?? new Date();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margin: MARGIN,
      info: { Title: `${projectName} — task list`, Author: 'project-scheduler' },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageBottom = doc.page.height - MARGIN;

    const drawPageHeader = (): number => {
      doc.fontSize(TITLE_SIZE).font('Helvetica-Bold').text(projectName, MARGIN, MARGIN, {
        width: doc.page.width - MARGIN * 2,
      });
      doc
        .fontSize(FONT_SIZE)
        .font('Helvetica')
        .fillColor('#444444')
        .text(`Generated ${generatedAt.toISOString()}`, MARGIN, MARGIN + 20, {
          width: doc.page.width - MARGIN * 2,
        });
      doc.fillColor('#000000');

      let y = MARGIN + HEADER_BAND;
      doc.font('Helvetica-Bold').fontSize(FONT_SIZE);
      for (const col of COLS) {
        doc.text(col.label, MARGIN + col.x, y, { width: col.width, lineBreak: false });
      }
      y += ROW_HEIGHT;
      doc
        .moveTo(MARGIN, y - 2)
        .lineTo(doc.page.width - MARGIN, y - 2)
        .strokeColor('#cccccc')
        .stroke();
      doc.font('Helvetica').fillColor('#000000');
      return y;
    };

    let y = drawPageHeader();

    for (const row of rows) {
      if (y + ROW_HEIGHT > pageBottom) {
        doc.addPage();
        y = drawPageHeader();
      }

      if (row.isSummary) {
        doc.font('Helvetica-Bold');
      } else {
        doc.font('Helvetica');
      }
      doc.fontSize(FONT_SIZE);

      for (const col of COLS) {
        const text = truncate(formatCell(row, col.key), col.width, FONT_SIZE);
        doc.text(text, MARGIN + col.x, y, { width: col.width, lineBreak: false });
      }
      y += ROW_HEIGHT;
    }

    doc.end();
  });
}

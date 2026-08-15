import type { SavedReportDefinition } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  applySavedReportDefinition,
  buildCustomReportCsv,
} from '../src/services/savedReportService.js';
import type { TaskReportRow } from '../src/services/reportDataService.js';

function row(partial: Partial<TaskReportRow> & Pick<TaskReportRow, 'id' | 'name'>): TaskReportRow {
  return {
    wbsCode: null,
    isSummary: false,
    isMilestone: false,
    earlyStart: null,
    earlyFinish: null,
    deadline: null,
    durationMinutes: 480,
    percentComplete: 0,
    isCritical: false,
    totalFloatMinutes: 480,
    resourceNames: '',
    cost: null,
    ...partial,
  };
}

describe('applySavedReportDefinition', () => {
  const rows: TaskReportRow[] = [
    row({
      id: '1',
      name: 'A',
      wbsCode: '1',
      isCritical: true,
      percentComplete: 50,
      resourceNames: 'Alice',
      cost: 100,
      totalFloatMinutes: 0,
    }),
    row({
      id: '2',
      name: 'B',
      wbsCode: '1.1',
      isSummary: true,
      percentComplete: 25,
      totalFloatMinutes: 960,
    }),
    row({
      id: '3',
      name: 'C',
      wbsCode: '2',
      isMilestone: true,
      percentComplete: 100,
      isCritical: false,
      resourceNames: 'Bob',
      cost: 50,
      totalFloatMinutes: 240,
    }),
  ];

  it('projects selected columns only', () => {
    const definition: SavedReportDefinition = {
      columns: ['wbsCode', 'name', 'isCritical'],
    };
    const out = applySavedReportDefinition(rows, definition);
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ wbsCode: '1', name: 'A', isCritical: true });
  });

  it('filters critical + excludes summaries', () => {
    const definition: SavedReportDefinition = {
      columns: ['name'],
      filters: { isCritical: true, includeSummaries: false },
    };
    const out = applySavedReportDefinition(rows, definition);
    expect(out.map((r) => r.name)).toEqual(['A']);
  });

  it('filters percent complete range and hasResources', () => {
    const definition: SavedReportDefinition = {
      columns: ['name'],
      filters: { minPercentComplete: 40, maxPercentComplete: 100, hasResources: true },
    };
    const out = applySavedReportDefinition(rows, definition);
    expect(out.map((r) => r.name).sort()).toEqual(['A', 'C']);
  });

  it('sorts by column descending', () => {
    const definition: SavedReportDefinition = {
      columns: ['name', 'totalFloatMinutes'],
      sort: { column: 'totalFloatMinutes', direction: 'desc' },
    };
    const out = applySavedReportDefinition(rows, definition);
    expect(out.map((r) => r.name)).toEqual(['B', 'C', 'A']);
  });
});

describe('buildCustomReportCsv', () => {
  it('emits header labels and quoted values', () => {
    const csv = buildCustomReportCsv({
      projectName: 'Demo',
      columns: ['name', 'resourceNames'],
      columnLabels: ['Name', 'Resources'],
      rows: [{ name: 'A, B', resourceNames: 'Alice' }],
      rowCount: 1,
    });
    expect(csv).toBe('Name,Resources\r\n"A, B",Alice\r\n');
  });
});

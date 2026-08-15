import { describe, expect, it } from 'vitest';

import { BadRequestError } from '../src/middleware/errors.js';
import {
  buildImportTemplateCsv,
  MINUTES_PER_DAY,
  parseCsvText,
  parsePredecessorsCell,
  parseSpreadsheetCsv,
} from '../src/services/spreadsheetImportService.js';

describe('parseCsvText', () => {
  it('parses quoted commas and doubled quotes', () => {
    const rows = parseCsvText('a,"b,c","say ""hi"""\r\n1,2,3\r\n');
    expect(rows).toEqual([
      ['a', 'b,c', 'say "hi"'],
      ['1', '2', '3'],
    ]);
  });
});

describe('parsePredecessorsCell', () => {
  it('defaults to FS with zero lag', () => {
    expect(parsePredecessorsCell('T1', 2)).toEqual([
      { predecessorTaskId: 'T1', linkType: 'FS', lagMinutes: 0 },
    ]);
  });

  it('parses link type and day lag', () => {
    expect(parsePredecessorsCell('A:SS:+2d,B:FF:-0.5', 3)).toEqual([
      { predecessorTaskId: 'A', linkType: 'SS', lagMinutes: 2 * MINUTES_PER_DAY },
      { predecessorTaskId: 'B', linkType: 'FF', lagMinutes: Math.round(-0.5 * MINUTES_PER_DAY) },
    ]);
  });

  it('rejects malformed tokens', () => {
    expect(() => parsePredecessorsCell('T1:XX', 4)).toThrow(BadRequestError);
  });
});

describe('parseSpreadsheetCsv', () => {
  it('parses template sample into hierarchy and deps', () => {
    const parsed = parseSpreadsheetCsv(buildImportTemplateCsv());
    expect(parsed.tasks.length).toBe(8);
    expect(parsed.dependencyCount).toBeGreaterThan(0);

    const initiation = parsed.tasks.find((t) => t.taskId === '1');
    expect(initiation?.isSummary).toBe(true);
    expect(initiation?.durationMinutes).toBeNull();

    const kickoff = parsed.tasks.find((t) => t.taskId === '2');
    expect(kickoff?.parentTaskId).toBe('1');
    expect(kickoff?.durationMinutes).toBe(Math.round(0.5 * MINUTES_PER_DAY));

    const launch = parsed.tasks.find((t) => t.taskId === '8');
    expect(launch?.isMilestone).toBe(true);
    expect(launch?.predecessors.map((p) => p.predecessorTaskId).sort()).toEqual(['6', '7']);
  });

  it('rejects missing required columns', () => {
    expect(() => parseSpreadsheetCsv('Foo,Bar\n1,2\n')).toThrow(/Task ID and Name/);
  });

  it('rejects unknown parent', () => {
    const csv = ['Task ID,Name,Parent Task ID', '1,A,99'].join('\n');
    expect(() => parseSpreadsheetCsv(csv)).toThrow(/Parent Task ID/);
  });

  it('defaults blank duration leaf to one day', () => {
    const csv = ['Task ID,Name,Duration (days)', '1,Alone,'].join('\n');
    const parsed = parseSpreadsheetCsv(csv);
    expect(parsed.tasks[0]?.durationMinutes).toBe(MINUTES_PER_DAY);
  });
});

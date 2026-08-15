import { describe, expect, it } from 'vitest';

import { AUDIT_COVERAGE_NOTES } from '../src/services/auditLogService.js';

describe('auditLogService notes', () => {
  it('documents append-only retention defaults', () => {
    expect(AUDIT_COVERAGE_NOTES.appendOnly).toBe(true);
    expect(AUDIT_COVERAGE_NOTES.retentionDefault.toLowerCase()).toContain('indefinite');
  });
});

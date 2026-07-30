import { describe, expect, it } from 'vitest';

import * as schema from '../src/index.js';

describe('@pkg/schema barrel', () => {
  it('re-exports create/update schemas for all entities plus TaskMove', () => {
    expect(schema.ProjectCreateInputSchema).toBeDefined();
    expect(schema.ProjectUpdateInputSchema).toBeDefined();
    expect(schema.CalendarCreateInputSchema).toBeDefined();
    expect(schema.CalendarUpdateInputSchema).toBeDefined();
    expect(schema.CalendarExceptionCreateInputSchema).toBeDefined();

    expect(schema.TaskCreateInputSchema).toBeDefined();
    expect(schema.TaskUpdateInputSchema).toBeDefined();
    expect(schema.TaskMoveInputSchema).toBeDefined();
    expect(schema.SprintCreateInputSchema).toBeDefined();
    expect(schema.SprintUpdateInputSchema).toBeDefined();
    expect(schema.TaskBacklogRankInputSchema).toBeDefined();
    expect(schema.DependencyCreateInputSchema).toBeDefined();
    expect(schema.DependencyUpdateInputSchema).toBeDefined();

    expect(schema.ResourceCreateInputSchema).toBeDefined();
    expect(schema.ResourceUpdateInputSchema).toBeDefined();
    expect(schema.AssignmentCreateInputSchema).toBeDefined();
    expect(schema.AssignmentUpdateInputSchema).toBeDefined();
  });
});

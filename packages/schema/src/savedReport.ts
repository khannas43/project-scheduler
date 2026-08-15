import { z } from 'zod';

/** Columns available on the task report dataset (`TaskReportRow`). */
export const SavedReportColumnSchema = z.enum([
  'wbsCode',
  'name',
  'isSummary',
  'isMilestone',
  'earlyStart',
  'earlyFinish',
  'deadline',
  'durationMinutes',
  'percentComplete',
  'isCritical',
  'totalFloatMinutes',
  'resourceNames',
  'cost',
]);

export const SavedReportFiltersSchema = z
  .object({
    isCritical: z.boolean().optional(),
    isMilestone: z.boolean().optional(),
    /** When false, summary/parent rows are excluded. Default true. */
    includeSummaries: z.boolean().optional(),
    hasResources: z.boolean().optional(),
    minPercentComplete: z.number().min(0).max(100).optional(),
    maxPercentComplete: z.number().min(0).max(100).optional(),
  })
  .strict();

export const SavedReportSortSchema = z
  .object({
    column: SavedReportColumnSchema,
    direction: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict();

/**
 * Saved custom report definition (JSON).
 * Chart type / grouping deferred — tabular columns + filters + sort only for v1.
 */
export const SavedReportDefinitionSchema = z
  .object({
    columns: z.array(SavedReportColumnSchema).min(1).max(20),
    filters: SavedReportFiltersSchema.optional(),
    sort: SavedReportSortSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const unique = new Set(value.columns);
    if (unique.size !== value.columns.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'columns must be unique',
        path: ['columns'],
      });
    }
    const filters = value.filters;
    if (
      filters?.minPercentComplete !== undefined &&
      filters.maxPercentComplete !== undefined &&
      filters.minPercentComplete > filters.maxPercentComplete
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'minPercentComplete cannot exceed maxPercentComplete',
        path: ['filters', 'minPercentComplete'],
      });
    }
  });

export const SavedReportCreateBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  definition: SavedReportDefinitionSchema,
});

export const SavedReportUpdateBodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  definition: SavedReportDefinitionSchema.optional(),
});

/** Run an unsaved definition (preview) without persisting. */
export const SavedReportPreviewBodySchema = z.object({
  definition: SavedReportDefinitionSchema,
});

export type SavedReportColumn = z.infer<typeof SavedReportColumnSchema>;
export type SavedReportFilters = z.infer<typeof SavedReportFiltersSchema>;
export type SavedReportSort = z.infer<typeof SavedReportSortSchema>;
export type SavedReportDefinition = z.infer<typeof SavedReportDefinitionSchema>;
export type SavedReportCreateBody = z.infer<typeof SavedReportCreateBodySchema>;
export type SavedReportUpdateBody = z.infer<typeof SavedReportUpdateBodySchema>;
export type SavedReportPreviewBody = z.infer<typeof SavedReportPreviewBodySchema>;

export const SAVED_REPORT_COLUMN_LABELS: Record<SavedReportColumn, string> = {
  wbsCode: 'WBS',
  name: 'Name',
  isSummary: 'Summary',
  isMilestone: 'Milestone',
  earlyStart: 'Early Start',
  earlyFinish: 'Early Finish',
  deadline: 'Deadline',
  durationMinutes: 'Duration (min)',
  percentComplete: '% Complete',
  isCritical: 'Critical',
  totalFloatMinutes: 'Total Float (min)',
  resourceNames: 'Resources',
  cost: 'Cost',
};

export const DEFAULT_SAVED_REPORT_COLUMNS: readonly SavedReportColumn[] = [
  'wbsCode',
  'name',
  'earlyStart',
  'earlyFinish',
  'durationMinutes',
  'percentComplete',
  'isCritical',
  'resourceNames',
] as const;

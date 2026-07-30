import { z } from 'zod';

/** How calendar days are rendered in grids and lists. */
export const DateFormatSchema = z.enum([
  'yyyy-mm-dd',
  'dd-mmm-yyyy',
  'mm/dd/yyyy',
  'dd/mm/yyyy',
  'locale-short',
  'locale-medium',
]);

/** Whether task start/finish show date only or include time. */
export const DateTimeDisplaySchema = z.enum(['date', 'datetime']);

/**
 * Project-scoped preferences (display / planning chrome).
 * Missing keys fall back via defaults on the schema.
 */
export const ProjectSettingsSchema = z.object({
  dateFormat: DateFormatSchema.default('yyyy-mm-dd'),
  dateTimeDisplay: DateTimeDisplaySchema.default('date'),
  /** Baseline used by default for variance / EV / Gantt overlay. */
  activeBaselineId: z.uuid().nullable().default(null),
  showBaselineOnGantt: z.boolean().default(false),
  /** Fibonacci (1,2,3,5,8…) or linear (1,2,3,4…) story-point scale. */
  storyPointScale: z.enum(['fibonacci', 'linear']).default('fibonacci'),
});

/**
 * Partial patch accepted on project update — merged onto existing settings.
 * Defined explicitly (not `.partial()` of the defaulted schema) so sparse
 * patches do not materialize sibling defaults.
 */
export const ProjectSettingsPatchSchema = z.object({
  dateFormat: DateFormatSchema.optional(),
  dateTimeDisplay: DateTimeDisplaySchema.optional(),
  activeBaselineId: z.uuid().nullable().optional(),
  showBaselineOnGantt: z.boolean().optional(),
  storyPointScale: z.enum(['fibonacci', 'linear']).optional(),
});

export type DateFormat = z.infer<typeof DateFormatSchema>;
export type DateTimeDisplay = z.infer<typeof DateTimeDisplaySchema>;
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;
export type ProjectSettingsPatch = z.infer<typeof ProjectSettingsPatchSchema>;

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  dateFormat: 'yyyy-mm-dd',
  dateTimeDisplay: 'date',
  activeBaselineId: null,
  showBaselineOnGantt: false,
  storyPointScale: 'fibonacci',
};

/** Parse stored jsonb into a full settings object (invalid → defaults). */
export function normalizeProjectSettings(raw: unknown): ProjectSettings {
  const parsed = ProjectSettingsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { ...DEFAULT_PROJECT_SETTINGS };
}

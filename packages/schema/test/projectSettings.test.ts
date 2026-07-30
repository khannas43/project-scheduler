import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PROJECT_SETTINGS,
  normalizeProjectSettings,
  ProjectSettingsPatchSchema,
  ProjectSettingsSchema,
} from '../src/projectSettings.js';

describe('ProjectSettingsSchema', () => {
  it('fills defaults for an empty object', () => {
    expect(ProjectSettingsSchema.parse({})).toEqual(DEFAULT_PROJECT_SETTINGS);
    expect(DEFAULT_PROJECT_SETTINGS.storyPointScale).toBe('fibonacci');
  });

  it('accepts a full settings object', () => {
    const result = ProjectSettingsSchema.parse({
      dateFormat: 'dd/mm/yyyy',
      dateTimeDisplay: 'datetime',
      activeBaselineId: '550e8400-e29b-41d4-a716-446655440000',
      showBaselineOnGantt: true,
      storyPointScale: 'linear',
    });
    expect(result.dateFormat).toBe('dd/mm/yyyy');
    expect(result.showBaselineOnGantt).toBe(true);
    expect(result.storyPointScale).toBe('linear');
  });
});

describe('normalizeProjectSettings', () => {
  it('returns defaults for null / garbage', () => {
    expect(normalizeProjectSettings(null)).toEqual(DEFAULT_PROJECT_SETTINGS);
    expect(normalizeProjectSettings('nope')).toEqual(DEFAULT_PROJECT_SETTINGS);
  });

  it('accepts a partial valid blob', () => {
    expect(normalizeProjectSettings({ dateFormat: 'locale-short' }).dateFormat).toBe(
      'locale-short',
    );
  });
});

describe('ProjectSettingsPatchSchema', () => {
  it('accepts a sparse patch', () => {
    expect(ProjectSettingsPatchSchema.parse({ dateFormat: 'mm/dd/yyyy' })).toEqual({
      dateFormat: 'mm/dd/yyyy',
    });
  });
});

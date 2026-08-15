import { describe, expect, it } from 'vitest';

import {
  PROJECT_CATEGORIES,
  PROJECT_CATEGORY_KEYS,
  PROJECT_TEMPLATE_KEYS,
  PROJECT_TEMPLATES,
  ProjectCategorySchema,
  ProjectCreateFromTemplateInputSchema,
  ProjectTemplateKeySchema,
  categoryName,
} from '../src/projectCategory.js';

describe('project categories and templates', () => {
  it('has ten categories and ten first templates', () => {
    expect(PROJECT_CATEGORY_KEYS).toHaveLength(10);
    expect(PROJECT_CATEGORIES).toHaveLength(10);
    expect(PROJECT_TEMPLATE_KEYS).toHaveLength(10);
    expect(PROJECT_TEMPLATES).toHaveLength(10);
  });

  it('gives each category exactly one first template', () => {
    const used = new Set(PROJECT_TEMPLATES.map((t) => t.categoryKey));
    expect([...used].sort()).toEqual([...PROJECT_CATEGORY_KEYS].sort());
  });

  it('accepts known keys and rejects unknown ones', () => {
    expect(ProjectCategorySchema.safeParse('application-development').success).toBe(true);
    expect(ProjectCategorySchema.safeParse('not-a-category').success).toBe(false);
    expect(ProjectTemplateKeySchema.safeParse('goi-custom-application').success).toBe(true);
    expect(ProjectTemplateKeySchema.safeParse('missing').success).toBe(false);
  });

  it('resolves a category label', () => {
    expect(categoryName('pmu')).toBe('PMU / program management');
    expect(categoryName(null)).toBeNull();
  });

  it('accepts a create-from-template payload', () => {
    const result = ProjectCreateFromTemplateInputSchema.safeParse({
      templateKey: 'goi-custom-application',
      name: 'Citizen portal',
      status: 'planned',
    });
    expect(result.success).toBe(true);
  });
});

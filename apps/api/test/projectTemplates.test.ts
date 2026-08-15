import { PROJECT_TEMPLATE_KEYS } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { allTemplateDefinitions, listTemplateCatalog } from '../src/services/projectTemplates/catalog.js';
import { flattenOutline, validateTemplateGraph } from '../src/services/projectTemplates/flatten.js';

describe('project template catalog', () => {
  it('exposes one compiled template per catalog key', () => {
    const catalog = listTemplateCatalog();
    expect(catalog.categories).toHaveLength(10);
    expect(catalog.templates).toHaveLength(10);
    expect(catalog.templates.map((t) => t.key).sort()).toEqual([...PROJECT_TEMPLATE_KEYS].sort());
    for (const item of catalog.templates) {
      expect(item.taskCount).toBeGreaterThan(10);
    }
  });

  it('keeps unique keys and valid WBS paths in every outline', () => {
    for (const { key, definition } of allTemplateDefinitions()) {
      const tasks = flattenOutline(definition.outline);
      const keys = tasks.map((t) => t.key);
      expect(new Set(keys).size, key).toBe(keys.length);
      for (const t of tasks) {
        expect(t.wbsPath).toMatch(/^\d+(\.\d+)*$/);
        if (t.isMilestone) expect(t.durationMinutes).toBe(0);
        if (t.isSummary) expect(t.durationMinutes).toBeNull();
      }
    }
  });

  it('produces an acyclic graph with no summary-to-descendant links', () => {
    for (const { key, definition } of allTemplateDefinitions()) {
      expect(() => validateTemplateGraph(definition), key).not.toThrow();
    }
  });
});

import {
  PROJECT_CATEGORIES,
  PROJECT_TEMPLATES,
  ProjectTemplateKeySchema,
  type ProjectCategoryKey,
  type ProjectTemplateKey,
} from '@pkg/schema';

import { aiMl } from './definitions/aiMl.js';
import { appDevelopment } from './definitions/appDevelopment.js';
import { applicationMigration } from './definitions/applicationMigration.js';
import { cotsImplementation } from './definitions/cotsImplementation.js';
import { dashboardingMis } from './definitions/dashboardingMis.js';
import { dataMigration } from './definitions/dataMigration.js';
import { infrastructureCloud } from './definitions/infrastructureCloud.js';
import { omAmc } from './definitions/omAmc.js';
import { pocPilot } from './definitions/pocPilot.js';
import { pmu } from './definitions/pmu.js';
import { compileDefinition, type TemplateDefinition } from './flatten.js';

const DEFINITIONS: Record<ProjectTemplateKey, TemplateDefinition> = {
  'goi-custom-application': appDevelopment,
  'scheme-leadership-mis': dashboardingMis,
  'legacy-to-new-parallel-run': applicationMigration,
  'source-to-target-trial-loads': dataMigration,
  'packaged-product-fit-gap': cotsImplementation,
  'supervised-model-department-data': aiMl,
  'gated-poc-8-12-weeks': pocPilot,
  'twelve-month-pmu': pmu,
  'nic-cloud-landing-zone': infrastructureCloud,
  'twelve-month-support-year': omAmc,
};

export function getTemplateDefinition(key: ProjectTemplateKey): TemplateDefinition {
  return DEFINITIONS[key];
}

export function resolveTemplateKey(raw: string): ProjectTemplateKey {
  return ProjectTemplateKeySchema.parse(raw);
}

export type TemplateCatalogItem = {
  readonly key: ProjectTemplateKey;
  readonly categoryKey: ProjectCategoryKey;
  readonly name: string;
  readonly description: string;
  readonly durationHint: string;
  readonly taskCount: number;
};

export function listTemplateCatalog(): {
  readonly categories: typeof PROJECT_CATEGORIES;
  readonly templates: readonly TemplateCatalogItem[];
} {
  return {
    categories: PROJECT_CATEGORIES,
    templates: PROJECT_TEMPLATES.map((meta) => ({
      ...meta,
      taskCount: compileDefinition(DEFINITIONS[meta.key]).tasks.length,
    })),
  };
}

export function allTemplateDefinitions(): ReadonlyArray<{
  readonly key: ProjectTemplateKey;
  readonly definition: TemplateDefinition;
}> {
  return PROJECT_TEMPLATES.map((meta) => ({
    key: meta.key,
    definition: DEFINITIONS[meta.key],
  }));
}

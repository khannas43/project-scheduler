import { z } from 'zod';

/**
 * Delivery-type categories for Indian government IT projects.
 * Stable keys — templates hang off these; do not rename without a migration.
 */
export const PROJECT_CATEGORY_KEYS = [
  'application-development',
  'dashboarding-mis',
  'application-migration',
  'data-migration',
  'cots-implementation',
  'ai-ml',
  'poc-pilot',
  'pmu',
  'infrastructure-cloud',
  'om-amc',
] as const;

export type ProjectCategoryKey = (typeof PROJECT_CATEGORY_KEYS)[number];

export const ProjectCategorySchema = z.enum(PROJECT_CATEGORY_KEYS);

export const PROJECT_CATEGORIES: readonly {
  readonly key: ProjectCategoryKey;
  readonly name: string;
  readonly description: string;
}[] = [
  {
    key: 'application-development',
    name: 'Application development',
    description: 'New custom web, mobile, or backend application for a department.',
  },
  {
    key: 'dashboarding-mis',
    name: 'Dashboarding & MIS',
    description: 'KPI, leadership, or statutory reporting on existing systems.',
  },
  {
    key: 'application-migration',
    name: 'Application migration & modernization',
    description: 'Move or rewrite a live application, including parallel run and cutover.',
  },
  {
    key: 'data-migration',
    name: 'Data migration',
    description: 'Move, cleanse, and reconcile data as the contracted scope.',
  },
  {
    key: 'cots-implementation',
    name: 'COTS / packaged product implementation',
    description: 'Configure a bought or NIC/MeitY product rather than custom-build.',
  },
  {
    key: 'ai-ml',
    name: 'AI / ML & data science',
    description: 'A model, pipeline, or AI feature as the main deliverable.',
  },
  {
    key: 'poc-pilot',
    name: 'POC / pilot / prototype',
    description: 'Time-boxed feasibility with a measurable go / no-go.',
  },
  {
    key: 'pmu',
    name: 'PMU / program management',
    description: 'Governance and monitoring, not building the system.',
  },
  {
    key: 'infrastructure-cloud',
    name: 'Infrastructure & cloud',
    description: 'Hosting, network, DC/DR, or cloud landing zone.',
  },
  {
    key: 'om-amc',
    name: 'O&M / AMC',
    description: 'Running and supporting a live system for a support year.',
  },
];

export const PROJECT_TEMPLATE_KEYS = [
  'goi-custom-application',
  'scheme-leadership-mis',
  'legacy-to-new-parallel-run',
  'source-to-target-trial-loads',
  'packaged-product-fit-gap',
  'supervised-model-department-data',
  'gated-poc-8-12-weeks',
  'twelve-month-pmu',
  'nic-cloud-landing-zone',
  'twelve-month-support-year',
] as const;

export type ProjectTemplateKey = (typeof PROJECT_TEMPLATE_KEYS)[number];

export const ProjectTemplateKeySchema = z.enum(PROJECT_TEMPLATE_KEYS);

export const PROJECT_TEMPLATES: readonly {
  readonly key: ProjectTemplateKey;
  readonly categoryKey: ProjectCategoryKey;
  readonly name: string;
  readonly description: string;
  readonly durationHint: string;
}[] = [
  {
    key: 'goi-custom-application',
    categoryKey: 'application-development',
    name: 'GoI custom application',
    description: 'FRS/SRS through build, SIT/UAT, STQC, go-live, and O&M handover.',
    durationHint: '6–12 months',
  },
  {
    key: 'scheme-leadership-mis',
    categoryKey: 'dashboarding-mis',
    name: 'Scheme / leadership MIS',
    description: 'KPI catalog, sources, ETL, dashboards, reconciliation, and refresh SLA.',
    durationHint: '3–6 months',
  },
  {
    key: 'legacy-to-new-parallel-run',
    categoryKey: 'application-migration',
    name: 'Legacy-to-new with parallel run',
    description: 'Discovery, target build, trial data, SIT, parallel run, and cutover.',
    durationHint: '6–12 months',
  },
  {
    key: 'source-to-target-trial-loads',
    categoryKey: 'data-migration',
    name: 'Source-to-target with trial loads',
    description: 'Profiling, mapping, trial loads, dress rehearsal, and cutover reconciliation.',
    durationHint: '3–6 months',
  },
  {
    key: 'packaged-product-fit-gap',
    categoryKey: 'cots-implementation',
    name: 'Packaged product (fit-gap → UAT)',
    description: 'Fit-gap, configuration, transports, SIT/UAT, and hypercare.',
    durationHint: '4–9 months',
  },
  {
    key: 'supervised-model-department-data',
    categoryKey: 'ai-ml',
    name: 'Supervised model from department data',
    description: 'Problem framing, data readiness, model, SIT/pilot, and MLOps deploy.',
    durationHint: '4–8 months',
  },
  {
    key: 'gated-poc-8-12-weeks',
    categoryKey: 'poc-pilot',
    name: '8–12 week gated POC',
    description: 'Charter, spike, scored demo, and go / no-go — no full STQC or O&M.',
    durationHint: '8–12 weeks',
  },
  {
    key: 'twelve-month-pmu',
    categoryKey: 'pmu',
    name: '12-month central / state PMU',
    description: 'Mobilization, governance, monitoring cadence, and year-end exit.',
    durationHint: '12 months',
  },
  {
    key: 'nic-cloud-landing-zone',
    categoryKey: 'infrastructure-cloud',
    name: 'NIC / cloud landing zone with DC–DR',
    description: 'Assessment, landing zone, platform, DR drill, and ops handover.',
    durationHint: '4–8 months',
  },
  {
    key: 'twelve-month-support-year',
    categoryKey: 'om-amc',
    name: '12-month support year',
    description: 'Takeover, SLA operations, patching, DR drills, and year-end attestation.',
    durationHint: '12 months',
  },
];

export function categoryName(key: string | null | undefined): string | null {
  if (!key) return null;
  return PROJECT_CATEGORIES.find((c) => c.key === key)?.name ?? key;
}

export const ProjectCreateFromTemplateInputSchema = z.object({
  templateKey: ProjectTemplateKeySchema,
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  status: z.string().min(1),
  startDate: z.iso.datetime().nullable().optional(),
});

export type ProjectCreateFromTemplateInput = z.infer<typeof ProjectCreateFromTemplateInputSchema>;

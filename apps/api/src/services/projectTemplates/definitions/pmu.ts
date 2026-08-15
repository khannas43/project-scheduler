import { fsChain, link, type TemplateDefinition } from '../flatten.js';

export const pmu: TemplateDefinition = {
  outline: [
    {
      key: 'mobilize',
      name: 'Mobilization (months 1–2)',
      children: [
        { key: 'mobilize.team', name: 'Team onboarding and location / access', days: 15 },
        { key: 'mobilize.raci', name: 'Mandate, RACI, and reporting calendar', days: 8 },
        { key: 'mobilize.tools', name: 'Tooling (MIS, risk log, RAID)', days: 8 },
        { key: 'mobilize.done', name: 'PMU mobilized', isMilestone: true },
      ],
    },
    {
      key: 'gov',
      name: 'Baseline & governance (months 1–3)',
      children: [
        { key: 'gov.asis', name: 'As-Is of the program / portfolio', days: 15 },
        { key: 'gov.cadence', name: 'Steering committee and PMC cadence', days: 8 },
        { key: 'gov.baseline', name: 'Baseline plan and milestone register', days: 10 },
        { key: 'gov.live', name: 'Governance live', isMilestone: true },
      ],
    },
    {
      key: 'monitor',
      name: 'Monitoring framework',
      children: [
        { key: 'monitor.kpi', name: 'KPI / progress template', days: 8 },
        { key: 'monitor.collect', name: 'Data collection from line departments / vendors', days: 10 },
        { key: 'monitor.mis', name: 'PMU MIS (light)', days: 10 },
        { key: 'monitor.live', name: 'Monitoring framework live', isMilestone: true },
      ],
    },
    {
      key: 'steady',
      name: 'Steady state (months 3–11)',
      children: [
        { key: 'steady.monthly', name: 'Monthly progress cycle', days: 20 },
        { key: 'steady.raid', name: 'Risk, issue, and dependency management', days: 20 },
        { key: 'steady.vendor', name: 'Vendor / SLA follow-up', days: 20 },
        { key: 'steady.steering', name: 'Quarterly steering pack', days: 10 },
        { key: 'steady.capacity', name: 'Capacity building / workshops', days: 10 },
        { key: 'steady.midyear', name: 'Mid-year review', isMilestone: true },
        { key: 'steady.q3', name: 'Q3 review', isMilestone: true },
      ],
    },
    {
      key: 'exit',
      name: 'Exit & transition (month 12)',
      children: [
        { key: 'exit.plan', name: 'Exit plan and residual risks', days: 8 },
        { key: 'exit.kt', name: 'KT to department / next PMU', days: 8 },
        { key: 'exit.report', name: 'Final report', days: 8 },
        { key: 'exit.done', name: 'PMU year closed', isMilestone: true },
      ],
    },
  ],
  links: [
    ...fsChain(['mobilize.team', 'mobilize.raci', 'mobilize.tools', 'mobilize.done']),
    link('mobilize.done', 'gov.asis'),
    ...fsChain(['gov.asis', 'gov.cadence', 'gov.baseline', 'gov.live']),
    ...fsChain(['gov.live', 'monitor.kpi', 'monitor.collect', 'monitor.mis', 'monitor.live']),
    link('monitor.live', 'steady.monthly'),
    link('monitor.live', 'steady.raid'),
    link('monitor.live', 'steady.vendor'),
    link('monitor.live', 'steady.steering'),
    link('monitor.live', 'steady.capacity'),
    link('steady.monthly', 'steady.midyear'),
    link('steady.steering', 'steady.midyear'),
    link('steady.midyear', 'steady.q3'),
    link('steady.q3', 'exit.plan'),
    ...fsChain(['exit.plan', 'exit.kt', 'exit.report', 'exit.done']),
  ],
};

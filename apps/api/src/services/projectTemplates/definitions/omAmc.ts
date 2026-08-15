import { fsChain, link, type TemplateDefinition } from '../flatten.js';

export const omAmc: TemplateDefinition = {
  outline: [
    {
      key: 'takeover',
      name: 'Takeover (month 1)',
      children: [
        { key: 'takeover.kt', name: 'KT from delivery / outgoing vendor', days: 10 },
        { key: 'takeover.inventory', name: 'Asset, license, and access inventory', days: 8 },
        { key: 'takeover.sla', name: 'SLA, severity matrix, and escalation', days: 5 },
        { key: 'takeover.tools', name: 'Tools (ticketing, monitoring, backup)', days: 8 },
        { key: 'takeover.done', name: 'Takeover complete', isMilestone: true },
      ],
    },
    {
      key: 'ops',
      name: 'Steady-state operations (months 1–12)',
      children: [
        { key: 'ops.support', name: 'L1/L2/L3 support (ongoing)', days: 20 },
        { key: 'ops.incident', name: 'Incident and problem management', days: 20 },
        { key: 'ops.monitor', name: 'Monitoring and backup checks', days: 20 },
        { key: 'ops.monthly', name: 'Monthly service report (first cycle)', days: 5 },
      ],
    },
    {
      key: 'change',
      name: 'Change & patching',
      children: [
        { key: 'change.calendar', name: 'Patch calendar', days: 5 },
        { key: 'change.windows', name: 'Scheduled patch windows', days: 10 },
        { key: 'change.emergency', name: 'Emergency change process', days: 3 },
        { key: 'change.compliance', name: 'Quarterly patch compliance', isMilestone: true },
      ],
    },
    {
      key: 'resilience',
      name: 'Resilience',
      children: [
        { key: 'resilience.dr1', name: 'DR drill 1 (H1)', days: 5 },
        { key: 'resilience.dr2', name: 'DR drill 2 (H2)', days: 5 },
        { key: 'resilience.done', name: 'DR drills complete', isMilestone: true },
      ],
    },
    {
      key: 'svc',
      name: 'Service management',
      children: [
        { key: 'svc.qbr', name: 'Quarterly service review (first quarter)', days: 5 },
        { key: 'svc.capacity', name: 'Capacity and improvement backlog', days: 8 },
        { key: 'svc.audit', name: 'Audit / CERT-In / STQC follow-up (as required)', days: 8 },
      ],
    },
    {
      key: 'yearend',
      name: 'Year-end',
      children: [
        { key: 'yearend.sla', name: 'SLA attestation', days: 5 },
        { key: 'yearend.renew', name: 'Renewal / exit recommendation', days: 5 },
        { key: 'yearend.done', name: 'O&M year closed', isMilestone: true },
      ],
    },
  ],
  links: [
    ...fsChain(['takeover.kt', 'takeover.inventory', 'takeover.sla', 'takeover.tools', 'takeover.done']),
    link('takeover.done', 'ops.support'),
    link('takeover.done', 'ops.incident'),
    link('takeover.done', 'ops.monitor'),
    link('ops.support', 'ops.monthly'),
    link('takeover.done', 'change.calendar'),
    ...fsChain(['change.calendar', 'change.windows', 'change.emergency', 'change.compliance']),
    link('takeover.done', 'resilience.dr1'),
    link('resilience.dr1', 'resilience.dr2'),
    link('resilience.dr2', 'resilience.done'),
    link('takeover.done', 'svc.qbr'),
    link('svc.qbr', 'svc.capacity'),
    link('takeover.done', 'svc.audit'),
    link('change.compliance', 'yearend.sla'),
    link('resilience.done', 'yearend.sla'),
    link('svc.qbr', 'yearend.sla'),
    ...fsChain(['yearend.sla', 'yearend.renew', 'yearend.done']),
  ],
};

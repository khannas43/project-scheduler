import { fsChain, link, type TemplateDefinition } from '../flatten.js';

export const infrastructureCloud: TemplateDefinition = {
  outline: [
    {
      key: 'init',
      name: 'Initiation',
      children: [
        { key: 'init.kickoff', name: 'Kickoff and hosting choice (NIC / MeghRaj / SDC / other)', days: 3 },
        { key: 'init.approved', name: 'Inception approved', isMilestone: true },
      ],
    },
    {
      key: 'assess',
      name: 'Assessment',
      children: [
        { key: 'assess.current', name: 'Current DC, network, and application hosting', days: 10 },
        { key: 'assess.reqs', name: 'Capacity, compliance, and residency requirements', days: 8 },
        { key: 'assess.done', name: 'Assessment complete', isMilestone: true },
      ],
    },
    {
      key: 'arch',
      name: 'Target architecture',
      children: [
        { key: 'arch.hld', name: 'Landing-zone HLD', days: 10 },
        { key: 'arch.zones', name: 'Network, identity, and security zones', days: 8 },
        { key: 'arch.dr', name: 'DC–DR pattern and RPO/RTO', days: 5 },
        { key: 'arch.approved', name: 'Architecture approved', isMilestone: true },
      ],
    },
    {
      key: 'proc',
      name: 'Procurement',
      children: [
        { key: 'proc.bom', name: 'BoM / cloud subscription / links', days: 8 },
        { key: 'proc.order', name: 'GeM / rate-contract order', days: 15 },
        { key: 'proc.available', name: 'Infrastructure available', isMilestone: true },
      ],
    },
    {
      key: 'found',
      name: 'Foundation build',
      children: [
        { key: 'found.tenancy', name: 'Accounts / subscriptions / tenancy', days: 8 },
        { key: 'found.net', name: 'Network and connectivity (P2P, VPN, NKN)', days: 15 },
        { key: 'found.iam', name: 'Identity and privileged access', days: 8 },
        { key: 'found.ready', name: 'Foundation ready', isMilestone: true },
      ],
    },
    {
      key: 'platform',
      name: 'Platform & security',
      children: [
        { key: 'platform.compute', name: 'Compute, storage, database platform', days: 15 },
        { key: 'platform.backup', name: 'Backup and monitoring', days: 8 },
        { key: 'platform.harden', name: 'Hardening and SOC / CERT-In onboarding', days: 10 },
        { key: 'platform.ready', name: 'Platform ready', isMilestone: true },
      ],
    },
    {
      key: 'dr',
      name: 'DC–DR',
      children: [
        { key: 'dr.build', name: 'DR site / region build', days: 15 },
        { key: 'dr.repl', name: 'Replication', days: 8 },
        { key: 'dr.drill', name: 'DR drill', days: 5 },
        { key: 'dr.accepted', name: 'DR accepted', isMilestone: true },
      ],
    },
    {
      key: 'close',
      name: 'Handover',
      children: [
        { key: 'close.runbooks', name: 'Runbooks and access matrix', days: 5 },
        { key: 'close.train', name: 'Ops training', days: 5 },
        { key: 'close.handover', name: 'Handover to O&M', days: 3 },
        { key: 'close.done', name: 'Project closed', isMilestone: true },
      ],
    },
  ],
  links: [
    ...fsChain(['init.kickoff', 'init.approved', 'assess.current', 'assess.reqs', 'assess.done']),
    ...fsChain(['assess.done', 'arch.hld', 'arch.zones', 'arch.dr', 'arch.approved']),
    ...fsChain(['arch.approved', 'proc.bom', 'proc.order', 'proc.available']),
    ...fsChain(['proc.available', 'found.tenancy', 'found.net', 'found.iam', 'found.ready']),
    link('found.ready', 'platform.compute'),
    link('found.ready', 'dr.build'),
    ...fsChain(['platform.compute', 'platform.backup', 'platform.harden', 'platform.ready']),
    ...fsChain(['dr.build', 'dr.repl']),
    link('platform.ready', 'dr.drill'),
    link('dr.repl', 'dr.drill'),
    link('dr.drill', 'dr.accepted'),
    ...fsChain(['dr.accepted', 'close.runbooks', 'close.train', 'close.handover', 'close.done']),
  ],
};

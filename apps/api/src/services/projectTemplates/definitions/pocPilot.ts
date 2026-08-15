import { fsChain, type TemplateDefinition } from '../flatten.js';

export const pocPilot: TemplateDefinition = {
  outline: [
    {
      key: 'frame',
      name: 'Framing',
      children: [
        { key: 'frame.question', name: 'Question the POC must answer', days: 3 },
        { key: 'frame.criteria', name: 'Success / fail criteria (measurable)', days: 3 },
        { key: 'frame.scope', name: 'In-scope / out-of-scope freeze', days: 2 },
        { key: 'frame.charter', name: 'POC charter approved', isMilestone: true },
      ],
    },
    {
      key: 'setup',
      name: 'Setup',
      children: [
        { key: 'setup.env', name: 'Environment and access', days: 5 },
        { key: 'setup.data', name: 'Sample data or sandbox', days: 5 },
        { key: 'setup.done', name: 'Setup complete', isMilestone: true },
      ],
    },
    {
      key: 'spike',
      name: 'Spike',
      children: [
        { key: 'spike.slice', name: 'Thin slice build', days: 15 },
        { key: 'spike.vendor', name: 'Integration or vendor spike (if any)', days: 8 },
        { key: 'spike.dryrun', name: 'Internal dry-run', days: 3 },
        { key: 'spike.done', name: 'Spike complete', isMilestone: true },
      ],
    },
    {
      key: 'eval',
      name: 'Evaluation',
      children: [
        { key: 'eval.demo', name: 'Demo to sponsors', days: 2 },
        { key: 'eval.score', name: 'Score against success criteria', days: 3 },
        { key: 'eval.scale', name: 'Risk and cost-to-scale note', days: 3 },
        { key: 'eval.gng', name: 'Go / no-go decision', isMilestone: true },
      ],
    },
    {
      key: 'close',
      name: 'Close-out',
      children: [
        { key: 'close.report', name: 'POC report and artefacts', days: 3 },
        { key: 'close.recommend', name: 'Recommendation (stop / extend / start full project)', days: 2 },
        { key: 'close.done', name: 'POC closed', isMilestone: true },
      ],
    },
  ],
  links: [
    ...fsChain([
      'frame.question',
      'frame.criteria',
      'frame.scope',
      'frame.charter',
      'setup.env',
      'setup.data',
      'setup.done',
      'spike.slice',
      'spike.vendor',
      'spike.dryrun',
      'spike.done',
      'eval.demo',
      'eval.score',
      'eval.scale',
      'eval.gng',
      'close.report',
      'close.recommend',
      'close.done',
    ]),
  ],
};

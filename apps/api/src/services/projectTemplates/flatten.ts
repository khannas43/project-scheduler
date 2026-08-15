import {
  asCalendarId,
  asTaskId,
  validateGraph,
  type DependencyInput,
  type LinkType,
  type TaskInput,
} from '@pkg/scheduler';

export const MINUTES_PER_WORKING_DAY = 480;

export type OutlineNode = {
  readonly key: string;
  readonly name: string;
  /** Working days for a leaf. Ignored on summaries. 0 if milestone. */
  readonly days?: number;
  readonly isMilestone?: boolean;
  readonly children?: readonly OutlineNode[];
};

export type TemplateLink = {
  readonly pred: string;
  readonly succ: string;
  readonly linkType?: LinkType;
};

export type FlatTemplateTask = {
  readonly key: string;
  readonly name: string;
  readonly parentKey: string | null;
  readonly wbsPath: string;
  readonly sortOrder: number;
  readonly isSummary: boolean;
  readonly isMilestone: boolean;
  readonly durationMinutes: number | null;
};

export type TemplateDefinition = {
  readonly outline: readonly OutlineNode[];
  readonly links: readonly TemplateLink[];
};

export function flattenOutline(nodes: readonly OutlineNode[]): FlatTemplateTask[] {
  const out: FlatTemplateTask[] = [];
  const seen = new Set<string>();

  const walk = (list: readonly OutlineNode[], parentPath: string, parentKey: string | null): void => {
    list.forEach((node, index) => {
      if (seen.has(node.key)) {
        throw new Error(`Duplicate template task key '${node.key}'`);
      }
      seen.add(node.key);
      const wbsPath = parentPath === '' ? String(index + 1) : `${parentPath}.${index + 1}`;
      const isSummary = Boolean(node.children && node.children.length > 0);
      if (isSummary && node.isMilestone) {
        throw new Error(`Task '${node.key}' cannot be both a summary and a milestone`);
      }
      const durationMinutes = isSummary
        ? null
        : node.isMilestone
          ? 0
          : (node.days ?? 5) * MINUTES_PER_WORKING_DAY;
      out.push({
        key: node.key,
        name: node.name,
        parentKey,
        wbsPath,
        sortOrder: index,
        isSummary,
        isMilestone: node.isMilestone ?? false,
        durationMinutes,
      });
      if (node.children && node.children.length > 0) {
        walk(node.children, wbsPath, node.key);
      }
    });
  };

  walk(nodes, '', null);
  return out;
}

export function fsChain(keys: readonly string[]): TemplateLink[] {
  const links: TemplateLink[] = [];
  for (let i = 1; i < keys.length; i++) {
    const pred = keys[i - 1];
    const succ = keys[i];
    if (pred && succ) links.push({ pred, succ, linkType: 'FS' });
  }
  return links;
}

export function link(pred: string, succ: string, linkType: LinkType = 'FS'): TemplateLink {
  return { pred, succ, linkType };
}

export function assertLinks(tasks: readonly FlatTemplateTask[], links: readonly TemplateLink[]): void {
  const keys = new Set(tasks.map((t) => t.key));
  for (const l of links) {
    if (!keys.has(l.pred)) throw new Error(`Unknown predecessor '${l.pred}'`);
    if (!keys.has(l.succ)) throw new Error(`Unknown successor '${l.succ}'`);
  }
}

export function compileDefinition(def: TemplateDefinition): {
  readonly tasks: readonly FlatTemplateTask[];
  readonly links: readonly TemplateLink[];
} {
  const tasks = flattenOutline(def.outline);
  assertLinks(tasks, def.links);
  return { tasks, links: def.links };
}

/** Throws SchedulingError if the template graph is invalid. */
export function validateTemplateGraph(def: TemplateDefinition): void {
  const { tasks, links } = compileDefinition(def);
  const calId = asCalendarId('00000000-0000-4000-8000-000000000001');
  const idMap = new Map(tasks.map((t) => [t.key, asTaskId(t.key)]));

  const taskInputs: TaskInput[] = tasks.map((t) => ({
    id: idMap.get(t.key)!,
    parentId: t.parentKey ? idMap.get(t.parentKey)! : null,
    isSummary: t.isSummary,
    durationMinutes: t.isSummary ? 0 : (t.durationMinutes ?? 0),
    calendarId: calId,
    constraintType: 'asap',
    constraintDate: null,
    deadline: null,
  }));

  const depInputs: DependencyInput[] = links.map((l) => ({
    predecessorId: idMap.get(l.pred)!,
    successorId: idMap.get(l.succ)!,
    linkType: l.linkType ?? 'FS',
    lagMinutes: 0,
    lagPercent: null,
  }));

  validateGraph(taskInputs, depInputs);
}

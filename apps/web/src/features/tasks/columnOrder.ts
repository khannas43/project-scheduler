/** Default left-to-right order of TaskGrid columns (TanStack column ids). */
export const DEFAULT_TASK_GRID_COLUMN_ORDER = [
  'wbsCode',
  'name',
  'durationMinutes',
  'predecessors',
  'earlyStart',
  'earlyFinish',
  'totalFloatMinutes',
  'isCritical',
  'isMilestone',
  'resources',
  'actions',
] as const;

export type TaskGridColumnId = (typeof DEFAULT_TASK_GRID_COLUMN_ORDER)[number];

const STORAGE_KEY = 'project-scheduler.task-grid-column-order';

const KNOWN = new Set<string>(DEFAULT_TASK_GRID_COLUMN_ORDER);

/**
 * Keep only known ids, preserve caller order, then append any missing
 * defaults (so new columns appear at the end after upgrades).
 */
export function normalizeColumnOrder(raw: unknown): string[] {
  const defaults = [...DEFAULT_TASK_GRID_COLUMN_ORDER];
  if (!Array.isArray(raw)) return defaults;

  const seen = new Set<string>();
  const next: string[] = [];
  for (const id of raw) {
    if (typeof id === 'string' && KNOWN.has(id) && !seen.has(id)) {
      next.push(id);
      seen.add(id);
    }
  }
  for (const id of defaults) {
    if (!seen.has(id)) next.push(id);
  }
  return next;
}

export function loadColumnOrder(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_TASK_GRID_COLUMN_ORDER];
    return normalizeColumnOrder(JSON.parse(raw) as unknown);
  } catch {
    return [...DEFAULT_TASK_GRID_COLUMN_ORDER];
  }
}

export function saveColumnOrder(order: readonly string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeColumnOrder(order)));
}

/** Move `fromId` so it sits where `toId` currently is (toId shifts right). */
export function moveColumnOrder(
  order: readonly string[],
  fromId: string,
  toId: string,
): string[] {
  if (fromId === toId) return [...order];
  const next = [...order];
  const from = next.indexOf(fromId);
  if (from < 0 || next.indexOf(toId) < 0) return next;
  next.splice(from, 1);
  const to = next.indexOf(toId);
  next.splice(to, 0, fromId);
  return next;
}

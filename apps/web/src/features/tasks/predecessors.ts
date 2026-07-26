import type { DependencyRow, TaskRow } from './types.js';

/** Split a predecessors cell into WBS tokens (optional FS/SS/FF/SF suffix ignored). */
export function parsePredecessorWbsCodes(input: string): string[] {
  if (!input.trim()) return [];
  const codes: string[] = [];
  for (const raw of input.split(/[,;]+/)) {
    const token = raw.trim();
    if (!token) continue;
    const code = token.replace(/\s*(FS|SS|FF|SF)\b.*$/i, '').trim();
    if (code) codes.push(code);
  }
  return codes;
}

/** Format predecessor WBS codes for a successor (stable WBS order). */
export function formatPredecessorDisplay(
  successorId: string,
  dependencies: readonly DependencyRow[],
  tasksById: ReadonlyMap<string, TaskRow>,
): string {
  const preds = dependencies
    .filter((d) => d.successorId === successorId)
    .map((d) => tasksById.get(d.predecessorId))
    .filter((t): t is TaskRow => t !== undefined)
    .sort((a, b) => (a.wbsCode ?? '').localeCompare(b.wbsCode ?? '', undefined, { numeric: true }));

  return preds.map((t) => t.wbsCode ?? t.name).join(', ');
}

/**
 * Resolve WBS codes to predecessor task ids for `successorId`.
 * Throws with a user-facing message when a code is unknown or is self.
 */
export function resolvePredecessorIds(
  successorId: string,
  wbsCodes: readonly string[],
  tasks: readonly TaskRow[],
): string[] {
  const byWbs = new Map<string, TaskRow>();
  for (const t of tasks) {
    if (t.wbsCode) byWbs.set(t.wbsCode, t);
  }

  const ids: string[] = [];
  for (const code of wbsCodes) {
    const pred = byWbs.get(code);
    if (!pred) {
      throw new Error(`Unknown WBS code: ${code}`);
    }
    if (pred.id === successorId) {
      throw new Error('A task cannot be its own predecessor');
    }
    ids.push(pred.id);
  }
  return [...new Set(ids)];
}

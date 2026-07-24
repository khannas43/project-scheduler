/**
 * Pure WBS path helpers (§3.7). Label paths use '.' separators ('1.3.2').
 * Kept free of DB/I/O so the rewrite rules are unit-testable.
 */

/** Child path under a parent (null parent → root label). */
export function childWbsPath(parentPath: string | null, siblingIndex: number): string {
  if (!Number.isInteger(siblingIndex) || siblingIndex < 1) {
    throw new RangeError(`siblingIndex must be a positive integer, got ${siblingIndex}`);
  }
  const label = String(siblingIndex);
  return parentPath ? `${parentPath}.${label}` : label;
}

/**
 * Remap a path from an old subtree prefix to a new prefix.
 * Equivalent to Postgres: `newPrefix || subpath(path, nlevel(oldPrefix))`
 * (not `nlevel - 1` — that would duplicate the moved node's own label).
 */
export function remapWbsPath(path: string, oldPrefix: string, newPrefix: string): string {
  if (path === oldPrefix) return newPrefix;
  if (!path.startsWith(`${oldPrefix}.`)) {
    throw new RangeError(`path '${path}' is not under oldPrefix '${oldPrefix}'`);
  }
  const suffix = path.slice(oldPrefix.length + 1);
  return suffix.length === 0 ? newPrefix : `${newPrefix}.${suffix}`;
}

/** Display form mirrors the ltree path for this prototype. */
export function wbsCodeFromPath(path: string): string {
  return path;
}

/** Count of labels in an ltree-style path (nlevel). */
export function nlevel(path: string): number {
  if (path.length === 0) return 0;
  return path.split('.').length;
}

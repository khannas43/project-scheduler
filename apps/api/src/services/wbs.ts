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

const WBS_CODE_RE = /^\d+(\.\d+)*$/;

/** True for outline codes like `2`, `2.5`, `2.5.1`. */
export function isValidWbsCode(code: string): boolean {
  return WBS_CODE_RE.test(code);
}

/**
 * Parse a target outline code into parent path + 1-based sibling index.
 * `2.5` → parent `2`, index 5; `2.5.1` → parent `2.5`, index 1; `3` → root, index 3.
 */
export function parseWbsInsertTarget(wbsCode: string): {
  parentPath: string | null;
  siblingIndex: number;
} {
  const trimmed = wbsCode.trim();
  if (!isValidWbsCode(trimmed)) {
    throw new RangeError(`Invalid WBS code: ${wbsCode}`);
  }
  const parts = trimmed.split('.').map(Number);
  const siblingIndex = parts[parts.length - 1]!;
  if (!Number.isInteger(siblingIndex) || siblingIndex < 1) {
    throw new RangeError(`Invalid WBS sibling index in: ${wbsCode}`);
  }
  const parentParts = parts.slice(0, -1);
  return {
    parentPath: parentParts.length === 0 ? null : parentParts.join('.'),
    siblingIndex,
  };
}

/** Next free outline code under a parent (or at root when parentCode is null). */
export function suggestNextWbsCode(
  parentCode: string | null,
  siblingCount: number,
): string {
  return childWbsPath(parentCode, siblingCount + 1);
}

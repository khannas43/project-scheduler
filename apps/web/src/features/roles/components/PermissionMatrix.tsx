import { useMemo } from 'react';

import type { Permission } from '../types.js';

export interface PermissionMatrixProps {
  readonly permissions: readonly Permission[];
  readonly selectedKeys: readonly string[];
  readonly onChange: (nextKeys: string[]) => void;
  readonly disabled?: boolean;
}

function groupByCategory(permissions: readonly Permission[]): Array<{
  category: string;
  items: Permission[];
}> {
  const groups: Array<{ category: string; items: Permission[] }> = [];
  let current: { category: string; items: Permission[] } | null = null;

  // Response is already sorted by category, key — preserve that order.
  for (const perm of permissions) {
    if (!current || current.category !== perm.category) {
      current = { category: perm.category, items: [] };
      groups.push(current);
    }
    current.items.push(perm);
  }
  return groups;
}

/**
 * Single-role checkbox grid: categories as row groups, permission keys as
 * columns within each category. Reused by create and edit forms.
 */
export function PermissionMatrix({
  permissions,
  selectedKeys,
  onChange,
  disabled = false,
}: PermissionMatrixProps) {
  const groups = useMemo(() => groupByCategory(permissions), [permissions]);
  const selected = useMemo(() => new Set(selectedKeys), [selectedKeys]);

  const toggle = (key: string) => {
    if (disabled) return;
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange([...next].sort());
  };

  if (permissions.length === 0) {
    return <p className="muted">No permissions available.</p>;
  }

  return (
    <div className="permission-matrix" role="group" aria-label="Permission matrix">
      {groups.map((group) => (
        <section key={group.category} className="permission-category">
          <h3 className="permission-category-title">{group.category}</h3>
          <div className="permission-columns">
            {group.items.map((perm) => {
              const checked = selected.has(perm.key);
              const id = `perm-${perm.key.replace(/\./g, '-')}`;
              return (
                <label key={perm.key} className="permission-cell" htmlFor={id} title={perm.description}>
                  <input
                    id={id}
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggle(perm.key)}
                  />
                  <span className="permission-key mono">{perm.key}</span>
                  <span className="permission-desc muted">{perm.description}</span>
                </label>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

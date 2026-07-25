import type { Role } from '../types.js';

export interface RoleListProps {
  readonly roles: readonly Role[];
  readonly onEdit: (role: Role) => void;
  readonly onClone: (role: Role) => void;
}

export function RoleList({ roles, onEdit, onClone }: RoleListProps) {
  if (roles.length === 0) {
    return (
      <div className="empty-state">
        <p>No roles found.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="data-table role-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Description</th>
            <th>Type</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <tr key={role.id} data-role-id={role.id} data-system={role.isSystem ? 'true' : 'false'}>
              <td>
                <span className="role-name">{role.name}</span>
              </td>
              <td className="muted">{role.description ?? '—'}</td>
              <td>
                {role.isSystem ? (
                  <span className="status-pill system-badge">System</span>
                ) : (
                  <span className="status-pill custom-badge">Custom</span>
                )}
              </td>
              <td>
                <div className="role-actions">
                  {role.isSystem ? null : (
                    <button type="button" className="btn-link" onClick={() => onEdit(role)}>
                      Edit
                    </button>
                  )}
                  {/* Clone is client-only create pre-fill — safe for system roles too. */}
                  <button type="button" className="btn-link" onClick={() => onClone(role)}>
                    Clone
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

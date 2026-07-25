import { type FormEvent, useState } from 'react';

import { useUpdateRole } from '../hooks/useRoles.js';
import type { Permission, Role } from '../types.js';
import { PermissionMatrix } from './PermissionMatrix.js';

export interface EditRoleFormProps {
  readonly projectId: string;
  readonly role: Role;
  readonly permissions: readonly Permission[];
  readonly onCancel: () => void;
  readonly onUpdated?: (role: Role) => void;
}

/** Only for non-system roles — callers must not render this for isSystem roles. */
export function EditRoleForm({
  projectId,
  role,
  permissions,
  onCancel,
  onUpdated,
}: EditRoleFormProps) {
  const update = useUpdateRole(projectId);
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? '');
  const [permissionKeys, setPermissionKeys] = useState<string[]>([...role.permissionKeys]);

  if (role.isSystem) {
    return (
      <div className="form-error" role="alert">
        System roles are immutable.
      </div>
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (permissionKeys.length === 0) return;

    try {
      const updated = await update.mutateAsync({
        roleId: role.id,
        patch: {
          projectId,
          name: name.trim(),
          description: description.trim() === '' ? null : description.trim(),
          permissionKeys,
        },
      });
      onUpdated?.(updated);
    } catch {
      // ApiError already surfaced via useUpdateRole → useErrorBanner.
    }
  }

  return (
    <form className="role-form" onSubmit={(e) => void onSubmit(e)}>
      <h2>Edit role</h2>
      <label>
        Name
        <input
          name="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </label>
      <label>
        Description
        <textarea
          name="description"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <fieldset className="role-form-permissions">
        <legend>Permissions</legend>
        <PermissionMatrix
          permissions={permissions}
          selectedKeys={permissionKeys}
          onChange={setPermissionKeys}
          disabled={update.isPending}
        />
      </fieldset>
      {update.error ? (
        <p className="form-error" role="alert">
          {update.error instanceof Error ? update.error.message : 'Could not update role'}
        </p>
      ) : null}
      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={update.isPending}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={update.isPending || name.trim() === '' || permissionKeys.length === 0}
        >
          {update.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

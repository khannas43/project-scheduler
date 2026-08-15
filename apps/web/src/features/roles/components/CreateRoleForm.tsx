import { type FormEvent, useState } from 'react';

import { formatApiErrorMessage } from '../../../lib/apiErrors.js';
import { useCreateRole } from '../hooks/useRoles.js';
import type { Permission, Role } from '../types.js';
import { PermissionMatrix } from './PermissionMatrix.js';

export interface CreateRoleFormProps {
  readonly projectId: string;
  readonly permissions: readonly Permission[];
  /** When set, form is a client-side clone (pre-fill only — still POSTs create). */
  readonly cloneFrom?: Role | null;
  readonly onCancel: () => void;
  readonly onCreated?: (role: Role) => void;
}

export function CreateRoleForm({
  projectId,
  permissions,
  cloneFrom = null,
  onCancel,
  onCreated,
}: CreateRoleFormProps) {
  const create = useCreateRole(projectId);
  const [name, setName] = useState(cloneFrom ? `Copy of ${cloneFrom.name}` : '');
  const [description, setDescription] = useState(cloneFrom?.description ?? '');
  const [permissionKeys, setPermissionKeys] = useState<string[]>(
    cloneFrom ? [...cloneFrom.permissionKeys] : [],
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (permissionKeys.length === 0) return;

    try {
      const role = await create.mutateAsync({
        projectId,
        name: name.trim(),
        description: description.trim() === '' ? null : description.trim(),
        permissionKeys,
      });
      onCreated?.(role);
    } catch {
      // Form-local error via create.error (banner suppressed).
    }
  }

  return (
    <form className="role-form" onSubmit={(e) => void onSubmit(e)}>
      <h2>{cloneFrom ? 'Clone role' : 'New role'}</h2>
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
          disabled={create.isPending}
        />
      </fieldset>
      {create.error ? (
        <p className="form-error" role="alert">
          {formatApiErrorMessage(create.error, 'Could not create role')}
        </p>
      ) : null}
      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={create.isPending}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={create.isPending || name.trim() === '' || permissionKeys.length === 0}
        >
          {create.isPending ? 'Creating…' : 'Create role'}
        </button>
      </div>
    </form>
  );
}

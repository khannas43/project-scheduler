import { Link, useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { ApiError } from '../../../lib/apiClient.js';
import { useErrorBanner } from '../../../stores/errorBanner.js';
import { HelpLink } from '../../help/index.js';
import { usePermissions, useRoles } from '../hooks/useRoles.js';
import type { Role } from '../types.js';
import { CreateRoleForm } from './CreateRoleForm.js';
import { EditRoleForm } from './EditRoleForm.js';
import { RoleList } from './RoleList.js';

type Panel =
  | { kind: 'none' }
  | { kind: 'create'; cloneFrom: Role | null }
  | { kind: 'edit'; role: Role };

export function RolesPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const rolesQuery = useRoles(projectId);
  const permissionsQuery = usePermissions(projectId);
  const showBanner = useErrorBanner((s) => s.show);
  const [panel, setPanel] = useState<Panel>({ kind: 'none' });

  useEffect(() => {
    const err = rolesQuery.error ?? permissionsQuery.error;
    if (!err) return;
    if (err instanceof ApiError) {
      showBanner(err);
      return;
    }
    if (err instanceof Error) {
      showBanner(err);
    }
  }, [rolesQuery.error, permissionsQuery.error, showBanner]);

  const loading = rolesQuery.isLoading || permissionsQuery.isLoading;

  return (
    <div className="page roles-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <Link to="/projects/$projectId" params={{ projectId }}>
              ← Project
            </Link>
          </p>
          <h1>
            Roles <HelpLink topic="roles" />
          </h1>
          <p className="lede muted">
            Create and edit custom roles for this workspace. New and updated roles appear on Activity
            as role.create / role.update.
          </p>
        </div>
        {panel.kind === 'none' ? (
          <button
            type="button"
            onClick={() => setPanel({ kind: 'create', cloneFrom: null })}
            disabled={loading || Boolean(rolesQuery.error) || Boolean(permissionsQuery.error)}
          >
            New role
          </button>
        ) : null}
      </header>

      {loading ? <p className="muted">Loading roles…</p> : null}

      {!loading && rolesQuery.data && permissionsQuery.data && panel.kind === 'none' ? (
        <RoleList
          roles={rolesQuery.data}
          onEdit={(role) => {
            if (role.isSystem) return;
            setPanel({ kind: 'edit', role });
          }}
          onClone={(role) => setPanel({ kind: 'create', cloneFrom: role })}
        />
      ) : null}

      {panel.kind === 'create' && permissionsQuery.data ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal role-modal" role="dialog" aria-modal="true">
            <CreateRoleForm
              projectId={projectId}
              permissions={permissionsQuery.data}
              cloneFrom={panel.cloneFrom}
              onCancel={() => setPanel({ kind: 'none' })}
              onCreated={() => setPanel({ kind: 'none' })}
            />
          </div>
        </div>
      ) : null}

      {panel.kind === 'edit' && !panel.role.isSystem && permissionsQuery.data ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal role-modal" role="dialog" aria-modal="true">
            <EditRoleForm
              projectId={projectId}
              role={panel.role}
              permissions={permissionsQuery.data}
              onCancel={() => setPanel({ kind: 'none' })}
              onUpdated={() => setPanel({ kind: 'none' })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

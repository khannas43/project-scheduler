import { Link, useParams } from '@tanstack/react-router';
import { useMemo, useState, type FormEvent } from 'react';

import { HelpLink } from '../../help/index.js';
import {
  useAddMember,
  useCreateUser,
  useMembers,
  useNotifyMemberTasks,
  useRemoveMember,
  useUpdateMemberRole,
  useUsers,
} from '../hooks/usePeople.js';

function notifyMessage(smtpConfigured: boolean, count: number): string {
  if (smtpConfigured) return `Email sent to ${count} recipient${count === 1 ? '' : 's'}.`;
  return `SMTP is not configured — the message was logged on the server (${count} recipient${count === 1 ? '' : 's'}).`;
}

export function PeoplePage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const membersQuery = useMembers(projectId);
  const usersQuery = useUsers(projectId);
  const createUser = useCreateUser(projectId);
  const addMember = useAddMember(projectId);
  const updateRole = useUpdateMemberRole(projectId);
  const removeMember = useRemoveMember(projectId);
  const notify = useNotifyMemberTasks(projectId);

  const [panel, setPanel] = useState<'none' | 'user' | 'member'>('none');
  const [flash, setFlash] = useState<string | null>(null);

  const members = membersQuery.data?.members ?? [];
  const roles = membersQuery.data?.roles ?? [];
  const memberIds = useMemo(() => new Set(members.map((m) => m.userId)), [members]);
  const availableUsers = (usersQuery.data ?? []).filter((u) => u.isActive && !memberIds.has(u.id));

  const defaultRoleId = roles.find((r) => r.name === 'Team Member')?.id ?? roles[0]?.id ?? '';

  return (
    <div className="page people-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <Link to="/projects/$projectId" params={{ projectId }}>
              ← Project
            </Link>
          </p>
          <h1>
            People <HelpLink topic="roles" />
          </h1>
          <p className="lede muted">
            Create login accounts, assign a project role, and email people about their assigned
            tasks.
          </p>
        </div>
        <div className="page-header-actions">
          <button type="button" className="btn-secondary" onClick={() => setPanel('member')}>
            Add existing user
          </button>
          <button type="button" onClick={() => setPanel('user')}>
            New user
          </button>
        </div>
      </header>

      {flash ? (
        <p className="info-banner" role="status">
          {flash}
        </p>
      ) : null}

      {membersQuery.isLoading ? <p className="muted">Loading members…</p> : null}
      {membersQuery.isError ? (
        <p className="form-error" role="alert">
          {membersQuery.error instanceof Error ? membersQuery.error.message : 'Could not load members'}
        </p>
      ) : null}

      {members.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId} className={m.isActive ? undefined : 'is-archived'}>
                  <td>
                    {m.fullName}
                    {m.isActive ? null : <span className="status-pill status-archived">Inactive</span>}
                  </td>
                  <td className="mono">{m.email}</td>
                  <td>
                    <select
                      value={m.roleId}
                      disabled={updateRole.isPending}
                      aria-label={`Role for ${m.fullName}`}
                      onChange={(e) => {
                        void updateRole.mutateAsync({ userId: m.userId, roleId: e.target.value });
                      }}
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="people-row-actions">
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={notify.isPending}
                        onClick={() => {
                          void notify.mutateAsync({ userId: m.userId }).then((result) => {
                            setFlash(notifyMessage(result.smtpConfigured, result.emailed.length));
                          });
                        }}
                      >
                        Email tasks
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={removeMember.isPending}
                        onClick={() => {
                          if (!window.confirm(`Remove ${m.fullName} from this project?`)) return;
                          void removeMember.mutateAsync(m.userId);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {panel === 'user' ? (
        <CreateUserModal
          projectId={projectId}
          defaultRoleId={defaultRoleId}
          roles={roles}
          pending={createUser.isPending}
          onCancel={() => setPanel('none')}
          onSubmit={async (input) => {
            await createUser.mutateAsync(input);
            setPanel('none');
            setFlash(
              input.sendWelcomeEmail
                ? `${input.fullName} created. Welcome email queued (or logged if SMTP is off).`
                : `${input.fullName} created. Share the password you set so they can sign in.`,
            );
          }}
        />
      ) : null}

      {panel === 'member' ? (
        <AddMemberModal
          users={availableUsers}
          roles={roles}
          defaultRoleId={defaultRoleId}
          pending={addMember.isPending}
          usersLoading={usersQuery.isLoading}
          onCancel={() => setPanel('none')}
          onSubmit={async (input) => {
            await addMember.mutateAsync(input);
            setPanel('none');
            setFlash('Member added.');
          }}
        />
      ) : null}
    </div>
  );
}

function CreateUserModal({
  projectId,
  defaultRoleId,
  roles,
  pending,
  onCancel,
  onSubmit,
}: {
  projectId: string;
  defaultRoleId: string;
  roles: readonly { id: string; name: string }[];
  pending: boolean;
  onCancel: () => void;
  onSubmit: (input: {
    projectId: string;
    email: string;
    fullName: string;
    password: string;
    roleId?: string;
    createResource?: boolean;
    sendWelcomeEmail?: boolean;
  }) => Promise<void>;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState(defaultRoleId);
  const [createResource, setCreateResource] = useState(true);
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onForm(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    try {
      await onSubmit({
        projectId,
        fullName: fullName.trim(),
        email: email.trim(),
        password,
        ...(roleId ? { roleId } : {}),
        createResource,
        sendWelcomeEmail,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create user');
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <form
        className="modal create-project-form"
        role="dialog"
        aria-labelledby="new-user-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void onForm(e)}
      >
        <h2 id="new-user-title">New user</h2>
        <label>
          Full name
          <input required value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
        </label>
        <label>
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          Project role
          <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            <option value="">Don’t add to this project yet</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="create-mode-option">
          <input
            type="checkbox"
            checked={createResource}
            onChange={(e) => setCreateResource(e.target.checked)}
          />
          Also create a work resource (needed to assign and email their tasks)
        </label>
        <label className="create-mode-option">
          <input
            type="checkbox"
            checked={sendWelcomeEmail}
            onChange={(e) => setSendWelcomeEmail(e.target.checked)}
          />
          Email login details (requires SMTP)
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
          <button type="submit" disabled={pending || !fullName.trim() || !email.trim()}>
            {pending ? 'Creating…' : 'Create user'}
          </button>
        </div>
      </form>
    </div>
  );
}

function AddMemberModal({
  users,
  roles,
  defaultRoleId,
  pending,
  usersLoading,
  onCancel,
  onSubmit,
}: {
  users: readonly { id: string; email: string; fullName: string }[];
  roles: readonly { id: string; name: string }[];
  defaultRoleId: string;
  pending: boolean;
  usersLoading: boolean;
  onCancel: () => void;
  onSubmit: (input: { userId: string; roleId: string }) => Promise<void>;
}) {
  const [userId, setUserId] = useState('');
  const [roleId, setRoleId] = useState(defaultRoleId);
  const [error, setError] = useState<string | null>(null);

  async function onForm(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!userId || !roleId) {
      setError('Choose a user and a role.');
      return;
    }
    try {
      await onSubmit({ userId, roleId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add member');
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <form
        className="modal create-project-form"
        role="dialog"
        aria-labelledby="add-member-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void onForm(e)}
      >
        <h2 id="add-member-title">Add existing user</h2>
        {usersLoading ? <p className="muted">Loading users…</p> : null}
        <label>
          User
          <select required value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Select…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName} ({u.email})
              </option>
            ))}
          </select>
        </label>
        {users.length === 0 && !usersLoading ? (
          <p className="muted">Everyone with an account is already on this project. Create a new user instead.</p>
        ) : null}
        <label>
          Role
          <select required value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
          <button type="submit" disabled={pending || !userId || !roleId}>
            {pending ? 'Adding…' : 'Add member'}
          </button>
        </div>
      </form>
    </div>
  );
}

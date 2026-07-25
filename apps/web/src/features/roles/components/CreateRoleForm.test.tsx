import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../../lib/apiClient.js';
import { useErrorBanner } from '../../../stores/errorBanner.js';
import type { Permission } from '../types.js';
import { CreateRoleForm } from './CreateRoleForm.js';

vi.mock('../api.js', () => ({
  createRole: vi.fn(),
  listRoles: vi.fn(),
  listPermissions: vi.fn(),
  updateRole: vi.fn(),
}));

import * as rolesApi from '../api.js';

const permissions: Permission[] = [
  {
    id: 'p1',
    key: 'project.view',
    category: 'Project',
    description: 'View project',
  },
  {
    id: 'p2',
    key: 'task.edit',
    category: 'Task',
    description: 'Edit tasks',
  },
];

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('CreateRoleForm', () => {
  beforeEach(() => {
    vi.mocked(rolesApi.createRole).mockReset();
    useErrorBanner.getState().clear();
  });

  it('submits createRole with projectId, name, description, and permissionKeys', async () => {
    const user = userEvent.setup();
    vi.mocked(rolesApi.createRole).mockResolvedValue({
      id: 'new',
      name: 'Planner',
      description: 'Plans stuff',
      isSystem: false,
      permissionKeys: ['project.view', 'task.edit'],
    });
    const onCreated = vi.fn();

    wrap(
      <CreateRoleForm
        projectId="proj-1"
        permissions={permissions}
        onCancel={vi.fn()}
        onCreated={onCreated}
      />,
    );

    await user.type(screen.getByLabelText(/^name$/i), 'Planner');
    await user.type(screen.getByLabelText(/description/i), 'Plans stuff');
    await user.click(screen.getByLabelText(/project\.view/i));
    await user.click(screen.getByLabelText(/task\.edit/i));
    await user.click(screen.getByRole('button', { name: /create role/i }));

    await waitFor(() => {
      expect(rolesApi.createRole).toHaveBeenCalledWith({
        projectId: 'proj-1',
        name: 'Planner',
        description: 'Plans stuff',
        permissionKeys: ['project.view', 'task.edit'],
      });
    });
    expect(onCreated).toHaveBeenCalled();
  });

  it('surfaces a 409 through the error banner', async () => {
    const user = userEvent.setup();
    vi.mocked(rolesApi.createRole).mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'conflict',
        detail: 'Role name already exists: Planner',
        title: 'Conflict',
      }),
    );

    wrap(<CreateRoleForm projectId="proj-1" permissions={permissions} onCancel={vi.fn()} />);

    await user.type(screen.getByLabelText(/^name$/i), 'Planner');
    await user.click(screen.getByLabelText(/project\.view/i));
    await user.click(screen.getByRole('button', { name: /create role/i }));

    await waitFor(() => {
      expect(useErrorBanner.getState().message).toBe('Role name already exists: Planner');
      expect(useErrorBanner.getState().code).toBe('conflict');
    });
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Permission } from '../types.js';
import { PermissionMatrix } from './PermissionMatrix.js';

const permissions: Permission[] = [
  {
    id: 'p1',
    key: 'project.view',
    category: 'Project',
    description: 'View project',
  },
  {
    id: 'p2',
    key: 'project.edit',
    category: 'Project',
    description: 'Edit project settings',
  },
  {
    id: 'p3',
    key: 'task.view',
    category: 'Task',
    description: 'View tasks',
  },
];

describe('PermissionMatrix', () => {
  it('renders checked state from permissionKeys and toggles via onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <PermissionMatrix
        permissions={permissions}
        selectedKeys={['project.view', 'task.view']}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Project' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Task' })).toBeInTheDocument();

    const view = screen.getByLabelText(/project\.view/i);
    const edit = screen.getByLabelText(/project\.edit/i);
    const taskView = screen.getByLabelText(/task\.view/i);

    expect(view).toBeChecked();
    expect(edit).not.toBeChecked();
    expect(taskView).toBeChecked();

    await user.click(edit);
    expect(onChange).toHaveBeenCalledWith(['project.edit', 'project.view', 'task.view']);

    await user.click(view);
    expect(onChange).toHaveBeenCalledWith(['task.view']);
  });
});

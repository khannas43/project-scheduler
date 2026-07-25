import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Role } from '../types.js';
import { RoleList } from './RoleList.js';

const roles: Role[] = [
  {
    id: 'sys',
    name: 'Admin',
    description: 'All permissions',
    isSystem: true,
    permissionKeys: ['role.manage'],
  },
  {
    id: 'custom',
    name: 'Scheduler',
    description: 'Edit tasks',
    isSystem: false,
    permissionKeys: ['task.edit'],
  },
];

describe('RoleList', () => {
  it('renders system roles without edit controls', () => {
    render(<RoleList roles={roles} onEdit={vi.fn()} onClone={vi.fn()} />);

    const systemRow = screen.getByText('Admin').closest('tr');
    const customRow = screen.getByText('Scheduler').closest('tr');
    expect(systemRow).toBeTruthy();
    expect(customRow).toBeTruthy();

    expect(systemRow).toHaveAttribute('data-system', 'true');
    expect(systemRow!.querySelector('button')).not.toBeNull(); // Clone still available
    expect(systemRow!.textContent).not.toMatch(/\bEdit\b/);
    expect(systemRow!.textContent).toMatch(/Clone/);

    expect(customRow!.textContent).toMatch(/Edit/);
    expect(customRow!.textContent).toMatch(/Clone/);
    expect(screen.getByText('System')).toBeInTheDocument();
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../../lib/apiClient.js';
import { useErrorBanner } from '../../../stores/errorBanner.js';
import type { Resource } from '../types.js';
import { ResourceList } from './ResourceList.js';

vi.mock('../api.js', () => ({
  listResources: vi.fn(),
  createResource: vi.fn(),
  updateResource: vi.fn(),
  deleteResource: vi.fn(),
  getOverallocations: vi.fn(),
}));

import * as resourcesApi from '../api.js';

const projectId = '22222222-2222-4222-8222-222222222222';

function resource(partial: Partial<Resource> & Pick<Resource, 'id' | 'name'>): Resource {
  return {
    resourceType: 'work',
    email: null,
    maxUnits: '1',
    standardRate: '50',
    overtimeRate: null,
    costPerUse: '0',
    accrualType: 'prorated',
    calendarId: null,
    skills: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('ResourceList', () => {
  beforeEach(() => {
    vi.mocked(resourcesApi.getOverallocations).mockReset();
    vi.mocked(resourcesApi.deleteResource).mockReset();
    useErrorBanner.getState().clear();
  });

  it('renders resources and overallocation badges without blocking the table', async () => {
    vi.mocked(resourcesApi.getOverallocations).mockImplementation(async (_pid, resourceId) => {
      if (resourceId === 'r-over') {
        return [
          { date: '2026-01-06', totalUnits: 2, maxUnits: 1 },
          { date: '2026-01-07', totalUnits: 2, maxUnits: 1 },
        ];
      }
      return [];
    });

    wrap(
      <ResourceList
        projectId={projectId}
        resources={[
          resource({ id: 'r-over', name: 'Alice' }),
          resource({ id: 'r-clean', name: 'Bob' }),
        ]}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/2 days over/i)).toBeInTheDocument();
    });
    // Clean resource has no badge — only one overallocation pill in the table.
    expect(screen.getAllByText(/days? over/i)).toHaveLength(1);
  });

  it('surfaces delete-with-assignments 400 on the error banner', async () => {
    const user = userEvent.setup();
    vi.mocked(resourcesApi.getOverallocations).mockResolvedValue([]);
    vi.mocked(resourcesApi.deleteResource).mockRejectedValue(
      new ApiError({
        status: 400,
        code: 'bad_request',
        detail: 'Cannot delete a resource with existing assignments — remove its assignments first',
        title: 'BadRequestError',
      }),
    );

    wrap(
      <ResourceList
        projectId={projectId}
        resources={[resource({ id: 'r1', name: 'Alice' })]}
        onEdit={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    await waitFor(() => {
      expect(useErrorBanner.getState().message).toMatch(/Cannot delete a resource with existing assignments/);
      expect(useErrorBanner.getState().code).toBe('bad_request');
    });
  });
});

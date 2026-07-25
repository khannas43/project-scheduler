import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useErrorBanner } from '../../../stores/errorBanner.js';
import { CreateResourceForm } from './CreateResourceForm.js';

vi.mock('../api.js', () => ({
  createResource: vi.fn(),
  listResources: vi.fn(),
  updateResource: vi.fn(),
  deleteResource: vi.fn(),
  getOverallocations: vi.fn(),
}));

import * as resourcesApi from '../api.js';

const projectId = '22222222-2222-4222-8222-222222222222';

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('CreateResourceForm', () => {
  beforeEach(() => {
    vi.mocked(resourcesApi.createResource).mockReset();
    useErrorBanner.getState().clear();
  });

  it('submits createResource with projectId and form fields', async () => {
    const user = userEvent.setup();
    vi.mocked(resourcesApi.createResource).mockResolvedValue({
      id: 'new',
      name: 'Alice',
      resourceType: 'work',
      email: 'alice@example.com',
      maxUnits: '1',
      standardRate: '75',
      overtimeRate: null,
      costPerUse: '0',
      accrualType: 'prorated',
      calendarId: null,
      skills: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const onCreated = vi.fn();

    wrap(<CreateResourceForm projectId={projectId} onCancel={vi.fn()} onCreated={onCreated} />);

    await user.type(screen.getByLabelText(/^name$/i), 'Alice');
    await user.type(screen.getByLabelText(/^email$/i), 'alice@example.com');
    await user.clear(screen.getByLabelText(/standard rate/i));
    await user.type(screen.getByLabelText(/standard rate/i), '75');
    await user.selectOptions(screen.getByLabelText(/^accrual$/i), 'prorated');
    await user.click(screen.getByRole('button', { name: /create resource/i }));

    await waitFor(() => {
      expect(resourcesApi.createResource).toHaveBeenCalledWith(projectId, {
        name: 'Alice',
        resourceType: 'work',
        email: 'alice@example.com',
        maxUnits: 1,
        standardRate: 75,
        costPerUse: null,
        accrualType: 'prorated',
        calendarId: null,
      });
    });
    expect(onCreated).toHaveBeenCalled();
  });
});

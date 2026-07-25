import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../../lib/apiClient.js';
import { useErrorBanner } from '../../../stores/errorBanner.js';
import {
  resourcesQueryKey,
  useCreateResource,
  useDeleteResource,
  useOverallocations,
} from './useResources.js';

vi.mock('../api.js', () => ({
  listResources: vi.fn(),
  createResource: vi.fn(),
  updateResource: vi.fn(),
  deleteResource: vi.fn(),
  getOverallocations: vi.fn(),
}));

import * as resourcesApi from '../api.js';

const projectId = '22222222-2222-4222-8222-222222222222';

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

describe('useCreateResource / useDeleteResource', () => {
  beforeEach(() => {
    useErrorBanner.getState().clear();
    vi.mocked(resourcesApi.createResource).mockReset();
    vi.mocked(resourcesApi.deleteResource).mockReset();
    vi.mocked(resourcesApi.getOverallocations).mockReset();
  });

  it('invalidates the resources query on create success', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    vi.mocked(resourcesApi.createResource).mockResolvedValue({
      id: 'r1',
      name: 'Alice',
      resourceType: 'work',
      email: null,
      maxUnits: '1',
      standardRate: null,
      overtimeRate: null,
      costPerUse: null,
      accrualType: null,
      calendarId: null,
      skills: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const { result } = renderHook(() => useCreateResource(projectId), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({ name: 'Alice', resourceType: 'work' });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: resourcesQueryKey(projectId) });
  });

  it('surfaces delete 400 on the error banner', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    vi.mocked(resourcesApi.deleteResource).mockRejectedValue(
      new ApiError({
        status: 400,
        code: 'bad_request',
        detail: 'Cannot delete a resource with existing assignments — remove its assignments first',
        title: 'BadRequestError',
      }),
    );

    const { result } = renderHook(() => useDeleteResource(projectId), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      try {
        await result.current.mutateAsync('r1');
      } catch {
        // expected
      }
    });

    await waitFor(() => {
      expect(useErrorBanner.getState().message).toMatch(/existing assignments/);
    });
  });
});

describe('useOverallocations', () => {
  it('does not fetch when disabled', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    renderHook(() => useOverallocations(projectId, 'r1', false), {
      wrapper: createWrapper(client),
    });
    expect(resourcesApi.getOverallocations).not.toHaveBeenCalled();
  });
});

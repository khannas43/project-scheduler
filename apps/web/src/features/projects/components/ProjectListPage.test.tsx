import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => vi.fn(),
}));

vi.mock('../hooks/useProjects.js', () => ({
  useProjects: () => ({
    data: [
      {
        id: 'p1',
        name: 'Bridge retrofit',
        description: null,
        status: 'active',
        startDate: '2026-08-01T00:00:00.000Z',
        finishDate: null,
        statusDate: null,
        calendarId: 'c1',
        ownerId: '11111111-1111-4111-8111-111111111111',
        isArchived: false,
        category: 'application-development',
        templateKey: 'goi-custom-application',
        settings: {
          dateFormat: 'yyyy-mm-dd',
          dateTimeDisplay: 'date',
          activeBaselineId: null,
          showBaselineOnGantt: false,
        },
        version: 0,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
    ],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useCreateProject: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  useSetProjectArchived: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteProject: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDuplicateProject: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useProjectTemplates: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
  useCreateProjectFromTemplate: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  useCreateProjectFromSpreadsheet: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
}));

import { ProjectListPage } from './ProjectListPage.js';

describe('ProjectListPage', () => {
  it('renders project name, status, owner, date range, and lifecycle actions', () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <ProjectListPage />
      </QueryClientProvider>,
    );

    expect(screen.getByRole('columnheader', { name: /name/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /status/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /category/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /owner/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /date range/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /actions/i })).toBeInTheDocument();
    expect(screen.getByText('Bridge retrofit')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('Application development')).toBeInTheDocument();
    expect(screen.getByText('11111111')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /disable/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    expect(screen.queryByText(/health/i)).not.toBeInTheDocument();
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
  }: {
    children: ReactNode;
    to?: string;
    params?: { projectId?: string };
  }) => (
    <a href={params?.projectId ? `${to}/${params.projectId}` : (to ?? '#')}>{children}</a>
  ),
}));

vi.mock('../api.js', () => ({
  getProjectDashboard: vi.fn(),
  getPortfolioDashboard: vi.fn(),
}));

vi.mock('../../projects/hooks/useProjects.js', () => ({
  useProjects: () => ({
    data: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Aurora',
        version: 1,
        isArchived: false,
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Northwind',
        version: 2,
        isArchived: false,
      },
    ],
    isLoading: false,
    isError: false,
  }),
  useSetProjectArchived: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteProject: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDuplicateProject: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import * as dashboardApi from '../api.js';
import { PortfolioDashboardPage } from './PortfolioDashboardPage.js';

const projectA = '11111111-1111-4111-8111-111111111111';
const projectB = '22222222-2222-4222-8222-222222222222';

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('PortfolioDashboardPage', () => {
  beforeEach(() => {
    vi.mocked(dashboardApi.getPortfolioDashboard).mockReset();
    vi.mocked(dashboardApi.getPortfolioDashboard).mockResolvedValue([
      {
        projectId: projectA,
        projectName: 'Aurora',
        status: 'active',
        health: 'on_track',
        overallPercentComplete: 55,
        baselineId: null,
        spi: 1.05,
        cpi: 1.01,
        criticalTaskCount: 2,
        overallocatedResourceCount: 0,
      },
      {
        projectId: projectB,
        projectName: 'Northwind',
        status: 'active',
        health: 'behind',
        overallPercentComplete: 30,
        baselineId: '33333333-3333-4333-8333-333333333333',
        spi: 0.8,
        cpi: 0.9,
        criticalTaskCount: 5,
        overallocatedResourceCount: 2,
      },
    ]);
  });

  it('renders one row per project with links to project detail', async () => {
    wrap(<PortfolioDashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId(`portfolio-row-${projectA}`)).toBeInTheDocument();
    });
    expect(screen.getByTestId(`portfolio-row-${projectB}`)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Aurora' })).toHaveAttribute(
      'href',
      expect.stringContaining(projectA),
    );
    expect(screen.getByRole('link', { name: 'Northwind' })).toHaveAttribute(
      'href',
      expect.stringContaining(projectB),
    );
    expect(screen.getByText('On track')).toBeInTheDocument();
    expect(screen.getByText('Behind')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /disable/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /delete/i })).toHaveLength(2);
  });
});

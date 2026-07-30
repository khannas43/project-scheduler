import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...props
  }: {
    children: ReactNode;
    to?: string;
    [key: string]: unknown;
  }) => (
    <a href={to ?? '#'} {...props}>
      {children}
    </a>
  ),
  useParams: () => ({ projectId: '11111111-1111-4111-8111-111111111111' }),
}));

vi.mock('../api.js', () => ({
  getProjectDashboard: vi.fn(),
  getPortfolioDashboard: vi.fn(),
}));

import * as dashboardApi from '../api.js';
import { ProjectDashboardPage } from './ProjectDashboardPage.js';

const projectId = '11111111-1111-4111-8111-111111111111';

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('ProjectDashboardPage', () => {
  beforeEach(() => {
    vi.mocked(dashboardApi.getProjectDashboard).mockReset();
    vi.mocked(dashboardApi.getProjectDashboard).mockResolvedValue({
      projectId,
      projectName: 'Bridge Retrofit',
      status: 'active',
      health: 'at_risk',
      overallPercentComplete: 42,
      baselineId: '22222222-2222-4222-8222-222222222222',
      spi: 1.02,
      cpi: 0.95,
      criticalTaskCount: 3,
      overallocatedResourceCount: 1,
      upcomingMilestones: [
        {
          wbsCode: '1.5',
          name: 'Go-live',
          earlyFinish: '2026-08-01T17:00:00.000Z',
          deadline: null,
          percentComplete: 0,
          isCritical: true,
        },
      ],
      slippingTaskCount: 2,
      topSlippingTasks: [
        {
          taskId: '33333333-3333-4333-8333-333333333333',
          wbsCode: '1.2',
          name: 'Pour foundation',
          reasons: ['behind_baseline'],
          varianceMinutes: 480,
        },
      ],
    });
  });

  it('renders the health badge and key stat tiles', async () => {
    wrap(<ProjectDashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId('health-badge')).toHaveTextContent(/at risk/i);
    });
    expect(screen.getByTestId('stat-complete')).toHaveTextContent('42%');
    expect(screen.getByTestId('stat-critical')).toHaveTextContent('3');
    expect(screen.getByTestId('stat-overalloc')).toHaveTextContent('1');
    expect(screen.getByTestId('stat-spi')).toHaveTextContent('1.02');
    expect(screen.getByTestId('stat-cpi')).toHaveTextContent('0.95');
    expect(screen.getByText('Go-live')).toBeInTheDocument();
    expect(screen.getByText('Pour foundation')).toBeInTheDocument();
    expect(screen.getByTestId('ev-baselines-link')).toBeInTheDocument();
  });
});

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
      startDate: '2026-01-01',
      finishDate: '2026-12-31',
      statusDate: '2026-08-15',
      taskCounts: {
        total: 20,
        summary: 4,
        leaf: 16,
        milestone: 2,
        critical: 3,
        completed: 5,
      },
      earnedValue: {
        baselineId: '22222222-2222-4222-8222-222222222222',
        bac: 100000,
        pv: 45000,
        ev: 42000,
        ac: 48000,
        spi: 1.02,
        cpi: 0.95,
      },
      progressBreakdown: {
        notStarted: 8,
        inProgress: 3,
        completed: 5,
        milestone: 2,
      },
      phaseProgress: [
        {
          taskId: 'p1',
          wbsCode: '1',
          name: 'Foundation',
          percentComplete: 80,
          isCritical: true,
        },
      ],
      topInProgress: [
        {
          taskId: 'a1',
          wbsCode: '1.2',
          name: 'Steel frame',
          percentComplete: 65,
          earlyStart: '2026-07-01T09:00:00.000Z',
          earlyFinish: '2026-08-20T17:00:00.000Z',
          isCritical: true,
          resourceNames: 'Alex',
        },
      ],
      nearCritical: [
        {
          taskId: 'a1',
          wbsCode: '1.2',
          name: 'Steel frame',
          totalFloatMinutes: 0,
          percentComplete: 65,
          earlyFinish: '2026-08-20T17:00:00.000Z',
          isCritical: true,
        },
      ],
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
      topOverallocated: [
        { resourceId: 'r1', resourceName: 'Crane', overallocatedDayCount: 4 },
      ],
      sCurve: {
        points: [
          { date: '2026-01-01', pv: 0 },
          { date: '2026-06-01', pv: 40000 },
          { date: '2026-12-31', pv: 100000 },
        ],
        current: { date: '2026-08-15', ev: 42000, ac: 48000 },
      },
    });
  });

  it('renders the health badge, key stats, and top in-progress', async () => {
    wrap(<ProjectDashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId('health-badge')).toHaveTextContent(/at risk/i);
    });
    expect(screen.getByTestId('stat-complete')).toHaveTextContent('42%');
    expect(screen.getByTestId('stat-critical')).toHaveTextContent('3');
    expect(screen.getByTestId('stat-overalloc')).toHaveTextContent('1');
    expect(screen.getByTestId('stat-spi')).toHaveTextContent('1.02');
    expect(screen.getByTestId('stat-cpi')).toHaveTextContent('0.95');
    expect(screen.getByTestId('stat-in-progress')).toHaveTextContent('3');
    expect(screen.getByText('Go-live')).toBeInTheDocument();
    expect(screen.getByText('Pour foundation')).toBeInTheDocument();
    // Appears in both top-in-progress and near-critical lists.
    expect(screen.getAllByText('Steel frame').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('top-in-progress-table')).toBeInTheDocument();
    expect(screen.getByTestId('ev-baselines-link')).toBeInTheDocument();
  });
});

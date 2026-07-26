import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: { children: ReactNode; to?: string }) => (
    <a href={props.to ?? '#'}>{children}</a>
  ),
  useParams: () => ({ projectId: '11111111-1111-4111-8111-111111111111' }),
}));

vi.mock('../../tracking/hooks/useEarnedValue.js', () => ({
  useBaselines: () => ({ data: [], isLoading: false, error: null }),
}));

vi.mock('../api.js', () => ({
  getProjectSummaryReport: vi.fn(),
  getCriticalTasksReport: vi.fn(),
  getMilestonesReport: vi.fn(),
  getOverallocatedResourcesReport: vi.fn(),
  getCostOverviewReport: vi.fn(),
  getSlippingTasksReport: vi.fn(),
  downloadProjectCsv: vi.fn(),
  downloadProjectExcel: vi.fn(),
  downloadProjectPdf: vi.fn(),
}));

import * as reportsApi from '../api.js';
import { ReportsPage } from './ReportsPage.js';

const projectId = '11111111-1111-4111-8111-111111111111';

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('ReportsPage', () => {
  beforeEach(() => {
    vi.mocked(reportsApi.getProjectSummaryReport).mockReset();
    vi.mocked(reportsApi.getCriticalTasksReport).mockReset();
    vi.mocked(reportsApi.downloadProjectCsv).mockReset();

    vi.mocked(reportsApi.getProjectSummaryReport).mockResolvedValue({
      projectId,
      projectName: 'Bridge',
      status: 'active',
      statusDate: null,
      startDate: null,
      finishDate: null,
      taskCounts: {
        total: 2,
        summary: 0,
        leaf: 2,
        milestone: 0,
        critical: 1,
        completed: 0,
      },
      overallPercentComplete: 25,
      cost: null,
    });

    vi.mocked(reportsApi.getCriticalTasksReport).mockResolvedValue([
      {
        wbsCode: '1',
        name: 'Pour foundation',
        isSummary: false,
        earlyStart: '2026-01-01T09:00:00.000Z',
        earlyFinish: '2026-01-01T17:00:00.000Z',
        durationMinutes: 480,
        totalFloatMinutes: 0,
        percentComplete: 0,
      },
    ]);
  });

  it('renders the built-in report list', () => {
    wrap(<ReportsPage />);
    const picker = screen.getByTestId('report-picker');
    expect(picker).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Project summary' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Critical tasks' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Milestones' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Cost overview' })).toBeInTheDocument();
  });

  it('selecting a report renders its table', async () => {
    const user = userEvent.setup();
    wrap(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('report-table')).toBeInTheDocument();
    });
    expect(screen.getByText('Bridge')).toBeInTheDocument();

    await user.selectOptions(screen.getByTestId('report-picker'), 'critical-tasks');

    await waitFor(() => {
      expect(screen.getByText('Pour foundation')).toBeInTheDocument();
    });
    expect(reportsApi.getCriticalTasksReport).toHaveBeenCalledWith(projectId);
  });

  it('CSV download button calls the authenticated export wrapper', async () => {
    const user = userEvent.setup();
    vi.mocked(reportsApi.downloadProjectCsv).mockResolvedValue(undefined);
    wrap(<ReportsPage />);

    await user.click(screen.getByTestId('download-csv'));

    await waitFor(() => {
      expect(reportsApi.downloadProjectCsv).toHaveBeenCalledWith(projectId);
    });
  });
});

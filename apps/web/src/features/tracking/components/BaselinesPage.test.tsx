import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Baseline } from '../types.js';
import { BaselinesPage } from './BaselinesPage.js';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useParams: () => ({ projectId: '11111111-1111-4111-8111-111111111111' }),
}));

vi.mock('../api.js', () => ({
  listBaselines: vi.fn(),
  createBaseline: vi.fn(),
  getBaselineDetail: vi.fn(),
  getEarnedValue: vi.fn(),
  getSCurve: vi.fn(),
}));

import * as trackingApi from '../api.js';

const projectId = '11111111-1111-4111-8111-111111111111';

function baseline(partial: Partial<Baseline> & Pick<Baseline, 'id' | 'baselineNumber'>): Baseline {
  return {
    projectId,
    name: null,
    capturedAt: '2026-01-01T12:00:00.000Z',
    capturedBy: 'user-1',
    createdAt: '2026-01-01T12:00:00.000Z',
    updatedAt: '2026-01-01T12:00:00.000Z',
    ...partial,
  };
}

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('BaselinesPage', () => {
  beforeEach(() => {
    vi.mocked(trackingApi.listBaselines).mockReset();
    vi.mocked(trackingApi.createBaseline).mockReset();
    vi.mocked(trackingApi.getEarnedValue).mockRejectedValue(
      Object.assign(new Error('No baseline'), { status: 404 }),
    );
    vi.mocked(trackingApi.getSCurve).mockRejectedValue(
      Object.assign(new Error('No baseline'), { status: 404 }),
    );
  });

  it('renders the baseline list and save flow', async () => {
    vi.mocked(trackingApi.listBaselines).mockResolvedValue([
      baseline({ id: 'bl-0', baselineNumber: 0, name: 'Kickoff' }),
    ]);
    vi.mocked(trackingApi.createBaseline).mockResolvedValue(
      baseline({ id: 'bl-1', baselineNumber: 1, name: 'Week 2' }),
    );

    const user = userEvent.setup();
    wrap(<BaselinesPage />);

    expect(await screen.findByText('Kickoff')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save baseline/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /save baseline/i }));
    expect(screen.getByRole('dialog', { name: /save baseline/i })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/name/i), 'Week 2');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(trackingApi.createBaseline).toHaveBeenCalledWith(projectId, 'Week 2');
    });
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../../lib/apiClient.js';
import type { EarnedValue, SCurve } from '../types.js';
import { EarnedValuePanel } from './EarnedValuePanel.js';

vi.mock('../api.js', () => ({
  getEarnedValue: vi.fn(),
  getSCurve: vi.fn(),
  listBaselines: vi.fn(),
  createBaseline: vi.fn(),
  getBaselineDetail: vi.fn(),
}));

import * as trackingApi from '../api.js';

const projectId = '11111111-1111-4111-8111-111111111111';

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const earnedValue: EarnedValue = {
  baselineId: 'bl-1',
  asOfDate: '2026-01-06T00:00:00.000Z',
  bac: 300,
  pv: 150,
  ev: 250,
  ac: 180,
  spi: 250 / 150,
  cpi: 250 / 180,
};

const sCurve: SCurve = {
  points: [
    { date: '2026-01-01', pv: 0 },
    { date: '2026-01-06', pv: 150 },
    { date: '2026-01-11', pv: 300 },
  ],
  current: { date: '2026-01-06', ev: 250, ac: 180 },
};

describe('EarnedValuePanel', () => {
  beforeEach(() => {
    vi.mocked(trackingApi.getEarnedValue).mockReset();
    vi.mocked(trackingApi.getSCurve).mockReset();
  });

  it('renders BAC/PV/EV/AC/SPI/CPI and SVG points from a mocked response', async () => {
    vi.mocked(trackingApi.getEarnedValue).mockResolvedValue(earnedValue);
    vi.mocked(trackingApi.getSCurve).mockResolvedValue(sCurve);

    wrap(<EarnedValuePanel projectId={projectId} />);

    await waitFor(() => {
      expect(screen.getByTestId('evm-bac')).toHaveTextContent('300');
    });
    expect(screen.getByTestId('evm-pv')).toHaveTextContent('150');
    expect(screen.getByTestId('evm-ev')).toHaveTextContent('250');
    expect(screen.getByTestId('evm-ac')).toHaveTextContent('180');
    expect(screen.getByTestId('evm-spi')).toBeInTheDocument();
    expect(screen.getByTestId('evm-cpi')).toBeInTheDocument();

    expect(screen.getByTestId('s-curve-pv')).toBeInTheDocument();
    expect(screen.getByTestId('s-curve-ev')).toBeInTheDocument();
    expect(screen.getByTestId('s-curve-ac')).toBeInTheDocument();
  });

  it('shows the empty state when no baseline has been captured', async () => {
    vi.mocked(trackingApi.getEarnedValue).mockRejectedValue(
      new ApiError({ status: 404, detail: 'No baseline captured yet', code: 'not_found' }),
    );
    vi.mocked(trackingApi.getSCurve).mockRejectedValue(
      new ApiError({ status: 404, detail: 'No baseline captured yet', code: 'not_found' }),
    );

    wrap(<EarnedValuePanel projectId={projectId} />);

    expect(await screen.findByTestId('evm-empty')).toHaveTextContent(/no baseline captured yet/i);
  });
});

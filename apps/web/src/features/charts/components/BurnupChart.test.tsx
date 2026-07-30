import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { SprintPointsSummary } from '../types.js';
import { BurnupChart } from './BurnupChart.js';

const summary: SprintPointsSummary = {
  sprintId: 's1',
  startDate: '2026-01-05T00:00:00.000Z',
  endDate: '2026-01-19T00:00:00.000Z',
  totalPoints: 13,
  completedPoints: 5,
  remainingPoints: 8,
};

describe('BurnupChart', () => {
  it('draws ideal line, scope reference, and current marker in range', () => {
    render(<BurnupChart summary={summary} todayIso="2026-01-12T12:00:00.000Z" />);
    expect(screen.getByTestId('burnup-ideal')).toBeInTheDocument();
    expect(screen.getByTestId('burnup-scope')).toBeInTheDocument();
    expect(screen.getByTestId('burnup-current')).toBeInTheDocument();
  });

  it('notes when today is outside the sprint range', () => {
    render(<BurnupChart summary={summary} todayIso="2025-12-01T12:00:00.000Z" />);
    expect(screen.queryByTestId('burnup-current')).toBeNull();
    expect(screen.getByTestId('burnup-out-of-range')).toBeInTheDocument();
  });
});

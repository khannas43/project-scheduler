import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { SprintPointsSummary } from '../types.js';
import { BurndownChart } from './BurndownChart.js';

const summary: SprintPointsSummary = {
  sprintId: 's1',
  startDate: '2026-01-05T00:00:00.000Z',
  endDate: '2026-01-19T00:00:00.000Z',
  totalPoints: 13,
  completedPoints: 5,
  remainingPoints: 8,
};

describe('BurndownChart', () => {
  it('draws the ideal line and current marker when today is in range', () => {
    render(<BurndownChart summary={summary} todayIso="2026-01-12T12:00:00.000Z" />);
    expect(screen.getByTestId('burndown-ideal')).toBeInTheDocument();
    expect(screen.getByTestId('burndown-current')).toBeInTheDocument();
    expect(screen.queryByTestId('burndown-out-of-range')).toBeNull();
  });

  it('hides the current marker and notes when today is outside the sprint', () => {
    render(<BurndownChart summary={summary} todayIso="2026-02-01T12:00:00.000Z" />);
    expect(screen.queryByTestId('burndown-current')).toBeNull();
    expect(screen.getByTestId('burndown-out-of-range')).toBeInTheDocument();
  });
});

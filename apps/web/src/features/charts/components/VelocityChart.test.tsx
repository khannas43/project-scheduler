import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { VelocityChart } from './VelocityChart.js';

describe('VelocityChart', () => {
  it('shows an empty state when there is no closed-sprint history', () => {
    render(<VelocityChart data={[]} />);
    expect(screen.getByTestId('velocity-empty')).toBeInTheDocument();
  });

  it('renders one bar per closed sprint', () => {
    render(
      <VelocityChart
        data={[
          {
            sprintId: 's1',
            sprintName: 'Sprint 1',
            startDate: '2026-01-01T00:00:00.000Z',
            endDate: '2026-01-14T00:00:00.000Z',
            completedPoints: 13,
          },
          {
            sprintId: 's2',
            sprintName: 'Sprint 2',
            startDate: '2026-01-15T00:00:00.000Z',
            endDate: '2026-01-28T00:00:00.000Z',
            completedPoints: 8,
          },
        ]}
      />,
    );

    expect(screen.getByTestId('velocity-chart')).toBeInTheDocument();
    expect(screen.getByTestId('velocity-bar-s1')).toBeInTheDocument();
    expect(screen.getByTestId('velocity-bar-s2')).toBeInTheDocument();
  });
});

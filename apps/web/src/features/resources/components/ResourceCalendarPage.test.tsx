import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { Resource } from '../types.js';
import { ResourceCalendarPage } from './ResourceCalendarPage.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const resourceId = '22222222-2222-4222-8222-222222222222';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    <a href="#" className={className}>
      {children}
    </a>
  ),
  useParams: () => ({ projectId, resourceId }),
  useNavigate: () => vi.fn(),
}));

vi.mock('../hooks/useResources.js', () => ({
  useResources: () => ({
    isLoading: false,
    error: null,
    data: [
      {
        id: resourceId,
        name: 'Alice',
        resourceType: 'work',
        email: null,
        maxUnits: '1',
        standardRate: '50',
        overtimeRate: null,
        costPerUse: '0',
        accrualType: 'prorated',
        calendarId: null,
        skills: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      } satisfies Resource,
    ],
  }),
}));

vi.mock('../../tasks/hooks/useTaskTree.js', () => ({
  useTaskTree: () => ({
    isLoading: false,
    error: null,
    data: {
      tasks: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          projectId,
          parentId: null,
          wbsPath: '1',
          wbsCode: '1',
          sortOrder: 0,
          name: 'Pour foundation',
          notes: null,
          isMilestone: false,
          isSummary: false,
          schedulingMode: 'cpm',
          durationMinutes: 960,
          taskType: 'fixed_duration',
          isEffortDriven: true,
          isManuallyScheduled: false,
          constraintType: 'asap',
          constraintDate: null,
          deadline: null,
          calendarId: null,
          earlyStart: '2026-01-05T09:00:00.000Z',
          earlyFinish: '2026-01-06T17:00:00.000Z',
          lateStart: null,
          lateFinish: null,
          totalFloatMinutes: 0,
          freeFloatMinutes: 0,
          isCritical: true,
    storyPoints: null,
    sprintId: null,
    boardColumnId: null,
    backlogRank: null,
          version: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      dependencies: [],
      calendars: [],
      assignments: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          taskId: '33333333-3333-4333-8333-333333333333',
          resourceId,
          units: '1',
          workMinutes: 960,
          actualWorkMinutes: null,
          cost: null,
          actualCost: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      projectVersion: 1,
    },
  }),
}));

const timephasedRows = [
  {
    id: 'tp1',
    assignmentId: '44444444-4444-4444-8444-444444444444',
    periodDate: '2026-01-05',
    plannedWorkMinutes: 480,
    actualWorkMinutes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tp2',
    assignmentId: '44444444-4444-4444-8444-444444444444',
    periodDate: '2026-01-06',
    plannedWorkMinutes: 240,
    actualWorkMinutes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

vi.mock('../../tasks/hooks/useAssignments.js', () => ({
  useUpdateAssignment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteAssignment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateTimephasedDay: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAssignmentTimephased: () => ({
    isLoading: false,
    data: timephasedRows,
  }),
  useAssignmentsTimephasedMap: () =>
    new Map([['44444444-4444-4444-8444-444444444444', timephasedRows]]),
}));

vi.mock('../../tasks/hooks/useTaskEdit.js', () => ({
  useTaskEdit: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('ResourceCalendarPage', () => {
  it('shows assigned tasks on the calendar and opens the editor', async () => {
    const user = userEvent.setup();
    wrap(<ResourceCalendarPage />);

    expect(screen.getByTestId('resource-calendar-month')).toBeInTheDocument();
    expect(screen.getByTestId('resource-cal-month-label')).toHaveTextContent('January 2026');
    expect(screen.getByTestId('resource-cal-list')).toHaveTextContent('Pour foundation');
    expect(screen.getAllByText('Pour foundation').length).toBeGreaterThan(0);

    // List row opens the whole-assignment editor (day cells also include chip text).
    await user.click(
      screen.getByTestId('resource-cal-list').querySelector('button.resource-cal-list-item')!,
    );
    expect(screen.getByTestId('resource-assignment-editor')).toBeInTheDocument();
    expect(screen.getByTestId('resource-cal-units')).toHaveValue(1);

    await user.click(
      screen.getByTestId('resource-calendar-month').querySelector('[data-day="2026-01-05"]')!,
    );
    expect(screen.getByTestId('resource-day-allocation')).toBeInTheDocument();
    expect(
      screen.getByTestId('resource-day-units-44444444-4444-4444-8444-444444444444'),
    ).toHaveValue(1);
  });
});

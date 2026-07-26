import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project } from '../../projects/index.js';
import type { DependencyRow, TaskRow } from '../types.js';
import {
  calendarMinutesToWorking,
  downloadDataUrl,
  ganttDurationMinutes,
  GanttPanel,
} from './GanttPanel.js';

const { exportToPngDataUrl } = vi.hoisted(() => ({
  exportToPngDataUrl: vi.fn(() => 'data:image/png;base64,AAAA'),
}));

vi.mock('@pkg/gantt', () => ({
  MINUTES_PER_DAY: 24 * 60,
  pixelsPerMinuteForScale: (scale: 'day' | 'week' | 'month') => {
    const pxPerDay = { day: 64, week: 24, month: 6 }[scale];
    return pxPerDay / (24 * 60);
  },
  GanttView: class {
    setData = vi.fn();
    setPixelsPerMinute = vi.fn();
    setOriginDateIso = vi.fn();
    destroy = vi.fn();
    exportToPngDataUrl = exportToPngDataUrl;
  },
}));

vi.mock('../hooks/useDependencies.js', () => ({
  useCreateDependency: () => ({ mutate: vi.fn() }),
}));

const project: Project = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Bridge Retrofit',
  description: null,
  status: 'active',
  startDate: '2026-01-01T00:00:00.000Z',
  finishDate: null,
  statusDate: null,
  calendarId: '22222222-2222-4222-8222-222222222222',
  ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  isArchived: false,
  settings: {
    dateFormat: 'yyyy-mm-dd',
    dateTimeDisplay: 'date',
    activeBaselineId: null,
    showBaselineOnGantt: false,
  },
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const tasks: TaskRow[] = [
  {
    id: '33333333-3333-4333-8333-333333333333',
    projectId: project.id,
    parentId: null,
    wbsPath: '1',
    wbsCode: '1',
    sortOrder: 0,
    name: 'Pour foundation',
    notes: null,
    isMilestone: false,
    isSummary: false,
    schedulingMode: 'cpm',
    durationMinutes: 480,
    taskType: 'fixed_duration',
    isEffortDriven: true,
    isManuallyScheduled: false,
    constraintType: 'asap',
    constraintDate: null,
    deadline: null,
    calendarId: null,
    earlyStart: '2026-01-01T09:00:00.000Z',
    earlyFinish: '2026-01-01T17:00:00.000Z',
    lateStart: null,
    lateFinish: null,
    totalFloatMinutes: 0,
    freeFloatMinutes: 0,
    isCritical: true,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const dependencies: DependencyRow[] = [];

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('downloadDataUrl', () => {
  it('creates a temporary anchor with download attribute and clicks it', () => {
    const click = vi.fn();
    const remove = vi.fn();
    const original = document.body.appendChild.bind(document.body);
    const appendChild = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      const el = node as HTMLAnchorElement;
      el.click = click;
      el.remove = remove;
      return original(node);
    });

    downloadDataUrl('data:image/png;base64,QQ==', 'bridge-retrofit.png');

    expect(appendChild).toHaveBeenCalled();
    const anchor = appendChild.mock.calls[0]![0] as HTMLAnchorElement;
    expect(anchor.download).toBe('bridge-retrofit.png');
    expect(anchor.href).toContain('data:image/png');
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();

    appendChild.mockRestore();
  });
});

describe('gantt duration mapping', () => {
  it('uses earlyFinish − earlyStart as calendar bar length', () => {
    expect(ganttDurationMinutes(tasks[0]!)).toBe(480);
  });

  it('maps multi-day working duration to calendar days when dates are missing', () => {
    expect(
      ganttDurationMinutes({
        ...tasks[0]!,
        earlyStart: null,
        earlyFinish: null,
        durationMinutes: 960,
      }),
    ).toBe(2 * 24 * 60);
  });

  it('converts snapped calendar days back to working minutes', () => {
    expect(calendarMinutesToWorking(24 * 60)).toBe(480);
    expect(calendarMinutesToWorking(3 * 24 * 60)).toBe(1440);
  });
});

describe('GanttPanel — Save as PNG', () => {
  beforeEach(() => {
    exportToPngDataUrl.mockClear();
    localStorage.clear();
  });

  it('exposes Day / Week / Month scale controls', async () => {
    const user = userEvent.setup();
    wrap(
      <GanttPanel
        project={project}
        tasks={tasks}
        dependencies={dependencies}
        onHoverTask={() => undefined}
      />,
    );

    expect(screen.getByTestId('gantt-scale-week')).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByTestId('gantt-scale-day'));
    expect(screen.getByTestId('gantt-scale-day')).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('project-scheduler.gantt.timeScale')).toBe('day');
  });

  it('exports the composited canvas and triggers a browser download', async () => {
    const user = userEvent.setup();
    const click = vi.fn();
    const remove = vi.fn();

    wrap(
      <GanttPanel
        project={project}
        tasks={tasks}
        dependencies={dependencies}
        onHoverTask={() => undefined}
      />,
    );

    const original = document.body.appendChild.bind(document.body);
    const appendChild = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      const el = node as HTMLAnchorElement;
      if (el.tagName === 'A') {
        el.click = click;
        el.remove = remove;
      }
      return original(node);
    });

    await user.click(screen.getByTestId('gantt-save-png'));

    expect(exportToPngDataUrl).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    const anchor = appendChild.mock.calls.find(
      (c) => (c[0] as HTMLElement).tagName === 'A',
    )?.[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('bridge-retrofit.png');

    appendChild.mockRestore();
  });
});

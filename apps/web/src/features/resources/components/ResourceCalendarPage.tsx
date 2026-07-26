import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';

import { ApiError } from '../../../lib/apiClient.js';
import { useErrorBanner } from '../../../stores/errorBanner.js';
import { useAssignmentsTimephasedMap } from '../../tasks/hooks/useAssignments.js';
import { useTaskTree } from '../../tasks/hooks/useTaskTree.js';
import {
  assignmentsForResource,
  contourVariesByDay,
  formatUnits,
  isAssignmentOverallocated,
  itemsOnDay,
  parseUnits,
  taskUtcSpan,
  type ResourceAssignmentItem,
} from '../resourceCalendar.js';
import { useResources } from '../hooks/useResources.js';
import { ResourceAssignmentEditor } from './ResourceAssignmentEditor.js';
import { ResourceCalendarMonth } from './ResourceCalendarMonth.js';
import { ResourceDayAllocationPanel } from './ResourceDayAllocationPanel.js';

const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function initialMonth(): { year: number; monthIndex: number } {
  const now = new Date();
  return { year: now.getUTCFullYear(), monthIndex: now.getUTCMonth() };
}

export function ResourceCalendarPage() {
  const { projectId, resourceId } = useParams({ strict: false }) as {
    projectId: string;
    resourceId: string;
  };
  const navigate = useNavigate();
  const showBanner = useErrorBanner((s) => s.show);

  const resourcesQuery = useResources(projectId);
  const taskTree = useTaskTree(projectId);

  const [{ year, monthIndex }, setMonth] = useState(initialMonth);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  useEffect(() => {
    const err = resourcesQuery.error ?? taskTree.error;
    if (!err) return;
    if (err instanceof ApiError || err instanceof Error) showBanner(err);
  }, [resourcesQuery.error, taskTree.error, showBanner]);

  const resources = resourcesQuery.data ?? [];
  const resource = resources.find((r) => r.id === resourceId) ?? null;
  const maxUnits = Math.max(parseUnits(resource?.maxUnits) || 1, 0.0001);

  const items = useMemo(() => {
    if (!taskTree.data) return [];
    return assignmentsForResource(taskTree.data.tasks, taskTree.data.assignments, resourceId);
  }, [taskTree.data, resourceId]);

  const assignmentIds = useMemo(() => items.map((i) => i.assignment.id), [items]);
  const contours = useAssignmentsTimephasedMap(assignmentIds);

  const selected = useMemo(
    () => items.find((i) => i.assignment.id === selectedId) ?? null,
    [items, selectedId],
  );

  // Drop selection when it no longer exists (deleted / resource switch).
  useEffect(() => {
    if (selectedId && !items.some((i) => i.assignment.id === selectedId)) {
      setSelectedId(null);
    }
  }, [items, selectedId]);

  const earliestStartKey = items[0] ? taskUtcSpan(items[0].task)?.start ?? '' : '';
  // When the resource (or its earliest task start) changes, jump to that month.
  useEffect(() => {
    if (!earliestStartKey) return;
    const [yRaw, mRaw] = earliestStartKey.split('-');
    const y = Number(yRaw);
    const m = Number(mRaw);
    if (!y || !m) return;
    setMonth((prev) => {
      if (prev.year === y && prev.monthIndex === m - 1) return prev;
      return { year: y, monthIndex: m - 1 };
    });
  }, [resourceId, earliestStartKey]);

  function shiftMonth(delta: number) {
    setMonth((prev) => {
      const d = new Date(Date.UTC(prev.year, prev.monthIndex + delta, 1));
      return { year: d.getUTCFullYear(), monthIndex: d.getUTCMonth() };
    });
  }

  function onSelectResource(nextId: string) {
    setSelectedId(null);
    setSelectedDayKey(null);
    void navigate({
      to: '/projects/$projectId/resources/$resourceId',
      params: { projectId, resourceId: nextId },
    });
  }

  function focusItem(item: ResourceAssignmentItem) {
    setSelectedDayKey(null);
    setSelectedId(item.assignment.id);
    const span = taskUtcSpan(item.task);
    if (!span) return;
    const [y, m] = span.start.split('-').map(Number);
    if (y && m) setMonth({ year: y, monthIndex: m - 1 });
  }

  function focusDay(dayKey: string) {
    setSelectedId(null);
    setSelectedDayKey(dayKey);
  }

  const dayItems = selectedDayKey ? itemsOnDay(items, selectedDayKey) : [];

  const loading = resourcesQuery.isLoading || taskTree.isLoading;

  return (
    <div className="page resource-calendar-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <Link to="/projects/$projectId/resources" params={{ projectId }}>
              ← Resources
            </Link>
          </p>
          <h1>Resource calendar</h1>
          <p className="lede muted">
            Click a day to set units for that day only, or a task chip for the whole
            assignment. Units snap to 0.05 steps.
          </p>
        </div>
        <label className="resource-cal-picker">
          <span className="muted">Resource</span>
          <select
            value={resourceId}
            onChange={(e) => onSelectResource(e.target.value)}
            disabled={loading || resources.length === 0}
            data-testid="resource-cal-picker"
          >
            {resources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      {loading ? <p className="muted">Loading calendar…</p> : null}

      {!loading && !resource ? (
        <div className="empty-state">
          <p>Resource not found in this workspace pool.</p>
          <Link to="/projects/$projectId/resources" params={{ projectId }}>
            Back to resources
          </Link>
        </div>
      ) : null}

      {!loading && resource ? (
        <div className="resource-cal-layout">
          <section className="resource-cal-main">
            <div className="resource-cal-toolbar">
              <div className="resource-cal-toolbar-left">
                <h2>{resource.name}</h2>
                <span className="muted">
                  {items.length} assignment{items.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="resource-cal-month-nav">
                <button
                  type="button"
                  className="btn-secondary"
                  aria-label="Previous month"
                  onClick={() => shiftMonth(-1)}
                >
                  ←
                </button>
                <div className="resource-cal-month-label" data-testid="resource-cal-month-label">
                  {MONTH_LABELS[monthIndex]} {year}
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  aria-label="Next month"
                  onClick={() => shiftMonth(1)}
                >
                  →
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setMonth(initialMonth())}
                >
                  Today
                </button>
              </div>
            </div>

            <ResourceCalendarMonth
              year={year}
              monthIndex={monthIndex}
              items={items}
              contours={contours}
              maxUnits={maxUnits}
              selectedAssignmentId={selectedId}
              selectedDayKey={selectedDayKey}
              onSelect={focusItem}
              onSelectDay={focusDay}
            />

            <div className="resource-cal-list" data-testid="resource-cal-list">
              <h3>Assigned tasks</h3>
              {items.length === 0 ? (
                <p className="muted">No tasks assigned to this resource in the project.</p>
              ) : (
                <ul>
                  {items.map((item) => {
                    const span = taskUtcSpan(item.task);
                    const contour = contours.get(item.assignment.id);
                    const varies = contourVariesByDay(contour);
                    const over = isAssignmentOverallocated(item, maxUnits);
                    return (
                      <li key={item.assignment.id}>
                        <button
                          type="button"
                          className={[
                            'resource-cal-list-item',
                            item.assignment.id === selectedId ? 'is-selected' : '',
                            over ? 'is-overallocated' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => focusItem(item)}
                        >
                          <span className="resource-cal-list-name">
                            {item.task.wbsCode ? (
                              <span className="mono muted">{item.task.wbsCode} </span>
                            ) : null}
                            {item.task.name}
                          </span>
                          <span
                            className={
                              over
                                ? 'resource-cal-list-meta is-overallocated'
                                : 'muted resource-cal-list-meta'
                            }
                          >
                            {span ? `${span.start} → ${span.finish}` : 'No dates'}
                            {' · '}
                            {varies
                              ? `peak ${formatUnits(item.assignment.units)} · varies by day`
                              : `${formatUnits(item.assignment.units)} units`}
                            {over ? ' · overallocated' : ''}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          {selectedDayKey ? (
            <ResourceDayAllocationPanel
              projectId={projectId}
              dayKey={selectedDayKey}
              items={dayItems}
              maxUnits={maxUnits}
              onClose={() => setSelectedDayKey(null)}
            />
          ) : selected ? (
            <ResourceAssignmentEditor
              projectId={projectId}
              item={selected}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <aside className="resource-cal-editor resource-cal-editor-empty">
              <p className="muted">
                Click a calendar day to edit that day’s units, or a task for the whole
                assignment.
              </p>
            </aside>
          )}
        </div>
      ) : null}
    </div>
  );
}

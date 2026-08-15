import type { ScheduleFilterState, ScheduleFocus, LookaheadWeeks } from '../scheduleFilters.js';
import { DEFAULT_SCHEDULE_FILTERS, isScheduleFilterActive } from '../scheduleFilters.js';

export interface ScheduleFilterResourceOption {
  readonly id: string;
  readonly name: string;
}

interface ScheduleFilterBarProps {
  readonly filters: ScheduleFilterState;
  readonly onChange: (next: ScheduleFilterState) => void;
  readonly resources: readonly ScheduleFilterResourceOption[];
  readonly visibleCount: number;
  readonly totalCount: number;
  readonly onLevelResources?: () => void;
  readonly onUpdateProgress?: () => void;
  readonly onImportSpreadsheet?: () => void;
}

export function ScheduleFilterBar({
  filters,
  onChange,
  resources,
  visibleCount,
  totalCount,
  onLevelResources,
  onUpdateProgress,
  onImportSpreadsheet,
}: ScheduleFilterBarProps) {
  const active = isScheduleFilterActive(filters);

  return (
    <div className="schedule-filter-bar" role="region" aria-label="Schedule filters">
      <label className="schedule-filter-field">
        <span>Focus</span>
        <select
          value={filters.focus}
          onChange={(e) =>
            onChange({ ...filters, focus: e.target.value as ScheduleFocus })
          }
          data-testid="schedule-focus"
        >
          <option value="all">All tasks</option>
          <option value="critical">Critical path</option>
          <option value="near_critical">Near-critical (≤1 day float)</option>
          <option value="lookahead">Lookahead window</option>
        </select>
      </label>

      {filters.focus === 'lookahead' ? (
        <label className="schedule-filter-field">
          <span>Window</span>
          <select
            value={String(filters.lookaheadWeeks)}
            onChange={(e) =>
              onChange({
                ...filters,
                lookaheadWeeks: Number(e.target.value) as LookaheadWeeks,
              })
            }
            data-testid="schedule-lookahead-weeks"
          >
            <option value="2">Next 2 weeks</option>
            <option value="4">Next 4 weeks</option>
            <option value="6">Next 6 weeks</option>
          </select>
        </label>
      ) : null}

      <label className="schedule-filter-field">
        <span>Resource</span>
        <select
          value={filters.resourceId ?? ''}
          onChange={(e) =>
            onChange({
              ...filters,
              resourceId: e.target.value === '' ? null : e.target.value,
            })
          }
          data-testid="schedule-resource-filter"
        >
          <option value="">Any resource</option>
          {resources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>

      <p className="schedule-filter-count muted" data-testid="schedule-filter-count">
        {active ? `Showing ${visibleCount} of ${totalCount}` : `${totalCount} tasks`}
      </p>

      {active ? (
        <button
          type="button"
          className="btn-link"
          onClick={() => onChange(DEFAULT_SCHEDULE_FILTERS)}
          data-testid="schedule-filter-clear"
        >
          Clear filters
        </button>
      ) : null}

      {onImportSpreadsheet ? (
        <button
          type="button"
          className="btn-secondary schedule-level-btn"
          onClick={onImportSpreadsheet}
          data-testid="schedule-import-spreadsheet"
        >
          Import
        </button>
      ) : null}

      {onUpdateProgress ? (
        <button
          type="button"
          className="btn-secondary schedule-level-btn"
          onClick={onUpdateProgress}
          data-testid="schedule-update-progress"
        >
          Update progress
        </button>
      ) : null}

      {onLevelResources ? (
        <button
          type="button"
          className="btn-secondary schedule-level-btn"
          onClick={onLevelResources}
          data-testid="schedule-level-resources"
        >
          Level resources
        </button>
      ) : null}
    </div>
  );
}

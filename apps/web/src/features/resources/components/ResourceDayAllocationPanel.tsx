import { useEffect, useMemo, useState } from 'react';

import {
  useAssignmentTimephased,
  useUpdateTimephasedDay,
} from '../../tasks/hooks/useAssignments.js';
import {
  dayUnitsFromMinutes,
  formatUnits,
  normalizePeriodDate,
  roundUnits,
  type ResourceAssignmentItem,
} from '../resourceCalendar.js';

const UNIT_PRESETS = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export interface ResourceDayAllocationPanelProps {
  readonly projectId: string;
  readonly dayKey: string;
  readonly items: readonly ResourceAssignmentItem[];
  readonly maxUnits: number;
  readonly onClose: () => void;
}

function DayRow({
  projectId,
  dayKey,
  item,
  maxUnits,
}: {
  readonly projectId: string;
  readonly dayKey: string;
  readonly item: ResourceAssignmentItem;
  readonly maxUnits: number;
}) {
  const timephased = useAssignmentTimephased(item.assignment.id, true);
  const updateDay = useUpdateTimephasedDay(projectId);

  const bucketMinutes = useMemo(() => {
    if (!timephased.data) return null;
    const row = timephased.data.find((b) => normalizePeriodDate(b.periodDate) === dayKey);
    // Contour loaded: missing day means 0 for this day (not the flat assignment units).
    return row?.plannedWorkMinutes ?? 0;
  }, [timephased.data, dayKey]);

  const loadedUnits =
    bucketMinutes == null && timephased.isLoading
      ? null
      : dayUnitsFromMinutes(bucketMinutes ?? 0);

  const [units, setUnits] = useState(loadedUnits == null ? '' : String(loadedUnits));

  useEffect(() => {
    if (loadedUnits == null) return;
    setUnits(String(loadedUnits));
  }, [loadedUnits, item.assignment.id, dayKey]);

  async function save(next: number) {
    const snapped = roundUnits(Math.max(0, next));
    setUnits(String(snapped));
    try {
      await updateDay.mutateAsync({
        assignmentId: item.assignment.id,
        periodDate: dayKey,
        units: snapped,
      });
    } catch {
      // Banner via hook.
    }
  }

  const numeric = Number(units);
  const over = Number.isFinite(numeric) && numeric > maxUnits;

  return (
    <div
      className={over ? 'resource-day-row is-overallocated' : 'resource-day-row'}
      data-testid={`resource-day-row-${item.assignment.id}`}
    >
      <div className="resource-day-row-head">
        <strong>{item.task.name}</strong>
        {item.task.wbsCode ? <span className="mono muted">{item.task.wbsCode}</span> : null}
      </div>
      <label className="resource-day-units-label">
        Units on {dayKey} only
        <input
          type="number"
          min="0"
          step="0.05"
          value={units}
          disabled={updateDay.isPending || timephased.isLoading || loadedUnits == null}
          onChange={(e) => setUnits(e.target.value)}
          onBlur={() => {
            const n = Number(units);
            if (!Number.isFinite(n) || n < 0 || loadedUnits == null) {
              if (loadedUnits != null) setUnits(String(loadedUnits));
              return;
            }
            if (roundUnits(n) !== loadedUnits) void save(n);
          }}
          data-testid={`resource-day-units-${item.assignment.id}`}
        />
      </label>
      <div className="resource-day-presets" role="group" aria-label="Quick units">
        {UNIT_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={
              roundUnits(Number(units)) === preset
                ? 'resource-day-preset is-active'
                : 'resource-day-preset'
            }
            disabled={updateDay.isPending || loadedUnits == null}
            onClick={() => void save(preset)}
          >
            {formatUnits(preset)}
          </button>
        ))}
      </div>
      {over ? <p className="resource-day-over-hint">Above max units ({formatUnits(maxUnits)})</p> : null}
    </div>
  );
}

/**
 * Edit per-day work allocation for every assignment active on `dayKey`.
 * Does not change the task duration — only that day's planned contour.
 */
export function ResourceDayAllocationPanel({
  projectId,
  dayKey,
  items,
  maxUnits,
  onClose,
}: ResourceDayAllocationPanelProps) {
  return (
    <aside className="resource-cal-editor" data-testid="resource-day-allocation">
      <header className="resource-cal-editor-header">
        <div>
          <p className="eyebrow">Day allocation</p>
          <h2>{dayKey}</h2>
          <p className="muted">
            Changes apply to this calendar day only. Other days on the same task keep their own
            units.
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={onClose}>
          Close
        </button>
      </header>

      {items.length === 0 ? (
        <p className="muted">No assigned tasks on this day.</p>
      ) : (
        <div className="resource-day-rows">
          {items.map((item) => (
            <DayRow
              key={`${item.assignment.id}:${dayKey}`}
              projectId={projectId}
              dayKey={dayKey}
              item={item}
              maxUnits={maxUnits}
            />
          ))}
        </div>
      )}
    </aside>
  );
}

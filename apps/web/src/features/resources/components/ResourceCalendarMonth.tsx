import {
  formatUnits,
  isDayOverallocated,
  itemsOnDay,
  monthGridCells,
  taskAccent,
  unitsOnDay,
  type ResourceAssignmentItem,
  type TimephasedBucketView,
} from '../resourceCalendar.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MAX_CHIPS = 3;

export interface ResourceCalendarMonthProps {
  readonly year: number;
  readonly monthIndex: number;
  readonly items: readonly ResourceAssignmentItem[];
  readonly contours: ReadonlyMap<string, readonly TimephasedBucketView[]>;
  readonly maxUnits?: number;
  readonly selectedAssignmentId: string | null;
  readonly selectedDayKey: string | null;
  readonly onSelect: (item: ResourceAssignmentItem) => void;
  readonly onSelectDay: (dayKey: string) => void;
}

export function ResourceCalendarMonth({
  year,
  monthIndex,
  items,
  contours,
  maxUnits = 1,
  selectedAssignmentId,
  selectedDayKey,
  onSelect,
  onSelectDay,
}: ResourceCalendarMonthProps) {
  const cells = monthGridCells(year, monthIndex);
  const todayKey = new Date().toISOString().slice(0, 10);

  return (
    <div className="resource-cal-month" data-testid="resource-calendar-month">
      <div className="resource-cal-weekdays" aria-hidden="true">
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="resource-cal-grid">
        {cells.map((cell, idx) => {
          if (!cell) {
            return <div key={`pad-${idx}`} className="resource-cal-cell is-pad" />;
          }
          const dayItems = itemsOnDay(items, cell.dayKey);
          const overflow = Math.max(0, dayItems.length - MAX_CHIPS);
          const dayOver = isDayOverallocated(items, cell.dayKey, maxUnits, contours);
          const cellClass = [
            'resource-cal-cell',
            cell.dayKey === todayKey ? 'is-today' : '',
            dayOver ? 'is-overallocated' : '',
            cell.dayKey === selectedDayKey ? 'is-day-selected' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <div
              key={cell.dayKey}
              className={cellClass}
              data-day={cell.dayKey}
              role="button"
              tabIndex={0}
              onClick={() => onSelectDay(cell.dayKey)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectDay(cell.dayKey);
                }
              }}
            >
              <div className="resource-cal-daynum">{cell.day}</div>
              <div className="resource-cal-chips">
                {dayItems.slice(0, MAX_CHIPS).map((item) => {
                  const selected = item.assignment.id === selectedAssignmentId;
                  const dayUnits = unitsOnDay(item, cell.dayKey, contours.get(item.assignment.id));
                  const over = dayUnits > maxUnits || dayOver;
                  return (
                    <button
                      key={item.assignment.id}
                      type="button"
                      className={[
                        'resource-cal-chip',
                        selected ? 'is-selected' : '',
                        over ? 'is-overallocated' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={
                        over
                          ? undefined
                          : {
                              borderLeftColor: item.task.isCritical
                                ? '#b91c1c'
                                : taskAccent(item.task.id),
                            }
                      }
                      title={`${item.task.name} — ${formatUnits(dayUnits)} units on ${cell.dayKey}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(item);
                      }}
                    >
                      <span className="resource-cal-chip-name">
                        {item.task.name}
                        <span className="resource-cal-chip-units"> {formatUnits(dayUnits)}</span>
                      </span>
                    </button>
                  );
                })}
                {overflow > 0 ? (
                  <div className="resource-cal-more">+{overflow} more</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { TaskEditPatch, TaskRow } from '../types.js';

/** `YYYY-MM-DD` for pickers, from an ISO timestamp (UTC calendar day). */
export function isoToDateInputValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/**
 * Build a constraint ISO timestamp from a date-picker day.
 * Keeps the UTC time-of-day from `timeTemplateIso` when present (so a start
 * edit preserves 09:00 rather than snapping to midnight); otherwise 09:00Z
 * for starts and 17:00Z for finishes — matching the default working day.
 */
export function dateInputToConstraintIso(
  dateValue: string,
  timeTemplateIso: string | null,
  fallbackMinuteOfDay: number,
): string {
  const [yRaw, mRaw, dRaw] = dateValue.split('-');
  const y = Number(yRaw);
  const m = Number(mRaw);
  const day = Number(dRaw);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(day)) {
    throw new RangeError(`Invalid date value: ${dateValue}`);
  }
  let minuteOfDay = fallbackMinuteOfDay;
  if (timeTemplateIso) {
    const t = new Date(timeTemplateIso);
    if (!Number.isNaN(t.getTime())) {
      minuteOfDay = t.getUTCHours() * 60 + t.getUTCMinutes();
    }
  }
  const ms = Date.UTC(y, m - 1, day) + minuteOfDay * 60_000;
  return new Date(ms).toISOString();
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatYmd(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

function parseYmd(value: string): { year: number; monthIndex: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  const day = Number(m[3]);
  if (!Number.isFinite(year) || monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) {
    return null;
  }
  return { year, monthIndex, day };
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;
const MONTHS = [
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

function buildMonthGrid(year: number, monthIndex: number): Array<number | null> {
  // Monday-first grid to match the default working week.
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const firstWeekday = (first.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const cells: Array<number | null> = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function DayPickerPopover({
  value,
  labelledBy,
  anchor,
  onSelect,
  onClose,
}: {
  value: string;
  labelledBy: string;
  anchor: DOMRect;
  onSelect: (ymd: string) => void;
  onClose: () => void;
}) {
  const parsed = parseYmd(value);
  const initial = parsed ?? {
    year: new Date().getUTCFullYear(),
    monthIndex: new Date().getUTCMonth(),
    day: new Date().getUTCDate(),
  };
  const [year, setYear] = useState(initial.year);
  const [monthIndex, setMonthIndex] = useState(initial.monthIndex);
  const rootRef = useRef<HTMLDivElement>(null);

  const cells = useMemo(() => buildMonthGrid(year, monthIndex), [year, monthIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onPointer = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) onClose();
    };
    window.addEventListener('keydown', onKey);
    // Defer so the opening click does not immediately close the popover.
    const timer = window.setTimeout(() => {
      window.addEventListener('mousedown', onPointer);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointer);
    };
  }, [onClose]);

  const shiftMonth = (delta: number) => {
    const d = new Date(Date.UTC(year, monthIndex + delta, 1));
    setYear(d.getUTCFullYear());
    setMonthIndex(d.getUTCMonth());
  };

  const top = Math.min(anchor.bottom + 4, window.innerHeight - 320);
  const left = Math.min(Math.max(8, anchor.left), window.innerWidth - 280);

  return createPortal(
    <div
      ref={rootRef}
      className="day-picker-popover"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      style={{ top, left }}
    >
      <div className="day-picker-header">
        <button type="button" className="day-picker-nav" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
          ‹
        </button>
        <div className="day-picker-title">
          {MONTHS[monthIndex]} {year}
        </div>
        <button type="button" className="day-picker-nav" aria-label="Next month" onClick={() => shiftMonth(1)}>
          ›
        </button>
      </div>
      <div className="day-picker-weekdays" aria-hidden="true">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="day-picker-grid">
        {cells.map((day, idx) => {
          if (day === null) {
            return <span key={`e-${idx}`} className="day-picker-empty" />;
          }
          const ymd = formatYmd(year, monthIndex, day);
          const selected = ymd === value;
          return (
            <button
              key={ymd}
              type="button"
              className={selected ? 'day-picker-day is-selected' : 'day-picker-day'}
              aria-label={ymd}
              aria-pressed={selected}
              onClick={() => onSelect(ymd)}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}

export function DateCell({
  task,
  kind,
  onCommit,
  displayLabel,
}: {
  task: TaskRow;
  kind: 'start' | 'finish';
  onCommit: (patch: TaskEditPatch) => void;
  /** Pre-formatted label from project date settings. */
  displayLabel: string;
}) {
  const iso = kind === 'start' ? task.earlyStart : task.earlyFinish;
  const value = isoToDateInputValue(iso);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const labelId = useId();
  const close = useCallback(() => setOpen(false), []);

  const commitValue = (next: string) => {
    const previous = isoToDateInputValue(iso);
    if (next === previous) return;

    if (next === '') {
      if (
        (task.constraintType === null || task.constraintType === 'asap') &&
        task.constraintDate === null
      ) {
        return;
      }
      onCommit({
        taskId: task.id,
        version: task.version,
        constraintType: 'asap',
        constraintDate: null,
      });
      return;
    }

    const fallbackMinute = kind === 'start' ? 9 * 60 : 17 * 60;
    let constraintDate: string;
    try {
      constraintDate = dateInputToConstraintIso(next, iso, fallbackMinute);
    } catch {
      return;
    }

    onCommit({
      taskId: task.id,
      version: task.version,
      constraintType: kind === 'start' ? 'mso' : 'mfo',
      constraintDate,
    });
  };

  // Agile dates come from the sprint, not CPM constraints — editing would
  // PATCH constraintType and the API correctly rejects that.
  if (task.schedulingMode === 'agile') {
    return (
      <span className="mono muted" title="Agile tasks use sprint dates, not CPM constraints">
        {displayLabel || '—'}
      </span>
    );
  }

  const label =
    kind === 'start'
      ? `Edit start date for ${task.wbsCode ?? task.id}`
      : `Edit finish date for ${task.wbsCode ?? task.id}`;

  return (
    <div className="date-cell">
      <button
        ref={buttonRef}
        id={labelId}
        type="button"
        className="cell-edit-trigger cell-date-trigger mono"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          const rect = buttonRef.current?.getBoundingClientRect() ?? null;
          setAnchor(rect);
          setOpen((v) => !v);
        }}
      >
        {displayLabel || '—'}
      </button>
      {open && anchor
        ? (
            <DayPickerPopover
              value={value}
              labelledBy={labelId}
              anchor={anchor}
              onClose={close}
              onSelect={(ymd) => {
                close();
                commitValue(ymd);
              }}
            />
          )
        : null}
    </div>
  );
}

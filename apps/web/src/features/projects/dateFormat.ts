import {
  DEFAULT_PROJECT_SETTINGS,
  normalizeProjectSettings,
  type DateFormat,
  type DateTimeDisplay,
  type ProjectSettings,
} from '@pkg/schema';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function utcParts(iso: string): { y: number; m: number; d: number; hh: number; mm: number } | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return {
    y: date.getUTCFullYear(),
    m: date.getUTCMonth(),
    d: date.getUTCDate(),
    hh: date.getUTCHours(),
    mm: date.getUTCMinutes(),
  };
}

function formatDateOnly(parts: { y: number; m: number; d: number }, format: DateFormat): string {
  const yyyy = String(parts.y);
  const mm = pad2(parts.m + 1);
  const dd = pad2(parts.d);
  switch (format) {
    case 'yyyy-mm-dd':
      return `${yyyy}-${mm}-${dd}`;
    case 'dd-mmm-yyyy':
      return `${dd}-${MONTHS[parts.m]}-${yyyy}`;
    case 'mm/dd/yyyy':
      return `${mm}/${dd}/${yyyy}`;
    case 'dd/mm/yyyy':
      return `${dd}/${mm}/${yyyy}`;
    case 'locale-short':
      return new Date(Date.UTC(parts.y, parts.m, parts.d)).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      });
    case 'locale-medium':
      return new Date(Date.UTC(parts.y, parts.m, parts.d)).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      });
    default:
      return `${yyyy}-${mm}-${dd}`;
  }
}

export function projectSettingsOf(raw: unknown): ProjectSettings {
  return normalizeProjectSettings(raw ?? DEFAULT_PROJECT_SETTINGS);
}

/**
 * Format an ISO timestamp for project UI using project settings.
 * Empty / invalid → em dash.
 */
export function formatProjectDate(
  iso: string | null | undefined,
  settings: Pick<ProjectSettings, 'dateFormat' | 'dateTimeDisplay'> | null | undefined,
  forceDisplay?: DateTimeDisplay,
): string {
  if (!iso) return '—';
  const parts = utcParts(iso);
  if (!parts) return '—';
  const cfg = settings ?? DEFAULT_PROJECT_SETTINGS;
  const display = forceDisplay ?? cfg.dateTimeDisplay;
  const datePart = formatDateOnly(parts, cfg.dateFormat);
  if (display === 'date') return datePart;
  return `${datePart} ${pad2(parts.hh)}:${pad2(parts.mm)}`;
}

/** `YYYY-MM-DD` for `<input type="date">` (always ISO calendar day, UTC). */
export function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const parts = utcParts(iso);
  if (!parts) return '';
  return `${parts.y}-${pad2(parts.m + 1)}-${pad2(parts.d)}`;
}

/** Build ISO midnight UTC from a date-input value. */
export function dateInputToIso(dateValue: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return null;
  return `${dateValue}T00:00:00.000Z`;
}

export const DATE_FORMAT_OPTIONS: ReadonlyArray<{ value: DateFormat; label: string }> = [
  { value: 'yyyy-mm-dd', label: '2026-07-24 (ISO)' },
  { value: 'dd-mmm-yyyy', label: '24-Jul-2026' },
  { value: 'dd/mm/yyyy', label: '24/07/2026' },
  { value: 'mm/dd/yyyy', label: '07/24/2026' },
  { value: 'locale-short', label: 'Browser short (e.g. Jul 24, 2026)' },
  { value: 'locale-medium', label: 'Browser long (e.g. July 24, 2026)' },
];

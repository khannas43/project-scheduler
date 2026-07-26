import { HEADER_HEIGHT, MINUTES_PER_DAY, PIXELS_PER_DAY } from '../constants.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
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

export interface TimeHeaderDrawInput {
  readonly ctx: CanvasRenderingContext2D;
  readonly width: number;
  readonly height?: number;
  readonly scrollLeft: number;
  readonly pixelsPerMinute?: number;
  /** UTC ms for day index 0 (project start). Defaults to Unix epoch UTC. */
  readonly originUtcMs?: number;
}

/** How many calendar days between major ticks, based on zoom. */
export function tickStepDays(dayWidthPx: number): number {
  if (dayWidthPx >= 28) return 1;
  if (dayWidthPx >= 12) return 7;
  if (dayWidthPx >= 5) return 14;
  return 30;
}

export function dayIndexToUtcDate(dayIndex: number, originUtcMs: number): Date {
  return new Date(originUtcMs + dayIndex * MINUTES_PER_DAY * 60_000);
}

/** Label for a tick at the given day index. */
export function formatTickLabel(dayIndex: number, originUtcMs: number, dayWidthPx: number): string {
  const date = dayIndexToUtcDate(dayIndex, originUtcMs);
  const day = date.getUTCDate();
  const month = MONTHS[date.getUTCMonth()] ?? '';
  const weekday = WEEKDAYS[date.getUTCDay()] ?? '';

  if (dayWidthPx >= 48) {
    return `${weekday} ${day}`;
  }
  if (dayWidthPx >= 28) {
    return day === 1 ? `${month} ${day}` : String(day);
  }
  if (dayWidthPx >= 12) {
    // Weekly ticks — prefer Monday / month starts.
    if (day === 1) return `${month} ${day}`;
    return `${month} ${day}`;
  }
  // Coarse zoom — month labels.
  if (day === 1) return `${month} ${date.getUTCFullYear()}`;
  return `${month} ${day}`;
}

/**
 * Sticky timescale header above the chart — day / week / month labels that
 * scroll with `scrollLeft`.
 */
export function drawTimeHeader(input: TimeHeaderDrawInput): void {
  const { ctx, width, scrollLeft } = input;
  const height = input.height ?? HEADER_HEIGHT;
  const ppm = input.pixelsPerMinute ?? PIXELS_PER_DAY / MINUTES_PER_DAY;
  const originUtcMs = input.originUtcMs ?? 0;
  const dayWidth = MINUTES_PER_DAY * ppm;
  const step = tickStepDays(dayWidth);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#f3efe6';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#d5d0c4';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height - 0.5);
  ctx.lineTo(width, height - 0.5);
  ctx.stroke();

  const firstDay = Math.floor(scrollLeft / dayWidth) - 1;
  const lastDay = Math.ceil((scrollLeft + width) / dayWidth) + 1;

  // Align first drawn tick to the step grid (and always include day 0).
  const startTick = Math.floor(firstDay / step) * step;

  ctx.fillStyle = '#5c564c';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  for (let d = startTick; d <= lastDay; d += step) {
    const x = d * dayWidth - scrollLeft;
    if (x > width + dayWidth) break;

    ctx.strokeStyle = '#d5d0c4';
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, height - 8);
    ctx.lineTo(Math.round(x) + 0.5, height);
    ctx.stroke();

    const label = formatTickLabel(d, originUtcMs, dayWidth);
    const labelX = Math.round(x) + 4;
    if (labelX > -40 && labelX < width) {
      ctx.fillText(label, labelX, height / 2);
    }
  }
}

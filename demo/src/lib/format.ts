import type {Zdt} from './rule';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string, options: Intl.DateTimeFormatOptions, locale?: string): Intl.DateTimeFormat {
  const key = `${locale ?? ''}|${timeZone}|${JSON.stringify(options)}`;
  let cached = formatters.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat(locale, {...options, timeZone});
    formatters.set(key, cached);
  }
  return cached;
}

export const formatMonth = (ms: number, zone: string) => formatter(zone, {month: 'long', year: 'numeric'}).format(ms);
export const formatWeekday = (ms: number, zone: string) => formatter(zone, {weekday: 'short'}).format(ms);
export const formatMonthDay = (ms: number, zone: string) =>
  formatter(zone, {month: 'short', day: 'numeric'}).format(ms);
export const formatDate = (ms: number, zone: string) =>
  formatter(zone, {weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'}).format(ms);

export const formatShortDate = (ms: number, zone: string) =>
  formatter(zone, {month: 'short', day: 'numeric', year: 'numeric'}).format(ms);

export function formatTime(ms: number, zone: string, seconds = false): string {
  return formatter(zone, {hour: 'numeric', minute: '2-digit', ...(seconds ? {second: '2-digit'} : {})}).format(ms);
}

export function formatDateTime(ms: number, zone: string, seconds = false): string {
  return `${formatDate(ms, zone)}, ${formatTime(ms, zone, seconds)}`;
}

/** Short zone name such as "EDT", or "GMT+11" where no abbreviation exists. */
export function formatZoneName(ms: number, zone: string): string {
  const parts = formatter(zone, {timeZoneName: 'short'}).formatToParts(ms);
  return parts.find((part) => part.type === 'timeZoneName')?.value ?? zone;
}

/** The date in a non-Gregorian calendar, e.g. "25 Kislev 5787". */
export function formatCalendarDate(ms: number, zone: string, calendar: string): string {
  return formatter(zone, {calendar, day: 'numeric', month: 'long', year: 'numeric'}, 'en').format(ms);
}

export function formatOffset(date: Zdt, zone: string): string {
  const offset = date.withTimeZone(zone).offset;
  return offset === '+00:00' ? 'UTC' : `UTC${offset.replace('-', '−')}`;
}

/** Exact elapsed time, so DST shows up as 23- or 25-hour days. */
export function formatGap(ms: number): string {
  if (ms < 60_000) return `+${Math.round(ms / 1000)} s`;
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `+${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const extraMinutes = minutes % 60;
  if (hours < 24) return extraMinutes ? `+${hours} h ${extraMinutes} min` : `+${hours} h`;
  const days = Math.floor(hours / 24);
  const extraHours = hours % 24;
  const dayLabel = `+${days.toLocaleString()} d`;
  const parts = [dayLabel, extraHours ? `${extraHours} h` : '', extraMinutes ? `${extraMinutes} min` : ''];
  return parts.filter(Boolean).join(' ');
}

export function formatMilliseconds(ms: number): string {
  if (ms < 1) return `${ms.toFixed(2)} ms`;
  if (ms < 100) return `${ms.toFixed(1)} ms`;
  return `${Math.round(ms).toLocaleString()} ms`;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** Value for <input type="date">. */
export const toDateInput = (date: Zdt) => `${String(date.year).padStart(4, '0')}-${pad(date.month)}-${pad(date.day)}`;
/** Value for <input type="time" step="1">. */
export const toTimeInput = (date: Zdt) => `${pad(date.hour)}:${pad(date.minute)}:${pad(date.second)}`;
/** Value for <input type="datetime-local">. */
export const toDateTimeInput = (date: Zdt) => `${toDateInput(date)}T${pad(date.hour)}:${pad(date.minute)}`;

import {Temporal, isNativeTemporal, PolyfillTemporal} from './temporal-impl';
import type {Temporal as TemporalSpec} from 'temporal-spec';
import {getZoneOffsetResolver, type ZoneOffsetResolver} from './tz-offset';

export const allowedFreq = ['YEARLY', 'MONTHLY', 'WEEKLY', 'DAILY', 'HOURLY', 'MINUTELY', 'SECONDLY'] as const;
export type Freq = (typeof allowedFreq)[number];

export const allowedWeekdays = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
export type Weekday = (typeof allowedWeekdays)[number];

export const weekdayToIsoDay: Record<Weekday, number> = {
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
  SU: 7,
};

const allowedFreqSet = new Set<string>(allowedFreq);
const allowedWeekdaysSet = new Set<string>(allowedWeekdays);
const byDayTokenRegex = new RegExp(`^([+-]?\\d{1,2})?(${allowedWeekdays.join('|')})$`);
const byDayWeekdaySuffixRegex = new RegExp(`(${allowedWeekdays.join('|')})$`);
const MS_PER_SECOND = 1_000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const MS_PER_WEEK = 7 * MS_PER_DAY;
const GREGORIAN_MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
const GREGORIAN_WEEKDAY_OFFSETS = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4] as const;
const NS_PER_MILLISECOND = BigInt(1_000_000);
const NS_PER_SECOND = BigInt(1_000_000_000);
const NS_PER_MINUTE = BigInt(60) * NS_PER_SECOND;
const NS_PER_HOUR = BigInt(60) * NS_PER_MINUTE;
const NS_PER_DAY = BigInt(24) * NS_PER_HOUR;
const NS_PER_WEEK = BigInt(7) * NS_PER_DAY;
const TEMPORAL_MAX_EPOCH_MILLISECONDS = 8_640_000_000_000_000;

type NumericQueryResult<T> = {handled: true; value: T} | {handled: false};

interface NumericCandidate {
  epochMilliseconds: number;
  periodIndex: number;
  occurrenceIndex: number;
}

interface NumericQueryPlan {
  readonly kind: 'fixed-step' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  /** Number of RRULE occurrences after applying COUNT and inclusive UNTIL. */
  readonly count: number;
  /** Original COUNT before an optional UNTIL shortens the sequence. */
  readonly maximumCount: number;
  /** Select from the COUNT-bounded sequence, including the first item past UNTIL. */
  select(index: number): NumericCandidate | null;
  /** First occurrence index whose instant is >= target, or > target when strict. */
  lowerBound(targetEpochNanoseconds: bigint, strict: boolean): number;
}

interface CandidateWorkBudget {
  evaluated: number;
  seenOccurrences: Set<bigint>;
}

function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a;
}

function weekdayMask(days: readonly number[] | undefined): number {
  let mask = 0;
  for (const day of days ?? []) {
    mask |= 1 << (day - 1);
  }
  return mask;
}

function includesIsoWeekday(mask: number, day: number): boolean {
  return mask === 0 || (mask & (1 << (day - 1))) !== 0;
}

function floorDivBigInt(dividend: bigint, divisor: bigint): bigint {
  const quotient = dividend / divisor;
  const remainder = dividend % divisor;
  return remainder < 0n ? quotient - 1n : quotient;
}

function ceilDivBigInt(dividend: bigint, divisor: bigint): bigint {
  return -floorDivBigInt(-dividend, divisor);
}

function isSafeTemporalEpochMilliseconds(value: number): boolean {
  return (
    Number.isSafeInteger(value) && value >= -TEMPORAL_MAX_EPOCH_MILLISECONDS && value <= TEMPORAL_MAX_EPOCH_MILLISECONDS
  );
}

/** Proleptic Gregorian day number where 1970-01-01 is zero. */
function gregorianEpochDay(year: number, month: number, day: number): number {
  const adjustedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const adjustedMonth = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * adjustedMonth + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
}

function isoDayOfWeekOfEpochDay(epochDay: number): number {
  // 1970-01-01 was a Thursday (ISO day 4).
  return ((((epochDay + 3) % 7) + 7) % 7) + 1;
}

function addIsoDays(dayOfWeek: number, deltaDays: number): number {
  return ((dayOfWeek - 1 + (deltaDays % 7) + 7) % 7) + 1;
}

function extractWeekdayToken(token: string): Weekday | null {
  const m = token.toUpperCase().match(byDayWeekdaySuffixRegex);
  const weekday = m?.[1];
  if (!weekday || !allowedWeekdaysSet.has(weekday)) return null;
  return weekday as Weekday;
}

function parseByDayToken(token: string): {ord: number; weekday: Weekday} | null {
  const m = token.toUpperCase().match(byDayTokenRegex);
  if (!m) return null;
  const ord = m[1] ? parseInt(m[1], 10) : 0;
  const weekday = m[2];
  if (!weekday || !allowedWeekdaysSet.has(weekday)) return null;
  return {ord, weekday: weekday as Weekday};
}

/**
 * Shared options for all rule constructors.
 */
interface BaseOpts<TOutput extends TemporalZonedDateTimeInput = TemporalZonedDateTime> {
  /** Temporal implementation used to construct public occurrence values. */
  temporal?: TemporalImplementation<TOutput>;
  /** Time zone identifier as defined in RFC&nbsp;5545 §3.2.19. */
  tzid?: string;
  /** Safety cap for advancing outer recurrence periods. */
  maxIterations?: number;
  /** Safety cap for candidate datetimes evaluated inside recurrence periods. */
  maxCandidateEvaluations?: number;
  /** Include DTSTART as an occurrence even if it does not match the rule pattern. */
  includeDtstart?: boolean;
  /** Enforce RFC 5545 constraints strictly (defaults to false). */
  strict?: boolean;
  /** RSCALE per RFC 7529: calendar system for recurrence generation (e.g., GREGORIAN). */
  rscale?: string;
  /** SKIP behavior per RFC 7529: OMIT (default), BACKWARD, FORWARD (requires RSCALE). */
  skip?: 'OMIT' | 'BACKWARD' | 'FORWARD';
  /** Memoize the full occurrence list computed by all() (defaults to true). */
  cache?: boolean;
}

export type TemporalZonedDateTime = TemporalSpec.ZonedDateTime;
export type TemporalPlainDate = TemporalSpec.PlainDate;

export interface TemporalZonedDateTimeInput {
  readonly timeZoneId: string;
  toString(): string;
}

export interface TemporalPlainDateInput {
  toString(): string;
}

/**
 * The subset of a Temporal namespace needed to construct public occurrence
 * values. Supplying an implementation makes output values and their inferred
 * TypeScript types come from that implementation.
 */
export interface TemporalImplementation<TOutput extends TemporalZonedDateTimeInput = TemporalZonedDateTime> {
  readonly ZonedDateTime: {
    from(value: string): TOutput;
  };
}

type PolyfillZonedDateTime = Temporal.ZonedDateTime;
export type RRuleTemporalIterator<TOutput extends TemporalZonedDateTimeInput = TemporalZonedDateTime> = (
  date: TOutput,
  i: number,
) => boolean;
type InternalRRuleTemporalIterator = (date: PolyfillZonedDateTime, i: number) => boolean;
export type DateFilter = Date | TemporalZonedDateTimeInput;

function isTemporalZonedDateTimeInput(value: unknown): value is TemporalZonedDateTimeInput {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as {timeZoneId?: unknown}).timeZoneId === 'string' &&
    typeof (value as {toString?: unknown}).toString === 'function'
  );
}

function zonedDateTimeEpochNanoseconds(value: TemporalZonedDateTimeInput): bigint | undefined {
  const epochNanoseconds = (value as TemporalZonedDateTimeInput & {readonly epochNanoseconds?: unknown})
    .epochNanoseconds;
  return typeof epochNanoseconds === 'bigint' ? epochNanoseconds : undefined;
}

function normalizeZonedDateTime(value: TemporalZonedDateTimeInput, label: string): PolyfillZonedDateTime {
  if (!isTemporalZonedDateTimeInput(value)) {
    throw new Error(`${label} must be a ZonedDateTime`);
  }

  try {
    const epochNanoseconds = zonedDateTimeEpochNanoseconds(value);
    if (epochNanoseconds !== undefined) {
      const calendarId = (value as TemporalZonedDateTimeInput & {readonly calendarId?: unknown}).calendarId;
      return new Temporal.ZonedDateTime(
        epochNanoseconds,
        value.timeZoneId,
        typeof calendarId === 'string' ? calendarId : 'iso8601',
      );
    }
    return Temporal.ZonedDateTime.from(value.toString());
  } catch {
    throw new Error(`${label} must be a ZonedDateTime`);
  }
}

function dateFilterEpochNanoseconds(value: DateFilter, label: string): bigint {
  if (value instanceof Date) {
    const epochMilliseconds = value.getTime();
    if (!Number.isFinite(epochMilliseconds)) {
      // Preserve Date's established invalid-value error rather than silently
      // turning it into an arbitrary instant.
      value.toISOString();
    }
    return BigInt(epochMilliseconds) * NS_PER_MILLISECOND;
  }

  if (!isTemporalZonedDateTimeInput(value)) {
    throw new Error(`${label} must be a ZonedDateTime`);
  }
  return zonedDateTimeEpochNanoseconds(value) ?? normalizeZonedDateTime(value, label).epochNanoseconds;
}

function normalizeZonedDateTimeList(
  values: TemporalZonedDateTimeInput[] | undefined,
  label: string,
): PolyfillZonedDateTime[] | undefined {
  if (!values?.length) return undefined;
  return values.map((value) => normalizeZonedDateTime(value, label));
}

/**
 * Manual rule definition following the recurrence rule parts defined in
 * RFC 5545 §3.3.10.
 */
interface ManualOptions<TOutput extends TemporalZonedDateTimeInput = TemporalZonedDateTime> extends BaseOpts<TOutput> {
  /** FREQ: recurrence frequency */
  freq: Freq;
  /** INTERVAL between each occurrence of {@link freq} */
  interval?: number;
  /** COUNT: total number of occurrences */
  count?: number;
  /** UNTIL: last possible occurrence */
  until?: TemporalZonedDateTimeInput;
  /** BYHOUR: hours to include (0-23) */
  byHour?: number[];
  /** BYMINUTE: minutes to include (0-59) */
  byMinute?: number[];
  /** BYSECOND: seconds to include (0-59) */
  bySecond?: number[];
  /** BYDAY: list of weekdays e.g. ["MO","WE","FR"] */
  byDay?: string[];
  /** BYMONTH: months of the year (1-12). With RSCALE (RFC 7529) may contain values like "5L". */
  byMonth?: Array<number | string>;
  /** BYMONTHDAY: days of the month (1..31 or negative from end) */
  byMonthDay?: number[];
  /** BYYEARDAY: days of the year (1..366 or negative from end) */
  byYearDay?: number[];
  /** BYWEEKNO: ISO week numbers (1..53 or negative from end) */
  byWeekNo?: number[];
  /** BYSETPOS: select n-th occurrence(s) after other filters */
  bySetPos?: number[];
  /** WKST: weekday on which the week starts ("MO".."SU") */
  wkst?: string;
  /** RDATE: additional dates to include */
  rDate?: TemporalZonedDateTimeInput[];
  /** EXDATE: exception dates to exclude */
  exDate?: TemporalZonedDateTimeInput[];
  /** DTSTART: first occurrence */
  dtstart: TemporalZonedDateTimeInput;
}

interface IcsOptions<TOutput extends TemporalZonedDateTimeInput = TemporalZonedDateTime> extends BaseOpts<TOutput> {
  rruleString: string; // full "DTSTART...\nRRULE..." snippet or bare RRULE/FREQ pattern
  dtstart?: TemporalZonedDateTimeInput; // optional separate DTSTART when rruleString lacks one
  /** COUNT: total number of occurrences, used when missing from rruleString */
  count?: number;
  /** UNTIL: last possible occurrence, used when missing from rruleString */
  until?: TemporalZonedDateTimeInput;
  /** RDATE: additional dates to include */
  rDate?: TemporalZonedDateTimeInput[];
  /** EXDATE: exception dates to exclude */
  exDate?: TemporalZonedDateTimeInput[];
}

type ManualOpts = Omit<ManualOptions<TemporalZonedDateTimeInput>, 'dtstart' | 'until' | 'rDate' | 'exDate'> & {
  dtstart: PolyfillZonedDateTime;
  until?: PolyfillZonedDateTime;
  rDate?: PolyfillZonedDateTime[];
  exDate?: PolyfillZonedDateTime[];
};

export type RRuleOptions<TOutput extends TemporalZonedDateTimeInput = TemporalZonedDateTime> =
  | ManualOptions<TOutput>
  | IcsOptions<TOutput>;
export type RRuleResolvedOptions<TOutput extends TemporalZonedDateTimeInput = TemporalZonedDateTime> = Omit<
  ManualOptions<TOutput>,
  'dtstart' | 'until' | 'rDate' | 'exDate'
> & {
  dtstart: TOutput;
  until?: TOutput;
  rDate?: TOutput[];
  exDate?: TOutput[];
};

function isIcsOpts<TOutput extends TemporalZonedDateTimeInput>(
  opts: RRuleOptions<TOutput>,
): opts is IcsOptions<TOutput> {
  return typeof (opts as IcsOptions<TOutput>).rruleString === 'string';
}

function mergeDateLists(
  parsedDates?: PolyfillZonedDateTime[],
  suppliedDates?: TemporalZonedDateTimeInput[],
): PolyfillZonedDateTime[] | undefined {
  const merged = [...(parsedDates ?? []), ...(normalizeZonedDateTimeList(suppliedDates, 'Manual date') ?? [])];
  return merged.length > 0 ? merged : undefined;
}

/**
 * Unfold lines according to RFC 5545 specification.
 * Lines can be folded by inserting CRLF followed by a single linear white-space character.
 * This function removes such folding by removing CRLF and the immediately following space/tab.
 */
function unfoldLine(foldedLine: string): string {
  // Remove CRLF followed by a single space or tab
  return foldedLine.replace(/\r?\n[ \t]/g, '');
}

/**
 * Parse a single ICS date-time string into a Temporal.ZonedDateTime
 */
function parseIcsDateTime(dateStr: string, tzid: string, valueType?: string): Temporal.ZonedDateTime {
  const isDate = valueType === 'DATE' || !dateStr.includes('T');
  const isoDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;

  if (isDate) {
    return Temporal.PlainDate.from(isoDate).toZonedDateTime({timeZone: tzid});
  }

  if (dateStr.endsWith('Z')) {
    const iso = `${isoDate}T${dateStr.slice(9, 15)}Z`;
    return Temporal.Instant.from(iso).toZonedDateTimeISO(tzid || 'UTC');
  } else {
    const iso = `${isoDate}T${dateStr.slice(9)}`;
    return Temporal.PlainDateTime.from(iso).toZonedDateTime(tzid);
  }
}

/**
 * Parse date values from EXDATE or RDATE lines
 */
function parseDateLines(lines: string[], linePrefix: 'EXDATE' | 'RDATE', defaultTzid: string) {
  const dates: Temporal.ZonedDateTime[] = [];

  for (const line of lines) {
    const parsed = parseIcsDatePropertyLine(line, linePrefix);
    if (!parsed) continue;

    const timezone = parsed.tzid || defaultTzid;
    const dateValues = parsed.value.split(',');
    dates.push(...dateValues.map((dateValue) => parseIcsDateTime(dateValue, timezone, parsed.valueType)));
  }
  return dates;
}

function parseIcsDatePropertyLine(
  line: string,
  propertyName: 'DTSTART' | 'EXDATE' | 'RDATE',
): {valueType?: string; tzid?: string; value: string} | null {
  const colonIndex = line.indexOf(':');
  if (colonIndex === -1) return null;

  const head = line.slice(0, colonIndex);
  const value = line.slice(colonIndex + 1);
  const [name, ...params] = head.split(';');
  if (name?.toUpperCase() !== propertyName) return null;

  let valueType: string | undefined;
  let tzid: string | undefined;
  for (const param of params) {
    const equalsIndex = param.indexOf('=');
    if (equalsIndex === -1) continue;

    const paramName = param.slice(0, equalsIndex).toUpperCase();
    const paramValue = param.slice(equalsIndex + 1);
    if (paramName === 'VALUE') {
      valueType = paramValue.toUpperCase();
    } else if (paramName === 'TZID') {
      tzid = paramValue;
    }
  }

  return {valueType, tzid, value};
}

function parseIntegerToken(token: string, label: string, strict: boolean): number {
  const trimmed = token.trim();
  if (strict && !/^[+-]?\d+$/.test(trimmed)) {
    throw new Error(`Invalid ${label} value: ${token}`);
  }
  return parseInt(trimmed, 10);
}

function parseNumberArray(val: string, sort = false, strict = false, label = 'number'): number[] {
  const arr = val.split(',').map((n) => parseIntegerToken(n, label, strict));
  if (sort) {
    return arr.sort((a, b) => a - b);
  }
  return arr;
}

/**
 * Parse BYMONTH values, supporting RFC 7529 leap-month tokens with an "L" suffix (e.g., "5L").
 * Returns a heterogeneous array keeping original tokens for serialization.
 */
function parseByMonthArray(val: string, strict = false): Array<number | string> {
  return val.split(',').map((tok) => {
    const t = tok.trim();
    if (/^\d+L$/i.test(t)) return t.toUpperCase();
    const n = parseIntegerToken(t, 'BYMONTH', strict);
    return Number.isFinite(n) ? n : t;
  });
}

/**
 * Parse either a full ICS snippet or an RRULE line into ManualOpts.
 *
 * @param input - String containing a `DTSTART` line followed by `RRULE` and
 *   optional `EXDATE`/`RDATE` lines. Can also be just an `RRULE:` line or
 *   recurrence pattern without DTSTART (dtstart must be provided separately).
 * @param targetTimezone - Optional IANA time zone identifier used when the
 *   `DTSTART` line omits `TZID`. Floating times are interpreted in this zone
 *   and the resulting `tzid` field in the returned options will be set to this
 *   value. If `DTSTART` already specifies a `TZID` this parameter is ignored.
 * @param dtstart - Optional DTSTART to use when input doesn't contain one.
 *
 * Examples:
 * ```ts
 * parseRRuleString(
 *   `DTSTART:20240101T090000\nRRULE:FREQ=DAILY`,
 *   'America/New_York'
 * );
 * // => opts.tzid === 'America/New_York'
 *
 * parseRRuleString(
 *   `DTSTART;TZID=Europe/Paris:20240101T090000\nRRULE:FREQ=DAILY`
 * );
 * // => opts.tzid === 'Europe/Paris' (targetTimezone ignored)
 *
 * parseRRuleString(
 *   `FREQ=DAILY;COUNT=5`,
 *   'UTC',
 *   Temporal.ZonedDateTime.from('2025-01-01T09:00:00[UTC]')
 * );
 * // => opts.dtstart from parameter
 * ```
 */
function parseRRuleString(
  input: string,
  targetTimezone?: string,
  dtstart?: TemporalZonedDateTimeInput,
  strict = false,
): ManualOpts {
  // Unfold the input according to RFC 5545 specification
  const unfoldedInput = unfoldLine(input).trim();

  let parsedDtstart: Temporal.ZonedDateTime | undefined;
  let tzid: string | undefined = targetTimezone;
  let dtstartValueType: 'DATE' | 'DATE-TIME' = 'DATE-TIME';
  let dtstartHasTzid = false;
  let dtstartIsUtc = false;
  let rruleLine: string;
  let exDate: Temporal.ZonedDateTime[] = [];
  let rDate: Temporal.ZonedDateTime[] = [];

  if (/^DTSTART/im.test(unfoldedInput)) {
    // ICS snippet: split DTSTART, RRULE, EXDATE, and RDATE
    const lines = unfoldedInput.split(/\s+/);
    const dtLine = lines.find((line) => line.match(/^DTSTART/i))!;
    const rrLine = lines.find((line) => line.match(/^RRULE:/i));
    const exLines = lines.filter((line) => line.match(/^EXDATE/i));
    const rLines = lines.filter((line) => line.match(/^RDATE/i));

    const parsedDtLine = parseIcsDatePropertyLine(dtLine, 'DTSTART');
    if (!parsedDtLine) throw new Error('Invalid DTSTART in ICS snippet');

    const {valueType, tzid: dtTzid, value: dtValue} = parsedDtLine;
    const normalizedValueType = (valueType || (dtValue?.includes('T') ? 'DATE-TIME' : 'DATE')).toUpperCase();
    dtstartValueType = normalizedValueType === 'DATE' ? 'DATE' : 'DATE-TIME';
    dtstartHasTzid = Boolean(dtTzid);
    dtstartIsUtc = Boolean(dtValue?.endsWith('Z'));
    const effectiveTzid = dtTzid ?? targetTimezone ?? tzid ?? 'UTC';
    parsedDtstart = parseIcsDateTime(dtValue, effectiveTzid, dtstartValueType);
    tzid = dtTzid ?? parsedDtstart.timeZoneId ?? targetTimezone ?? tzid ?? 'UTC';

    rruleLine = rrLine!;

    exDate = parseDateLines(exLines, 'EXDATE', tzid ?? 'UTC');
    rDate = parseDateLines(rLines, 'RDATE', tzid ?? 'UTC');
  } else {
    // Just RRULE or FREQ pattern - use provided dtstart
    parsedDtstart = dtstart ? normalizeZonedDateTime(dtstart, 'dtstart') : undefined;
    rruleLine = unfoldedInput;
    if (parsedDtstart) {
      tzid = parsedDtstart.timeZoneId;
      dtstartValueType = 'DATE-TIME';
      dtstartHasTzid = true;
      dtstartIsUtc = parsedDtstart.timeZoneId === 'UTC';
    }
  }

  // Parse RRULE
  const parts = rruleLine ? rruleLine.replace(/^RRULE:/i, '').split(';') : [];
  const opts = {
    dtstart: parsedDtstart,
    tzid,
    exDate: exDate.length > 0 ? exDate : undefined,
    rDate: rDate.length > 0 ? rDate : undefined,
  } as ManualOpts;
  let pendingSkip: ('OMIT' | 'BACKWARD' | 'FORWARD') | undefined;
  for (const part of parts) {
    const [key, val] = part.split('=');
    if (!key) continue;
    switch (key.toUpperCase()) {
      case 'RSCALE':
        if (val) {
          opts.rscale = val.toUpperCase();
          if (pendingSkip && !opts.skip) {
            opts.skip = pendingSkip;
            pendingSkip = undefined;
          }
        }
        break;
      case 'SKIP': {
        const v = (val || '').toUpperCase();
        if (!['OMIT', 'BACKWARD', 'FORWARD'].includes(v)) {
          throw new Error(`Invalid SKIP value: ${val}`);
        }
        if (opts.rscale) {
          opts.skip = v as 'OMIT' | 'BACKWARD' | 'FORWARD';
        } else {
          pendingSkip = v as 'OMIT' | 'BACKWARD' | 'FORWARD';
        }
        break;
      }
      case 'FREQ':
        opts.freq = val!.toUpperCase() as Freq;
        break;
      case 'INTERVAL':
        opts.interval = parseIntegerToken(val!, 'INTERVAL', strict);
        break;
      case 'COUNT':
        opts.count = parseIntegerToken(val!, 'COUNT', strict);
        break;
      case 'UNTIL': {
        const untilHasTime = val!.includes('T');
        if (dtstartValueType === 'DATE') {
          if (untilHasTime) {
            throw new Error('UNTIL rule part MUST have the same value type as DTSTART');
          }
          opts.until = parseIcsDateTime(val!, tzid || 'UTC', 'DATE');
          break;
        }

        if (!untilHasTime) {
          if (strict) {
            throw new Error('UNTIL rule part MUST have the same value type as DTSTART');
          }

          // Compatibility fallback: some producers emit DATE UNTIL with DATE-TIME DTSTART.
          // Treat this as an inclusive end-of-day bound in DTSTART's zone.
          const localEndOfDay = parseIcsDateTime(val!, tzid || 'UTC', 'DATE').with({
            hour: 23,
            minute: 59,
            second: 59,
            millisecond: 0,
            microsecond: 0,
            nanosecond: 0,
          });
          const requiresUtc = dtstartHasTzid || dtstartIsUtc;
          opts.until = requiresUtc ? localEndOfDay.withTimeZone('UTC') : localEndOfDay;
          break;
        }

        const requiresUtc = dtstartHasTzid || dtstartIsUtc;
        if (requiresUtc && !val!.endsWith('Z')) {
          throw new Error('UNTIL rule part MUST always be specified as a date with UTC time');
        }
        opts.until = parseIcsDateTime(val!, tzid || 'UTC', 'DATE-TIME');
        break;
      }
      case 'BYHOUR':
        opts.byHour = parseNumberArray(val!, true, strict, 'BYHOUR');
        break;
      case 'BYMINUTE':
        opts.byMinute = parseNumberArray(val!, true, strict, 'BYMINUTE');
        break;
      case 'BYSECOND':
        opts.bySecond = parseNumberArray(val!, true, strict, 'BYSECOND');
        break;
      case 'BYDAY':
        opts.byDay = val!.split(',').map((token) => token.toUpperCase()); // e.g. ["MO","2FR","-1SU"]
        break;
      case 'BYMONTH':
        opts.byMonth = parseByMonthArray(val!, strict);
        break;
      case 'BYMONTHDAY':
        opts.byMonthDay = parseNumberArray(val!, false, strict, 'BYMONTHDAY');
        break;
      case 'BYYEARDAY':
        opts.byYearDay = parseNumberArray(val!, false, strict, 'BYYEARDAY');
        break;
      case 'BYWEEKNO':
        opts.byWeekNo = parseNumberArray(val!, false, strict, 'BYWEEKNO');
        break;
      case 'BYSETPOS':
        opts.bySetPos = parseNumberArray(val!, false, strict, 'BYSETPOS');
        break;
      case 'WKST':
        opts.wkst = val?.toUpperCase();
        break;
    }
  }

  if (pendingSkip && !opts.rscale) {
    throw new Error('SKIP MUST NOT be present unless RSCALE is present');
  }
  if (pendingSkip && opts.rscale && !opts.skip) {
    opts.skip = pendingSkip;
  }

  return opts;
}

export class RRuleTemporal<TOutput extends TemporalZonedDateTimeInput = TemporalZonedDateTime> {
  private readonly tzid: string;
  private readonly originalDtstart: Temporal.ZonedDateTime;
  private readonly opts: ManualOpts;
  private readonly outputTemporal?: TemporalImplementation<TOutput>;
  private readonly maxIterations: number;
  private readonly maxCandidateEvaluations: number;
  private readonly includeDtstart: boolean;
  private readonly parsedByDayTokens?: Array<{ord: number; weekday: Weekday; isoDay: number}>;
  private readonly simpleByDayIsoDays?: number[];
  private readonly allByDayIsoDays?: number[];
  private readonly hasOrdinalByDay: boolean;
  private readonly canUseEpochMillisecondsPrecisionFlag: boolean;
  private readonly timeSlotOffsetsMs?: number[];
  private readonly hasUniqueTimeSlotOffsets: boolean;
  private readonly numericByMonths?: number[];
  private exDateEpochNs?: Set<bigint>;
  private numericRDatesCache?: Temporal.ZonedDateTime[];
  private allResultCache?: Temporal.ZonedDateTime[];
  private publicAllResultCache?: TOutput[];
  private outputConstructorFastPathAvailable?: boolean;
  private zoneResolver?: ZoneOffsetResolver;
  private emitAnchorZdt?: Temporal.ZonedDateTime;
  private numericQueryPlanCache: NumericQueryPlan | null | undefined;
  private static readonly rscaleCalendarSupport: Record<string, boolean> = {};

  /**
   * Normalize a ZonedDateTime to the polyfill implementation.
   * This prevents type mismatches when mixing native and polyfill Temporal objects.
   */
  private static normalizeToPolyfill(zdt: TemporalZonedDateTimeInput): Temporal.ZonedDateTime {
    return normalizeZonedDateTime(zdt, 'Date');
  }

  private toPublicDate(date: PolyfillZonedDateTime | null): TOutput | null {
    if (!date) return null;

    const outputConstructor = this.outputTemporal?.ZonedDateTime;
    if (!outputConstructor || (outputConstructor as unknown) === Temporal.ZonedDateTime) {
      return date as unknown as TOutput;
    }

    if (this.outputConstructorFastPathAvailable !== false) {
      try {
        const ConstructableZonedDateTime = outputConstructor as unknown as new (
          epochNanoseconds: bigint,
          timeZone: string,
          calendar?: string,
        ) => TOutput;
        const converted = new ConstructableZonedDateTime(date.epochNanoseconds, date.timeZoneId, date.calendarId);
        this.outputConstructorFastPathAvailable = true;
        return converted;
      } catch {
        // Some implementation adapters intentionally expose only `.from()`.
        // Remember that capability once and retain the documented fallback.
        this.outputConstructorFastPathAvailable = false;
      }
    }
    return outputConstructor.from(date.toString());
  }

  private toPublicDates(dates: PolyfillZonedDateTime[]): TOutput[] {
    if (!this.outputTemporal || (this.outputTemporal.ZonedDateTime as unknown) === Temporal.ZonedDateTime) {
      return dates as unknown as TOutput[];
    }
    return dates.map((date) => this.toPublicDate(date)!);
  }

  constructor(params: RRuleOptions<TOutput>) {
    this.outputTemporal = params.temporal;
    let manual: ManualOpts;
    if (isIcsOpts(params)) {
      // Allow dtstart to be passed separately when rruleString doesn't contain DTSTART
      const parsed = parseRRuleString(params.rruleString, params.tzid, params.dtstart, params.strict ?? false);

      // If no dtstart was found in the string or provided as parameter, throw error
      if (!parsed.dtstart) {
        throw new Error('dtstart is required - provide it either in rruleString or as a separate parameter');
      }

      const dtstart = RRuleTemporal.normalizeToPolyfill(parsed.dtstart);
      this.tzid = parsed.tzid ?? params.tzid ?? 'UTC';
      this.originalDtstart = dtstart;
      // Important: do NOT carry `rruleString` into internal opts. If present,
      // `between()` spreads opts and constructs a new RRuleTemporal; leaking
      // `rruleString` would trigger the ICS parsing branch again and override
      // the temporary dtstart/until alignment, leading to excessive iteration.
      manual = {
        ...parsed,
        dtstart,
        rDate: mergeDateLists(parsed.rDate, params.rDate),
        exDate: mergeDateLists(parsed.exDate, params.exDate),
        // Allow explicit COUNT/UNTIL overrides when omitted from the RRULE string
        count: params.count ?? parsed.count,
        until: params.until ? RRuleTemporal.normalizeToPolyfill(params.until) : parsed.until,
        strict: params.strict,
        maxIterations: params.maxIterations,
        maxCandidateEvaluations: params.maxCandidateEvaluations,
        includeDtstart: params.includeDtstart,
        cache: params.cache,
        temporal: params.temporal,
        tzid: this.tzid,
      } as ManualOpts;
    } else {
      const dtstart = normalizeZonedDateTime(params.dtstart, 'Manual dtstart');
      manual = {
        ...params,
        dtstart,
        until: params.until ? normalizeZonedDateTime(params.until, 'Manual until') : undefined,
        rDate: normalizeZonedDateTimeList(params.rDate, 'Manual rDate'),
        exDate: normalizeZonedDateTimeList(params.exDate, 'Manual exDate'),
      };
      manual.tzid = manual.tzid || dtstart.timeZoneId;
      this.tzid = manual.tzid;
      this.originalDtstart = dtstart;
    }
    if (!manual.freq) throw new Error('RRULE must include FREQ');
    manual.interval = manual.interval ?? 1;
    if (manual.interval <= 0) {
      throw new Error('Cannot create RRule: interval must be greater than 0');
    }
    this.opts = this.sanitizeOpts(manual);
    this.maxIterations = manual.maxIterations ?? 10000;
    this.maxCandidateEvaluations = manual.maxCandidateEvaluations ?? 1_000_000;
    if (!Number.isSafeInteger(this.maxCandidateEvaluations) || this.maxCandidateEvaluations <= 0) {
      throw new Error('maxCandidateEvaluations must be a positive safe integer');
    }
    this.includeDtstart = manual.includeDtstart ?? false; // Default to RFC 5545 compliant behavior
    this.parsedByDayTokens = this.buildParsedByDayTokens(this.opts.byDay);
    this.simpleByDayIsoDays = this.buildByDayIsoDays(this.parsedByDayTokens, false);
    this.allByDayIsoDays = this.buildByDayIsoDays(this.parsedByDayTokens, true);
    this.hasOrdinalByDay = this.parsedByDayTokens?.some((token) => token.ord !== 0) ?? false;
    this.canUseEpochMillisecondsPrecisionFlag =
      this.originalDtstart.microsecond === 0 &&
      this.originalDtstart.nanosecond === 0 &&
      (!this.opts.until || (this.opts.until.microsecond === 0 && this.opts.until.nanosecond === 0));
    this.timeSlotOffsetsMs = this.buildTimeSlotOffsetsMs();
    this.hasUniqueTimeSlotOffsets =
      this.timeSlotOffsetsMs === undefined || new Set(this.timeSlotOffsetsMs).size === this.timeSlotOffsetsMs.length;
    this.numericByMonths = this.opts.byMonth?.filter((value): value is number => typeof value === 'number');
  }

  private buildParsedByDayTokens(byDay?: string[]) {
    if (!byDay?.length) return undefined;

    const tokens = byDay
      .map((tok) => {
        const parsed = parseByDayToken(tok);
        if (!parsed) return null;
        return {
          ord: parsed.ord,
          weekday: parsed.weekday,
          isoDay: weekdayToIsoDay[parsed.weekday],
        };
      })
      .filter((token): token is {ord: number; weekday: Weekday; isoDay: number} => token !== null);

    return tokens.length > 0 ? tokens : undefined;
  }

  private buildByDayIsoDays(
    tokens: Array<{ord: number; weekday: Weekday; isoDay: number}> | undefined,
    includeOrdinals: boolean,
  ) {
    if (!tokens?.length) return undefined;

    const isoDays = tokens.filter((token) => includeOrdinals || token.ord === 0).map((token) => token.isoDay);

    if (!isoDays.length) return undefined;

    return [...new Set(isoDays)].sort((a, b) => a - b);
  }

  private sanitizeNumericArray(
    arr: number[] | undefined,
    min: number,
    max: number,
    allowZero = false,
    sort = false,
  ): number[] | undefined {
    if (!arr) return undefined;
    const sanitized: number[] = [];
    const seen = new Set<number>();
    for (const value of arr) {
      if (Number.isInteger(value) && value >= min && value <= max && (allowZero || value !== 0) && !seen.has(value)) {
        seen.add(value);
        sanitized.push(value);
      }
    }
    if (sanitized.length === 0) return undefined;
    return sort ? sanitized.sort((a, b) => a - b) : sanitized;
  }

  private sanitizeByDay(byDay?: string[]) {
    const normalized: string[] = [];
    const seen = new Set<string>();
    for (const day of byDay ?? []) {
      if (!day || typeof day !== 'string') continue;
      const token = day.toUpperCase();
      const parsed = parseByDayToken(token);
      if (!parsed) {
        throw new Error(`Invalid BYDAY value: ${day}`);
      }
      if (parsed.ord === 0 && /^[+-]?\d/.test(token)) {
        throw new Error(`Invalid BYDAY value: ${day}`);
      }
      if (!seen.has(token)) {
        seen.add(token);
        normalized.push(token);
      }
    }
    return normalized.length > 0 ? normalized : undefined;
  }

  private enforceStrictRfc(opts: ManualOpts) {
    if (!opts.strict) return;

    const freq = opts.freq;
    if (opts.count !== undefined && opts.until !== undefined) {
      throw new Error('COUNT and UNTIL MUST NOT occur in the same recurrence rule');
    }
    if (opts.byWeekNo && freq !== 'YEARLY') {
      throw new Error('BYWEEKNO MUST NOT be used unless FREQ=YEARLY');
    }
    if (opts.byYearDay && ['DAILY', 'WEEKLY', 'MONTHLY'].includes(freq)) {
      throw new Error('BYYEARDAY MUST NOT be used when FREQ is DAILY, WEEKLY, or MONTHLY');
    }
    if (opts.byMonthDay && freq === 'WEEKLY') {
      throw new Error('BYMONTHDAY MUST NOT be used when FREQ is WEEKLY');
    }

    const hasNumericByDay = (opts.byDay ?? []).some((day) => /^[+-]?\d/.test(day));
    if (hasNumericByDay && !['MONTHLY', 'YEARLY'].includes(freq)) {
      throw new Error('BYDAY with numeric value MUST NOT be used unless FREQ is MONTHLY or YEARLY');
    }
    if (hasNumericByDay && freq === 'YEARLY' && opts.byWeekNo) {
      throw new Error('BYDAY with numeric value MUST NOT be used with FREQ=YEARLY when BYWEEKNO is present');
    }

    const hasOtherBy = Boolean(
      opts.byDay ||
      opts.byMonth ||
      opts.byMonthDay ||
      opts.byYearDay ||
      opts.byWeekNo ||
      opts.byHour ||
      opts.byMinute ||
      opts.bySecond,
    );
    if (opts.bySetPos && !hasOtherBy) {
      throw new Error('BYSETPOS MUST be used with another BYxxx rule part');
    }
  }

  private sanitizeOpts(opts: ManualOpts): ManualOpts {
    if (!allowedFreqSet.has(opts.freq)) {
      throw new Error(`Invalid FREQ value: ${opts.freq}`);
    }
    opts.byDay = this.sanitizeByDay(opts.byDay);
    if (opts.wkst) {
      const wkst = opts.wkst.toUpperCase();
      if (!allowedWeekdaysSet.has(wkst)) {
        throw new Error(`Invalid WKST value: ${opts.wkst}`);
      }
      opts.wkst = wkst;
    }
    // BYMONTH can include strings (e.g., "5L") under RFC 7529; keep tokens as-is.
    if (opts.byMonth) {
      // Split into numeric and string tokens; sanitize numeric to 1..12 to preserve existing behavior for Gregorian
      const numeric = opts.byMonth.filter((v): v is number => typeof v === 'number');
      const stringy = opts.byMonth
        .filter((v): v is string => typeof v === 'string')
        .map((value) => value.toUpperCase());
      const sanitizedNum = this.sanitizeNumericArray(numeric, 1, 12, false, false) ?? [];
      const merged = [...new Set<number | string>([...sanitizedNum, ...stringy])];
      opts.byMonth = merged.length > 0 ? merged : undefined;
    }
    // Default SKIP per RFC 7529 only when RSCALE present
    if (opts.rscale && !opts.skip) {
      opts.skip = 'OMIT';
    }
    opts.byMonthDay = this.sanitizeNumericArray(opts.byMonthDay, -31, 31, false, false);
    opts.byYearDay = this.sanitizeNumericArray(opts.byYearDay, -366, 366, false, false);
    opts.byWeekNo = this.sanitizeNumericArray(opts.byWeekNo, -53, 53, false, false);
    opts.byHour = this.sanitizeNumericArray(opts.byHour, 0, 23, true, true);
    opts.byMinute = this.sanitizeNumericArray(opts.byMinute, 0, 59, true, true);
    opts.bySecond = this.sanitizeNumericArray(opts.bySecond, 0, 59, true, true);
    if (opts.bySetPos) {
      if (opts.bySetPos.some((p) => p === 0)) {
        throw new Error('bySetPos may not contain 0');
      }
      opts.bySetPos = this.sanitizeNumericArray(opts.bySetPos, -Infinity, Infinity, false, false);
    }
    this.enforceStrictRfc(opts);
    return opts;
  }

  private rawAdvance(zdt: Temporal.ZonedDateTime): Temporal.ZonedDateTime {
    const {freq, interval} = this.opts;
    switch (freq) {
      case 'DAILY':
        return zdt.add({days: interval});
      case 'WEEKLY':
        return zdt.add({weeks: interval});
      case 'MONTHLY':
        return zdt.add({months: interval});
      case 'YEARLY':
        return zdt.add({years: interval});
      case 'HOURLY': {
        const originalHour = zdt.hour;
        let next = zdt.add({hours: interval});
        // Handle DST fallback case: if the hour didn't advance as expected,
        // add the interval again to skip over the repeated hour
        if (next.hour === originalHour && interval === 1) {
          next = next.add({hours: interval});
        }
        return next;
      }
      case 'MINUTELY':
        return zdt.add({minutes: interval});
      case 'SECONDLY':
        return zdt.add({seconds: interval});
      default:
        throw new Error(`Unsupported FREQ: ${freq}`);
    }
  }

  /**  Expand one base ZonedDateTime into all BYHOUR × BYMINUTE × BYSECOND
   *  combinations, keeping chronological order. If the options are not
   *  present the original date is returned unchanged.
   */
  private expandByTime(base: Temporal.ZonedDateTime): Temporal.ZonedDateTime[] {
    if (!this.opts.byHour && !this.opts.byMinute && !this.opts.bySecond) {
      return [base];
    }

    const hours = this.opts.byHour ?? [base.hour];
    const minutes = this.opts.byMinute ?? [base.minute];
    const seconds = this.opts.bySecond ?? [base.second];

    if (hours.length === 1 && minutes.length === 1 && seconds.length === 1) {
      const hour = hours[0]!;
      const minute = minutes[0]!;
      const second = seconds[0]!;
      if (hour === base.hour && minute === base.minute && second === base.second) {
        return [base];
      }
      return [base.with({hour, minute, second})];
    }

    const out: Temporal.ZonedDateTime[] = [];
    for (const h of hours) {
      for (const m of minutes) {
        for (const s of seconds) {
          out.push(base.with({hour: h, minute: m, second: s}));
        }
      }
    }
    return out.sort((a, b) => Temporal.ZonedDateTime.compare(a, b));
  }

  private localDateKey(date: Temporal.ZonedDateTime): string {
    return `${date.calendarId}:${date.year}:${date.month}:${date.day}`;
  }

  private sortedUniqueDateCandidates(candidates: Temporal.ZonedDateTime[]): Temporal.ZonedDateTime[] {
    const byLocalDate = new Map<string, Temporal.ZonedDateTime>();
    for (const candidate of candidates) {
      const key = this.localDateKey(candidate);
      if (!byLocalDate.has(key)) byLocalDate.set(key, candidate);
    }
    return [...byLocalDate.values()].sort((a, b) => Temporal.ZonedDateTime.compare(a, b));
  }

  private timeOfDayNanoseconds(date: Temporal.ZonedDateTime): number {
    return (
      ((date.hour * 60 * 60 + date.minute * 60 + date.second) * 1_000 + date.millisecond) * 1_000_000 +
      date.microsecond * 1_000 +
      date.nanosecond
    );
  }

  private timeSlotNanoseconds(base: Temporal.ZonedDateTime, hour: number, minute: number, second: number): number {
    return (
      ((hour * 60 * 60 + minute * 60 + second) * 1_000 + base.millisecond) * 1_000_000 +
      base.microsecond * 1_000 +
      base.nanosecond
    );
  }

  /**
   * `ZonedDateTime.with()` can reorder or alias wall-clock slots on a day with
   * an offset transition (notably when a spring-forward gap is resolved). On
   * those uncommon dates we retain the legacy sort semantics with a bounded
   * one-day fallback instead of ever materializing a whole recurrence period.
   */
  private needsSortedTimeFallback(base: Temporal.ZonedDateTime): boolean {
    try {
      const startOfDay = base.startOfDay();
      const nextStartOfDay = startOfDay.add({days: 1}).startOfDay();
      return nextStartOfDay.epochNanoseconds - startOfDay.epochNanoseconds !== BigInt(86_400_000_000_000);
    } catch {
      return true;
    }
  }

  private createCandidateWorkBudget(): CandidateWorkBudget {
    return {evaluated: 0, seenOccurrences: new Set<bigint>()};
  }

  private recordCandidateEvaluation(work: CandidateWorkBudget, count = 1): void {
    work.evaluated += count;
    if (work.evaluated > this.maxCandidateEvaluations) {
      throw new Error(`Maximum candidate evaluations (${this.maxCandidateEvaluations}) exceeded in all()`);
    }
  }

  /**
   * Visit BYHOUR x BYMINUTE x BYSECOND without allocating the Cartesian
   * product. Returning false from `visit` terminates the innermost traversal
   * immediately. The optional bounds are only supplied for the same local
   * calendar date by `visitDateTimeCandidates`.
   */
  private visitTimeSlots(
    base: Temporal.ZonedDateTime,
    direction: 1 | -1,
    visit: (candidate: Temporal.ZonedDateTime) => boolean,
    notBefore?: Temporal.ZonedDateTime,
    notAfter?: Temporal.ZonedDateTime,
    work: CandidateWorkBudget = this.createCandidateWorkBudget(),
  ): boolean {
    const hours = this.opts.byHour ?? [base.hour];
    const minutes = this.opts.byMinute ?? [base.minute];
    const seconds = this.opts.bySecond ?? [base.second];

    if (this.needsSortedTimeFallback(base)) {
      const candidates: Temporal.ZonedDateTime[] = [];
      for (const hour of hours) {
        for (const minute of minutes) {
          for (const second of seconds) {
            this.recordCandidateEvaluation(work);
            const candidate =
              hour === base.hour && minute === base.minute && second === base.second
                ? base
                : base.with({hour, minute, second});
            if (notBefore && Temporal.ZonedDateTime.compare(candidate, notBefore) < 0) continue;
            if (notAfter && Temporal.ZonedDateTime.compare(candidate, notAfter) > 0) continue;
            candidates.push(candidate);
          }
        }
      }
      candidates.sort((a, b) => Temporal.ZonedDateTime.compare(a, b));

      let previousEpoch: bigint | undefined;
      const start = direction === 1 ? 0 : candidates.length - 1;
      const end = direction === 1 ? candidates.length : -1;
      for (let index = start; index !== end; index += direction) {
        const candidate = candidates[index]!;
        if (candidate.epochNanoseconds === previousEpoch) continue;
        previousEpoch = candidate.epochNanoseconds;
        if (!visit(candidate)) return false;
      }
      return true;
    }

    const lowerTime = notBefore ? this.timeOfDayNanoseconds(notBefore) : undefined;
    const upperTime = notAfter ? this.timeOfDayNanoseconds(notAfter) : undefined;
    const hourStart = direction === 1 ? 0 : hours.length - 1;
    const hourEnd = direction === 1 ? hours.length : -1;
    for (let hourIndex = hourStart; hourIndex !== hourEnd; hourIndex += direction) {
      const hour = hours[hourIndex]!;
      const minuteStart = direction === 1 ? 0 : minutes.length - 1;
      const minuteEnd = direction === 1 ? minutes.length : -1;
      for (let minuteIndex = minuteStart; minuteIndex !== minuteEnd; minuteIndex += direction) {
        const minute = minutes[minuteIndex]!;
        const secondStart = direction === 1 ? 0 : seconds.length - 1;
        const secondEnd = direction === 1 ? seconds.length : -1;
        for (let secondIndex = secondStart; secondIndex !== secondEnd; secondIndex += direction) {
          const second = seconds[secondIndex]!;
          const slotTime = this.timeSlotNanoseconds(base, hour, minute, second);
          if (lowerTime !== undefined && slotTime < lowerTime) continue;
          if (upperTime !== undefined && slotTime > upperTime) continue;

          this.recordCandidateEvaluation(work);
          const candidate =
            hour === base.hour && minute === base.minute && second === base.second
              ? base
              : base.with({hour, minute, second});
          if (!visit(candidate)) return false;
        }
      }
    }
    return true;
  }

  private visitDateTimeCandidates(
    dateCandidates: Temporal.ZonedDateTime[],
    direction: 1 | -1,
    visit: (candidate: Temporal.ZonedDateTime) => boolean,
    notBefore?: Temporal.ZonedDateTime,
    notAfter?: Temporal.ZonedDateTime,
    work: CandidateWorkBudget = this.createCandidateWorkBudget(),
  ): boolean {
    const dates = this.sortedUniqueDateCandidates(dateCandidates);
    const localNotBefore = notBefore?.withTimeZone(this.tzid);
    const localNotAfter = notAfter?.withTimeZone(this.tzid);
    const notBeforeDate = localNotBefore?.toPlainDate();
    const notAfterDate = localNotAfter?.toPlainDate();
    const start = direction === 1 ? 0 : dates.length - 1;
    const end = direction === 1 ? dates.length : -1;
    let previousEpoch: bigint | undefined;

    for (let index = start; index !== end; index += direction) {
      const date = dates[index]!;
      const plainDate = date.toPlainDate();
      if (notBeforeDate && Temporal.PlainDate.compare(plainDate, notBeforeDate) < 0) continue;
      if (notAfterDate && Temporal.PlainDate.compare(plainDate, notAfterDate) > 0) continue;

      const sameAsLowerDate = notBeforeDate && Temporal.PlainDate.compare(plainDate, notBeforeDate) === 0;
      const sameAsUpperDate = notAfterDate && Temporal.PlainDate.compare(plainDate, notAfterDate) === 0;
      const completed = this.visitTimeSlots(
        date,
        direction,
        (candidate) => {
          if (candidate.epochNanoseconds === previousEpoch) return true;
          previousEpoch = candidate.epochNanoseconds;
          return visit(candidate);
        },
        sameAsLowerDate ? localNotBefore : undefined,
        sameAsUpperDate ? localNotAfter : undefined,
        work,
      );
      if (!completed) return false;
    }
    return true;
  }

  /** Apply BYSETPOS with bounded forward/reverse passes over one period. */
  private visitPeriodCandidates(
    dateCandidates: Temporal.ZonedDateTime[],
    visit: (candidate: Temporal.ZonedDateTime) => boolean,
    notBefore?: Temporal.ZonedDateTime,
    notAfter?: Temporal.ZonedDateTime,
    work: CandidateWorkBudget = this.createCandidateWorkBudget(),
  ): boolean {
    const positions = this.opts.bySetPos;
    if (!positions?.length) {
      return this.visitDateTimeCandidates(dateCandidates, 1, visit, notBefore, notAfter, work);
    }

    const positive = new Set(positions.filter((position) => position > 0));
    const negative = new Set(positions.filter((position) => position < 0).map((position) => -position));
    const selected = new Map<bigint, Temporal.ZonedDateTime>();

    if (positive.size > 0) {
      let lastPositive = 0;
      for (const position of positive) lastPositive = Math.max(lastPositive, position);
      let rank = 0;
      this.visitDateTimeCandidates(
        dateCandidates,
        1,
        (candidate) => {
          rank += 1;
          if (positive.has(rank)) selected.set(candidate.epochNanoseconds, candidate);
          return rank < lastPositive;
        },
        undefined,
        undefined,
        work,
      );
    }

    if (negative.size > 0) {
      let lastNegative = 0;
      for (const position of negative) lastNegative = Math.max(lastNegative, position);
      let rank = 0;
      this.visitDateTimeCandidates(
        dateCandidates,
        -1,
        (candidate) => {
          rank += 1;
          if (negative.has(rank)) selected.set(candidate.epochNanoseconds, candidate);
          return rank < lastNegative;
        },
        undefined,
        undefined,
        work,
      );
    }

    const sorted = [...selected.values()].sort((a, b) => Temporal.ZonedDateTime.compare(a, b));
    for (const candidate of sorted) {
      // Query/DTSTART/UNTIL bounds are intentionally applied after positional
      // ranking. BYSETPOS is defined over the complete candidate set for the
      // recurrence period, not the subset inside a caller's query window.
      if (notBefore && Temporal.ZonedDateTime.compare(candidate, notBefore) < 0) continue;
      if (notAfter && Temporal.ZonedDateTime.compare(candidate, notAfter) > 0) continue;
      if (!visit(candidate)) return false;
    }
    return true;
  }

  /**
   * In UTC, calendar days and sorted time slots form an ordered Cartesian
   * product. Select positions and clip query bounds on integers, constructing
   * Temporal values only for the candidates the visitor actually consumes.
   * Keep the general visitor's work accounting, including both BYSETPOS passes.
   */
  private visitUtcPeriodCandidates(
    sample: Temporal.ZonedDateTime,
    visit: (candidate: Temporal.ZonedDateTime) => boolean,
    notBefore: Temporal.ZonedDateTime | undefined,
    notAfter: Temporal.ZonedDateTime | undefined,
    work: CandidateWorkBudget,
  ): boolean | null {
    const slots = this.timeSlotOffsetsMs;
    if (
      this.tzid !== 'UTC' ||
      sample.timeZoneId !== 'UTC' ||
      !['iso8601', 'gregory'].includes(sample.calendarId) ||
      this.opts.rscale !== undefined ||
      this.opts.byYearDay ||
      this.opts.byWeekNo ||
      this.opts.byMonth?.some((month) => typeof month !== 'number') ||
      !slots?.length ||
      !this.hasUniqueTimeSlotOffsets ||
      !Number.isSafeInteger(this.opts.interval) ||
      sample.year <= -271_821 ||
      sample.year >= 275_760
    ) {
      return null;
    }
    // Reuse only the date-expanded Gregorian shapes shared with the numeric
    // query planner. Other frequencies and ordinal intersections stay general.
    if (!(this.opts.byDay || this.opts.byMonthDay)) return null;
    let days: number[];
    if (this.opts.freq === 'MONTHLY') {
      const monthStart = gregorianEpochDay(sample.year, sample.month, 1);
      days = this.generateMonthlyOccurrenceDaysUtc(sample.year, sample.month).map((day) => monthStart + day - 1);
    } else if (this.opts.freq === 'YEARLY') {
      if (
        this.hasOrdinalByDay &&
        !this.numericByMonths?.length &&
        (this.opts.byMonthDay || this.parsedByDayTokens?.some((token) => token.ord === 0 || Math.abs(token.ord) > 52))
      ) {
        return null;
      }
      days = this.generateYearlyOccurrenceDaysUtc(sample.year);
    } else {
      return null;
    }

    const size = days.length * slots.length;
    const select = (index: number): number =>
      days[Math.floor(index / slots.length)]! * MS_PER_DAY + slots[index % slots.length]!;
    const lowerBound = (target: number): number => {
      let low = 0;
      let high = size;
      while (low < high) {
        const middle = low + Math.floor((high - low) / 2);
        if (select(middle) < target) low = middle + 1;
        else high = middle;
      }
      return low;
    };
    const first = notBefore ? lowerBound(Number(ceilDivBigInt(notBefore.epochNanoseconds, NS_PER_MILLISECOND))) : 0;
    const end = notAfter ? lowerBound(Number(floorDivBigInt(notAfter.epochNanoseconds, NS_PER_MILLISECOND)) + 1) : size;
    const emit = (index: number): boolean =>
      visit(new Temporal.ZonedDateTime(BigInt(select(index)) * NS_PER_MILLISECOND, 'UTC', sample.calendarId));

    const positions = this.opts.bySetPos;
    if (positions?.length) {
      let positiveLimit = 0;
      let negativeLimit = 0;
      const selected = new Set<number>();
      for (const position of positions) {
        if (position > 0) positiveLimit = Math.max(positiveLimit, position);
        else negativeLimit = Math.max(negativeLimit, -position);
        const index = position > 0 ? position - 1 : size + position;
        if (index >= 0 && index < size) selected.add(index);
      }
      this.recordCandidateEvaluation(work, Math.min(size, positiveLimit) + Math.min(size, negativeLimit));
      for (const index of [...selected].sort((left, right) => left - right)) {
        if (index >= first && index < end && !emit(index)) return false;
      }
    } else {
      for (let index = first; index < end; index++) {
        this.recordCandidateEvaluation(work);
        if (!emit(index)) return false;
      }
    }
    return true;
  }

  private nextCandidateSameDate(zdt: Temporal.ZonedDateTime): Temporal.ZonedDateTime {
    const {freq, interval = 1, byHour, byMinute, bySecond} = this.opts;

    // Special case: HOURLY frequency with a single BYHOUR token would
    // otherwise keep returning the same time (e.g. always 12:00).  When
    // BYDAY filters are also present this results in an infinite loop.
    if (freq === 'HOURLY' && byHour && byHour.length === 1) {
      return this.applyTimeOverride(zdt.add({days: interval}));
    }

    // MINUTELY frequency with a single BYMINUTE value would also repeat
    // the same time. Move forward a full hour before reapplying overrides.
    if (freq === 'MINUTELY' && byMinute && byMinute.length === 1) {
      return this.applyTimeOverride(zdt.add({hours: interval}));
    }

    if (bySecond && bySecond.length > 1) {
      const idx = bySecond.indexOf(zdt.second);
      if (idx !== -1 && idx < bySecond.length - 1) {
        return zdt.with({second: bySecond[idx + 1]});
      }
    }

    // MINUTELY frequency with BYHOUR constraint but no BYMINUTE - advance by interval minutes
    // and check if we're still in an allowed hour, otherwise find the next allowed hour
    if (freq === 'MINUTELY' && byHour && byHour.length > 1 && !byMinute) {
      const next = zdt.add({minutes: interval});
      if (byHour.includes(next.hour)) {
        return next.with({second: bySecond ? bySecond[0] : zdt.second});
      }
      // Find next allowed hour
      const nextHour = byHour.find((h) => h > zdt.hour) || byHour[0];
      if (nextHour && nextHour > zdt.hour) {
        return zdt.with({hour: nextHour, minute: 0, second: bySecond ? bySecond[0] : zdt.second});
      }
      // Move to next day and use first allowed hour
      return this.applyTimeOverride(zdt.add({days: 1}));
    }

    if (freq === 'SECONDLY') {
      let candidate = zdt;

      // 1. Process Seconds
      if (bySecond && bySecond.length > 0) {
        const nextSecondInList = bySecond.find((s) => s > candidate.second);
        if (nextSecondInList !== undefined) {
          return candidate.with({second: nextSecondInList});
        }
        // Seconds exhausted for current minute, reset second and advance minute
        candidate = candidate.with({second: bySecond[0]}).add({minutes: 1});
      } else {
        // No bySecond, advance by interval seconds
        candidate = candidate.add({seconds: interval});
      }

      // 2. Process Minutes (after potential second advancement/rollover)
      if (byMinute && byMinute.length > 0) {
        // Check if the new minute is valid or needs further advancement
        if (
          !byMinute.includes(candidate.minute) ||
          (candidate.minute === zdt.minute && candidate.second < zdt.second)
        ) {
          const nextMinuteInList = byMinute.find((m) => m > candidate.minute);
          if (nextMinuteInList !== undefined) {
            return candidate.with({minute: nextMinuteInList, second: bySecond ? bySecond[0] : 0});
          }
          // Minutes exhausted for current hour, reset minute and advance hour
          candidate = candidate.with({minute: byMinute[0], second: bySecond ? bySecond[0] : 0}).add({hours: 1});
        }
      }

      // 3. Process Hours (after potential minute advancement/rollover)
      if (byHour && byHour.length > 0) {
        // Check if the new hour is valid or needs further advancement
        if (!byHour.includes(candidate.hour) || (candidate.hour === zdt.hour && candidate.minute < zdt.minute)) {
          const nextHourInList = byHour.find((h) => h > candidate.hour);
          if (nextHourInList !== undefined) {
            return candidate.with({
              hour: nextHourInList,
              minute: byMinute ? byMinute[0] : 0,
              second: bySecond ? bySecond[0] : 0,
            });
          }
          // Hours exhausted for current day, reset hour and advance day
          candidate = candidate
            .with({hour: byHour[0], minute: byMinute ? byMinute[0] : 0, second: bySecond ? bySecond[0] : 0})
            .add({days: 1});
        }
      }

      // If we reached here, all time components have been processed and advanced as needed.
      return candidate;
    }

    if (byMinute && byMinute.length > 1) {
      const idx = byMinute.indexOf(zdt.minute);
      if (idx !== -1 && idx < byMinute.length - 1) {
        // next minute within the same hour
        return zdt.with({
          minute: byMinute[idx + 1],
          second: bySecond ? bySecond[0] : zdt.second,
        });
      }
      // For MINUTELY frequency, when we reach the last BYMINUTE value, advance to next valid hour
      if (freq === 'MINUTELY' && idx === byMinute.length - 1) {
        if (byHour && byHour.length > 0) {
          const currentHourIdx = byHour.indexOf(zdt.hour);
          if (currentHourIdx !== -1 && currentHourIdx < byHour.length - 1) {
            // next hour on same day
            return zdt.with({
              hour: byHour[currentHourIdx + 1],
              minute: byMinute[0],
              second: bySecond ? bySecond[0] : zdt.second,
            });
          } else {
            // last hour for today, advance day and take first hour
            return this.applyTimeOverride(zdt.add({days: 1}));
          }
        }
        // No byHour, just advance by interval
        return zdt.add({hours: interval}).with({
          minute: byMinute[0],
          second: bySecond ? bySecond[0] : zdt.second,
        });
      }
    }

    if (byHour && byHour.length > 1) {
      const idx = byHour.indexOf(zdt.hour);
      if (idx !== -1 && idx < byHour.length - 1) {
        // next hour on the same day
        return zdt.with({
          hour: byHour[idx + 1],
          minute: byMinute ? byMinute[0] : zdt.minute,
          second: bySecond ? bySecond[0] : zdt.second,
        });
      }
    }

    // For HOURLY frequency with BYHOUR, after exhausting same-day hours,
    // advance to the next day and use the first BYHOUR
    if (freq === 'HOURLY' && byHour && byHour.length > 1) {
      return this.applyTimeOverride(zdt.add({days: 1}));
    }
    // we were already at the last BYHOUR/BYMINUTE/BYSECOND -> advance the date
    return this.applyTimeOverride(this.rawAdvance(zdt));
  }

  /**
   * Re-asserts the time of day an occurrence is supposed to have.
   *
   * A BYxxx part wins where one is given. Where none is, RFC 5545 3.3.10 takes the value from
   * DTSTART, so that is what gets restored here -- the same fallback the candidate generators
   * already apply (`this.opts.byHour ?? [this.originalDtstart.hour]`).
   *
   * Restoring it matters because advancing a cursor across a spring-forward gap moves the wall
   * time: 02:30 + 1 day lands on a time that does not exist and `compatible` disambiguation
   * resolves it to 03:30. Without re-asserting DTSTART's time, that shifted time is what the next
   * advance builds on, so every later occurrence in the series keeps it.
   *
   * Only fields the frequency does not own are pinned: HOURLY advances the hour, MINUTELY the
   * minute, SECONDLY the second, so those are left alone.
   */
  private applyTimeOverride(zdt: Temporal.ZonedDateTime): Temporal.ZonedDateTime {
    const {freq, byHour, byMinute, bySecond} = this.opts;
    // Only frequencies that repeat a fixed time of day take it from DTSTART. HOURLY, MINUTELY and
    // SECONDLY advance within the day, so their time fields are the iteration's own business.
    const dtstartTime = freq === 'DAILY' || freq === 'WEEKLY' || freq === 'MONTHLY' || freq === 'YEARLY';
    if (!byHour && !byMinute && !bySecond && !dtstartTime) return zdt;

    const fields: {hour?: number; minute?: number; second?: number} = {};
    if (byHour) fields.hour = byHour[0];
    else if (dtstartTime) fields.hour = this.originalDtstart.hour;

    if (byMinute) fields.minute = byMinute[0];
    else if (dtstartTime) fields.minute = this.originalDtstart.minute;

    if (bySecond) fields.second = bySecond[0];
    else if (dtstartTime) fields.second = this.originalDtstart.second;

    // Most calendar steps already carry the intended time. Avoid rebuilding
    // an identical ZonedDateTime for every occurrence on these common paths.
    if (dtstartTime && fields.hour === zdt.hour && fields.minute === zdt.minute && fields.second === zdt.second) {
      return zdt;
    }
    return zdt.with(fields);
  }

  private computeFirst(): Temporal.ZonedDateTime {
    let zdt = this.originalDtstart;

    // If BYWEEKNO is present with small frequencies, jump to the first matching week
    if (this.opts.byWeekNo?.length && ['DAILY', 'HOURLY', 'MINUTELY', 'SECONDLY'].includes(this.opts.freq)) {
      let targetWeek = this.opts.byWeekNo[0]!;
      let targetYear = zdt.year;

      // Find the first year >= dtstart.year that has the target week
      while (targetYear <= zdt.year + 10) {
        // reasonable upper bound
        const jan1 = zdt.with({year: targetYear, month: 1, day: 1});
        const dec31 = zdt.with({year: targetYear, month: 12, day: 31});

        // Check if this year has the target week
        let hasTargetWeek = false;
        if (targetWeek > 0) {
          let maxWeek = 52;
          if (jan1.dayOfWeek === 4 || dec31.dayOfWeek === 4) {
            maxWeek = 53;
          }
          hasTargetWeek = targetWeek <= maxWeek;
        } else {
          // Negative week number
          let maxWeek = 52;
          if (jan1.dayOfWeek === 4 || dec31.dayOfWeek === 4) {
            maxWeek = 53;
          }
          hasTargetWeek = -targetWeek <= maxWeek;
        }

        if (hasTargetWeek) {
          // Calculate the first day of the target week
          const firstThursday = jan1.add({days: (4 - jan1.dayOfWeek + 7) % 7});
          let weekStart: Temporal.ZonedDateTime;

          if (targetWeek > 0) {
            weekStart = firstThursday.subtract({days: 3}).add({weeks: targetWeek - 1});
          } else {
            const lastWeek = jan1.dayOfWeek === 4 || dec31.dayOfWeek === 4 ? 53 : 52;
            weekStart = firstThursday.subtract({days: 3}).add({weeks: lastWeek + targetWeek});
          }

          // If we have BYDAY, find the specific day in that week
          if (this.opts.byDay?.length) {
            const dayMap = weekdayToIsoDay;

            const targetDays = this.opts.byDay
              .map((tok) => extractWeekdayToken(tok))
              .filter((day): day is Weekday => day !== null)
              .map((day) => dayMap[day]!)
              .filter(Boolean);

            if (targetDays.length) {
              const candidates = targetDays.map((dayOfWeek) => {
                const delta = (dayOfWeek - weekStart.dayOfWeek + 7) % 7;
                return weekStart.add({days: delta});
              });

              const firstCandidate = candidates.sort((a, b) => Temporal.ZonedDateTime.compare(a, b))[0];
              if (firstCandidate && Temporal.ZonedDateTime.compare(firstCandidate, this.originalDtstart) >= 0) {
                zdt = firstCandidate;
                break;
              }
            }
          } else {
            // No BYDAY, use the start of the week
            if (Temporal.ZonedDateTime.compare(weekStart, this.originalDtstart) >= 0) {
              zdt = weekStart;
              break;
            }
          }
        }

        targetYear++;
      }
    }

    // If BYDAY is present, advance zdt to the first matching weekday ≥ DTSTART.
    // When the frequency is smaller than a week (e.g. HOURLY or SECONDLY),
    // iterating one unit at a time until the desired weekday can be extremely
    // slow.  We instead jump directly to the next matching weekday whenever all
    // BYDAY tokens are simple two-letter codes (e.g. "MO").
    if (this.opts.byDay?.length && !this.opts.byWeekNo) {
      const dayMap = weekdayToIsoDay;

      // Check if we have ordinal BYDAY tokens (e.g., "1TU", "-1TH")
      const hasOrdinalTokens = this.opts.byDay.some((tok) => /^[+-]?\d/.test(tok));

      if (hasOrdinalTokens && this.opts.byMonth && (this.opts.freq === 'MINUTELY' || this.opts.freq === 'SECONDLY')) {
        // Handle ordinal BYDAY tokens with BYMONTH for MINUTELY/SECONDLY frequency - find the first matching occurrence
        const months = this.opts.byMonth.filter((v): v is number => typeof v === 'number').sort((a, b) => a - b);
        let foundFirst = false;

        // Start from the current year and month, then check future months
        for (let year = zdt.year; year <= zdt.year + 10 && !foundFirst; year++) {
          for (const month of months) {
            // Skip past months in the current year
            if (year === zdt.year && month < zdt.month) continue;

            const monthSample = zdt.with({year, month, day: 1});
            const monthlyOccs = this.generateMonthlyOccurrences(monthSample);

            for (const occ of monthlyOccs) {
              if (Temporal.ZonedDateTime.compare(occ, zdt) >= 0) {
                if (!occ.toPlainDate().equals(zdt.toPlainDate())) {
                  zdt = this.applyTimeOverride(occ.with({hour: 0, minute: 0, second: 0}));
                } else {
                  zdt = occ;
                }
                foundFirst = true;
                break;
              }
            }
            if (foundFirst) break;
          }
        }
      } else {
        // Handle simple weekday tokens or non-BYMONTH cases
        let deltas: number[];
        const weekdayTokens = this.opts.byDay
          .map((tok) => extractWeekdayToken(tok))
          .filter((tok): tok is Weekday => tok !== null);
        if (
          ['DAILY', 'HOURLY', 'MINUTELY', 'SECONDLY'].includes(this.opts.freq) &&
          weekdayTokens.length === this.opts.byDay.length
        ) {
          deltas = weekdayTokens.map((tok) => (dayMap[tok]! - zdt.dayOfWeek + 7) % 7);
        } else {
          deltas = weekdayTokens.map((wdTok) => (dayMap[wdTok]! - zdt.dayOfWeek + 7) % 7);
        }

        if (deltas.length) {
          zdt = zdt.add({days: Math.min(...deltas)});
        }
      }
    }

    // Apply time overrides based on frequency and BYHOUR/BYMINUTE/BYSECOND
    const {byHour, byMinute, bySecond} = this.opts;

    // For HOURLY frequency without BYHOUR, start from 00:00 only if we jumped to a different date
    if (
      this.opts.freq === 'HOURLY' &&
      !byHour &&
      Temporal.ZonedDateTime.compare(
        zdt.with({hour: 0, minute: 0, second: 0, microsecond: 0, nanosecond: 0}),
        this.originalDtstart,
      ) > 0
    ) {
      zdt = zdt.with({hour: 0, minute: 0, second: 0, microsecond: 0, nanosecond: 0});
    }

    // For MINUTELY frequency without BYMINUTE, start from 00:00 only if we jumped to a different date
    if (
      this.opts.freq === 'MINUTELY' &&
      !byMinute &&
      Temporal.ZonedDateTime.compare(
        zdt.with({hour: 0, minute: 0, second: 0, microsecond: 0, nanosecond: 0}),
        this.originalDtstart,
      ) > 0
    ) {
      zdt = zdt.with({hour: 0, minute: 0, second: 0, microsecond: 0, nanosecond: 0});
    }

    // For SECONDLY frequency with BYWEEKNO without BYSECOND, start from 00:00 only if we jumped to a different date
    if (
      this.opts.freq === 'SECONDLY' &&
      this.opts.byWeekNo?.length &&
      !bySecond &&
      Temporal.ZonedDateTime.compare(
        zdt.with({hour: 0, minute: 0, second: 0, microsecond: 0, nanosecond: 0}),
        this.originalDtstart,
      ) > 0
    ) {
      zdt = zdt.with({hour: 0, minute: 0, second: 0, microsecond: 0, nanosecond: 0});
    }

    if (byHour || byMinute || bySecond) {
      const candidates = this.expandByTime(zdt);
      for (const candidate of candidates) {
        if (Temporal.ZonedDateTime.compare(candidate, this.originalDtstart) >= 0) {
          return candidate;
        }
      }

      // No candidates found on the start date that are >= dtstart.
      // Advance to the next interval and return the first possible time.
      zdt = this.applyTimeOverride(this.rawAdvance(zdt));
    }

    return zdt;
  }

  // --- NEW: constraint checks ---
  // 2) Replace your matchesByDay with this:
  private matchesByDay(zdt: Temporal.ZonedDateTime): boolean {
    const {byDay, freq} = this.opts;
    if (!byDay) return true;

    if (!this.hasOrdinalByDay) {
      return this.simpleByDayIsoDays?.includes(zdt.dayOfWeek) ?? false;
    }

    for (const token of this.parsedByDayTokens ?? []) {
      if (freq === 'DAILY' && zdt.dayOfWeek === token.isoDay) return true;

      // no ordinal -> simple weekday match
      if (token.ord === 0) {
        if (zdt.dayOfWeek === token.isoDay) return true;
        continue;
      }

      // build all days in month with this weekday
      const month = zdt.month;
      let dt = zdt.with({day: 1});
      const candidates: number[] = [];
      while (dt.month === month) {
        if (dt.dayOfWeek === token.isoDay) candidates.push(dt.day);
        dt = dt.add({days: 1});
      }

      // pick the “ord-th” entry (supports negative ord)
      const idx = token.ord > 0 ? token.ord - 1 : candidates.length + token.ord;
      if (candidates[idx] === zdt.day) return true;
    }

    return false;
  }

  private matchesByMonth(zdt: Temporal.ZonedDateTime): boolean {
    const {byMonth} = this.opts;
    if (!byMonth) return true;
    // Only numeric BYMONTH values are applicable in the Gregorian engine.
    const nums = byMonth.filter((v): v is number => typeof v === 'number');
    if (nums.length === 0) return true; // nothing enforceable here
    return nums.includes(zdt.month);
  }

  private matchesNumericConstraint(value: number, constraints: number[], maxPositiveValue: number): boolean {
    return constraints.some((c) => {
      const target = c > 0 ? c : maxPositiveValue + c + 1;
      return value === target;
    });
  }

  private matchesByMonthDay(zdt: Temporal.ZonedDateTime): boolean {
    const {byMonthDay} = this.opts;
    if (!byMonthDay) return true;
    const lastDay = zdt.with({day: 1}).add({months: 1}).subtract({days: 1}).day;
    return this.matchesNumericConstraint(zdt.day, byMonthDay, lastDay);
  }

  private matchesByHour(zdt: Temporal.ZonedDateTime): boolean {
    const {byHour} = this.opts;
    if (!byHour) return true;
    if (byHour.includes(zdt.hour)) {
      return true;
    }

    // Handle DST spring-forward case. Check if any of the hours specified
    // in the rule, when applied, would result in the hour of the candidate time.
    for (const h of byHour) {
      const intendedTime = zdt.with({hour: h});
      if (intendedTime.hour === zdt.hour) {
        // This indicates that setting the hour to `h` resulted in `zdt.hour`,
        // which is the signature of a DST jump where `h` was the skipped hour.
        return true;
      }
    }

    return false;
  }

  private matchesByMinute(zdt: Temporal.ZonedDateTime): boolean {
    const {byMinute} = this.opts;
    if (!byMinute) return true;
    return byMinute.includes(zdt.minute);
  }

  private matchesBySecond(zdt: Temporal.ZonedDateTime): boolean {
    const {bySecond} = this.opts;
    if (!bySecond) return true;
    return bySecond.includes(zdt.second);
  }

  private matchesAll(zdt: Temporal.ZonedDateTime): boolean {
    return (
      this.matchesByMonth(zdt) &&
      this.matchesByWeekNo(zdt) &&
      this.matchesByYearDay(zdt) &&
      this.matchesByMonthDay(zdt) &&
      this.matchesByDay(zdt) &&
      this.matchesByHour(zdt) &&
      this.matchesByMinute(zdt) &&
      this.matchesBySecond(zdt)
    );
  }

  private matchesByYearDay(zdt: Temporal.ZonedDateTime): boolean {
    const {byYearDay} = this.opts;
    if (!byYearDay) return true;
    const dayOfYear = zdt.dayOfYear;
    const last = zdt.with({month: 12, day: 31}).dayOfYear;
    return this.matchesNumericConstraint(dayOfYear, byYearDay, last);
  }

  private getIsoWeekInfo(zdt: Temporal.ZonedDateTime): {week: number; year: number} {
    // Using ISO 8601 week date system. Week starts on Monday.
    // The week year is the year of the Thursday of that week.
    const thursday = zdt.add({days: 4 - zdt.dayOfWeek});
    const year = thursday.year;

    // The first Thursday of the ISO week year.
    const jan1 = zdt.with({year, month: 1, day: 1});
    const firstThursday = jan1.add({days: (4 - jan1.dayOfWeek + 7) % 7});

    const diffDays = thursday.toPlainDate().since(firstThursday.toPlainDate()).days;
    const week = Math.floor(diffDays / 7) + 1;
    return {week, year};
  }

  private matchesByWeekNo(zdt: Temporal.ZonedDateTime): boolean {
    const {byWeekNo} = this.opts;
    if (!byWeekNo) return true;

    const {week, year} = this.getIsoWeekInfo(zdt);

    const jan1 = zdt.with({year, month: 1, day: 1});
    const isLeapYear = jan1.inLeapYear;
    const lastWeek = jan1.dayOfWeek === 4 || (isLeapYear && jan1.dayOfWeek === 3) ? 53 : 52;

    return byWeekNo.some((wn) => {
      if (wn > 0) {
        return week === wn;
      } else {
        return week === lastWeek + wn + 1;
      }
    });
  }

  /**
   * Gregorian weekday and leap-year patterns repeat every 400 years. Checking
   * a complete cycle lets impossible BYYEARDAY + BYWEEKNO intersections stop
   * without incorrectly judging the rule from DTSTART's year alone.
   */
  private hasPossibleYearDayWeekNoCombination(): boolean {
    if (!this.opts.byYearDay || !this.opts.byWeekNo) return true;

    let yearStart = this.originalDtstart.with({
      year: 2000,
      month: 1,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
      microsecond: 0,
      nanosecond: 0,
    });
    for (let offset = 0; offset < 400; offset++) {
      const daysInYear = yearStart.daysInYear;
      for (const yearDay of this.opts.byYearDay) {
        const resolvedDay = yearDay > 0 ? yearDay : daysInYear + yearDay + 1;
        if (
          resolvedDay >= 1 &&
          resolvedDay <= daysInYear &&
          this.matchesByWeekNo(yearStart.add({days: resolvedDay - 1}))
        ) {
          return true;
        }
      }
      yearStart = yearStart.add({years: 1});
    }
    return false;
  }

  options(): RRuleResolvedOptions<TOutput> {
    const {dtstart, until, rDate, exDate, temporal: _temporal, ...rest} = this.cloneOptions();
    return {
      ...rest,
      ...(this.outputTemporal ? {temporal: this.outputTemporal} : {}),
      dtstart: this.toPublicDate(dtstart)!,
      until: until ? this.toPublicDate(until)! : undefined,
      rDate: rDate ? this.toPublicDates(rDate) : undefined,
      exDate: exDate ? this.toPublicDates(exDate) : undefined,
    } as RRuleResolvedOptions<TOutput>;
  }

  private cloneOptions(): ManualOpts {
    const {
      byHour,
      byMinute,
      bySecond,
      byDay,
      byMonth,
      byMonthDay,
      byYearDay,
      byWeekNo,
      bySetPos,
      rDate,
      exDate,
      ...rest
    } = this.opts;

    return {
      ...rest,
      byHour: byHour ? [...byHour] : undefined,
      byMinute: byMinute ? [...byMinute] : undefined,
      bySecond: bySecond ? [...bySecond] : undefined,
      byDay: byDay ? [...byDay] : undefined,
      byMonth: byMonth ? [...byMonth] : undefined,
      byMonthDay: byMonthDay ? [...byMonthDay] : undefined,
      byYearDay: byYearDay ? [...byYearDay] : undefined,
      byWeekNo: byWeekNo ? [...byWeekNo] : undefined,
      bySetPos: bySetPos ? [...bySetPos] : undefined,
      rDate: rDate ? [...rDate] : undefined,
      exDate: exDate ? [...exDate] : undefined,
    } as ManualOpts;
  }

  private cloneUpdateOptions(updates: Partial<ManualOptions<TOutput>>): Partial<ManualOptions<TOutput>> {
    const cloned: Partial<ManualOptions<TOutput>> = {};
    if (Object.prototype.hasOwnProperty.call(updates, 'byHour')) {
      cloned.byHour = Array.isArray(updates.byHour) ? [...updates.byHour] : updates.byHour;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'byMinute')) {
      cloned.byMinute = Array.isArray(updates.byMinute) ? [...updates.byMinute] : updates.byMinute;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'bySecond')) {
      cloned.bySecond = Array.isArray(updates.bySecond) ? [...updates.bySecond] : updates.bySecond;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'byDay')) {
      cloned.byDay = Array.isArray(updates.byDay) ? [...updates.byDay] : updates.byDay;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'byMonth')) {
      cloned.byMonth = Array.isArray(updates.byMonth) ? [...updates.byMonth] : updates.byMonth;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'byMonthDay')) {
      cloned.byMonthDay = Array.isArray(updates.byMonthDay) ? [...updates.byMonthDay] : updates.byMonthDay;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'byYearDay')) {
      cloned.byYearDay = Array.isArray(updates.byYearDay) ? [...updates.byYearDay] : updates.byYearDay;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'byWeekNo')) {
      cloned.byWeekNo = Array.isArray(updates.byWeekNo) ? [...updates.byWeekNo] : updates.byWeekNo;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'bySetPos')) {
      cloned.bySetPos = Array.isArray(updates.bySetPos) ? [...updates.bySetPos] : updates.bySetPos;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'rDate')) {
      cloned.rDate = Array.isArray(updates.rDate) ? [...updates.rDate] : updates.rDate;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'exDate')) {
      cloned.exDate = Array.isArray(updates.exDate) ? [...updates.exDate] : updates.exDate;
    }
    return cloned;
  }

  /**
   * Create a new {@link RRuleTemporal} instance with modified options while keeping the current one unchanged.
   *
   * @example
   * ```ts
   * const updated = rule.with({byMonthDay: [3]});
   * ```
   */
  with(updates: Partial<ManualOptions<TOutput>>): RRuleTemporal<TOutput> {
    const merged = {
      ...this.cloneOptions(),
      ...updates,
      ...this.cloneUpdateOptions(updates),
      tzid: updates.tzid ?? this.opts.tzid,
      dtstart: updates.dtstart ?? this.opts.dtstart,
    } as RRuleOptions<TOutput>;

    return new RRuleTemporal<TOutput>(merged);
  }

  private addDtstartIfNeeded(dates: Temporal.ZonedDateTime[], iterator?: InternalRRuleTemporalIterator): boolean {
    if (this.includeDtstart && !this.matchesAll(this.originalDtstart)) {
      // Skip if dtstart is excluded and we have an iterator
      if (iterator && this.isExcluded(this.originalDtstart)) {
        return true; // continue without adding
      }
      if (iterator && !iterator(this.originalDtstart, dates.length)) {
        return false; // stop
      }
      dates.push(this.originalDtstart);
      if (this.shouldBreakForCountLimit(dates.length)) {
        return false; // stop
      }
    }
    return true; // continue
  }

  private canUseUtcLinearFastPath(iterator?: InternalRRuleTemporalIterator): boolean {
    if (iterator || this.tzid !== 'UTC' || this.opts.rscale) {
      return false;
    }
    if (
      (this.opts.rDate || this.opts.exDate) &&
      (this.originalDtstart.timeZoneId !== this.tzid ||
        this.originalDtstart.calendarId !== 'iso8601' ||
        this.opts.byHour ||
        this.opts.byMinute ||
        this.opts.bySecond)
    ) {
      return false;
    }

    if (this.opts.byMonth || this.opts.byMonthDay || this.opts.byYearDay || this.opts.byWeekNo || this.opts.bySetPos) {
      return false;
    }

    switch (this.opts.freq) {
      case 'DAILY':
        return (
          !this.hasOrdinalByDay &&
          (!this.opts.byHour || this.canUseEpochMillisecondsPrecisionFlag) &&
          (!this.opts.byMinute || this.canUseEpochMillisecondsPrecisionFlag) &&
          (!this.opts.bySecond || this.canUseEpochMillisecondsPrecisionFlag)
        );
      case 'HOURLY':
      case 'MINUTELY':
      case 'SECONDLY':
        return !this.opts.byDay && !this.opts.byHour && !this.opts.byMinute && !this.opts.bySecond;
      default:
        return false;
    }
  }

  private canUseUtcWeeklyFastPath(iterator?: InternalRRuleTemporalIterator): boolean {
    return (
      !iterator &&
      this.tzid === 'UTC' &&
      this.opts.freq === 'WEEKLY' &&
      !this.opts.rscale &&
      !this.opts.rDate &&
      !this.opts.exDate &&
      !this.opts.byMonth &&
      !this.opts.byMonthDay &&
      !this.opts.byYearDay &&
      !this.opts.byWeekNo &&
      !this.opts.bySetPos &&
      (!this.opts.byHour || this.canUseEpochMillisecondsPrecisionFlag) &&
      (!this.opts.byMinute || this.canUseEpochMillisecondsPrecisionFlag) &&
      (!this.opts.bySecond || this.canUseEpochMillisecondsPrecisionFlag) &&
      !this.hasOrdinalByDay
    );
  }

  private canUseUtcMonthlyFastPath(iterator?: InternalRRuleTemporalIterator): boolean {
    return (
      !iterator &&
      this.tzid === 'UTC' &&
      this.opts.freq === 'MONTHLY' &&
      !this.opts.rscale &&
      !this.opts.rDate &&
      !this.opts.exDate &&
      !this.opts.byYearDay &&
      !this.opts.byWeekNo &&
      this.canUseEpochMillisecondsPrecisionFlag &&
      this.hasSingleExpandedTimeSlot() &&
      !!(this.opts.byDay || this.opts.byMonthDay)
    );
  }

  private utcZdtFromEpochNanoseconds(epochNanoseconds: bigint): Temporal.ZonedDateTime {
    return new Temporal.ZonedDateTime(epochNanoseconds, 'UTC');
  }

  private utcZdtFromEpochMilliseconds(epochMilliseconds: number): Temporal.ZonedDateTime {
    return new Temporal.ZonedDateTime(BigInt(epochMilliseconds) * NS_PER_MILLISECOND, 'UTC');
  }

  private canUseUtcEpochMillisecondsPrecision(): boolean {
    return this.canUseEpochMillisecondsPrecisionFlag;
  }

  private buildTimeSlotOffsetsMs(): number[] | undefined {
    if (!this.canUseEpochMillisecondsPrecisionFlag) return undefined;

    const hours = this.opts.byHour ?? [this.originalDtstart.hour];
    const minutes = this.opts.byMinute ?? [this.originalDtstart.minute];
    const seconds = this.opts.bySecond ?? [this.originalDtstart.second];
    const baseMilliseconds = this.originalDtstart.millisecond;
    const offsets: number[] = [];

    for (const hour of hours) {
      for (const minute of minutes) {
        for (const second of seconds) {
          offsets.push(((hour * 60 + minute) * 60 + second) * MS_PER_SECOND + baseMilliseconds);
        }
      }
    }

    return offsets;
  }

  private createNumericQueryPlan(
    kind: NumericQueryPlan['kind'],
    maximumCount: number,
    select: (index: number) => NumericCandidate | null,
    directLowerBound?: (targetEpochNanoseconds: bigint, strict: boolean) => number,
  ): NumericQueryPlan | null {
    const first = select(0);
    const last = select(maximumCount - 1);
    if (
      !first ||
      !last ||
      !isSafeTemporalEpochMilliseconds(first.epochMilliseconds) ||
      !isSafeTemporalEpochMilliseconds(last.epochMilliseconds) ||
      first.epochMilliseconds > last.epochMilliseconds
    ) {
      return null;
    }

    const findLowerBound = (targetEpochNanoseconds: bigint, strict: boolean, high: number): number => {
      if (directLowerBound) {
        return Math.max(0, Math.min(high, directLowerBound(targetEpochNanoseconds, strict)));
      }

      let low = 0;
      let upper = high;
      while (low < upper) {
        const middle = low + Math.floor((upper - low) / 2);
        const candidate = select(middle);
        if (!candidate) {
          upper = middle;
          continue;
        }
        const candidateEpochNanoseconds = BigInt(candidate.epochMilliseconds) * NS_PER_MILLISECOND;
        const isAtOrAfter = strict
          ? candidateEpochNanoseconds > targetEpochNanoseconds
          : candidateEpochNanoseconds >= targetEpochNanoseconds;
        if (isAtOrAfter) {
          upper = middle;
        } else {
          low = middle + 1;
        }
      }
      return low;
    };

    const untilEpochNanoseconds = this.opts.until?.epochNanoseconds;
    const count =
      untilEpochNanoseconds === undefined ? maximumCount : findLowerBound(untilEpochNanoseconds, true, maximumCount);

    return {
      kind,
      count,
      maximumCount,
      select: (index) => {
        if (!Number.isSafeInteger(index) || index < 0 || index >= maximumCount) return null;
        return select(index);
      },
      lowerBound: (targetEpochNanoseconds, strict) => findLowerBound(targetEpochNanoseconds, strict, count),
    };
  }

  private buildFixedStepNumericQueryPlan(maximumCount: number): NumericQueryPlan | null {
    let unitMilliseconds: number;
    switch (this.opts.freq) {
      case 'HOURLY':
        unitMilliseconds = MS_PER_HOUR;
        break;
      case 'MINUTELY':
        unitMilliseconds = MS_PER_MINUTE;
        break;
      case 'SECONDLY':
        unitMilliseconds = MS_PER_SECOND;
        break;
      default:
        return null;
    }

    // rawAdvance() deliberately skips a repeated named-zone hour for this
    // one shape, so it is not an epoch arithmetic progression.
    const isNamedZone =
      !['UTC', 'Etc/UTC', 'Etc/GMT'].includes(this.tzid) && !/^[-+]\d{2}:?\d{2}(?::?\d{2})?$/.test(this.tzid);
    if (isNamedZone && this.opts.freq === 'HOURLY' && this.opts.interval === 1) {
      return null;
    }

    const startMilliseconds = this.originalDtstart.epochMilliseconds;
    const stepMilliseconds = unitMilliseconds * this.opts.interval!;
    if (!Number.isSafeInteger(stepMilliseconds) || stepMilliseconds <= 0) {
      return null;
    }

    const select = (index: number): NumericCandidate | null => {
      const epochMilliseconds = startMilliseconds + index * stepMilliseconds;
      if (!isSafeTemporalEpochMilliseconds(epochMilliseconds)) return null;
      return {epochMilliseconds, periodIndex: index, occurrenceIndex: index};
    };

    const startEpochNanoseconds = BigInt(startMilliseconds) * NS_PER_MILLISECOND;
    const stepEpochNanoseconds = BigInt(stepMilliseconds) * NS_PER_MILLISECOND;
    const countAsBigInt = BigInt(maximumCount);
    const directLowerBound = (targetEpochNanoseconds: bigint, strict: boolean): number => {
      const delta = targetEpochNanoseconds - startEpochNanoseconds;
      const rawIndex = strict
        ? floorDivBigInt(delta, stepEpochNanoseconds) + 1n
        : ceilDivBigInt(delta, stepEpochNanoseconds);
      if (rawIndex <= 0n) return 0;
      if (rawIndex >= countAsBigInt) return maximumCount;
      return Number(rawIndex);
    };

    return this.createNumericQueryPlan('fixed-step', maximumCount, select, directLowerBound);
  }

  private resolveNumericWallMilliseconds(wallMilliseconds: number): number | null {
    if (!isSafeTemporalEpochMilliseconds(wallMilliseconds)) return null;
    if (this.tzid === 'UTC') return wallMilliseconds;
    const resolution = this.getZoneResolver().epochMsForWall(wallMilliseconds);
    if (resolution.pushed || !isSafeTemporalEpochMilliseconds(resolution.epochMs)) return null;
    return resolution.epochMs;
  }

  private numericQueryGapHazard(timeOfDayMilliseconds: number, lastEpochMilliseconds: number): boolean {
    if (this.tzid === 'UTC') return false;
    const startEpochMilliseconds = this.originalDtstart.epochMilliseconds;
    const MAX_SPAN_MS = 200 * 366 * MS_PER_DAY;
    if (lastEpochMilliseconds - startEpochMilliseconds > MAX_SPAN_MS) return true;
    return this.getZoneResolver().timeOfDayMayHitGap(
      timeOfDayMilliseconds,
      startEpochMilliseconds - MS_PER_DAY,
      lastEpochMilliseconds + MS_PER_DAY,
    );
  }

  private buildDailyNumericQueryPlan(maximumCount: number): NumericQueryPlan | null {
    const interval = this.opts.interval!;
    const startEpochMilliseconds = this.originalDtstart.epochMilliseconds;
    const startWallMilliseconds = this.tzid === 'UTC' ? startEpochMilliseconds : this.wallMsOf(this.originalDtstart);
    const startEpochDay = Math.floor(startWallMilliseconds / MS_PER_DAY);
    const startDayOfWeek = isoDayOfWeekOfEpochDay(startEpochDay);
    const allowedDayMask = weekdayMask(this.simpleByDayIsoDays);
    const hasExpandedTime = Boolean(this.opts.byHour || this.opts.byMinute || this.opts.bySecond);

    if (!hasExpandedTime) {
      const timeOfDayMilliseconds = startWallMilliseconds - startEpochDay * MS_PER_DAY;
      const firstMatchingStep = this.simpleByDayIsoDays?.length
        ? this.findFirstMatchingDailyStep(startDayOfWeek, interval, this.simpleByDayIsoDays)
        : 0;
      if (firstMatchingStep === null) return null;

      const cyclePeriods = 7 / gcd(interval, 7);
      const matchingPeriodOffsets: number[] = [];
      for (let offset = 0; offset < cyclePeriods; offset++) {
        const rawPeriod = firstMatchingStep + offset;
        const dayOfWeek = addIsoDays(startDayOfWeek, rawPeriod * interval);
        if (includesIsoWeekday(allowedDayMask, dayOfWeek)) {
          matchingPeriodOffsets.push(offset);
        }
      }
      if (matchingPeriodOffsets.length === 0) return null;

      const select = (index: number): NumericCandidate | null => {
        const cycleIndex = Math.floor(index / matchingPeriodOffsets.length);
        const offsetIndex = index % matchingPeriodOffsets.length;
        const periodIndex = cycleIndex * cyclePeriods + matchingPeriodOffsets[offsetIndex]!;
        const rawPeriodIndex = firstMatchingStep + periodIndex;
        const dayDelta = rawPeriodIndex * interval;
        if (!Number.isSafeInteger(periodIndex) || !Number.isSafeInteger(dayDelta)) return null;
        const wallMilliseconds = startWallMilliseconds + dayDelta * MS_PER_DAY;
        const epochMilliseconds = this.resolveNumericWallMilliseconds(wallMilliseconds);
        if (epochMilliseconds === null) return null;
        return {epochMilliseconds, periodIndex, occurrenceIndex: index};
      };

      const plan = this.createNumericQueryPlan('daily', maximumCount, select);
      const last = plan?.select(maximumCount - 1);
      if (last && this.numericQueryGapHazard(timeOfDayMilliseconds, last.epochMilliseconds)) return null;
      return plan;
    }

    const timeSlotOffsets = this.timeSlotOffsetsMs;
    if (!timeSlotOffsets?.length || !this.hasUniqueTimeSlotOffsets) return null;

    const firstDayOffset = this.simpleByDayIsoDays?.length
      ? this.findFirstMatchingDailyStep(startDayOfWeek, 1, this.simpleByDayIsoDays)
      : 0;
    if (firstDayOffset === null) return null;
    const firstEpochDay = startEpochDay + firstDayOffset;
    const firstDayOfWeek = addIsoDays(startDayOfWeek, firstDayOffset);
    const cyclePeriods = 7 / gcd(interval, 7);

    const firstCandidates: NumericCandidate[] = [];
    if (includesIsoWeekday(allowedDayMask, firstDayOfWeek)) {
      for (const timeSlotOffset of timeSlotOffsets) {
        const epochMilliseconds = this.resolveNumericWallMilliseconds(firstEpochDay * MS_PER_DAY + timeSlotOffset);
        if (epochMilliseconds === null) return null;
        if (epochMilliseconds >= startEpochMilliseconds) {
          firstCandidates.push({
            epochMilliseconds,
            periodIndex: 0,
            occurrenceIndex: firstCandidates.length,
          });
        }
      }
    }

    const cycleSlots: Array<{periodOffset: number; timeSlotOffset: number}> = [];
    for (let periodOffset = 0; periodOffset < cyclePeriods; periodOffset++) {
      const periodIndex = 1 + periodOffset;
      const dayOfWeek = addIsoDays(firstDayOfWeek, periodIndex * interval);
      if (!includesIsoWeekday(allowedDayMask, dayOfWeek)) continue;
      for (const timeSlotOffset of timeSlotOffsets) {
        cycleSlots.push({periodOffset, timeSlotOffset});
      }
    }
    if (firstCandidates.length === 0 && cycleSlots.length === 0) return null;

    const select = (index: number): NumericCandidate | null => {
      if (index < firstCandidates.length) {
        return {...firstCandidates[index]!, occurrenceIndex: index};
      }
      if (cycleSlots.length === 0) return null;

      const remainingIndex = index - firstCandidates.length;
      const cycleIndex = Math.floor(remainingIndex / cycleSlots.length);
      const slot = cycleSlots[remainingIndex % cycleSlots.length]!;
      const periodIndex = 1 + cycleIndex * cyclePeriods + slot.periodOffset;
      const dayDelta = firstDayOffset + periodIndex * interval;
      if (!Number.isSafeInteger(periodIndex) || !Number.isSafeInteger(dayDelta)) return null;
      const wallMilliseconds = (startEpochDay + dayDelta) * MS_PER_DAY + slot.timeSlotOffset;
      const epochMilliseconds = this.resolveNumericWallMilliseconds(wallMilliseconds);
      if (epochMilliseconds === null) return null;
      return {epochMilliseconds, periodIndex, occurrenceIndex: index};
    };

    const plan = this.createNumericQueryPlan('daily', maximumCount, select);
    const last = plan?.select(maximumCount - 1);
    if (last && timeSlotOffsets.some((offset) => this.numericQueryGapHazard(offset, last.epochMilliseconds))) {
      return null;
    }
    return plan;
  }

  private buildWeeklyNumericQueryPlan(maximumCount: number): NumericQueryPlan | null {
    const timeSlotOffsets = this.timeSlotOffsetsMs;
    if (!timeSlotOffsets?.length || !this.hasUniqueTimeSlotOffsets) return null;

    const startEpochMilliseconds = this.originalDtstart.epochMilliseconds;
    const startWallMilliseconds = this.tzid === 'UTC' ? startEpochMilliseconds : this.wallMsOf(this.originalDtstart);
    const startEpochDay = Math.floor(startWallMilliseconds / MS_PER_DAY);
    const startDayOfWeek = isoDayOfWeekOfEpochDay(startEpochDay);
    const wkstToken = extractWeekdayToken(this.opts.wkst || 'MO') ?? 'MO';
    const wkstDay = weekdayToIsoDay[wkstToken] ?? 1;
    const targetDays = this.opts.byDay ? [...(this.allByDayIsoDays ?? [])] : [startDayOfWeek];
    const dayOffsets = targetDays.map((day) => (day - wkstDay + 7) % 7).sort((a, b) => a - b);
    if (dayOffsets.length === 0) return null;

    const weekStartOffset = (startDayOfWeek - wkstDay + 7) % 7;
    const firstWeekStartDay = startEpochDay - weekStartOffset;
    const weeklySlots = dayOffsets.flatMap((dayOffset) =>
      timeSlotOffsets.map((timeSlotOffset) => ({dayOffset, timeSlotOffset})),
    );

    const firstCandidates: NumericCandidate[] = [];
    for (const slot of weeklySlots) {
      const wallMilliseconds = (firstWeekStartDay + slot.dayOffset) * MS_PER_DAY + slot.timeSlotOffset;
      const epochMilliseconds = this.resolveNumericWallMilliseconds(wallMilliseconds);
      if (epochMilliseconds === null) return null;
      if (epochMilliseconds >= startEpochMilliseconds) {
        firstCandidates.push({
          epochMilliseconds,
          periodIndex: 0,
          occurrenceIndex: firstCandidates.length,
        });
      }
    }

    const select = (index: number): NumericCandidate | null => {
      if (index < firstCandidates.length) {
        return {...firstCandidates[index]!, occurrenceIndex: index};
      }
      const remainingIndex = index - firstCandidates.length;
      const periodIndex = 1 + Math.floor(remainingIndex / weeklySlots.length);
      const slot = weeklySlots[remainingIndex % weeklySlots.length]!;
      const weekDelta = periodIndex * this.opts.interval! * 7;
      if (!Number.isSafeInteger(periodIndex) || !Number.isSafeInteger(weekDelta)) return null;
      const wallMilliseconds = (firstWeekStartDay + weekDelta + slot.dayOffset) * MS_PER_DAY + slot.timeSlotOffset;
      const epochMilliseconds = this.resolveNumericWallMilliseconds(wallMilliseconds);
      if (epochMilliseconds === null) return null;
      return {epochMilliseconds, periodIndex, occurrenceIndex: index};
    };

    const plan = this.createNumericQueryPlan('weekly', maximumCount, select);
    const last = plan?.select(maximumCount - 1);
    if (last && timeSlotOffsets.some((offset) => this.numericQueryGapHazard(offset, last.epochMilliseconds))) {
      return null;
    }
    return plan;
  }

  private buildMonthlyNumericQueryPlan(maximumCount: number): NumericQueryPlan | null {
    const interval = this.opts.interval!;
    const timeSlotOffsets = this.timeSlotOffsetsMs;
    if (!timeSlotOffsets?.length || !this.hasUniqueTimeSlotOffsets) return null;
    if (this.opts.byMonth?.some((value) => typeof value !== 'number')) return null;
    if (this.opts.bySetPos && new Set(this.opts.bySetPos).size !== this.opts.bySetPos.length) return null;

    const startEpochMilliseconds = this.originalDtstart.epochMilliseconds;
    const startMonthIndex = this.originalDtstart.year * 12 + (this.originalDtstart.month - 1);
    const wallsForPeriod = (periodIndex: number): number[] | null => {
      const monthDelta = periodIndex * interval;
      const monthIndex = startMonthIndex + monthDelta;
      if (!Number.isSafeInteger(monthDelta) || !Number.isSafeInteger(monthIndex)) return null;
      const {year, month} = this.monthIndexToYearMonth(monthIndex);
      return this.generateMonthlyOccurrenceEpochsUtc(year, month);
    };

    const firstWalls = wallsForPeriod(0);
    if (!firstWalls) return null;
    const firstCandidates: NumericCandidate[] = [];
    for (const wallMilliseconds of firstWalls) {
      const epochMilliseconds = this.resolveNumericWallMilliseconds(wallMilliseconds);
      if (epochMilliseconds === null) return null;
      if (epochMilliseconds >= startEpochMilliseconds) {
        firstCandidates.push({
          epochMilliseconds,
          periodIndex: 0,
          occurrenceIndex: firstCandidates.length,
        });
      }
    }

    // Gregorian month/weekday shapes repeat after 4,800 months. Sampling
    // recurrence periods rather than every month preserves INTERVAL phase.
    const cyclePeriods = 4_800 / gcd(interval, 4_800);
    const requiredCycleOccurrences = Math.max(0, maximumCount - firstCandidates.length);
    const cyclePrefixCounts = [0];
    for (
      let periodOffset = 0;
      periodOffset < cyclePeriods && cyclePrefixCounts.at(-1)! < requiredCycleOccurrences;
      periodOffset++
    ) {
      const walls = wallsForPeriod(1 + periodOffset);
      if (!walls) return null;
      cyclePrefixCounts.push(cyclePrefixCounts[periodOffset]! + walls.length);
    }
    const precomputedPeriods = cyclePrefixCounts.length - 1;
    const completedCycle = precomputedPeriods === cyclePeriods;
    const occurrencesPerPrecomputedSpan = cyclePrefixCounts.at(-1)!;
    if (occurrencesPerPrecomputedSpan === 0 && firstCandidates.length < maximumCount) return null;

    const select = (index: number): NumericCandidate | null => {
      if (index < firstCandidates.length) {
        return {...firstCandidates[index]!, occurrenceIndex: index};
      }
      if (occurrencesPerPrecomputedSpan === 0) return null;

      const remainingIndex = index - firstCandidates.length;
      const cycleIndex = completedCycle ? Math.floor(remainingIndex / occurrencesPerPrecomputedSpan) : 0;
      const indexWithinCycle = completedCycle ? remainingIndex % occurrencesPerPrecomputedSpan : remainingIndex;
      if (indexWithinCycle >= occurrencesPerPrecomputedSpan) return null;
      let low = 1;
      let high = cyclePrefixCounts.length - 1;
      while (low < high) {
        const middle = low + Math.floor((high - low) / 2);
        if (cyclePrefixCounts[middle]! > indexWithinCycle) {
          high = middle;
        } else {
          low = middle + 1;
        }
      }

      const periodOffset = low - 1;
      const periodIndex = 1 + cycleIndex * cyclePeriods + periodOffset;
      if (!Number.isSafeInteger(periodIndex)) return null;
      const walls = wallsForPeriod(periodIndex);
      if (!walls) return null;
      const occurrenceWithinPeriod = indexWithinCycle - cyclePrefixCounts[periodOffset]!;
      const wallMilliseconds = walls[occurrenceWithinPeriod];
      if (wallMilliseconds === undefined) return null;
      const epochMilliseconds = this.resolveNumericWallMilliseconds(wallMilliseconds);
      if (epochMilliseconds === null) return null;
      return {epochMilliseconds, periodIndex, occurrenceIndex: index};
    };

    const plan = this.createNumericQueryPlan('monthly', maximumCount, select);
    const last = plan?.select(maximumCount - 1);
    if (last && timeSlotOffsets.some((offset) => this.numericQueryGapHazard(offset, last.epochMilliseconds))) {
      return null;
    }
    return plan;
  }

  /**
   * Build one Gregorian recurrence year's matching epoch days, without time
   * expansion. This deliberately covers the common YEARLY shapes
   * whose calendar membership repeats on the 400-year Gregorian cycle.
   */
  private generateYearlyOccurrenceDaysUtc(year: number): number[] {
    const hasDateExpansion = Boolean(this.opts.byDay || this.opts.byMonthDay);
    const byMonthOnly = Boolean(this.numericByMonths?.length) && !hasDateExpansion;
    const months = this.numericByMonths?.length
      ? [...this.numericByMonths].sort((left, right) => left - right)
      : hasDateExpansion
        ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
        : [this.originalDtstart.month];

    const calendarDays: Array<{month: number; day: number}> = [];
    if (this.hasOrdinalByDay && !this.numericByMonths?.length) {
      // With no BYMONTH, RFC 5545 interprets an ordinal BYDAY against the
      // complete year rather than independently in each month.
      const daysInYear = this.isGregorianLeapYear(year) ? 366 : 365;
      const firstDayOfWeek = this.gregorianIsoDayOfWeek(year, 1, 1);
      const lastDayOfWeek = addIsoDays(firstDayOfWeek, daysInYear - 1);
      const selectedYearDays = new Set<number>();
      for (const token of this.parsedByDayTokens ?? []) {
        if (token.ord === 0) continue;
        const yearDay =
          token.ord > 0
            ? 1 + ((token.isoDay - firstDayOfWeek + 7) % 7) + 7 * (token.ord - 1)
            : daysInYear - ((lastDayOfWeek - token.isoDay + 7) % 7) + 7 * (token.ord + 1);
        if (yearDay >= 1 && yearDay <= daysInYear) selectedYearDays.add(yearDay);
      }

      for (const yearDay of [...selectedYearDays].sort((left, right) => left - right)) {
        let remaining = yearDay;
        let month = 1;
        while (remaining > this.daysInGregorianMonth(year, month)) {
          remaining -= this.daysInGregorianMonth(year, month);
          month += 1;
        }
        calendarDays.push({month, day: remaining});
      }
    } else {
      for (const month of months) {
        let days: number[];
        if (byMonthOnly) {
          // _allYearlyByMonth() uses ZonedDateTime.with(), whose default
          // overflow behavior constrains (for example) January 31 to Feb 28.
          days = [Math.min(this.originalDtstart.day, this.daysInGregorianMonth(year, month))];
        } else if (!hasDateExpansion) {
          days = [this.originalDtstart.day];
        } else {
          days = this.generateMonthlyOccurrenceDaysUtc(year, month);
        }
        for (const day of days) calendarDays.push({month, day});
      }
    }

    return calendarDays.map(({month, day}) => gregorianEpochDay(year, month, day));
  }

  private generateYearlyOccurrenceEpochsUtc(year: number, applyBySetPos = true): number[] {
    const timeSlotOffsets = this.timeSlotOffsetsMs;
    if (!timeSlotOffsets?.length) return [];
    const walls: number[] = [];
    for (const epochDay of this.generateYearlyOccurrenceDaysUtc(year)) {
      const dayStartMilliseconds = epochDay * MS_PER_DAY;
      if (!isSafeTemporalEpochMilliseconds(dayStartMilliseconds)) return [];
      for (const timeSlotOffset of timeSlotOffsets) {
        walls.push(dayStartMilliseconds + timeSlotOffset);
      }
    }
    walls.sort((left, right) => left - right);

    if (!applyBySetPos || !this.opts.bySetPos?.length) return walls;
    const selected = this.applyBySetPosToSortedList(walls).sort((left, right) => left - right);
    return selected.filter((wall, index) => index === 0 || wall !== selected[index - 1]);
  }

  private yearlyCandidateEvaluationCountUtc(year: number): number {
    const candidateCount = this.generateYearlyOccurrenceEpochsUtc(year, false).length;
    const positions = this.opts.bySetPos;
    if (!positions?.length) return candidateCount;

    let positiveLimit = 0;
    let negativeLimit = 0;
    for (const position of positions) {
      if (position > 0) positiveLimit = Math.max(positiveLimit, position);
      else negativeLimit = Math.max(negativeLimit, -position);
    }
    return Math.min(candidateCount, positiveLimit) + Math.min(candidateCount, negativeLimit);
  }

  private buildYearlyNumericQueryPlan(maximumCount: number): NumericQueryPlan | null {
    const interval = this.opts.interval!;
    const timeSlotOffsets = this.timeSlotOffsetsMs;
    if (!timeSlotOffsets?.length || !this.hasUniqueTimeSlotOffsets) return null;
    if (this.opts.byMonth?.some((value) => typeof value !== 'number')) return null;
    if (this.opts.byYearDay || this.opts.byWeekNo) return null;

    const hasDateExpansion = Boolean(this.opts.byDay || this.opts.byMonthDay);
    const byMonthOnly = Boolean(this.opts.byMonth) && !hasDateExpansion;
    const simpleAnnual = !this.opts.byMonth && !hasDateExpansion;

    // The general simple-YEARLY cursor clamps Feb 29 on the first non-leap
    // step and remains clamped thereafter. That stateful edge is uncommon and
    // intentionally stays on the source-of-truth path.
    if (simpleAnnual && this.originalDtstart.month === 2 && this.originalDtstart.day === 29) return null;
    // Simple YEARLY time expansion advances one cursor slot per iteration,
    // while date-expanded YEARLY rules count outer years. Keep maxIterations
    // behavior exact by optimizing only the single-slot simple form.
    if (simpleAnnual && timeSlotOffsets.length !== 1) return null;
    // _allYearlyByMonth() currently selects the first time override and does
    // not apply BYSETPOS; only optimize the exact shape it emits.
    if (byMonthOnly && (timeSlotOffsets.length !== 1 || this.opts.bySetPos)) return null;
    if (
      this.hasOrdinalByDay &&
      !this.numericByMonths?.length &&
      (this.opts.byMonthDay || this.parsedByDayTokens?.some((token) => token.ord === 0))
    ) {
      return null;
    }

    const startEpochMilliseconds = this.originalDtstart.epochMilliseconds;
    const startYear = this.originalDtstart.year;
    const wallsForPeriod = (periodIndex: number): number[] | null => {
      const yearDelta = periodIndex * interval;
      const year = startYear + yearDelta;
      if (!Number.isSafeInteger(yearDelta) || !Number.isSafeInteger(year)) return null;
      return this.generateYearlyOccurrenceEpochsUtc(year);
    };

    const firstWalls = wallsForPeriod(0);
    if (!firstWalls) return null;
    const firstCandidates: NumericCandidate[] = [];
    for (const wallMilliseconds of firstWalls) {
      const epochMilliseconds = this.resolveNumericWallMilliseconds(wallMilliseconds);
      if (epochMilliseconds === null) return null;
      if (epochMilliseconds >= startEpochMilliseconds) {
        firstCandidates.push({
          epochMilliseconds,
          periodIndex: 0,
          occurrenceIndex: firstCandidates.length,
        });
      }
    }

    const cyclePeriods = 400 / gcd(interval, 400);
    const requiredCycleOccurrences = Math.max(0, maximumCount - firstCandidates.length);
    const cyclePrefixCounts = [0];
    const cyclePrefixEvaluations = [0];
    for (
      let periodOffset = 0;
      periodOffset < cyclePeriods && cyclePrefixCounts.at(-1)! < requiredCycleOccurrences;
      periodOffset++
    ) {
      const walls = wallsForPeriod(1 + periodOffset);
      if (!walls) return null;
      cyclePrefixCounts.push(cyclePrefixCounts[periodOffset]! + walls.length);
      const year = startYear + (1 + periodOffset) * interval;
      cyclePrefixEvaluations.push(cyclePrefixEvaluations[periodOffset]! + this.yearlyCandidateEvaluationCountUtc(year));
    }
    const precomputedPeriods = cyclePrefixCounts.length - 1;
    const completedCycle = precomputedPeriods === cyclePeriods;
    const occurrencesPerPrecomputedSpan = cyclePrefixCounts.at(-1)!;
    if (occurrencesPerPrecomputedSpan === 0 && firstCandidates.length < maximumCount) return null;

    if (hasDateExpansion) {
      let candidateEvaluations = this.yearlyCandidateEvaluationCountUtc(startYear);
      if (completedCycle && requiredCycleOccurrences > 0) {
        const fullCycles = Math.floor(requiredCycleOccurrences / occurrencesPerPrecomputedSpan);
        const remainder = requiredCycleOccurrences % occurrencesPerPrecomputedSpan;
        candidateEvaluations += fullCycles * cyclePrefixEvaluations.at(-1)!;
        if (remainder > 0) {
          let period = 1;
          while (cyclePrefixCounts[period]! < remainder) period += 1;
          candidateEvaluations += cyclePrefixEvaluations[period]!;
        }
      } else {
        candidateEvaluations += cyclePrefixEvaluations.at(-1)!;
      }
      if (candidateEvaluations > this.maxCandidateEvaluations) return null;
    }

    const select = (index: number): NumericCandidate | null => {
      if (index < firstCandidates.length) {
        return {...firstCandidates[index]!, occurrenceIndex: index};
      }
      if (occurrencesPerPrecomputedSpan === 0) return null;

      const remainingIndex = index - firstCandidates.length;
      const cycleIndex = completedCycle ? Math.floor(remainingIndex / occurrencesPerPrecomputedSpan) : 0;
      const indexWithinCycle = completedCycle ? remainingIndex % occurrencesPerPrecomputedSpan : remainingIndex;
      if (indexWithinCycle >= occurrencesPerPrecomputedSpan) return null;

      let low = 1;
      let high = cyclePrefixCounts.length - 1;
      while (low < high) {
        const middle = low + Math.floor((high - low) / 2);
        if (cyclePrefixCounts[middle]! > indexWithinCycle) high = middle;
        else low = middle + 1;
      }

      const periodOffset = low - 1;
      const periodIndex = 1 + cycleIndex * cyclePeriods + periodOffset;
      if (!Number.isSafeInteger(periodIndex)) return null;
      const walls = wallsForPeriod(periodIndex);
      if (!walls) return null;
      const occurrenceWithinPeriod = indexWithinCycle - cyclePrefixCounts[periodOffset]!;
      const wallMilliseconds = walls[occurrenceWithinPeriod];
      if (wallMilliseconds === undefined) return null;
      const epochMilliseconds = this.resolveNumericWallMilliseconds(wallMilliseconds);
      if (epochMilliseconds === null) return null;
      return {epochMilliseconds, periodIndex, occurrenceIndex: index};
    };

    const plan = this.createNumericQueryPlan('yearly', maximumCount, select);
    const last = plan?.select(maximumCount - 1);
    if (last && timeSlotOffsets.some((offset) => this.numericQueryGapHazard(offset, last.epochMilliseconds))) {
      return null;
    }
    return plan;
  }

  private buildNumericQueryPlan(): NumericQueryPlan | null {
    const maximumCount = this.opts.count;
    const interval = this.opts.interval;
    if (
      maximumCount === undefined ||
      !Number.isSafeInteger(maximumCount) ||
      maximumCount <= 0 ||
      !Number.isSafeInteger(interval) ||
      interval! <= 0 ||
      !Number.isSafeInteger(this.maxIterations) ||
      this.maxIterations <= 0 ||
      this.includeDtstart ||
      this.opts.rscale !== undefined ||
      !this.canUseEpochMillisecondsPrecisionFlag ||
      this.originalDtstart.timeZoneId !== this.tzid ||
      !['iso8601', 'gregory'].includes(this.originalDtstart.calendarId)
    ) {
      return null;
    }

    const hasCalendarFilters = Boolean(
      this.opts.byMonth || this.opts.byMonthDay || this.opts.byYearDay || this.opts.byWeekNo || this.opts.bySetPos,
    );

    switch (this.opts.freq) {
      case 'HOURLY':
      case 'MINUTELY':
      case 'SECONDLY':
        if (hasCalendarFilters || this.opts.byDay || this.opts.byHour || this.opts.byMinute || this.opts.bySecond) {
          return null;
        }
        return this.buildFixedStepNumericQueryPlan(maximumCount);
      case 'DAILY':
        if (hasCalendarFilters || this.hasOrdinalByDay || !this.hasUniqueTimeSlotOffsets) return null;
        return this.buildDailyNumericQueryPlan(maximumCount);
      case 'WEEKLY':
        if (hasCalendarFilters || this.hasOrdinalByDay || !this.hasUniqueTimeSlotOffsets) return null;
        return this.buildWeeklyNumericQueryPlan(maximumCount);
      case 'MONTHLY':
        if (
          this.opts.byYearDay ||
          this.opts.byWeekNo ||
          !(this.opts.byDay || this.opts.byMonthDay) ||
          !this.hasUniqueTimeSlotOffsets
        ) {
          return null;
        }
        return this.buildMonthlyNumericQueryPlan(maximumCount);
      case 'YEARLY':
        return this.buildYearlyNumericQueryPlan(maximumCount);
      default:
        return null;
    }
  }

  private getNumericQueryPlan(): NumericQueryPlan | null {
    if (this.numericQueryPlanCache !== undefined) {
      return this.numericQueryPlanCache;
    }
    try {
      this.numericQueryPlanCache = this.buildNumericQueryPlan();
    } catch {
      // The optimized path is deliberately conservative. Unsupported Intl
      // ranges or numeric edge cases fall back to the existing engine.
      this.numericQueryPlanCache = null;
    }
    return this.numericQueryPlanCache;
  }

  private findFirstMatchingDailyStep(startDayOfWeek: number, stepDays: number, allowedDays: number[]): number | null {
    let dayOfWeek = startDayOfWeek;
    for (let steps = 0; steps < 7; steps++) {
      if (allowedDays.includes(dayOfWeek)) {
        return steps;
      }
      dayOfWeek = addIsoDays(dayOfWeek, stepDays);
    }
    return null;
  }

  private allUtcFastPath(iterator?: InternalRRuleTemporalIterator): Temporal.ZonedDateTime[] | null {
    if (this.canUseUtcLinearFastPath(iterator)) {
      switch (this.opts.freq) {
        case 'DAILY':
          return this.opts.byHour || this.opts.byMinute || this.opts.bySecond
            ? this.hasUniqueTimeSlotOffsets
              ? this._allUtcDailyExpanded()
              : null
            : this._allUtcDailySimple();
        case 'HOURLY':
          return this._allUtcFixedStepSimple(NS_PER_HOUR * BigInt(this.opts.interval!));
        case 'MINUTELY':
          return this._allUtcFixedStepSimple(NS_PER_MINUTE * BigInt(this.opts.interval!));
        case 'SECONDLY':
          return this._allUtcFixedStepSimple(NS_PER_SECOND * BigInt(this.opts.interval!));
      }
    }

    if (this.canUseUtcMonthlyFastPath(iterator)) {
      return this._allUtcMonthlyByDayOrMonthDay();
    }

    if (this.canUseUtcWeeklyFastPath(iterator)) {
      return this.opts.byHour || this.opts.byMinute || this.opts.bySecond
        ? this.hasUniqueTimeSlotOffsets
          ? this._allUtcWeeklyExpanded()
          : null
        : this._allUtcWeeklySimple();
    }

    return null;
  }

  private _allUtcFixedStepSimple(stepNanoseconds: bigint): Temporal.ZonedDateTime[] {
    const dates: Temporal.ZonedDateTime[] = [];
    if (!this.addDtstartIfNeeded(dates)) {
      return dates;
    }
    let iterationCount = 0;

    if (this.canUseUtcEpochMillisecondsPrecision()) {
      let currentMilliseconds = this.originalDtstart.epochMilliseconds;
      const stepMilliseconds = Number(stepNanoseconds / NS_PER_MILLISECOND);
      const untilMilliseconds = this.opts.until?.epochMilliseconds;

      while (true) {
        if (++iterationCount > this.maxIterations) {
          throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
        }
        if (untilMilliseconds !== undefined && currentMilliseconds > untilMilliseconds) {
          break;
        }

        dates.push(this.utcZdtFromEpochMilliseconds(currentMilliseconds));
        if (this.shouldBreakForCountLimit(dates.length)) {
          break;
        }

        currentMilliseconds += stepMilliseconds;
      }

      return dates;
    }

    let currentNanoseconds = this.originalDtstart.epochNanoseconds;
    const untilNanoseconds = this.opts.until?.epochNanoseconds;

    while (true) {
      if (++iterationCount > this.maxIterations) {
        throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
      }
      if (untilNanoseconds !== undefined && currentNanoseconds > untilNanoseconds) {
        break;
      }

      dates.push(this.utcZdtFromEpochNanoseconds(currentNanoseconds));
      if (this.shouldBreakForCountLimit(dates.length)) {
        break;
      }

      currentNanoseconds += stepNanoseconds;
    }

    return dates;
  }

  private _allUtcDailySimple(): Temporal.ZonedDateTime[] {
    const dates: Temporal.ZonedDateTime[] = [];
    if (!this.addDtstartIfNeeded(dates)) {
      return dates;
    }

    const stepDays = this.opts.interval!;
    const allowedDays = this.simpleByDayIsoDays;
    let iterationCount = 0;
    if (this.canUseUtcEpochMillisecondsPrecision()) {
      const stepMilliseconds = stepDays * MS_PER_DAY;
      const untilMilliseconds = this.opts.until?.epochMilliseconds;
      let currentMilliseconds = this.originalDtstart.epochMilliseconds;
      let currentDayOfWeek = this.originalDtstart.dayOfWeek;

      if (allowedDays?.length) {
        const firstMatchingStep = this.findFirstMatchingDailyStep(currentDayOfWeek, stepDays, allowedDays);
        if (firstMatchingStep === null) {
          return dates;
        }
        currentMilliseconds += firstMatchingStep * stepMilliseconds;
        currentDayOfWeek = addIsoDays(currentDayOfWeek, firstMatchingStep * stepDays);
      }

      while (true) {
        if (++iterationCount > this.maxIterations) {
          throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
        }
        if (untilMilliseconds !== undefined && currentMilliseconds > untilMilliseconds) {
          break;
        }

        if (!allowedDays || allowedDays.includes(currentDayOfWeek)) {
          dates.push(this.utcZdtFromEpochMilliseconds(currentMilliseconds));
          if (this.shouldBreakForCountLimit(dates.length)) {
            break;
          }
        }

        currentMilliseconds += stepMilliseconds;
        currentDayOfWeek = addIsoDays(currentDayOfWeek, stepDays);
      }

      return dates;
    }

    const stepNanoseconds = BigInt(stepDays) * NS_PER_DAY;
    const untilNanoseconds = this.opts.until?.epochNanoseconds;
    let currentNanoseconds = this.originalDtstart.epochNanoseconds;
    let currentDayOfWeek = this.originalDtstart.dayOfWeek;

    if (allowedDays?.length) {
      const firstMatchingStep = this.findFirstMatchingDailyStep(currentDayOfWeek, stepDays, allowedDays);
      if (firstMatchingStep === null) {
        return dates;
      }
      currentNanoseconds += BigInt(firstMatchingStep) * stepNanoseconds;
      currentDayOfWeek = addIsoDays(currentDayOfWeek, firstMatchingStep * stepDays);
    }

    while (true) {
      if (++iterationCount > this.maxIterations) {
        throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
      }
      if (untilNanoseconds !== undefined && currentNanoseconds > untilNanoseconds) {
        break;
      }

      if (!allowedDays || allowedDays.includes(currentDayOfWeek)) {
        dates.push(this.utcZdtFromEpochNanoseconds(currentNanoseconds));
        if (this.shouldBreakForCountLimit(dates.length)) {
          break;
        }
      }

      currentNanoseconds += stepNanoseconds;
      currentDayOfWeek = addIsoDays(currentDayOfWeek, stepDays);
    }

    return dates;
  }

  private _allUtcDailyExpanded(): Temporal.ZonedDateTime[] {
    const dates: Temporal.ZonedDateTime[] = [];
    if (!this.addDtstartIfNeeded(dates)) {
      return dates;
    }

    const timeSlotOffsets = this.timeSlotOffsetsMs!;
    const startMilliseconds = this.originalDtstart.epochMilliseconds;
    const untilMilliseconds = this.opts.until?.epochMilliseconds;
    const stepDays = this.opts.interval!;
    const allowedDays = this.simpleByDayIsoDays;
    let epochDay = Math.floor(startMilliseconds / MS_PER_DAY);
    let dayOfWeek = this.originalDtstart.dayOfWeek;

    if (allowedDays?.length) {
      const firstMatchingDayOffset = this.findFirstMatchingDailyStep(dayOfWeek, 1, allowedDays);
      if (firstMatchingDayOffset === null) {
        return dates;
      }
      epochDay += firstMatchingDayOffset;
      dayOfWeek = addIsoDays(dayOfWeek, firstMatchingDayOffset);
    }

    let iterationCount = 0;
    while (true) {
      if (++iterationCount > this.maxIterations) {
        throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
      }

      if (!allowedDays || allowedDays.includes(dayOfWeek)) {
        const dayStartMilliseconds = epochDay * MS_PER_DAY;
        for (const timeSlotOffset of timeSlotOffsets) {
          const occurrenceMilliseconds = dayStartMilliseconds + timeSlotOffset;
          if (occurrenceMilliseconds < startMilliseconds) {
            continue;
          }
          if (untilMilliseconds !== undefined && occurrenceMilliseconds > untilMilliseconds) {
            return dates;
          }
          dates.push(this.utcZdtFromEpochMilliseconds(occurrenceMilliseconds));
          if (this.shouldBreakForCountLimit(dates.length)) {
            return dates;
          }
        }
      }

      epochDay += stepDays;
      dayOfWeek = addIsoDays(dayOfWeek, stepDays);
    }
  }

  private _allUtcWeeklySimple(): Temporal.ZonedDateTime[] {
    const dates: Temporal.ZonedDateTime[] = [];
    if (!this.addDtstartIfNeeded(dates)) {
      return dates;
    }

    const start = this.originalDtstart;
    const wkstToken = extractWeekdayToken(this.opts.wkst || 'MO') ?? 'MO';
    const wkstDay = weekdayToIsoDay[wkstToken] ?? 1;
    const targetDays = this.opts.byDay ? [...(this.allByDayIsoDays ?? [])] : [start.dayOfWeek];
    const dayOffsets = targetDays.map((day) => (day - wkstDay + 7) % 7).sort((a, b) => a - b);
    const weekStartOffset = (start.dayOfWeek - wkstDay + 7) % 7;
    let iterationCount = 0;

    if (this.canUseUtcEpochMillisecondsPrecision()) {
      const startMilliseconds = start.epochMilliseconds;
      const untilMilliseconds = this.opts.until?.epochMilliseconds;
      const weekStepMilliseconds = this.opts.interval! * MS_PER_WEEK;
      let weekStartMilliseconds = startMilliseconds - weekStartOffset * MS_PER_DAY;

      while (true) {
        if (++iterationCount > this.maxIterations) {
          throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
        }
        for (const dayOffset of dayOffsets) {
          const occurrenceMilliseconds = weekStartMilliseconds + dayOffset * MS_PER_DAY;

          if (occurrenceMilliseconds < startMilliseconds) {
            continue;
          }

          if (untilMilliseconds !== undefined && occurrenceMilliseconds > untilMilliseconds) {
            return dates;
          }

          dates.push(this.utcZdtFromEpochMilliseconds(occurrenceMilliseconds));
          if (this.shouldBreakForCountLimit(dates.length)) {
            return dates;
          }
        }

        weekStartMilliseconds += weekStepMilliseconds;
      }
    }

    const startNanoseconds = start.epochNanoseconds;
    const untilNanoseconds = this.opts.until?.epochNanoseconds;
    const weekStepNanoseconds = BigInt(this.opts.interval!) * NS_PER_WEEK;
    let weekStartNanoseconds = startNanoseconds - BigInt(weekStartOffset) * NS_PER_DAY;

    while (true) {
      if (++iterationCount > this.maxIterations) {
        throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
      }
      for (const dayOffset of dayOffsets) {
        const occurrenceNanoseconds = weekStartNanoseconds + BigInt(dayOffset) * NS_PER_DAY;

        if (occurrenceNanoseconds < startNanoseconds) {
          continue;
        }

        if (untilNanoseconds !== undefined && occurrenceNanoseconds > untilNanoseconds) {
          return dates;
        }

        dates.push(this.utcZdtFromEpochNanoseconds(occurrenceNanoseconds));
        if (this.shouldBreakForCountLimit(dates.length)) {
          return dates;
        }
      }

      weekStartNanoseconds += weekStepNanoseconds;
    }
  }

  private _allUtcWeeklyExpanded(): Temporal.ZonedDateTime[] {
    const dates: Temporal.ZonedDateTime[] = [];
    if (!this.addDtstartIfNeeded(dates)) {
      return dates;
    }

    const start = this.originalDtstart;
    const startMilliseconds = start.epochMilliseconds;
    const startEpochDay = Math.floor(startMilliseconds / MS_PER_DAY);
    const untilMilliseconds = this.opts.until?.epochMilliseconds;
    const timeSlotOffsets = this.timeSlotOffsetsMs!;
    const wkstToken = extractWeekdayToken(this.opts.wkst || 'MO') ?? 'MO';
    const wkstDay = weekdayToIsoDay[wkstToken] ?? 1;
    const targetDays = this.opts.byDay ? [...(this.allByDayIsoDays ?? [])] : [start.dayOfWeek];
    const dayOffsets = targetDays.map((day) => (day - wkstDay + 7) % 7).sort((a, b) => a - b);
    const weekStartOffset = (start.dayOfWeek - wkstDay + 7) % 7;
    const stepDaysPerWeek = this.opts.interval! * 7;

    let weekStartDay = startEpochDay - weekStartOffset;
    let iterationCount = 0;
    while (true) {
      if (++iterationCount > this.maxIterations) {
        throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
      }
      for (const dayOffset of dayOffsets) {
        const dayStartMilliseconds = (weekStartDay + dayOffset) * MS_PER_DAY;
        for (const timeSlotOffset of timeSlotOffsets) {
          const occurrenceMilliseconds = dayStartMilliseconds + timeSlotOffset;
          if (occurrenceMilliseconds < startMilliseconds) {
            continue;
          }
          if (untilMilliseconds !== undefined && occurrenceMilliseconds > untilMilliseconds) {
            return dates;
          }
          dates.push(this.utcZdtFromEpochMilliseconds(occurrenceMilliseconds));
          if (this.shouldBreakForCountLimit(dates.length)) {
            return dates;
          }
        }
      }
      weekStartDay += stepDaysPerWeek;
    }
  }

  private hasSingleExpandedTimeSlot(): boolean {
    if (this.timeSlotOffsetsMs) {
      return this.timeSlotOffsetsMs.length === 1;
    }
    const hours = this.opts.byHour ?? [this.originalDtstart.hour];
    const minutes = this.opts.byMinute ?? [this.originalDtstart.minute];
    const seconds = this.opts.bySecond ?? [this.originalDtstart.second];
    return hours.length === 1 && minutes.length === 1 && seconds.length === 1;
  }

  private buildMonthlyOccurrenceOnDay(monthStart: Temporal.ZonedDateTime, day: number): Temporal.ZonedDateTime {
    const base = monthStart.day === day ? monthStart : monthStart.with({day});
    return this.applyTimeOverride(base);
  }

  private applyBySetPosToSortedList<T>(list: T[]): T[] {
    const {bySetPos} = this.opts;
    if (!bySetPos || !bySetPos.length || list.length === 0) return list;

    const out: T[] = [];
    const len = list.length;
    for (const pos of bySetPos) {
      const idx = pos > 0 ? pos - 1 : len + pos;
      if (idx >= 0 && idx < len) out.push(list[idx]!);
    }
    return out;
  }

  private generateMonthlyOccurrenceDays(sample: Temporal.ZonedDateTime): number[] {
    const {byDay, byMonth, byMonthDay} = this.opts;
    const monthStart = sample.day === 1 ? sample : sample.with({day: 1});

    if (byMonth && !byMonth.includes(sample.month)) return [];

    const lastDay = monthStart.add({months: 1}).subtract({days: 1}).day;

    let byMonthDayHits: number[] = [];
    if (byMonthDay && byMonthDay.length > 0) {
      byMonthDayHits = byMonthDay.map((d) => (d > 0 ? d : lastDay + d + 1)).filter((d) => d >= 1 && d <= lastDay);
      byMonthDayHits = [...new Set(byMonthDayHits)].sort((a, b) => a - b);
    }

    if (!byDay && byMonthDay && byMonthDay.length > 0) {
      return byMonthDayHits;
    }

    if (!byDay) {
      return [sample.day];
    }

    const tokens = this.parsedByDayTokens;
    if (!tokens?.length) return [];

    const firstDayOfWeek = monthStart.dayOfWeek;
    const lastDayOfWeek = ((firstDayOfWeek - 1 + lastDay - 1) % 7) + 1;

    const byDayHits = new Set<number>();
    for (const {ord, isoDay} of tokens) {
      if (ord === 0) {
        let day = 1 + ((isoDay - firstDayOfWeek + 7) % 7);
        while (day <= lastDay) {
          byDayHits.add(day);
          day += 7;
        }
      } else {
        let day: number;
        if (ord > 0) {
          day = 1 + ((isoDay - firstDayOfWeek + 7) % 7) + 7 * (ord - 1);
        } else {
          const lastMatch = lastDay - ((lastDayOfWeek - isoDay + 7) % 7);
          day = lastMatch + 7 * (ord + 1);
        }

        if (day >= 1 && day <= lastDay) {
          byDayHits.add(day);
        }
      }
    }

    let finalDays = [...byDayHits].sort((a, b) => a - b);
    if (byMonthDay && byMonthDay.length > 0) {
      if (byMonthDayHits.length === 0) {
        return [];
      }
      const byMonthDayHitSet = new Set(byMonthDayHits);
      finalDays = finalDays.filter((d) => byMonthDayHitSet.has(d));
    }

    return finalDays;
  }

  private isGregorianLeapYear(year: number): boolean {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  }

  private daysInGregorianMonth(year: number, month: number): number {
    if (month === 2 && this.isGregorianLeapYear(year)) {
      return 29;
    }
    return GREGORIAN_MONTH_LENGTHS[month - 1]!;
  }

  private gregorianIsoDayOfWeek(year: number, month: number, day: number): number {
    let adjustedYear = year;
    if (month < 3) adjustedYear -= 1;
    const rawSundayZero =
      (adjustedYear +
        Math.floor(adjustedYear / 4) -
        Math.floor(adjustedYear / 100) +
        Math.floor(adjustedYear / 400) +
        GREGORIAN_WEEKDAY_OFFSETS[month - 1]! +
        day) %
      7;
    const sundayZero = (rawSundayZero + 7) % 7;
    return sundayZero === 0 ? 7 : sundayZero;
  }

  private monthIndexToYearMonth(monthIndex: number): {year: number; month: number} {
    const year = Math.floor(monthIndex / 12);
    return {
      year,
      month: monthIndex - year * 12 + 1,
    };
  }

  private generateMonthlyOccurrenceDaysUtc(year: number, month: number): number[] {
    if (this.numericByMonths && this.numericByMonths.length > 0 && !this.numericByMonths.includes(month)) {
      return [];
    }

    const byMonthDay = this.opts.byMonthDay;
    const byDay = this.opts.byDay;
    const lastDay = this.daysInGregorianMonth(year, month);

    let byMonthDayHits: number[] = [];
    if (byMonthDay && byMonthDay.length > 0) {
      byMonthDayHits = byMonthDay
        .map((day) => (day > 0 ? day : lastDay + day + 1))
        .filter((day) => day >= 1 && day <= lastDay);
      byMonthDayHits = [...new Set(byMonthDayHits)].sort((a, b) => a - b);
    }

    if (!byDay && byMonthDay && byMonthDay.length > 0) {
      return byMonthDayHits;
    }

    if (!byDay) {
      const day = this.originalDtstart.day;
      return day >= 1 && day <= lastDay ? [day] : [];
    }

    const tokens = this.parsedByDayTokens;
    if (!tokens?.length) return [];

    const firstDayOfWeek = this.gregorianIsoDayOfWeek(year, month, 1);
    const lastDayOfWeek = addIsoDays(firstDayOfWeek, lastDay - 1);
    const byDayHits = new Set<number>();

    for (const {ord, isoDay} of tokens) {
      if (ord === 0) {
        let day = 1 + ((isoDay - firstDayOfWeek + 7) % 7);
        while (day <= lastDay) {
          byDayHits.add(day);
          day += 7;
        }
      } else {
        let day: number;
        if (ord > 0) {
          day = 1 + ((isoDay - firstDayOfWeek + 7) % 7) + 7 * (ord - 1);
        } else {
          const lastMatch = lastDay - ((lastDayOfWeek - isoDay + 7) % 7);
          day = lastMatch + 7 * (ord + 1);
        }

        if (day >= 1 && day <= lastDay) {
          byDayHits.add(day);
        }
      }
    }

    let finalDays = [...byDayHits].sort((a, b) => a - b);
    if (byMonthDay && byMonthDay.length > 0) {
      if (byMonthDayHits.length === 0) return [];
      const byMonthDayHitSet = new Set(byMonthDayHits);
      finalDays = finalDays.filter((day) => byMonthDayHitSet.has(day));
    }

    return finalDays;
  }

  private generateMonthlyOccurrenceEpochsUtc(year: number, month: number): number[] {
    const days = this.generateMonthlyOccurrenceDaysUtc(year, month);
    if (days.length === 0) return [];

    // Date.UTC treats years 0..99 as 1900..1999. Integer civil-date
    // conversion preserves the full proleptic Gregorian Temporal range.
    const monthStartMs = gregorianEpochDay(year, month, 1) * MS_PER_DAY;
    if (!isSafeTemporalEpochMilliseconds(monthStartMs)) return [];
    const timeSlotOffsets = this.timeSlotOffsetsMs ?? [0];

    if (this.opts.bySetPos && this.opts.bySetPos.length > 0) {
      if (timeSlotOffsets.length === 1) {
        const selectedDays = this.applyBySetPosToSortedList(days).sort((a, b) => a - b);
        const offset = timeSlotOffsets[0]!;
        return selectedDays.map((day) => monthStartMs + (day - 1) * MS_PER_DAY + offset);
      }

      const timestamps: number[] = [];
      for (const day of days) {
        const dayBase = monthStartMs + (day - 1) * MS_PER_DAY;
        for (const offset of timeSlotOffsets) {
          timestamps.push(dayBase + offset);
        }
      }
      return this.applyBySetPosToSortedList(timestamps).sort((a, b) => a - b);
    }

    const timestamps: number[] = [];
    for (const day of days) {
      const dayBase = monthStartMs + (day - 1) * MS_PER_DAY;
      for (const offset of timeSlotOffsets) {
        timestamps.push(dayBase + offset);
      }
    }
    return timestamps;
  }

  private _allUtcMonthlyByDayOrMonthDay(): Temporal.ZonedDateTime[] {
    const dates: Temporal.ZonedDateTime[] = [];
    const startMilliseconds = this.originalDtstart.epochMilliseconds;
    const untilMilliseconds = this.opts.until?.epochMilliseconds;
    let iterationCount = 0;

    if (!this.addDtstartIfNeeded(dates)) {
      return dates;
    }

    let monthIndex = this.originalDtstart.year * 12 + (this.originalDtstart.month - 1);
    while (true) {
      if (++iterationCount > this.maxIterations) {
        throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
      }

      const {year, month} = this.monthIndexToYearMonth(monthIndex);
      const occurrenceEpochs = this.generateMonthlyOccurrenceEpochsUtc(year, month);

      for (const epochMilliseconds of occurrenceEpochs) {
        if (epochMilliseconds < startMilliseconds) {
          continue;
        }
        if (untilMilliseconds !== undefined && epochMilliseconds > untilMilliseconds) {
          return dates;
        }

        dates.push(this.utcZdtFromEpochMilliseconds(epochMilliseconds));
        if (this.shouldBreakForCountLimit(dates.length)) {
          return dates;
        }
      }

      monthIndex += this.opts.interval!;
    }
  }

  // --- Epoch-integer fast paths for arbitrary time zones -------------------
  //
  // These mirror the UTC fast paths above, but iterate local wall-clock time
  // as plain integers and resolve each occurrence to an instant through a
  // cached per-zone offset table (see tz-offset.ts), so no Temporal
  // arithmetic runs inside the hot loops. If a generated wall time falls in
  // a DST gap the path bails out (returns null) and the general Temporal
  // engine — the source of truth for that edge — produces the result.

  private getZoneResolver(): ZoneOffsetResolver {
    return (this.zoneResolver ??= getZoneOffsetResolver(this.tzid));
  }

  private zdtFromEpochMs(epochMs: number): Temporal.ZonedDateTime {
    // Native Temporal constructs cheaply from epoch nanoseconds. On the
    // polyfill, deriving from an anchored instance via add() skips repeated
    // time-zone slot setup and is measurably faster for non-UTC zones.
    if (isNativeTemporal) {
      return new Temporal.ZonedDateTime(BigInt(epochMs) * NS_PER_MILLISECOND, this.tzid);
    }
    let anchor = this.emitAnchorZdt;
    if (!anchor) {
      anchor = this.emitAnchorZdt = new Temporal.ZonedDateTime(BigInt(epochMs) * NS_PER_MILLISECOND, this.tzid);
      return anchor;
    }
    return anchor.add({milliseconds: epochMs - anchor.epochMilliseconds});
  }

  /** Local wall-clock ms (as-if-UTC) of a ZonedDateTime with ms precision. */
  private wallMsOf(zdt: Temporal.ZonedDateTime): number {
    return zdt.epochMilliseconds + zdt.offsetNanoseconds / 1_000_000;
  }

  private canUseTzEpochFastPaths(iterator?: InternalRRuleTemporalIterator): boolean {
    if (iterator || this.tzid === 'UTC' || this.opts.rscale || this.opts.rDate || this.opts.exDate) {
      return false;
    }
    if (!this.canUseEpochMillisecondsPrecisionFlag) {
      return false;
    }
    const calendar = this.originalDtstart.calendarId;
    return calendar === 'iso8601' || calendar === 'gregory';
  }

  /**
   * True if the rule's nominal time of day can be skipped by a DST gap
   * anywhere in the (estimated) iteration range. Conservatively keep these
   * rules on the general engine for Temporal's compatible gap resolution.
   */
  private tzFastPathGapHazard(timeOfDayMs: number): boolean {
    const startMs = this.originalDtstart.epochMilliseconds;
    let endMs: number;
    if (this.opts.until) {
      endMs = this.opts.until.epochMilliseconds;
    } else if (this.opts.count !== undefined) {
      // Conservative overestimates of the calendar span needed to emit
      // `count` occurrences (coverage tables are cheap and zone-cached).
      const steps = this.opts.count * this.opts.interval!;
      let spanMs: number;
      switch (this.opts.freq) {
        case 'DAILY':
          spanMs = steps * 7 * MS_PER_DAY; // BYDAY can thin days to 1-in-7
          break;
        case 'WEEKLY':
          spanMs = steps * MS_PER_WEEK;
          break;
        default: {
          const monthFactor = this.numericByMonths?.length ? Math.ceil(12 / this.numericByMonths.length) : 1;
          spanMs = steps * monthFactor * 31 * MS_PER_DAY;
          break;
        }
      }
      endMs = startMs + spanMs + 30 * MS_PER_DAY;
    } else {
      return true; // unreachable behind all()'s COUNT/UNTIL guard; be safe
    }

    const MAX_SPAN_MS = 150 * 366 * MS_PER_DAY;
    if (endMs - startMs > MAX_SPAN_MS) {
      return true; // enormous rules: let the general engine handle them
    }
    return this.getZoneResolver().timeOfDayMayHitGap(timeOfDayMs, startMs - MS_PER_DAY, endMs + MS_PER_DAY);
  }

  private allTzEpochFastPath(iterator?: InternalRRuleTemporalIterator): Temporal.ZonedDateTime[] | null {
    if (!this.canUseTzEpochFastPaths(iterator)) {
      return null;
    }

    const linearEligible =
      !this.opts.byMonth && !this.opts.byMonthDay && !this.opts.byYearDay && !this.opts.byWeekNo && !this.opts.bySetPos;

    if (linearEligible) {
      switch (this.opts.freq) {
        case 'DAILY':
          if (!this.hasOrdinalByDay) {
            return this.opts.byHour || this.opts.byMinute || this.opts.bySecond
              ? this.hasUniqueTimeSlotOffsets
                ? this._allTzDailyExpanded()
                : null
              : this._allTzDailySimple();
          }
          break;
        case 'HOURLY':
        case 'MINUTELY':
        case 'SECONDLY':
          if (!this.opts.byDay && !this.opts.byHour && !this.opts.byMinute && !this.opts.bySecond) {
            const stepMs =
              this.opts.freq === 'HOURLY' ? MS_PER_HOUR : this.opts.freq === 'MINUTELY' ? MS_PER_MINUTE : MS_PER_SECOND;
            return this._allTzFixedStepSimple(stepMs * this.opts.interval!);
          }
          break;
      }
    }

    if (
      this.opts.freq === 'MONTHLY' &&
      !this.opts.byYearDay &&
      !this.opts.byWeekNo &&
      this.hasSingleExpandedTimeSlot() &&
      !!(this.opts.byDay || this.opts.byMonthDay)
    ) {
      return this._allTzMonthlyByDayOrMonthDay();
    }

    if (this.opts.freq === 'WEEKLY' && linearEligible && !this.hasOrdinalByDay && this.hasUniqueTimeSlotOffsets) {
      return this.opts.byHour || this.opts.byMinute || this.opts.bySecond
        ? this._allTzWeeklyExpanded()
        : this._allTzWeeklySimple();
    }

    return null;
  }

  private _allTzDailySimple(): Temporal.ZonedDateTime[] | null {
    const dates: Temporal.ZonedDateTime[] = [];
    if (!this.addDtstartIfNeeded(dates)) {
      return dates;
    }

    const resolver = this.getZoneResolver();
    const startWallMs = this.wallMsOf(this.originalDtstart);
    let epochDay = Math.floor(startWallMs / MS_PER_DAY);
    const timeOfDayMs = startWallMs - epochDay * MS_PER_DAY;
    if (this.tzFastPathGapHazard(timeOfDayMs)) {
      return null;
    }
    const stepDays = this.opts.interval!;
    const allowedDays = this.simpleByDayIsoDays;
    const untilMs = this.opts.until?.epochMilliseconds;
    let dayOfWeek = isoDayOfWeekOfEpochDay(epochDay);

    if (allowedDays?.length) {
      const firstMatchingStep = this.findFirstMatchingDailyStep(dayOfWeek, stepDays, allowedDays);
      if (firstMatchingStep === null) {
        return dates;
      }
      epochDay += firstMatchingStep * stepDays;
      dayOfWeek = addIsoDays(dayOfWeek, firstMatchingStep * stepDays);
    }

    let iterationCount = 0;
    while (true) {
      if (++iterationCount > this.maxIterations) {
        throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
      }

      if (!allowedDays || allowedDays.includes(dayOfWeek)) {
        const resolution = resolver.epochMsForWall(epochDay * MS_PER_DAY + timeOfDayMs);
        if (resolution.pushed) {
          return null; // DST gap: defer to the general engine
        }
        if (untilMs !== undefined && resolution.epochMs > untilMs) {
          break;
        }
        dates.push(this.zdtFromEpochMs(resolution.epochMs));
        if (this.shouldBreakForCountLimit(dates.length)) {
          break;
        }
      }

      epochDay += stepDays;
      dayOfWeek = addIsoDays(dayOfWeek, stepDays);
    }

    return dates;
  }

  private _allTzDailyExpanded(): Temporal.ZonedDateTime[] | null {
    const dates: Temporal.ZonedDateTime[] = [];
    if (!this.addDtstartIfNeeded(dates)) {
      return dates;
    }

    const resolver = this.getZoneResolver();
    const startEpochMs = this.originalDtstart.epochMilliseconds;
    const startWallMs = this.wallMsOf(this.originalDtstart);
    const timeSlotOffsets = this.timeSlotOffsetsMs!;
    for (const timeSlotOffset of timeSlotOffsets) {
      if (this.tzFastPathGapHazard(timeSlotOffset)) {
        return null;
      }
    }

    const stepDays = this.opts.interval!;
    const allowedDays = this.simpleByDayIsoDays;
    const untilMs = this.opts.until?.epochMilliseconds;
    let epochDay = Math.floor(startWallMs / MS_PER_DAY);
    let dayOfWeek = isoDayOfWeekOfEpochDay(epochDay);

    if (allowedDays?.length) {
      const firstMatchingDayOffset = this.findFirstMatchingDailyStep(dayOfWeek, 1, allowedDays);
      if (firstMatchingDayOffset === null) {
        return dates;
      }
      epochDay += firstMatchingDayOffset;
      dayOfWeek = addIsoDays(dayOfWeek, firstMatchingDayOffset);
    }

    let iterationCount = 0;
    while (true) {
      if (++iterationCount > this.maxIterations) {
        throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
      }

      if (!allowedDays || allowedDays.includes(dayOfWeek)) {
        const dayStartWallMs = epochDay * MS_PER_DAY;
        for (const timeSlotOffset of timeSlotOffsets) {
          const resolution = resolver.epochMsForWall(dayStartWallMs + timeSlotOffset);
          if (resolution.pushed) {
            return null;
          }
          if (resolution.epochMs < startEpochMs) {
            continue;
          }
          if (untilMs !== undefined && resolution.epochMs > untilMs) {
            return dates;
          }
          dates.push(this.zdtFromEpochMs(resolution.epochMs));
          if (this.shouldBreakForCountLimit(dates.length)) {
            return dates;
          }
        }
      }

      epochDay += stepDays;
      dayOfWeek = addIsoDays(dayOfWeek, stepDays);
    }
  }

  private _allTzFixedStepSimple(stepMs: number): Temporal.ZonedDateTime[] | null {
    const dates: Temporal.ZonedDateTime[] = [];
    if (!this.addDtstartIfNeeded(dates)) {
      return dates;
    }

    const resolver = this.getZoneResolver();
    const untilMs = this.opts.until?.epochMilliseconds;
    // Mirror rawAdvance(): HOURLY with INTERVAL=1 skips the repeated
    // wall-clock hour on DST fall-back.
    const skipRepeatedWallHour = this.opts.freq === 'HOURLY' && this.opts.interval === 1;
    const wallHourOf = (epochMs: number): number => {
      const wallMs = epochMs + resolver.offsetMsAt(epochMs);
      return Math.floor((((wallMs % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY) / MS_PER_HOUR);
    };

    let currentMs = this.originalDtstart.epochMilliseconds;
    let iterationCount = 0;
    while (true) {
      if (++iterationCount > this.maxIterations) {
        throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
      }
      if (untilMs !== undefined && currentMs > untilMs) {
        break;
      }

      dates.push(this.zdtFromEpochMs(currentMs));
      if (this.shouldBreakForCountLimit(dates.length)) {
        break;
      }

      let nextMs = currentMs + stepMs;
      if (skipRepeatedWallHour && wallHourOf(nextMs) === wallHourOf(currentMs)) {
        nextMs += stepMs;
      }
      currentMs = nextMs;
    }

    return dates;
  }

  private _allTzWeeklySimple(): Temporal.ZonedDateTime[] | null {
    const dates: Temporal.ZonedDateTime[] = [];
    if (!this.addDtstartIfNeeded(dates)) {
      return dates;
    }

    const resolver = this.getZoneResolver();
    const start = this.originalDtstart;
    const startEpochMs = start.epochMilliseconds;
    const startWallMs = this.wallMsOf(start);
    const startEpochDay = Math.floor(startWallMs / MS_PER_DAY);
    const timeOfDayMs = startWallMs - startEpochDay * MS_PER_DAY;
    if (this.tzFastPathGapHazard(timeOfDayMs)) {
      return null;
    }
    const startDayOfWeek = isoDayOfWeekOfEpochDay(startEpochDay);

    const wkstToken = extractWeekdayToken(this.opts.wkst || 'MO') ?? 'MO';
    const wkstDay = weekdayToIsoDay[wkstToken] ?? 1;
    const targetDays = this.opts.byDay ? [...(this.allByDayIsoDays ?? [])] : [startDayOfWeek];
    const dayOffsets = targetDays.map((day) => (day - wkstDay + 7) % 7).sort((a, b) => a - b);
    const weekStartOffset = (startDayOfWeek - wkstDay + 7) % 7;
    const untilMs = this.opts.until?.epochMilliseconds;
    const stepDaysPerWeek = this.opts.interval! * 7;

    let weekStartDay = startEpochDay - weekStartOffset;
    let iterationCount = 0;
    while (true) {
      if (++iterationCount > this.maxIterations) {
        throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
      }
      for (const dayOffset of dayOffsets) {
        const resolution = resolver.epochMsForWall((weekStartDay + dayOffset) * MS_PER_DAY + timeOfDayMs);
        if (resolution.pushed) {
          return null; // DST gap: defer to the general engine
        }
        if (resolution.epochMs < startEpochMs) {
          continue;
        }
        if (untilMs !== undefined && resolution.epochMs > untilMs) {
          return dates;
        }
        dates.push(this.zdtFromEpochMs(resolution.epochMs));
        if (this.shouldBreakForCountLimit(dates.length)) {
          return dates;
        }
      }
      weekStartDay += stepDaysPerWeek;
    }
  }

  private _allTzWeeklyExpanded(): Temporal.ZonedDateTime[] | null {
    const dates: Temporal.ZonedDateTime[] = [];
    if (!this.addDtstartIfNeeded(dates)) {
      return dates;
    }

    const resolver = this.getZoneResolver();
    const start = this.originalDtstart;
    const startEpochMs = start.epochMilliseconds;
    const startWallMs = this.wallMsOf(start);
    const startEpochDay = Math.floor(startWallMs / MS_PER_DAY);
    const timeSlotOffsets = this.timeSlotOffsetsMs!;
    for (const timeSlotOffset of timeSlotOffsets) {
      if (this.tzFastPathGapHazard(timeSlotOffset)) {
        return null;
      }
    }

    const startDayOfWeek = isoDayOfWeekOfEpochDay(startEpochDay);
    const wkstToken = extractWeekdayToken(this.opts.wkst || 'MO') ?? 'MO';
    const wkstDay = weekdayToIsoDay[wkstToken] ?? 1;
    const targetDays = this.opts.byDay ? [...(this.allByDayIsoDays ?? [])] : [startDayOfWeek];
    const dayOffsets = targetDays.map((day) => (day - wkstDay + 7) % 7).sort((a, b) => a - b);
    const weekStartOffset = (startDayOfWeek - wkstDay + 7) % 7;
    const untilMs = this.opts.until?.epochMilliseconds;
    const stepDaysPerWeek = this.opts.interval! * 7;

    let weekStartDay = startEpochDay - weekStartOffset;
    let iterationCount = 0;
    while (true) {
      if (++iterationCount > this.maxIterations) {
        throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
      }
      for (const dayOffset of dayOffsets) {
        const dayStartWallMs = (weekStartDay + dayOffset) * MS_PER_DAY;
        for (const timeSlotOffset of timeSlotOffsets) {
          const resolution = resolver.epochMsForWall(dayStartWallMs + timeSlotOffset);
          if (resolution.pushed) {
            return null;
          }
          if (resolution.epochMs < startEpochMs) {
            continue;
          }
          if (untilMs !== undefined && resolution.epochMs > untilMs) {
            return dates;
          }
          dates.push(this.zdtFromEpochMs(resolution.epochMs));
          if (this.shouldBreakForCountLimit(dates.length)) {
            return dates;
          }
        }
      }
      weekStartDay += stepDaysPerWeek;
    }
  }

  private _allTzMonthlyByDayOrMonthDay(): Temporal.ZonedDateTime[] | null {
    const dates: Temporal.ZonedDateTime[] = [];
    if (!this.addDtstartIfNeeded(dates)) {
      return dates;
    }

    const resolver = this.getZoneResolver();
    const startEpochMs = this.originalDtstart.epochMilliseconds;
    const untilMs = this.opts.until?.epochMilliseconds;
    const startWallMs = this.wallMsOf(this.originalDtstart);
    const cursorTimeOfDayMs = ((startWallMs % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY;
    if (this.tzFastPathGapHazard(cursorTimeOfDayMs)) {
      return null;
    }

    let monthIndex = this.originalDtstart.year * 12 + (this.originalDtstart.month - 1);
    let iterationCount = 0;
    while (true) {
      if (++iterationCount > this.maxIterations) {
        throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
      }

      const {year, month} = this.monthIndexToYearMonth(monthIndex);
      // The "epochs" are wall-clock ms; resolve each through the zone table.
      for (const wallMs of this.generateMonthlyOccurrenceEpochsUtc(year, month)) {
        const resolution = resolver.epochMsForWall(wallMs);
        if (resolution.pushed) {
          return null; // DST gap: defer to the general engine
        }
        if (resolution.epochMs < startEpochMs) {
          continue;
        }
        if (untilMs !== undefined && resolution.epochMs > untilMs) {
          return dates;
        }
        dates.push(this.zdtFromEpochMs(resolution.epochMs));
        if (this.shouldBreakForCountLimit(dates.length)) {
          return dates;
        }
      }

      monthIndex += this.opts.interval!;
    }
  }

  private processOccurrences(
    occs: Temporal.ZonedDateTime[],
    dates: Temporal.ZonedDateTime[],
    start: Temporal.ZonedDateTime,
    iterator?: InternalRRuleTemporalIterator,
    extraFilters?: (occ: Temporal.ZonedDateTime) => boolean,
  ): {
    shouldBreak: boolean;
  } {
    for (const occ of occs) {
      if (!this.processOccurrence(occ, dates, start, iterator, extraFilters)) return {shouldBreak: true};
    }
    return {shouldBreak: false};
  }

  /** Process one occurrence and report whether generation should continue. */
  private processOccurrence(
    occurrence: Temporal.ZonedDateTime,
    dates: Temporal.ZonedDateTime[],
    start: Temporal.ZonedDateTime,
    iterator?: InternalRRuleTemporalIterator,
    extraFilters?: (occurrence: Temporal.ZonedDateTime) => boolean,
    work?: CandidateWorkBudget,
  ): boolean {
    if (work) {
      if (work.seenOccurrences.size === 0 && dates.length > 0) {
        for (const date of dates) work.seenOccurrences.add(date.epochNanoseconds);
      }
      if (work.seenOccurrences.has(occurrence.epochNanoseconds)) return true;
      work.seenOccurrences.add(occurrence.epochNanoseconds);
    }
    if (Temporal.ZonedDateTime.compare(occurrence, start) < 0) return true;
    if (this.opts.until && Temporal.ZonedDateTime.compare(occurrence, this.opts.until) > 0) return false;
    if (extraFilters && !extraFilters(occurrence)) return true;
    // EXDATE is applied during generation only for streaming iterator paths;
    // non-streaming recurrence sets subtract it during finalization.
    if (iterator && this.isExcluded(occurrence)) return true;
    if (iterator && !iterator(occurrence, dates.length)) return false;
    dates.push(occurrence);
    return !this.shouldBreakForCountLimit(dates.length);
  }

  /**
   * Returns all occurrences of the rule.
   * @param iterator - An optional callback iterator function that can be used to filter or modify the occurrences.
   * @returns An array of Temporal.ZonedDateTime objects representing all occurrences of the rule.
   */
  private _allMonthlyByDayOrMonthDay(
    iterator?: InternalRRuleTemporalIterator,
    queryLowerBound?: Temporal.ZonedDateTime,
  ): Temporal.ZonedDateTime[] {
    const dates: Temporal.ZonedDateTime[] = [];
    const work = this.createCandidateWorkBudget();
    let iterationCount = 0;
    const start = this.originalDtstart;
    if (!this.addDtstartIfNeeded(dates, iterator)) {
      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }

    let monthCursor = start.with({day: 1});

    while (true) {
      if (++iterationCount > this.maxIterations) {
        throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
      }

      const visit = (candidate: Temporal.ZonedDateTime) =>
        this.processOccurrence(candidate, dates, start, iterator, undefined, work);
      const completed =
        this.visitUtcPeriodCandidates(monthCursor, visit, queryLowerBound ?? start, this.opts.until, work) ??
        this.visitPeriodCandidates(
          this.generateMonthlyDateCandidates(monthCursor),
          visit,
          queryLowerBound ?? start,
          this.opts.until,
          work,
        );
      if (!completed) break;
      try {
        monthCursor = monthCursor.add({months: this.opts.interval!});
      } catch {
        break;
      }
      if (this.opts.until) {
        const localUntil = this.opts.until.withTimeZone(this.tzid);
        if (monthCursor.year * 12 + monthCursor.month > localUntil.year * 12 + localUntil.month) {
          break;
        }
      }
    }

    return this.applyCountLimitAndMergeRDates(dates, iterator);
  }

  private _allWeekly(
    iterator?: InternalRRuleTemporalIterator,
    queryLowerBound?: Temporal.ZonedDateTime,
  ): Temporal.ZonedDateTime[] {
    const dates: Temporal.ZonedDateTime[] = [];
    const work = this.createCandidateWorkBudget();
    let iterationCount = 0;
    const start = this.originalDtstart;
    if (!this.addDtstartIfNeeded(dates, iterator)) {
      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }

    // Build the list of target weekdays (1=Mon..7=Sun)
    const dayMap = weekdayToIsoDay;
    // If no BYDAY, default to DTSTART’s weekday token
    const dows = this.opts.byDay
      ? [...(this.allByDayIsoDays ?? [])]
      : this.opts.byMonthDay && this.opts.byMonthDay.length > 0
        ? [...Object.values(dayMap)]
        : [start.dayOfWeek];

    // Get the week start day (default to Monday if not specified)
    const wkstToken = extractWeekdayToken(this.opts.wkst || 'MO') ?? 'MO';
    const wkstDay = dayMap[wkstToken] ?? 1;

    // RFC 5545 anchors WEEKLY INTERVAL periods to DTSTART's week. In
    // particular, do not re-anchor the cadence to the following week when all
    // matching weekdays in DTSTART's week are already in the past.
    const startWeekOffset = (start.dayOfWeek - wkstDay + 7) % 7;
    let weekCursor = start.subtract({days: startWeekOffset});

    while (true) {
      // Generate this week’s occurrences
      if (++iterationCount > this.maxIterations) {
        throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
      }

      const dateCandidates = dows.map((dw) => {
        const delta = (dw - wkstDay + 7) % 7;
        return weekCursor.add({days: delta});
      });
      const completed = this.visitPeriodCandidates(
        dateCandidates,
        (candidate) =>
          this.processOccurrence(
            candidate,
            dates,
            start,
            iterator,
            (occurrence) => this.matchesByMonth(occurrence) && this.matchesByMonthDay(occurrence),
            work,
          ),
        queryLowerBound ?? start,
        this.opts.until,
        work,
      );
      if (!completed) break;
      try {
        weekCursor = weekCursor.add({weeks: this.opts.interval!});
      } catch {
        break;
      }
      if (this.opts.until) {
        const localUntil = this.opts.until.withTimeZone(this.tzid);
        if (Temporal.PlainDate.compare(weekCursor.toPlainDate(), localUntil.toPlainDate()) > 0) {
          break;
        }
      }
    }

    return this.applyCountLimitAndMergeRDates(dates, iterator);
  }

  private _allMonthlyByMonth(iterator?: InternalRRuleTemporalIterator): Temporal.ZonedDateTime[] {
    const dates: Temporal.ZonedDateTime[] = [];
    let iterationCount = 0;
    const start = this.originalDtstart;
    if (!this.addDtstartIfNeeded(dates, iterator)) {
      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }

    const months = (this.opts.byMonth! as Array<number | string>)
      .filter((v): v is number => typeof v === 'number')
      .sort((a, b) => a - b);
    let monthOffset = 0;

    // Find the first month >= dtstart.month
    let startMonthIndex = months.findIndex((m) => m >= start.month);
    if (startMonthIndex === -1) {
      // All months are before dtstart.month, start from first month of next year
      startMonthIndex = 0;
      monthOffset = 1;
    }

    while (true) {
      if (++iterationCount > this.maxIterations) {
        throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
      }

      const monthIndex = startMonthIndex + monthOffset;
      const targetMonth = months[monthIndex % months.length];
      const yearsToAdd = Math.floor(monthIndex / months.length);

      const candidate = start.with({
        year: start.year + yearsToAdd,
        month: targetMonth,
      });

      if (this.opts.until && Temporal.ZonedDateTime.compare(candidate, this.opts.until) > 0) {
        break;
      }

      if (Temporal.ZonedDateTime.compare(candidate, start) >= 0) {
        // Skip excluded dates only when iterator is provided
        if (iterator && this.isExcluded(candidate)) {
          continue;
        }
        if (iterator && !iterator(candidate, dates.length)) {
          break;
        }
        dates.push(candidate);
        if (this.shouldBreakForCountLimit(dates.length)) {
          break;
        }
      }

      monthOffset++;
    }

    return this.applyCountLimitAndMergeRDates(dates, iterator);
  }

  private _allYearlyByMonth(iterator?: InternalRRuleTemporalIterator): Temporal.ZonedDateTime[] {
    const dates: Temporal.ZonedDateTime[] = [];
    let iterationCount = 0;
    const start = this.originalDtstart;
    if (!this.addDtstartIfNeeded(dates, iterator)) {
      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }
    const months = (this.opts.byMonth! as Array<number | string>)
      .filter((v): v is number => typeof v === 'number')
      .sort((a, b) => a - b);
    let yearOffset = 0;

    while (true) {
      if (++iterationCount > this.maxIterations) {
        throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
      }

      const year = start.year + yearOffset * this.opts.interval!;

      for (const month of months) {
        let occ = start.with({year, month});
        occ = this.applyTimeOverride(occ);

        if (Temporal.ZonedDateTime.compare(occ, start) < 0) {
          continue;
        }
        if (this.opts.until && Temporal.ZonedDateTime.compare(occ, this.opts.until) > 0) {
          return this.applyCountLimitAndMergeRDates(dates, iterator);
        }
        // Skip excluded dates only when iterator is provided
        if (iterator && this.isExcluded(occ)) {
          continue;
        }
        if (iterator && !iterator(occ, dates.length)) {
          return this.applyCountLimitAndMergeRDates(dates, iterator);
        }
        dates.push(occ);
        if (this.shouldBreakForCountLimit(dates.length)) {
          return this.applyCountLimitAndMergeRDates(dates, iterator);
        }
      }
      yearOffset++;
    }
  }

  private _allYearlyComplex(
    iterator?: InternalRRuleTemporalIterator,
    queryLowerBound?: Temporal.ZonedDateTime,
  ): Temporal.ZonedDateTime[] {
    const dates: Temporal.ZonedDateTime[] = [];
    const work = this.createCandidateWorkBudget();
    let iterationCount = 0;
    const start = this.originalDtstart;
    if (!this.addDtstartIfNeeded(dates, iterator)) {
      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }
    if (this.opts.until && Temporal.ZonedDateTime.compare(this.opts.until, start) < 0) {
      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }

    let yearCursor = start.with({month: 1, day: 1});
    const lastGenerationYear = this.opts.until
      ? this.opts.until.withTimeZone(this.tzid).year + (this.opts.byWeekNo ? 1 : 0)
      : undefined;

    while (true) {
      if (++iterationCount > this.maxIterations) {
        throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
      }

      const visit = (candidate: Temporal.ZonedDateTime) =>
        this.processOccurrence(candidate, dates, start, iterator, undefined, work);
      const completed =
        this.visitUtcPeriodCandidates(yearCursor, visit, queryLowerBound ?? start, this.opts.until, work) ??
        this.visitPeriodCandidates(
          this.generateYearlyDateCandidates(yearCursor),
          visit,
          queryLowerBound ?? start,
          this.opts.until,
          work,
        );
      if (!completed) break;

      const interval = this.opts.freq === 'WEEKLY' ? 1 : this.opts.interval!;
      try {
        yearCursor = yearCursor.add({years: interval});
      } catch {
        break;
      }
      if (lastGenerationYear !== undefined && yearCursor.year > lastGenerationYear) break;
    }

    return this.applyCountLimitAndMergeRDates(dates, iterator);
  }

  private _allMinutelySecondlyComplex(iterator?: InternalRRuleTemporalIterator): Temporal.ZonedDateTime[] {
    const dates: Temporal.ZonedDateTime[] = [];
    let iterationCount = 0;
    if (!this.addDtstartIfNeeded(dates, iterator)) {
      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }
    let current = this.computeFirst();

    while (true) {
      if (++iterationCount > this.maxIterations) {
        throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
      }

      if (this.opts.until && Temporal.ZonedDateTime.compare(current, this.opts.until) > 0) {
        break;
      }

      // Check if current date matches all constraints
      if (this.matchesAll(current)) {
        // Skip excluded dates only when iterator is provided
        if (iterator && this.isExcluded(current)) {
          current = this.nextCandidateSameDate(current);
          continue;
        }
        if (iterator && !iterator(current, dates.length)) {
          break;
        }
        dates.push(current);
        if (this.shouldBreakForCountLimit(dates.length)) {
          break;
        }
        current = this.nextCandidateSameDate(current);
      } else {
        // Current date doesn't match constraints, find next candidate efficiently
        current = this.findNextValidDate(current);
      }
    }

    return this.applyCountLimitAndMergeRDates(dates, iterator);
  }

  private _allMonthlyByWeekNo(
    iterator?: InternalRRuleTemporalIterator,
    queryLowerBound?: Temporal.ZonedDateTime,
  ): Temporal.ZonedDateTime[] {
    const dates: Temporal.ZonedDateTime[] = [];
    const work = this.createCandidateWorkBudget();
    let iterationCount = 0;
    const start = this.originalDtstart;
    if (!this.addDtstartIfNeeded(dates, iterator)) {
      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }

    let current = start;
    const weekNos = [...this.opts.byWeekNo!].sort((a, b) => a - b);
    const interval = this.opts.interval!;
    let monthsAdvanced = 0;
    let lastYearProcessed = -1;

    outer_loop: while (true) {
      if (this.shouldBreakForCountLimit(dates.length)) {
        break;
      }
      if (++iterationCount > this.maxIterations) {
        throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
      }

      const year = current.year;

      // Only process each year once, and only when we've advanced enough to reach a new year
      if (year !== lastYearProcessed && current.month >= start.month) {
        lastYearProcessed = year;

        // Generate occurrences for each week number in this year
        for (const weekNo of weekNos) {
          const completed = this.visitDateTimeCandidates(
            this.generateDateCandidatesForWeekInYear(year, weekNo),
            1,
            (candidate) => this.processOccurrence(candidate, dates, start, iterator, undefined, work),
            queryLowerBound ?? start,
            this.opts.until,
            work,
          );
          if (!completed) break outer_loop;
        }
      }

      // Advance by the specified monthly interval
      monthsAdvanced += interval;
      current = start.add({months: monthsAdvanced});

      if (this.opts.until && Temporal.ZonedDateTime.compare(current, this.opts.until) > 0) {
        break;
      }
    }

    return this.applyCountLimitAndMergeRDates(dates, iterator);
  }

  private _allMonthlyByYearDay(
    iterator?: InternalRRuleTemporalIterator,
    queryLowerBound?: Temporal.ZonedDateTime,
  ): Temporal.ZonedDateTime[] {
    const dates: Temporal.ZonedDateTime[] = [];
    const work = this.createCandidateWorkBudget();
    let iterationCount = 0;
    const start = this.originalDtstart;
    if (!this.addDtstartIfNeeded(dates, iterator)) {
      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }

    let year = start.year;
    const yearDays = [...this.opts.byYearDay!].sort((a, b) => a - b);
    const interval = this.opts.interval!;
    const startMonthAbs = start.year * 12 + start.month;

    outer_loop: while (true) {
      if (this.shouldBreakForCountLimit(dates.length)) {
        break;
      }
      if (++iterationCount > this.maxIterations) {
        throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
      }

      const yearStart = start.with({year, month: 1, day: 1});
      const lastDayOfYear = yearStart.with({month: 12, day: 31}).dayOfYear;

      const dateCandidates: Temporal.ZonedDateTime[] = [];
      for (const yd of yearDays) {
        const dayNum = yd > 0 ? yd : lastDayOfYear + yd + 1;
        if (dayNum <= 0 || dayNum > lastDayOfYear) continue;
        dateCandidates.push(yearStart.add({days: dayNum - 1}));
      }

      const completed = this.visitDateTimeCandidates(
        dateCandidates,
        1,
        (candidate) => {
          const occurrenceMonth = candidate.year * 12 + candidate.month;
          if ((occurrenceMonth - startMonthAbs) % interval !== 0) return true;
          if (!this.matchesByMonth(candidate)) return true;
          return this.processOccurrence(candidate, dates, start, iterator, undefined, work);
        },
        queryLowerBound ?? start,
        this.opts.until,
        work,
      );
      if (!completed) break outer_loop;

      year++;
      if (this.opts.until && year > this.opts.until.year + 2) {
        break;
      }
      if (!this.opts.until && this.opts.count) {
        const yearsToScan = Math.ceil(this.opts.count / (this.opts.byYearDay!.length || 1)) * interval + 5;
        if (year > start.year + yearsToScan) {
          break;
        }
      }
    }
    return this.applyCountLimitAndMergeRDates(dates, iterator);
  }

  private _allDailyMinutelyHourlyWithBySetPos(iterator?: InternalRRuleTemporalIterator): Temporal.ZonedDateTime[] {
    const dates: Temporal.ZonedDateTime[] = [];
    let iterationCount = 0;
    const start = this.originalDtstart;
    if (!this.addDtstartIfNeeded(dates, iterator)) {
      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }

    let cursor;
    let duration;

    switch (this.opts.freq) {
      case 'MINUTELY':
        cursor = start.with({second: 0, microsecond: 0, nanosecond: 0});
        duration = {minutes: this.opts.interval!};
        break;
      case 'HOURLY':
        cursor = start.with({minute: 0, second: 0, microsecond: 0, nanosecond: 0});
        duration = {hours: this.opts.interval!};
        break;
      case 'DAILY':
        cursor = start.with({hour: 0, minute: 0, second: 0, microsecond: 0, nanosecond: 0});
        duration = {days: this.opts.interval!};
        break;
      default:
        // Should not be reached
        return this.applyCountLimitAndMergeRDates(dates, iterator);
    }

    while (true) {
      if (++iterationCount > this.maxIterations) {
        throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
      }

      // Generate all occurrences for this period
      let periodOccs = this.expandByTime(cursor);
      periodOccs = periodOccs.filter((occ) => this.matchesAll(occ));
      periodOccs = this.applyBySetPos(periodOccs);

      const {shouldBreak} = this.processOccurrences(periodOccs, dates, start, iterator);
      if (shouldBreak) {
        break;
      }

      cursor = cursor.add(duration);
      if (this.opts.until && Temporal.ZonedDateTime.compare(cursor, this.opts.until) > 0) {
        break;
      }
    }
    return this.applyCountLimitAndMergeRDates(dates, iterator);
  }

  private _allFallback(iterator?: InternalRRuleTemporalIterator): Temporal.ZonedDateTime[] {
    const dates: Temporal.ZonedDateTime[] = [];
    let iterationCount = 0;
    let current = this.computeFirst();

    // Include dtstart even if it doesn't match the rule when includeDtstart is true
    if (this.includeDtstart && Temporal.ZonedDateTime.compare(current, this.originalDtstart) > 0) {
      // dtstart doesn't match the rule, but we should include it in non-strict mode
      // Skip if dtstart is excluded and we have an iterator
      if (iterator && this.isExcluded(this.originalDtstart)) {
        // Skip this date but continue processing
      } else {
        if (iterator && !iterator(this.originalDtstart, dates.length)) {
          return this.applyCountLimitAndMergeRDates(dates, iterator);
        }
        dates.push(this.originalDtstart);
        if (this.shouldBreakForCountLimit(dates.length)) {
          return this.applyCountLimitAndMergeRDates(dates, iterator);
        }
      }
    }

    while (true) {
      if (++iterationCount > this.maxIterations) {
        throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
      }

      if (this.opts.until && Temporal.ZonedDateTime.compare(current, this.opts.until) > 0) {
        break;
      }
      if (this.matchesAll(current)) {
        // Skip excluded dates only when iterator is provided
        if (iterator && this.isExcluded(current)) {
          // Skip this date but continue iterating
        } else {
          if (iterator && !iterator(current, dates.length)) {
            break;
          }
          dates.push(current);
          if (this.shouldBreakForCountLimit(dates.length)) {
            break;
          }
        }
      }
      current = this.nextCandidateSameDate(current);
    }
    return this.applyCountLimitAndMergeRDates(dates, iterator);
  }

  /**
   * Returns all occurrences of the rule.
   * @param iterator - An optional callback iterator function that can be used to filter or modify the occurrences.
   * @returns An array of Temporal.ZonedDateTime objects representing all occurrences of the rule.
   */
  all(iterator?: RRuleTemporalIterator<TOutput>): TOutput[] {
    if (iterator) {
      // Convert each emitted value exactly once. The old adapter converted for
      // the callback and then converted the returned internal array a second
      // time after traversal completed.
      const publicDates: TOutput[] = [];
      this.allInternal((date, index) => {
        const publicDate = this.toPublicDate(date)!;
        if (!iterator(publicDate, index)) return false;
        publicDates.push(publicDate);
        return true;
      });
      return publicDates;
    }

    if (!iterator && this.opts.cache !== false) {
      // Rule instances are immutable, so the full occurrence list of a bounded
      // rule can be computed once and shared; return a copy so callers may
      // mutate the array they receive.
      if (!this.allResultCache) {
        this.allResultCache = this.allInternal();
      }
      if (!this.publicAllResultCache) {
        this.publicAllResultCache = this.toPublicDates(this.allResultCache);
      }
      return this.publicAllResultCache.slice();
    }
    return this.toPublicDates(this.allInternal());
  }

  private allInternal(
    iterator?: InternalRRuleTemporalIterator,
    queryLowerBound?: Temporal.ZonedDateTime,
  ): Temporal.ZonedDateTime[] {
    if (this.opts.count === undefined && !this.opts.until && !iterator) {
      throw new Error('all() requires iterator when no COUNT/UNTIL');
    }

    if (iterator && (this.opts.rDate || this.opts.exDate)) {
      return this.iterateRecurrenceSet(iterator);
    }

    // COUNT bounds RRULE generation only. Explicit RDATE values are still
    // merged below when COUNT=0, without entering any recurrence period.
    if (this.opts.count === 0) {
      return this.applyCountLimitAndMergeRDates([], iterator);
    }

    if (this.opts.until && Temporal.ZonedDateTime.compare(this.opts.until, this.originalDtstart) < 0) {
      const dates: Temporal.ZonedDateTime[] = [];
      this.addDtstartIfNeeded(dates, iterator);
      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }

    // RSCALE non-Gregorian engines (Chinese, Hebrew, Indian) for YEARLY/MONTHLY/WEEKLY
    if (this.opts.rscale && ['CHINESE', 'HEBREW', 'INDIAN'].includes(this.opts.rscale)) {
      if (
        ['YEARLY', 'MONTHLY', 'WEEKLY'].includes(this.opts.freq) ||
        !!this.opts.byYearDay ||
        !!this.opts.byWeekNo ||
        (this.opts.byMonthDay && this.opts.byMonthDay.length > 0)
      ) {
        return this._allRscaleNonGregorian(iterator, queryLowerBound);
      }
    }
    if (this.opts.byWeekNo && this.opts.byYearDay && !this.hasPossibleYearDayWeekNoCombination()) {
      const dates: Temporal.ZonedDateTime[] = [];
      this.addDtstartIfNeeded(dates, iterator);
      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }
    const utcFastPathDates = this.allUtcFastPath(iterator);
    if (utcFastPathDates) {
      return this.opts.rDate || this.opts.exDate
        ? this.applyCountLimitAndMergeRDates(utcFastPathDates)
        : utcFastPathDates;
    }

    const tzFastPathDates = this.allTzEpochFastPath(iterator);
    if (tzFastPathDates) {
      return tzFastPathDates;
    }

    // --- 1) MONTHLY + BYDAY/BYMONTHDAY (multi-day expansions) ---
    if (this.opts.freq === 'MONTHLY' && (this.opts.byDay || this.opts.byMonthDay) && !this.opts.byWeekNo) {
      return this._allMonthlyByDayOrMonthDay(iterator, queryLowerBound);
    }

    // --- 2) WEEKLY + BYDAY (or default to DTSTART's weekday) ---
    if (
      this.opts.freq === 'WEEKLY' &&
      !(this.opts.byYearDay && this.opts.byYearDay.length > 0) &&
      !(this.opts.byWeekNo && this.opts.byWeekNo.length > 0)
    ) {
      return this._allWeekly(iterator, queryLowerBound);
    }

    // --- 3) MONTHLY + BYMONTH (without BYDAY/BYMONTHDAY) ---
    if (
      this.opts.freq === 'MONTHLY' &&
      this.opts.byMonth &&
      !this.opts.byDay &&
      !this.opts.byMonthDay &&
      !this.opts.byYearDay
    ) {
      return this._allMonthlyByMonth(iterator);
    }

    // --- 4) YEARLY + BYMONTH (all specified months per year) ---
    if (
      this.opts.freq === 'YEARLY' &&
      this.opts.byMonth &&
      !this.opts.byDay &&
      !this.opts.byMonthDay &&
      !this.opts.byYearDay &&
      !this.opts.byWeekNo
    ) {
      return this._allYearlyByMonth(iterator);
    }

    // --- 5) YEARLY + BY... rules (also handles WEEKLY + BYYEARDAY and WEEKLY + BYWEEKNO) ---
    if (
      (this.opts.freq === 'YEARLY' &&
        (this.opts.byDay || this.opts.byMonthDay || this.opts.byYearDay || this.opts.byWeekNo)) ||
      (this.opts.freq === 'WEEKLY' && this.opts.byYearDay && this.opts.byYearDay.length > 0) ||
      (this.opts.freq === 'WEEKLY' && this.opts.byWeekNo && this.opts.byWeekNo.length > 0)
    ) {
      return this._allYearlyComplex(iterator, queryLowerBound);
    }

    // --- 6a) MINUTELY/SECONDLY with limiting BYXXX constraints (special case) ---
    if (
      (this.opts.freq === 'MINUTELY' || this.opts.freq === 'SECONDLY') &&
      (this.opts.byMonth || this.opts.byWeekNo || this.opts.byYearDay || this.opts.byMonthDay || this.opts.byDay)
    ) {
      return this._allMinutelySecondlyComplex(iterator);
    }

    // --- 6c) MONTHLY + BYWEEKNO (special case) ---
    if (this.opts.freq === 'MONTHLY' && this.opts.byWeekNo && this.opts.byWeekNo.length > 0) {
      return this._allMonthlyByWeekNo(iterator, queryLowerBound);
    }

    // --- 6d) MONTHLY + BYYEARDAY (special case) ---
    if (
      this.opts.freq === 'MONTHLY' &&
      this.opts.byYearDay &&
      this.opts.byYearDay.length > 0 &&
      !this.opts.byDay &&
      !this.opts.byMonthDay
    ) {
      return this._allMonthlyByYearDay(iterator, queryLowerBound);
    }

    // --- 6e) RFC 7529 RSCALE monthly simple (no BY* constraints) ---
    if (
      this.opts.rscale &&
      this.opts.freq === 'MONTHLY' &&
      !this.opts.byDay &&
      !this.opts.byMonthDay &&
      !this.opts.byWeekNo &&
      !this.opts.byYearDay
    ) {
      return this._allMonthlyRscaleSimple(iterator);
    }

    // --- 7) fallback: step + filter ---
    // Handle MINUTELY/HOURLY/DAILY frequency with BYSETPOS
    if (
      (this.opts.freq === 'MINUTELY' || this.opts.freq === 'HOURLY' || this.opts.freq === 'DAILY') &&
      this.opts.bySetPos
    ) {
      return this._allDailyMinutelyHourlyWithBySetPos(iterator);
    }

    return this._allFallback(iterator);
  }

  /**
   * RFC 7529: RSCALE present, simple monthly iteration with SKIP behavior.
   * Handles month-to-month stepping from DTSTART's year/month aiming for DTSTART's day-of-month.
   * Applies SKIP=OMIT (skip invalid months), BACKWARD (clamp to last day), FORWARD (first day of next month).
   */
  private _allMonthlyRscaleSimple(iterator?: InternalRRuleTemporalIterator): Temporal.ZonedDateTime[] {
    const dates: Temporal.ZonedDateTime[] = [];
    let iterationCount = 0;
    const start = this.originalDtstart;
    const interval = this.opts.interval ?? 1;
    const targetDom = start.day;

    if (!this.addDtstartIfNeeded(dates, iterator)) {
      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }

    // Month cursor moves in calendar months from DTSTART, independent of emitted dates.
    let cursor = start.with({day: 1});

    while (true) {
      if (++iterationCount > this.maxIterations) {
        throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
      }

      // Determine candidate within cursor month according to SKIP
      const lastDay = cursor.add({months: 1}).subtract({days: 1}).day;

      let occ: Temporal.ZonedDateTime | null = null;
      if (targetDom <= lastDay) {
        occ = cursor.with({day: targetDom});
      } else {
        const skip = this.opts.skip || 'OMIT';
        if (skip === 'BACKWARD') {
          occ = cursor.with({day: lastDay});
        } else if (skip === 'FORWARD') {
          // first of next month
          occ = cursor.add({months: 1}).with({day: 1});
        } else {
          // OMIT -> no occurrence for this period
          occ = null;
        }
      }

      if (occ) {
        // reapply DTSTART's time overrides
        occ = occ.with({hour: start.hour, minute: start.minute, second: start.second});
        // Skip excluded when iterator provided
        if (!(iterator && this.isExcluded(occ))) {
          if (Temporal.ZonedDateTime.compare(occ, start) >= 0) {
            if (!iterator || iterator(occ, dates.length)) {
              dates.push(occ);
              if (this.shouldBreakForCountLimit(dates.length)) break;
            } else {
              break;
            }
          }
        }
      }

      // Advance month cursor by interval
      cursor = cursor.add({months: interval});
      if (this.opts.until && Temporal.ZonedDateTime.compare(cursor, this.opts.until) > 0) {
        break;
      }
    }

    return this.applyCountLimitAndMergeRDates(dates, iterator);
  }

  /**
   * Converts rDate entries to ZonedDateTime and merges with existing dates.
   * @param dates - Array of dates to merge with
   * @returns Merged and deduplicated array of dates
   */
  private mergeAndDeduplicateRDates(dates: Temporal.ZonedDateTime[]): Temporal.ZonedDateTime[] {
    if (this.opts.rDate) {
      dates.push(...this.opts.rDate);
    }

    // Rule generators emit chronologically, so the sort is usually a no-op;
    // detect that in O(n) on epoch values before paying for the comparator sort.
    const epochs = dates.map((d) => d.epochNanoseconds);
    let sorted = true;
    for (let i = 1; i < epochs.length; i++) {
      if (epochs[i - 1]! > epochs[i]!) {
        sorted = false;
        break;
      }
    }
    if (!sorted) {
      const order = dates
        .map((_, i) => i)
        .sort((a, b) => (epochs[a]! < epochs[b]! ? -1 : epochs[a]! > epochs[b]! ? 1 : 0));
      dates = order.map((i) => dates[i]!);
      epochs.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    }

    // Deduplicate (exact-instant equality, i.e. equal epochNanoseconds)
    const dedup: Temporal.ZonedDateTime[] = [];
    for (let i = 0; i < dates.length; i++) {
      if (i === 0 || epochs[i]! !== epochs[i - 1]!) {
        dedup.push(dates[i]!);
      }
    }
    return dedup;
  }

  /**
   * Checks if a date is in the exDate list.
   * @param date - Date to check
   * @returns True if the date is excluded
   */
  private isExcluded(date: Temporal.ZonedDateTime): boolean {
    return this.isExcludedEpoch(date.epochNanoseconds);
  }

  private isExcludedEpoch(epochNanoseconds: bigint): boolean {
    if (!this.opts.exDate || this.opts.exDate.length === 0) return false;
    // ZonedDateTime.compare() === 0 is exact-instant equality, so a Set of
    // epochNanoseconds bigints gives the same semantics in O(1) per lookup.
    if (this.exDateEpochNs === undefined) {
      this.exDateEpochNs = new Set(this.opts.exDate.map((exDate) => exDate.epochNanoseconds));
    }
    return this.exDateEpochNs.has(epochNanoseconds);
  }

  /** Sorted, de-duplicated, and EXDATE-filtered explicit recurrence dates. */
  private getNumericRDates(): Temporal.ZonedDateTime[] {
    if (this.numericRDatesCache) return this.numericRDatesCache;

    const sorted = [...(this.opts.rDate ?? [])].sort((left, right) =>
      left.epochNanoseconds < right.epochNanoseconds ? -1 : left.epochNanoseconds > right.epochNanoseconds ? 1 : 0,
    );
    const dates: Temporal.ZonedDateTime[] = [];
    let previousEpoch: bigint | undefined;
    for (const date of sorted) {
      if (date.epochNanoseconds === previousEpoch) continue;
      previousEpoch = date.epochNanoseconds;
      if (!this.isExcludedEpoch(previousEpoch)) dates.push(date);
    }
    return (this.numericRDatesCache = dates);
  }

  private numericRDateLowerBound(targetEpochNanoseconds: bigint, strict: boolean): number {
    const dates = this.getNumericRDates();
    let low = 0;
    let high = dates.length;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      const epoch = dates[middle]!.epochNanoseconds;
      if (strict ? epoch > targetEpochNanoseconds : epoch >= targetEpochNanoseconds) {
        high = middle;
      } else {
        low = middle + 1;
      }
    }
    return low;
  }

  /**
   * Excludes exDate entries from the given array of dates.
   * @param dates - Array of dates to filter
   * @returns Filtered array with exDate entries removed
   */
  private excludeExDates(dates: Temporal.ZonedDateTime[]): Temporal.ZonedDateTime[] {
    if (!this.opts.exDate || this.opts.exDate.length === 0) return dates;

    return dates.filter((date) => {
      return !this.isExcluded(date);
    });
  }

  /**
   * Finalizes the recurrence set in RFC 5545 order: bound the RRULE-generated
   * dates by COUNT, union RDATE, then subtract EXDATE.
   * @param dates - Array of dates generated by the rule
   * @param iterator - Optional iterator function
   * @returns Final recurrence set
   */
  private applyCountLimitAndMergeRDates(
    dates: Temporal.ZonedDateTime[],
    iterator?: InternalRRuleTemporalIterator,
  ): Temporal.ZonedDateTime[] {
    const ruleDates = this.opts.count === undefined ? dates : dates.slice(0, Math.max(this.opts.count, 0));
    const merged = this.mergeAndDeduplicateRDates(ruleDates);
    const excluded = this.excludeExDates(merged);

    if (!iterator || (!this.opts.rDate && !this.opts.exDate)) {
      return excluded;
    }

    return this.applyIterator(excluded, iterator);
  }

  /**
   * Streams the final recurrence set without materializing the complete RRULE.
   * A rule-only instance keeps COUNT/UNTIL scoped to RRULE generation while
   * sorted RDATE values are merged and EXDATE values are filtered at emission.
   */
  private iterateRecurrenceSet(iterator: InternalRRuleTemporalIterator): Temporal.ZonedDateTime[] {
    const finalDates: Temporal.ZonedDateTime[] = [];
    const rDates = [...(this.opts.rDate ?? [])].sort((a, b) => Temporal.ZonedDateTime.compare(a, b));
    let rDateIndex = 0;
    let lastSeenEpoch: bigint | undefined;
    let stopped = false;

    const emit = (date: Temporal.ZonedDateTime): boolean => {
      const epoch = date.epochNanoseconds;
      if (lastSeenEpoch === epoch) return true;
      lastSeenEpoch = epoch;

      if (this.isExcluded(date)) return true;
      if (!iterator(date, finalDates.length)) {
        stopped = true;
        return false;
      }
      finalDates.push(date);
      return true;
    };

    const emitRDatesBefore = (epoch: bigint): boolean => {
      while (rDateIndex < rDates.length && rDates[rDateIndex]!.epochNanoseconds < epoch) {
        if (!emit(rDates[rDateIndex++]!)) return false;
      }
      return true;
    };

    const ruleIterator: InternalRRuleTemporalIterator = (date) => {
      if (!emitRDatesBefore(date.epochNanoseconds)) return false;
      if (!emit(date)) return false;

      // RRULE wins ties, matching mergeAndDeduplicateRDates()'s stable order.
      while (rDateIndex < rDates.length && rDates[rDateIndex]!.epochNanoseconds === date.epochNanoseconds) {
        rDateIndex++;
      }
      return true;
    };

    if (this.opts.count === undefined || this.opts.count > 0) {
      const ruleOnly = new RRuleTemporal({
        ...this.cloneOptions(),
        rDate: undefined,
        exDate: undefined,
        cache: false,
      });
      ruleOnly.allInternal(ruleIterator);
    }

    while (!stopped && rDateIndex < rDates.length) {
      if (!emit(rDates[rDateIndex++]!)) break;
    }

    return finalDates;
  }

  private applyIterator(
    dates: Temporal.ZonedDateTime[],
    iterator: InternalRRuleTemporalIterator,
  ): Temporal.ZonedDateTime[] {
    const finalDates: Temporal.ZonedDateTime[] = [];

    for (const d of dates) {
      if (!iterator(d, finalDates.length)) break;
      finalDates.push(d);
    }

    return finalDates;
  }

  /** Stops RRULE generation once COUNT rule occurrences have been found. */
  private shouldBreakForCountLimit(matchCount: number): boolean {
    if (this.opts.count === undefined) return false;
    return matchCount >= this.opts.count;
  }

  private hasTimeOfDayBetween(startTime: Temporal.PlainTime, endTime: Temporal.PlainTime): boolean {
    if (Temporal.PlainTime.compare(startTime, endTime) >= 0) return false;

    const base = this.originalDtstart;
    const hours = this.opts.byHour ?? [base.hour];
    const minutes = this.opts.byMinute ?? [base.minute];
    const seconds = this.opts.bySecond ?? [base.second];

    for (const hour of hours) {
      for (const minute of minutes) {
        for (const second of seconds) {
          const candidate = Temporal.PlainTime.from({
            hour,
            minute,
            second,
            millisecond: base.millisecond,
            microsecond: base.microsecond,
            nanosecond: base.nanosecond,
          });
          if (
            Temporal.PlainTime.compare(candidate, startTime) >= 0 &&
            Temporal.PlainTime.compare(candidate, endTime) < 0
          ) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private assertNumericCandidateReachable(candidate: NumericCandidate | null): void {
    if (candidate && candidate.periodIndex >= this.maxIterations) {
      throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
    }
  }

  private numericExhaustionCandidate(plan: NumericQueryPlan): NumericCandidate | null {
    if (plan.count < plan.maximumCount) {
      // UNTIL ended the sequence; the legacy generator reaches the first
      // candidate beyond it before stopping.
      return plan.select(plan.count);
    }
    return plan.count > 0 ? plan.select(plan.count - 1) : null;
  }

  private tryNumericNext(
    targetEpochNanoseconds: bigint,
    inclusive: boolean,
  ): NumericQueryResult<Temporal.ZonedDateTime | null> {
    const plan = this.getNumericQueryPlan();
    if (!plan) return {handled: false};

    let index = plan.lowerBound(targetEpochNanoseconds, !inclusive);
    if (!this.opts.rDate && !this.opts.exDate) {
      if (index >= plan.count) {
        this.assertNumericCandidateReachable(this.numericExhaustionCandidate(plan));
        return {handled: true, value: null};
      }

      const candidate = plan.select(index);
      if (!candidate) return {handled: false};
      this.assertNumericCandidateReachable(candidate);
      return {handled: true, value: this.zdtFromEpochMs(candidate.epochMilliseconds)};
    }

    const rDates = this.getNumericRDates();
    const rDate = rDates[this.numericRDateLowerBound(targetEpochNanoseconds, !inclusive)];

    while (index < plan.count) {
      const candidate = plan.select(index);
      if (!candidate) return {handled: false};
      const candidateEpochNanoseconds = BigInt(candidate.epochMilliseconds) * NS_PER_MILLISECOND;

      // The streaming recurrence-set merge flushes earlier RDATE values from
      // inside the next RRULE callback, after that RRULE period's iteration
      // guard has run. Preserve the same maxIterations boundary here.
      this.assertNumericCandidateReachable(candidate);
      if (rDate && rDate.epochNanoseconds < candidateEpochNanoseconds) {
        return {handled: true, value: rDate};
      }

      if (!this.isExcludedEpoch(candidateEpochNanoseconds)) {
        // RRULE wins an exact-instant tie, matching the recurrence-set merge.
        return {handled: true, value: this.zdtFromEpochMs(candidate.epochMilliseconds)};
      }
      index += 1;
    }

    const exhaustionCandidate = this.numericExhaustionCandidate(plan);
    this.assertNumericCandidateReachable(exhaustionCandidate);
    return {handled: true, value: rDate ?? null};
  }

  private tryNumericPrevious(
    targetEpochNanoseconds: bigint,
    inclusive: boolean,
  ): NumericQueryResult<Temporal.ZonedDateTime | null> {
    const plan = this.getNumericQueryPlan();
    if (!plan) return {handled: false};

    // Inclusive previous() stops at the first candidate > target; exclusive
    // previous() stops at the first candidate >= target.
    const stopIndex = plan.lowerBound(targetEpochNanoseconds, inclusive);
    const reachedCandidate = stopIndex < plan.count ? plan.select(stopIndex) : this.numericExhaustionCandidate(plan);
    this.assertNumericCandidateReachable(reachedCandidate);

    let resultIndex = stopIndex - 1;
    if (!this.opts.rDate && !this.opts.exDate) {
      if (resultIndex < 0) {
        return {handled: true, value: null};
      }
      const candidate = plan.select(resultIndex);
      if (!candidate) return {handled: false};
      return {handled: true, value: this.zdtFromEpochMs(candidate.epochMilliseconds)};
    }

    let ruleCandidate: NumericCandidate | null = null;
    while (resultIndex >= 0) {
      const candidate = plan.select(resultIndex);
      if (!candidate) return {handled: false};
      if (!this.isExcludedEpoch(BigInt(candidate.epochMilliseconds) * NS_PER_MILLISECOND)) {
        ruleCandidate = candidate;
        break;
      }
      resultIndex -= 1;
    }

    const rDates = this.getNumericRDates();
    const rDateIndex = this.numericRDateLowerBound(targetEpochNanoseconds, inclusive) - 1;
    const rDate = rDateIndex >= 0 ? rDates[rDateIndex]! : null;
    if (!ruleCandidate) return {handled: true, value: rDate};
    if (rDate && rDate.epochNanoseconds > BigInt(ruleCandidate.epochMilliseconds) * NS_PER_MILLISECOND) {
      return {handled: true, value: rDate};
    }
    return {handled: true, value: this.zdtFromEpochMs(ruleCandidate.epochMilliseconds)};
  }

  private tryNumericBetween(
    startEpochNanoseconds: bigint,
    endEpochNanoseconds: bigint,
    inclusive: boolean,
  ): NumericQueryResult<Temporal.ZonedDateTime[]> {
    if (startEpochNanoseconds > endEpochNanoseconds) return {handled: false};
    const plan = this.getNumericQueryPlan();
    if (!plan) return {handled: false};

    const firstIndex = plan.lowerBound(startEpochNanoseconds, !inclusive);
    const endIndex = plan.lowerBound(endEpochNanoseconds, inclusive);

    // between() caps the temporary legacy rule with an inclusive UNTIL, so it
    // reaches the first occurrence after the end even when the output itself
    // uses exclusive bounds.
    const scanStopIndex = plan.lowerBound(endEpochNanoseconds, true);
    const reachedCandidate =
      scanStopIndex < plan.count ? plan.select(scanStopIndex) : this.numericExhaustionCandidate(plan);
    this.assertNumericCandidateReachable(reachedCandidate);

    if (firstIndex >= endIndex && !this.opts.rDate) {
      return {handled: true, value: []};
    }

    if (!this.opts.rDate && !this.opts.exDate) {
      const dates = new Array<Temporal.ZonedDateTime>(endIndex - firstIndex);
      for (let index = firstIndex; index < endIndex; index++) {
        const candidate = plan.select(index);
        if (!candidate) return {handled: false};
        dates[index - firstIndex] = this.zdtFromEpochMs(candidate.epochMilliseconds);
      }
      return {handled: true, value: dates};
    }

    const ruleDates: Temporal.ZonedDateTime[] = [];
    for (let index = firstIndex; index < endIndex; index++) {
      const candidate = plan.select(index);
      if (!candidate) return {handled: false};
      const candidateEpochNanoseconds = BigInt(candidate.epochMilliseconds) * NS_PER_MILLISECOND;
      if (!this.isExcludedEpoch(candidateEpochNanoseconds)) {
        ruleDates.push(this.zdtFromEpochMs(candidate.epochMilliseconds));
      }
    }

    const rDates = this.getNumericRDates();
    const firstRDateIndex = this.numericRDateLowerBound(startEpochNanoseconds, !inclusive);
    const endRDateIndex = this.numericRDateLowerBound(endEpochNanoseconds, inclusive);
    const dates: Temporal.ZonedDateTime[] = [];
    let ruleIndex = 0;
    let rDateIndex = firstRDateIndex;
    while (ruleIndex < ruleDates.length || rDateIndex < endRDateIndex) {
      const ruleDate = ruleDates[ruleIndex];
      const rDate = rDates[rDateIndex];
      if (!rDate || (ruleDate && ruleDate.epochNanoseconds <= rDate.epochNanoseconds)) {
        dates.push(ruleDate!);
        ruleIndex += 1;
        if (rDate && rDate.epochNanoseconds === ruleDate!.epochNanoseconds) rDateIndex += 1;
      } else {
        dates.push(rDate);
        rDateIndex += 1;
      }
    }
    return {handled: true, value: dates};
  }

  /**
   * Returns all occurrences of the rule within a specified time window.
   * @param after - The start date or Temporal.ZonedDateTime object.
   * @param before - The end date or Temporal.ZonedDateTime object.
   * @param inc - Optional boolean flag to include the start and end dates in the results.
   * @returns An array of Temporal.ZonedDateTime objects representing all occurrences of the rule within the specified time window.
   */
  between(after: DateFilter, before: DateFilter, inc = false): TOutput[] {
    const startEpochNanoseconds = dateFilterEpochNanoseconds(after, 'after');
    const endEpochNanoseconds = dateFilterEpochNanoseconds(before, 'before');

    const numericResult = this.tryNumericBetween(startEpochNanoseconds, endEpochNanoseconds, inc);
    if (numericResult.handled) {
      return this.toPublicDates(numericResult.value);
    }

    const startZdt = new Temporal.ZonedDateTime(startEpochNanoseconds, this.tzid);
    const beforeZdt = new Temporal.ZonedDateTime(endEpochNanoseconds, this.tzid);

    const tempOpts = {...this.opts};

    if (!tempOpts.until || Temporal.ZonedDateTime.compare(beforeZdt, tempOpts.until) < 0) {
      tempOpts.until = beforeZdt;
    }

    // Optimize dtstart when COUNT is not set by anchoring to the original DTSTART
    // phase and jumping forward in multiples of INTERVAL up to the window start.
    // This preserves cadence for INTERVAL > 1 and reduces iteration.
    if (tempOpts.count === undefined) {
      tempOpts.dtstart = this.jumpAlignedDtstart(startZdt);
    }

    const tempRule = new RRuleTemporal<TOutput>({
      ...tempOpts,
      // The source rule has already been validated in its requested mode.
      // `beforeZdt` is only a traversal cap, not an RRULE UNTIL part, so the
      // internal clone must not reject a valid strict COUNT rule.
      strict: tempOpts.count !== undefined ? false : tempOpts.strict,
      temporal: this.outputTemporal,
    } as RRuleOptions<TOutput>);
    const allDates = tempRule.allInternal(undefined, tempOpts.count === undefined ? startZdt : undefined);

    return this.toPublicDates(
      allDates.filter((date) => {
        const afterStart = inc
          ? date.epochNanoseconds >= startEpochNanoseconds
          : date.epochNanoseconds > startEpochNanoseconds;

        const beforeEnd = inc
          ? date.epochNanoseconds <= endEpochNanoseconds
          : date.epochNanoseconds < endEpochNanoseconds;

        return afterStart && beforeEnd;
      }),
    );
  }

  /**
   * Compute a rule-phase-aligned DTSTART at or just before the given window
   * start, jumping forward from the original DTSTART in whole multiples of
   * INTERVAL. Lets window queries skip iterating occurrences before the
   * window without disturbing cadence. Not valid for COUNT-limited rules,
   * where the occurrence set depends on the index from the true DTSTART.
   */
  private jumpAlignedDtstart(startZdt: Temporal.ZonedDateTime): Temporal.ZonedDateTime {
    const interval = this.opts.interval ?? 1;
    const aligned = startZdt.withPlainTime(this.originalDtstart.toPlainTime());

    // Determine unit for the current frequency
    type LargestUnit = 'years' | 'months' | 'weeks' | 'days' | 'hours' | 'minutes' | 'seconds';
    let unit: LargestUnit;
    switch (this.opts.freq) {
      case 'YEARLY':
        unit = 'years';
        break;
      case 'MONTHLY':
        unit = 'months';
        break;
      case 'WEEKLY':
        unit = 'weeks';
        break;
      case 'DAILY':
        unit = 'days';
        break;
      case 'HOURLY':
        unit = 'hours';
        break;
      case 'MINUTELY':
        unit = 'minutes';
        break;
      default:
        unit = 'seconds';
    }

    const dtstartNormalized = RRuleTemporal.normalizeToPolyfill(this.opts.dtstart);
    const startZdtNormalized = RRuleTemporal.normalizeToPolyfill(startZdt).withTimeZone(dtstartNormalized.timeZoneId);
    const alignedNormalized = RRuleTemporal.normalizeToPolyfill(
      aligned.withPlainTime(this.originalDtstart.toPlainTime()),
    ).withTimeZone(dtstartNormalized.timeZoneId);
    const diffAnchor = ['hours', 'minutes', 'seconds'].includes(unit) ? startZdtNormalized : alignedNormalized;

    const diffDur = dtstartNormalized.until(diffAnchor, {largestUnit: unit});
    const unitsBetween = diffDur[unit]; // may be negative
    let steps = Math.floor(unitsBetween / interval);

    const durationForJump = (jump: number): Temporal.DurationLike => {
      switch (unit) {
        case 'years':
          return {years: jump};
        case 'months':
          return {months: jump};
        case 'weeks':
          return {weeks: jump};
        case 'days':
          return {days: jump};
        case 'hours':
          return {hours: jump};
        case 'minutes':
          return {minutes: jump};
        default:
          return {seconds: jump};
      }
    };

    let candidate = RRuleTemporal.normalizeToPolyfill(this.opts.dtstart.add(durationForJump(steps * interval)));

    if (steps > 0 && ['years', 'months', 'weeks', 'days'].includes(unit)) {
      const sameDate = candidate.toPlainDate().equals(startZdtNormalized.toPlainDate());
      if (sameDate && Temporal.ZonedDateTime.compare(candidate, startZdtNormalized) > 0) {
        if (this.hasTimeOfDayBetween(startZdtNormalized.toPlainTime(), candidate.toPlainTime())) {
          steps -= 1;
          candidate = RRuleTemporal.normalizeToPolyfill(this.opts.dtstart.add(durationForJump(steps * interval)));
        }
      }
    }

    // Jumping whole days, weeks, months or years can land on a wall time that does not exist --
    // 02:30 on the day a zone springs forward -- which `compatible` disambiguation resolves an hour
    // later. The window query clones this rule with the aligned instant as its DTSTART, so a
    // shifted anchor would make the clone treat the shifted time as the rule's own time of day and
    // hand it to every later occurrence. Step back in whole intervals until an anchor carries the
    // canonical time; several consecutive occurrences can land in gaps with larger intervals.
    if (['years', 'months', 'weeks', 'days'].includes(unit)) {
      const canonicalTime = this.originalDtstart.toPlainTime();
      let stepsBack = 0;
      while (steps - stepsBack > 0 && !candidate.toPlainTime().equals(canonicalTime)) {
        stepsBack += 1;
        candidate = RRuleTemporal.normalizeToPolyfill(
          this.opts.dtstart.add(durationForJump((steps - stepsBack) * interval)),
        );
      }
    }

    const dtstartForCompare = RRuleTemporal.normalizeToPolyfill(this.opts.dtstart);

    // Ensure we never start before the original DTSTART
    if (Temporal.ZonedDateTime.compare(candidate, dtstartForCompare) < 0) {
      candidate = dtstartForCompare;
    }

    return candidate;
  }

  /**
   * Convenience helper: true if the exact instant is an occurrence of the rule.
   * This checks full date-time equality (including time and time zone).
   */
  matches(date: DateFilter): boolean {
    const targetEpochNanoseconds = dateFilterEpochNanoseconds(date, 'date');
    return this.nextInternal(targetEpochNanoseconds, true)?.epochNanoseconds === targetEpochNanoseconds;
  }

  /**
   * Convenience helper: true if any occurrence falls on the given calendar day
   * in the rule's time zone. This ignores time-of-day granularity.
   */
  occursOn(date: TemporalPlainDateInput): boolean {
    const plainDate = Temporal.PlainDate.from(date.toString());
    const startOfDay = plainDate.toZonedDateTime({
      timeZone: this.tzid,
      plainTime: Temporal.PlainTime.from('00:00'),
    });
    const nextDay = startOfDay.add({days: 1});
    const occurrence = this.nextInternal(startOfDay.epochNanoseconds, true);
    return occurrence !== null && occurrence.epochNanoseconds < nextDay.epochNanoseconds;
  }

  private nextInternal(afterEpochNanoseconds: bigint, inc: boolean): Temporal.ZonedDateTime | null {
    const numericResult = this.tryNumericNext(afterEpochNanoseconds, inc);
    if (numericResult.handled) {
      return numericResult.value;
    }

    let result: Temporal.ZonedDateTime | null = null;
    const scanFrom = (rule: RRuleTemporal<TOutput>) => {
      rule.allInternal((occ) => {
        const ok = inc ? occ.epochNanoseconds >= afterEpochNanoseconds : occ.epochNanoseconds > afterEpochNanoseconds;
        if (ok) {
          // Keep the minimum defensively; recurrence-set iterators emit in
          // chronological order, so this is normally the first match.
          if (!result || occ.epochNanoseconds < result.epochNanoseconds) {
            result = occ;
          }
          return false;
        }
        return true;
      });
    };

    // COUNT rules must enumerate from the true DTSTART (the occurrence set
    // depends on the index); otherwise start the scan at a rule-phase-aligned
    // point just before `after` instead of walking the whole rule history.
    if (this.opts.count !== undefined) {
      scanFrom(this);
    } else {
      scanFrom(this.ruleFromAlignedDtstart(new Temporal.ZonedDateTime(afterEpochNanoseconds, this.tzid)));
    }

    return result;
  }

  /**
   * Returns the next occurrence of the rule after a specified date.
   * @param after - The start date or Temporal.ZonedDateTime object.
   * @param inc - Optional boolean flag to include occurrences on the start date.
   * @returns The next occurrence of the rule after the specified date or null if no occurrences are found.
   */
  next(after: DateFilter = new Date(), inc = false): TOutput | null {
    return this.toPublicDate(this.nextInternal(dateFilterEpochNanoseconds(after, 'after'), inc));
  }

  /**
   * Build a temporary rule identical to this one but starting at the
   * phase-aligned DTSTART for the given window start. The synthetic DTSTART
   * only keeps includeDtstart semantics when it coincides with the original.
   */
  private ruleFromAlignedDtstart(windowStart: Temporal.ZonedDateTime): RRuleTemporal<TOutput> {
    const aligned = this.jumpAlignedDtstart(windowStart);
    if (aligned.epochNanoseconds === this.originalDtstart.epochNanoseconds) {
      return this;
    }
    return new RRuleTemporal<TOutput>({
      ...this.opts,
      temporal: this.outputTemporal,
      dtstart: aligned,
      includeDtstart: false,
    } as RRuleOptions<TOutput>);
  }

  /**
   * Returns the previous occurrence of the rule before a specified date.
   * @param before - The end date or Temporal.ZonedDateTime object.
   * @param inc - Optional boolean flag to include occurrences on the end date.
   * @returns The previous occurrence of the rule before the specified date or null if no occurrences are found.
   */
  previous(before: DateFilter = new Date(), inc = false): TOutput | null {
    const beforeEpochNanoseconds = dateFilterEpochNanoseconds(before, 'before');

    const numericResult = this.tryNumericPrevious(beforeEpochNanoseconds, inc);
    if (numericResult.handled) {
      return this.toPublicDate(numericResult.value);
    }

    const scanFrom = (rule: RRuleTemporal<TOutput>): Temporal.ZonedDateTime | null => {
      let prev: Temporal.ZonedDateTime | null = null;
      rule.allInternal((occ) => {
        const beyond = inc
          ? occ.epochNanoseconds > beforeEpochNanoseconds
          : occ.epochNanoseconds >= beforeEpochNanoseconds;
        if (beyond) return false;
        prev = occ;
        return true;
      });
      return prev;
    };

    // COUNT rules must enumerate from the true DTSTART (see next()).
    if (this.opts.count !== undefined) {
      return this.toPublicDate(scanFrom(this));
    }

    // Scan forward from a phase-aligned start near the target, backing the
    // start off exponentially until an occurrence before the target is found
    // (or the original DTSTART is reached, meaning there is none).
    const beforeZdt = new Temporal.ZonedDateTime(beforeEpochNanoseconds, this.tzid);
    const anchor =
      this.opts.until && Temporal.ZonedDateTime.compare(this.opts.until, beforeZdt) < 0 ? this.opts.until : beforeZdt;
    const interval = this.opts.interval ?? 1;
    for (let backoff = 0; backoff < 16; backoff++) {
      const target = backoff === 0 ? anchor : anchor.subtract(this.freqDuration(interval * 4 ** backoff));
      const rule = this.ruleFromAlignedDtstart(target);
      const prev = scanFrom(rule);
      if (prev || rule === this) {
        return this.toPublicDate(prev);
      }
    }
    return this.toPublicDate(scanFrom(this));
  }

  /** A duration of `count` steps in this rule's frequency unit. */
  private freqDuration(count: number): Temporal.DurationLike {
    switch (this.opts.freq) {
      case 'YEARLY':
        return {years: count};
      case 'MONTHLY':
        return {months: count};
      case 'WEEKLY':
        return {weeks: count};
      case 'DAILY':
        return {days: count};
      case 'HOURLY':
        return {hours: count};
      case 'MINUTELY':
        return {minutes: count};
      default:
        return {seconds: count};
    }
  }

  toString(): string {
    const iso = this.originalDtstart.toString({smallestUnit: 'second'}).replace(/[-:]/g, '');
    const dtLine = `DTSTART;TZID=${this.tzid}:${iso.slice(0, 15)}`;
    const rule: string[] = [];
    const {
      freq,
      interval,
      count,
      until,
      byHour,
      byMinute,
      bySecond,
      byDay,
      byMonth,
      byMonthDay,
      bySetPos,
      byWeekNo,
      byYearDay,
      wkst,
      rDate,
      exDate,
    } = this.opts;

    // RFC 7529: include RSCALE/SKIP when present
    if (this.opts.rscale) rule.push(`RSCALE=${this.opts.rscale}`);
    if (this.opts.rscale && this.opts.skip) rule.push(`SKIP=${this.opts.skip}`);
    rule.push(`FREQ=${freq}`);
    if (interval !== 1) rule.push(`INTERVAL=${interval}`);
    if (count !== undefined) rule.push(`COUNT=${count}`);
    if (until) {
      rule.push(`UNTIL=${this.formatIcsDateTime(until)}`);
    }
    if (byHour) rule.push(`BYHOUR=${byHour.join(',')}`);
    if (byMinute) rule.push(`BYMINUTE=${byMinute.join(',')}`);
    if (bySecond) rule.push(`BYSECOND=${bySecond.join(',')}`);
    if (byDay) rule.push(`BYDAY=${byDay.join(',')}`);
    if (byMonth) rule.push(`BYMONTH=${byMonth.join(',')}`);
    if (byMonthDay) rule.push(`BYMONTHDAY=${byMonthDay.join(',')}`);
    if (bySetPos) rule.push(`BYSETPOS=${bySetPos.join(',')}`);
    if (byWeekNo) rule.push(`BYWEEKNO=${byWeekNo.join(',')}`);
    if (byYearDay) rule.push(`BYYEARDAY=${byYearDay.join(',')}`);
    if (wkst) rule.push(`WKST=${wkst}`);

    const lines = [dtLine, `RRULE:${rule.join(';')}`];
    if (rDate) {
      lines.push(`RDATE:${this.joinDates(rDate)}`);
    }
    if (exDate) {
      lines.push(`EXDATE:${this.joinDates(exDate)}`);
    }
    return lines.join('\n');
  }

  private formatIcsDateTime(date: Temporal.ZonedDateTime): string {
    return date.toInstant().toString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  }

  private joinDates(dates: Temporal.ZonedDateTime[]) {
    return dates.map((d) => this.formatIcsDateTime(d));
  }

  /**
   * Resolve the calendar dates selected within a month without expanding any
   * time BY-parts. This keeps the intermediate set bounded to calendar scale.
   */
  private generateMonthlyDateCandidates(sample: Temporal.ZonedDateTime): Temporal.ZonedDateTime[] {
    const monthStart = sample.day === 1 ? sample : sample.with({day: 1});
    if (!this.opts.byDay && !this.opts.byMonthDay) {
      return [sample];
    }

    const finalDays = this.generateMonthlyOccurrenceDays(monthStart);
    if (finalDays.length === 0) return [];
    return finalDays.map((day) => monthStart.with({day}));
  }

  private generateMonthlyOccurrences(sample: Temporal.ZonedDateTime): Temporal.ZonedDateTime[] {
    return this.generateMonthlyDateCandidates(sample).flatMap((date) => this.expandByTime(date));
  }

  /**
   * Resolve one recurrence year's matching calendar dates. BYHOUR,
   * BYMINUTE, BYSECOND, and BYSETPOS deliberately remain outside this helper;
   * callers consume the date x time product incrementally.
   */
  private generateYearlyDateCandidates(sample: Temporal.ZonedDateTime): Temporal.ZonedDateTime[] {
    const months = this.opts.byMonth
      ? this.opts.byMonth.filter((v): v is number => typeof v === 'number').sort((a, b) => a - b)
      : this.opts.byMonthDay || this.opts.byDay
        ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
        : [this.originalDtstart.month];

    let occs: Temporal.ZonedDateTime[] = [];

    const hasOrdinalByDay = this.opts.byDay && this.opts.byDay.some((t) => /^[+-]?\d/.test(t));
    if (hasOrdinalByDay && !this.opts.byMonth) {
      // nth weekday of year
      const dayMap = weekdayToIsoDay;
      for (const tok of this.opts.byDay!) {
        const parsed = parseByDayToken(tok);
        if (!parsed || parsed.ord === 0) continue;
        const ord = parsed.ord;
        const wd = dayMap[parsed.weekday]!;
        let dt: Temporal.ZonedDateTime;
        if (ord > 0) {
          const jan1 = sample.with({month: 1, day: 1});
          const delta = (wd - jan1.dayOfWeek + 7) % 7;
          dt = jan1.add({days: delta + 7 * (ord - 1)});
        } else {
          const dec31 = sample.with({month: 12, day: 31});
          const delta = (dec31.dayOfWeek - wd + 7) % 7;
          dt = dec31.subtract({days: delta + 7 * (-ord - 1)});
        }
        // byMonth is already checked to be falsy in the outer condition
        occs.push(dt);
      }
    } else if (!this.opts.byYearDay && !this.opts.byWeekNo) {
      // Build per-month then apply RFC 7529 SKIP if RSCALE present and BYMONTHDAY invalid
      occs = [];
      for (const m of months) {
        const monthSample = sample.with({month: m, day: 1});
        const monthOccs = this.generateMonthlyDateCandidates(monthSample);
        if (monthOccs.length === 0 && this.opts.rscale && this.opts.byMonthDay && this.opts.byMonthDay.length > 0) {
          // SKIP for invalid day-of-month (e.g., Feb 29 on non-leap years)
          const lastDay = monthSample.add({months: 1}).subtract({days: 1}).day;
          const target = this.opts.byMonthDay[0]!; // assume single DOM for this case
          const absTarget = target > 0 ? target : lastDay + target + 1;
          if (absTarget > lastDay || absTarget <= 0) {
            const skip = this.opts.skip || 'OMIT';
            if (skip === 'BACKWARD') {
              occs.push(monthSample.with({day: lastDay}));
            } else if (skip === 'FORWARD') {
              const nextMonth = monthSample.add({months: 1}).with({day: 1});
              occs.push(nextMonth);
            } else {
              // OMIT -> no date added
            }
          }
        } else {
          occs.push(...monthOccs);
        }
      }
    }

    if (this.opts.byYearDay) {
      const last = sample.with({month: 12, day: 31}).dayOfYear;
      for (const d of this.opts.byYearDay) {
        const dayNum = d > 0 ? d : last + d + 1;
        if (dayNum <= 0 || dayNum > last) continue;
        const dt =
          this.opts.freq === 'MINUTELY'
            ? sample.with({month: 1, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0}).add({days: dayNum - 1})
            : sample.with({month: 1, day: 1}).add({days: dayNum - 1});
        if (!this.opts.byMonth || this.opts.byMonth!.includes(dt.month)) {
          occs.push(dt);
        }
      }
    }

    if (this.opts.byWeekNo) {
      const {lastWeek, firstWeekStart, tokens} = this.isoWeekByDay(sample);
      for (const weekNo of this.opts.byWeekNo) {
        if ((weekNo > 0 && weekNo > lastWeek) || (weekNo < 0 && -weekNo > lastWeek)) {
          continue;
        }
        const weekIndex = weekNo > 0 ? weekNo - 1 : lastWeek + weekNo;
        const weekStart = firstWeekStart.add({weeks: weekIndex});
        occs.push(...this.addByDayDates(tokens, weekStart));
      }
    }

    return this.sortedUniqueDateCandidates(occs);
  }

  private addByDayDates(tokens: string[], weekStart: Temporal.ZonedDateTime): Temporal.ZonedDateTime[] {
    const dayMap = weekdayToIsoDay;
    const wkst = dayMap[(this.opts.wkst || 'MO') as keyof typeof dayMap]!;
    const entries: Temporal.ZonedDateTime[] = [];
    for (const tok of tokens) {
      if (!tok) continue;
      const targetDow = dayMap[tok as keyof typeof dayMap]!;
      const inst = weekStart.add({days: (targetDow - wkst + 7) % 7});
      if (!this.opts.byMonth || this.opts.byMonth!.includes(inst.month)) {
        entries.push(inst);
      }
    }
    return this.sortedUniqueDateCandidates(entries);
  }

  /**
   * Helper to find the next valid value from a sorted array
   */
  private findNextValidValue<T>(currentValue: T, validValues: T[], compare: (a: T, b: T) => number): T | null {
    return validValues.find((v) => compare(v, currentValue) > 0) || null;
  }

  /**
   * Efficiently find the next valid date for MINUTELY and SECONDLY frequency by jumping over
   * large gaps when BYXXX constraints don't match.
   */
  private findNextValidDate(current: Temporal.ZonedDateTime): Temporal.ZonedDateTime {
    if (this.opts.byWeekNo && this.opts.byYearDay) {
      // If both byWeekNo and byYearDay are present, there is a high chance of conflict.
      // To avoid an infinite loop, we can check if any of the byYearDay dates fall within any of the byWeekNo weeks.
      const yearStart = current.with({month: 1, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0});
      const yearDays = this.opts.byYearDay.map((yd) => {
        const lastDayOfYear = yearStart.with({month: 12, day: 31}).dayOfYear;
        return yd > 0 ? yd : lastDayOfYear + yd + 1;
      });

      for (const yd of yearDays) {
        const date = yearStart.add({days: yd - 1});
        if (this.matchesByWeekNo(date)) {
          // At least one combination is possible, so we can proceed with the normal search
          break;
        }
      }
    }

    // Try to jump efficiently based on which constraints are failing

    // Check BYMONTH first (largest potential jump)
    if (this.opts.byMonth) {
      const numericMonths = this.opts.byMonth.filter((v): v is number => typeof v === 'number');
      if (numericMonths.length && !numericMonths.includes(current.month)) {
        const months = [...numericMonths].sort((a, b) => a - b);
        const nextMonth = this.findNextValidValue(current.month, months, (a, b) => a - b);
        if (nextMonth) {
          current = current.with({month: nextMonth, day: 1, hour: 0, minute: 0, second: 0});
        } else {
          // Move to next year and use first valid month
          current = current.add({years: 1}).with({month: months[0], day: 1, hour: 0, minute: 0, second: 0});
        }
        current = this.applyTimeOverride(current);
        return current;
      }
    }

    // Check BYWEEKNO (can jump across weeks/months)
    if (this.opts.byWeekNo && !this.matchesByWeekNo(current)) {
      // This is complex, so for now just advance by a week
      current = current.add({weeks: 1}).with({hour: 0, minute: 0, second: 0});
      current = this.applyTimeOverride(current);
      return current;
    }

    // Check BYYEARDAY (can jump across months)
    if (this.opts.byYearDay && !this.matchesByYearDay(current)) {
      const yearDays = [...this.opts.byYearDay].sort((a, b) => a - b);
      const currentYearDay = current.dayOfYear;
      const lastDayOfYear = current.with({month: 12, day: 31}).dayOfYear;

      let nextYearDay = yearDays.find((d) => {
        const dayNum = d > 0 ? d : lastDayOfYear + d + 1;
        return dayNum > currentYearDay;
      });

      if (nextYearDay) {
        const dayNum = nextYearDay > 0 ? nextYearDay : lastDayOfYear + nextYearDay + 1;
        if (this.opts.freq === 'MINUTELY' || this.opts.freq === 'SECONDLY') {
          current = current
            .with({month: 1, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0})
            .add({days: dayNum - 1});
        } else {
          current = current.with({month: 1, day: 1}).add({days: dayNum - 1});
        }
      } else {
        // Move to next year and use first valid yearday
        const nextYear = current.add({years: 1});
        const nextYearLastDay = nextYear.with({month: 12, day: 31}).dayOfYear;
        const firstYearDay = yearDays[0];
        if (firstYearDay !== undefined) {
          const dayNum = firstYearDay > 0 ? firstYearDay : nextYearLastDay + firstYearDay + 1;
          if (this.opts.freq === 'MINUTELY' || this.opts.freq === 'SECONDLY') {
            current = nextYear
              .with({month: 1, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0})
              .add({days: dayNum - 1});
          } else {
            current = nextYear.with({month: 1, day: 1}).add({days: dayNum - 1});
          }
        }
      }
      current = this.applyTimeOverride(current);
      return current;
    }

    // Check BYMONTHDAY (can jump within month)
    if (this.opts.byMonthDay && !this.matchesByMonthDay(current)) {
      const monthDays = [...this.opts.byMonthDay].sort((a, b) => a - b);
      const lastDayOfMonth = current.with({day: 1}).add({months: 1}).subtract({days: 1}).day;
      const currentDay = current.day;

      // Convert negative monthdays to positive and find valid candidates
      const validDays = monthDays
        .map((d) => (d > 0 ? d : lastDayOfMonth + d + 1))
        .filter((d) => d > 0 && d <= lastDayOfMonth)
        .sort((a, b) => a - b);

      const nextDay = this.findNextValidValue(currentDay, validDays, (a, b) => a - b);

      if (nextDay) {
        current = current.with({day: nextDay, hour: 0, minute: 0, second: 0});
      } else {
        // Move to next month and use first valid day
        const nextMonth = current.add({months: 1}).with({day: 1});
        const nextMonthLastDay = nextMonth.add({months: 1}).subtract({days: 1}).day;
        const firstMonthDay = monthDays[0];
        if (firstMonthDay !== undefined) {
          const dayNum = firstMonthDay > 0 ? firstMonthDay : nextMonthLastDay + firstMonthDay + 1;
          current = nextMonth.with({
            day: Math.max(1, Math.min(dayNum, nextMonthLastDay)),
            hour: 0,
            minute: 0,
            second: 0,
          });
        } else {
          // No valid days in the next month, advance by a full month
          current = current.add({months: 1}).with({day: 1, hour: 0, minute: 0, second: 0});
        }
      }
      current = this.applyTimeOverride(current);
      return current;
    }

    // Check BYDAY (can jump within week)
    if (this.opts.byDay && !this.matchesByDay(current)) {
      const targetDays = this.allByDayIsoDays;
      if (!targetDays?.length) {
        return this.applyTimeOverride(current.add({days: 1}).with({hour: 0, minute: 0, second: 0}));
      }

      const nextDayOfWeek = this.findNextValidValue(current.dayOfWeek, targetDays, (a, b) => a - b);

      if (nextDayOfWeek) {
        const delta = (nextDayOfWeek - current.dayOfWeek + 7) % 7;
        current = current.add({days: delta}).with({hour: 0, minute: 0, second: 0});
      } else {
        // Move to next week and use first valid day
        const delta = (targetDays[0]! - current.dayOfWeek + 7) % 7;
        current = current.add({days: delta + 7}).with({hour: 0, minute: 0, second: 0});
      }
      current = this.applyTimeOverride(current);
      return current;
    }

    // Fallback: if no specific jump can be made, advance by the smallest unit larger than the frequency
    switch (this.opts.freq) {
      case 'SECONDLY':
      case 'MINUTELY':
        current = current.add({days: 1}).with({hour: 0, minute: 0, second: 0});
        break;
      case 'HOURLY':
        current = current.add({days: 1}).with({hour: 0, minute: 0, second: 0});
        break;
      case 'DAILY':
      case 'WEEKLY':
        current = current.add({months: 1}).with({day: 1, hour: 0, minute: 0, second: 0});
        break;
      case 'MONTHLY':
      case 'YEARLY':
        current = current.add({years: 1}).with({month: 1, day: 1, hour: 0, minute: 0, second: 0});
        break;
    }
    return this.applyTimeOverride(current);
  }

  private applyBySetPos(list: Temporal.ZonedDateTime[]): Temporal.ZonedDateTime[] {
    const {bySetPos} = this.opts;
    if (!bySetPos || !bySetPos.length) return list;
    const sorted = [...list].sort((a, b) => Temporal.ZonedDateTime.compare(a, b));
    const out = this.applyBySetPosToSortedList(sorted);
    return out.sort((a, b) => Temporal.ZonedDateTime.compare(a, b));
  }

  private isoWeekByDay(sample: Temporal.ZonedDateTime) {
    const dayMap = weekdayToIsoDay;
    const wkst = dayMap[(this.opts.wkst || 'MO') as keyof typeof dayMap]!;
    const jan1 = sample.with({month: 1, day: 1});
    const jan4 = sample.with({month: 1, day: 4});
    const delta = (jan4.dayOfWeek - wkst + 7) % 7;
    const firstWeekStart = jan4.subtract({days: delta});

    // Calculate the number of weeks in the year using ISO 8601 rules
    const isLeapYear = jan1.inLeapYear;
    const lastWeek = jan1.dayOfWeek === 4 || (isLeapYear && jan1.dayOfWeek === 3) ? 53 : 52;

    const tokens = this.opts.byDay?.length
      ? this.opts.byDay.map((tok) => extractWeekdayToken(tok)).filter((day): day is Weekday => day !== null)
      : [Object.entries(dayMap).find(([, d]) => d === this.originalDtstart.dayOfWeek)![0]];

    return {lastWeek, firstWeekStart, tokens};
  }

  /**
   * Generate occurrences for a specific week number in a given year
   */
  private generateDateCandidatesForWeekInYear(year: number, weekNo: number): Temporal.ZonedDateTime[] {
    const occs: Temporal.ZonedDateTime[] = [];
    const sample = this.originalDtstart.with({year, month: 1, day: 1});

    const {lastWeek, firstWeekStart, tokens} = this.isoWeekByDay(sample);

    // Skip if week number doesn't exist in this year
    if ((weekNo > 0 && weekNo > lastWeek) || (weekNo < 0 && -weekNo > lastWeek)) {
      return occs;
    }

    const weekIndex = weekNo > 0 ? weekNo - 1 : lastWeek + weekNo;
    const weekStart = firstWeekStart.add({weeks: weekIndex});
    occs.push(...this.addByDayDates(tokens, weekStart));

    return this.sortedUniqueDateCandidates(occs);
  }

  // ===== RSCALE (non-Gregorian) support: Chinese and Hebrew =====
  private getRscaleCalendarId(): string | null {
    const map: Record<string, string> = {
      GREGORIAN: 'gregory',
      CHINESE: 'chinese',
      HEBREW: 'hebrew',
      INDIAN: 'indian',
    };
    const r = this.opts.rscale?.toUpperCase() || '';
    return map[r] || null;
  }

  private assertRscaleCalendarSupported(calId: string) {
    if (calId === 'gregory' || calId === 'iso8601') return;
    const cached = RRuleTemporal.rscaleCalendarSupport[calId];
    if (cached === true) return;
    if (cached === false) {
      throw new Error(`RSCALE=${this.opts.rscale} is not supported by the current Temporal/Intl implementation`);
    }
    let supported = true;
    try {
      const probe = PolyfillTemporal.ZonedDateTime.from('2000-01-01T00:00:00+00:00[UTC]').withCalendar(calId);
      void probe.year;
      void probe.monthCode;
      void probe.day;
    } catch {
      supported = false;
    }
    RRuleTemporal.rscaleCalendarSupport[calId] = supported;
    if (!supported) {
      throw new Error(`RSCALE=${this.opts.rscale} is not supported by the current Temporal/Intl implementation`);
    }
  }

  private pad2(n: number): string {
    return String(n).padStart(2, '0');
  }

  private monthMatchesToken(monthCode: string, token: number | string): boolean {
    if (typeof token === 'number') {
      return monthCode === `M${this.pad2(token)}`;
    }
    if (/^\d+L$/i.test(token)) {
      const n = parseInt(token, 10);
      return monthCode === `M${this.pad2(n)}L`;
    }
    // Unknown token format: ignore (match nothing)
    return false;
  }

  private monthsOfYear(calId: string, year: number): Temporal.PlainDate[] {
    const out: Temporal.PlainDate[] = [];
    for (let m = 1; m <= 20; m++) {
      try {
        const d = PolyfillTemporal.PlainDate.from({calendar: calId, year, month: m, day: 1});
        out.push(d);
      } catch {
        break;
      }
    }
    return out;
  }

  private startOfYear(calId: string, year: number): Temporal.PlainDate {
    return PolyfillTemporal.PlainDate.from({calendar: calId, year, month: 1, day: 1});
  }

  private endOfYear(calId: string, year: number): Temporal.PlainDate {
    return this.startOfYear(calId, year + 1).subtract({days: 1});
  }

  private rscaleFirstWeekStart(calId: string, year: number, wkst: number): Temporal.PlainDate {
    // Analogous to ISO: the week containing month=1 day=4 is week 1
    const jan4 = PolyfillTemporal.PlainDate.from({calendar: calId, year, month: 1, day: 4});
    const delta = (jan4.dayOfWeek - wkst + 7) % 7;
    return jan4.subtract({days: delta});
  }

  private rscaleLastWeekCount(calId: string, year: number, wkst: number): number {
    const firstWeekStart = this.rscaleFirstWeekStart(calId, year, wkst);
    const lastDay = this.endOfYear(calId, year);
    const diffDays = lastDay.since(firstWeekStart).days;
    return Math.floor(diffDays / 7) + 1;
  }

  private lastDayOfMonth(pd: Temporal.PlainDate): number {
    return pd.with({day: 1}).add({months: 1}).subtract({days: 1}).day;
  }

  /** Convert an ambient ZonedDateTime into polyfill space for RSCALE math. */
  private toRscaleZdt(zdt: Temporal.ZonedDateTime): Temporal.ZonedDateTime {
    return PolyfillTemporal.ZonedDateTime.from(zdt.toString());
  }

  private buildZdtFromPlainDate(pd: Temporal.PlainDate): Temporal.ZonedDateTime {
    const t = this.originalDtstart;
    // pd lives in polyfill space (pinned RSCALE calendar data); convert to
    // ISO fields there, then emit through the ambient implementation.
    const iso = pd.withCalendar('iso8601');
    const pdt = PolyfillTemporal.PlainDateTime.from({
      year: iso.year,
      month: iso.month,
      day: iso.day,
      hour: t.hour,
      minute: t.minute,
      second: t.second,
    });
    return new Temporal.ZonedDateTime(pdt.toZonedDateTime(this.tzid).epochNanoseconds, this.tzid);
  }

  private rscaleMatchesByYearDay(calId: string, pd: Temporal.PlainDate): boolean {
    const list = this.opts.byYearDay;
    if (!list || list.length === 0) return true;
    const last = this.endOfYear(calId, pd.year).dayOfYear;
    return list.some((d) => (d > 0 ? pd.dayOfYear === d : pd.dayOfYear === last + d + 1));
  }

  private rscaleMatchesByWeekNo(calId: string, pd: Temporal.PlainDate): boolean {
    const list = this.opts.byWeekNo;
    if (!list || list.length === 0) return true;
    const dayMap = weekdayToIsoDay;
    const wkst = dayMap[(this.opts.wkst || 'MO') as keyof typeof dayMap]!;
    // Compute which week index this date lies in for its week-year
    const weekStart = pd.subtract({days: (pd.dayOfWeek - wkst + 7) % 7});
    const thursday = weekStart.add({days: (4 - wkst + 7) % 7});
    const weekYear = thursday.year;
    const firstStart = this.rscaleFirstWeekStart(calId, weekYear, wkst);
    const lastWeek = this.rscaleLastWeekCount(calId, weekYear, wkst);
    const idx = Math.floor(pd.since(firstStart).days / 7) + 1;
    return list.some((wn) => (wn > 0 ? idx === wn : idx === lastWeek + wn + 1));
  }

  private rscaleMatchesByMonth(calId: string, pd: Temporal.PlainDate): boolean {
    const tokens = this.opts.byMonth as Array<number | string> | undefined;
    if (!tokens || tokens.length === 0) return true;
    return tokens.some((tok) => this.monthMatchesToken(pd.monthCode, tok));
  }

  private rscaleMatchesByMonthDay(pd: Temporal.PlainDate): boolean {
    const list = this.opts.byMonthDay;
    if (!list || list.length === 0) return true;
    const last = pd.with({day: 1}).add({months: 1}).subtract({days: 1}).day; // end of month
    const value = pd.day;
    return list.some((d) => (d > 0 ? value === d : value === last + d + 1));
  }

  private rscaleMatchesByDayBasic(pd: Temporal.PlainDate): boolean {
    const byDay = this.opts.byDay;
    if (!byDay || byDay.length === 0) return true;
    // Only handle simple weekday tokens (MO..SU). Ordinals are not applied at subdaily level here.
    const dayMap = weekdayToIsoDay;
    const tokens = byDay.map((tok) => extractWeekdayToken(tok)).filter((x): x is Weekday => x !== null);
    if (tokens.length === 0) return true;
    return tokens.some((wd) => dayMap[wd as keyof typeof dayMap] === pd.dayOfWeek);
  }

  private rscaleDateMatches(calId: string, pd: Temporal.PlainDate): boolean {
    return (
      this.rscaleMatchesByMonth(calId, pd) &&
      this.rscaleMatchesByYearDay(calId, pd) &&
      this.rscaleMatchesByWeekNo(calId, pd) &&
      this.rscaleMatchesByMonthDay(pd) &&
      this.rscaleMatchesByDayBasic(pd)
    );
  }

  private applySkipForDay(
    calId: string,
    year: number,
    monthStart: Temporal.PlainDate,
    targetDay: number,
  ): Temporal.PlainDate | null {
    const last = this.lastDayOfMonth(monthStart);
    const skip = this.opts.skip || 'OMIT';
    if (targetDay >= 1 && targetDay <= last) {
      return monthStart.with({day: targetDay});
    }
    if (skip === 'BACKWARD') {
      return monthStart.with({day: last});
    }
    if (skip === 'FORWARD') {
      // first day of next month
      const nextMonthStart = monthStart.add({months: 1});
      return nextMonthStart.with({day: 1});
    }
    return null; // OMIT
  }

  private generateMonthlyOccurrencesRscale(
    calId: string,
    year: number,
    monthStart: Temporal.PlainDate,
  ): Temporal.ZonedDateTime[] {
    const occs: Temporal.ZonedDateTime[] = [];
    const byMonthDay = this.opts.byMonthDay;
    const byDay = this.opts.byDay;

    // If no BYDAY/BYMONTHDAY, default to DTSTART's day in this calendar
    if (!byDay && !byMonthDay) {
      const targetDay = this.toRscaleZdt(this.originalDtstart).withCalendar(calId).day;
      const pd = this.applySkipForDay(calId, year, monthStart, targetDay);
      if (pd) occs.push(this.buildZdtFromPlainDate(pd));
      return occs;
    }

    const addZ = (pd: Temporal.PlainDate) => {
      occs.push(this.buildZdtFromPlainDate(pd));
    };

    // BYMONTHDAY handling first
    const last = this.lastDayOfMonth(monthStart);
    const resolveDay = (d: number) => (d > 0 ? d : last + d + 1);

    if (byMonthDay && byMonthDay.length > 0) {
      for (const raw of byMonthDay) {
        const dayNum = resolveDay(raw);
        const pd = this.applySkipForDay(calId, year, monthStart, dayNum);
        if (pd) addZ(pd);
      }
    }

    // BYDAY within month (supports ordinals like 1MO, -1SU)
    if (byDay && byDay.length > 0) {
      const dayMap = weekdayToIsoDay;
      // Bucket days by weekday
      const buckets: Record<number, Temporal.PlainDate[]> = {};
      let cur = monthStart;
      while (cur.month === monthStart.month && cur.year === monthStart.year) {
        const wd = cur.dayOfWeek;
        (buckets[wd] ||= []).push(cur);
        cur = cur.add({days: 1});
      }
      for (const tok of byDay) {
        const parsed = parseByDayToken(tok);
        if (!parsed) continue;
        const ord = parsed.ord;
        const wd = dayMap[parsed.weekday]!;
        const list = buckets[wd] || [];
        if (list.length === 0) continue;
        if (ord === 0) {
          for (const pd of list) addZ(pd);
        } else {
          const idx = ord > 0 ? ord - 1 : list.length + ord;
          const pd = list[idx];
          if (pd) addZ(pd);
        }
      }
    }

    // Apply BYSETPOS if present
    return this.applyBySetPos(occs).sort((a, b) => Temporal.ZonedDateTime.compare(a, b));
  }

  private _allRscaleNonGregorian(
    iterator?: InternalRRuleTemporalIterator,
    queryLowerBound?: Temporal.ZonedDateTime,
  ): Temporal.ZonedDateTime[] {
    const calId = this.getRscaleCalendarId();
    if (!calId) return this._allFallback(iterator);
    this.assertRscaleCalendarSupported(calId);

    const dates: Temporal.ZonedDateTime[] = [];
    const work = this.createCandidateWorkBudget();
    let iterationCount = 0;
    const start = this.originalDtstart;
    const seed = this.toRscaleZdt(start).withCalendar(calId);
    const interval = this.opts.interval ?? 1;

    if (!this.addDtstartIfNeeded(dates, iterator)) {
      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }

    // Determine year range progression based on freq
    if (this.opts.freq === 'YEARLY') {
      let yearOffset = 0;
      while (true) {
        if (++iterationCount > this.maxIterations) {
          throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
        }
        const tgtYear = seed.year + yearOffset * interval;

        let occs: Temporal.ZonedDateTime[] = [];

        const monthsTokens = this.opts.byMonth as Array<number | string> | undefined;
        const months = this.monthsOfYear(calId, tgtYear);

        const dayMap = weekdayToIsoDay;
        const wkst = dayMap[(this.opts.wkst || 'MO') as keyof typeof dayMap]!;

        // BYWEEKNO handling
        if (this.opts.byWeekNo && this.opts.byWeekNo.length > 0) {
          const firstStart = this.rscaleFirstWeekStart(calId, tgtYear, wkst);
          const lastWeek = this.rscaleLastWeekCount(calId, tgtYear, wkst);
          const tokens = this.opts.byDay?.length
            ? this.opts.byDay.map((tok) => extractWeekdayToken(tok)).filter((day): day is Weekday => day !== null)
            : [Object.entries(dayMap).find(([, d]) => d === this.originalDtstart.dayOfWeek)![0]];
          for (const wn of this.opts.byWeekNo) {
            let idx = wn > 0 ? wn - 1 : lastWeek + wn;
            if (idx < 0 || idx >= lastWeek) continue;
            const weekStart = firstStart.add({weeks: idx});
            for (const tok of tokens) {
              const targetDow = dayMap[tok as keyof typeof dayMap]!;
              const pd = weekStart.add({days: (targetDow - wkst + 7) % 7});
              // BYMONTH filter if present
              if (monthsTokens && monthsTokens.length > 0) {
                if (!monthsTokens.some((t) => this.monthMatchesToken(pd.monthCode, t))) continue;
              }
              // BYYEARDAY filter if present
              if (this.opts.byYearDay && this.opts.byYearDay.length > 0) {
                const lastDay = this.endOfYear(calId, tgtYear).dayOfYear;
                const matches = this.opts.byYearDay.some((d) => {
                  const target = d > 0 ? d : lastDay + d + 1;
                  return pd.dayOfYear === target;
                });
                if (!matches) continue;
              }
              occs.push(this.buildZdtFromPlainDate(pd));
            }
          }
        } else if (this.opts.byYearDay && this.opts.byYearDay.length > 0) {
          // BYYEARDAY handling without BYWEEKNO
          const startOfYear = this.startOfYear(calId, tgtYear);
          const lastDay = this.endOfYear(calId, tgtYear).dayOfYear;
          for (const d of this.opts.byYearDay) {
            const target = d > 0 ? d : lastDay + d + 1;
            if (target < 1 || target > lastDay) continue;
            let pd = startOfYear.add({days: target - 1});
            if (monthsTokens && monthsTokens.length > 0) {
              if (!monthsTokens.some((t) => this.monthMatchesToken(pd.monthCode, t))) continue;
            }
            occs.push(this.buildZdtFromPlainDate(pd));
          }
        } else if (!monthsTokens || monthsTokens.length === 0) {
          // No BYMONTH: keep seed month/day (apply SKIP if invalid in this year)
          try {
            const pd = PolyfillTemporal.PlainDate.from({
              calendar: calId,
              year: tgtYear,
              monthCode: seed.monthCode,
              day: seed.day,
            });
            occs.push(this.buildZdtFromPlainDate(pd));
          } catch {
            const skip = this.opts.skip || 'OMIT';
            if (skip === 'FORWARD' || skip === 'BACKWARD') {
              const mapped = seed.with({year: tgtYear});
              const adjusted = skip === 'BACKWARD' ? mapped.subtract({days: 1}) : mapped;
              // adjusted lives in polyfill space; emit via the ambient binding
              occs.push(new Temporal.ZonedDateTime(adjusted.epochNanoseconds, this.tzid));
            }
          }
        } else {
          // BYMONTH provided: filter months that match tokens
          const monthStarts = months.filter((m) =>
            monthsTokens.some((tok) => this.monthMatchesToken(m.monthCode, tok)),
          );
          for (const ms of monthStarts) {
            occs.push(...this.generateMonthlyOccurrencesRscale(calId, tgtYear, ms));
          }
        }

        // Stream time components without materializing date x time.
        if (occs.length > 0) {
          const completed = this.visitDateTimeCandidates(
            occs,
            1,
            (candidate) => this.processOccurrence(candidate, dates, start, iterator, undefined, work),
            queryLowerBound ?? start,
            this.opts.until,
            work,
          );
          if (!completed) break;
        }

        yearOffset++;
        // Early break if until passed by advancing seed anchor
        if (this.opts.until && tgtYear > this.toRscaleZdt(this.opts.until).withCalendar(calId).year) break;
      }
      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }

    // WEEKLY frequency in RSCALE
    if (this.opts.freq === 'WEEKLY') {
      const dayMap = weekdayToIsoDay;
      const wkst = dayMap[(this.opts.wkst || 'MO') as keyof typeof dayMap]!;
      const tokens = this.opts.byDay?.length
        ? this.opts.byDay.map((tok) => extractWeekdayToken(tok)).filter((day): day is Weekday => day !== null)
        : [Object.entries(dayMap).find(([, d]) => d === this.originalDtstart.dayOfWeek)![0]];

      // Align to week start at or before seed (use PlainDate)
      let weekStart = seed.toPlainDate().subtract({days: (seed.dayOfWeek - wkst + 7) % 7});

      while (true) {
        if (++iterationCount > this.maxIterations) {
          throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
        }

        const occs: Temporal.ZonedDateTime[] = [];
        for (const tok of tokens) {
          const targetDow = dayMap[tok as keyof typeof dayMap]!;
          const pd = weekStart.add({days: (targetDow - wkst + 7) % 7});

          // Skip dates before DTSTART in the first week
          if (Temporal.ZonedDateTime.compare(this.buildZdtFromPlainDate(pd), this.originalDtstart) < 0) {
            continue;
          }

          // BYWEEKNO filter if present
          if (this.opts.byWeekNo && this.opts.byWeekNo.length > 0) {
            const thursday = weekStart.add({days: (4 - wkst + 7) % 7});
            const weekYear = thursday.year;
            const firstStart = this.rscaleFirstWeekStart(calId, weekYear, wkst);
            const lastWeek = this.rscaleLastWeekCount(calId, weekYear, wkst);
            const idx = Math.floor(pd.since(firstStart).days / 7) + 1;
            const match = this.opts.byWeekNo.some((wn) => (wn > 0 ? idx === wn : idx === lastWeek + wn + 1));
            if (!match) continue;
          }

          // BYYEARDAY filter if present
          if (this.opts.byYearDay && this.opts.byYearDay.length > 0) {
            const last = this.endOfYear(calId, pd.year).dayOfYear;
            const match = this.opts.byYearDay.some((d) => (d > 0 ? pd.dayOfYear === d : pd.dayOfYear === last + d + 1));
            if (!match) continue;
          }

          // BYMONTH filter if present (including leap-month tokens)
          const monthsTokens = this.opts.byMonth as Array<number | string> | undefined;
          if (monthsTokens && monthsTokens.length > 0) {
            if (!monthsTokens.some((t) => this.monthMatchesToken(pd.monthCode, t))) continue;
          }

          occs.push(this.buildZdtFromPlainDate(pd));
        }

        if (occs.length) {
          const completed = this.visitDateTimeCandidates(
            occs,
            1,
            (candidate) => this.processOccurrence(candidate, dates, start, iterator, undefined, work),
            queryLowerBound ?? start,
            this.opts.until,
            work,
          );
          if (!completed) return this.applyCountLimitAndMergeRDates(dates, iterator);
        }

        // Advance to next week
        weekStart = weekStart.add({weeks: this.opts.interval ?? 1});
        if (this.opts.until) {
          const z = this.buildZdtFromPlainDate(weekStart.add({days: 6}));
          if (Temporal.ZonedDateTime.compare(z, this.opts.until) > 0) break;
        }
      }
      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }

    // MONTHLY frequency in RSCALE
    if (this.opts.freq === 'MONTHLY') {
      let cursor = seed.toPlainDate().with({day: 1});
      while (true) {
        if (++iterationCount > this.maxIterations) {
          throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
        }
        const year = cursor.year;
        const monthStart = cursor;

        // BYMONTH filter if provided
        let proceed = true;
        const monthsTokens = this.opts.byMonth as Array<number | string> | undefined;
        if (monthsTokens && monthsTokens.length > 0) {
          proceed = monthsTokens.some((tok) => this.monthMatchesToken(monthStart.monthCode, tok));
        }
        if (proceed) {
          const occs = this.generateMonthlyOccurrencesRscale(calId, year, monthStart);
          const completed = this.visitDateTimeCandidates(
            occs,
            1,
            (candidate) => this.processOccurrence(candidate, dates, start, iterator, undefined, work),
            queryLowerBound ?? start,
            this.opts.until,
            work,
          );
          if (!completed) break;
        }

        cursor = cursor.add({months: this.opts.interval ?? 1});
        // stop if UNTIL passed (compare via ISO ZDT from RSCALE date)
        if (this.opts.until) {
          const z = this.buildZdtFromPlainDate(cursor);
          if (Temporal.ZonedDateTime.compare(z, this.opts.until) > 0) break;
        }
      }
      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }

    // DAILY frequency in RSCALE
    if (this.opts.freq === 'DAILY') {
      let pd = seed.toPlainDate();
      while (true) {
        if (++iterationCount > this.maxIterations) {
          throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
        }

        if (this.rscaleDateMatches(calId, pd)) {
          const base = this.buildZdtFromPlainDate(pd);
          const completed = this.visitPeriodCandidates(
            [base],
            (candidate) => this.processOccurrence(candidate, dates, start, iterator, undefined, work),
            queryLowerBound ?? start,
            this.opts.until,
            work,
          );
          if (!completed) break;
        }

        pd = pd.add({days: this.opts.interval ?? 1});
        if (this.opts.until) {
          const z = this.buildZdtFromPlainDate(pd);
          if (Temporal.ZonedDateTime.compare(z, this.opts.until) > 0) break;
        }
      }
      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }

    // HOURLY/MINUTELY frequency in RSCALE (filter days by BYYEARDAY/BYWEEKNO and apply interval)
    if (this.opts.freq === 'HOURLY' || this.opts.freq === 'MINUTELY') {
      const unit = this.opts.freq === 'HOURLY' ? 'hour' : 'minute';
      const unitMs = this.opts.freq === 'HOURLY' ? 3600000 : 60000;
      const interval = this.opts.interval ?? 1;
      let pd = seed.toPlainDate();
      const startInstantMs = this.originalDtstart.toInstant().epochMilliseconds;

      while (true) {
        if (++iterationCount > this.maxIterations) {
          throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
        }

        if (this.rscaleDateMatches(calId, pd)) {
          const base = this.buildZdtFromPlainDate(pd);
          const completed = this.visitDateTimeCandidates(
            [base],
            1,
            (candidate) => {
              const delta = candidate.toInstant().epochMilliseconds - startInstantMs;
              const steps = Math.floor(delta / unitMs);
              if (steps % interval !== 0) return true;
              return this.processOccurrence(candidate, dates, start, iterator, undefined, work);
            },
            queryLowerBound ?? start,
            this.opts.until,
            work,
          );
          if (!completed) break;
        }

        pd = pd.add({days: 1});
        if (this.opts.until) {
          const z = this.buildZdtFromPlainDate(pd);
          if (Temporal.ZonedDateTime.compare(z, this.opts.until) > 0) break;
        }
      }
      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }

    return this._allFallback(iterator);
  }
}

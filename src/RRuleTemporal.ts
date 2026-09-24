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

/**
 * Occurrences of a rule without COUNT, grouped by recurrence period. Without
 * COUNT an occurrence's rank from DTSTART is irrelevant, so a query can start
 * at the period around its target instead of enumerating from DTSTART.
 * Periods cover contiguous, increasing wall-clock spans.
 */
interface PeriodQueryPlan {
  /** Fixed-step rules advance in exact time: occurrence k is DTSTART + k * step. */
  readonly stepMilliseconds?: number;
  /** Upper bound on the candidates the general engine evaluates per period. */
  readonly candidatesPerPeriod: number;
  /** Recurrence period whose span contains a wall-clock (as-if-UTC) time. */
  periodOfWall(wallMilliseconds: number): number;
  /** Ascending wall-clock milliseconds of a period's occurrences, after BYSETPOS. */
  wallsForPeriod(period: number): number[] | null;
  /**
   * With BYSETPOS, the wall-clock span of a period's candidates. A skipped
   * wall time is omitted before ranking, so a gap anywhere in it can change
   * the selection.
   */
  rankedPeriodWallSpan?(period: number): [number, number] | null;
}

/** Most periods a next()/previous() plan scans before deferring to the general engine. */
const PERIOD_SCAN_LIMIT = 1_000;
/**
 * The general engine's aligned query clones can start a few periods before the
 * target (e.g. to find a DTSTART-like anchor on the 31st or February 29).
 * Plans answer only when that engine could not reach maxIterations.
 */
const PERIOD_ITERATION_SLACK = 16;

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

/** First whole millisecond at (or, when strict, after) an instant. */
function firstMillisecondFrom(epochNanoseconds: bigint, strict: boolean): number {
  return Number(
    strict
      ? floorDivBigInt(epochNanoseconds, NS_PER_MILLISECOND) + 1n
      : ceilDivBigInt(epochNanoseconds, NS_PER_MILLISECOND),
  );
}

/** Last whole millisecond at (or, when strict, before) an instant. */
function lastMillisecondThrough(epochNanoseconds: bigint, strict: boolean): number {
  return Number(
    strict
      ? ceilDivBigInt(epochNanoseconds, NS_PER_MILLISECOND) - 1n
      : floorDivBigInt(epochNanoseconds, NS_PER_MILLISECOND),
  );
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

/** Proleptic Gregorian year and month of an epoch day (inverse of gregorianEpochDay). */
function gregorianYearMonthOfEpochDay(epochDay: number): {year: number; month: number} {
  const shifted = epochDay + 719_468;
  const era = Math.floor(shifted / 146_097);
  const dayOfEra = shifted - era * 146_097;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1_460) + Math.floor(dayOfEra / 36_524) - Math.floor(dayOfEra / 146_096)) / 365,
  );
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153);
  const month = shiftedMonth + (shiftedMonth < 10 ? 3 : -9);
  return {year: yearOfEra + era * 400 + (month <= 2 ? 1 : 0), month};
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
  // Values are immutable, so the implementation's own instances (including
  // every option of a rule being cloned) need no copy.
  if (value instanceof Temporal.ZonedDateTime) return value;

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
  private originalPlainDtstart?: Temporal.PlainDateTime;
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
  private periodQueryPlanCache: PeriodQueryPlan | null | undefined;
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
      const candidate = this.resolveGeneratedTime(base.toPlainDateTime().with({hour, minute, second}));
      return candidate ? [candidate] : [];
    }

    const out: Temporal.ZonedDateTime[] = [];
    for (const h of hours) {
      for (const m of minutes) {
        for (const s of seconds) {
          const candidate = this.resolveGeneratedTime(base.toPlainDateTime().with({hour: h, minute: m, second: s}));
          if (candidate) out.push(candidate);
        }
      }
    }
    return out.sort((a, b) => Temporal.ZonedDateTime.compare(a, b));
  }

  private localDateKey(date: Temporal.PlainDate): string {
    return `${date.calendarId}:${date.year}:${date.month}:${date.day}`;
  }

  private sortedUniqueDateCandidates(candidates: Temporal.PlainDate[]): Temporal.PlainDate[] {
    const byLocalDate = new Map<string, Temporal.PlainDate>();
    for (const candidate of candidates) {
      const key = this.localDateKey(candidate);
      if (!byLocalDate.has(key)) byLocalDate.set(key, candidate);
    }
    return [...byLocalDate.values()].sort((a, b) => Temporal.PlainDate.compare(a, b));
  }

  /** Resolve generated wall time only after date expansion. RFC 5545 omits
   * nonexistent local times; compatible disambiguation is still used for
   * explicit DTSTART/RDATE inputs and the first occurrence of a repeated time.
   */
  private resolveGeneratedTime(local: Temporal.PlainDateTime): Temporal.ZonedDateTime | null {
    const start = this.originalDtstart;
    const original = (this.originalPlainDtstart ??= start.toPlainDateTime());
    if (start.timeZoneId === this.generationTimeZone && local.equals(original)) return start;
    // Derive from the existing zoned value so the polyfill can reuse its zone
    // state. Ignore its old offset: generated folds select the earlier instant.
    let anchor = start.timeZoneId === this.generationTimeZone ? start : start.withTimeZone(this.generationTimeZone);
    if (anchor.calendarId !== local.calendarId) anchor = anchor.withCalendar(local.calendarId);
    const candidate = anchor.with(
      {
        year: local.year,
        month: local.month,
        day: local.day,
        hour: local.hour,
        minute: local.minute,
        second: local.second,
        millisecond: local.millisecond,
        microsecond: local.microsecond,
        nanosecond: local.nanosecond,
      },
      {offset: 'ignore', overflow: 'reject'},
    );
    return candidate.toPlainDateTime().equals(local) ? candidate : null;
  }

  private get generationTimeZone(): string {
    return this.opts.rscale && ['CHINESE', 'HEBREW', 'INDIAN'].includes(this.opts.rscale)
      ? this.tzid
      : this.originalDtstart.timeZoneId;
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
   * On transition dates an explicit DTSTART may refer to the later fold while
   * other generated slots select the earlier fold. Resolve and sort at most
   * one day of slots so iteration and BYSETPOS follow actual instant order.
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
    base: Temporal.PlainDate,
    direction: 1 | -1,
    visit: (candidate: Temporal.ZonedDateTime) => boolean,
    notBefore?: Temporal.ZonedDateTime,
    notAfter?: Temporal.ZonedDateTime,
    work: CandidateWorkBudget = this.createCandidateWorkBudget(),
  ): boolean {
    const hours = this.opts.byHour ?? [this.originalDtstart.hour];
    const minutes = this.opts.byMinute ?? [this.originalDtstart.minute];
    const seconds = this.opts.bySecond ?? [this.originalDtstart.second];
    const nominal = base.toPlainDateTime(this.originalDtstart.toPlainTime());
    const atTime = (hour: number, minute: number, second: number) =>
      this.resolveGeneratedTime(nominal.with({hour, minute, second}));

    if (hours.length === 1 && minutes.length === 1 && seconds.length === 1) {
      // One slot cannot reorder within a transition day. Compare its actual
      // instant to the bounds (including an explicit later-fold DTSTART).
      this.recordCandidateEvaluation(work);
      const candidate = atTime(hours[0]!, minutes[0]!, seconds[0]!);
      if (
        !candidate ||
        (notBefore && Temporal.ZonedDateTime.compare(candidate, notBefore) < 0) ||
        (notAfter && Temporal.ZonedDateTime.compare(candidate, notAfter) > 0)
      )
        return true;
      return visit(candidate);
    }

    if (this.needsSortedTimeFallback(nominal.toZonedDateTime(this.generationTimeZone))) {
      const candidates: Temporal.ZonedDateTime[] = [];
      for (const hour of hours) {
        for (const minute of minutes) {
          for (const second of seconds) {
            this.recordCandidateEvaluation(work);
            const candidate = atTime(hour, minute, second);
            if (!candidate) continue;
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
          const slotTime = this.timeSlotNanoseconds(this.originalDtstart, hour, minute, second);
          if (lowerTime !== undefined && slotTime < lowerTime) continue;
          if (upperTime !== undefined && slotTime > upperTime) continue;

          this.recordCandidateEvaluation(work);
          const candidate = atTime(hour, minute, second);
          if (!candidate) continue;
          if (!visit(candidate)) return false;
        }
      }
    }
    return true;
  }

  private visitDateTimeCandidates(
    dateCandidates: Temporal.PlainDate[],
    direction: 1 | -1,
    visit: (candidate: Temporal.ZonedDateTime) => boolean,
    notBefore?: Temporal.ZonedDateTime,
    notAfter?: Temporal.ZonedDateTime,
    work: CandidateWorkBudget = this.createCandidateWorkBudget(),
  ): boolean {
    const dates = this.sortedUniqueDateCandidates(dateCandidates);
    if (!dates.length) return true;
    // Bounds must use the candidate's local clock, even when an explicit
    // TZID differs from the zone carried by a manual DTSTART.
    const sample = dates[0]!;
    const localNotBefore = notBefore?.withTimeZone(this.generationTimeZone).withCalendar(sample.calendarId);
    const localNotAfter = notAfter?.withTimeZone(this.generationTimeZone).withCalendar(sample.calendarId);
    const notBeforeDate = localNotBefore?.toPlainDate();
    const notAfterDate = localNotAfter?.toPlainDate();
    const start = direction === 1 ? 0 : dates.length - 1;
    const end = direction === 1 ? dates.length : -1;
    let previousEpoch: bigint | undefined;

    for (let index = start; index !== end; index += direction) {
      const date = dates[index]!;
      const plainDate = date;
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
    dateCandidates: Temporal.PlainDate[],
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
    sample: Temporal.PlainDate,
    visit: (candidate: Temporal.ZonedDateTime) => boolean,
    notBefore: Temporal.ZonedDateTime | undefined,
    notAfter: Temporal.ZonedDateTime | undefined,
    work: CandidateWorkBudget,
  ): boolean | null {
    const slots = this.timeSlotOffsetsMs;
    if (
      this.tzid !== 'UTC' ||
      this.originalDtstart.timeZoneId !== 'UTC' ||
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

    // An overridden hour may have resolved through a gap. Move to the next
    // allowed hour before applying smaller parts; reapplying the missing hour
    // after a minute/second rollover can otherwise move the cursor backward.
    if (byHour?.length && !byHour.includes(zdt.hour)) {
      const nextHour = byHour.find((hour) => hour > zdt.hour);
      const date = nextHour === undefined ? zdt.add({days: 1}) : zdt;
      return date.with({
        hour: nextHour ?? byHour[0],
        minute: byMinute?.[0] ?? (freq === 'HOURLY' ? this.originalDtstart.minute : 0),
        second: bySecond?.[0] ?? (freq === 'SECONDLY' ? 0 : this.originalDtstart.second),
      });
    }

    // Special case: HOURLY frequency with a single BYHOUR token would
    // otherwise keep returning the same time (e.g. always 12:00).  When
    // BYDAY filters are also present this results in an infinite loop.
    if (freq === 'HOURLY' && byHour && byHour.length === 1) {
      return this.applyTimeOverride(zdt.add({days: interval}));
    }

    // MINUTELY frequency with a single BYMINUTE value would also repeat
    // the same time. Move forward a full hour before reapplying overrides.
    if (freq === 'MINUTELY' && byMinute && byMinute.length === 1) {
      const next = zdt.add({hours: interval});
      if (byHour?.length && !byHour.includes(next.hour)) return this.nextCandidateSameDate(next);
      return next.with({minute: byMinute[0], second: bySecond?.[0] ?? next.second});
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
      // A gap can resolve a requested hour to one absent from BYHOUR.
      // Continue with the next slot instead of wrapping the cursor backward.
      const nextHour = byHour.find((hour) => hour > zdt.hour);
      if (nextHour !== undefined) {
        // next hour on the same day
        return zdt.with({
          hour: nextHour,
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
        if (this.opts.freq === 'DAILY' && weekdayTokens.length === this.opts.byDay.length) {
          // BYDAY filters the DTSTART/INTERVAL cadence; it must not establish a
          // new cadence at the next weekday, including on an aligned query clone.
          const firstStep = this.findFirstMatchingDailyStep(
            zdt.dayOfWeek,
            this.opts.interval!,
            weekdayTokens.map((token) => dayMap[token]!),
          );
          deltas = firstStep === null ? [] : [firstStep * this.opts.interval!];
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
  private matchesByDay(zdt: Temporal.ZonedDateTime | Temporal.PlainDate): boolean {
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

  private matchesByMonth(zdt: Temporal.ZonedDateTime | Temporal.PlainDate): boolean {
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

  private matchesByMonthDay(zdt: Temporal.ZonedDateTime | Temporal.PlainDate): boolean {
    const {byMonthDay} = this.opts;
    if (!byMonthDay) return true;
    const lastDay = zdt.with({day: 1}).add({months: 1}).subtract({days: 1}).day;
    return this.matchesNumericConstraint(zdt.day, byMonthDay, lastDay);
  }

  private matchesByHour(zdt: Temporal.ZonedDateTime): boolean {
    return !this.opts.byHour || this.opts.byHour.includes(zdt.hour);
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

  private matchesByYearDay(zdt: Temporal.ZonedDateTime | Temporal.PlainDate): boolean {
    const {byYearDay} = this.opts;
    if (!byYearDay) return true;
    const dayOfYear = zdt.dayOfYear;
    const last = this.lastByYearDay(zdt);
    return this.matchesNumericConstraint(dayOfYear, byYearDay, last);
  }

  /**
   * The day of the year that negative BYYEARDAY values count back from: the
   * end of month 12. Calendars with a 13th month end later, so code that
   * seeks year days must use this rather than daysInYear to agree with
   * matchesByYearDay.
   */
  private lastByYearDay(zdt: Temporal.ZonedDateTime | Temporal.PlainDate): number {
    return zdt.with({month: 12, day: 31}).dayOfYear;
  }

  private getIsoWeekInfo(input: Temporal.ZonedDateTime | Temporal.PlainDate): {week: number; year: number} {
    const zdt = 'toPlainDate' in input ? input.toPlainDate() : input;
    // Using ISO 8601 week date system. Week starts on Monday.
    // The week year is the year of the Thursday of that week.
    const thursday = zdt.add({days: 4 - zdt.dayOfWeek});
    const year = thursday.year;

    // The first Thursday of the ISO week year.
    const jan1 = zdt.with({year, month: 1, day: 1});
    const firstThursday = jan1.add({days: (4 - jan1.dayOfWeek + 7) % 7});

    const diffDays = thursday.since(firstThursday).days;
    const week = Math.floor(diffDays / 7) + 1;
    return {week, year};
  }

  private matchesByWeekNo(zdt: Temporal.ZonedDateTime | Temporal.PlainDate): boolean {
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
    // RDATE and EXDATE are applied to the COUNT-bounded result in allInternal(),
    // as for every other non-streaming generator.
    if (iterator || !this.canUseUtcCalendarFastPaths() || this.opts.rscale) {
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
      this.canUseUtcCalendarFastPaths() &&
      this.opts.freq === 'WEEKLY' &&
      !this.opts.rscale &&
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
      this.canUseUtcCalendarFastPaths() &&
      this.opts.freq === 'MONTHLY' &&
      !this.opts.rscale &&
      !this.opts.byYearDay &&
      !this.opts.byWeekNo &&
      this.canUseEpochMillisecondsPrecisionFlag &&
      this.hasSingleExpandedTimeSlot() &&
      !!(this.opts.byDay || this.opts.byMonthDay)
    );
  }

  private utcZdtFromEpochNanoseconds(epochNanoseconds: bigint): Temporal.ZonedDateTime {
    return new Temporal.ZonedDateTime(epochNanoseconds, 'UTC', this.originalDtstart.calendarId);
  }

  private utcZdtFromEpochMilliseconds(epochMilliseconds: number): Temporal.ZonedDateTime {
    return this.utcZdtFromEpochNanoseconds(BigInt(epochMilliseconds) * NS_PER_MILLISECOND);
  }

  private canUseUtcCalendarFastPaths(): boolean {
    return (
      this.maxCandidateEvaluations === 1_000_000 &&
      this.tzid === 'UTC' &&
      this.originalDtstart.timeZoneId === this.tzid &&
      ['iso8601', 'gregory'].includes(this.originalDtstart.calendarId)
    );
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

    const firstStep = this.simpleByDayIsoDays?.length
      ? this.findFirstMatchingDailyStep(startDayOfWeek, interval, this.simpleByDayIsoDays)
      : 0;
    if (firstStep === null) return null;
    const firstDayOffset = firstStep * interval;
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
        if (!hasDateExpansion) {
          days = this.originalDtstart.day <= this.daysInGregorianMonth(year, month) ? [this.originalDtstart.day] : [];
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

    // Keep uncommon multi-slot implicit-date shapes on the general engine.
    if (simpleAnnual && timeSlotOffsets.length !== 1) return null;
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
      this.maxCandidateEvaluations !== 1_000_000 ||
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
      // An explicit DTSTART may name the later side of a fold; wall-clock
      // rank/select resolves ambiguities to the earlier instant.
      if (
        this.numericQueryPlanCache &&
        this.tzid !== 'UTC' &&
        this.resolveNumericWallMilliseconds(this.wallMsOf(this.originalDtstart)) !==
          this.originalDtstart.epochMilliseconds
      ) {
        this.numericQueryPlanCache = null;
      }
    } catch {
      // The optimized path is deliberately conservative. Unsupported Intl
      // ranges or numeric edge cases fall back to the existing engine.
      this.numericQueryPlanCache = null;
    }
    return this.numericQueryPlanCache;
  }

  /**
   * Build the period plan for a rule without COUNT. Eligibility mirrors the
   * COUNT plans above, and periods reuse their calendar generators.
   */
  private buildPeriodQueryPlan(): PeriodQueryPlan | null {
    const interval = this.opts.interval!;
    if (
      this.opts.count !== undefined ||
      !Number.isSafeInteger(interval) ||
      interval <= 0 ||
      !Number.isSafeInteger(this.maxIterations) ||
      this.maxIterations <= 2 * PERIOD_ITERATION_SLACK ||
      this.maxCandidateEvaluations !== 1_000_000 ||
      this.includeDtstart ||
      this.opts.rscale !== undefined ||
      !this.canUseEpochMillisecondsPrecisionFlag ||
      this.originalDtstart.timeZoneId !== this.tzid ||
      !['iso8601', 'gregory'].includes(this.originalDtstart.calendarId)
    ) {
      return null;
    }

    const {freq, byDay, byMonth, byMonthDay, byYearDay, byWeekNo, bySetPos} = this.opts;
    const hasCalendarFilters = Boolean(byMonth || byMonthDay || byYearDay || byWeekNo || bySetPos);
    const hasTimeFilters = Boolean(this.opts.byHour || this.opts.byMinute || this.opts.bySecond);
    const startWallMilliseconds =
      this.tzid === 'UTC' ? this.originalDtstart.epochMilliseconds : this.wallMsOf(this.originalDtstart);
    const startEpochDay = Math.floor(startWallMilliseconds / MS_PER_DAY);
    const slots = this.timeSlotOffsetsMs;

    switch (freq) {
      case 'HOURLY':
      case 'MINUTELY':
      case 'SECONDLY': {
        if (hasCalendarFilters || byDay || hasTimeFilters) return null;
        // rawAdvance() skips a repeated named-zone hour for this one shape.
        const isNamedZone =
          !['UTC', 'Etc/UTC', 'Etc/GMT'].includes(this.tzid) && !/^[-+]\d{2}:?\d{2}(?::?\d{2})?$/.test(this.tzid);
        if (isNamedZone && freq === 'HOURLY' && interval === 1) return null;
        const unit = freq === 'HOURLY' ? MS_PER_HOUR : freq === 'MINUTELY' ? MS_PER_MINUTE : MS_PER_SECOND;
        const stepMilliseconds = unit * interval;
        if (!Number.isSafeInteger(stepMilliseconds)) return null;
        return {stepMilliseconds, candidatesPerPeriod: 1, periodOfWall: () => 0, wallsForPeriod: () => null};
      }
      case 'DAILY': {
        if (hasCalendarFilters || this.hasOrdinalByDay || !slots?.length || !this.hasUniqueTimeSlotOffsets) return null;
        const allowedDays = this.simpleByDayIsoDays;
        if (
          allowedDays?.length &&
          this.findFirstMatchingDailyStep(isoDayOfWeekOfEpochDay(startEpochDay), interval, allowedDays) === null
        ) {
          return null;
        }
        const allowedDayMask = weekdayMask(allowedDays);
        return {
          candidatesPerPeriod: slots.length,
          periodOfWall: (wall) => Math.floor((Math.floor(wall / MS_PER_DAY) - startEpochDay) / interval),
          wallsForPeriod: (period) => {
            const epochDay = startEpochDay + period * interval;
            if (!Number.isSafeInteger(epochDay)) return null;
            if (!includesIsoWeekday(allowedDayMask, isoDayOfWeekOfEpochDay(epochDay))) return [];
            return slots.map((slot) => epochDay * MS_PER_DAY + slot);
          },
        };
      }
      case 'WEEKLY': {
        if (hasCalendarFilters || this.hasOrdinalByDay || !slots?.length || !this.hasUniqueTimeSlotOffsets) return null;
        const startDayOfWeek = isoDayOfWeekOfEpochDay(startEpochDay);
        const wkstDay = weekdayToIsoDay[extractWeekdayToken(this.opts.wkst || 'MO') ?? 'MO'] ?? 1;
        const targetDays = byDay ? [...(this.allByDayIsoDays ?? [])] : [startDayOfWeek];
        const dayOffsets = targetDays.map((day) => (day - wkstDay + 7) % 7).sort((a, b) => a - b);
        if (dayOffsets.length === 0) return null;
        const weekOffsets = dayOffsets.flatMap((dayOffset) => slots.map((slot) => dayOffset * MS_PER_DAY + slot));
        const firstWeekStartDay = startEpochDay - ((startDayOfWeek - wkstDay + 7) % 7);
        const periodDays = 7 * interval;
        return {
          candidatesPerPeriod: weekOffsets.length,
          periodOfWall: (wall) => Math.floor((Math.floor(wall / MS_PER_DAY) - firstWeekStartDay) / periodDays),
          wallsForPeriod: (period) => {
            const weekStartDay = firstWeekStartDay + period * periodDays;
            if (!Number.isSafeInteger(weekStartDay)) return null;
            return weekOffsets.map((offset) => weekStartDay * MS_PER_DAY + offset);
          },
        };
      }
      case 'MONTHLY': {
        if (byYearDay || byWeekNo || !slots?.length || !this.hasUniqueTimeSlotOffsets) return null;
        if (byMonth?.some((value) => typeof value !== 'number')) return null;
        const startMonthIndex = this.originalDtstart.year * 12 + (this.originalDtstart.month - 1);
        const monthOf = (period: number): {year: number; month: number} | null => {
          const monthIndex = startMonthIndex + period * interval;
          if (!Number.isSafeInteger(monthIndex)) return null;
          const yearMonth = this.monthIndexToYearMonth(monthIndex);
          const monthStartMs = gregorianEpochDay(yearMonth.year, yearMonth.month, 1) * MS_PER_DAY;
          return isSafeTemporalEpochMilliseconds(monthStartMs) ? yearMonth : null;
        };
        return {
          candidatesPerPeriod: 2 * 31 * slots.length,
          periodOfWall: (wall) => {
            const {year, month} = gregorianYearMonthOfEpochDay(Math.floor(wall / MS_PER_DAY));
            return Math.floor((year * 12 + month - 1 - startMonthIndex) / interval);
          },
          wallsForPeriod: (period) => {
            const yearMonth = monthOf(period);
            return yearMonth && this.generateMonthlyOccurrenceEpochsUtc(yearMonth.year, yearMonth.month);
          },
          rankedPeriodWallSpan: bySetPos
            ? (period) => {
                const yearMonth = monthOf(period);
                if (!yearMonth) return null;
                const monthStartMs = gregorianEpochDay(yearMonth.year, yearMonth.month, 1) * MS_PER_DAY;
                const days = this.daysInGregorianMonth(yearMonth.year, yearMonth.month);
                return [monthStartMs, monthStartMs + days * MS_PER_DAY];
              }
            : undefined,
        };
      }
      case 'YEARLY': {
        if (byYearDay || byWeekNo || !slots?.length || !this.hasUniqueTimeSlotOffsets) return null;
        if (byMonth?.some((value) => typeof value !== 'number')) return null;
        // Keep the multi-slot implicit-date shapes the COUNT plan also leaves
        // to the general engine, and its ordinal-weekday restrictions.
        const hasDateExpansion = Boolean(byDay || byMonthDay);
        if (!hasDateExpansion && (slots.length !== 1 || (byMonth && bySetPos))) return null;
        if (
          this.hasOrdinalByDay &&
          !this.numericByMonths?.length &&
          (byMonthDay || this.parsedByDayTokens?.some((token) => token.ord === 0 || Math.abs(token.ord) > 52))
        ) {
          return null;
        }
        const startYear = this.originalDtstart.year;
        const yearOf = (period: number): number | null => {
          const year = startYear + period * interval;
          return Number.isSafeInteger(year) && year > -271_821 && year < 275_760 ? year : null;
        };
        return {
          candidatesPerPeriod: 2 * 366 * slots.length,
          periodOfWall: (wall) =>
            Math.floor((gregorianYearMonthOfEpochDay(Math.floor(wall / MS_PER_DAY)).year - startYear) / interval),
          wallsForPeriod: (period) => {
            const year = yearOf(period);
            return year === null ? null : this.generateYearlyOccurrenceEpochsUtc(year);
          },
          rankedPeriodWallSpan: bySetPos
            ? (period) => {
                const year = yearOf(period);
                if (year === null) return null;
                return [gregorianEpochDay(year, 1, 1) * MS_PER_DAY, gregorianEpochDay(year + 1, 1, 1) * MS_PER_DAY];
              }
            : undefined,
        };
      }
    }
    return null;
  }

  private getPeriodQueryPlan(): PeriodQueryPlan | null {
    if (this.periodQueryPlanCache !== undefined) {
      return this.periodQueryPlanCache;
    }
    try {
      this.periodQueryPlanCache = this.buildPeriodQueryPlan();
      // An explicit DTSTART may name the later side of a fold; generated wall
      // times resolve ambiguities to the earlier instant.
      if (
        this.periodQueryPlanCache &&
        this.tzid !== 'UTC' &&
        this.resolveNumericWallMilliseconds(this.wallMsOf(this.originalDtstart)) !==
          this.originalDtstart.epochMilliseconds
      ) {
        this.periodQueryPlanCache = null;
      }
    } catch {
      this.periodQueryPlanCache = null;
    }
    return this.periodQueryPlanCache;
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
      const firstMatchingStep = this.findFirstMatchingDailyStep(dayOfWeek, stepDays, allowedDays);
      if (firstMatchingStep === null) {
        return dates;
      }
      const firstMatchingDayOffset = firstMatchingStep * stepDays;
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

  private generateMonthlyOccurrenceDays(sample: Temporal.PlainDate): number[] {
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
      // Positive and negative positions can select the same candidate; like
      // the general engine, emit it once.
      if (timeSlotOffsets.length === 1) {
        const selectedDays = this.applyBySetPosToSortedList(days).sort((a, b) => a - b);
        const offset = timeSlotOffsets[0]!;
        return selectedDays
          .filter((day, index) => index === 0 || day !== selectedDays[index - 1])
          .map((day) => monthStartMs + (day - 1) * MS_PER_DAY + offset);
      }

      const timestamps: number[] = [];
      for (const day of days) {
        const dayBase = monthStartMs + (day - 1) * MS_PER_DAY;
        for (const offset of timeSlotOffsets) {
          timestamps.push(dayBase + offset);
        }
      }
      const selected = this.applyBySetPosToSortedList(timestamps).sort((a, b) => a - b);
      return selected.filter((wall, index) => index === 0 || wall !== selected[index - 1]);
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

    const localUntil = this.opts.until?.withTimeZone(this.tzid).withCalendar('iso8601');
    const lastMonthIndex = localUntil ? localUntil.year * 12 + localUntil.month - 1 : undefined;
    let monthIndex = this.originalDtstart.year * 12 + (this.originalDtstart.month - 1);
    while (true) {
      if (lastMonthIndex !== undefined && monthIndex > lastMonthIndex) return dates;
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
    // Native Temporal constructs cheaply from epoch nanoseconds, as does the
    // polyfill in UTC. For other zones on the polyfill, deriving from an
    // anchored instance via add() skips repeated time-zone slot setup.
    if (isNativeTemporal || this.tzid === 'UTC') {
      return new Temporal.ZonedDateTime(
        BigInt(epochMs) * NS_PER_MILLISECOND,
        this.tzid,
        this.originalDtstart.calendarId,
      );
    }
    let anchor = this.emitAnchorZdt;
    if (!anchor) {
      anchor = this.emitAnchorZdt = new Temporal.ZonedDateTime(
        BigInt(epochMs) * NS_PER_MILLISECOND,
        this.tzid,
        this.originalDtstart.calendarId,
      );
      return anchor;
    }
    return anchor.add({milliseconds: epochMs - anchor.epochMilliseconds});
  }

  /** Local wall-clock ms (as-if-UTC) of a ZonedDateTime with ms precision. */
  private wallMsOf(zdt: Temporal.ZonedDateTime): number {
    return zdt.epochMilliseconds + zdt.offsetNanoseconds / 1_000_000;
  }

  private canUseTzEpochFastPaths(iterator?: InternalRRuleTemporalIterator): boolean {
    if (
      iterator ||
      this.maxCandidateEvaluations !== 1_000_000 ||
      this.tzid === 'UTC' ||
      this.originalDtstart.timeZoneId !== this.tzid ||
      this.opts.freq === 'YEARLY' ||
      this.opts.rscale ||
      !['iso8601', 'gregory'].includes(this.originalDtstart.calendarId)
    ) {
      return false;
    }
    if (!this.canUseEpochMillisecondsPrecisionFlag) {
      return false;
    }
    if (
      this.resolveNumericWallMilliseconds(this.wallMsOf(this.originalDtstart)) !==
      this.originalDtstart.epochMilliseconds
    ) {
      return false;
    }
    return true;
  }

  /**
   * True if the rule's nominal time of day can be skipped by a DST gap
   * anywhere in the (estimated) iteration range. Conservatively keep these
   * rules on the general engine, which omits invalid slots before BYSETPOS and COUNT.
   */
  private tzFastPathGapHazard(timeOfDayMs: number): boolean {
    const startMs = this.originalDtstart.epochMilliseconds;
    let endMs: number;
    if (this.opts.until) {
      endMs = this.opts.until.epochMilliseconds;
    } else if (this.opts.count !== undefined) {
      const spanMs = this.tzFastPathCountSpanMs(this.opts.count);
      if (spanMs === undefined) return true;
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

  /**
   * An upper bound on the wall-clock span from DTSTART to the last of the
   * first `count` occurrences the DAILY and WEEKLY TZ fast paths emit, or
   * undefined when none is known. Each allows a period of candidates before DTSTART.
   */
  private tzFastPathCountSpanMs(count: number): number | undefined {
    const interval = this.opts.interval!;
    const slots = this.timeSlotOffsetsMs?.length ?? 1;
    const startWallMs = this.wallMsOf(this.originalDtstart);
    switch (this.opts.freq) {
      case 'DAILY': {
        // Weekday phases repeat every 7 / gcd(INTERVAL, 7) periods.
        const allowedDays = this.simpleByDayIsoDays;
        const cyclePeriods = allowedDays?.length ? 7 / gcd(interval, 7) : 1;
        let matchingPeriods = cyclePeriods;
        if (allowedDays?.length) {
          const startDayOfWeek = isoDayOfWeekOfEpochDay(Math.floor(startWallMs / MS_PER_DAY));
          matchingPeriods = 0;
          for (let period = 0; period < cyclePeriods; period++) {
            if (allowedDays.includes(addIsoDays(startDayOfWeek, period * interval))) matchingPeriods++;
          }
          if (matchingPeriods === 0) return 0;
        }
        return (Math.ceil(count / (matchingPeriods * slots)) + 1) * cyclePeriods * interval * MS_PER_DAY;
      }
      case 'WEEKLY': {
        const days = this.opts.byDay ? (this.allByDayIsoDays?.length ?? 0) : 1;
        if (days === 0) return 0;
        return (Math.ceil(count / (days * slots)) + 1) * interval * MS_PER_WEEK;
      }
    }
    return undefined;
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
      const firstMatchingStep = this.findFirstMatchingDailyStep(dayOfWeek, stepDays, allowedDays);
      if (firstMatchingStep === null) {
        return dates;
      }
      const firstMatchingDayOffset = firstMatchingStep * stepDays;
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
    // A skipped wall time is omitted before BYSETPOS ranks a month's
    // candidates, so even an unselected one changes the selection: defer any
    // month in which a DST gap can skip the (single) time slot. Without
    // BYSETPOS, the emitted walls checked below are the only ones that matter.
    const rankedSlotTimeOfDayMs = this.opts.bySetPos ? this.timeSlotOffsetsMs![0]! : undefined;

    const localUntil = this.opts.until?.withTimeZone(this.tzid).withCalendar('iso8601');
    const lastMonthIndex = localUntil ? localUntil.year * 12 + localUntil.month - 1 : undefined;
    let monthIndex = this.originalDtstart.year * 12 + (this.originalDtstart.month - 1);
    let iterationCount = 0;
    while (true) {
      if (lastMonthIndex !== undefined && monthIndex > lastMonthIndex) return dates;
      if (++iterationCount > this.maxIterations) {
        throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
      }

      const {year, month} = this.monthIndexToYearMonth(monthIndex);
      if (rankedSlotTimeOfDayMs !== undefined) {
        const monthStartWallMs = gregorianEpochDay(year, month, 1) * MS_PER_DAY;
        const monthEndWallMs = monthStartWallMs + this.daysInGregorianMonth(year, month) * MS_PER_DAY;
        if (
          resolver.timeOfDayMayHitGap(rankedSlotTimeOfDayMs, monthStartWallMs - MS_PER_DAY, monthEndWallMs + MS_PER_DAY)
        ) {
          return null;
        }
      }
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

    let monthCursor = start.toPlainDate().with({day: 1});

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
        const localUntil = this.opts.until.withTimeZone(start.timeZoneId).withCalendar(start.calendarId);
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
    let weekCursor = start.toPlainDate().subtract({days: startWeekOffset});

    while (true) {
      // Generate this week’s occurrences
      if (++iterationCount > this.maxIterations) {
        throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
      }

      const dateCandidates = dows
        .map((dw) => {
          const delta = (dw - wkstDay + 7) % 7;
          return weekCursor.add({days: delta});
        })
        .filter((date) => this.matchesByMonth(date) && this.matchesByMonthDay(date));
      const completed = this.visitPeriodCandidates(
        dateCandidates,
        (candidate) => this.processOccurrence(candidate, dates, start, iterator, undefined, work),
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
        const localUntil = this.opts.until.withTimeZone(start.timeZoneId).withCalendar(start.calendarId);
        if (Temporal.PlainDate.compare(weekCursor, localUntil.toPlainDate()) > 0) {
          break;
        }
      }
    }

    return this.applyCountLimitAndMergeRDates(dates, iterator);
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

    let yearCursor = start.toPlainDate().with({month: 1, day: 1});
    const lastGenerationYear = this.opts.until
      ? this.opts.until.withTimeZone(start.timeZoneId).withCalendar(start.calendarId).year +
        (this.opts.byWeekNo ? 1 : 0)
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
    // Week 1 can start in December of the preceding calendar year. A query
    // cap in that December still needs candidates from the next week-year.
    const lastGenerationYear = this.opts.until
      ? this.opts.until.withTimeZone(start.timeZoneId).withCalendar(start.calendarId).year + 1
      : undefined;
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

        // Numeric BYWEEKNO order is not date order: -1 follows 1 in time.
        // Sort the combined date set before streaming or applying COUNT.
        const dateCandidates = weekNos.flatMap((weekNo) => this.generateDateCandidatesForWeekInYear(year, weekNo));
        const completed = this.visitDateTimeCandidates(
          dateCandidates,
          1,
          (candidate) => this.processOccurrence(candidate, dates, start, iterator, undefined, work),
          queryLowerBound ?? start,
          this.opts.until,
          work,
        );
        if (!completed) break outer_loop;
      }

      // Advance by the specified monthly interval
      monthsAdvanced += interval;
      current = start.add({months: monthsAdvanced});

      if (lastGenerationYear !== undefined && current.year > lastGenerationYear) break;
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

      const yearStart = start.toPlainDate().with({year, month: 1, day: 1});
      const lastDayOfYear = yearStart.with({month: 12, day: 31}).dayOfYear;

      const dateCandidates: Temporal.PlainDate[] = [];
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
   * HOURLY, MINUTELY, and SECONDLY rules with BYxxx parts (RFC 5545 3.3.10).
   * Periods begin at DTSTART + k * INTERVAL units in exact time, the set the
   * rule has without BYxxx parts (HOURLY;INTERVAL=1 visits a repeated wall hour
   * once, as rawAdvance() does). Parts at or above the frequency's own unit
   * limit which periods occur; BYMINUTE/BYSECOND below it expand a period, and
   * BYSETPOS selects within each period. A period outside the limits jumps to
   * the first period of the next window that can satisfy them.
   */
  private _allSubDailyPeriods(iterator?: InternalRRuleTemporalIterator): Temporal.ZonedDateTime[] {
    const dates: Temporal.ZonedDateTime[] = [];
    const work = this.createCandidateWorkBudget();
    const start = this.originalDtstart;
    if (!this.addDtstartIfNeeded(dates, iterator)) return this.applyCountLimitAndMergeRDates(dates, iterator);

    const {freq, byHour, byMinute, bySecond, bySetPos} = this.opts;
    const zone = start.timeZoneId;
    const calendar = start.calendarId;
    const resolver = getZoneOffsetResolver(zone);
    const unitNanoseconds = freq === 'HOURLY' ? NS_PER_HOUR : freq === 'MINUTELY' ? NS_PER_MINUTE : NS_PER_SECOND;
    const stepNanoseconds = unitNanoseconds * BigInt(this.opts.interval!);
    const startNanoseconds = start.epochNanoseconds;
    const untilNanoseconds = this.opts.until?.epochNanoseconds;
    const skipRepeatedHour = freq === 'HOURLY' && this.opts.interval === 1;
    const limitMinutes = freq === 'HOURLY' ? undefined : byMinute;
    const limitSeconds = freq === 'SECONDLY' ? bySecond : undefined;
    const expandMinutes = freq === 'HOURLY' ? byMinute : undefined;
    const expandSeconds = freq === 'SECONDLY' ? undefined : bySecond;
    // Whole-unit steps keep DTSTART's fraction of a second in every period.
    const subsecondNanoseconds = BigInt(start.millisecond * 1_000_000 + start.microsecond * 1_000 + start.nanosecond);

    const milliseconds = (epochNanoseconds: bigint) => Number(floorDivBigInt(epochNanoseconds, NS_PER_MILLISECOND));
    /** The first offset transition in (from, to], in nanoseconds. */
    const transitionBetween = (from: bigint, to: bigint): bigint | undefined => {
      const transition = resolver.nextTransitionAfter(
        milliseconds(from),
        Number(ceilDivBigInt(to, NS_PER_MILLISECOND)),
      );
      if (transition === undefined) return undefined;
      const nanoseconds = BigInt(transition) * NS_PER_MILLISECOND;
      return nanoseconds > from && nanoseconds <= to ? nanoseconds : undefined;
    };
    // Occurrences are the only values that need Temporal objects.
    let anchor: Temporal.ZonedDateTime | undefined;
    const zoned = (epochNanoseconds: bigint): Temporal.ZonedDateTime => {
      if (isNativeTemporal || zone === 'UTC') return new Temporal.ZonedDateTime(epochNanoseconds, zone, calendar);
      anchor ??= new Temporal.ZonedDateTime(epochNanoseconds, zone, calendar);
      const delta = epochNanoseconds - anchor.epochNanoseconds;
      const deltaMilliseconds = floorDivBigInt(delta, NS_PER_MILLISECOND);
      return anchor.add({
        milliseconds: Number(deltaMilliseconds),
        nanoseconds: Number(delta - deltaMilliseconds * NS_PER_MILLISECOND),
      });
    };
    // The first instant of a date; no earlier instant falls on it.
    const dateStart = (date: Temporal.PlainDate): bigint => date.toZonedDateTime(zone).epochNanoseconds;
    // A later hour, minute, or second of the same day, measured in exact time
    // from the period so a repeated hour is not skipped. Stop at any offset
    // transition first; wall fields are read again after it.
    const withinDay = (from: bigint, deltaNanoseconds: bigint): bigint =>
      transitionBetween(from, from + deltaNanoseconds - 1n) ?? from + deltaNanoseconds;

    let cachedEpochDay: number | undefined;
    let cachedDate: Temporal.PlainDate | undefined;
    let cachedDateMatches = false;
    let index = 0n;
    let iterationCount = 0;
    while (true) {
      if (++iterationCount > this.maxIterations) {
        throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
      }
      const periodNanoseconds = startNanoseconds + index * stepNanoseconds;
      // Expansions stay within the period's hour or minute, so a period that
      // begins two units past UNTIL cannot contain an occurrence.
      if (untilNanoseconds !== undefined && periodNanoseconds - 2n * unitNanoseconds > untilNanoseconds) break;
      const epochMilliseconds = milliseconds(periodNanoseconds);
      const wallMilliseconds = epochMilliseconds + resolver.offsetMsAt(epochMilliseconds);
      const epochDay = Math.floor(wallMilliseconds / MS_PER_DAY);
      const millisecondOfDay = wallMilliseconds - epochDay * MS_PER_DAY;
      const hour = Math.floor(millisecondOfDay / MS_PER_HOUR);
      const minute = Math.floor(millisecondOfDay / MS_PER_MINUTE) % 60;
      const second = Math.floor(millisecondOfDay / MS_PER_SECOND) % 60;
      // HOURLY;INTERVAL=1 visits the second instance of a repeated hour as
      // rawAdvance() does: not at all.
      if (skipRepeatedHour && index > 0n) {
        const previousHourNanoseconds = periodNanoseconds - NS_PER_HOUR;
        if (transitionBetween(previousHourNanoseconds, periodNanoseconds) !== undefined) {
          const previousMilliseconds = milliseconds(previousHourNanoseconds);
          const previousWall = previousMilliseconds + resolver.offsetMsAt(previousMilliseconds);
          if (Math.floor(previousWall / MS_PER_HOUR) === Math.floor(wallMilliseconds / MS_PER_HOUR)) {
            index += 1n;
            continue;
          }
        }
      }
      if (epochDay !== cachedEpochDay) {
        const {year, month} = gregorianYearMonthOfEpochDay(epochDay);
        cachedEpochDay = epochDay;
        cachedDate = new Temporal.PlainDate(year, month, epochDay - gregorianEpochDay(year, month, 1) + 1, calendar);
        cachedDateMatches = this.matchesSubDailyDate(cachedDate);
      }

      // The earliest instant at which a failed limit can next be satisfied.
      let windowStart: bigint | undefined;
      if (!cachedDateMatches) {
        windowStart = dateStart(this.nextSubDailyDateCandidate(cachedDate!));
      } else if (byHour && !byHour.includes(hour)) {
        const nextHour = byHour.find((value) => value > hour) ?? 24;
        const elapsed = BigInt((minute * 60 + second) * 1_000) * NS_PER_MILLISECOND + subsecondNanoseconds;
        windowStart = withinDay(periodNanoseconds, BigInt(nextHour - hour) * NS_PER_HOUR - elapsed);
      } else if (limitMinutes && !limitMinutes.includes(minute)) {
        const nextMinute = limitMinutes.find((value) => value > minute) ?? 60;
        const elapsed = BigInt(second * 1_000) * NS_PER_MILLISECOND + subsecondNanoseconds;
        windowStart = withinDay(periodNanoseconds, BigInt(nextMinute - minute) * NS_PER_MINUTE - elapsed);
      } else if (limitSeconds && !limitSeconds.includes(second)) {
        const nextSecond = limitSeconds.find((value) => value > second) ?? 60;
        windowStart = withinDay(periodNanoseconds, BigInt(nextSecond - second) * NS_PER_SECOND - subsecondNanoseconds);
      }
      if (windowStart !== undefined) {
        if (untilNanoseconds !== undefined && windowStart > untilNanoseconds) break;
        // Continue from the first period at or after that window.
        const offset = windowStart - startNanoseconds;
        const next = offset <= 0n ? 0n : ceilDivBigInt(offset, stepNanoseconds);
        index = next > index ? next : index + 1n;
        continue;
      }

      const candidates: bigint[] = [];
      let period: Temporal.ZonedDateTime | undefined;
      for (const candidateMinute of expandMinutes ?? [minute]) {
        for (const candidateSecond of expandSeconds ?? [second]) {
          this.recordCandidateEvaluation(work);
          const delta = BigInt((candidateMinute - minute) * 60 + (candidateSecond - second)) * NS_PER_SECOND;
          const candidateNanoseconds = periodNanoseconds + delta;
          const earlier = delta < 0n ? candidateNanoseconds : periodNanoseconds;
          const later = delta < 0n ? periodNanoseconds : candidateNanoseconds;
          if (delta === 0n || transitionBetween(earlier, later) === undefined) {
            candidates.push(candidateNanoseconds);
            continue;
          }
          // Across a transition, keep the period's offset in a repeated hour and
          // omit times a gap skips.
          period ??= zoned(periodNanoseconds);
          const candidate = period.with({minute: candidateMinute, second: candidateSecond});
          if (candidate.hour === hour && candidate.minute === candidateMinute && candidate.second === candidateSecond) {
            candidates.push(candidate.epochNanoseconds);
          }
        }
      }
      candidates.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
      const selected = bySetPos?.length
        ? this.applyBySetPosToSortedList(candidates).sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
        : candidates;
      for (let position = 0; position < selected.length; position++) {
        const candidate = selected[position]!;
        if (candidate < startNanoseconds || (position > 0 && candidate === selected[position - 1])) continue;
        if (!this.processOccurrence(zoned(candidate), dates, start, iterator, undefined, work)) {
          return this.applyCountLimitAndMergeRDates(dates, iterator);
        }
      }
      index += 1n;
    }
    return this.applyCountLimitAndMergeRDates(dates, iterator);
  }

  private matchesSubDailyDate(date: Temporal.PlainDate): boolean {
    return (
      this.matchesByMonth(date) &&
      this.matchesByWeekNo(date) &&
      this.matchesByYearDay(date) &&
      this.matchesByMonthDay(date) &&
      this.matchesByDay(date)
    );
  }

  /** A later date that may satisfy the date-level parts; none before it can. */
  private nextSubDailyDateCandidate(date: Temporal.PlainDate): Temporal.PlainDate {
    const months = this.numericByMonths;
    if (months?.length && !months.includes(date.month)) {
      const sorted = [...months].sort((left, right) => left - right);
      const month = sorted.find((value) => value > date.month);
      return month === undefined
        ? date.with({month: 1, day: 1}).add({years: 1}).with({month: sorted[0]!})
        : date.with({month, day: 1});
    }
    if (!this.matchesByWeekNo(date)) {
      // ISO weeks start on Monday and match or fail as a whole.
      return date.add({days: 8 - date.dayOfWeek});
    }
    if (!this.matchesByYearDay(date)) {
      const daysInYear = date.daysInYear;
      const last = this.lastByYearDay(date);
      const yearDays = this.opts
        .byYearDay!.map((day) => (day > 0 ? day : last + day + 1))
        .filter((day) => day > date.dayOfYear && day <= daysInYear);
      if (yearDays.length) return date.add({days: Math.min(...yearDays) - date.dayOfYear});
      return date.with({month: 1, day: 1}).add({years: 1});
    }
    if (!this.matchesByMonthDay(date)) {
      const daysInMonth = date.daysInMonth;
      const monthDays = this.opts
        .byMonthDay!.map((day) => (day > 0 ? day : daysInMonth + day + 1))
        .filter((day) => day > date.day && day <= daysInMonth);
      if (monthDays.length) return date.with({day: Math.min(...monthDays)});
      return date.with({day: 1}).add({months: 1});
    }
    if (!this.hasOrdinalByDay && this.simpleByDayIsoDays?.length) {
      const deltas = this.simpleByDayIsoDays.map((day) => ((day - date.dayOfWeek + 6) % 7) + 1);
      return date.add({days: Math.min(...deltas)});
    }
    return date.add({days: 1});
  }

  /** Calendar periods advance independently of the dates and times they emit.
   * Invalid inherited dates and nonexistent wall times do not consume COUNT
   * or change DTSTART's fields for the following period (RFC 5545 3.3.10).
   */
  private _allCalendarPeriods(
    iterator?: InternalRRuleTemporalIterator,
    queryLowerBound?: Temporal.ZonedDateTime,
  ): Temporal.ZonedDateTime[] {
    const dates: Temporal.ZonedDateTime[] = [];
    const work = this.createCandidateWorkBudget();
    const start = this.originalDtstart;
    const {freq, interval = 1} = this.opts;
    const startDate = start.toPlainDate();
    const untilDate = this.opts.until?.withTimeZone(start.timeZoneId).withCalendar(start.calendarId).toPlainDate();
    let cursor = freq === 'DAILY' ? startDate : startDate.with({day: 1});
    if (freq === 'YEARLY') cursor = cursor.with({month: 1});
    const duration = freq === 'YEARLY' ? {years: interval} : freq === 'MONTHLY' ? {months: interval} : {days: interval};

    if (!this.addDtstartIfNeeded(dates, iterator)) return this.applyCountLimitAndMergeRDates(dates, iterator);
    if (freq === 'DAILY' && this.simpleByDayIsoDays?.length) {
      const firstStep = this.findFirstMatchingDailyStep(cursor.dayOfWeek, interval, this.simpleByDayIsoDays);
      if (firstStep === null) return this.applyCountLimitAndMergeRDates(dates, iterator);
      cursor = cursor.add({days: firstStep * interval});
    }
    for (let iteration = 0; ; iteration++) {
      if (untilDate && Temporal.PlainDate.compare(cursor, untilDate) > 0) break;
      if (iteration >= this.maxIterations) {
        throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
      }
      const candidates: Temporal.PlainDate[] = [];
      if (freq === 'DAILY') {
        if (
          this.matchesByMonth(cursor) &&
          this.matchesByMonthDay(cursor) &&
          this.matchesByDay(cursor) &&
          this.matchesByYearDay(cursor) &&
          this.matchesByWeekNo(cursor)
        )
          candidates.push(cursor);
      } else {
        const months = freq === 'YEARLY' ? (this.opts.byMonth ?? [start.monthCode]) : [cursor.month];
        for (const month of months) {
          if (freq === 'MONTHLY' && !this.matchesByMonth(cursor)) continue;
          let monthStart: Temporal.PlainDate;
          try {
            monthStart = cursor.with(typeof month === 'number' ? {month} : {monthCode: month}, {overflow: 'reject'});
          } catch {
            continue;
          }
          const date = this.applySkipForDay(start.calendarId, cursor.year, monthStart, start.day);
          if (date) candidates.push(date);
        }
      }
      if (
        !this.visitPeriodCandidates(
          candidates,
          (candidate) => this.processOccurrence(candidate, dates, start, iterator, undefined, work),
          queryLowerBound ?? start,
          this.opts.until,
          work,
        )
      )
        break;
      cursor = cursor.add(duration);
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
      // Like UTC generation, compute the COUNT-bounded rule first, then union
      // RDATE and subtract EXDATE. Streaming uses the recurrence-set iterator.
      return this.opts.rDate || this.opts.exDate
        ? this.applyCountLimitAndMergeRDates(tzFastPathDates)
        : tzFastPathDates;
    }

    if (
      this.opts.freq === 'DAILY' ||
      (['MONTHLY', 'YEARLY'].includes(this.opts.freq) &&
        !this.opts.byDay &&
        !this.opts.byMonthDay &&
        !this.opts.byYearDay &&
        !this.opts.byWeekNo)
    ) {
      return this._allCalendarPeriods(iterator, queryLowerBound);
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

    // --- 5) YEARLY + BY... rules (also handles WEEKLY + BYYEARDAY and WEEKLY + BYWEEKNO) ---
    if (
      (this.opts.freq === 'YEARLY' &&
        (this.opts.byDay || this.opts.byMonthDay || this.opts.byYearDay || this.opts.byWeekNo)) ||
      (this.opts.freq === 'WEEKLY' && this.opts.byYearDay && this.opts.byYearDay.length > 0) ||
      (this.opts.freq === 'WEEKLY' && this.opts.byWeekNo && this.opts.byWeekNo.length > 0)
    ) {
      return this._allYearlyComplex(iterator, queryLowerBound);
    }

    // --- 6) HOURLY/MINUTELY/SECONDLY with BYxxx parts ---
    if (
      ['HOURLY', 'MINUTELY', 'SECONDLY'].includes(this.opts.freq) &&
      !this.opts.rscale &&
      (this.opts.byMonth ||
        this.opts.byWeekNo ||
        this.opts.byYearDay ||
        this.opts.byMonthDay ||
        this.opts.byDay ||
        this.opts.byHour ||
        this.opts.byMinute ||
        this.opts.bySecond ||
        this.opts.bySetPos)
    ) {
      return this._allSubDailyPeriods(iterator);
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

    // --- 7) fallback: step + filter ---
    // Handle MINUTELY/HOURLY/DAILY frequency with BYSETPOS
    if ((this.opts.freq === 'MINUTELY' || this.opts.freq === 'HOURLY') && this.opts.bySetPos) {
      return this._allDailyMinutelyHourlyWithBySetPos(iterator);
    }

    return this._allFallback(iterator);
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
   * Periods a plan may scan while the general engine it replaces stays within
   * maxIterations and maxCandidateEvaluations. previous() backs its search off
   * in powers of four, so its engine can visit four times the periods scanned.
   */
  private periodScanBudget(plan: PeriodQueryPlan, factor: number, limit: number): number {
    const iterations = Math.floor((this.maxIterations - PERIOD_ITERATION_SLACK) / factor);
    const candidates =
      Math.floor(this.maxCandidateEvaluations / (plan.candidatesPerPeriod * factor)) - PERIOD_ITERATION_SLACK;
    return Math.min(limit, iterations, candidates);
  }

  /** Resolve a period's wall times, or null when any needs the general engine (e.g. a DST gap). */
  private resolvePeriodEpochs(plan: PeriodQueryPlan, period: number): number[] | null {
    if (plan.rankedPeriodWallSpan && this.tzid !== 'UTC') {
      const span = plan.rankedPeriodWallSpan(period);
      if (!span) return null;
      const resolver = this.getZoneResolver();
      if (
        this.timeSlotOffsetsMs!.some((slot) =>
          resolver.timeOfDayMayHitGap(slot, span[0] - MS_PER_DAY, span[1] + MS_PER_DAY),
        )
      ) {
        return null;
      }
    }
    const walls = plan.wallsForPeriod(period);
    if (!walls) return null;
    const epochs = new Array<number>(walls.length);
    for (let index = 0; index < walls.length; index++) {
      const epochMilliseconds = this.resolveNumericWallMilliseconds(walls[index]!);
      if (epochMilliseconds === null) return null;
      epochs[index] = epochMilliseconds;
    }
    return epochs;
  }

  private isExcludedEpochMilliseconds(epochMilliseconds: number): boolean {
    return Boolean(this.opts.exDate?.length) && this.isExcludedEpoch(BigInt(epochMilliseconds) * NS_PER_MILLISECOND);
  }

  /**
   * First RRULE instant at or after `lowerMs` that EXDATE does not remove. An
   * instant after `stopAfterMs` is returned unchecked: a caller holding an
   * earlier RDATE needs no later rule instant. Returns null when UNTIL ends the
   * rule first, and undefined when the general engine must answer.
   */
  private periodScanForward(
    plan: PeriodQueryPlan,
    lowerMs: number,
    stopAfterMs?: number,
    budgetFactor = 1,
  ): number | null | undefined {
    const startMs = this.originalDtstart.epochMilliseconds;
    const untilMs = this.opts.until?.epochMilliseconds;
    const fromMs = Math.max(lowerMs, startMs);
    if (untilMs !== undefined && fromMs > untilMs) return null;
    const budget = this.periodScanBudget(plan, budgetFactor, PERIOD_SCAN_LIMIT);
    const visit = (epochMilliseconds: number): number | null | undefined => {
      if (untilMs !== undefined && epochMilliseconds > untilMs) return null;
      if (stopAfterMs !== undefined && epochMilliseconds > stopAfterMs) return epochMilliseconds;
      return this.isExcludedEpochMilliseconds(epochMilliseconds) ? undefined : epochMilliseconds;
    };

    const step = plan.stepMilliseconds;
    if (step !== undefined) {
      let epochMilliseconds = startMs + Math.ceil((fromMs - startMs) / step) * step;
      if (epochMilliseconds < fromMs) epochMilliseconds += step;
      else if (epochMilliseconds - step >= fromMs) epochMilliseconds -= step;
      for (let scanned = 0; scanned < budget; scanned++, epochMilliseconds += step) {
        if (!isSafeTemporalEpochMilliseconds(epochMilliseconds)) return undefined;
        const result = visit(epochMilliseconds);
        if (result !== undefined) return result;
      }
      return undefined;
    }

    // Any offset is under a day, so earlier periods resolve before fromMs.
    let period = Math.max(0, plan.periodOfWall(this.tzid === 'UTC' ? fromMs : fromMs - MS_PER_DAY));
    for (let scanned = 0; scanned < budget; scanned++, period++) {
      const epochs = this.resolvePeriodEpochs(plan, period);
      if (!epochs) return undefined;
      for (const epochMilliseconds of epochs) {
        if (epochMilliseconds < fromMs) continue;
        const result = visit(epochMilliseconds);
        if (result !== undefined) return result;
      }
    }
    return undefined;
  }

  /**
   * Last RRULE instant at or before `upperMs` (and UNTIL) that EXDATE does not
   * remove. An instant before `stopBeforeMs` is returned unchecked: a caller
   * holding a later RDATE needs no earlier rule instant. Returns null before
   * DTSTART, and undefined when the general engine must answer.
   */
  private periodScanBackward(plan: PeriodQueryPlan, upperMs: number, stopBeforeMs?: number): number | null | undefined {
    const startMs = this.originalDtstart.epochMilliseconds;
    const untilMs = this.opts.until?.epochMilliseconds;
    const toMs = untilMs === undefined ? upperMs : Math.min(upperMs, untilMs);
    if (toMs < startMs) return null;
    // The general engine can revisit four times these periods (see tryPeriodPrevious()).
    const budget = this.periodScanBudget(plan, 8, PERIOD_SCAN_LIMIT);
    const visit = (epochMilliseconds: number): number | null | undefined => {
      if (epochMilliseconds < startMs) return null;
      if (stopBeforeMs !== undefined && epochMilliseconds < stopBeforeMs) return epochMilliseconds;
      return this.isExcludedEpochMilliseconds(epochMilliseconds) ? undefined : epochMilliseconds;
    };

    const step = plan.stepMilliseconds;
    if (step !== undefined) {
      let epochMilliseconds = startMs + Math.floor((toMs - startMs) / step) * step;
      if (epochMilliseconds > toMs) epochMilliseconds -= step;
      else if (epochMilliseconds + step <= toMs) epochMilliseconds += step;
      for (let scanned = 0; scanned < budget; scanned++, epochMilliseconds -= step) {
        const result = visit(epochMilliseconds);
        if (result !== undefined) return result;
      }
      return undefined;
    }

    // Any offset is under a day, so later periods resolve after toMs.
    let period = plan.periodOfWall(this.tzid === 'UTC' ? toMs : toMs + MS_PER_DAY);
    for (let scanned = 0; scanned < budget; scanned++, period--) {
      if (period < 0) return null;
      const epochs = this.resolvePeriodEpochs(plan, period);
      if (!epochs) return undefined;
      for (let index = epochs.length - 1; index >= 0; index--) {
        const epochMilliseconds = epochs[index]!;
        if (epochMilliseconds > toMs) continue;
        const result = visit(epochMilliseconds);
        if (result !== undefined) return result;
      }
    }
    return undefined;
  }

  /** RRULE instants in [lowerMs, upperMs] without EXDATEs, or null when the general engine must answer. */
  private periodEpochsBetween(plan: PeriodQueryPlan, lowerMs: number, upperMs: number): number[] | null {
    const startMs = this.originalDtstart.epochMilliseconds;
    const untilMs = this.opts.until?.epochMilliseconds;
    const fromMs = Math.max(lowerMs, startMs);
    const toMs = untilMs === undefined ? upperMs : Math.min(upperMs, untilMs);
    const epochs: number[] = [];
    if (fromMs > toMs) return epochs;
    const budget = this.periodScanBudget(plan, 1, Infinity);

    const step = plan.stepMilliseconds;
    if (step !== undefined) {
      let first = startMs + Math.ceil((fromMs - startMs) / step) * step;
      if (first < fromMs) first += step;
      else if (first - step >= fromMs) first -= step;
      if ((toMs - first) / step >= budget) return null;
      for (let epochMilliseconds = first; epochMilliseconds <= toMs; epochMilliseconds += step) {
        if (!isSafeTemporalEpochMilliseconds(epochMilliseconds)) return null;
        if (!this.isExcludedEpochMilliseconds(epochMilliseconds)) epochs.push(epochMilliseconds);
      }
      return epochs;
    }

    const utc = this.tzid === 'UTC';
    const firstPeriod = Math.max(0, plan.periodOfWall(utc ? fromMs : fromMs - MS_PER_DAY));
    const lastPeriod = plan.periodOfWall(utc ? toMs : toMs + MS_PER_DAY);
    if (lastPeriod - firstPeriod >= budget) return null;
    for (let period = firstPeriod; period <= lastPeriod; period++) {
      const periodEpochs = this.resolvePeriodEpochs(plan, period);
      if (!periodEpochs) return null;
      for (const epochMilliseconds of periodEpochs) {
        if (epochMilliseconds < fromMs || epochMilliseconds > toMs) continue;
        if (!this.isExcludedEpochMilliseconds(epochMilliseconds)) epochs.push(epochMilliseconds);
      }
    }
    return epochs;
  }

  private tryPeriodNext(
    targetEpochNanoseconds: bigint,
    inclusive: boolean,
  ): NumericQueryResult<Temporal.ZonedDateTime | null> {
    const plan = this.getPeriodQueryPlan();
    if (!plan) return {handled: false};

    const rDate = this.opts.rDate
      ? this.getNumericRDates()[this.numericRDateLowerBound(targetEpochNanoseconds, !inclusive)]
      : undefined;
    const ruleEpoch = this.periodScanForward(
      plan,
      firstMillisecondFrom(targetEpochNanoseconds, !inclusive),
      rDate ? lastMillisecondThrough(rDate.epochNanoseconds, false) : undefined,
    );
    if (ruleEpoch === undefined) return {handled: false};
    // RRULE wins an exact-instant tie, matching the recurrence-set merge.
    if (rDate && (ruleEpoch === null || BigInt(ruleEpoch) * NS_PER_MILLISECOND > rDate.epochNanoseconds)) {
      return {handled: true, value: rDate};
    }
    return {handled: true, value: ruleEpoch === null ? null : this.zdtFromEpochMs(ruleEpoch)};
  }

  private tryPeriodPrevious(
    targetEpochNanoseconds: bigint,
    inclusive: boolean,
  ): NumericQueryResult<Temporal.ZonedDateTime | null> {
    const plan = this.getPeriodQueryPlan();
    if (!plan) return {handled: false};

    const rDateIndex = this.opts.rDate ? this.numericRDateLowerBound(targetEpochNanoseconds, inclusive) - 1 : -1;
    const rDate = rDateIndex >= 0 ? this.getNumericRDates()[rDateIndex]! : null;
    const ruleEpoch = this.periodScanBackward(
      plan,
      lastMillisecondThrough(targetEpochNanoseconds, !inclusive),
      rDate ? firstMillisecondFrom(rDate.epochNanoseconds, false) : undefined,
    );
    if (ruleEpoch === undefined) return {handled: false};
    // The general engine backs its anchor off in powers of four and scans
    // forward until an instant passes the target, or UNTIL ends the rule; it
    // exhausts maxIterations when neither happens. Answer only when both halves
    // of that scan fit the budget.
    if (
      this.periodScanForward(plan, firstMillisecondFrom(targetEpochNanoseconds, inclusive), undefined, 2) === undefined
    ) {
      return {handled: false};
    }
    if (rDate && (ruleEpoch === null || BigInt(ruleEpoch) * NS_PER_MILLISECOND < rDate.epochNanoseconds)) {
      return {handled: true, value: rDate};
    }
    return {handled: true, value: ruleEpoch === null ? null : this.zdtFromEpochMs(ruleEpoch)};
  }

  private tryPeriodBetween(
    startEpochNanoseconds: bigint,
    endEpochNanoseconds: bigint,
    inclusive: boolean,
  ): NumericQueryResult<Temporal.ZonedDateTime[]> {
    if (startEpochNanoseconds > endEpochNanoseconds) return {handled: false};
    const plan = this.getPeriodQueryPlan();
    if (!plan) return {handled: false};

    const ruleEpochs = this.periodEpochsBetween(
      plan,
      firstMillisecondFrom(startEpochNanoseconds, !inclusive),
      lastMillisecondThrough(endEpochNanoseconds, !inclusive),
    );
    if (!ruleEpochs) return {handled: false};
    const ruleDates = ruleEpochs.map((epochMilliseconds) => this.zdtFromEpochMs(epochMilliseconds));
    if (!this.opts.rDate) return {handled: true, value: ruleDates};

    const rDates = this.getNumericRDates();
    const endRDateIndex = this.numericRDateLowerBound(endEpochNanoseconds, inclusive);
    const dates: Temporal.ZonedDateTime[] = [];
    let ruleIndex = 0;
    let rDateIndex = this.numericRDateLowerBound(startEpochNanoseconds, !inclusive);
    while (ruleIndex < ruleDates.length || rDateIndex < endRDateIndex) {
      const ruleDate = ruleDates[ruleIndex];
      const rDate = rDateIndex < endRDateIndex ? rDates[rDateIndex] : undefined;
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
    const periodResult = this.tryPeriodBetween(startEpochNanoseconds, endEpochNanoseconds, inc);
    if (periodResult.handled) {
      return this.toPublicDates(periodResult.value);
    }

    const startZdt = new Temporal.ZonedDateTime(startEpochNanoseconds, this.tzid, this.originalDtstart.calendarId);
    const beforeZdt = new Temporal.ZonedDateTime(endEpochNanoseconds, this.tzid, this.originalDtstart.calendarId);

    const tempOpts = {...this.opts};

    if (!tempOpts.until || Temporal.ZonedDateTime.compare(beforeZdt, tempOpts.until) < 0) {
      tempOpts.until = beforeZdt;
    }

    // Optimize dtstart when COUNT is not set by anchoring to the original DTSTART
    // phase and jumping forward in multiples of INTERVAL up to the window start.
    // This preserves cadence for INTERVAL > 1 and reduces iteration.
    if (tempOpts.count === undefined) {
      Object.assign(tempOpts, this.alignedQueryStart(startZdt));
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
    startZdt = startZdt.withTimeZone(this.originalDtstart.timeZoneId).withCalendar(this.originalDtstart.calendarId);
    if (startZdt.epochNanoseconds <= this.originalDtstart.epochNanoseconds) return this.originalDtstart;

    // RSCALE and non-ISO month/year stepping own their period/skip semantics.
    // BYWEEKNO's monthly engine visits whole years rather than monthly windows.
    if (
      this.opts.rscale ||
      this.originalDtstart.timeZoneId !== this.tzid ||
      (this.opts.freq === 'MONTHLY' && this.opts.byWeekNo) ||
      (['MONTHLY', 'YEARLY'].includes(this.opts.freq) &&
        !['iso8601', 'gregory'].includes(this.originalDtstart.calendarId))
    )
      return this.originalDtstart;

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

    const calendarUnit = ['years', 'months', 'weeks', 'days'].includes(unit);
    const seekValidAnchor = (): Temporal.ZonedDateTime => {
      while (steps > 0) {
        if (!calendarUnit) return dtstartNormalized.add(durationForJump(steps * interval));
        try {
          const nominal = this.originalDtstart
            .toPlainDateTime()
            .add(durationForJump(steps * interval), {overflow: 'reject'});
          const candidate = this.resolveGeneratedTime(nominal);
          if (candidate) return candidate;
        } catch {
          // An invalid inherited month/day cannot become a synthetic DTSTART.
        }
        steps -= 1;
      }
      return this.originalDtstart;
    };
    let candidate = seekValidAnchor();

    // rawAdvance deliberately skips the repeated HOURLY hour at a fall-back.
    // Starting a clone inside that second hour would put it back in the set.
    if (
      this.opts.freq === 'HOURLY' &&
      interval === 1 &&
      steps > 0 &&
      candidate.subtract({hours: 1}).hour === candidate.hour
    ) {
      steps -= 1;
      candidate = seekValidAnchor();
    }

    if (steps > 0 && ['years', 'months', 'weeks', 'days'].includes(unit)) {
      const sameDate = candidate.toPlainDate().equals(startZdtNormalized.toPlainDate());
      if (sameDate && Temporal.ZonedDateTime.compare(candidate, startZdtNormalized) > 0) {
        if (this.hasTimeOfDayBetween(startZdtNormalized.toPlainTime(), candidate.toPlainTime())) {
          steps -= 1;
          candidate = seekValidAnchor();
        }
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
    // A whole date can be absent, and a midnight gap can shorten the day.
    // Resolve both nominal boundaries independently instead of carrying a
    // shifted start time into the following date.
    if (!startOfDay.toPlainDate().equals(plainDate)) return false;
    const nextDay = plainDate.add({days: 1}).toZonedDateTime({
      timeZone: this.tzid,
      plainTime: Temporal.PlainTime.from('00:00'),
    });
    const occurrence = this.nextInternal(startOfDay.epochNanoseconds, true);
    return occurrence !== null && occurrence.epochNanoseconds < nextDay.epochNanoseconds;
  }

  private nextInternal(afterEpochNanoseconds: bigint, inc: boolean): Temporal.ZonedDateTime | null {
    const numericResult = this.tryNumericNext(afterEpochNanoseconds, inc);
    if (numericResult.handled) {
      return numericResult.value;
    }
    const periodResult = this.tryPeriodNext(afterEpochNanoseconds, inc);
    if (periodResult.handled) {
      return periodResult.value;
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
   * Share traversal-anchor semantics across all query methods. Only the real
   * DTSTART can be forced into the occurrence set by includeDtstart.
   */
  private alignedQueryStart(windowStart: Temporal.ZonedDateTime) {
    const dtstart = this.jumpAlignedDtstart(windowStart);
    return {
      dtstart,
      includeDtstart: this.includeDtstart && dtstart.epochNanoseconds === this.originalDtstart.epochNanoseconds,
    };
  }

  private ruleFromAlignedDtstart(windowStart: Temporal.ZonedDateTime): RRuleTemporal<TOutput> {
    const aligned = this.alignedQueryStart(windowStart);
    if (aligned.dtstart.epochNanoseconds === this.originalDtstart.epochNanoseconds) {
      return this;
    }
    return new RRuleTemporal<TOutput>({
      ...this.opts,
      temporal: this.outputTemporal,
      ...aligned,
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
    const periodResult = this.tryPeriodPrevious(beforeEpochNanoseconds, inc);
    if (periodResult.handled) {
      return this.toPublicDate(periodResult.value);
    }

    let rDate: Temporal.ZonedDateTime | null = null;
    if (this.opts.rDate?.length) {
      const rDateIndex = this.numericRDateLowerBound(beforeEpochNanoseconds, inc) - 1;
      rDate = rDateIndex >= 0 ? this.getNumericRDates()[rDateIndex]! : null;
    }
    const ruleCandidate = this.previousFromRule(beforeEpochNanoseconds, inc, rDate?.epochNanoseconds);

    // The rule half and the RDATE half are composed here rather than scanned together, the
    // way tryNumericPrevious() composes them: whichever of the two is later is the answer.
    if (!ruleCandidate) {
      return this.toPublicDate(rDate);
    }
    if (rDate && rDate.epochNanoseconds > ruleCandidate.epochNanoseconds) {
      return this.toPublicDate(rDate);
    }
    return this.toPublicDate(ruleCandidate);
  }

  /**
   * The latest occurrence of the RRULE itself at or before the target, with explicit RDATEs
   * held out of the scan.
   *
   * They have to be held out. The scan does not start from DTSTART: it starts from a
   * phase-aligned dtstart near the target and walks forward, so the occurrences between the
   * real DTSTART and that anchor are never generated. An RDATE is an absolute instant rather
   * than a phase, so iterateRecurrenceSet() flushes any that predate the anchor into the same
   * pass, and this scan keeps the last date it is handed. That leaves the last flushed RDATE
   * standing in for a rule occurrence the aligned scan never produced -- and because the scan
   * then has a non-null answer, the backoff loop below returns it instead of widening the
   * window to look for the real one. previous() merges the RDATEs back in afterwards.
   */
  private previousFromRule(
    beforeEpochNanoseconds: bigint,
    inc: boolean,
    rDateEpochNanoseconds?: bigint,
  ): Temporal.ZonedDateTime | null {
    const base: RRuleTemporal<TOutput> =
      this.opts.rDate && this.opts.rDate.length > 0
        ? new RRuleTemporal<TOutput>({
            ...this.opts,
            temporal: this.outputTemporal,
            rDate: undefined,
          } as RRuleOptions<TOutput>)
        : this;

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
    if (base.opts.count !== undefined) {
      return scanFrom(base);
    }

    // Scan forward from a phase-aligned start near the target, backing the
    // start off exponentially until an occurrence before the target is found
    // (or the original DTSTART is reached, meaning there is none).
    // Calendar arithmetic must use DTSTART's calendar, even when the query or
    // UNTIL was supplied in a different calendar or time zone.
    const untilEpochNanoseconds = base.opts.until?.epochNanoseconds;
    const anchor = new Temporal.ZonedDateTime(
      untilEpochNanoseconds !== undefined && untilEpochNanoseconds < beforeEpochNanoseconds
        ? untilEpochNanoseconds
        : beforeEpochNanoseconds,
      base.tzid,
      base.originalDtstart.calendarId,
    );
    const interval = base.opts.interval ?? 1;
    for (let backoff = 0; backoff < 16; backoff++) {
      let target = backoff === 0 ? anchor : anchor.subtract(base.freqDuration(interval * 4 ** backoff));
      // Once this instant is covered, older RRULE occurrences cannot beat the
      // eligible RDATE. Clamping also avoids replaying dense, irrelevant history.
      const reachedRDate = rDateEpochNanoseconds !== undefined && target.epochNanoseconds <= rDateEpochNanoseconds;
      if (reachedRDate) {
        target = new Temporal.ZonedDateTime(rDateEpochNanoseconds, base.tzid, base.originalDtstart.calendarId);
      }
      const rule = base.ruleFromAlignedDtstart(target);
      const prev = scanFrom(rule);
      if (prev || rule === base || reachedRDate) {
        return prev;
      }
    }
    return scanFrom(base);
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
  private generateMonthlyDateCandidates(sample: Temporal.PlainDate): Temporal.PlainDate[] {
    const monthStart = sample.day === 1 ? sample : sample.with({day: 1});
    if (!this.opts.byDay && !this.opts.byMonthDay) {
      return [sample];
    }

    const finalDays = this.generateMonthlyOccurrenceDays(monthStart);
    if (finalDays.length === 0) return [];
    return finalDays.map((day) => monthStart.with({day}));
  }

  private generateMonthlyOccurrences(sample: Temporal.ZonedDateTime): Temporal.ZonedDateTime[] {
    const occurrences: Temporal.ZonedDateTime[] = [];
    this.visitDateTimeCandidates(this.generateMonthlyDateCandidates(sample.toPlainDate()), 1, (candidate) => {
      occurrences.push(candidate);
      return true;
    });
    return occurrences;
  }

  /**
   * Resolve one recurrence year's matching calendar dates. BYHOUR,
   * BYMINUTE, BYSECOND, and BYSETPOS deliberately remain outside this helper;
   * callers consume the date x time product incrementally.
   */
  private generateYearlyDateCandidates(sample: Temporal.PlainDate): Temporal.PlainDate[] {
    const months = this.opts.byMonth
      ? this.opts.byMonth.filter((v): v is number => typeof v === 'number').sort((a, b) => a - b)
      : this.opts.byMonthDay || this.opts.byDay
        ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
        : [this.originalDtstart.month];

    let occs: Temporal.PlainDate[] = [];

    const hasOrdinalByDay = this.opts.byDay && this.opts.byDay.some((t) => /^[+-]?\d/.test(t));
    if (hasOrdinalByDay && !this.opts.byMonth) {
      // nth weekday of year
      const dayMap = weekdayToIsoDay;
      for (const tok of this.opts.byDay!) {
        const parsed = parseByDayToken(tok);
        if (!parsed || parsed.ord === 0) continue;
        const ord = parsed.ord;
        const wd = dayMap[parsed.weekday]!;
        let dt: Temporal.PlainDate;
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
            ? sample.with({month: 1, day: 1}).add({days: dayNum - 1})
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

  private addByDayDates(tokens: string[], weekStart: Temporal.PlainDate): Temporal.PlainDate[] {
    const dayMap = weekdayToIsoDay;
    const wkst = dayMap[(this.opts.wkst || 'MO') as keyof typeof dayMap]!;
    const entries: Temporal.PlainDate[] = [];
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

  private isoWeekByDay(sample: Temporal.PlainDate) {
    const dayMap = weekdayToIsoDay;
    const wkst = dayMap[(this.opts.wkst || 'MO') as keyof typeof dayMap]!;
    const jan4 = sample.with({month: 1, day: 4});
    const delta = (jan4.dayOfWeek - wkst + 7) % 7;
    const firstWeekStart = jan4.subtract({days: delta});

    // Use the two week-year boundaries, respecting WKST and the calendar's
    // actual year length. A non-ISO year need not contain 52 or 53 weeks.
    const nextJan4 = jan4.add({years: 1}).with({month: 1, day: 4});
    const nextWeekStart = nextJan4.subtract({days: (nextJan4.dayOfWeek - wkst + 7) % 7});
    const lastWeek = firstWeekStart.until(nextWeekStart, {largestUnit: 'days'}).days / 7;

    const tokens = this.opts.byDay?.length
      ? this.opts.byDay.map((tok) => extractWeekdayToken(tok)).filter((day): day is Weekday => day !== null)
      : [Object.entries(dayMap).find(([, d]) => d === this.originalDtstart.dayOfWeek)![0]];

    return {lastWeek, firstWeekStart, tokens};
  }

  /**
   * Generate occurrences for a specific week number in a given year
   */
  private generateDateCandidatesForWeekInYear(year: number, weekNo: number): Temporal.PlainDate[] {
    const occs: Temporal.PlainDate[] = [];
    const sample = this.originalDtstart.toPlainDate().with({year, month: 1, day: 1});

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
        const d = PolyfillTemporal.PlainDate.from({calendar: calId, year, month: m, day: 1}, {overflow: 'reject'});
        out.push(d);
      } catch {
        break;
      }
    }
    return out;
  }

  private rscaleMonth(
    calId: string,
    year: number,
    monthCode: string,
    months: Temporal.PlainDate[],
  ): Temporal.PlainDate | null {
    const exact = months.find((month) => month.monthCode === monthCode);
    if (exact) return exact;
    if (this.opts.skip === 'BACKWARD') {
      return (
        months
          .slice()
          .reverse()
          .find((month) => month.monthCode < monthCode) ?? this.startOfYear(calId, year).subtract({months: 1})
      );
    }
    if (this.opts.skip === 'FORWARD') {
      return months.find((month) => month.monthCode > monthCode) ?? this.startOfYear(calId, year + 1);
    }
    return null;
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

  private rscaleDate(pd: Temporal.PlainDate): Temporal.PlainDate {
    // Calendar arithmetic stays in the pinned polyfill; materialization uses
    // the ambient Temporal implementation only after expansion and SKIP.
    return Temporal.PlainDate.from(pd.withCalendar('iso8601').toString());
  }

  private rscaleDateAfterUntil(pd: Temporal.PlainDate): boolean {
    if (!this.opts.until) return false;
    const untilDate = this.opts.until.withTimeZone(this.generationTimeZone).toPlainDate().withCalendar('iso8601');
    return Temporal.PlainDate.compare(this.rscaleDate(pd), untilDate) > 0;
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
  ): Temporal.PlainDate[] {
    const occs: Temporal.PlainDate[] = [];
    const byMonthDay = this.opts.byMonthDay;
    const byDay = this.opts.byDay;

    // If no BYDAY/BYMONTHDAY, default to DTSTART's day in this calendar
    if (!byDay && !byMonthDay) {
      const targetDay = this.toRscaleZdt(this.originalDtstart).withCalendar(calId).day;
      const pd = this.applySkipForDay(calId, year, monthStart, targetDay);
      if (pd) occs.push(this.rscaleDate(pd));
      return occs;
    }

    const addZ = (pd: Temporal.PlainDate) => {
      occs.push(this.rscaleDate(pd));
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
    return this.sortedUniqueDateCandidates(occs);
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

        let occs: Temporal.PlainDate[] = [];

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
              occs.push(this.rscaleDate(pd));
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
            occs.push(this.rscaleDate(pd));
          }
        } else if (!monthsTokens || monthsTokens.length === 0) {
          // Resolve the inherited month and day independently. Constraining
          // Temporal construction would bypass SKIP=OMIT and move anniversaries.
          const monthStart = this.rscaleMonth(calId, tgtYear, seed.monthCode, months);
          const pd = monthStart ? this.applySkipForDay(calId, tgtYear, monthStart, seed.day) : null;
          if (pd) occs.push(this.rscaleDate(pd));
        } else {
          for (const token of monthsTokens) {
            const monthCode =
              typeof token === 'number' ? `M${this.pad2(token)}` : `M${this.pad2(parseInt(token, 10))}L`;
            const monthStart = this.rscaleMonth(calId, tgtYear, monthCode, months);
            if (monthStart) occs.push(...this.generateMonthlyOccurrencesRscale(calId, tgtYear, monthStart));
          }
        }

        // Stream time components without materializing date x time.
        if (occs.length > 0) {
          const completed = this.visitPeriodCandidates(
            occs,
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

        const occs: Temporal.PlainDate[] = [];
        for (const tok of tokens) {
          const targetDow = dayMap[tok as keyof typeof dayMap]!;
          const pd = weekStart.add({days: (targetDow - wkst + 7) % 7});

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

          occs.push(this.rscaleDate(pd));
        }

        if (occs.length) {
          const completed = this.visitPeriodCandidates(
            occs,
            (candidate) => this.processOccurrence(candidate, dates, start, iterator, undefined, work),
            queryLowerBound ?? start,
            this.opts.until,
            work,
          );
          if (!completed) return this.applyCountLimitAndMergeRDates(dates, iterator);
        }

        // Advance to next week
        weekStart = weekStart.add({weeks: this.opts.interval ?? 1});
        if (this.rscaleDateAfterUntil(weekStart)) break;
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
          const completed = this.visitPeriodCandidates(
            occs,
            (candidate) => this.processOccurrence(candidate, dates, start, iterator, undefined, work),
            queryLowerBound ?? start,
            this.opts.until,
            work,
          );
          if (!completed) break;
        }

        cursor = cursor.add({months: this.opts.interval ?? 1});
        // stop if UNTIL passed (compare via ISO ZDT from RSCALE date)
        if (this.rscaleDateAfterUntil(cursor)) break;
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
          const base = this.rscaleDate(pd);
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
        if (this.rscaleDateAfterUntil(pd)) break;
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
          const base = this.rscaleDate(pd);
          const completed = this.visitPeriodCandidates(
            [base],
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
        if (this.rscaleDateAfterUntil(pd)) break;
      }
      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }

    return this._allFallback(iterator);
  }
}

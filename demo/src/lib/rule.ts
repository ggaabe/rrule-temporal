import {Temporal} from '@js-temporal/polyfill';
import {RRuleTemporal, type RRuleResolvedOptions} from 'rrule-temporal';
import {toText} from 'rrule-temporal/totext';

export type Zdt = Temporal.ZonedDateTime;
export type Rule = RRuleTemporal<Zdt>;
export type RuleOptions = RRuleResolvedOptions<Zdt>;
export type RulePatch = Partial<RuleOptions>;

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type ParsedRule = {rule: Rule; options: RuleOptions; error: null} | {rule: null; options: null; error: string};

/** Parse DTSTART/RRULE/RDATE/EXDATE text. Results use the demo's Temporal implementation. */
export function parseRule(ics: string, includeDtstart: boolean): ParsedRule {
  try {
    const rule = new RRuleTemporal({rruleString: ics.trim(), includeDtstart, temporal: Temporal});
    return {rule, options: rule.options(), error: null};
  } catch (error) {
    return {rule: null, options: null, error: errorMessage(error)};
  }
}

/** Apply a builder edit and serialize the rule back to text. Throws if the result is invalid. */
export function ruleTextWith(options: RuleOptions, patch: RulePatch): string {
  const merged: Record<string, unknown> = {...options, ...patch};
  for (const [key, value] of Object.entries(merged)) {
    // An empty list means the part is absent.
    if (Array.isArray(value) && value.length === 0) merged[key] = undefined;
  }
  return new RRuleTemporal({...(merged as RuleOptions), temporal: Temporal}).toString();
}

export interface OccurrencePage {
  dates: Zdt[];
  /** True when the rule has more occurrences than were requested. */
  hasMore: boolean;
  milliseconds: number;
  error: string | null;
}

/** The first `limit` occurrences, stopping early so endless rules stay cheap. */
export function occurrencePage(rule: Rule, limit: number): OccurrencePage {
  const started = performance.now();
  try {
    // Ask for one extra occurrence to learn whether more exist.
    const dates = rule.all((_, index) => index <= limit);
    return {
      dates: dates.slice(0, limit),
      hasMore: dates.length > limit,
      milliseconds: performance.now() - started,
      error: null,
    };
  } catch (error) {
    return {dates: [], hasMore: false, milliseconds: performance.now() - started, error: errorMessage(error)};
  }
}

/**
 * toText() is typed for the library's default Temporal types; it only reads the
 * rule's options, so a rule that outputs @js-temporal/polyfill dates works too.
 */
export function describeRule(rule: Rule, language: string): string {
  return toText(rule as unknown as RRuleTemporal, language);
}

/** Run work and time it. Kept outside components so their render code stays pure. */
export function timed<T>(work: () => T): T & {milliseconds: number} {
  const started = performance.now();
  const result = work();
  return {...result, milliseconds: performance.now() - started};
}

/** Run a query, turning library errors into a message. */
export function attempt<T>(query: () => T): {value: T; error: null} | {value: null; error: string} {
  try {
    return {value: query(), error: null};
  } catch (error) {
    return {value: null, error: errorMessage(error)};
  }
}

/** Whether occurrences can land on a non-zero second, so times should show seconds. */
export function showsSeconds(options: RuleOptions): boolean {
  return (
    options.freq === 'SECONDLY' ||
    options.dtstart.second !== 0 ||
    (options.bySecond?.some((second) => second !== 0) ?? false)
  );
}

/** Intl calendar ids for the RSCALE values the library supports. */
export const intlCalendarForRscale: Record<string, string> = {
  GREGORIAN: 'gregory',
  HEBREW: 'hebrew',
  CHINESE: 'chinese',
  INDIAN: 'indian',
};

export const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

const commonTimeZones = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Africa/Cairo',
  'Asia/Jerusalem',
  'Asia/Kolkata',
  'Asia/Kathmandu',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Australia/Lord_Howe',
  'Pacific/Auckland',
  'Pacific/Chatham',
];

/** Common zones first, then every zone the runtime knows. */
export function timeZoneChoices(current: string): {common: string[]; all: string[]} {
  let all: string[] = [];
  try {
    all = Intl.supportedValuesOf('timeZone');
  } catch {
    all = [];
  }
  const common = [...new Set([current, localTimeZone, ...commonTimeZones])];
  return {common, all: all.filter((zone) => !common.includes(zone))};
}

import {Temporal} from '@js-temporal/polyfill';
import {RRuleOptions, RRuleTemporal} from '../index';

export function zdt(y: number, m: number, d: number, h: number = 0, tz = 'America/New_York') {
  return Temporal.ZonedDateTime.from({
    year: y,
    month: m,
    day: d,
    hour: h,
    minute: 0,
    timeZone: tz,
  });
}

type IDateTime = Temporal.ZonedDateTime | null;
export const limit = (n: number) => (_: any, i: number) => i < n;

const toTimezone = (tz: string) => (d: IDateTime) => (d ? new Date(d.withTimeZone(tz).epochMilliseconds) : null);

export const format = (tz: string) => (d: IDateTime) => d?.withTimeZone(tz).toString();

export const formatUTC = (d: IDateTime) => toTimezone('UTC')(d)?.toUTCString();

export const formatISO = (d: IDateTime) => toTimezone('UTC')(d)?.toISOString();

type ParseOptions = Pick<RRuleOptions, 'maxIterations' | 'includeDtstart'>;
export const parse = (rruleString: string, opts?: ParseOptions) => new RRuleTemporal({rruleString, ...opts});

export type IAssertDates = {
  rule: RRuleTemporal;
  print?: (d: Temporal.ZonedDateTime | null) => string | undefined;
  between?: (Date | Temporal.ZonedDateTime)[];
  limit?: number;
  inc?: boolean;
};

export function assertDates({rule, between, limit: max, inc = true, print = formatISO}: IAssertDates, dates: string[]) {
  if (between && between.length >= 2) {
    expect(rule.between(between[0]!, between[1]!, inc).map(print)).toEqual(dates);
  } else if (max) {
    expect(rule.all(limit(max)).map(print)).toEqual(dates);
  } else {
    expect(rule.all().map(print)).toEqual(dates);
  }
}

export async function verifyWithLibRecur(rule: RRuleTemporal, tz?: string) {
  const params: Record<string, any> = {
    skip: '',
    max_instances: 100,
    expansion_window_end: '21000101T000000',
    dtstart: rule.options().dtstart.toString({smallestUnit: 'second'}).replace(/[-:]/g, '').slice(0, 15),
    rrule: rule
      .toString()
      .split(/\s+/g)
      .filter((s) => s.startsWith('RRULE:'))[0]!
      .substring(6),
  };
  const url = 'https://recurrence-expansion-service.appspot.com/reaas?' + new URLSearchParams(params).toString();
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Response status: ${response.status}, url:${url}`);
  }
  const json = (await response.json()) as {instances: string[]};
  return (json.instances ?? []).map((i) => {
    const date = `${i.slice(0, 4)}-${i.slice(4, 6)}-${i.slice(6, 8)}T${i.slice(9)}`;
    const utc = Temporal.PlainDateTime.from(date).toZonedDateTime('UTC');
    if (tz) {
      return format(tz)(utc);
    } else {
      return formatISO(utc);
    }
  });
}

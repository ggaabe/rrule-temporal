import {Temporal} from "@js-temporal/polyfill";
import {RRuleOptions, RRuleTemporal} from "../index";

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

type IFormat = (d: IDateTime) => (string | undefined);
type Opts = { max?: number|null, format?: IFormat };

export function assertAllDates(rule: RRuleTemporal, dates: string[], {max=null, format = formatISO}: Opts = {}) {
    const result = rule.all(max === null ? limit(dates.length) : max === undefined ? undefined : limit(max))
    expect(result).toHaveLength(dates.length);
    expect(result.map(format)).toEqual(dates);
}

export function assertAllDatesWithFormat(rule: RRuleTemporal, format: IFormat, dates: string[], opts: Opts = {}) {
    assertAllDates(rule, dates, {...opts, format});
}

export function assertBetweenDates(rule: RRuleTemporal, start: Date, end: Date, format: IFormat, dates: string[]) {
    const result = rule.between(start, end)
    expect(result).toHaveLength(dates.length);
    expect(result.map(format!)).toEqual(dates);
}

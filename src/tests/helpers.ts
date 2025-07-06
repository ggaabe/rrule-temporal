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

type Opts = Pick<RRuleOptions, 'maxIterations' | 'includeDtstart'>;
export const parse = (rruleString: string, opts?: Opts) => new RRuleTemporal({rruleString, ...opts});

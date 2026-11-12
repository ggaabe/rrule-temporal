import {describe, expect, it} from 'vitest';
import {RRuleTemporal} from '../src';
import {Temporal} from '../src/temporal-impl';

/**
 * Seeded comparison of FREQ=YEARLY rules that mix BYYEARDAY, BYMONTHDAY and plain, ordinal
 * (up to ±53) or mixed BYDAY lists against a brute-force reading of RFC 5545 §3.3.10:
 * every day of a recurrence year is kept when it passes every BYxxx part present, with an
 * ordinal weekday counted in its month when BYMONTH is given and in its year otherwise, and
 * a plain weekday meaning every such day. Plain integer calendar arithmetic, no library code.
 */
const seed = Number(process.env.RRULE_YEARLY_FUZZ_SEED ?? 0x158) >>> 0;
const cases = Number(process.env.RRULE_YEARLY_FUZZ_CASES ?? 160);
const WD = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const DAY_MS = 86_400_000;

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const monthLength = (y: number, m: number) => (m === 2 ? (isLeap(y) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31);
const epochDay = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / DAY_MS;
const isoDow = (day: number) => ((((day + 3) % 7) + 7) % 7) + 1;

type Rule = {
  start: {year: number; month: number; day: number; hour: number; minute: number};
  interval: number;
  byMonth?: number[];
  byYearDay?: number[];
  byMonthDay?: number[];
  byDay?: string[];
  byHour?: number[];
  bySetPos?: number[];
  count?: number;
  untilMs?: number;
};

function reference(rule: Rule): number[] {
  const {start} = rule;
  const startMs = epochDay(start.year, start.month, start.day) * DAY_MS + (start.hour * 60 + start.minute) * 60_000;
  const tokens = rule.byDay?.map((token) => {
    const [, ord, wd] = /^([+-]?\d+)?([A-Z]{2})$/.exec(token)!;
    return {ord: ord ? Number(ord) : 0, isoDay: WD.indexOf(wd!) + 1};
  });
  const out: number[] = [];
  let empty = 0;
  for (let k = 0; empty < 400; k++) {
    const year = start.year + k * rule.interval;
    if (rule.untilMs !== undefined && epochDay(year, 1, 1) * DAY_MS > rule.untilMs) break;
    const ylen = isLeap(year) ? 366 : 365;
    let set: number[] = [];
    let doy = 0;
    for (let month = 1; month <= 12; month++) {
      const mlen = monthLength(year, month);
      for (let day = 1; day <= mlen; day++) {
        doy++;
        if (rule.byMonth && !rule.byMonth.includes(month)) continue;
        if (rule.byYearDay && !rule.byYearDay.some((n) => (n > 0 ? n : ylen + n + 1) === doy)) continue;
        if (rule.byMonthDay && !rule.byMonthDay.some((n) => (n > 0 ? n : mlen + n + 1) === day)) continue;
        const ed = epochDay(year, month, day);
        if (tokens) {
          const [pos, len] = rule.byMonth ? [day, mlen] : [doy, ylen];
          const matches = tokens.some(
            ({ord, isoDay}) =>
              isoDay === isoDow(ed) &&
              (ord === 0 || ord === (ord > 0 ? Math.ceil(pos / 7) : -Math.ceil((len - pos + 1) / 7))),
          );
          if (!matches) continue;
        }
        for (const hour of rule.byHour ?? [start.hour]) set.push(ed * DAY_MS + (hour * 60 + start.minute) * 60_000);
      }
    }
    empty = set.length ? 0 : empty + 1;
    if (rule.bySetPos && set.length) {
      const all = set;
      set = [...new Set(rule.bySetPos.map((p) => all[p > 0 ? p - 1 : all.length + p]!))].sort((a, b) => a - b);
    }
    for (const ms of set) {
      if (ms < startMs || (rule.untilMs !== undefined && ms > rule.untilMs)) continue;
      out.push(ms);
      if (out.length === rule.count) return out;
    }
  }
  return out;
}

function randomRule(random: (n: number) => number): Rule {
  const pick = <T>(values: T[]) => values[random(values.length)]!;
  const some = <T>(make: () => T, max: number) => [...new Set(Array.from({length: 1 + random(max)}, make))];
  const leapDay = random(5) === 0;
  const rule: Rule = {
    start: {
      year: 1996 + random(48),
      month: leapDay ? 2 : 1 + random(12),
      day: leapDay ? 29 : 1 + random(28),
      hour: random(24),
      minute: pick([0, 30]),
    },
    interval: pick([1, 1, 1, 2, 3, 4, 7, 28, 100, 400]),
  };
  if (leapDay && !isLeap(rule.start.year)) rule.start.year = 2024;
  const ordinal = () => `${pick(['', '-'])}${random(2) ? 1 + random(5) : 1 + random(53)}${pick(WD)}`;
  const kind = random(5);
  if (kind <= 1) rule.byYearDay = some(() => pick([1, 2, 59, 60, 61, 100, 300, 365, 366, -1, -2, -60, -306, -366]), 3);
  if (kind >= 1 && random(2)) rule.byMonthDay = some(() => pick([1, 2, 13, 28, 29, 30, 31, -1, -2, -7, -31]), 3);
  const dayKind = random(4);
  if (dayKind === 1) rule.byDay = some(() => pick(WD), 3);
  if (dayKind === 2 || (dayKind === 0 && !rule.byYearDay)) rule.byDay = some(ordinal, 3);
  if (dayKind === 3) rule.byDay = [...new Set([...some(ordinal, 2), ...some(() => pick(WD), 2)])];
  // BYYEARDAY needs a limit next to it here: BYYEARDAY=366 alone in common years still runs into maxIterations
  if (rule.byYearDay && !rule.byDay && !rule.byMonthDay) rule.byDay = some(() => pick(WD), 3);
  // BYMONTH only next to BYYEARDAY and a limit: other BYMONTH shapes that never match still run
  // into maxIterations, as they did before BYDAY and BYMONTHDAY limited BYYEARDAY
  if (rule.byYearDay && (rule.byDay || rule.byMonthDay) && random(4) === 0)
    rule.byMonth = some(() => 1 + random(12), 3);
  if (random(5) === 0) rule.byHour = some(() => random(24), 2).sort((a, b) => a - b);
  if (random(6) === 0) rule.bySetPos = [pick([1, -1])];
  if (random(3)) rule.count = 1 + random(10);
  else rule.untilMs = epochDay(rule.start.year + 1 + random(80), 1 + random(12), 1 + random(28)) * DAY_MS;
  return rule;
}

function toRruleString(rule: Rule): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const {start} = rule;
  const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const parts = [
    'FREQ=YEARLY',
    `INTERVAL=${rule.interval}`,
    rule.byMonth && `BYMONTH=${rule.byMonth}`,
    rule.byYearDay && `BYYEARDAY=${rule.byYearDay}`,
    rule.byMonthDay && `BYMONTHDAY=${rule.byMonthDay}`,
    rule.byDay && `BYDAY=${rule.byDay}`,
    rule.byHour && `BYHOUR=${rule.byHour}`,
    rule.bySetPos && `BYSETPOS=${rule.bySetPos}`,
    rule.count !== undefined && `COUNT=${rule.count}`,
    rule.untilMs !== undefined && `UNTIL=${stamp(rule.untilMs)}`,
  ].filter(Boolean);
  const dtstart = `${pad(start.year, 4)}${pad(start.month)}${pad(start.day)}T${pad(start.hour)}${pad(start.minute)}00Z`;
  return `DTSTART:${dtstart}\nRRULE:${parts.join(';')}`;
}

describe(`YEARLY BYYEARDAY / BYMONTHDAY / BYDAY limits against an RFC 5545 oracle (seed=${seed})`, () => {
  it('all(), between(), next() and previous() agree with the oracle', () => {
    let state = seed;
    const random = (n: number) => (((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32) * n) | 0;
    for (let index = 0; index < cases; index++) {
      const rule = randomRule(random);
      const text = toRruleString(rule);
      const expected = reference(rule);
      const rrule = new RRuleTemporal({rruleString: text});
      const ms = (dates: {epochMilliseconds: number}[]) => dates.map((date) => date.epochMilliseconds);
      let actual: number[] | string;
      try {
        actual = ms(rrule.all());
      } catch (error) {
        actual = String(error);
      }
      expect(actual, text).toEqual(expected);
      if (expected.length === 0) continue;
      const first = expected[0]!;
      const last = expected.at(-1)!;
      const middle = expected[expected.length >> 1]!;
      const at = (epochMs: number) => Temporal.Instant.fromEpochMilliseconds(epochMs).toZonedDateTimeISO('UTC');
      expect(ms(rrule.between(at(first), at(last), true)), `between ${text}`).toEqual(expected);
      expect(rrule.next(at(middle), false)?.epochMilliseconds ?? null, `next ${text}`).toBe(
        expected.find((value) => value > middle) ?? null,
      );
      expect(rrule.previous(at(middle), true)?.epochMilliseconds ?? null, `previous ${text}`).toBe(middle);
    }
  }, 120_000);
});

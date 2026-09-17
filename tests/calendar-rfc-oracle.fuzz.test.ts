import {writeFileSync} from 'node:fs';
import {Temporal as ReferenceTemporal} from '@js-temporal/polyfill';
import {afterAll, describe, expect, it} from 'vitest';
import {RRuleTemporal, type Freq, type RRuleOptions} from '../src';
import {Temporal} from '../src/temporal-impl';

type Options = Extract<RRuleOptions, {freq: Freq}>;
const seed = Number(process.env.RRULE_RFC_FUZZ_SEED ?? 0x140141) >>> 0;
const cases = Number(process.env.RRULE_RFC_FUZZ_CASES ?? 24);
if (!Number.isSafeInteger(cases) || cases < 1) throw new Error('RRULE_RFC_FUZZ_CASES must be positive');
const weekdays = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const zones = ['UTC', 'America/New_York', 'Europe/Berlin', 'Australia/Lord_Howe', 'Pacific/Apia'];
const starts = ['2024-01-31T02:30', '2024-02-29T02:15', '2024-03-08T02:30', '2024-10-04T02:15', '2011-12-28T12:00'];
const dayMs = 86_400_000;
let checks = 0;
const failures: unknown[] = [];
const epochs = (dates: {epochNanoseconds: bigint}[]) => dates.map((date) => String(date.epochNanoseconds));

/** Deliberately slow independent oracle: enumerate actual Gregorian dates
 * with Date, classify them into recurrence periods, and resolve wall times
 * with a different Temporal implementation. No recurrence-library internals.
 * Impossible dates are absent by construction; reject distinguishes gaps
 * from repeated times, which use their earlier occurrence.
 */
function reference(options: Options, until: Temporal.ZonedDateTime): bigint[] {
  const start = ReferenceTemporal.ZonedDateTime.from(options.dtstart.toString());
  const interval = options.interval ?? 1;
  const startDay = Date.UTC(start.year, start.month - 1, start.day) / dayMs;
  const weekStart = startDay - (start.dayOfWeek - 1);
  const periods = new Map<number, bigint[]>();
  const firstDay = Date.UTC(start.year, 0, 1) / dayMs;
  const lastDay = Date.UTC(until.year + 1, 0, 1) / dayMs;
  for (let epochDay = firstDay; epochDay < lastDay; epochDay++) {
    const date = new Date(epochDay * dayMs);
    const year = date.getUTCFullYear(),
      month = date.getUTCMonth() + 1,
      day = date.getUTCDate();
    const dow = date.getUTCDay() || 7;
    const monthDelta = (year - start.year) * 12 + month - start.month;
    const week = Math.floor((epochDay - weekStart) / 7);
    let period: number;
    if (options.freq === 'DAILY') period = epochDay - startDay;
    else if (options.freq === 'WEEKLY') period = week;
    else if (options.freq === 'MONTHLY') period = monthDelta;
    else period = year - start.year;
    if (period < 0 || period % interval !== 0) continue;
    if (options.byMonth && !options.byMonth.includes(month)) continue;
    if (options.byDay && !options.byDay.includes(weekdays[dow - 1]!)) continue;
    if (options.byMonthDay) {
      const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
      if (!options.byMonthDay.some((d) => day === (d > 0 ? d : last + d + 1))) continue;
    }
    if (options.freq === 'WEEKLY' && !options.byDay && dow !== start.dayOfWeek) continue;
    if (options.freq === 'MONTHLY' || options.freq === 'YEARLY') {
      if (!options.byDay && !options.byMonthDay && day !== start.day) continue;
      if (
        options.freq === 'YEARLY' &&
        !options.byMonth &&
        !options.byDay &&
        !options.byMonthDay &&
        month !== start.month
      )
        continue;
    }
    for (const hour of options.byHour ?? [start.hour]) {
      for (const minute of options.byMinute ?? [start.minute]) {
        const nominal = ReferenceTemporal.PlainDateTime.from({year, month, day, hour, minute, second: start.second});
        let resolved: ReferenceTemporal.ZonedDateTime;
        try {
          resolved = nominal.toZonedDateTime(start.timeZoneId, {disambiguation: 'reject'});
        } catch {
          resolved = nominal.toZonedDateTime(start.timeZoneId, {disambiguation: 'earlier'});
          if (!resolved.toPlainDateTime().equals(nominal)) continue;
        }
        const dates = periods.get(period) ?? [];
        dates.push(resolved.epochNanoseconds);
        periods.set(period, dates);
      }
    }
  }
  const result: bigint[] = [];
  for (let candidates of periods.values()) {
    candidates = [...new Set(candidates)].sort((a, b) => (a < b ? -1 : 1));
    if (options.bySetPos)
      candidates = [
        ...new Set(
          options.bySetPos.flatMap((position) => {
            const value = candidates[position > 0 ? position - 1 : candidates.length + position];
            return value === undefined ? [] : [value];
          }),
        ),
      ].sort((a, b) => (a < b ? -1 : 1));
    result.push(...candidates.filter((epoch) => epoch >= start.epochNanoseconds && epoch <= until.epochNanoseconds));
  }
  return result;
}

afterAll(() => {
  if (process.env.RRULE_RFC_FUZZ_REPORT)
    writeFileSync(
      process.env.RRULE_RFC_FUZZ_REPORT,
      JSON.stringify({seed, rules: cases * 4, checks, failures}, null, 2),
    );
});

describe(`independent RFC calendar oracle (seed=${seed})`, () => {
  it.each(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const)(
    '%s omits invalid candidates before ranking and counting',
    (freq) => {
      let state = seed ^ freq.length;
      const random = (n: number) => (((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32) * n) | 0;
      for (let index = 0; index < cases; index++) {
        const zone = zones[index % zones.length]!;
        const dtstart = Temporal.ZonedDateTime.from(`${starts[random(starts.length)]}[${zone}]`);
        const until = Temporal.ZonedDateTime.from({year: dtstart.year + 2, month: 12, day: 15, timeZone: zone});
        const options: Options = {freq, dtstart, until, interval: 1 + random(4), cache: index % 2 === 0};
        if (index % 4 > 1) options.byDay = index % 2 ? ['MO', 'SU'] : weekdays;
        if (freq !== 'WEEKLY' && index % 5 === 2) options.byMonthDay = [10, 29, 31, -1];
        if (index % 7 === 3) options.byMonth = [2, 3, 10, 12];
        if (index % 3 === 1) {
          options.byHour = [1, 2, 3];
          options.byMinute = [15, 30];
        }
        if (index % 4 === 2) options.bySetPos = [1, -1];
        if (index % 4 === 3) options.bySetPos = [2];
        let expected = reference(options, until);
        if (index % 2) {
          options.count = Math.min(expected.length, 1 + random(12));
          options.until = undefined;
          expected = expected.slice(0, options.count);
        }
        if (index % 3 === 2) {
          const extra = dtstart.add({days: 2, hours: 1});
          options.rDate = [extra, extra];
          options.exDate = [dtstart];
          expected = [...new Set([...expected, extra.epochNanoseconds])]
            .filter((epoch) => epoch !== dtstart.epochNanoseconds)
            .sort((a, b) => (a < b ? -1 : 1));
        }
        const rule = new RRuleTemporal(options);
        const label = JSON.stringify({...options, dtstart: dtstart.toString()});
        const check = (name: string, actual: () => unknown, wanted: unknown) => {
          checks++;
          let received: unknown;
          try {
            received = actual();
          } catch (error) {
            received = {error: String(error)};
          }
          if (JSON.stringify(received) !== JSON.stringify(wanted))
            failures.push({freq, index, name, options: label, received, expected: wanted});
          expect(received, `${name}: ${label}`).toEqual(wanted);
        };
        check('all', () => epochs(rule.all()), expected.map(String));
        check('iterator', () => epochs(rule.all(() => true)), expected.map(String));
        const targets = [
          dtstart.epochNanoseconds,
          dtstart.add({days: 5}).epochNanoseconds,
          expected.at(-1) ?? until.epochNanoseconds,
        ];
        for (const target of targets) {
          const date = new Temporal.ZonedDateTime(target, zone);
          for (const inc of [true, false]) {
            check(
              'next',
              () => rule.next(date, inc)?.epochNanoseconds.toString() ?? null,
              expected.find((epoch) => (inc ? epoch >= target : epoch > target))?.toString() ?? null,
            );
            check(
              'previous',
              () => rule.previous(date, inc)?.epochNanoseconds.toString() ?? null,
              expected.findLast((epoch) => (inc ? epoch <= target : epoch < target))?.toString() ?? null,
            );
            check(
              'between',
              () => epochs(rule.between(dtstart, date, inc)),
              expected
                .filter((epoch) =>
                  inc
                    ? epoch >= dtstart.epochNanoseconds && epoch <= target
                    : epoch > dtstart.epochNanoseconds && epoch < target,
                )
                .map(String),
            );
          }
        }
      }
    },
    120_000,
  );
});

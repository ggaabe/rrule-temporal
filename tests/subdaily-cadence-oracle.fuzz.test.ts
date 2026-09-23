import {writeFileSync} from 'node:fs';
import {Temporal as ReferenceTemporal} from '@js-temporal/polyfill';
import {RRuleTemporal, type RRuleOptions} from '../src';
import {Temporal} from '../src/temporal-impl';

type Options = Extract<RRuleOptions, {freq: 'HOURLY' | 'MINUTELY' | 'SECONDLY'}>;
type Freq = Options['freq'];
const seed = Number(process.env.RRULE_SUBDAILY_FUZZ_SEED ?? 0x5ec0d) >>> 0;
const cases = Number(process.env.RRULE_SUBDAILY_FUZZ_CASES ?? 30);
// Pair each transition shape with both INTERVAL=1 and a larger INTERVAL.
const exhaustive = process.env.RRULE_SUBDAILY_FUZZ_EXHAUSTIVE === '1';
if (!Number.isSafeInteger(cases) || cases < 1) throw new Error('RRULE_SUBDAILY_FUZZ_CASES must be positive');
const unitNanoseconds: Record<Freq, bigint> = {
  HOURLY: 3_600_000_000_000n,
  MINUTELY: 60_000_000_000n,
  SECONDLY: 1_000_000_000n,
};
const weekdays = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
// Offset transitions to straddle: whole-hour DST in both hemispheres, 30-minute
// DST, :45 transitions, and a skipped date. Fixed offsets use plain starts.
const transitions = [
  ['America/New_York', '2024-03-01'],
  ['America/New_York', '2024-10-01'],
  ['Europe/Berlin', '2024-03-15'],
  ['Europe/Berlin', '2024-10-15'],
  ['Australia/Lord_Howe', '2024-03-15'],
  ['Australia/Lord_Howe', '2024-09-15'],
  ['Pacific/Chatham', '2024-03-15'],
  ['Pacific/Chatham', '2024-09-15'],
  ['Pacific/Apia', '2011-12-15'],
].map(([zone, from]) =>
  ReferenceTemporal.ZonedDateTime.from(`${from}T00:00[${zone}]`).getTimeZoneTransition('next')!.toInstant(),
);
const transitionZones = [
  'America/New_York',
  'America/New_York',
  'Europe/Berlin',
  'Europe/Berlin',
  'Australia/Lord_Howe',
  'Australia/Lord_Howe',
  'Pacific/Chatham',
  'Pacific/Chatham',
  'Pacific/Apia',
];
const fixedStarts = ['2024-01-01T09:17:23[UTC]', '2024-02-28T22:00:00.250[UTC]', '2024-03-31T23:40:00[+05:45]'];
let checks = 0;
const failures: unknown[] = [];

/**
 * Deliberately naive oracle: visit every DTSTART + k * INTERVAL instant (the
 * set without BYxxx parts), keep those whose wall fields satisfy the limiting
 * parts, and expand finer BYMINUTE/BYSECOND within that hour or minute. Wall
 * fields come from Date and offsets from a different Temporal implementation's
 * transitions; it uses no recurrence-library code.
 */
function reference(options: Options, until: ReferenceTemporal.ZonedDateTime): bigint[] {
  const start = ReferenceTemporal.ZonedDateTime.from(options.dtstart.toString());
  const step = unitNanoseconds[options.freq] * BigInt(options.interval ?? 1);
  const skipRepeatedHour = options.freq === 'HOURLY' && (options.interval ?? 1) === 1;
  const limitMinutes = options.freq === 'HOURLY' ? undefined : options.byMinute;
  const limitSeconds = options.freq === 'SECONDLY' ? options.bySecond : undefined;
  const end = until.epochNanoseconds + 2n * unitNanoseconds.HOURLY;
  // Offsets in effect from an hour before DTSTART (for the repeated-hour check) through the end.
  const changes: Array<[bigint, bigint]> = [];
  let cursor = start.subtract({hours: 2});
  changes.push([cursor.epochNanoseconds, BigInt(cursor.offsetNanoseconds)]);
  for (let next = cursor.getTimeZoneTransition('next'); next && next.epochNanoseconds <= end; ) {
    changes.push([next.epochNanoseconds, BigInt(next.offsetNanoseconds)]);
    cursor = next;
    next = cursor.getTimeZoneTransition('next');
  }
  const wall = (epochNanoseconds: bigint) => {
    let offset = changes[0]![1];
    for (const [at, value] of changes) if (at <= epochNanoseconds) offset = value;
    const date = new Date(Number((epochNanoseconds + offset) / 1_000_000n));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    return {
      month,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds(),
      weekday: weekdays[(date.getUTCDay() + 6) % 7]!,
      dayOfYear: (Date.UTC(year, month - 1, date.getUTCDate()) - Date.UTC(year, 0, 1)) / 86_400_000 + 1,
      daysInMonth: new Date(Date.UTC(year, month, 0)).getUTCDate(),
      daysInYear: (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000,
    };
  };
  const result: bigint[] = [];
  for (let epoch = start.epochNanoseconds, k = 0n; epoch <= end; k++, epoch += step) {
    const point = wall(epoch);
    if (skipRepeatedHour && k > 0n && wall(epoch - unitNanoseconds.HOURLY).hour === point.hour) continue;
    const monthDays = options.byMonthDay?.map((day) => (day > 0 ? day : point.daysInMonth + day + 1));
    const yearDays = options.byYearDay?.map((day) => (day > 0 ? day : point.daysInYear + day + 1));
    if (options.byMonth && !options.byMonth.includes(point.month)) continue;
    if (monthDays && !monthDays.includes(point.day)) continue;
    if (yearDays && !yearDays.includes(point.dayOfYear)) continue;
    if (options.byDay && !options.byDay.includes(point.weekday)) continue;
    if (options.byHour && !options.byHour.includes(point.hour)) continue;
    if (limitMinutes && !limitMinutes.includes(point.minute)) continue;
    if (limitSeconds && !limitSeconds.includes(point.second)) continue;

    let candidates: bigint[] = [];
    for (const minute of options.freq === 'HOURLY' ? (options.byMinute ?? [point.minute]) : [point.minute]) {
      for (const second of options.freq === 'SECONDLY' ? [point.second] : (options.bySecond ?? [point.second])) {
        if (minute === point.minute && second === point.second) {
          candidates.push(epoch);
          continue;
        }
        const zoned = ReferenceTemporal.Instant.fromEpochNanoseconds(epoch).toZonedDateTimeISO(start.timeZoneId);
        const candidate = zoned.with({minute, second}, {offset: 'prefer', disambiguation: 'compatible'});
        if (candidate.hour === point.hour && candidate.minute === minute && candidate.second === second) {
          candidates.push(candidate.epochNanoseconds);
        }
      }
    }
    candidates = [...new Set(candidates)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    if (options.bySetPos) {
      candidates = [
        ...new Set(
          options.bySetPos.flatMap((position) => {
            const value = candidates[position > 0 ? position - 1 : candidates.length + position];
            return value === undefined ? [] : [value];
          }),
        ),
      ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    }
    result.push(...candidates.filter((epoch) => epoch >= start.epochNanoseconds && epoch <= until.epochNanoseconds));
  }
  return [...new Set(result)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

afterAll(() => {
  if (process.env.RRULE_SUBDAILY_FUZZ_REPORT) {
    writeFileSync(process.env.RRULE_SUBDAILY_FUZZ_REPORT, JSON.stringify({seed, cases, checks, failures}, null, 2));
  }
});

describe(`independent sub-daily cadence oracle (seed=${seed})`, () => {
  it.each(['HOURLY', 'MINUTELY', 'SECONDLY'] as const)(
    '%s keeps the INTERVAL cadence through limits, expansions, and BYSETPOS',
    (freq) => {
      let state = seed ^ (freq.length * 0x9e3779b1);
      const random = (maximum: number) => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return Math.floor((state / 0x100000000) * maximum);
      };
      const pick = <T>(values: readonly T[]) => values[random(values.length)]!;
      const found: unknown[] = [];
      const intervals = {HOURLY: [1, 2, 3, 5, 7, 25], MINUTELY: [1, 2, 7, 15, 45, 90], SECONDLY: [1, 7, 25, 45, 90]}[
        freq
      ];
      // Enough units to cross the transition after DTSTART with room to spare.
      const horizonUnits = {HOURLY: 24 * 5, MINUTELY: 60 * 6, SECONDLY: 60 * 20}[freq];
      const lead = {HOURLY: {hours: 30}, MINUTELY: {minutes: 150}, SECONDLY: {minutes: 8}}[freq];
      // Every shape around every transition, alternating INTERVAL=1 and a larger
      // INTERVAL (both when exhaustive), plus seeded starts elsewhere.
      const plan: Array<{start: Temporal.ZonedDateTime; interval: number; shape: number}> = [];
      transitions.forEach((transition, which) => {
        for (let shape = 0; shape < 9; shape++) {
          const reference = transition
            .toZonedDateTimeISO(transitionZones[which]!)
            .subtract(lead)
            .add({seconds: random(4) * 15});
          const start = Temporal.ZonedDateTime.from(reference.toString());
          const larger = pick(intervals.slice(1));
          if (exhaustive) plan.push({start, interval: 1, shape}, {start, interval: larger, shape});
          else plan.push({start, interval: (shape + which) % 2 ? larger : 1, shape});
        }
      });
      for (let extra = 0; extra < cases; extra++) {
        const start = Temporal.ZonedDateTime.from(pick(fixedStarts));
        plan.push({start, interval: pick(intervals), shape: random(9)});
      }
      for (const [index, {start, interval, shape}] of plan.entries()) {
        const options: Options = {freq, dtstart: start, interval, cache: false};
        if (freq === 'HOURLY') {
          if (shape === 1) options.byHour = [0, 1, 2, 3, 23];
          if (shape === 2) options.byMinute = [0, 15, 30, 45];
          if (shape === 3)
            [options.byHour, options.byMinute] = [
              [1, 2, 3],
              [0, 30],
            ];
          if (shape === 4)
            [options.byMinute, options.bySecond] = [
              [10, 40],
              [0, 30],
            ];
          if (shape === 5)
            [options.byMinute, options.bySetPos] = [
              [0, 20, 40],
              [1, -1],
            ];
          if (shape === 6) [options.byDay, options.byHour] = [[pick(weekdays)], [2, 9]];
          if (shape === 7) [options.byMonthDay, options.byMinute] = [[start.day + 1, -1], [30]];
          // Jumps from hours before a gap to hours after it.
          if (shape === 8)
            [options.byHour, options.byMinute] = [
              [3, 5],
              [0, 30],
            ];
        } else if (freq === 'MINUTELY') {
          if (shape === 1) options.byMinute = [0, 17, 30, 45];
          if (shape === 2) options.byHour = [0, 1, 2, 3];
          if (shape === 3)
            [options.byHour, options.byMinute] = [
              [1, 2, 3],
              [0, 15, 45],
            ];
          if (shape === 4) options.bySecond = [0, 20, 40];
          if (shape === 5)
            [options.bySecond, options.bySetPos] = [
              [10, 30, 50],
              [2, -1],
            ];
          if (shape === 6) [options.byDay, options.byMinute] = [[pick(weekdays)], [0, 30]];
          if (shape === 7) [options.byMinute, options.bySecond] = [[5, 35], [15]];
          if (shape === 8) [options.byHour, options.byMinute] = [[3], [0, 20, 40]];
        } else {
          if (shape === 1) options.bySecond = [0, 15, 30, 45];
          if (shape === 2) options.byMinute = [0, 1, 30];
          if (shape === 3)
            [options.byMinute, options.bySecond] = [
              [0, 30],
              [0, 20, 40],
            ];
          if (shape === 4) options.byHour = [start.hour, (start.hour + 1) % 24];
          if (shape === 5) [options.bySecond, options.bySetPos] = [[0, 30], [1]];
          if (shape === 6) [options.byDay, options.bySecond] = [[pick(weekdays)], [0, 45]];
          if (shape === 7)
            [options.byHour, options.byMinute, options.bySecond] = [
              [0, 1, 2, 3],
              [0, 59],
              [0, 30],
            ];
          if (shape === 8) options.byHour = [(start.hour + 2) % 24];
        }
        if (index % 5 === 3) options.includeDtstart = true;
        const until = start.add({
          [`${freq === 'HOURLY' ? 'hour' : freq === 'MINUTELY' ? 'minute' : 'second'}s`]: horizonUnits,
        });
        options.until = until;
        let expected = reference(options, ReferenceTemporal.ZonedDateTime.from(until.toString()));
        if (options.includeDtstart && expected[0] !== start.epochNanoseconds) {
          const matches = [
            !options.byHour || options.byHour.includes(start.hour),
            !options.byMinute || options.byMinute.includes(start.minute),
            !options.bySecond || options.bySecond.includes(start.second),
            !options.byDay || options.byDay.includes(weekdays[start.dayOfWeek - 1]!),
            !options.byMonthDay ||
              options.byMonthDay.some((day) => (day > 0 ? day : start.daysInMonth + day + 1) === start.day),
          ].every(Boolean);
          if (!matches) expected = [start.epochNanoseconds, ...expected];
        }
        if (index % 3 === 1 && expected.length > 3) {
          options.until = undefined;
          options.count = Math.min(expected.length, 3 + random(20));
          expected = expected.slice(0, options.count);
        }
        const serialized = {...options, dtstart: start.toString(), until: options.until?.toString()};
        const check = (operation: string, actual: () => unknown, wanted: unknown) => {
          checks++;
          let got: unknown;
          try {
            got = actual();
          } catch (error) {
            got = {error: (error as Error).message};
          }
          if (JSON.stringify(got) !== JSON.stringify(wanted)) {
            const failure = {freq, index, operation, options: serialized, expected: wanted, actual: got};
            found.push(failure);
            failures.push(failure);
          }
        };
        const epochs = (dates: Array<{epochNanoseconds: bigint}>) => dates.map((date) => String(date.epochNanoseconds));
        const rule = new RRuleTemporal({...options, maxIterations: 100_000});
        check('all', () => epochs(rule.all()), expected.map(String));
        check('iterator', () => epochs(rule.all((_date, rank) => rank < 5)), expected.slice(0, 5).map(String));
        if (options.count === undefined && expected.length > 2) {
          for (const target of [expected[random(expected.length)]!, expected[random(expected.length)]! - 1n]) {
            const at = new Temporal.ZonedDateTime(target, start.timeZoneId);
            const after = expected.find((epoch) => epoch > target);
            const before = expected.findLast((epoch) => epoch < target);
            check(`next ${at}`, () => rule.next(at)?.epochNanoseconds.toString() ?? null, after?.toString() ?? null);
            check(
              `previous ${at}`,
              () => rule.previous(at)?.epochNanoseconds.toString() ?? null,
              before?.toString() ?? null,
            );
            const end = at.add({hours: 3});
            check(
              `between ${at}`,
              () => epochs(rule.between(at, end, true)),
              expected.filter((epoch) => epoch >= target && epoch <= end.epochNanoseconds).map(String),
            );
          }
        }
      }
      expect(found.slice(0, 5), `${found.length} mismatches for ${freq}`).toEqual([]);
    },
    240_000,
  );
});

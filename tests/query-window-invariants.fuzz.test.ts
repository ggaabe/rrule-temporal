import {writeFileSync} from 'node:fs';
import {RRuleTemporal, type Freq, type RRuleOptions} from '../src';
import {Temporal} from '../src/temporal-impl';

type Options = Extract<RRuleOptions, {freq: Freq}>;
type DateValue = ReturnType<RRuleTemporal['all']>[number];
const frequencies: Freq[] = ['SECONDLY', 'MINUTELY', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
const units = ['seconds', 'minutes', 'hours', 'days', 'weeks', 'months', 'years'] as const;
const zones = ['UTC', 'America/Chicago', 'Europe/Berlin', 'Australia/Lord_Howe', 'Pacific/Apia', '+05:45'];
const starts = [
  '2024-01-01T09:17:23',
  '2024-01-31T23:30:00',
  '2024-02-29T02:30:00',
  '2024-03-08T02:30:00',
  '2024-10-25T01:30:00',
  '2011-12-27T09:00:00',
];
const weekdays = ['MO', 'TU', 'WE', 'TH', 'FR'];
const rawSeed = Number(process.env.RRULE_WINDOW_FUZZ_SEED ?? 0x1395545);
if (!Number.isSafeInteger(rawSeed)) throw new Error('RRULE_WINDOW_FUZZ_SEED must be a safe integer');
const seed = rawSeed >>> 0;
const cases = Number(process.env.RRULE_WINDOW_FUZZ_CASES ?? 60);
if (!Number.isSafeInteger(cases) || cases < 1) throw new Error('RRULE_WINDOW_FUZZ_CASES must be a positive integer');

function randomSource(initial: number) {
  let state = initial;
  return (maximum: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor((state / 0x100000000) * maximum);
  };
}

/** Independently enumerate from the real DTSTART with every numeric fast path disabled. */
function enumerate(options: Options): DateValue[] {
  const prototype = RRuleTemporal.prototype as unknown as {
    allUtcFastPath(): null;
    allTzEpochFastPath(): null;
    visitUtcPeriodCandidates(): null;
  };
  const spies = [
    vi.spyOn(prototype, 'allUtcFastPath').mockReturnValue(null),
    vi.spyOn(prototype, 'allTzEpochFastPath').mockReturnValue(null),
    vi.spyOn(prototype, 'visitUtcPeriodCandidates').mockReturnValue(null),
  ];
  try {
    return new RRuleTemporal({...options, cache: false}).all();
  } finally {
    spies.forEach((spy) => spy.mockRestore());
  }
}

const key = (date: DateValue | null | undefined) =>
  date ? `${date.epochNanoseconds}/${date.calendarId}/${date.timeZoneId}` : null;
const keys = (dates: DateValue[]) => dates.map(key);
const failures: Array<Record<string, unknown>> = [];
let checks = 0;

afterAll(() => {
  if (process.env.RRULE_WINDOW_FUZZ_REPORT) {
    writeFileSync(
      process.env.RRULE_WINDOW_FUZZ_REPORT,
      JSON.stringify(
        {seed, casesPerFrequency: cases, totalRules: cases * frequencies.length, checks, failures},
        null,
        2,
      ),
    );
  }
});

describe(`recurrence query invariants (seed=${seed})`, () => {
  it.each(frequencies)(
    '%s agrees with complete generation across arbitrary windows',
    (freq) => {
      const random = randomSource(seed ^ (frequencies.indexOf(freq) + 1));
      const unit = units[frequencies.indexOf(freq)]!;
      const found: Array<Record<string, unknown>> = [];
      for (let index = 0; index < cases; index++) {
        const zone = zones[random(zones.length)]!;
        let dtstart = Temporal.ZonedDateTime.from(`${starts[random(starts.length)]}[${zone}]`);
        if (index % 13 === 0) dtstart = dtstart.withCalendar(['hebrew', 'gregory', 'indian'][random(3)]!);

        if (index % 11 === 0) dtstart = dtstart.add({nanoseconds: 123});
        const interval = 1 + random(4);
        const periods = freq === 'YEARLY' ? 8 : freq === 'MONTHLY' ? 16 : 45;
        let options: Options = {
          freq,
          dtstart,
          interval,
          includeDtstart: index % 2 === 0,
          until: dtstart.add({[unit]: periods * interval}),
          cache: index % 2 === 0,
        };
        const shape = index % (freq === 'MONTHLY' || freq === 'YEARLY' ? 8 : 5);
        if (freq === 'DAILY' || freq === 'WEEKLY') {
          if (shape > 0) options.byDay = shape === 1 ? ['MO'] : weekdays;
          if (shape > 2) {
            options.byHour = [6, 18];
            options.byMinute = [0, 30];
          }
          if (freq === 'WEEKLY') options.wkst = ['MO', 'WE', 'SU'][random(3)];
        } else if (freq === 'MONTHLY' || freq === 'YEARLY') {
          if (shape === 1) options.byMonthDay = [1, 15, -1];
          if (shape === 2) options.byDay = weekdays;
          if (shape === 3) {
            options.byDay = ['1MO', '-1FR'];
            options.byHour = [6, 18];
          }
          if (shape === 4) {
            options.byDay = weekdays;
            options.byHour = [6, 18];
            options.bySetPos = [1, -1];
          }
          if (freq === 'YEARLY' && shape === 1) options.byMonth = [2, 6, 11];
          if (shape === 5) options.byMonth = [1, 3, 11];
          if (shape === 6) options.byYearDay = [1, 100, -1];
          if (shape === 7) {
            options.byWeekNo = [1, -1];
            options.byDay = ['MO'];
          }
          if (index % 29 === 0) {
            options.rscale = ['GREGORIAN', 'HEBREW', 'CHINESE', 'INDIAN'][random(4)] as Options['rscale'];
          }
        } else if (freq === 'HOURLY') {
          if (shape > 1) options.byMinute = [0, 17, 45];
          if (shape > 3) options.byHour = [1, 2, 9, 17];
        } else if (freq === 'MINUTELY' && shape > 1) options.bySecond = [0, 23, 45];
        else if (freq === 'SECONDLY' && shape > 1) options.bySecond = [0, 23, 45];

        if (index % 17 === 0) options.tzid = zone === 'UTC' ? 'America/Chicago' : 'UTC';
        const source = enumerate(options);
        if (index % 3 === 1 && source.length > 2) {
          options = {...options, until: undefined, count: Math.min(12, source.length)};
        }
        if (index % 4 === 1 || index % 4 === 2) {
          const extra = dtstart.add({[unit]: interval * 5, nanoseconds: 77});
          options.rDate = [dtstart.subtract({hours: 1}), extra, extra, dtstart.add({[unit]: (periods + 2) * interval})];
          options.exDate = [dtstart, ...(source[2] ? [source[2]] : []), ...(index % 4 === 0 ? [extra] : [])];
        }
        const expected = enumerate(options);
        const rule = new RRuleTemporal(options);
        const serialized = {
          ...options,
          dtstart: dtstart.toString(),
          until: options.until?.toString(),
          rDate: options.rDate?.map(String),
          exDate: options.exDate?.map(String),
        };
        const check = (operation: string, target: unknown, actual: () => unknown, wanted: unknown) => {
          checks++;
          let got: unknown;
          try {
            got = actual();
          } catch (error) {
            got = {error: (error as Error).message};
          }
          if (JSON.stringify(got) !== JSON.stringify(wanted)) {
            const failure = {freq, index, operation, target, options: serialized, expected: wanted, actual: got};
            found.push(failure);
            failures.push(failure);
          }
        };
        check(
          'ordered',
          null,
          () => expected.every((date, i) => i === 0 || date.epochNanoseconds > expected[i - 1]!.epochNanoseconds),
          true,
        );
        check('all', null, () => keys(rule.all()), keys(expected));
        check('full iterator', null, () => keys(new RRuleTemporal(options).all(() => true)), keys(expected));
        check(
          'iterator',
          null,
          () => keys(new RRuleTemporal(options).all((_date, rank) => rank < 4)),
          keys(expected.slice(0, 4)),
        );
        const targets = [
          dtstart.subtract({nanoseconds: 1}),
          dtstart.add({[unit]: interval * (1 + random(periods - 1))}).subtract({hours: 1}),
          ...(expected.length ? [expected[random(expected.length)]!, expected.at(-1)!.add({nanoseconds: 1})] : []),
        ];
        for (const target of targets) {
          for (const inclusive of [false, true]) {
            const eligibleAfter = expected.find((date) =>
              inclusive
                ? date.epochNanoseconds >= target.epochNanoseconds
                : date.epochNanoseconds > target.epochNanoseconds,
            );
            const eligibleBefore = expected.findLast((date) =>
              inclusive
                ? date.epochNanoseconds <= target.epochNanoseconds
                : date.epochNanoseconds < target.epochNanoseconds,
            );
            check(
              'next',
              `${target}, inclusive=${inclusive}`,
              () => key(rule.next(target, inclusive)),
              key(eligibleAfter),
            );
            check(
              'previous',
              `${target}, inclusive=${inclusive}`,
              () => key(rule.previous(target, inclusive)),
              key(eligibleBefore),
            );
            const end = target.add({[unit]: interval * 2, nanoseconds: 1});
            const window = expected.filter((date) =>
              inclusive
                ? date.epochNanoseconds >= target.epochNanoseconds && date.epochNanoseconds <= end.epochNanoseconds
                : date.epochNanoseconds > target.epochNanoseconds && date.epochNanoseconds < end.epochNanoseconds,
            );
            check(
              'between',
              `${target} .. ${end}, inclusive=${inclusive}`,
              () => keys(rule.between(target, end, inclusive)),
              keys(window),
            );
          }
          check(
            'matches',
            target.toString(),
            () => rule.matches(target),
            expected.some((date) => date.epochNanoseconds === target.epochNanoseconds),
          );
          const day = target.withTimeZone(options.tzid ?? zone).toPlainDate();
          const dayStart = day.toZonedDateTime(options.tzid ?? zone);
          const dayEnd = dayStart.add({days: 1});
          check(
            'occursOn',
            day.toString(),
            () => rule.occursOn(day),
            expected.some(
              (date) =>
                date.epochNanoseconds >= dayStart.epochNanoseconds && date.epochNanoseconds < dayEnd.epochNanoseconds,
            ),
          );
        }
      }
      expect(found.slice(0, 6), `${found.length} mismatches for ${freq}`).toEqual([]);
    },
    120_000,
  );
});

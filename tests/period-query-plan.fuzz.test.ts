import {writeFileSync} from 'node:fs';
import {RRuleTemporal, type Freq, type RRuleOptions} from '../src';
import {Temporal} from '../src/temporal-impl';

type Options = Extract<RRuleOptions, {freq: Freq}>;
type DateValue = ReturnType<RRuleTemporal['all']>[number];
type QueryPlanPrototype = {getPeriodQueryPlan(): null};

const frequencies: Freq[] = ['SECONDLY', 'MINUTELY', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
const units = ['seconds', 'minutes', 'hours', 'days', 'weeks', 'months', 'years'] as const;
const zones = [
  'UTC',
  'America/Chicago',
  'Europe/Berlin',
  'Australia/Lord_Howe',
  'Pacific/Apia',
  'Africa/Casablanca',
  'Asia/Kolkata',
  '+05:45',
];
const starts = [
  '2024-01-01T09:17:23',
  '2024-01-31T23:30:00',
  '2024-02-29T02:30:00',
  '2024-03-08T02:30:00',
  '2024-10-25T01:30:00',
  '2011-12-27T09:00:00',
  '2023-05-15T12:00:00.250',
];
const weekdays = ['MO', 'TU', 'WE', 'TH', 'FR'];
const rawSeed = Number(process.env.RRULE_PERIOD_FUZZ_SEED ?? 0x5eed7a1);
if (!Number.isSafeInteger(rawSeed)) throw new Error('RRULE_PERIOD_FUZZ_SEED must be a safe integer');
const seed = rawSeed >>> 0;
const cases = Number(process.env.RRULE_PERIOD_FUZZ_CASES ?? 40);
if (!Number.isSafeInteger(cases) || cases < 1) throw new Error('RRULE_PERIOD_FUZZ_CASES must be a positive integer');

function randomSource(initial: number) {
  let state = initial;
  return (maximum: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor((state / 0x100000000) * maximum);
  };
}

/** Evaluate with the period plans disabled: the general engine's aligned query clones. */
function withoutPeriodPlans<T>(operation: () => T): T {
  const spy = vi
    .spyOn(RRuleTemporal.prototype as unknown as QueryPlanPrototype, 'getPeriodQueryPlan')
    .mockReturnValue(null);
  try {
    return operation();
  } finally {
    spy.mockRestore();
  }
}

const key = (date: DateValue | null | undefined) =>
  date ? `${date.epochNanoseconds}/${date.calendarId}/${date.timeZoneId}` : null;
const keys = (dates: DateValue[]) => dates.map(key);
const outcome = (operation: () => unknown) => {
  try {
    return operation();
  } catch (error) {
    return {error: (error as Error).message};
  }
};

const failures: Array<Record<string, unknown>> = [];
let checks = 0;
let planned = 0;

afterAll(() => {
  if (process.env.RRULE_PERIOD_FUZZ_REPORT) {
    writeFileSync(
      process.env.RRULE_PERIOD_FUZZ_REPORT,
      JSON.stringify({seed, casesPerFrequency: cases, checks, planned, failures}, null, 2),
    );
  }
});

describe(`period query plans for rules without COUNT (seed=${seed})`, () => {
  it.each(frequencies)(
    '%s agrees with the general engine and complete generation',
    (freq) => {
      const random = randomSource(seed ^ ((frequencies.indexOf(freq) + 1) * 0x9e3779b1));
      const unit = units[frequencies.indexOf(freq)]!;
      const found: Array<Record<string, unknown>> = [];
      let plannedHere = 0;
      let queriesHere = 0;
      const planSpies = (['tryPeriodNext', 'tryPeriodPrevious', 'tryPeriodBetween'] as const).map((name) => {
        const prototype = RRuleTemporal.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
        const original = prototype[name]!;
        return vi.spyOn(prototype, name).mockImplementation(function (this: unknown, ...args: unknown[]) {
          const result = original.apply(this, args) as {handled: boolean};
          if (result.handled) plannedHere++;
          return result;
        });
      });

      try {
        for (let index = 0; index < cases; index++) {
          const zone = zones[random(zones.length)]!;
          const dtstart = Temporal.ZonedDateTime.from(`${starts[random(starts.length)]}[${zone}]`);
          const interval = 1 + random(4);
          const periods = freq === 'YEARLY' ? 12 : freq === 'MONTHLY' ? 30 : 80;
          const options: Options = {freq, dtstart, interval, cache: index % 2 === 0};
          const shape = index % (freq === 'MONTHLY' || freq === 'YEARLY' ? 10 : 6);
          if (freq === 'DAILY' || freq === 'WEEKLY') {
            if (shape > 0) options.byDay = shape === 1 ? ['MO'] : shape === 2 ? ['SA', 'SU'] : weekdays;
            if (shape > 3) {
              options.byHour = [1, 2, 6, 18];
              options.byMinute = [0, 30];
            }
            if (shape === 5) options.bySecond = [0, 45];
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
              options.byHour = [2, 18];
              options.bySetPos = [1, -1];
            }
            if (shape === 5) options.byMonth = [1, 3, 11];
            if (shape === 6) {
              options.byMonthDay = [29, 30, 31];
              options.bySetPos = [-1];
            }
            if (shape === 7) options.byHour = [9, 21];
            if (shape === 8) {
              options.byMonthDay = [1, 2, 3];
              options.bySetPos = [1, -3];
            }
            if (shape === 9) {
              // Sundays at 02:00 cross DST starts; a skipped one changes the ranking.
              options.byDay = ['SU'];
              options.byHour = [2];
              options.bySetPos = [2, -2];
              if (freq === 'YEARLY') options.byMonth = [3, 4, 9, 10];
            }
            if (freq === 'YEARLY' && shape === 1) options.byMonth = [2, 6, 11];
          } else if (index % 5 === 4) {
            options.byMinute = [0, 17, 45];
          }

          const until = index % 3 === 1 ? dtstart.add({[unit]: Math.floor(periods / 2) * interval}) : undefined;
          options.until = until;
          const horizon = dtstart.add({[unit]: periods * interval});
          const reference = withoutPeriodPlans(() =>
            new RRuleTemporal({...options, until: options.until ?? horizon, cache: false}).all(),
          );
          if (index % 4 === 1 || index % 4 === 2) {
            const extra = dtstart.add({[unit]: interval * 5, nanoseconds: 77});
            options.rDate = [dtstart.subtract({hours: 1}), extra, extra, horizon.add({[unit]: interval})];
            options.exDate = [
              dtstart,
              ...(reference[2] ? [reference[2]] : []),
              ...(reference[7] ? [reference[7]] : []),
              ...(index % 4 === 1 ? [extra] : []),
            ];
          }
          const expected = withoutPeriodPlans(() =>
            new RRuleTemporal({...options, until: options.until ?? horizon, cache: false}).all(),
          );
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
            const got = outcome(actual);
            if (JSON.stringify(got) !== JSON.stringify(wanted)) {
              const failure = {freq, index, operation, target, options: serialized, expected: wanted, actual: got};
              found.push(failure);
              failures.push(failure);
            }
          };

          const targets = [
            dtstart.subtract({[unit]: interval, nanoseconds: 1}),
            dtstart,
            dtstart.add({[unit]: interval * (1 + random(periods - 2))}).subtract({minutes: random(90)}),
            dtstart.add({[unit]: interval * (1 + random(periods - 2)), seconds: random(7_200)}),
            ...(expected.length > 2
              ? [
                  expected[random(expected.length - 1)]!,
                  expected[random(expected.length - 1)]!.add({nanoseconds: 1}),
                  expected[random(expected.length - 1)]!.subtract({nanoseconds: 1}),
                ]
              : []),
            ...(until ? [until, until.add({[unit]: interval * 3})] : []),
          ];
          for (const target of targets) {
            // Stay well inside the enumerated horizon, where an unbounded rule's
            // answers are fully determined by `expected`.
            const withinHorizon =
              options.until !== undefined ||
              target.epochNanoseconds < horizon.subtract({[unit]: interval * 4}).epochNanoseconds;
            for (const inclusive of [false, true]) {
              queriesHere += 3;
              // Record which queries a plan answered; the rest are the general
              // engine's own results, which the checks below do not re-audit.
              const answered = () => {
                const before = plannedHere;
                return (operation: () => unknown) => {
                  const result = outcome(operation);
                  return {result, planned: plannedHere > before};
                };
              };
              const next = answered()(() => key(rule.next(target, inclusive)));
              const previous = answered()(() => key(rule.previous(target, inclusive)));
              const end = target.add({[unit]: interval * (1 + random(3)), nanoseconds: random(2) ? 1 : 0});
              const between = answered()(() => keys(rule.between(target, end, inclusive)));
              check(
                'next',
                `${target}, inclusive=${inclusive}`,
                () => next.result,
                withoutPeriodPlans(() => outcome(() => key(rule.next(target, inclusive)))),
              );
              check(
                'previous',
                `${target}, inclusive=${inclusive}`,
                () => previous.result,
                withoutPeriodPlans(() => outcome(() => key(rule.previous(target, inclusive)))),
              );
              check(
                'between',
                `${target} .. ${end}, inclusive=${inclusive}`,
                () => between.result,
                withoutPeriodPlans(() => outcome(() => keys(rule.between(target, end, inclusive)))),
              );
              if (!withinHorizon) continue;
              const after = expected.find((date) =>
                inclusive
                  ? date.epochNanoseconds >= target.epochNanoseconds
                  : date.epochNanoseconds > target.epochNanoseconds,
              );
              const before = expected.findLast((date) =>
                inclusive
                  ? date.epochNanoseconds <= target.epochNanoseconds
                  : date.epochNanoseconds < target.epochNanoseconds,
              );
              // Without UNTIL, the next instant may lie beyond the enumerated horizon.
              if (next.planned && (after || options.until)) {
                check('next vs generation', `${target}, inclusive=${inclusive}`, () => next.result, key(after));
              }
              if (previous.planned) {
                check(
                  'previous vs generation',
                  `${target}, inclusive=${inclusive}`,
                  () => previous.result,
                  key(before),
                );
              }
              if (between.planned && end.epochNanoseconds < horizon.epochNanoseconds) {
                check(
                  'between vs generation',
                  `${target} .. ${end}, inclusive=${inclusive}`,
                  () => between.result,
                  keys(
                    expected.filter((date) =>
                      inclusive
                        ? date.epochNanoseconds >= target.epochNanoseconds &&
                          date.epochNanoseconds <= end.epochNanoseconds
                        : date.epochNanoseconds > target.epochNanoseconds &&
                          date.epochNanoseconds < end.epochNanoseconds,
                    ),
                  ),
                );
              }
            }
            check(
              'matches',
              target.toString(),
              () => rule.matches(target),
              withoutPeriodPlans(() => outcome(() => rule.matches(target))),
            );
          }
        }
      } finally {
        planSpies.forEach((spy) => spy.mockRestore());
      }
      planned += plannedHere;
      expect(found.slice(0, 6), `${found.length} mismatches for ${freq}`).toEqual([]);
      // The plans must actually answer a substantial share of these queries.
      expect(plannedHere, `${freq} queries answered by period plans`).toBeGreaterThan(queriesHere / 4);
    },
    180_000,
  );
});

import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {RRuleTemporal, type RRuleOptions} from '../src';
import {Temporal} from '../src/temporal-impl';

type InspectableRule = RRuleTemporal & {
  numericQueryPlanCache?: {kind: string} | null;
};

const range = (start: number, end: number) => Array.from({length: end - start + 1}, (_, index) => start + index);
const keys = (values: Temporal.ZonedDateTime[]) => values.map((value) => value.toString());

/** Calls of the generators that build a whole MONTHLY or YEARLY period's candidates. */
function countPeriodMaterializations(rule: RRuleTemporal) {
  const counter = {calls: 0};
  const inspectable = rule as unknown as Record<string, (...args: unknown[]) => number[]>;
  for (const name of ['generateYearlyOccurrenceEpochsUtc', 'generateMonthlyOccurrenceEpochsUtc']) {
    const generate = inspectable[name]!;
    inspectable[name] = function (this: RRuleTemporal, ...args: unknown[]) {
      counter.calls += 1;
      return generate.apply(this, args);
    };
  }
  return counter;
}

/** The rule's occurrences from the general engine: no fast path, and a budget that keeps it off the numeric plan. */
function generalEngineOccurrences(options: RRuleOptions): Temporal.ZonedDateTime[] {
  const prototype = RRuleTemporal.prototype as unknown as {allUtcFastPath(): null; allTzEpochFastPath(): null};
  const spies = [
    vi.spyOn(prototype, 'allUtcFastPath').mockReturnValue(null),
    vi.spyOn(prototype, 'allTzEpochFastPath').mockReturnValue(null),
  ];
  try {
    return new RRuleTemporal({...options, maxCandidateEvaluations: 1_000_001} as RRuleOptions).all();
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
}

function expectSameAnswers(options: RRuleOptions, kind: string, probes: Temporal.ZonedDateTime[]) {
  const rule = new RRuleTemporal(options);
  const materializations = countPeriodMaterializations(rule);
  const occurrences = generalEngineOccurrences(options);
  const instants = occurrences.map((value) => value.epochNanoseconds);
  const first = occurrences[0]!;
  const last = occurrences.at(-1)!;
  const within = (from: bigint, to: bigint, inclusive: boolean) =>
    occurrences.filter((value) =>
      inclusive
        ? value.epochNanoseconds >= from && value.epochNanoseconds <= to
        : value.epochNanoseconds > from && value.epochNanoseconds < to,
    );

  expect(keys(rule.between(first.subtract({days: 1}), last.add({days: 1}), true))).toEqual(keys(occurrences));
  const sampled = occurrences.filter((_, index) => index % 499 === 0);
  for (const probe of [...probes, first, last, ...sampled, ...sampled.map((value) => value.add({seconds: 1}))]) {
    const at = probe.epochNanoseconds;
    for (const inclusive of [false, true]) {
      const next = occurrences.find((value) =>
        inclusive ? value.epochNanoseconds >= at : value.epochNanoseconds > at,
      );
      const previous = occurrences.findLast((value) =>
        inclusive ? value.epochNanoseconds <= at : value.epochNanoseconds < at,
      );
      expect(rule.next(probe, inclusive)?.toString()).toBe(next?.toString());
      expect(rule.previous(probe, inclusive)?.toString()).toBe(previous?.toString());
    }
    expect(rule.matches(probe)).toBe(instants.includes(at));
    const day = probe.toPlainDate();
    expect(rule.occursOn(day)).toBe(occurrences.some((value) => value.toPlainDate().equals(day)));
    const from = probe.subtract({hours: 3});
    const to = probe.add({hours: 3});
    expect(keys(rule.between(from, to, false))).toEqual(
      keys(within(from.epochNanoseconds, to.epochNanoseconds, false)),
    );
  }

  expect((rule as InspectableRule).numericQueryPlanCache?.kind).toBe(kind);
  expect(materializations.calls).toBe(0);
}

describe('numeric plans that never materialize a period', () => {
  test('many dense rules of every frequency keep their plans in a 64 MiB heap', () => {
    // Holding each period's candidates takes tens of megabytes per rule for these.
    const fixture = fileURLToPath(new URL('./fixtures/many-dense-rules-child.mjs', import.meta.url));
    const output = execFileSync(process.execPath, ['--max-old-space-size=64', fixture, '8'], {
      encoding: 'utf8',
      timeout: 20_000,
    });

    expect(output).toBe('32');
  });

  test.each([
    [
      'YEARLY in UTC',
      {
        freq: 'YEARLY',
        count: 6_000,
        byMonthDay: [1, 15, -1],
        byHour: range(0, 23),
        byMinute: [0, 20, 40],
        dtstart: Temporal.ZonedDateTime.from('2025-03-15T07:20:00+00:00[UTC]'),
      },
      'yearly',
    ],
    [
      'YEARLY with BYSETPOS in Europe/Berlin',
      {
        freq: 'YEARLY',
        count: 300,
        byMonth: [1, 6, 7, 11],
        byDay: ['MO', 'FR'],
        byHour: [0, 9, 13, 23],
        byMinute: [0, 30],
        bySetPos: [1, 2, -1, -40, 77, 300],
        tzid: 'Europe/Berlin',
        dtstart: Temporal.ZonedDateTime.from('2024-06-03T13:30:00+02:00[Europe/Berlin]'),
      },
      'yearly',
    ],
    [
      'YEARLY with an ordinal weekday of the year',
      {
        freq: 'YEARLY',
        count: 400,
        interval: 3,
        byDay: ['20TU', '-1SU', '53TH'],
        byHour: range(10, 15),
        byMinute: [0, 45],
        dtstart: Temporal.ZonedDateTime.from('2026-01-01T00:00:00+00:00[UTC]'),
      },
      'yearly',
    ],
    [
      'MONTHLY with BYSETPOS and UNTIL in America/New_York',
      {
        freq: 'MONTHLY',
        count: 5_000,
        interval: 2,
        byDay: ['MO', 'TU', 'WE', 'TH', 'FR'],
        byHour: [8, 12, 17],
        byMinute: [0, 15, 30, 45],
        bySetPos: [1, 3, -1, -2, 100],
        until: Temporal.ZonedDateTime.from('2060-01-01T00:00:00+00:00[UTC]'),
        tzid: 'America/New_York',
        dtstart: Temporal.ZonedDateTime.from('2025-01-14T12:30:00-05:00[America/New_York]'),
      },
      'monthly',
    ],
    [
      'MONTHLY across the end of the month',
      {
        freq: 'MONTHLY',
        count: 8_000,
        byMonthDay: [-3, -2, -1, 1, 29, 30, 31],
        byHour: range(0, 23),
        byMinute: [0, 30],
        dtstart: Temporal.ZonedDateTime.from('2024-01-30T11:30:00+00:00[UTC]'),
      },
      'monthly',
    ],
    [
      'WEEKLY in Australia/Lord_Howe',
      {
        freq: 'WEEKLY',
        count: 3_000,
        byDay: ['SU', 'WE'],
        byHour: [0, 5, 12, 23],
        byMinute: [0, 10, 59],
        wkst: 'TH',
        tzid: 'Australia/Lord_Howe',
        dtstart: Temporal.ZonedDateTime.from('2025-04-06T12:10:00+10:30[Australia/Lord_Howe]'),
      },
      'weekly',
    ],
    [
      'DAILY with weekdays',
      {
        freq: 'DAILY',
        count: 8_000,
        interval: 3,
        byDay: ['MO', 'SA', 'SU'],
        byHour: [1, 13, 22],
        byMinute: range(0, 59).filter((minute) => minute % 7 === 0),
        dtstart: Temporal.ZonedDateTime.from('2025-02-02T13:14:00+00:00[UTC]'),
      },
      'daily',
    ],
  ] as const)('%s answers like the general engine', (_name, options, kind) => {
    const dtstart = options.dtstart;
    expectSameAnswers(options as unknown as RRuleOptions, kind, [
      dtstart.subtract({seconds: 1}),
      dtstart.add({days: 40, minutes: 7}),
      dtstart.add({years: 2, hours: 5}),
    ]);
  });

  test('a dense YEARLY BYSETPOS rule selects from its plan', () => {
    // About 1.5 million candidates a year, but BYSETPOS keeps 500 of them.
    const options = {
      freq: 'YEARLY',
      count: 1_500,
      byMonthDay: range(1, 31),
      byHour: range(0, 23),
      byMinute: range(0, 3),
      bySecond: range(0, 14),
      bySetPos: range(1, 500),
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00+00:00[UTC]'),
    } as RRuleOptions;
    const rule = new RRuleTemporal(options);
    const materializations = countPeriodMaterializations(rule);
    const window = rule.between(new Date('2025-01-01T00:00:00Z'), new Date('2030-01-01T00:00:00Z'), true);

    expect(window).toHaveLength(1_500);
    expect(window.at(-1)?.toString()).toBe('2027-01-01T08:01:04+00:00[UTC]');
    expect(keys(window)).toEqual(keys(generalEngineOccurrences(options)));
    expect((rule as InspectableRule).numericQueryPlanCache?.kind).toBe('yearly');
    expect(materializations.calls).toBe(0);
  });
});

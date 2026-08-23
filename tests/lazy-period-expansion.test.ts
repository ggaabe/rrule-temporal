import {RRuleTemporal, type RRuleOptions} from '../src';
import {Temporal} from '../src/temporal-impl';

const hours = Array.from({length: 24}, (_, value) => value);
const minutes = Array.from({length: 60}, (_, value) => value);
const seconds = Array.from({length: 60}, (_, value) => value);
const months = Array.from({length: 12}, (_, value) => value + 1);
const monthDays = Array.from({length: 31}, (_, value) => value + 1);

function denseYearlyOptions(overrides: Partial<RRuleOptions> = {}): RRuleOptions {
  return {
    freq: 'YEARLY',
    dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
    byMonth: months,
    byMonthDay: monthDays,
    byHour: hours,
    byMinute: minutes,
    bySecond: seconds,
    ...overrides,
  } as RRuleOptions;
}

function strings(values: ReturnType<RRuleTemporal['all']>): string[] {
  return values.map((value) => value.toString());
}

describe('bounded lazy recurrence-period expansion', () => {
  test('dense YEARLY COUNT rules stop at the first required time slots', () => {
    const first = new RRuleTemporal(denseYearlyOptions({count: 1, maxCandidateEvaluations: 1})).all();
    expect(strings(first)).toEqual(['2025-01-01T00:00:00+00:00[UTC]']);

    const firstThree = new RRuleTemporal(denseYearlyOptions({count: 3, maxCandidateEvaluations: 3})).all();
    expect(strings(firstThree)).toEqual([
      '2025-01-01T00:00:00+00:00[UTC]',
      '2025-01-01T00:00:01+00:00[UTC]',
      '2025-01-01T00:00:02+00:00[UTC]',
    ]);
  });

  test('between() skips whole dates and earlier wall-clock slots in a narrow dense window', () => {
    const rule = new RRuleTemporal(denseYearlyOptions({maxCandidateEvaluations: 4}));
    const results = rule.between(
      Temporal.ZonedDateTime.from('2025-06-15T12:00:00[UTC]'),
      Temporal.ZonedDateTime.from('2025-06-15T12:00:03[UTC]'),
      true,
    );

    expect(strings(results)).toEqual([
      '2025-06-15T12:00:00+00:00[UTC]',
      '2025-06-15T12:00:01+00:00[UTC]',
      '2025-06-15T12:00:02+00:00[UTC]',
      '2025-06-15T12:00:03+00:00[UTC]',
    ]);
  });

  test('the first matching dense occurrence may be on a different date than DTSTART', () => {
    const results = new RRuleTemporal(
      denseYearlyOptions({
        dtstart: Temporal.ZonedDateTime.from('2025-01-15T09:00:00[UTC]'),
        byMonth: [2],
        byMonthDay: [1],
        count: 1,
        maxCandidateEvaluations: 1,
      }),
    ).all();

    expect(strings(results)).toEqual(['2025-02-01T00:00:00+00:00[UTC]']);
  });

  test('positive, negative, and mixed BYSETPOS use bounded directional passes', () => {
    const positive = new RRuleTemporal(
      denseYearlyOptions({bySetPos: [1, 3, 10], count: 3, maxCandidateEvaluations: 10}),
    ).all();
    expect(strings(positive)).toEqual([
      '2025-01-01T00:00:00+00:00[UTC]',
      '2025-01-01T00:00:02+00:00[UTC]',
      '2025-01-01T00:00:09+00:00[UTC]',
    ]);

    const negative = new RRuleTemporal(
      denseYearlyOptions({bySetPos: [-1, -3], count: 2, maxCandidateEvaluations: 3}),
    ).all();
    expect(strings(negative)).toEqual(['2025-12-31T23:59:57+00:00[UTC]', '2025-12-31T23:59:59+00:00[UTC]']);

    const mixed = new RRuleTemporal(
      denseYearlyOptions({bySetPos: [1, -1], count: 2, maxCandidateEvaluations: 2}),
    ).all();
    expect(strings(mixed)).toEqual(['2025-01-01T00:00:00+00:00[UTC]', '2025-12-31T23:59:59+00:00[UTC]']);
  });

  test('BYSETPOS ranking is period-local and precedes query-window filtering', () => {
    const rule = new RRuleTemporal(denseYearlyOptions({bySetPos: [1, -1], maxCandidateEvaluations: 2}));
    const results = rule.between(
      Temporal.ZonedDateTime.from('2025-06-01T00:00:00[UTC]'),
      Temporal.ZonedDateTime.from('2025-12-31T23:59:59[UTC]'),
      true,
    );

    expect(strings(results)).toEqual(['2025-12-31T23:59:59+00:00[UTC]']);
  });

  test('raw time duplicates and resolved date aliases do not receive COUNT credit', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      count: 2,
      byYearDay: [1, -365, 1],
      byHour: [0, 0],
      byMinute: [0, 0],
      bySecond: [0, 0],
      bySetPos: [1, 2],
      maxCandidateEvaluations: 2,
    });

    expect(strings(rule.all())).toEqual(['2025-01-01T00:00:00+00:00[UTC]', '2026-01-01T00:00:00+00:00[UTC]']);
    expect(rule.options().byHour).toEqual([0]);
    expect(rule.options().byYearDay).toEqual([1, -365]);
  });

  test('exact duplicates across adjacent generated years do not receive COUNT credit', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byYearDay: [-1],
      byWeekNo: [1],
      byDay: ['MO'],
      dtstart: Temporal.ZonedDateTime.from('2018-01-01T00:00:00[UTC]'),
    });

    expect(strings(rule.all())).toEqual([
      '2018-01-01T00:00:00+00:00[UTC]',
      '2018-12-31T00:00:00+00:00[UTC]',
      '2019-12-31T00:00:00+00:00[UTC]',
    ]);
  });

  test('COUNT=0, RDATE, EXDATE, and includeDtstart keep recurrence-set semantics', () => {
    const start = Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]');
    const rDate = Temporal.ZonedDateTime.from('2025-06-01T00:00:00[UTC]');

    const countZero = new RRuleTemporal(denseYearlyOptions({count: 0, rDate: [rDate]}));
    expect(strings(countZero.all())).toEqual([rDate.toString()]);

    const excluded = new RRuleTemporal(denseYearlyOptions({count: 1, exDate: [start]}));
    expect(excluded.all()).toEqual([]);

    const includedStart = new RRuleTemporal(
      denseYearlyOptions({
        count: 1,
        includeDtstart: true,
        byMonth: [2],
        byMonthDay: [1],
        maxCandidateEvaluations: 1,
      }),
    );
    expect(strings(includedStart.all())).toEqual([start.toString()]);
  });

  test('UNTIL and iterator termination propagate into the time cursor', () => {
    const until = new RRuleTemporal(
      denseYearlyOptions({
        until: Temporal.ZonedDateTime.from('2025-01-01T00:00:02[UTC]'),
        maxCandidateEvaluations: 3,
      }),
    );
    expect(strings(until.all())).toEqual([
      '2025-01-01T00:00:00+00:00[UTC]',
      '2025-01-01T00:00:01+00:00[UTC]',
      '2025-01-01T00:00:02+00:00[UTC]',
    ]);

    const iterated = new RRuleTemporal(denseYearlyOptions({maxCandidateEvaluations: 2})).all(
      (_date, index) => index === 0,
    );
    expect(strings(iterated)).toEqual(['2025-01-01T00:00:00+00:00[UTC]']);
  });

  test('BYYEARDAY, BYWEEKNO, ISO spillovers, and ordinal BYDAY retain date semantics', () => {
    const futureLeapMatch = new RRuleTemporal({
      freq: 'YEARLY',
      count: 1,
      byYearDay: [366],
      byWeekNo: [1],
      dtstart: Temporal.ZonedDateTime.from('2023-01-01T00:00:00[UTC]'),
    });
    expect(futureLeapMatch.all()).not.toEqual([]);

    const spillover = new RRuleTemporal({
      freq: 'YEARLY',
      byWeekNo: [1],
      byDay: ['MO'],
      until: Temporal.ZonedDateTime.from('2018-12-31T23:59:59[UTC]'),
      dtstart: Temporal.ZonedDateTime.from('2018-01-01T00:00:00[UTC]'),
    });
    expect(strings(spillover.all())).toContain('2018-12-31T00:00:00+00:00[UTC]');

    const ordinal = new RRuleTemporal({
      freq: 'YEARLY',
      count: 1,
      byDay: ['-1FR'],
      byHour: [12],
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
    });
    expect(strings(ordinal.all())).toEqual(['2025-12-26T12:00:00+00:00[UTC]']);
  });

  test('Gregorian SKIP and dedicated non-Gregorian RSCALE routing are preserved', () => {
    const gregorian = new RRuleTemporal({
      rruleString:
        'DTSTART:20170101T000000Z\nRRULE:RSCALE=GREGORIAN;SKIP=BACKWARD;FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29;COUNT=1',
    });
    expect(strings(gregorian.all())).toEqual(['2017-02-28T00:00:00+00:00[UTC]']);

    const denseGregorian = new RRuleTemporal(
      denseYearlyOptions({
        rscale: 'GREGORIAN',
        skip: 'OMIT',
        count: 1,
        maxCandidateEvaluations: 1,
      }),
    );
    expect(strings(denseGregorian.all())).toEqual(['2025-01-01T00:00:00+00:00[UTC]']);

    const hebrewOne = new RRuleTemporal({
      rruleString:
        'DTSTART:20250101T000000Z\nRRULE:RSCALE=HEBREW;FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1;BYHOUR=0,1;COUNT=1',
    }).all();
    const hebrewTwo = new RRuleTemporal({
      rruleString:
        'DTSTART:20250101T000000Z\nRRULE:RSCALE=HEBREW;FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1;BYHOUR=0,1;COUNT=2',
    }).all();
    expect(hebrewOne).toHaveLength(1);
    expect(hebrewOne[0]?.epochNanoseconds).toBe(hebrewTwo[0]?.epochNanoseconds);

    const denseHebrew = new RRuleTemporal({
      freq: 'YEARLY',
      rscale: 'HEBREW',
      count: 1,
      byMonth: [1],
      byMonthDay: [1],
      byHour: hours,
      byMinute: minutes,
      bySecond: seconds,
      maxCandidateEvaluations: 1,
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
    });
    expect(denseHebrew.all()).toHaveLength(1);
  });

  test('named-zone transition days use a bounded per-day ordering fallback', () => {
    const spring = new RRuleTemporal({
      freq: 'YEARLY',
      count: 4,
      byMonth: [3],
      byMonthDay: [9],
      byHour: [0, 1, 2, 3],
      byMinute: [30],
      bySecond: [0],
      maxCandidateEvaluations: 5,
      dtstart: Temporal.ZonedDateTime.from('2025-03-09T00:00:00[America/Chicago]'),
    });
    expect(strings(spring.all())).toEqual([
      '2025-03-09T00:30:00-06:00[America/Chicago]',
      '2025-03-09T01:30:00-06:00[America/Chicago]',
      '2025-03-09T03:30:00-05:00[America/Chicago]',
      '2026-03-09T00:30:00-05:00[America/Chicago]',
    ]);

    const fall = new RRuleTemporal({
      freq: 'YEARLY',
      count: 4,
      byMonth: [11],
      byMonthDay: [2],
      byHour: [0, 1, 2, 3],
      byMinute: [30],
      bySecond: [0],
      maxCandidateEvaluations: 4,
      dtstart: Temporal.ZonedDateTime.from('2025-11-02T00:00:00[America/Chicago]'),
    });
    expect(strings(fall.all())).toEqual([
      '2025-11-02T00:30:00-05:00[America/Chicago]',
      '2025-11-02T01:30:00-05:00[America/Chicago]',
      '2025-11-02T02:30:00-06:00[America/Chicago]',
      '2025-11-02T03:30:00-06:00[America/Chicago]',
    ]);
  });

  test('large intervals stop safely at Temporal representable-range boundaries', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      interval: 300_001,
      count: 2,
      byMonth: [1],
      byMonthDay: [1],
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
    });
    expect(strings(rule.all())).toEqual(['2025-01-01T00:00:00+00:00[UTC]']);
  });
});

describe('other dense calendar periods', () => {
  test('MONTHLY expansion also streams COUNT and narrow between() results', () => {
    const options = {
      freq: 'MONTHLY' as const,
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      byMonthDay: monthDays,
      byHour: hours,
      byMinute: minutes,
      bySecond: seconds,
    };

    const counted = new RRuleTemporal({...options, count: 2, maxCandidateEvaluations: 2});
    expect(strings(counted.all())).toEqual(['2025-01-01T00:00:00+00:00[UTC]', '2025-01-01T00:00:01+00:00[UTC]']);

    const windowed = new RRuleTemporal({...options, maxCandidateEvaluations: 2});
    expect(
      strings(
        windowed.between(
          Temporal.ZonedDateTime.from('2025-06-15T12:00:00[UTC]'),
          Temporal.ZonedDateTime.from('2025-06-15T12:00:01[UTC]'),
          true,
        ),
      ),
    ).toEqual(['2025-06-15T12:00:00+00:00[UTC]', '2025-06-15T12:00:01+00:00[UTC]']);
  });
});

describe('frozen eager-yearly semantic oracle', () => {
  test.each([
    {
      name: 'month/day selectors in an IANA zone',
      options: {
        freq: 'YEARLY' as const,
        count: 8,
        interval: 2,
        byMonth: [1, 2, 12],
        byMonthDay: [1, -1],
        byHour: [0, 12],
        byMinute: [5],
        bySecond: [10, 40],
        dtstart: Temporal.ZonedDateTime.from('2023-02-10T06:00:00[America/Chicago]'),
      },
      expected: [
        '2023-02-28T00:05:10-06:00[America/Chicago]',
        '2023-02-28T00:05:40-06:00[America/Chicago]',
        '2023-02-28T12:05:10-06:00[America/Chicago]',
        '2023-02-28T12:05:40-06:00[America/Chicago]',
        '2023-12-01T00:05:10-06:00[America/Chicago]',
        '2023-12-01T00:05:40-06:00[America/Chicago]',
        '2023-12-01T12:05:10-06:00[America/Chicago]',
        '2023-12-01T12:05:40-06:00[America/Chicago]',
      ],
    },
    {
      name: 'ordinal BYDAY with mixed positional selection',
      options: {
        freq: 'YEARLY' as const,
        count: 6,
        byDay: ['1MO', '-1FR'],
        byHour: [8, 16],
        byMinute: [30],
        bySecond: [0],
        bySetPos: [1, 3, -1],
        dtstart: Temporal.ZonedDateTime.from('2024-01-01T00:00:00[UTC]'),
      },
      expected: [
        '2024-01-01T08:30:00+00:00[UTC]',
        '2024-12-27T08:30:00+00:00[UTC]',
        '2024-12-27T16:30:00+00:00[UTC]',
        '2025-01-06T08:30:00+00:00[UTC]',
        '2025-12-26T08:30:00+00:00[UTC]',
        '2025-12-26T16:30:00+00:00[UTC]',
      ],
    },
    {
      name: 'positive and negative BYYEARDAY across a leap year',
      options: {
        freq: 'YEARLY' as const,
        count: 6,
        byYearDay: [60, -1],
        byHour: [9],
        byMinute: [15],
        bySecond: [5],
        dtstart: Temporal.ZonedDateTime.from('2023-01-01T00:00:00[UTC]'),
      },
      expected: [
        '2023-03-01T09:15:05+00:00[UTC]',
        '2023-12-31T09:15:05+00:00[UTC]',
        '2024-02-29T09:15:05+00:00[UTC]',
        '2024-12-31T09:15:05+00:00[UTC]',
        '2025-03-01T09:15:05+00:00[UTC]',
        '2025-12-31T09:15:05+00:00[UTC]',
      ],
    },
    {
      name: 'positive and negative ISO weeks in an IANA zone',
      options: {
        freq: 'YEARLY' as const,
        count: 6,
        byWeekNo: [1, -1],
        byDay: ['MO', 'SU'],
        byHour: [7],
        byMinute: [0],
        bySecond: [0],
        dtstart: Temporal.ZonedDateTime.from('2022-06-01T00:00:00[America/Chicago]'),
      },
      expected: [
        '2022-12-26T07:00:00-06:00[America/Chicago]',
        '2023-01-01T07:00:00-06:00[America/Chicago]',
        '2023-01-02T07:00:00-06:00[America/Chicago]',
        '2023-01-08T07:00:00-06:00[America/Chicago]',
        '2023-12-25T07:00:00-06:00[America/Chicago]',
        '2023-12-31T07:00:00-06:00[America/Chicago]',
      ],
    },
  ])('$name', ({options, expected}) => {
    expect(strings(new RRuleTemporal(options).all())).toEqual(expected);
  });
});

import {describe, expect, it} from 'vitest';
import {RRuleTemporal} from '../src/index';
import {Temporal} from '../src/temporal-impl';

const local = (dates: Temporal.ZonedDateTime[]) => dates.map((date) => date.toPlainDateTime().toString());
const zoned = (date: string, zone = 'UTC') => Temporal.ZonedDateTime.from(`${date}[${zone}]`);

// These expectations come from calendar fields, not another generator path.
const dateCases = [
  {
    name: 'monthly day 31',
    start: '2024-01-31',
    rule: 'FREQ=MONTHLY',
    expected: ['2024-01-31', '2024-03-31', '2024-05-31'],
  },
  {
    name: 'monthly interval phase',
    start: '2024-07-31',
    rule: 'FREQ=MONTHLY;INTERVAL=2',
    expected: ['2024-07-31', '2025-01-31', '2025-03-31'],
  },
  {
    name: 'annual leap day',
    start: '2024-02-29',
    rule: 'FREQ=YEARLY',
    expected: ['2024-02-29', '2028-02-29', '2032-02-29'],
  },
  {
    name: 'annual interval phase',
    start: '2024-02-29',
    rule: 'FREQ=YEARLY;INTERVAL=3',
    expected: ['2024-02-29', '2036-02-29', '2048-02-29'],
  },
  {
    name: 'Gregorian century',
    start: '2096-02-29',
    rule: 'FREQ=YEARLY',
    expected: ['2096-02-29', '2104-02-29', '2108-02-29'],
  },
  {
    name: 'annual BYMONTH implicit day',
    start: '2024-01-31',
    rule: 'FREQ=YEARLY;BYMONTH=2,3',
    expected: ['2024-03-31', '2025-03-31', '2026-03-31'],
  },
  {
    name: 'monthly BYMONTH interval filter',
    start: '2024-01-31',
    rule: 'FREQ=MONTHLY;INTERVAL=2;BYMONTH=2,3,7',
    expected: ['2024-03-31', '2024-07-31', '2025-03-31'],
  },
  {
    name: 'explicit last day',
    start: '2024-01-31',
    rule: 'FREQ=MONTHLY;BYMONTHDAY=-1',
    expected: ['2024-01-31', '2024-02-29', '2024-03-31'],
  },
];

describe('invalid inherited dates are omitted (issue #140)', () => {
  for (const zone of ['UTC', 'America/New_York']) {
    it.each(dateCases)(`$name in ${zone}`, ({start, rule: expression, expected}) => {
      const dtstart = zoned(`${start}T09:15:00`, zone);
      const expectedDates = expected.map((date) => zoned(`${date}T09:15:00`, zone));
      for (const count of [3, undefined]) {
        const rule = new RRuleTemporal({
          dtstart,
          rruleString: expression,
          count,
          until: count ? undefined : expectedDates.at(-1),
        });
        expect(local(rule.all())).toEqual(local(expectedDates));
        expect(local(rule.all(() => true))).toEqual(local(expectedDates));
        for (let index = 0; index < expectedDates.length; index++) {
          const date = expectedDates[index]!;
          expect(rule.next(date, true)?.toString()).toBe(date.toString());
          expect(rule.previous(date, true)?.toString()).toBe(date.toString());
          expect(rule.matches(date)).toBe(true);
          expect(rule.occursOn(date.toPlainDate())).toBe(true);
          expect(local(rule.between(date, expectedDates.at(-1)!, true))).toEqual(local(expectedDates.slice(index)));
        }
      }
    });
  }

  it.each(['OMIT', 'BACKWARD', 'FORWARD'])('retains explicit RFC 7529 SKIP=%s', (skip) => {
    const expected =
      skip === 'OMIT'
        ? ['2024-01-31', '2024-03-31', '2024-05-31']
        : skip === 'BACKWARD'
          ? ['2024-01-31', '2024-02-29', '2024-03-31']
          : ['2024-01-31', '2024-03-01', '2024-03-31'];
    const rule = new RRuleTemporal({
      rruleString: `DTSTART:20240131T000000Z\nRRULE:FREQ=MONTHLY;RSCALE=GREGORIAN;SKIP=${skip};COUNT=3`,
    });
    expect(local(rule.all())).toEqual(expected.map((date) => `${date}T00:00:00`));
  });

  it('seeks from decades-old month ends without replaying history or changing the day', () => {
    const rule = new RRuleTemporal({freq: 'MONTHLY', dtstart: zoned('1970-01-31T00:00'), maxIterations: 20});
    const query = zoned('2026-09-29T00:00');
    expect(rule.next(query)?.toPlainDate().toString()).toBe('2026-10-31');
    expect(rule.previous(query)?.toPlainDate().toString()).toBe('2026-08-31');
    expect(local(rule.between(query, zoned('2026-11-30T00:00')))).toEqual(['2026-10-31T00:00:00']);
  });

  it.each(['UTC', 'America/New_York'])('stops an empty monthly fast-path rule at UNTIL in %s', (zone) => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      dtstart: zoned('2024-01-31T09:00', zone),
      interval: 4,
      byDay: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'],
      byMonth: [2, 3, 10, 12],
      bySetPos: [1, -1],
      until: zoned('2024-12-31T23:59', zone),
      maxIterations: 4,
    });
    expect(rule.all()).toEqual([]);
    expect(rule.all(() => true)).toEqual([]);
    expect(rule.next(zoned('2024-02-01T00:00', zone))).toBeNull();
  });

  it.each(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const)('%s queries honor a custom candidate budget', (freq) => {
    for (const zone of ['UTC', 'America/New_York']) {
      const dtstart = zoned('2024-01-31T09:00', zone);
      const rule = new RRuleTemporal({freq, dtstart, count: 3, maxCandidateEvaluations: 2, exDate: [dtstart]});
      expect(() => rule.all()).toThrow('Maximum candidate evaluations (2) exceeded');
      expect(() => rule.previous(zoned('2030-01-01T00:00', zone))).toThrow(
        'Maximum candidate evaluations (2) exceeded',
      );
    }
  });
});

const gapCases = [
  {
    name: 'daily',
    zone: 'America/New_York',
    start: '2024-03-09T02:30',
    rule: 'FREQ=DAILY',
    expected: ['2024-03-09T02:30', '2024-03-11T02:30', '2024-03-12T02:30'],
  },
  {
    name: 'weekly',
    zone: 'America/New_York',
    start: '2024-03-03T02:30',
    rule: 'FREQ=WEEKLY',
    expected: ['2024-03-03T02:30', '2024-03-17T02:30', '2024-03-24T02:30'],
  },
  {
    name: 'monthly implicit day',
    zone: 'America/New_York',
    start: '2024-02-10T02:30',
    rule: 'FREQ=MONTHLY',
    expected: ['2024-02-10T02:30', '2024-04-10T02:30', '2024-05-10T02:30'],
  },
  {
    name: 'monthly explicit day',
    zone: 'America/New_York',
    start: '2024-02-10T02:30',
    rule: 'FREQ=MONTHLY;BYMONTHDAY=10',
    expected: ['2024-02-10T02:30', '2024-04-10T02:30', '2024-05-10T02:30'],
  },
  {
    name: 'yearly implicit day',
    zone: 'America/New_York',
    start: '2023-03-10T02:30',
    rule: 'FREQ=YEARLY',
    expected: ['2023-03-10T02:30', '2025-03-10T02:30', '2026-03-10T02:30'],
  },
  {
    name: 'yearly expanded day',
    zone: 'America/New_York',
    start: '2023-03-10T02:30',
    rule: 'FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=10',
    expected: ['2023-03-10T02:30', '2025-03-10T02:30', '2026-03-10T02:30'],
  },
  {
    name: 'half-hour transition',
    zone: 'Australia/Lord_Howe',
    start: '2024-10-05T02:15',
    rule: 'FREQ=DAILY',
    expected: ['2024-10-05T02:15', '2024-10-07T02:15', '2024-10-08T02:15'],
  },
  {
    name: 'skipped date interval phase',
    zone: 'Pacific/Apia',
    start: '2011-12-28T12:00',
    rule: 'FREQ=DAILY;INTERVAL=2',
    expected: ['2011-12-28T12:00', '2012-01-01T12:00', '2012-01-03T12:00'],
  },
  {
    name: 'skipped date weekly',
    zone: 'Pacific/Apia',
    start: '2011-12-23T12:00',
    rule: 'FREQ=WEEKLY',
    expected: ['2011-12-23T12:00', '2012-01-06T12:00', '2012-01-13T12:00'],
  },
  {
    name: 'skipped date monthly',
    zone: 'Pacific/Apia',
    start: '2011-11-30T12:00',
    rule: 'FREQ=MONTHLY',
    expected: ['2011-11-30T12:00', '2012-01-30T12:00', '2012-03-30T12:00'],
  },
  {
    name: 'skipped date explicit monthly',
    zone: 'Pacific/Apia',
    start: '2011-11-30T12:00',
    rule: 'FREQ=MONTHLY;BYMONTHDAY=30',
    expected: ['2011-11-30T12:00', '2012-01-30T12:00', '2012-03-30T12:00'],
  },
];

describe('generated gap times are omitted before COUNT and BYSETPOS (issue #141)', () => {
  it.each(gapCases)('$name', ({zone, start, rule: expression, expected}) => {
    const dtstart = zoned(start, zone);
    const expectedDates = expected.map((date) => zoned(date, zone));
    for (const count of [3, undefined]) {
      const rule = new RRuleTemporal({
        dtstart,
        rruleString: expression,
        count,
        until: count ? undefined : expectedDates.at(-1),
      });
      expect(local(rule.all())).toEqual(local(expectedDates));
      expect(local(rule.all(() => true))).toEqual(local(expectedDates));
      for (const date of expectedDates) {
        expect(rule.next(date, true)?.toString()).toBe(date.toString());
        expect(rule.previous(date, true)?.toString()).toBe(date.toString());
      }
      expect(local(rule.between(dtstart, expectedDates.at(-1)!, true))).toEqual(local(expectedDates));
    }
  });

  it.each([1, -1])('ranks monthly positions after omitting a gap: BYSETPOS=%s', (position) => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      dtstart: zoned('2024-03-01T02:30', 'America/New_York'),
      byMonthDay: [10, 11],
      bySetPos: [position],
      count: 1,
    });
    expect(local(rule.all())).toEqual(['2024-03-11T02:30:00']);
  });

  it('does not rank an omitted time slot', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      dtstart: zoned('2024-03-09T00:00', 'America/New_York'),
      byHour: [1, 2, 3],
      byMinute: [30],
      bySetPos: [2],
      count: 3,
    });
    expect(local(rule.all())).toEqual(['2024-03-09T02:30:00', '2024-03-10T03:30:00', '2024-03-11T02:30:00']);
  });

  it('does not invent occurrences or extend COUNT when EXDATE names an omitted gap', () => {
    const rule = new RRuleTemporal({
      rruleString:
        'DTSTART;TZID=America/New_York:20240309T023000\nRRULE:FREQ=DAILY;COUNT=3\nEXDATE;TZID=America/New_York:20240310T023000',
    });
    expect(local(rule.all())).toEqual(['2024-03-09T02:30:00', '2024-03-11T02:30:00', '2024-03-12T02:30:00']);
    expect(rule.matches(zoned('2024-03-10T03:30', 'America/New_York'))).toBe(false);
    expect(rule.occursOn(Temporal.PlainDate.from('2024-03-10'))).toBe(false);
  });

  it('preserves the interpretation of an explicit RDATE in a gap', () => {
    const rule = new RRuleTemporal({
      rruleString:
        'DTSTART;TZID=America/New_York:20240309T023000\nRRULE:FREQ=DAILY;COUNT=3\nRDATE;TZID=America/New_York:20240310T023000',
    });
    const expected = ['2024-03-09T02:30:00', '2024-03-10T03:30:00', '2024-03-11T02:30:00', '2024-03-12T02:30:00'];
    expect(local(rule.all())).toEqual(expected);
    expect(local(rule.all(() => true))).toEqual(expected);
  });

  it('preserves the interpretation of an explicit DTSTART in a gap', () => {
    const rule = new RRuleTemporal({
      rruleString: 'DTSTART;TZID=America/New_York:20240310T023000\nRRULE:FREQ=DAILY;COUNT=2',
    });
    expect(local(rule.all())).toEqual(['2024-03-10T03:30:00', '2024-03-11T03:30:00']);
  });

  it('does not treat an ambiguous fall-back time as nonexistent', () => {
    const rule = new RRuleTemporal({freq: 'DAILY', dtstart: zoned('2024-11-02T01:30', 'America/New_York'), count: 3});
    expect(rule.all().map((date) => date.offset)).toEqual(['-04:00', '-04:00', '-05:00']);
  });

  it.each(['HOURLY', 'MINUTELY', 'SECONDLY'] as const)(
    '%s BYHOUR does not accept or loop on a shifted hour',
    (freq) => {
      const rule = new RRuleTemporal({
        freq,
        dtstart: zoned('2024-03-10T00:00', 'America/New_York'),
        byHour: [2],
        count: 1,
        maxIterations: 20,
      });
      expect(local(rule.all())).toEqual(['2024-03-11T02:00:00']);
    },
  );

  it.each(['HOURLY', 'MINUTELY'] as const)('%s BYMINUTE does not loop on a half-hour gap', (freq) => {
    const rule = new RRuleTemporal({
      freq,
      dtstart: zoned('2024-10-06T00:00', 'Australia/Lord_Howe'),
      byHour: [2],
      byMinute: [15],
      count: 1,
      maxIterations: 20,
    });
    expect(local(rule.all())).toEqual(['2024-10-07T02:15:00']);
  });

  it('filters weekly dates before selecting BYSETPOS', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      dtstart: zoned('2024-02-26T02:30'),
      byDay: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'],
      byMonth: [3],
      bySetPos: [1],
      count: 2,
    });
    expect(local(rule.all())).toEqual(['2024-03-01T02:30:00', '2024-03-04T02:30:00']);
  });

  it('occursOn rejects a skipped date instead of checking the following date', () => {
    const rule = new RRuleTemporal({freq: 'DAILY', dtstart: zoned('2011-12-29T12:00', 'Pacific/Apia'), count: 3});
    expect(rule.occursOn(Temporal.PlainDate.from('2011-12-30'))).toBe(false);
    expect(rule.occursOn(Temporal.PlainDate.from('2011-12-31'))).toBe(true);
  });

  it('occursOn does not extend a day whose midnight was skipped into the next date', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      dtstart: zoned('2018-11-01T00:30', 'America/Sao_Paulo'),
      count: 0,
      rDate: [zoned('2018-11-05T00:30', 'America/Sao_Paulo')],
    });
    expect(rule.occursOn(Temporal.PlainDate.from('2018-11-04'))).toBe(false);
    expect(rule.occursOn(Temporal.PlainDate.from('2018-11-05'))).toBe(true);
  });

  it('preserves valid time slots on an RSCALE date whose inherited time is in a gap', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      rscale: 'INDIAN',
      dtstart: zoned('2024-03-03T02:30', 'America/New_York'),
      byHour: [2, 4],
      bySetPos: [1],
      count: 3,
    });
    expect(local(rule.all())).toEqual(['2024-03-03T02:30:00', '2024-03-10T04:30:00', '2024-03-17T02:30:00']);
  });

  it('retains the partial final RSCALE week through UNTIL', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      rscale: 'INDIAN',
      dtstart: zoned('2024-03-03T02:30', 'America/New_York'),
      until: zoned('2024-03-18T12:00', 'America/New_York'),
      byDay: ['SU', 'MO'],
    });
    expect(local(rule.all())).toEqual([
      '2024-03-03T02:30:00',
      '2024-03-04T02:30:00',
      '2024-03-11T02:30:00',
      '2024-03-17T02:30:00',
      '2024-03-18T02:30:00',
    ]);
  });

  it.each(['OMIT', 'BACKWARD', 'FORWARD'] as const)(
    'applies RSCALE SKIP=%s to an invalid inherited Indian leap day',
    (skip) => {
      const rule = new RRuleTemporal({
        freq: 'YEARLY',
        rscale: 'INDIAN',
        skip,
        dtstart: zoned('2024-04-20T09:00'),
        count: 3,
      });
      const expected =
        skip === 'OMIT'
          ? ['2024-04-20', '2028-04-20', '2032-04-20']
          : skip === 'BACKWARD'
            ? ['2024-04-20', '2025-04-20', '2026-04-20']
            : ['2024-04-20', '2025-04-21', '2026-04-21'];
      expect(local(rule.all())).toEqual(expected.map((date) => `${date}T09:00:00`));
    },
  );
});

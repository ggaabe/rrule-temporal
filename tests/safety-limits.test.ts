import {Temporal} from '../src/temporal-impl';
import {RRuleTemporal} from '../src';

describe('RRuleTemporal - Safety Limits', () => {
  test('all() should throw error when exceeding default maxIterations limit', () => {
    const dtstart = Temporal.ZonedDateTime.from('2025-01-01T10:00:00[UTC]');

    // Create a rule that would generate infinite iterations without safety limits
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      dtstart,
      // No count or until - would run forever without safety limits
    });

    expect(() => {
      rule.all(() => true); // Iterator that never stops
    }).toThrow('Maximum iterations (10000) exceeded in all()');
  });

  test('all() should respect custom maxIterations limit', () => {
    const dtstart = Temporal.ZonedDateTime.from('2025-01-01T10:00:00[UTC]');

    const rule = new RRuleTemporal({
      freq: 'DAILY',
      dtstart,
      maxIterations: 5, // Custom low limit
    });

    expect(() => {
      rule.all(() => true); // Iterator that never stops
    }).toThrow('Maximum iterations (5) exceeded in all()');
  });

  test('between() should throw error when exceeding maxIterations limit', () => {
    const dtstart = Temporal.ZonedDateTime.from('2025-01-01T10:00:00[UTC]');

    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      dtstart,
      maxIterations: 100, // Low limit for testing
    });

    const after = Temporal.ZonedDateTime.from('2025-01-01T10:00:00[UTC]');
    const before = Temporal.ZonedDateTime.from('2030-01-01T10:00:00[UTC]'); // Far future

    expect(() => {
      rule.between(after.toPlainDate().toZonedDateTime('UTC'), before.toPlainDate().toZonedDateTime('UTC'));
    }).toThrow('Maximum iterations (100) exceeded in all()');
  });

  test('all() should work normally within safety limits', () => {
    const dtstart = Temporal.ZonedDateTime.from('2025-01-01T10:00:00[UTC]');

    const rule = new RRuleTemporal({
      freq: 'DAILY',
      dtstart,
      count: 5, // Small count within limits
      maxIterations: 1000,
    });

    const dates = rule.all();
    expect(dates).toHaveLength(5);
    expect(dates[0]?.toString()).toBe('2025-01-01T10:00:00+00:00[UTC]');
    expect(dates[4]?.toString()).toBe('2025-01-05T10:00:00+00:00[UTC]');
  });

  test('between() should work normally within safety limits', () => {
    const dtstart = Temporal.ZonedDateTime.from('2025-01-01T10:00:00[UTC]');

    const rule = new RRuleTemporal({
      freq: 'DAILY',
      dtstart,
      maxIterations: 1000,
    });

    const after = Temporal.ZonedDateTime.from('2025-01-01T10:00:00[UTC]');
    const before = Temporal.ZonedDateTime.from('2025-01-05T10:00:00[UTC]');

    const dates = rule.between(after.toPlainDate().toZonedDateTime('UTC'), before.toPlainDate().toZonedDateTime('UTC'));
    expect(dates).toHaveLength(4); // Includes start date but not end date by default
    expect(dates[0]?.toString()).toBe('2025-01-01T10:00:00+00:00[UTC]');
    expect(dates[3]?.toString()).toBe('2025-01-04T10:00:00+00:00[UTC]');
  });

  test('maxIterations should default to 10000 when not specified', () => {
    const dtstart = Temporal.ZonedDateTime.from('2025-01-01T10:00:00[UTC]');

    const rule = new RRuleTemporal({
      freq: 'DAILY',
      dtstart,
      count: 5,
    });

    // Access private property for testing
    expect((rule as any).maxIterations).toBe(10000);
  });

  test('next() answers far-future queries without exhausting iteration limits', () => {
    const dtstart = Temporal.ZonedDateTime.from('2025-01-01T10:00:00[UTC]');

    const rule = new RRuleTemporal({
      freq: 'DAILY',
      dtstart,
      byDay: ['MO'],
      maxIterations: 3, // Very low limit
    });

    const after = Temporal.ZonedDateTime.from('2030-01-01T10:00:00[UTC]'); // Far in future

    // next() starts its scan at a phase-aligned point near `after`, so it no
    // longer needs to iterate through five years of daily candidates.
    const next = rule.next(after.toPlainDate().toZonedDateTime('UTC'));
    expect(next?.toString()).toBe('2030-01-07T10:00:00+00:00[UTC]');
  });

  test('next() and previous() should be protected by all() safety limits', () => {
    const dtstart = Temporal.ZonedDateTime.from('2025-01-01T10:00:00[UTC]');

    // A rule that can never match: February 31st does not exist, so every
    // candidate is filtered and the iteration cap is the only way out.
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      dtstart,
      byMonth: [2],
      byMonthDay: [31],
      maxIterations: 3, // Very low limit
    });

    const after = Temporal.ZonedDateTime.from('2030-01-01T10:00:00[UTC]');

    expect(() => {
      rule.next(after.toPlainDate().toZonedDateTime('UTC'));
    }).toThrow('Maximum iterations (3) exceeded in all()');
  });
});

function csvRange(start: number, end: number): string {
  const values: number[] = [];
  for (let value = start; value <= end; value += 1) {
    values.push(value);
  }

  return values.join(',');
}

describe('RRuleTemporal - dense yearly BY-part cross product (jens-maus/node-ical#542)', () => {
  test('between() honors COUNT=1 without materializing the full BYMONTH x BYMONTHDAY x BYHOUR x BYMINUTE x BYSECOND cross product', () => {
    // ~31.9M candidate instants (12 x 31 x 24 x 60 x 60) despite COUNT=1 and a
    // single-day query window; only DTSTART itself should ever be selected.
    const rruleString = [
      'DTSTART:20250101T000000Z',
      [
        'RRULE:FREQ=YEARLY',
        'COUNT=1',
        `BYMONTH=${csvRange(1, 12)}`,
        `BYMONTHDAY=${csvRange(1, 31)}`,
        `BYHOUR=${csvRange(0, 23)}`,
        `BYMINUTE=${csvRange(0, 59)}`,
        `BYSECOND=${csvRange(0, 59)}`,
      ].join(';'),
    ].join('\n');

    const rule = new RRuleTemporal({rruleString});

    // between() must filter against COUNT/the query window while expanding,
    // not after building the full cross product.
    let dates: ReturnType<typeof rule.between> = [];
    expect(() => {
      dates = rule.between(
        Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
        Temporal.ZonedDateTime.from('2025-01-01T23:59:59[UTC]'),
        true,
      );
    }).not.toThrow();

    expect(dates).toHaveLength(1);
    expect(dates[0]?.toString()).toBe('2025-01-01T00:00:00+00:00[UTC]');
  });

  test('between() keeps valid same-day BYHOUR values inside UNTIL when DTSTART is later on that date', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T10:00:00[UTC]'),
      until: Temporal.ZonedDateTime.from('2025-01-01T23:59:59[UTC]'),
      byMonth: [1],
      byMonthDay: [1],
      byHour: [0, 10, 23],
      byMinute: [0],
      bySecond: [0],
    });

    const dates = rule.between(
      Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      Temporal.ZonedDateTime.from('2025-01-01T23:59:59[UTC]'),
      true,
    );

    expect(dates).toHaveLength(2);
    expect(dates[0]?.toString()).toBe('2025-01-01T10:00:00+00:00[UTC]');
    expect(dates[1]?.toString()).toBe('2025-01-01T23:00:00+00:00[UTC]');
  });

  test('all() short-circuits dense YEARLY COUNT=1 rules instead of building the full BYMONTH x BYMONTHDAY x BYHOUR x BYMINUTE x BYSECOND cross product', () => {
    const rruleString = [
      'DTSTART:20250101T000000Z',
      [
        'RRULE:FREQ=YEARLY',
        'COUNT=1',
        `BYMONTH=${csvRange(1, 12)}`,
        `BYMONTHDAY=${csvRange(1, 31)}`,
        `BYHOUR=${csvRange(0, 23)}`,
        `BYMINUTE=${csvRange(0, 59)}`,
        `BYSECOND=${csvRange(0, 59)}`,
      ].join(';'),
    ].join('\n');

    const rule = new RRuleTemporal({rruleString});

    expect(() => rule.all()).not.toThrow();
    const dates = rule.all();
    expect(dates).toHaveLength(1);
    expect(dates[0]?.toString()).toBe('2025-01-01T00:00:00+00:00[UTC]');
  });

  test('all() enforces the iteration cap before a dense BY-part expansion can run away', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      maxIterations: 3,
      byMonth: Array.from({length: 12}, (_, index) => index + 1),
      byMonthDay: Array.from({length: 31}, (_, index) => index + 1),
      byHour: Array.from({length: 24}, (_, index) => index),
      byMinute: Array.from({length: 60}, (_, index) => index),
      bySecond: Array.from({length: 60}, (_, index) => index),
    });

    expect(() => rule.all(() => true)).toThrow('Maximum iterations (3) exceeded in all()');
  });

  test('all() finds the COUNT=1 occurrence on a different month/day than DTSTART', () => {
    // DTSTART is Jan 15, but the only match is Feb 1. The fast path must walk to
    // February instead of only advancing whole years on the DTSTART day.
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-15T09:00:00[UTC]'),
      byMonth: [2],
      byMonthDay: [1],
      count: 1,
    });

    const dates = rule.all();
    expect(dates).toHaveLength(1);
    expect(dates[0]?.toString()).toBe('2025-02-01T09:00:00+00:00[UTC]');
  });

  test('all() finds the dense COUNT=1 occurrence off the DTSTART day without materializing the cross product', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-15T09:00:00[UTC]'),
      byMonth: [2],
      byMonthDay: [1],
      byHour: Array.from({length: 24}, (_, index) => index),
      byMinute: Array.from({length: 60}, (_, index) => index),
      bySecond: Array.from({length: 60}, (_, index) => index),
      count: 1,
    });

    let dates: ReturnType<typeof rule.all> = [];
    expect(() => {
      dates = rule.all();
    }).not.toThrow();
    expect(dates).toHaveLength(1);
    expect(dates[0]?.toString()).toBe('2025-02-01T00:00:00+00:00[UTC]');
  });

  test('BYWEEKNO + BYYEARDAY feasibility keeps time-of-day occurrences (BYHOUR)', () => {
    // The feasibility pre-check is a date-level question; applying BYHOUR at
    // midnight used to hide the valid 10:00 occurrence.
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      byYearDay: [1],
      byWeekNo: [1],
      byHour: [10],
      count: 1,
    });

    const dates = rule.all();
    expect(dates).toHaveLength(1);
    expect(dates[0]?.toString()).toBe('2025-01-01T10:00:00+00:00[UTC]');
  });

  test('non-Gregorian RSCALE COUNT=1 rules are not short-circuited with Gregorian semantics', () => {
    // The COUNT=1 fast path must not evaluate a HEBREW rule with Gregorian
    // BYMONTH/BYMONTHDAY fields; its result must match the non-Gregorian engine.
    const rruleString = 'DTSTART:20250101T000000Z\nRRULE:RSCALE=HEBREW;FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1;COUNT=1';
    const countOne = new RRuleTemporal({rruleString}).all();
    const countTwo = new RRuleTemporal({
      rruleString: 'DTSTART:20250101T000000Z\nRRULE:RSCALE=HEBREW;FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1;COUNT=2',
    }).all();

    expect(countOne).toHaveLength(1);
    expect(countOne[0]?.toString()).toBe(countTwo[0]?.toString());
  });

  test('all() guards dense YEARLY rules whose months are only implied by BYMONTHDAY', () => {
    // Without BYMONTH the yearly generator expands all twelve months, so the
    // candidate estimate must include them (12 x 31 x 24 x 13 ~ 116k > 10000).
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      byMonthDay: Array.from({length: 31}, (_, index) => index + 1),
      byHour: Array.from({length: 24}, (_, index) => index),
      byMinute: Array.from({length: 13}, (_, index) => index),
    });

    expect(() => rule.all(() => true)).toThrow('Maximum iterations (10000) exceeded in all()');
  });

  test('all() preserves year-wide ordinal BYDAY semantics for COUNT=1', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      byDay: ['-1FR'],
      byHour: [12],
      count: 1,
    });

    const dates = rule.all();
    expect(dates).toHaveLength(1);
    expect(dates[0]?.toString()).toBe('2025-12-26T12:00:00+00:00[UTC]');
  });

  test('all() preserves Gregorian RSCALE SKIP semantics for COUNT=1', () => {
    const rule = new RRuleTemporal({
      rruleString:
        'DTSTART:20170101T000000Z\nRRULE:RSCALE=GREGORIAN;SKIP=BACKWARD;FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29;COUNT=1',
    });

    const dates = rule.all();
    expect(dates).toHaveLength(1);
    expect(dates[0]?.toString()).toBe('2017-02-28T00:00:00+00:00[UTC]');
  });

  test('all() streams dense YEARLY COUNT>1 rules instead of materializing the full cross product', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      byMonth: Array.from({length: 12}, (_, index) => index + 1),
      byMonthDay: Array.from({length: 31}, (_, index) => index + 1),
      byHour: Array.from({length: 24}, (_, index) => index),
      byMinute: Array.from({length: 60}, (_, index) => index),
      bySecond: Array.from({length: 60}, (_, index) => index),
      count: 2,
    });

    let dates: ReturnType<typeof rule.all> = [];
    expect(() => {
      dates = rule.all();
    }).not.toThrow();
    expect(dates).toHaveLength(2);
    expect(dates[0]?.toString()).toBe('2025-01-01T00:00:00+00:00[UTC]');
    expect(dates[1]?.toString()).toBe('2025-01-01T00:00:01+00:00[UTC]');
  });

  test('between() streams dense YEARLY windows instead of materializing the full cross product', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      byMonth: Array.from({length: 12}, (_, index) => index + 1),
      byMonthDay: Array.from({length: 31}, (_, index) => index + 1),
      byHour: Array.from({length: 24}, (_, index) => index),
      byMinute: Array.from({length: 60}, (_, index) => index),
      bySecond: Array.from({length: 60}, (_, index) => index),
    });

    let dates: ReturnType<typeof rule.between> = [];
    expect(() => {
      dates = rule.between(
        Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
        Temporal.ZonedDateTime.from('2025-01-01T00:00:03[UTC]'),
        true,
      );
    }).not.toThrow();
    expect(dates.map((d) => d.toString())).toEqual([
      '2025-01-01T00:00:00+00:00[UTC]',
      '2025-01-01T00:00:01+00:00[UTC]',
      '2025-01-01T00:00:02+00:00[UTC]',
      '2025-01-01T00:00:03+00:00[UTC]',
    ]);
  });

  test('all() treats a dense COUNT=0 rule as an empty recurrence instead of throwing', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      byMonth: Array.from({length: 12}, (_, index) => index + 1),
      count: 0,
      maxIterations: 3,
    });

    let dates: ReturnType<typeof rule.all> = [];
    expect(() => {
      dates = rule.all(() => true);
    }).not.toThrow();
    expect(dates).toHaveLength(0);
  });

  test('all() guards dense YEARLY;COUNT=1;BYSETPOS rules instead of materializing the full cross product', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      byMonth: Array.from({length: 12}, (_, index) => index + 1),
      byMonthDay: Array.from({length: 31}, (_, index) => index + 1),
      byHour: Array.from({length: 24}, (_, index) => index),
      byMinute: Array.from({length: 60}, (_, index) => index),
      bySecond: Array.from({length: 60}, (_, index) => index),
      bySetPos: [1],
      count: 1,
    });

    expect(() => rule.all()).toThrow('Maximum iterations (10000) exceeded in all()');
  });

  test('all() guards dense YEARLY BYYEARDAY rules instead of materializing the full cross product', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      byYearDay: Array.from({length: 366}, (_, index) => index + 1),
      byHour: Array.from({length: 24}, (_, index) => index),
      byMinute: Array.from({length: 60}, (_, index) => index),
      bySecond: Array.from({length: 60}, (_, index) => index),
      count: 1,
    });

    let dates: ReturnType<typeof rule.all> = [];
    expect(() => {
      dates = rule.all();
    }).not.toThrow();
    expect(dates).toHaveLength(1);
    expect(dates[0]?.toString()).toBe('2025-01-01T00:00:00+00:00[UTC]');
  });

  test('all() guards dense YEARLY BYWEEKNO rules instead of materializing the full cross product', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-06T00:00:00[UTC]'),
      byWeekNo: Array.from({length: 53}, (_, index) => index + 1),
      byHour: Array.from({length: 24}, (_, index) => index),
      byMinute: Array.from({length: 60}, (_, index) => index),
      bySecond: Array.from({length: 60}, (_, index) => index),
      count: 1,
    });

    let dates: ReturnType<typeof rule.all> = [];
    expect(() => {
      dates = rule.all();
    }).not.toThrow();
    expect(dates).toHaveLength(1);
    expect(dates[0]?.toString()).toBe('2025-01-06T00:00:00+00:00[UTC]');
  });

  test('all() deduplicates expanded time slots so a bounded COUNT is not consumed by duplicate BYHOUR values', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      byHour: [0, 0],
      count: 2,
    });

    const dates = rule.all();
    expect(dates).toHaveLength(2);
    expect(dates[0]?.toString()).toBe('2025-01-01T00:00:00+00:00[UTC]');
    expect(dates[1]?.toString()).toBe('2026-01-01T00:00:00+00:00[UTC]');
  });

  test('all() guards dense Gregorian RSCALE expansions before materializing them', () => {
    const rule = new RRuleTemporal({
      rruleString: [
        'DTSTART:20250101T000000Z',
        [
          'RRULE:RSCALE=GREGORIAN;SKIP=OMIT;FREQ=YEARLY;COUNT=1',
          `BYMONTH=${csvRange(1, 12)}`,
          `BYMONTHDAY=${csvRange(1, 31)}`,
          `BYHOUR=${csvRange(0, 23)}`,
          `BYMINUTE=${csvRange(0, 59)}`,
          `BYSECOND=${csvRange(0, 59)}`,
        ].join(';'),
      ].join('\n'),
    });

    expect(() => rule.all()).toThrow('Maximum iterations (10000) exceeded in all()');
  });

  test('all() guards dense rules with RDATE or EXDATE before recurrence-set merging', () => {
    const dtstart = Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]');
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart,
      count: 1,
      byMonth: Array.from({length: 12}, (_, index) => index + 1),
      byMonthDay: Array.from({length: 31}, (_, index) => index + 1),
      byHour: Array.from({length: 24}, (_, index) => index),
      byMinute: Array.from({length: 60}, (_, index) => index),
      bySecond: Array.from({length: 60}, (_, index) => index),
      exDate: [dtstart],
    });

    expect(() => rule.all()).toThrow('Maximum iterations (10000) exceeded in all()');
  });

  test('all() counts BYYEARDAY and BYWEEKNO groups together for dense safety limits', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      count: 1,
      maxIterations: 100,
      byYearDay: [1],
      byWeekNo: Array.from({length: 53}, (_, index) => index + 1),
      byDay: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'],
      bySetPos: [1],
    });

    expect(() => rule.all()).toThrow('Maximum iterations (100) exceeded in all()');
  });

  test('all() keeps searching for BYYEARDAY matches in reachable leap years', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2023-01-01T00:00:00[UTC]'),
      byYearDay: [366],
      byWeekNo: [1],
      count: 1,
    });

    const dates = rule.all();
    expect(dates).not.toHaveLength(0);
  });

  test('all() includes ISO-week boundary dates before UNTIL', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2018-01-01T00:00:00[UTC]'),
      byWeekNo: [1],
      byDay: ['MO'],
      until: Temporal.ZonedDateTime.from('2018-12-31T23:59:59[UTC]'),
    });

    const dates = rule.all();
    expect(dates.map((date) => date.toString())).toContain('2018-12-31T00:00:00+00:00[UTC]');
  });

  test('all() emits RDATEs for dense COUNT=0 rules without applying the RRULE cap', () => {
    const rDate = Temporal.ZonedDateTime.from('2025-06-01T00:00:00[UTC]');
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      count: 0,
      maxIterations: 3,
      byMonth: Array.from({length: 12}, (_, index) => index + 1),
      rDate: [rDate],
    });

    const dates = rule.all(() => true);
    expect(dates.map((date) => date.toString())).toEqual([rDate.toString()]);
  });

  test('all() guards COUNT=0 dense BYSETPOS rules before materializing them', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      count: 0,
      maxIterations: 3,
      byMonth: Array.from({length: 12}, (_, index) => index + 1),
      byMonthDay: Array.from({length: 31}, (_, index) => index + 1),
      byHour: Array.from({length: 24}, (_, index) => index),
      byMinute: Array.from({length: 60}, (_, index) => index),
      bySecond: Array.from({length: 60}, (_, index) => index),
      bySetPos: [1],
    });

    expect(() => rule.all(() => true)).not.toThrow();
    expect(rule.all(() => true)).toEqual([]);
  });

  test('all() checks the complete Gregorian cycle for large YEARLY intervals', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2023-01-01T00:00:00[UTC]'),
      interval: 401,
      byYearDay: [366],
      byWeekNo: [1],
      count: 1,
    });

    expect(rule.all()).not.toEqual([]);
  });

  test('all() estimates year-wide ordinal BYDAY candidates without monthly overcounting', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      count: 1,
      byDay: ['-1FR'],
      byHour: Array.from({length: 24}, (_, index) => index),
      byMinute: [0, 1],
      bySetPos: [1],
    });

    expect(() => rule.all()).not.toThrow();
    expect(rule.all()).toHaveLength(1);
  });

  test('all() estimates non-ordinal BYDAY candidates by matching weekday count, not every day', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      count: 1,
      byDay: ['MO'],
      byHour: Array.from({length: 24}, (_, index) => index),
      byMinute: Array.from({length: 7}, (_, index) => index),
      bySetPos: [1],
    });

    expect(() => rule.all()).not.toThrow();
    expect(rule.all()).toHaveLength(1);
  });

  test('all() still guards a genuinely dense non-ordinal BYDAY expansion', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      count: 1,
      byDay: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'],
      byHour: Array.from({length: 24}, (_, index) => index),
      byMinute: Array.from({length: 60}, (_, index) => index),
      bySecond: Array.from({length: 60}, (_, index) => index),
      bySetPos: [1],
    });

    expect(() => rule.all()).toThrow('Maximum iterations (10000) exceeded in all()');
  });

  test('all() guards dense BYWEEKNO=53 rules even when DTSTART year has no week 53', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      count: 1,
      byWeekNo: [53],
      byDay: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'],
      byHour: Array.from({length: 24}, (_, index) => index),
      byMinute: Array.from({length: 60}, (_, index) => index),
      bySecond: Array.from({length: 60}, (_, index) => index),
      bySetPos: [1],
    });

    expect(() => rule.all()).toThrow('Maximum iterations (10000) exceeded in all()');
  });

  test('all() deduplicates repeated BYHOUR/BYMINUTE/BYSECOND values before expanding a date', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      count: 1,
      byHour: Array(1000).fill(0),
      byMinute: Array(1000).fill(0),
      bySecond: Array(1000).fill(0),
    });

    const dates = rule.all();
    expect(dates).toHaveLength(1);
    expect(dates[0]?.toString()).toBe('2025-01-01T00:00:00+00:00[UTC]');
  });

  test('all() estimates the expansion size from unique BYHOUR/BYMINUTE/BYSECOND values, not raw duplicates', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      count: 1,
      byHour: Array(22).fill(0),
      byMinute: Array(22).fill(0),
      bySecond: Array(22).fill(0),
      bySetPos: [1],
    });

    const dates = rule.all();
    expect(dates).toHaveLength(1);
    expect(dates[0]?.toString()).toBe('2025-01-01T00:00:00+00:00[UTC]');
  });

  test('all() stops the year cycle scan instead of leaving Temporal representable range', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      interval: 300001,
      byHour: [0],
      count: 1,
    });

    const dates = rule.all();
    expect(dates).toHaveLength(1);
    expect(dates[0]?.toString()).toBe('2025-01-01T00:00:00+00:00[UTC]');
  });

  test('all() stops dense yearly generation instead of leaving Temporal representable range', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      interval: 300001,
      byHour: [0],
      count: 2,
    });

    const dates = rule.all();
    expect(dates).toHaveLength(1);
    expect(dates[0]?.toString()).toBe('2025-01-01T00:00:00+00:00[UTC]');
  });

  test('all() short-circuits a dense BYSETPOS rule whose UNTIL precedes DTSTART', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      until: Temporal.ZonedDateTime.from('2024-01-01T00:00:00[UTC]'),
      byMonth: Array.from({length: 12}, (_, index) => index + 1),
      byMonthDay: Array.from({length: 31}, (_, index) => index + 1),
      byHour: Array.from({length: 24}, (_, index) => index),
      byMinute: Array.from({length: 60}, (_, index) => index),
      bySecond: Array.from({length: 60}, (_, index) => index),
      bySetPos: [1],
    });

    expect(() => rule.all()).not.toThrow();
    expect(rule.all()).toEqual([]);
  });

  test('all() still merges RDATE when UNTIL precedes DTSTART', () => {
    const rDate = Temporal.ZonedDateTime.from('2023-06-01T00:00:00[UTC]');
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      until: Temporal.ZonedDateTime.from('2024-01-01T00:00:00[UTC]'),
      rDate: [rDate],
    });

    const dates = rule.all(() => true);
    expect(dates.map((date) => date.toString())).toEqual([rDate.toString()]);
  });

  test('all() rejects an unbounded call before estimating a dense expansion', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      byYearDay: Array(1_000_000).fill(1),
    });

    expect(() => rule.all()).toThrow('all() requires iterator when no COUNT/UNTIL');
  });

  test('all() still includes DTSTART via includeDtstart when UNTIL precedes DTSTART', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      until: Temporal.ZonedDateTime.from('2024-01-01T00:00:00[UTC]'),
      byMonth: [2],
      includeDtstart: true,
    });

    const dates = rule.all();
    expect(dates.map((date) => date.toString())).toEqual(['2025-01-01T00:00:00+00:00[UTC]']);
  });

  test('all() guards dense BYWEEKNO=1 rules whose ISO week spills into the next generation year', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2018-01-01T00:00:00[UTC]'),
      until: Temporal.ZonedDateTime.from('2018-12-31T23:59:59[UTC]'),
      byWeekNo: [1],
      byMonth: [12],
      byDay: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'],
      byHour: Array.from({length: 24}, (_, index) => index),
      byMinute: Array.from({length: 60}, (_, index) => index),
      bySecond: Array.from({length: 60}, (_, index) => index),
      bySetPos: [1],
    });

    expect(() => rule.all()).toThrow('Maximum iterations (10000) exceeded in all()');
  });

  test('all() guards dense WEEKLY BYYEARDAY rules routed through _allYearlyComplex()', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      byYearDay: [1],
      byHour: Array.from({length: 24}, (_, index) => index),
      byMinute: Array.from({length: 60}, (_, index) => index),
      bySecond: Array.from({length: 60}, (_, index) => index),
      count: 1,
    });

    expect(() => rule.all()).toThrow('Maximum iterations (10000) exceeded in all()');
  });

  test('all() guards dense WEEKLY BYWEEKNO rules routed through _allYearlyComplex()', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-06T00:00:00[UTC]'),
      byWeekNo: [1],
      byHour: Array.from({length: 24}, (_, index) => index),
      byMinute: Array.from({length: 60}, (_, index) => index),
      bySecond: Array.from({length: 60}, (_, index) => index),
      count: 1,
    });

    expect(() => rule.all()).toThrow('Maximum iterations (10000) exceeded in all()');
  });

  test('all() still returns correct results for a WEEKLY BYYEARDAY rule below the density limit', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      byYearDay: [1],
      byHour: [10],
      count: 2,
    });

    const dates = rule.all();
    expect(dates.map((date) => date.toString())).toEqual([
      '2025-01-01T10:00:00+00:00[UTC]',
      '2026-01-01T10:00:00+00:00[UTC]',
    ]);
  });

  test('all() guards dense MONTHLY BYYEARDAY rules routed through _allMonthlyByYearDay()', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      byYearDay: [1],
      byHour: Array.from({length: 24}, (_, index) => index),
      byMinute: Array.from({length: 60}, (_, index) => index),
      bySecond: Array.from({length: 60}, (_, index) => index),
      count: 1,
    });

    expect(() => rule.all()).toThrow('Maximum iterations (10000) exceeded in all()');
  });

  test('all() guards dense MONTHLY BYWEEKNO rules routed through _allMonthlyByWeekNo()', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-06T00:00:00[UTC]'),
      byWeekNo: [1],
      byHour: Array.from({length: 24}, (_, index) => index),
      byMinute: Array.from({length: 60}, (_, index) => index),
      bySecond: Array.from({length: 60}, (_, index) => index),
      count: 1,
    });

    expect(() => rule.all()).toThrow('Maximum iterations (10000) exceeded in all()');
  });

  test('all() still returns correct results for a MONTHLY BYWEEKNO rule below the density limit', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      byWeekNo: [1],
      byDay: ['MO'],
      dtstart: Temporal.ZonedDateTime.from('1997-09-02T09:00:00[UTC]'),
    });

    const dates = rule.all();
    expect(dates.map((date) => date.toString())).toEqual([
      '1997-12-29T09:00:00+00:00[UTC]',
      '1999-01-04T09:00:00+00:00[UTC]',
      '2000-01-03T09:00:00+00:00[UTC]',
    ]);
  });

  test('all() estimates MONTHLY BYWEEKNO without BYDAY as a single weekday, not seven', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      byWeekNo: [1],
      byHour: Array.from({length: 24}, (_, index) => index),
      byMinute: Array.from({length: 60}, (_, index) => index),
      count: 1,
      strict: false,
    });

    expect(() => rule.all()).not.toThrow();
    expect(rule.all()).toHaveLength(1);
  });

  test('all() limits MONTHLY BYYEARDAY by the largest single day, not every selected day', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      byYearDay: Array.from({length: 366}, (_, index) => index + 1),
      byHour: Array.from({length: 24}, (_, index) => index),
      byMinute: [0, 1],
      count: 1,
    });

    expect(() => rule.all()).not.toThrow();
    expect(rule.all()).toHaveLength(1);
  });

  test('all() deduplicates repeated BYDAY tokens before expanding a MONTHLY BYWEEKNO week', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      byWeekNo: [1],
      byDay: Array(1_000_000).fill('MO'),
      count: 1,
      strict: false,
    });

    const dates = rule.all();
    expect(dates).toHaveLength(1);
  });

  test('all() stops the density scan once a bounded BYSETPOS count is already satisfiable', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      count: 1,
      byDay: ['MO'],
      byHour: Array.from({length: 24}, (_, index) => index),
      byMinute: Array.from({length: 8}, (_, index) => index),
      bySetPos: [1],
    });

    expect(() => rule.all()).not.toThrow();
    expect(rule.all()).toHaveLength(1);
  });

  test('all() does not stop the density scan on a year where BYSETPOS selects nothing', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      count: 1,
      byYearDay: [1],
      byWeekNo: [53],
      byDay: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'],
      byHour: Array.from({length: 24}, (_, index) => index),
      byMinute: Array.from({length: 60}, (_, index) => index),
      bySecond: Array.from({length: 6}, (_, index) => index),
      bySetPos: [8641],
    });

    // 2025 has no ISO week 53, so its 8,640 raw candidates leave BYSETPOS=8641
    // out of range (0 actual matches); the scan must continue to a 53-week
    // year, whose ~69,120 candidates exceed the default limit.
    expect(() => rule.all()).toThrow('Maximum iterations (10000) exceeded in all()');
  });

  test('all() honors includeDtstart before rejecting a dense expansion it will never need', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      count: 1,
      includeDtstart: true,
      byMonth: [2],
      byMonthDay: [1],
      byHour: Array.from({length: 24}, (_, index) => index),
      byMinute: Array.from({length: 60}, (_, index) => index),
      bySecond: Array.from({length: 60}, (_, index) => index),
    });

    expect(() => rule.all()).not.toThrow();
    const dates = rule.all();
    expect(dates.map((date) => date.toString())).toEqual(['2025-01-01T00:00:00+00:00[UTC]']);
  });

  test('all() does not credit BYSETPOS occurrences discarded for preceding DTSTART', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-12-31T00:00:00[UTC]'),
      count: 1,
      byYearDay: [1],
      byWeekNo: [53],
      byDay: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'],
      byHour: Array.from({length: 24}, (_, index) => index),
      byMinute: Array.from({length: 60}, (_, index) => index),
      bySecond: Array.from({length: 6}, (_, index) => index),
      bySetPos: [1],
    });

    // BYSETPOS=1 selects January 1st in 2025, which precedes DTSTART
    // (Dec 31) and is discarded by processOccurrences(); the scan must
    // continue to a 53-week year instead of crediting COUNT here.
    expect(() => rule.all()).toThrow('Maximum iterations (10000) exceeded in all()');
  });

  test('all() streams a dense bounded YEARLY rule even when rDate/exDate are empty arrays', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      count: 1,
      byMonth: Array.from({length: 12}, (_, index) => index + 1),
      byMonthDay: Array.from({length: 31}, (_, index) => index + 1),
      byHour: Array.from({length: 24}, (_, index) => index),
      byMinute: Array.from({length: 60}, (_, index) => index),
      bySecond: Array.from({length: 60}, (_, index) => index),
      rDate: [],
      exDate: [],
    });

    expect(() => rule.all()).not.toThrow();
    const dates = rule.all();
    expect(dates).toHaveLength(1);
    expect(dates[0]?.toString()).toBe('2025-01-01T00:00:00+00:00[UTC]');
  });

  test('all() deduplicates candidates before crediting COUNT in the density scan', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      count: 2,
      byYearDay: [2, 2],
      byWeekNo: Array(20_000).fill(53),
      byDay: ['MO'],
    });

    // Both duplicate January 2nd candidates in 2025 must collapse to one
    // (matching _allYearlyComplex()'s own dedup before COUNT), so the scan
    // continues to a 53-week year and catches its oversized BYWEEKNO expansion.
    expect(() => rule.all()).toThrow('Maximum iterations (10000) exceeded in all()');
  });

  test('all() credits an included DTSTART toward a bounded COUNT greater than one', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2023-01-01T00:00:00[UTC]'),
      count: 2,
      includeDtstart: true,
      byDay: ['MO'],
      byHour: Array.from({length: 24}, (_, index) => index),
      byMinute: Array.from({length: 8}, (_, index) => index),
      bySetPos: [1],
    });

    // DTSTART (a Sunday) plus 2023's first Monday already satisfy COUNT=2,
    // so the scan must not reject 2024's larger 53-Monday expansion.
    expect(() => rule.all()).not.toThrow();
    expect(rule.all()).toHaveLength(2);
  });

  test('all() deduplicates BYSETPOS-selected candidates before crediting COUNT', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-02T00:00:00[UTC]'),
      count: 2,
      byYearDay: [2, 2],
      byWeekNo: Array(20_000).fill(53),
      bySetPos: [1, 2],
    });

    // BYSETPOS positions 1 and 2 both select January 2nd (duplicated by
    // BYYEARDAY=2,2), which _allYearlyComplex() collapses to a single
    // occurrence; the scan must not credit 2 from 2025 and stop early.
    expect(() => rule.all()).toThrow('Maximum iterations (10000) exceeded in all()');
  });

  test('all() credits an occurrence equal to DTSTART toward COUNT in the density scan', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-02T00:00:00[UTC]'),
      count: 1,
      byYearDay: [2],
      byWeekNo: Array(20_000).fill(53),
    });

    // The only 2025 candidate (January 2nd) equals DTSTART exactly and is
    // kept (not discarded) by processOccurrences(), satisfying COUNT=1
    // immediately without ever reaching the oversized 53-week expansion.
    expect(() => rule.all()).not.toThrow();
    expect(rule.all()).toHaveLength(1);
  });

  test('all() rejects a huge selector array cheaply instead of materializing it first', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      count: 1,
      byYearDay: Array(1_000_000).fill(1),
      bySetPos: [1],
    });

    const start = performance.now();
    // BYYEARDAY=1 is valid every year, so the real (undeduped) generator
    // would materialize 1,000,000 ZonedDateTime candidates for 2025 alone;
    // the guard must reject this using cheap arithmetic, not construct them.
    expect(() => rule.all()).toThrow('Maximum iterations (10000) exceeded in all()');
    const elapsedMs = performance.now() - start;
    expect(elapsedMs).toBeLessThan(500);
  });

  test('all() normalizes BYDAY tokens before sizing a MONTHLY BYWEEKNO expansion', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      dtstart: Temporal.ZonedDateTime.from('2025-01-06T00:00:00[UTC]'),
      count: 1,
      byWeekNo: [1],
      byDay: ['MO', '1MO'],
      byHour: Array.from({length: 24}, (_, index) => index),
      byMinute: Array.from({length: 60}, (_, index) => index),
      bySecond: Array.from({length: 6}, (_, index) => index),
    });

    // MO and 1MO both normalize to the same weekday in isoWeekByDay(), so the
    // guard must size this as a single day (8,640 slots), not two (17,280).
    expect(() => rule.all()).not.toThrow();
    expect(rule.all()).toHaveLength(1);
  });
});

import {RRuleTemporal} from '../index';
import {Temporal} from '@js-temporal/polyfill';
import {assertDates, format} from './helpers';

describe('between() – respects INTERVAL when optimizing dtstart', () => {
  test('DAILY interval=2: day window on non-occurrence returns empty', () => {
    const tz = 'UTC';
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      interval: 2,
      dtstart: Temporal.ZonedDateTime.from({year: 2025, month: 1, day: 1, timeZone: tz}),
      until: Temporal.ZonedDateTime.from({year: 2025, month: 12, day: 31, timeZone: tz}),
      tzid: tz,
    });

    const start = Temporal.ZonedDateTime.from('2025-01-08T00:00:00[UTC]');
    const end = Temporal.ZonedDateTime.from('2025-01-08T23:59:59[UTC]');

    assertDates({rule, between: [start, end], inc: true, print: format('UTC')}, []);
  });

  test('DAILY interval=2: multi-day window returns only aligned dates', () => {
    const tz = 'UTC';
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      interval: 2,
      dtstart: Temporal.ZonedDateTime.from({year: 2025, month: 1, day: 1, timeZone: tz}),
      until: Temporal.ZonedDateTime.from({year: 2025, month: 12, day: 31, timeZone: tz}),
      tzid: tz,
    });

    const start = Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]');
    const end = Temporal.ZonedDateTime.from('2025-01-10T23:59:59[UTC]');

    assertDates(
      {rule, between: [start, end], inc: true, print: format('UTC')},
      [
        '2025-01-01T00:00:00+00:00[UTC]',
        '2025-01-03T00:00:00+00:00[UTC]',
        '2025-01-05T00:00:00+00:00[UTC]',
        '2025-01-07T00:00:00+00:00[UTC]',
        '2025-01-09T00:00:00+00:00[UTC]',
      ],
    );
  });

  test('WEEKLY interval=2 with BYDAY=MO: day window on off-week returns empty', () => {
    const tz = 'UTC';
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      interval: 2,
      byDay: ['MO'],
      dtstart: Temporal.ZonedDateTime.from({year: 2025, month: 1, day: 6, timeZone: tz}), // Monday
      until: Temporal.ZonedDateTime.from({year: 2025, month: 12, day: 31, timeZone: tz}),
      tzid: tz,
    });

    // 2025-01-13 is the next Monday but should be an off-week (dtstart Monday is 6th → occurrences 6th, 20th, ...)
    const start = Temporal.ZonedDateTime.from('2025-01-13T00:00:00[UTC]');
    const end = Temporal.ZonedDateTime.from('2025-01-13T23:59:59[UTC]');

    assertDates({rule, between: [start, end], inc: true, print: format('UTC')}, []);
  });

  test('WEEKLY interval=2 with BYDAY=MO: month window returns aligned Mondays only', () => {
    const tz = 'UTC';
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      interval: 2,
      byDay: ['MO'],
      dtstart: Temporal.ZonedDateTime.from({year: 2025, month: 1, day: 6, timeZone: tz}), // Monday
      until: Temporal.ZonedDateTime.from({year: 2025, month: 12, day: 31, timeZone: tz}),
      tzid: tz,
    });

    const start = Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]');
    const end = Temporal.ZonedDateTime.from('2025-01-31T23:59:59[UTC]');

    assertDates(
      {rule, between: [start, end], inc: true, print: format('UTC')},
      [
        '2025-01-06T00:00:00+00:00[UTC]',
        '2025-01-20T00:00:00+00:00[UTC]',
      ],
    );
  });
});

describe('between() – additional intervals and frequencies', () => {
  test('DAILY interval=3: off-day window is empty; multi-day window returns aligned dates', () => {
    const tz = 'UTC';
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      interval: 3,
      dtstart: Temporal.ZonedDateTime.from({year: 2025, month: 1, day: 1, timeZone: tz}),
      tzid: tz,
    });

    // Off-day (Jan 2) — not aligned to 1,4,7...
    let start = Temporal.ZonedDateTime.from('2025-01-02T00:00:00[UTC]');
    let end = Temporal.ZonedDateTime.from('2025-01-02T23:59:59[UTC]');
    assertDates({rule, between: [start, end], inc: true, print: format('UTC')}, []);

    // Multi-day window
    start = Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]');
    end = Temporal.ZonedDateTime.from('2025-01-10T23:59:59[UTC]');
    assertDates(
      {rule, between: [start, end], inc: true, print: format('UTC')},
      [
        '2025-01-01T00:00:00+00:00[UTC]',
        '2025-01-04T00:00:00+00:00[UTC]',
        '2025-01-07T00:00:00+00:00[UTC]',
        '2025-01-10T00:00:00+00:00[UTC]',
      ],
    );
  });

  test('HOURLY interval=5: off-hour window empty; day window returns aligned hours', () => {
    const tz = 'UTC';
    const rule = new RRuleTemporal({
      freq: 'HOURLY',
      interval: 5,
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      tzid: tz,
    });

    // Off-hour (01:00-01:59)
    let start = Temporal.ZonedDateTime.from('2025-01-01T01:00:00[UTC]');
    let end = Temporal.ZonedDateTime.from('2025-01-01T01:59:59[UTC]');
    assertDates({rule, between: [start, end], inc: true, print: format('UTC')}, []);

    // Full day
    start = Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]');
    end = Temporal.ZonedDateTime.from('2025-01-01T23:59:59[UTC]');
    assertDates(
      {rule, between: [start, end], inc: true, print: format('UTC')},
      [
        '2025-01-01T00:00:00+00:00[UTC]',
        '2025-01-01T05:00:00+00:00[UTC]',
        '2025-01-01T10:00:00+00:00[UTC]',
        '2025-01-01T15:00:00+00:00[UTC]',
        '2025-01-01T20:00:00+00:00[UTC]',
      ],
    );
  });

  test('MINUTELY interval=3: off-minute window empty; short window returns aligned minutes', () => {
    const tz = 'UTC';
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      interval: 3,
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T12:00:00[UTC]'),
      tzid: tz,
    });

    // Off-minute (12:05:00-12:05:59)
    let start = Temporal.ZonedDateTime.from('2025-01-01T12:05:00[UTC]');
    let end = Temporal.ZonedDateTime.from('2025-01-01T12:05:59[UTC]');
    assertDates({rule, between: [start, end], inc: true, print: format('UTC')}, []);

    // 10-minute window
    start = Temporal.ZonedDateTime.from('2025-01-01T12:00:00[UTC]');
    end = Temporal.ZonedDateTime.from('2025-01-01T12:10:00[UTC]');
    assertDates(
      {rule, between: [start, end], inc: true, print: format('UTC')},
      [
        '2025-01-01T12:00:00+00:00[UTC]',
        '2025-01-01T12:03:00+00:00[UTC]',
        '2025-01-01T12:06:00+00:00[UTC]',
        '2025-01-01T12:09:00+00:00[UTC]',
      ],
    );
  });

  test('SECONDLY interval=15: off-second window empty; window returns aligned seconds', () => {
    const tz = 'UTC';
    const rule = new RRuleTemporal({
      freq: 'SECONDLY',
      interval: 15,
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      tzid: tz,
    });

    // Off-second (00:00:07 only)
    let start = Temporal.ZonedDateTime.from('2025-01-01T00:00:07[UTC]');
    let end = Temporal.ZonedDateTime.from('2025-01-01T00:00:07[UTC]');
    assertDates({rule, between: [start, end], inc: true, print: format('UTC')}, []);

    // 31-second window
    start = Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]');
    end = Temporal.ZonedDateTime.from('2025-01-01T00:00:30[UTC]');
    assertDates(
      {rule, between: [start, end], inc: true, print: format('UTC')},
      [
        '2025-01-01T00:00:00+00:00[UTC]',
        '2025-01-01T00:00:15+00:00[UTC]',
        '2025-01-01T00:00:30+00:00[UTC]',
      ],
    );
  });

  test('WEEKLY interval=3: BYDAY=TU off-week empty; month window aligned Tuesdays', () => {
    const tz = 'UTC';
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      interval: 3,
      byDay: ['TU'],
      dtstart: Temporal.ZonedDateTime.from('2025-01-07T00:00:00[UTC]'), // Tuesday
      tzid: tz,
    });

    // Off-week Tuesday
    let start = Temporal.ZonedDateTime.from('2025-01-14T00:00:00[UTC]');
    let end = Temporal.ZonedDateTime.from('2025-01-14T23:59:59[UTC]');
    assertDates({rule, between: [start, end], inc: true, print: format('UTC')}, []);

    // Month window
    start = Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]');
    end = Temporal.ZonedDateTime.from('2025-01-31T23:59:59[UTC]');
    assertDates(
      {rule, between: [start, end], inc: true, print: format('UTC')},
      [
        '2025-01-07T00:00:00+00:00[UTC]',
        '2025-01-28T00:00:00+00:00[UTC]',
      ],
    );
  });

  test('MONTHLY interval=3: BYMONTHDAY=15 off-month empty; window aligned 15ths', () => {
    const tz = 'UTC';
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      interval: 3,
      byMonthDay: [15],
      dtstart: Temporal.ZonedDateTime.from('2025-01-15T00:00:00[UTC]'),
      tzid: tz,
    });

    // Off-month (Feb 15)
    let start = Temporal.ZonedDateTime.from('2025-02-15T00:00:00[UTC]');
    let end = Temporal.ZonedDateTime.from('2025-02-15T23:59:59[UTC]');
    assertDates({rule, between: [start, end], inc: true, print: format('UTC')}, []);

    // Window through June
    start = Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]');
    end = Temporal.ZonedDateTime.from('2025-06-30T23:59:59[UTC]');
    assertDates(
      {rule, between: [start, end], inc: true, print: format('UTC')},
      [
        '2025-01-15T00:00:00+00:00[UTC]',
        '2025-04-15T00:00:00+00:00[UTC]',
      ],
    );
  });

  test('YEARLY interval=3: BYMONTH=1 off-year empty; window aligned years', () => {
    const tz = 'UTC';
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      interval: 3,
      byMonth: [1],
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      tzid: tz,
    });

    // Off-year Jan 1 (2026)
    let start = Temporal.ZonedDateTime.from('2026-01-01T00:00:00[UTC]');
    let end = Temporal.ZonedDateTime.from('2026-01-01T23:59:59[UTC]');
    assertDates({rule, between: [start, end], inc: true, print: format('UTC')}, []);

    // 4-year window
    start = Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]');
    end = Temporal.ZonedDateTime.from('2028-12-31T23:59:59[UTC]');
    assertDates(
      {rule, between: [start, end], inc: true, print: format('UTC')},
      [
        '2025-01-01T00:00:00+00:00[UTC]',
        '2028-01-01T00:00:00+00:00[UTC]',
      ],
    );
  });
});

describe('between() – even intervals across frequencies', () => {
  test('DAILY interval=4: off-day empty; multi-day window aligned', () => {
    const tz = 'UTC';
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      interval: 4,
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      tzid: tz,
    });

    let start = Temporal.ZonedDateTime.from('2025-01-02T00:00:00[UTC]');
    let end = Temporal.ZonedDateTime.from('2025-01-02T23:59:59[UTC]');
    assertDates({rule, between: [start, end], inc: true, print: format('UTC')}, []);

    start = Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]');
    end = Temporal.ZonedDateTime.from('2025-01-12T23:59:59[UTC]');
    assertDates(
      {rule, between: [start, end], inc: true, print: format('UTC')},
      [
        '2025-01-01T00:00:00+00:00[UTC]',
        '2025-01-05T00:00:00+00:00[UTC]',
        '2025-01-09T00:00:00+00:00[UTC]',
      ],
    );
  });

  test('HOURLY interval=6: off-hour empty; day window aligned hours', () => {
    const tz = 'UTC';
    const rule = new RRuleTemporal({
      freq: 'HOURLY',
      interval: 6,
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      tzid: tz,
    });

    let start = Temporal.ZonedDateTime.from('2025-01-01T02:00:00[UTC]');
    let end = Temporal.ZonedDateTime.from('2025-01-01T02:59:59[UTC]');
    assertDates({rule, between: [start, end], inc: true, print: format('UTC')}, []);

    start = Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]');
    end = Temporal.ZonedDateTime.from('2025-01-01T23:59:59[UTC]');
    assertDates(
      {rule, between: [start, end], inc: true, print: format('UTC')},
      [
        '2025-01-01T00:00:00+00:00[UTC]',
        '2025-01-01T06:00:00+00:00[UTC]',
        '2025-01-01T12:00:00+00:00[UTC]',
        '2025-01-01T18:00:00+00:00[UTC]',
      ],
    );
  });

  test('MINUTELY interval=4: off-minute empty; short window aligned minutes', () => {
    const tz = 'UTC';
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      interval: 4,
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T12:00:00[UTC]'),
      tzid: tz,
    });

    let start = Temporal.ZonedDateTime.from('2025-01-01T12:02:00[UTC]');
    let end = Temporal.ZonedDateTime.from('2025-01-01T12:02:59[UTC]');
    assertDates({rule, between: [start, end], inc: true, print: format('UTC')}, []);

    start = Temporal.ZonedDateTime.from('2025-01-01T12:00:00[UTC]');
    end = Temporal.ZonedDateTime.from('2025-01-01T12:15:00[UTC]');
    assertDates(
      {rule, between: [start, end], inc: true, print: format('UTC')},
      [
        '2025-01-01T12:00:00+00:00[UTC]',
        '2025-01-01T12:04:00+00:00[UTC]',
        '2025-01-01T12:08:00+00:00[UTC]',
        '2025-01-01T12:12:00+00:00[UTC]',
      ],
    );
  });

  test('SECONDLY interval=10: off-second empty; window aligned seconds', () => {
    const tz = 'UTC';
    const rule = new RRuleTemporal({
      freq: 'SECONDLY',
      interval: 10,
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
      tzid: tz,
    });

    let start = Temporal.ZonedDateTime.from('2025-01-01T00:00:07[UTC]');
    let end = Temporal.ZonedDateTime.from('2025-01-01T00:00:07[UTC]');
    assertDates({rule, between: [start, end], inc: true, print: format('UTC')}, []);

    start = Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]');
    end = Temporal.ZonedDateTime.from('2025-01-01T00:00:30[UTC]');
    assertDates(
      {rule, between: [start, end], inc: true, print: format('UTC')},
      [
        '2025-01-01T00:00:00+00:00[UTC]',
        '2025-01-01T00:00:10+00:00[UTC]',
        '2025-01-01T00:00:20+00:00[UTC]',
        '2025-01-01T00:00:30+00:00[UTC]',
      ],
    );
  });

  test('WEEKLY interval=4: BYDAY=WE off-week empty; month window aligned Wednesdays', () => {
    const tz = 'UTC';
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      interval: 4,
      byDay: ['WE'],
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'), // Wednesday
      tzid: tz,
    });

    // Off-week Wednesday (two weeks later)
    let start = Temporal.ZonedDateTime.from('2025-01-15T00:00:00[UTC]');
    let end = Temporal.ZonedDateTime.from('2025-01-15T23:59:59[UTC]');
    assertDates({rule, between: [start, end], inc: true, print: format('UTC')}, []);

    // Month window
    start = Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]');
    end = Temporal.ZonedDateTime.from('2025-01-31T23:59:59[UTC]');
    assertDates(
      {rule, between: [start, end], inc: true, print: format('UTC')},
      [
        '2025-01-01T00:00:00+00:00[UTC]',
        '2025-01-29T00:00:00+00:00[UTC]',
      ],
    );
  });

  test('MONTHLY interval=4: BYMONTHDAY=10 off-month empty; window aligned 10ths', () => {
    const tz = 'UTC';
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      interval: 4,
      byMonthDay: [10],
      dtstart: Temporal.ZonedDateTime.from('2025-01-10T00:00:00[UTC]'),
      tzid: tz,
    });

    let start = Temporal.ZonedDateTime.from('2025-03-10T00:00:00[UTC]');
    let end = Temporal.ZonedDateTime.from('2025-03-10T23:59:59[UTC]');
    assertDates({rule, between: [start, end], inc: true, print: format('UTC')}, []);

    start = Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]');
    end = Temporal.ZonedDateTime.from('2025-10-31T23:59:59[UTC]');
    assertDates(
      {rule, between: [start, end], inc: true, print: format('UTC')},
      [
        '2025-01-10T00:00:00+00:00[UTC]',
        '2025-05-10T00:00:00+00:00[UTC]',
        '2025-09-10T00:00:00+00:00[UTC]',
      ],
    );
  });

  test('YEARLY interval=4: BYMONTH=11 off-year empty; window aligned years', () => {
    const tz = 'UTC';
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      interval: 4,
      byMonth: [11],
      dtstart: Temporal.ZonedDateTime.from('2024-11-01T00:00:00[UTC]'),
      tzid: tz,
    });

    let start = Temporal.ZonedDateTime.from('2025-11-01T00:00:00[UTC]');
    let end = Temporal.ZonedDateTime.from('2025-11-01T23:59:59[UTC]');
    assertDates({rule, between: [start, end], inc: true, print: format('UTC')}, []);

    start = Temporal.ZonedDateTime.from('2024-01-01T00:00:00[UTC]');
    end = Temporal.ZonedDateTime.from('2033-12-31T23:59:59[UTC]');
    assertDates(
      {rule, between: [start, end], inc: true, print: format('UTC')},
      [
        '2024-11-01T00:00:00+00:00[UTC]',
        '2028-11-01T00:00:00+00:00[UTC]',
        '2032-11-01T00:00:00+00:00[UTC]',
      ],
    );
  });
});

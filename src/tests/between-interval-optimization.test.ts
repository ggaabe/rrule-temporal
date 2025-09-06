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
});


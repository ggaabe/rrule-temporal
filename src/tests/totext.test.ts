import {RRuleTemporal} from '../index';
import {toText} from '../totext';
import {Temporal} from '@js-temporal/polyfill';

function zdt(y: number, m: number, d: number, h: number, tz = 'UTC') {
  return Temporal.ZonedDateTime.from({
    year: y,
    month: m,
    day: d,
    hour: h,
    minute: 0,
    timeZone: tz,
  });
}

describe('RRuleTemporal.toText', () => {
  test('daily rule', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      dtstart: zdt(2025, 1, 1, 0),
    });
    expect(toText(rule)).toBe('every day');
  });

  test('daily with hours', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      byHour: [10, 12, 17],
      dtstart: zdt(2025, 1, 1, 0),
    });
    expect(toText(rule)).toBe('every day at 10 AM, 12 PM and 5 PM UTC');
  });

  test('weekly with byday and hours', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      byDay: ['SU'],
      byHour: [10, 12, 17],
      dtstart: zdt(2025, 1, 1, 0),
    });
    expect(toText(rule)).toBe('every week on Sunday at 10 AM, 12 PM and 5 PM UTC');
  });

  test('daily with hour and minute', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      byHour: [17],
      byMinute: [30],
      dtstart: zdt(2025, 1, 1, 0, 'America/Chicago'),
    });
    expect(toText(rule)).toBe('every day at 5:30 PM CST');
  });

  test('daily with seconds', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      byHour: [6],
      byMinute: [15],
      bySecond: [45],
      dtstart: zdt(2025, 1, 1, 0, 'UTC'),
    });
    expect(toText(rule)).toBe('every day at 6:15:45 AM UTC');
  });

  test('weekdays shortcut', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      byDay: ['MO', 'TU', 'WE', 'TH', 'FR'],
      dtstart: zdt(2025, 1, 1, 0),
    });
    expect(toText(rule)).toBe('every weekday');
  });

  test('minutely interval', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      interval: 2,
      dtstart: zdt(2025, 1, 1, 0),
    });
    expect(toText(rule)).toBe('every 2 minutes');
  });

  test('until formatted', () => {
    const until = Temporal.Instant.from('2012-11-10T00:00:00Z').toZonedDateTimeISO('UTC');
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      until,
      dtstart: zdt(2012, 1, 1, 0),
    });
    expect(toText(rule)).toBe('every week on Sunday until November 10, 2012');
  });

  test('yearly byyearday', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      byYearDay: [100],
      dtstart: zdt(2025, 1, 1, 0, 'UTC'),
    });
    expect(toText(rule)).toBe('every year on the 100th day of the year');
  });

  test('yearly byweekno', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      byWeekNo: [20],
      dtstart: zdt(2025, 1, 1, 0, 'UTC'),
    });
    expect(toText(rule)).toBe('every year in week 20');
  });

  test('monthly with bysetpos', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      byDay: ['MO', 'WE'],
      bySetPos: [2],
      dtstart: zdt(2025, 1, 1, 0, 'UTC'),
    });
    expect(toText(rule)).toBe('every month on Monday and Wednesday on the 2nd instance');
  });

  test('rDate and exDate counts', () => {
    const rDate = [zdt(2025, 2, 10, 0, 'UTC')];
    const exDate = [zdt(2025, 3, 10, 0, 'UTC'), zdt(2025, 4, 10, 0, 'UTC')];
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 1,
      rDate,
      exDate,
      dtstart: zdt(2025, 1, 1, 0, 'UTC'),
    });
    expect(toText(rule)).toBe('every month for 1 time with 1 additional date excluding 2 dates');
  });

  test('weekly inherits dtstart minutes when BYMINUTE is omitted', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      byDay: ['SU'],
      byHour: [12],
      dtstart: Temporal.ZonedDateTime.from({
        year: 2026,
        month: 1,
        day: 1,
        hour: 10,
        minute: 30,
        timeZone: 'UTC',
      }),
    });
    expect(toText(rule)).toBe('every week on Sunday at 12:30 PM UTC');
  });

  test('weekly inherits weekday and time from DTSTART when BYDAY is omitted', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      dtstart: Temporal.ZonedDateTime.from({
        year: 2026,
        month: 1,
        day: 1,
        hour: 10,
        minute: 30,
        timeZone: 'UTC',
      }),
    });
    expect(toText(rule)).toBe('every week on Thursday at 10:30 AM UTC');
  });
});

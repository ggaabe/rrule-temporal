import {RRuleTemporal} from '../index';
import {Temporal} from 'temporal-polyfill';
import {assertDates, format, limit, parse, zdt} from './helpers';

const INVALID_DATE = '2020-01-01-01-01T:00:00:00Z';
const DATE_2019 = zdt(2019, 1, 1, 0, 'UTC');
const DATE_2019_DECEMBER_19 = zdt(2019, 12, 19, 0, 'UTC');
const DATE_2020 = zdt(2020, 1, 1, 0, 'UTC');
const DATE_2023_JAN_6_11PM = zdt(2023, 1, 6, 23, 'UTC');

describe('timezone default for rrules', function () {
  it('tzid provides default timezone if not specified in dtstart', () => {
    const timezone = 'Europe/Oslo';
    const rruleString = 'DTSTART:20230325T080000Z\nRRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=4';
    const rule = new RRuleTemporal({rruleString, tzid: timezone});
    assertDates({rule, print: format(timezone)}, [
      '2023-03-25T09:00:00+01:00[Europe/Oslo]',
      '2023-04-08T09:00:00+02:00[Europe/Oslo]',
      '2023-04-22T09:00:00+02:00[Europe/Oslo]',
      '2023-05-06T09:00:00+02:00[Europe/Oslo]',
    ]);
    assertDates({rule}, [
      '2023-03-25T08:00:00.000Z',
      '2023-04-08T07:00:00.000Z',
      '2023-04-22T07:00:00.000Z',
      '2023-05-06T07:00:00.000Z',
    ]);
    expect(rule.toString()).toEqual('DTSTART;TZID=Europe/Oslo:20230325T090000\nRRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=4');
  });
  it('always use timezone specified in dtstart', () => {
    const timezone = 'Australia/Sydney';
    const rruleString = 'DTSTART;TZID=Europe/Oslo:20230325T090000\nRRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=4';
    const rule = new RRuleTemporal({rruleString, tzid: timezone});
    assertDates({rule, print: format('Europe/Oslo')}, [
      '2023-03-25T09:00:00+01:00[Europe/Oslo]',
      '2023-04-08T09:00:00+02:00[Europe/Oslo]',
      '2023-04-22T09:00:00+02:00[Europe/Oslo]',
      '2023-05-06T09:00:00+02:00[Europe/Oslo]',
    ]);
    assertDates({rule}, [
      '2023-03-25T08:00:00.000Z',
      '2023-04-08T07:00:00.000Z',
      '2023-04-22T07:00:00.000Z',
      '2023-05-06T07:00:00.000Z',
    ]);
    expect(rule.toString()).toEqual('DTSTART;TZID=Europe/Oslo:20230325T090000\nRRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=4');
  });
  it('Every 2nd Sunday every month 5 times for Sydney', function () {
    const timezone = 'Australia/Sydney';
    const rruleString = 'DTSTART:20240201T080000Z\nRRULE:FREQ=MONTHLY;BYSETPOS=2;BYDAY=SU;INTERVAL=1;COUNT=5';
    const rule = new RRuleTemporal({rruleString, tzid: timezone});
    assertDates({rule}, [
      '2024-02-11T08:00:00.000Z',
      '2024-03-10T08:00:00.000Z',
      '2024-04-14T09:00:00.000Z',
      '2024-05-12T09:00:00.000Z',
      '2024-06-09T09:00:00.000Z',
    ]);
    expect(rule.toString()).toEqual(
      'DTSTART;TZID=Australia/Sydney:20240201T190000\nRRULE:FREQ=MONTHLY;COUNT=5;BYDAY=SU;BYSETPOS=2',
    );
  });
});

describe('Additional smoke tests', () => {
  // Cover some scenarios not tested in the iCalendar.org examples, in particular bySecond, and
  // integration tests to make sure invalid inputs get ignored gracefully

  describe('secondly frequency', () => {
    it('Every second', () => {
      const rule = new RRuleTemporal({
        dtstart: DATE_2023_JAN_6_11PM,
        freq: 'SECONDLY',
        interval: 1,
        tzid: 'UTC',
      });
      assertDates({rule, limit: 12}, [
        '2023-01-06T23:00:00.000Z',
        '2023-01-06T23:00:01.000Z',
        '2023-01-06T23:00:02.000Z',
        '2023-01-06T23:00:03.000Z',
        '2023-01-06T23:00:04.000Z',
        '2023-01-06T23:00:05.000Z',
        '2023-01-06T23:00:06.000Z',
        '2023-01-06T23:00:07.000Z',
        '2023-01-06T23:00:08.000Z',
        '2023-01-06T23:00:09.000Z',
        '2023-01-06T23:00:10.000Z',
        '2023-01-06T23:00:11.000Z',
      ]);
    });

    it('Every 15 seconds', () => {
      const rule = new RRuleTemporal({
        dtstart: DATE_2023_JAN_6_11PM,
        freq: 'SECONDLY',
        interval: 15,
        tzid: 'UTC',
      });
      assertDates({rule, limit: 12}, [
        '2023-01-06T23:00:00.000Z',
        '2023-01-06T23:00:15.000Z',
        '2023-01-06T23:00:30.000Z',
        '2023-01-06T23:00:45.000Z',
        '2023-01-06T23:01:00.000Z',
        '2023-01-06T23:01:15.000Z',
        '2023-01-06T23:01:30.000Z',
        '2023-01-06T23:01:45.000Z',
        '2023-01-06T23:02:00.000Z',
        '2023-01-06T23:02:15.000Z',
        '2023-01-06T23:02:30.000Z',
        '2023-01-06T23:02:45.000Z',
      ]);
    });
  });

  describe('byDay', () => {
    it('accounts for timezone when determining day of the week', () => {
      const rule = new RRuleTemporal({
        dtstart: DATE_2023_JAN_6_11PM,
        freq: 'WEEKLY',
        interval: 1,
        tzid: 'Europe/Madrid',
        byDay: ['SA'],
      });
      assertDates({rule, limit: 12}, [
        '2023-01-07T23:00:00.000Z',
        '2023-01-14T23:00:00.000Z',
        '2023-01-21T23:00:00.000Z',
        '2023-01-28T23:00:00.000Z',
        '2023-02-04T23:00:00.000Z',
        '2023-02-11T23:00:00.000Z',
        '2023-02-18T23:00:00.000Z',
        '2023-02-25T23:00:00.000Z',
        '2023-03-04T23:00:00.000Z',
        '2023-03-11T23:00:00.000Z',
        '2023-03-18T23:00:00.000Z',
        '2023-03-25T23:00:00.000Z',
      ]);

      const rule2 = new RRuleTemporal({
        dtstart: DATE_2023_JAN_6_11PM,
        freq: 'WEEKLY',
        interval: 1,
        tzid: 'UTC',
        byDay: ['SA'],
      });
      assertDates({rule: rule2, limit: 12}, [
        '2023-01-07T23:00:00.000Z',
        '2023-01-14T23:00:00.000Z',
        '2023-01-21T23:00:00.000Z',
        '2023-01-28T23:00:00.000Z',
        '2023-02-04T23:00:00.000Z',
        '2023-02-11T23:00:00.000Z',
        '2023-02-18T23:00:00.000Z',
        '2023-02-25T23:00:00.000Z',
        '2023-03-04T23:00:00.000Z',
        '2023-03-11T23:00:00.000Z',
        '2023-03-18T23:00:00.000Z',
        '2023-03-25T23:00:00.000Z',
      ]);
    });

    it('ignores invalid byDay values', () => {
      const rule = new RRuleTemporal({
        dtstart: DATE_2019_DECEMBER_19,
        freq: 'WEEKLY',
        interval: 1,
        tzid: 'UTC',
        // @ts-expect-error Expect invalid values
        byDay: ['TH', 0, -2],
      });
      assertDates({rule, limit: 14}, [
        '2019-12-19T00:00:00.000Z',
        '2019-12-26T00:00:00.000Z',
        '2020-01-02T00:00:00.000Z',
        '2020-01-09T00:00:00.000Z',
        '2020-01-16T00:00:00.000Z',
        '2020-01-23T00:00:00.000Z',
        '2020-01-30T00:00:00.000Z',
        '2020-02-06T00:00:00.000Z',
        '2020-02-13T00:00:00.000Z',
        '2020-02-20T00:00:00.000Z',
        '2020-02-27T00:00:00.000Z',
        '2020-03-05T00:00:00.000Z',
        '2020-03-12T00:00:00.000Z',
        '2020-03-19T00:00:00.000Z',
      ]);

      const rule2 = new RRuleTemporal({
        dtstart: DATE_2019,
        freq: 'WEEKLY',
        interval: 1,
        tzid: 'UTC',
        // @ts-expect-error Expect invalid values
        byDay: ['SA', 'SU', 'MO', 0],
      });

      assertDates({rule: rule2, limit: 9}, [
        '2019-01-05T00:00:00.000Z',
        '2019-01-06T00:00:00.000Z',
        '2019-01-07T00:00:00.000Z',
        '2019-01-12T00:00:00.000Z',
        '2019-01-13T00:00:00.000Z',
        '2019-01-14T00:00:00.000Z',
        '2019-01-19T00:00:00.000Z',
        '2019-01-20T00:00:00.000Z',
        '2019-01-21T00:00:00.000Z',
      ]);
    });
  });

  describe('byMonth', () => {
    it('ignores invalid byMonth values', () => {
      const rule = new RRuleTemporal({
        dtstart: DATE_2019_DECEMBER_19,
        freq: 'YEARLY',
        interval: 1,
        tzid: 'UTC',
        byMonth: [0],
      });
      assertDates({rule, limit: 14}, [
        '2019-12-19T00:00:00.000Z',
        '2020-12-19T00:00:00.000Z',
        '2021-12-19T00:00:00.000Z',
        '2022-12-19T00:00:00.000Z',
        '2023-12-19T00:00:00.000Z',
        '2024-12-19T00:00:00.000Z',
        '2025-12-19T00:00:00.000Z',
        '2026-12-19T00:00:00.000Z',
        '2027-12-19T00:00:00.000Z',
        '2028-12-19T00:00:00.000Z',
        '2029-12-19T00:00:00.000Z',
        '2030-12-19T00:00:00.000Z',
        '2031-12-19T00:00:00.000Z',
        '2032-12-19T00:00:00.000Z',
      ]);
    });
  });

  describe('byHour, byMinute, bySecond', () => {
    it('works with daily frequency', () => {
      const rule = new RRuleTemporal({
        dtstart: DATE_2019_DECEMBER_19,
        freq: 'DAILY',
        interval: 1,
        tzid: 'UTC',
        byHour: [14],
        byMinute: [30],
        bySecond: [0, 15],
      });
      assertDates({rule, limit: 14}, [
        '2019-12-19T14:30:00.000Z',
        '2019-12-19T14:30:15.000Z',
        '2019-12-20T14:30:00.000Z',
        '2019-12-20T14:30:15.000Z',
        '2019-12-21T14:30:00.000Z',
        '2019-12-21T14:30:15.000Z',
        '2019-12-22T14:30:00.000Z',
        '2019-12-22T14:30:15.000Z',
        '2019-12-23T14:30:00.000Z',
        '2019-12-23T14:30:15.000Z',
        '2019-12-24T14:30:00.000Z',
        '2019-12-24T14:30:15.000Z',
        '2019-12-25T14:30:00.000Z',
        '2019-12-25T14:30:15.000Z',
      ]);
    });

    it('works with hourly frequency', () => {
      const rule = new RRuleTemporal({
        dtstart: DATE_2019_DECEMBER_19,
        freq: 'HOURLY',
        interval: 1,
        tzid: 'UTC',
        byMinute: [15, 30],
        bySecond: [30, 0],
      });
      assertDates({rule, limit: 14}, [
        '2019-12-19T00:15:00.000Z',
        '2019-12-19T00:15:30.000Z',
        '2019-12-19T00:30:00.000Z',
        '2019-12-19T00:30:30.000Z',
        '2019-12-19T01:15:00.000Z',
        '2019-12-19T01:15:30.000Z',
        '2019-12-19T01:30:00.000Z',
        '2019-12-19T01:30:30.000Z',
        '2019-12-19T02:15:00.000Z',
        '2019-12-19T02:15:30.000Z',
        '2019-12-19T02:30:00.000Z',
        '2019-12-19T02:30:30.000Z',
        '2019-12-19T03:15:00.000Z',
        '2019-12-19T03:15:30.000Z',
      ]);
    });

    it('works with minutely frequency', () => {
      const rule = new RRuleTemporal({
        dtstart: DATE_2019_DECEMBER_19,
        freq: 'MINUTELY',
        interval: 1,
        tzid: 'UTC',
        bySecond: [10, 30, 58],
      });
      assertDates({rule, limit: 14}, [
        '2019-12-19T00:00:10.000Z',
        '2019-12-19T00:00:30.000Z',
        '2019-12-19T00:00:58.000Z',
        '2019-12-19T00:01:10.000Z',
        '2019-12-19T00:01:30.000Z',
        '2019-12-19T00:01:58.000Z',
        '2019-12-19T00:02:10.000Z',
        '2019-12-19T00:02:30.000Z',
        '2019-12-19T00:02:58.000Z',
        '2019-12-19T00:03:10.000Z',
        '2019-12-19T00:03:30.000Z',
        '2019-12-19T00:03:58.000Z',
        '2019-12-19T00:04:10.000Z',
        '2019-12-19T00:04:30.000Z',
      ]);
    });

    it('works with secondly frequency', () => {
      const rule = new RRuleTemporal({
        dtstart: DATE_2019_DECEMBER_19,
        freq: 'SECONDLY',
        interval: 1,
        tzid: 'UTC',
        bySecond: [10, 30, 58],
      });
      assertDates({rule, limit: 14}, [
        '2019-12-19T00:00:10.000Z',
        '2019-12-19T00:00:30.000Z',
        '2019-12-19T00:00:58.000Z',
        '2019-12-19T00:01:10.000Z',
        '2019-12-19T00:01:30.000Z',
        '2019-12-19T00:01:58.000Z',
        '2019-12-19T00:02:10.000Z',
        '2019-12-19T00:02:30.000Z',
        '2019-12-19T00:02:58.000Z',
        '2019-12-19T00:03:10.000Z',
        '2019-12-19T00:03:30.000Z',
        '2019-12-19T00:03:58.000Z',
        '2019-12-19T00:04:10.000Z',
        '2019-12-19T00:04:30.000Z',
      ]);
    });

    it('Property names are are case-insensitive', function () {
      const rule = 'dtstart:19970902T090000Z\nrrule:freq=yearly;count=3';
      assertDates({rule: parse(rule)}, [
        '1997-09-02T09:00:00.000Z',
        '1998-09-02T09:00:00.000Z',
        '1999-09-02T09:00:00.000Z',
      ]);
    });

    it('Unfold strings before processing', function () {
      const rule = 'dtstart:19970902T090000Z\nrrule:FREQ=YEA\n RLY;COUNT=3\n';
      assertDates({rule: parse(rule)}, [
        '1997-09-02T09:00:00.000Z',
        '1998-09-02T09:00:00.000Z',
        '1999-09-02T09:00:00.000Z',
      ]);
    });
  });

  describe('byYearDay', () => {
    it('respects leap years', () => {
      const rule3 = new RRuleTemporal({
        dtstart: DATE_2020,
        freq: 'YEARLY',
        byYearDay: [92],
        interval: 1,
        tzid: 'UTC',
      });

      assertDates({rule: rule3, limit: 10}, [
        '2020-04-01T00:00:00.000Z',
        '2021-04-02T00:00:00.000Z',
        '2022-04-02T00:00:00.000Z',
        '2023-04-02T00:00:00.000Z',
        '2024-04-01T00:00:00.000Z',
        '2025-04-02T00:00:00.000Z',
        '2026-04-02T00:00:00.000Z',
        '2027-04-02T00:00:00.000Z',
        '2028-04-01T00:00:00.000Z',
        '2029-04-02T00:00:00.000Z',
      ]);
    });

    it('ignores invalid byYearDay values', () => {
      const rule = new RRuleTemporal({
        dtstart: DATE_2020,
        freq: 'YEARLY',
        byYearDay: [0, -1], // 0 is not a valid day
        interval: 1,
        tzid: 'UTC',
      });

      assertDates({rule, limit: 10}, [
        '2020-12-31T00:00:00.000Z',
        '2021-12-31T00:00:00.000Z',
        '2022-12-31T00:00:00.000Z',
        '2023-12-31T00:00:00.000Z',
        '2024-12-31T00:00:00.000Z',
        '2025-12-31T00:00:00.000Z',
        '2026-12-31T00:00:00.000Z',
        '2027-12-31T00:00:00.000Z',
        '2028-12-31T00:00:00.000Z',
        '2029-12-31T00:00:00.000Z',
      ]);
    });
  });
});

describe('Error handling', () => {
  it('throws an error on an invalid dtstart', () => {
    const testFn = () =>
      new RRuleTemporal({
        // @ts-ignore
        dtstart: INVALID_DATE,
        freq: 'HOURLY',
        interval: 1,
        tzid: 'UTC',
      });
    expect(testFn).toThrowErrorMatchingInlineSnapshot(`"Manual dtstart must be a ZonedDateTime"`);
  });

  it('throws an error on an invalid until', () => {
    const testFn = () =>
      new RRuleTemporal({
        dtstart: DATE_2020,
        // @ts-ignore
        until: INVALID_DATE,
        freq: 'HOURLY',
        interval: 1,
        tzid: 'UTC',
      });
    expect(testFn).toThrowErrorMatchingInlineSnapshot(`"Manual until must be a ZonedDateTime"`);
  });

  it('throws an error on an interval of 0', () => {
    const testFn = () =>
      new RRuleTemporal({
        dtstart: DATE_2020,
        freq: 'HOURLY',
        interval: 0,
        tzid: 'UTC',
      });
    expect(testFn).toThrowErrorMatchingInlineSnapshot(`"Cannot create RRule: interval must be greater than 0"`);
  });

  it('throws an error when exceeding the iteration limit', () => {
    const testFn = () => {
      const rule = new RRuleTemporal({
        dtstart: DATE_2020,
        freq: 'YEARLY',
        interval: 1,
        tzid: 'UTC',
      });
      rule.all();
    };

    expect(testFn).toThrowErrorMatchingInlineSnapshot(`"all() requires iterator when no COUNT/UNTIL"`);
  });

  it('Can return max-1 entries', function () {
    const dtstart = Temporal.ZonedDateTime.from('2025-01-01T10:00:00[UTC]');
    const rule = new RRuleTemporal({freq: 'DAILY', dtstart, maxIterations: 1000});
    expect(rule.all(limit(999))).toHaveLength(999);
  });

  it('Support custom max iterations for rrule string', function () {
    const rrule = 'DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=DAILY;';
    expect(() => {
      parse(rrule, {maxIterations: 1000}).all(() => true); // Iterator that never stops
    }).toThrow('Maximum iterations (1000) exceeded in all()');
  });

  it('Max iterations=10000 default for rrule string', function () {
    const rrule = 'DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=DAILY;';
    expect(() => {
      parse(rrule).all(() => true); // Iterator that never stops
    }).toThrow('Maximum iterations (10000) exceeded in all()');
  });
});

describe('DST timezones and repeat', () => {
  it('should respect DST changes', function () {
    const tz = 'Australia/Sydney';
    const rule = new RRuleTemporal({
      dtstart: zdt(2024, 3, 12, 22, tz),
      freq: 'MONTHLY',
      interval: 1,
      tzid: tz,
    });
    assertDates({rule, print: format(tz), limit: 20}, [
      '2024-03-12T22:00:00+11:00[Australia/Sydney]',
      '2024-04-12T22:00:00+10:00[Australia/Sydney]',
      '2024-05-12T22:00:00+10:00[Australia/Sydney]',
      '2024-06-12T22:00:00+10:00[Australia/Sydney]',
      '2024-07-12T22:00:00+10:00[Australia/Sydney]',
      '2024-08-12T22:00:00+10:00[Australia/Sydney]',
      '2024-09-12T22:00:00+10:00[Australia/Sydney]',
      '2024-10-12T22:00:00+11:00[Australia/Sydney]',
      '2024-11-12T22:00:00+11:00[Australia/Sydney]',
      '2024-12-12T22:00:00+11:00[Australia/Sydney]',
      '2025-01-12T22:00:00+11:00[Australia/Sydney]',
      '2025-02-12T22:00:00+11:00[Australia/Sydney]',
      '2025-03-12T22:00:00+11:00[Australia/Sydney]',
      '2025-04-12T22:00:00+10:00[Australia/Sydney]',
      '2025-05-12T22:00:00+10:00[Australia/Sydney]',
      '2025-06-12T22:00:00+10:00[Australia/Sydney]',
      '2025-07-12T22:00:00+10:00[Australia/Sydney]',
      '2025-08-12T22:00:00+10:00[Australia/Sydney]',
      '2025-09-12T22:00:00+10:00[Australia/Sydney]',
      '2025-10-12T22:00:00+11:00[Australia/Sydney]',
    ]);
    assertDates({rule, limit: 20}, [
      '2024-03-12T11:00:00.000Z',
      '2024-04-12T12:00:00.000Z',
      '2024-05-12T12:00:00.000Z',
      '2024-06-12T12:00:00.000Z',
      '2024-07-12T12:00:00.000Z',
      '2024-08-12T12:00:00.000Z',
      '2024-09-12T12:00:00.000Z',
      '2024-10-12T11:00:00.000Z',
      '2024-11-12T11:00:00.000Z',
      '2024-12-12T11:00:00.000Z',
      '2025-01-12T11:00:00.000Z',
      '2025-02-12T11:00:00.000Z',
      '2025-03-12T11:00:00.000Z',
      '2025-04-12T12:00:00.000Z',
      '2025-05-12T12:00:00.000Z',
      '2025-06-12T12:00:00.000Z',
      '2025-07-12T12:00:00.000Z',
      '2025-08-12T12:00:00.000Z',
      '2025-09-12T12:00:00.000Z',
      '2025-10-12T11:00:00.000Z',
    ]);
  });
});

describe('includeDtstart option', () => {
  it("when includeDtstart is true, yields dtstart as an occurrence even if it doesn't match the RRule", () => {
    const rule = new RRuleTemporal({
      dtstart: DATE_2019_DECEMBER_19,
      freq: 'MONTHLY',
      interval: 1,
      tzid: 'UTC',
      byMonth: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      includeDtstart: true,
    });
    assertDates({rule, limit: 5}, [
      '2019-12-19T00:00:00.000Z',
      '2020-01-19T00:00:00.000Z',
      '2020-02-19T00:00:00.000Z',
      '2020-03-19T00:00:00.000Z',
      '2020-04-19T00:00:00.000Z',
    ]);
  });

  it('when false (default), only yields dtstart if it actually matches the RRule', () => {
    const config = {
      dtstart: DATE_2019_DECEMBER_19,
      freq: 'MONTHLY' as const,
      interval: 1,
      tzid: 'UTC',
      byMonth: [1, 2, 3],
    };
    const rule1 = new RRuleTemporal({...config}); // default includeDtstart: false
    const rule2 = new RRuleTemporal({...config, includeDtstart: true});
    assertDates({rule: rule1, limit: 3}, [
      '2020-01-19T00:00:00.000Z',
      '2020-02-19T00:00:00.000Z',
      '2020-03-19T00:00:00.000Z',
    ]);
    assertDates({rule: rule2, limit: 3}, [
      '2019-12-19T00:00:00.000Z',
      '2020-01-19T00:00:00.000Z',
      '2020-02-19T00:00:00.000Z',
    ]);
  });

  it('includeDtstart=true with rrule string, respects COUNT', function () {
    const rule = 'DTSTART;TZID=Europe/Berlin:20240530T200000\nRRULE:FREQ=WEEKLY;COUNT=3;INTERVAL=1;BYDAY=WE';
    assertDates({rule: parse(rule, {includeDtstart: true})}, [
      '2024-05-30T18:00:00.000Z',
      '2024-06-05T18:00:00.000Z',
      '2024-06-12T18:00:00.000Z',
    ]);
  });

  it('includeDtstart=false with rrule string', function () {
    const rule = 'DTSTART;TZID=Europe/Berlin:20240530T200000\nRRULE:FREQ=WEEKLY;COUNT=3;INTERVAL=1;BYDAY=WE';
    assertDates({rule: parse(rule, {includeDtstart: false})}, [
      '2024-06-05T18:00:00.000Z',
      '2024-06-12T18:00:00.000Z',
      '2024-06-19T18:00:00.000Z',
    ]);
  });

  // from https://github.com/fmeringdal/rust-rrule/issues/119
  it('includeDtstart=true and dtstart is synchronized should not duplicate', function () {
    const rule =
      'DTSTART;TZID=Europe/Berlin:20240530T200000\n' +
      'RDATE;TZID=Europe/Berlin:20240530T200000\n' +
      'RRULE:FREQ=DAILY;COUNT=3';
    assertDates({rule: parse(rule, {includeDtstart: true})}, [
      '2024-05-30T18:00:00.000Z',
      '2024-05-31T18:00:00.000Z',
      '2024-06-01T18:00:00.000Z',
    ]);
  });
});

// tests and issues from https://github.com/fmeringdal/rust-rrule
describe('Tests from rust package', function () {
  it('every 2 months on the last Monday', function () {
    const rule = 'DTSTART;TZID=Europe/London:20231030T140000\nRRULE:FREQ=MONTHLY;INTERVAL=2;BYDAY=-1MO';
    assertDates({rule: parse(rule), limit: 3}, [
      '2023-10-30T14:00:00.000Z',
      '2023-12-25T14:00:00.000Z',
      '2024-02-26T14:00:00.000Z',
    ]);
  });

  describe('Monthly on 31st or -31st of the month', function () {
    // Recurrence rules may generate recurrence instances with an invalid date (e.g., February 30)
    // or nonexistent local time (e.g., 1:30 AM on a day where the local time is moved forward by an
    // hour at 1:00 AM). Such recurrence instances MUST be ignored and MUST NOT be counted as
    // part of the recurrence set.
    it('Monthly on the 31st of the month', function () {
      const rule = 'DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=MONTHLY;COUNT=10;BYMONTHDAY=31';
      assertDates({rule: parse(rule)}, [
        '1997-10-31T14:00:00.000Z',
        '1997-12-31T14:00:00.000Z',
        '1998-01-31T14:00:00.000Z',
        '1998-03-31T14:00:00.000Z',
        '1998-05-31T13:00:00.000Z',
        '1998-07-31T13:00:00.000Z',
        '1998-08-31T13:00:00.000Z',
        '1998-10-31T14:00:00.000Z',
        '1998-12-31T14:00:00.000Z',
        '1999-01-31T14:00:00.000Z',
      ]);
    });

    it('Monthly on the 31th-to-last of the month', function () {
      const rule = 'DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=MONTHLY;COUNT=10;BYMONTHDAY=-31';
      assertDates({rule: parse(rule)}, [
        '1997-10-01T13:00:00.000Z',
        '1997-12-01T14:00:00.000Z',
        '1998-01-01T14:00:00.000Z',
        '1998-03-01T14:00:00.000Z',
        '1998-05-01T13:00:00.000Z',
        '1998-07-01T13:00:00.000Z',
        '1998-08-01T13:00:00.000Z',
        '1998-10-01T13:00:00.000Z',
        '1998-12-01T14:00:00.000Z',
        '1999-01-01T14:00:00.000Z',
      ]);
    });
  });

  const FOUR_HOURS_MS = 14400000;
  it('DST hourly/minutes handling GMT -> BST', function () {
    const tz = 'Europe/London';
    const rule = `DTSTART;TZID=${tz}:20240330T000000\nRRULE:FREQ=DAILY;BYHOUR=0,1,2,3,4;BYMINUTE=0,30`;
    const Y2024_03_31_UTC = 1711843200000;
    const between = [new Date(Y2024_03_31_UTC - FOUR_HOURS_MS), new Date(Y2024_03_31_UTC + FOUR_HOURS_MS)];

    assertDates({rule: parse(rule), between, print: format(tz)}, [
      '2024-03-31T00:00:00+00:00[Europe/London]',
      '2024-03-31T00:30:00+00:00[Europe/London]',
      // change over at 1am, have gaps
      '2024-03-31T02:00:00+01:00[Europe/London]',
      '2024-03-31T02:30:00+01:00[Europe/London]',
      '2024-03-31T03:00:00+01:00[Europe/London]',
      '2024-03-31T03:30:00+01:00[Europe/London]',
      '2024-03-31T04:00:00+01:00[Europe/London]',
      '2024-03-31T04:30:00+01:00[Europe/London]',
    ]);
    assertDates({rule: parse(rule), between}, [
      '2024-03-31T00:00:00.000Z',
      '2024-03-31T00:30:00.000Z',
      '2024-03-31T01:00:00.000Z',
      '2024-03-31T01:30:00.000Z',
      '2024-03-31T02:00:00.000Z',
      '2024-03-31T02:30:00.000Z',
      '2024-03-31T03:00:00.000Z',
      '2024-03-31T03:30:00.000Z',
    ]);
  });

  it('DST hourly/minutes handling GMT -> BST using hourly', function () {
    const tz = 'Europe/London';
    const rule = `DTSTART;TZID=${tz}:20240330T230000\nRRULE:FREQ=HOURLY;COUNT=5`;
    assertDates({rule: parse(rule), print: format(tz)}, [
      '2024-03-30T23:00:00+00:00[Europe/London]',
      '2024-03-31T00:00:00+00:00[Europe/London]',
      '2024-03-31T02:00:00+01:00[Europe/London]',
      '2024-03-31T03:00:00+01:00[Europe/London]',
      '2024-03-31T04:00:00+01:00[Europe/London]',
    ]);
    assertDates({rule: parse(rule)}, [
      '2024-03-30T23:00:00.000Z',
      '2024-03-31T00:00:00.000Z',
      '2024-03-31T01:00:00.000Z',
      '2024-03-31T02:00:00.000Z',
      '2024-03-31T03:00:00.000Z',
    ]);
  });

  it('BYHOUR DST hourly/minutes handling BST -> GMT', function () {
    const tz = 'Europe/London';
    const rule = `DTSTART;TZID=${tz}:20241026T000000\nRRULE:FREQ=DAILY;BYHOUR=0,1,2,3,4;BYMINUTE=0,30`;
    const Y2024_10_27_UTC = 1729987200000;
    const between = [new Date(Y2024_10_27_UTC - FOUR_HOURS_MS), new Date(Y2024_10_27_UTC + FOUR_HOURS_MS)];
    // should have no gaps
    assertDates({rule: parse(rule), between, inc: false, print: format(tz)}, [
      '2024-10-27T00:00:00+01:00[Europe/London]',
      '2024-10-27T00:30:00+01:00[Europe/London]',
      '2024-10-27T01:00:00+01:00[Europe/London]',
      '2024-10-27T01:30:00+01:00[Europe/London]',
      '2024-10-27T02:00:00+00:00[Europe/London]',
      '2024-10-27T02:30:00+00:00[Europe/London]',
      '2024-10-27T03:00:00+00:00[Europe/London]',
      '2024-10-27T03:30:00+00:00[Europe/London]',
    ]);
    assertDates({rule: parse(rule), inc: false, between}, [
      '2024-10-26T23:00:00.000Z',
      '2024-10-26T23:30:00.000Z',
      '2024-10-27T00:00:00.000Z',
      '2024-10-27T00:30:00.000Z',
      // change over at 2am
      '2024-10-27T02:00:00.000Z',
      '2024-10-27T02:30:00.000Z',
      '2024-10-27T03:00:00.000Z',
      '2024-10-27T03:30:00.000Z',
    ]);
  });
  it('HOURLY DST hourly/minutes handling BST -> GMT', function () {
    const tz = 'Europe/London';
    const rule = `DTSTART;TZID=${tz}:20241027T000000\nRRULE:FREQ=HOURLY;COUNT=5`;
    assertDates({rule: parse(rule), print: format(tz)}, [
      '2024-10-27T00:00:00+01:00[Europe/London]',
      '2024-10-27T01:00:00+01:00[Europe/London]',
      '2024-10-27T02:00:00+00:00[Europe/London]',
      '2024-10-27T03:00:00+00:00[Europe/London]',
      '2024-10-27T04:00:00+00:00[Europe/London]',
    ]);
    assertDates({rule: parse(rule)}, [
      '2024-10-26T23:00:00.000Z',
      '2024-10-27T00:00:00.000Z',
      '2024-10-27T02:00:00.000Z',
      '2024-10-27T03:00:00.000Z',
      '2024-10-27T04:00:00.000Z',
    ]);
  });
});

describe('exDate', function () {
  it('Multiple exDate', function () {
    const rule = 'DTSTART:20201114T000000Z\nRRULE:FREQ=DAILY\nEXDATE;TZID=UTC:20201121T000000,20201128T000000Z';
    const between = [new Date('2020-11-14T00:00:00.000Z'), new Date('2020-11-30T00:00:00.000Z')];
    assertDates({rule: parse(rule), between, inc: false}, [
      '2020-11-15T00:00:00.000Z',
      '2020-11-16T00:00:00.000Z',
      '2020-11-17T00:00:00.000Z',
      '2020-11-18T00:00:00.000Z',
      '2020-11-19T00:00:00.000Z',
      '2020-11-20T00:00:00.000Z',
      '2020-11-22T00:00:00.000Z',
      '2020-11-23T00:00:00.000Z',
      '2020-11-24T00:00:00.000Z',
      '2020-11-25T00:00:00.000Z',
      '2020-11-26T00:00:00.000Z',
      '2020-11-27T00:00:00.000Z',
      '2020-11-29T00:00:00.000Z',
    ]);
  });
});

describe('rDate', () => {
  it("includes RDates in the occurrences list even if they don't match the RRule", () => {
    const rule = new RRuleTemporal({
      dtstart: DATE_2019_DECEMBER_19,
      freq: 'MONTHLY',
      interval: 2,
      tzid: 'UTC',
      count: 10,
      rDate: [zdt(2020, 5, 14, 0, 'UTC'), zdt(2020, 5, 15, 0, 'UTC'), zdt(2020, 7, 18, 0, 'UTC')],
    });
    assertDates({rule}, [
      '2019-12-19T00:00:00.000Z',
      '2020-02-19T00:00:00.000Z',
      '2020-04-19T00:00:00.000Z',
      '2020-05-14T00:00:00.000Z',
      '2020-05-15T00:00:00.000Z',
      '2020-06-19T00:00:00.000Z',
      '2020-07-18T00:00:00.000Z',
      '2020-08-19T00:00:00.000Z',
      '2020-10-19T00:00:00.000Z',
      '2020-12-19T00:00:00.000Z',
    ]);
  });

  it('does not yield RDates twice if they already match the RRule', () => {
    const rule = new RRuleTemporal({
      dtstart: DATE_2019_DECEMBER_19,
      freq: 'MONTHLY',
      interval: 2,
      tzid: 'UTC',
      count: 10,
      rDate: [zdt(2020, 4, 19, 0, 'UTC'), zdt(2020, 5, 15, 0, 'UTC'), zdt(2020, 7, 18, 0, 'UTC')],
    });
    assertDates({rule}, [
      '2019-12-19T00:00:00.000Z',
      '2020-02-19T00:00:00.000Z',
      '2020-04-19T00:00:00.000Z',
      '2020-05-15T00:00:00.000Z',
      '2020-06-19T00:00:00.000Z',
      '2020-07-18T00:00:00.000Z',
      '2020-08-19T00:00:00.000Z',
      '2020-10-19T00:00:00.000Z',
      '2020-12-19T00:00:00.000Z',
      '2021-02-19T00:00:00.000Z',
    ]);
  });

  it('parses rDate value', function () {
    const rule =
      'DTSTART:19970713T000000Z\nRRULE:FREQ=WEEKLY;COUNT=10\n' +
      'RDATE:19970714T000000Z\n' +
      'RDATE;TZID=America/New_York:19970715T000000';
    assertDates({rule: parse(rule)}, [
      '1997-07-13T00:00:00.000Z',
      '1997-07-14T00:00:00.000Z',
      '1997-07-15T04:00:00.000Z',
      '1997-07-20T00:00:00.000Z',
      '1997-07-27T00:00:00.000Z',
      '1997-08-03T00:00:00.000Z',
      '1997-08-10T00:00:00.000Z',
      '1997-08-17T00:00:00.000Z',
      '1997-08-24T00:00:00.000Z',
      '1997-08-31T00:00:00.000Z',
    ]);
  });
});

describe('RRuleTemporal - Error Handling and Edge Cases', () => {
  it('should throw when parsing RRULE-only without fallback dtstart', () => {
    expect(() => {
      new RRuleTemporal({rruleString: 'RRULE:FREQ=DAILY;COUNT=5'});
    }).toThrow('dtstart required when parsing RRULE alone');
  });

  it('should handle string dtstart validation', () => {
    expect(() => {
      new RRuleTemporal({
        freq: 'DAILY',
        dtstart: 'invalid-date-string' as any,
      });
    }).toThrow();
  });

  it('should handle zero interval', () => {
    expect(() => {
      new RRuleTemporal({
        freq: 'DAILY',
        interval: 0,
        dtstart: Temporal.ZonedDateTime.from('2025-01-01T10:00:00[UTC]'),
      });
    }).toThrow('interval must be greater than 0');
  });

  it('should handle negative interval', () => {
    expect(() => {
      new RRuleTemporal({
        freq: 'DAILY',
        interval: -1,
        dtstart: Temporal.ZonedDateTime.from('2025-01-01T10:00:00[UTC]'),
      });
    }).toThrow('interval must be greater than 0');
  });

  it('should throw non-UTC UNTIL values', () => {
    const ics = `DTSTART;TZID=America/Chicago:20250320T170000\nRRULE:FREQ=DAILY;UNTIL=20250325T170000;COUNT=5`;
    expect(() => new RRuleTemporal({rruleString: ics})).toThrow();
  });
});

describe('RRuleTemporal - BYSECOND Rules', () => {
  it('should handle SECONDLY frequency with BYSECOND', () => {
    const rule = new RRuleTemporal({
      freq: 'SECONDLY',
      bySecond: [0, 15, 30, 45],
      count: 8,
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T12:00:00[UTC]'),
    });
    const dates = rule.all();
    expect(dates).toHaveLength(8);
    expect(dates.map((d) => d.second)).toEqual([0, 15, 30, 45, 0, 15, 30, 45]);
  });

  it('should handle BYSECOND with different frequencies', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      bySecond: [10, 20, 30],
      count: 6,
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T12:00:00[UTC]'),
    });
    const dates = rule.all();
    expect(dates).toHaveLength(6);
    expect(dates.map((d) => d.second)).toEqual([10, 20, 30, 10, 20, 30]);
  });

  it('should handle BYSECOND with HOURLY frequency', () => {
    const rule = new RRuleTemporal({
      freq: 'HOURLY',
      bySecond: [0, 30],
      count: 4,
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T12:00:00[UTC]'),
    });
    const dates = rule.all();
    expect(dates).toHaveLength(4);
    expect(dates.map((d) => d.second)).toEqual([0, 30, 0, 30]);
  });
});

describe('RRuleTemporal - BYWEEKNO Rules', () => {
  it('should handle yearly recurrence by positive week number', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      byWeekNo: [1, 26, 52],
      count: 6,
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T12:00:00[UTC]'),
    });
    assertDates({rule}, [
      '2025-01-01T12:00:00.000Z',
      '2025-06-25T12:00:00.000Z',
      '2025-12-24T12:00:00.000Z',
      '2025-12-31T12:00:00.000Z',
      '2026-06-24T12:00:00.000Z',
      '2026-12-23T12:00:00.000Z',
    ]);
  });

  it('should handle yearly recurrence by negative week number', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      byWeekNo: [-1, -2],
      count: 4,
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T12:00:00[UTC]'),
    });
    assertDates({rule}, [
      '2025-12-17T12:00:00.000Z',
      '2025-12-24T12:00:00.000Z',
      '2026-12-23T12:00:00.000Z',
      '2026-12-30T12:00:00.000Z',
    ]);
  });

  it('should handle BYWEEKNO with BYDAY', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      byWeekNo: [1, 2],
      byDay: ['MO'],
      count: 4,
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T12:00:00[UTC]'),
    });
    assertDates({rule}, [
      // week 1 monday 2025 is before 2025-01-01 (Dec 30, 2024)
      '2025-01-06T12:00:00.000Z', // week 2 monday 2025 is Jan 6
      '2025-12-29T12:00:00.000Z', // week 1 monday 2026 is Dec 29
      '2026-01-05T12:00:00.000Z', // week 2 monday 2026 is Jan 5
      '2027-01-04T12:00:00.000Z', // week 1 monday 2027 is Jan 4
    ]);
  });
});

describe('RRuleTemporal - BYYEARDAY Rules', () => {
  it('should handle positive year days', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      byYearDay: [1, 100, 365],
      count: 6,
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T12:00:00[UTC]'),
    });
    assertDates({rule}, [
      '2025-01-01T12:00:00.000Z',
      '2025-04-10T12:00:00.000Z',
      '2025-12-31T12:00:00.000Z',
      '2026-01-01T12:00:00.000Z',
      '2026-04-10T12:00:00.000Z',
      '2026-12-31T12:00:00.000Z',
    ]);
  });

  it('should handle negative year days', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      byYearDay: [-1, -100],
      count: 4,
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T12:00:00[UTC]'),
    });
    assertDates({rule}, [
      '2025-09-23T12:00:00.000Z',
      '2025-12-31T12:00:00.000Z',
      '2026-09-23T12:00:00.000Z',
      '2026-12-31T12:00:00.000Z',
    ]);
  });

  it('should handle BYYEARDAY in leap year', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      byYearDay: [366, -1],
      count: 8,
      dtstart: Temporal.ZonedDateTime.from('2024-01-01T12:00:00[UTC]'),
    });
    // byYearDay:[366, -1] are on the same day...
    assertDates({rule}, [
      '2024-12-31T12:00:00.000Z',
      '2025-12-31T12:00:00.000Z',
      '2026-12-31T12:00:00.000Z',
      '2027-12-31T12:00:00.000Z',
      '2028-12-31T12:00:00.000Z',
      '2029-12-31T12:00:00.000Z',
      '2030-12-31T12:00:00.000Z',
      '2031-12-31T12:00:00.000Z',
    ]);
  });

  it('Monthly byYearDay', async () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 6,
      byYearDay: [32],
      dtstart: Temporal.ZonedDateTime.from({year: 2010, month: 3, day: 22, hour: 12, minute: 1, timeZone: 'UTC'}),
    });
    assertDates({rule}, [
      '2011-02-01T12:01:00.000Z',
      '2012-02-01T12:01:00.000Z',
      '2013-02-01T12:01:00.000Z',
      '2014-02-01T12:01:00.000Z',
      '2015-02-01T12:01:00.000Z',
      '2016-02-01T12:01:00.000Z',
    ]);
  });
});

describe('RRuleTemporal - Complex Time Patterns', () => {
  it('should handle MINUTELY with multiple BYHOUR', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      byHour: [9, 14, 17],
      interval: 30,
      count: 6,
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T09:00:00[UTC]'),
    });
    assertDates({rule}, [
      '2025-01-01T09:00:00.000Z',
      '2025-01-01T09:30:00.000Z',
      '2025-01-01T14:00:00.000Z',
      '2025-01-01T14:30:00.000Z',
      '2025-01-01T17:00:00.000Z',
      '2025-01-01T17:30:00.000Z',
    ]);
  });

  it('should handle HOURLY with single BYHOUR to prevent infinite loop', () => {
    const rule = new RRuleTemporal({
      freq: 'HOURLY',
      byHour: [12],
      count: 3,
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T12:00:00[UTC]'),
    });
    assertDates({rule}, ['2025-01-01T12:00:00.000Z', '2025-01-02T12:00:00.000Z', '2025-01-03T12:00:00.000Z']);
  });

  it('should handle WEEKLY frequency raw advancement', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      interval: 2,
      count: 3,
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T12:00:00[UTC]'),
    });
    assertDates({rule}, ['2025-01-01T12:00:00.000Z', '2025-01-15T12:00:00.000Z', '2025-01-29T12:00:00.000Z']);
  });

  it('should handle MINUTELY with BYDAY constraint', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      byDay: ['MO'],
      byMinute: [0, 30],
      count: 4,
      dtstart: Temporal.ZonedDateTime.from('2025-01-06T12:00:00[UTC]'),
    });
    assertDates({rule}, [
      '2025-01-06T12:00:00.000Z',
      '2025-01-06T12:30:00.000Z',
      '2025-01-06T13:00:00.000Z',
      '2025-01-06T13:30:00.000Z',
    ]);
  });
});

describe('RRuleTemporal - Advanced BYSETPOS', () => {
  it('should handle BYSETPOS with MONTHLY frequency', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      byDay: ['MO', 'TU', 'WE', 'TH', 'FR'],
      bySetPos: [1, -1],
      count: 6,
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T12:00:00[UTC]'),
    });
    assertDates({rule}, [
      '2025-01-01T12:00:00.000Z',
      '2025-01-31T12:00:00.000Z',
      '2025-02-03T12:00:00.000Z',
      '2025-02-28T12:00:00.000Z',
      '2025-03-03T12:00:00.000Z',
      '2025-03-31T12:00:00.000Z',
    ]);
  });

  it('should handle BYSETPOS with YEARLY frequency', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      byDay: ['SU'],
      bySetPos: [1, 10, -1],
      count: 6,
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T12:00:00[UTC]'),
    });
    assertDates({rule}, [
      '2025-01-05T12:00:00.000Z',
      '2025-03-09T12:00:00.000Z',
      '2025-12-28T12:00:00.000Z',
      '2026-01-04T12:00:00.000Z',
      '2026-03-08T12:00:00.000Z',
      '2026-12-27T12:00:00.000Z',
    ]);
  });
});

describe('RRuleTemporal - BYMONTH with different frequencies', () => {
  it('should handle BYMONTH with DAILY frequency', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      byMonth: [1, 6, 12],
      count: 6,
      dtstart: Temporal.ZonedDateTime.from('2025-02-01T12:00:00[UTC]'),
    });
    assertDates({rule}, [
      '2025-06-01T12:00:00.000Z',
      '2025-06-02T12:00:00.000Z',
      '2025-06-03T12:00:00.000Z',
      '2025-06-04T12:00:00.000Z',
      '2025-06-05T12:00:00.000Z',
      '2025-06-06T12:00:00.000Z',
    ]);
  });

  it('should handle BYMONTH with WEEKLY frequency', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      byMonth: [3, 9],
      count: 4,
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T12:00:00[UTC]'),
    });
    assertDates({rule}, [
      '2025-03-05T12:00:00.000Z',
      '2025-03-12T12:00:00.000Z',
      '2025-03-19T12:00:00.000Z',
      '2025-03-26T12:00:00.000Z',
    ]);
  });
});

describe('RRuleTemporal - Complex BYDAY patterns', () => {
  it('should handle BYDAY with DAILY frequency', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      byDay: ['MO', 'WE', 'FR'],
      count: 6,
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T12:00:00[UTC]'),
    });
    assertDates({rule}, [
      '2025-01-01T12:00:00.000Z',
      '2025-01-03T12:00:00.000Z',
      '2025-01-06T12:00:00.000Z',
      '2025-01-08T12:00:00.000Z',
      '2025-01-10T12:00:00.000Z',
      '2025-01-13T12:00:00.000Z',
    ]);
  });

  it('should handle ordinal BYDAY with YEARLY frequency', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      byDay: ['2MO', '-1FR'],
      count: 4,
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T12:00:00[UTC]'),
    });
    assertDates({rule}, [
      '2025-01-13T12:00:00.000Z',
      '2025-12-26T12:00:00.000Z',
      '2026-01-12T12:00:00.000Z',
      '2026-12-25T12:00:00.000Z',
    ]);
  });
});

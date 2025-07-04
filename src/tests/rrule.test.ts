/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *	http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import {RRuleTemporal} from '../index';
import {Temporal} from '@js-temporal/polyfill';

function zdt(y: number, m: number, d: number, h: number = 0, tz = 'America/New_York') {
  return Temporal.ZonedDateTime.from({
    year: y,
    month: m,
    day: d,
    hour: h,
    minute: 0,
    timeZone: tz,
  });
}

const INVALID_DATE = '2020-01-01-01-01T:00:00:00Z';

const RFC_TEST_TZID = 'America/New_York';
const DATE_1997_SEP_02_9AM_NEW_YORK_DST = zdt(1997, 9, 2, 9);
const DATE_1998_JAN_1_9AM_NEW_YORK = zdt(1998, 1, 1, 9);

const DATE_1997_DEC_24_MIDNIGHT_NEW_YORK = zdt(1997, 12, 24);

const DATE_2019 = zdt(2019, 1, 1, 0, 'UTC');
const DATE_2019_DECEMBER_19 = zdt(2019, 12, 19, 0, 'UTC');
const DATE_2020 = zdt(2020, 1, 1, 0, 'UTC');
const DATE_2023_JAN_6_11PM = zdt(2023, 1, 6, 23, 'UTC');

type IDateTime = Temporal.ZonedDateTime | null;
const limit = (n: number) => (_: any, i: number) => i < n;

const toTimezone = (tz: string) => (d: IDateTime) => (d ? new Date(d.withTimeZone(tz).epochMilliseconds) : null);

const format = (tz: string) => (d: IDateTime) => d?.withTimeZone(tz).toString();

const formatUTC = (d: IDateTime) => toTimezone('UTC')(d)?.toUTCString();

const formatISO = (d: IDateTime) => toTimezone('UTC')(d)?.toISOString();

const parse = (rruleString: string) => new RRuleTemporal({rruleString});

describe('RRule class methods', () => {
  const rule = new RRuleTemporal({
    dtstart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
    tzid: RFC_TEST_TZID,
    freq: 'DAILY',
    count: 10,
  });

  describe('list', () => {
    it('returns all occurrences with no limit passed', () => {
      expect(rule.all().map(formatUTC)).toMatchInlineSnapshot(`
              [
                "Tue, 02 Sep 1997 13:00:00 GMT",
                "Wed, 03 Sep 1997 13:00:00 GMT",
                "Thu, 04 Sep 1997 13:00:00 GMT",
                "Fri, 05 Sep 1997 13:00:00 GMT",
                "Sat, 06 Sep 1997 13:00:00 GMT",
                "Sun, 07 Sep 1997 13:00:00 GMT",
                "Mon, 08 Sep 1997 13:00:00 GMT",
                "Tue, 09 Sep 1997 13:00:00 GMT",
                "Wed, 10 Sep 1997 13:00:00 GMT",
                "Thu, 11 Sep 1997 13:00:00 GMT",
              ]
          `);
    });
    it('returns the number of occurrences passed as the limit value', () => {
      expect(rule.all(limit(3)).map(formatUTC)).toMatchInlineSnapshot(`
        [
          "Tue, 02 Sep 1997 13:00:00 GMT",
          "Wed, 03 Sep 1997 13:00:00 GMT",
          "Thu, 04 Sep 1997 13:00:00 GMT",
        ]
      `);
    });
  });

  describe('before', () => {
    it('returns the last occurrence that happens before a specified date', () => {
      expect(formatUTC(rule.previous(new Date('1997-09-05T20:00:00.000-04:00')))).toMatchInlineSnapshot(
        `"Fri, 05 Sep 1997 13:00:00 GMT"`,
      );
    });

    describe('if the specified date is a occurrence', () => {
      it('returns the occurrence before the specified date by default', () => {
        expect(formatUTC(rule.previous(new Date('1997-09-06T09:00:00.000-04:00')))).toMatchInlineSnapshot(
          `"Fri, 05 Sep 1997 13:00:00 GMT"`,
        );
      });

      it('returns the specified date when passed inclusive: true', () => {
        expect(formatUTC(rule.previous(new Date('1997-09-06T09:00:00.000-04:00'), true))).toMatchInlineSnapshot(
          `"Sat, 06 Sep 1997 13:00:00 GMT"`,
        );
      });
    });

    it('throws an error when passed an invalid date', () => {
      const testFn = () => rule.previous(new Date(INVALID_DATE));
      expect(testFn).toThrowErrorMatchingInlineSnapshot(`"Invalid time value"`);
    });
  });

  describe('after', () => {
    it('returns the first occurrence that happens after a specified date', () => {
      expect(formatUTC(rule.next(new Date('1997-09-05T20:00:00.000-04:00')))).toMatchInlineSnapshot(
        `"Sat, 06 Sep 1997 13:00:00 GMT"`,
      );
    });

    describe('if the specified date is a occurrence', () => {
      it('returns the occurrence after the specified date by default', () => {
        expect(formatUTC(rule.next(new Date('1997-09-06T09:00:00.000-04:00')))).toMatchInlineSnapshot(
          `"Sun, 07 Sep 1997 13:00:00 GMT"`,
        );
      });

      it('returns the specified date when passed inclusive: true', () => {
        expect(formatUTC(rule.next(new Date('1997-09-06T09:00:00.000-04:00'), true))).toMatchInlineSnapshot(
          `"Sat, 06 Sep 1997 13:00:00 GMT"`,
        );
      });
    });

    it('throws an error when passed an invalid date', () => {
      const testFn = () => rule.next(new Date(INVALID_DATE));
      expect(testFn).toThrowErrorMatchingInlineSnapshot(`"Invalid time value"`);
    });
  });

  describe('between', () => {
    it('returns all occurrences between two specified dates', () => {
      expect(
        rule
          .between(new Date('1997-09-05T20:00:00.000-04:00'), new Date('1997-09-10T20:00:00.000-04:00'))
          .map(formatUTC),
      ).toMatchInlineSnapshot(`
        [
          "Sat, 06 Sep 1997 13:00:00 GMT",
          "Sun, 07 Sep 1997 13:00:00 GMT",
          "Mon, 08 Sep 1997 13:00:00 GMT",
          "Tue, 09 Sep 1997 13:00:00 GMT",
          "Wed, 10 Sep 1997 13:00:00 GMT",
        ]
      `);
    });

    describe('if the specified start date is a occurrence', () => {
      it('includes only occurrences after the specified date by default', () => {
        expect(
          rule
            .between(new Date('1997-09-05T09:00:00.000-04:00'), new Date('1997-09-10T20:00:00.000-04:00'))
            .map(formatUTC),
        ).toMatchInlineSnapshot(`
          [
            "Sat, 06 Sep 1997 13:00:00 GMT",
            "Sun, 07 Sep 1997 13:00:00 GMT",
            "Mon, 08 Sep 1997 13:00:00 GMT",
            "Tue, 09 Sep 1997 13:00:00 GMT",
            "Wed, 10 Sep 1997 13:00:00 GMT",
          ]
        `);
      });

      it('returns the specified date when passed inclusive: true', () => {
        expect(
          rule
            .between(new Date('1997-09-05T09:00:00.000-04:00'), new Date('1997-09-10T20:00:00.000-04:00'), true)
            .map(formatUTC),
        ).toMatchInlineSnapshot(`
          [
            "Fri, 05 Sep 1997 13:00:00 GMT",
            "Sat, 06 Sep 1997 13:00:00 GMT",
            "Sun, 07 Sep 1997 13:00:00 GMT",
            "Mon, 08 Sep 1997 13:00:00 GMT",
            "Tue, 09 Sep 1997 13:00:00 GMT",
            "Wed, 10 Sep 1997 13:00:00 GMT",
          ]
        `);
      });
    });

    describe('if the specified end date is a occurrence', () => {
      it('includes only occurrences after the specified date by default', () => {
        expect(
          rule
            .between(new Date('1997-09-05T20:00:00.000-04:00'), new Date('1997-09-10T09:00:00.000-04:00'))
            .map(formatUTC),
        ).toMatchInlineSnapshot(`
          [
            "Sat, 06 Sep 1997 13:00:00 GMT",
            "Sun, 07 Sep 1997 13:00:00 GMT",
            "Mon, 08 Sep 1997 13:00:00 GMT",
            "Tue, 09 Sep 1997 13:00:00 GMT",
          ]
        `);
      });

      it('returns the specified date when passed inclusive: true', () => {
        expect(
          rule
            .between(new Date('1997-09-05T20:00:00.000-04:00'), new Date('1997-09-10T09:00:00.000-04:00'), true)
            .map(formatUTC),
        ).toMatchInlineSnapshot(`
          [
            "Sat, 06 Sep 1997 13:00:00 GMT",
            "Sun, 07 Sep 1997 13:00:00 GMT",
            "Mon, 08 Sep 1997 13:00:00 GMT",
            "Tue, 09 Sep 1997 13:00:00 GMT",
            "Wed, 10 Sep 1997 13:00:00 GMT",
          ]
        `);
      });
    });

    it('throws an error when passed an invalid start date', () => {
      const testFn = () => rule.between(new Date(INVALID_DATE), new Date('1997-09-10T09:00:00.000-04:00'));
      expect(testFn).toThrowErrorMatchingInlineSnapshot(`"Invalid time value"`);
    });

    it('throws an error when passed an invalid end date', () => {
      const testFn = () => rule.between(new Date('1997-09-10T09:00:00.000-04:00'), new Date(INVALID_DATE));
      expect(testFn).toThrowErrorMatchingInlineSnapshot(`"Invalid time value"`);
    });
  });
});

type ITestRRule = {
  rule: RRuleTemporal;
  rrule: string;
  snapshot: string;
  print?: (d: Temporal.ZonedDateTime | null) => string | undefined;
  between?: (Date | Temporal.ZonedDateTime)[];
  limit?: number;
};
function expectSnapshot({rule, snapshot, between, limit: max, print = formatUTC}: Omit<ITestRRule, 'rrule'>) {
  if (between && between.length >= 2) {
    expect(rule.between(between[0]!, between[1]!, true).map(print)).toMatchInlineSnapshot(snapshot);
  } else if (max) {
    expect(rule.all(limit(max)).map(print)).toMatchInlineSnapshot(snapshot);
  } else {
    expect(rule.all().map(print)).toMatchInlineSnapshot(snapshot);
  }
}
function testWithConstructorAndRRule({rule, rrule, snapshot, between, limit: max, print = formatUTC}: ITestRRule) {
  it('using constructor', function () {
    expectSnapshot({rule, snapshot, between, limit: max, print});
  });
  it('using rrule', function () {
    expectSnapshot({rule: new RRuleTemporal({rruleString: rrule}), snapshot, between, limit: max, print});
  });
}

describe('iCalendar.org RFC 5545 Examples', () => {
  // Test against the examples specified at https://icalendar.org/iCalendar-RFC-5545/3-8-5-3-occurrence-rule.html
  // This covers the vast majority of RRule functionality and possible edge cases

  describe('Daily for 10 occurrences', () => {
    const rule = new RRuleTemporal({
      dtstart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: 'DAILY',
      count: 10,
    });
    const rrule = 'DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=DAILY;COUNT=10';
    const snapshot = `
      [
        "Tue, 02 Sep 1997 13:00:00 GMT",
        "Wed, 03 Sep 1997 13:00:00 GMT",
        "Thu, 04 Sep 1997 13:00:00 GMT",
        "Fri, 05 Sep 1997 13:00:00 GMT",
        "Sat, 06 Sep 1997 13:00:00 GMT",
        "Sun, 07 Sep 1997 13:00:00 GMT",
        "Mon, 08 Sep 1997 13:00:00 GMT",
        "Tue, 09 Sep 1997 13:00:00 GMT",
        "Wed, 10 Sep 1997 13:00:00 GMT",
        "Thu, 11 Sep 1997 13:00:00 GMT",
      ]
    `;
    testWithConstructorAndRRule({rule, rrule, snapshot});
  });

  describe('Daily until December 24, 1997', () => {
    const rule = new RRuleTemporal({
      dtstart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: 'DAILY',
      until: DATE_1997_DEC_24_MIDNIGHT_NEW_YORK,
    });
    const rrule = 'DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=DAILY;UNTIL=19971224T000000Z';
    const snapshot = `
      [
        "Tue, 02 Sep 1997 13:00:00 GMT",
        "Wed, 03 Sep 1997 13:00:00 GMT",
        "Thu, 04 Sep 1997 13:00:00 GMT",
        "Fri, 05 Sep 1997 13:00:00 GMT",
        "Sat, 06 Sep 1997 13:00:00 GMT",
        "Sun, 07 Sep 1997 13:00:00 GMT",
        "Mon, 08 Sep 1997 13:00:00 GMT",
        "Tue, 09 Sep 1997 13:00:00 GMT",
        "Wed, 10 Sep 1997 13:00:00 GMT",
        "Thu, 11 Sep 1997 13:00:00 GMT",
        "Fri, 12 Sep 1997 13:00:00 GMT",
        "Sat, 13 Sep 1997 13:00:00 GMT",
        "Sun, 14 Sep 1997 13:00:00 GMT",
        "Mon, 15 Sep 1997 13:00:00 GMT",
        "Tue, 16 Sep 1997 13:00:00 GMT",
        "Wed, 17 Sep 1997 13:00:00 GMT",
        "Thu, 18 Sep 1997 13:00:00 GMT",
        "Fri, 19 Sep 1997 13:00:00 GMT",
        "Sat, 20 Sep 1997 13:00:00 GMT",
        "Sun, 21 Sep 1997 13:00:00 GMT",
        "Mon, 22 Sep 1997 13:00:00 GMT",
        "Tue, 23 Sep 1997 13:00:00 GMT",
        "Wed, 24 Sep 1997 13:00:00 GMT",
        "Thu, 25 Sep 1997 13:00:00 GMT",
        "Fri, 26 Sep 1997 13:00:00 GMT",
        "Sat, 27 Sep 1997 13:00:00 GMT",
        "Sun, 28 Sep 1997 13:00:00 GMT",
        "Mon, 29 Sep 1997 13:00:00 GMT",
        "Tue, 30 Sep 1997 13:00:00 GMT",
        "Wed, 01 Oct 1997 13:00:00 GMT",
        "Thu, 02 Oct 1997 13:00:00 GMT",
        "Fri, 03 Oct 1997 13:00:00 GMT",
        "Sat, 04 Oct 1997 13:00:00 GMT",
        "Sun, 05 Oct 1997 13:00:00 GMT",
        "Mon, 06 Oct 1997 13:00:00 GMT",
        "Tue, 07 Oct 1997 13:00:00 GMT",
        "Wed, 08 Oct 1997 13:00:00 GMT",
        "Thu, 09 Oct 1997 13:00:00 GMT",
        "Fri, 10 Oct 1997 13:00:00 GMT",
        "Sat, 11 Oct 1997 13:00:00 GMT",
        "Sun, 12 Oct 1997 13:00:00 GMT",
        "Mon, 13 Oct 1997 13:00:00 GMT",
        "Tue, 14 Oct 1997 13:00:00 GMT",
        "Wed, 15 Oct 1997 13:00:00 GMT",
        "Thu, 16 Oct 1997 13:00:00 GMT",
        "Fri, 17 Oct 1997 13:00:00 GMT",
        "Sat, 18 Oct 1997 13:00:00 GMT",
        "Sun, 19 Oct 1997 13:00:00 GMT",
        "Mon, 20 Oct 1997 13:00:00 GMT",
        "Tue, 21 Oct 1997 13:00:00 GMT",
        "Wed, 22 Oct 1997 13:00:00 GMT",
        "Thu, 23 Oct 1997 13:00:00 GMT",
        "Fri, 24 Oct 1997 13:00:00 GMT",
        "Sat, 25 Oct 1997 13:00:00 GMT",
        "Sun, 26 Oct 1997 14:00:00 GMT",
        "Mon, 27 Oct 1997 14:00:00 GMT",
        "Tue, 28 Oct 1997 14:00:00 GMT",
        "Wed, 29 Oct 1997 14:00:00 GMT",
        "Thu, 30 Oct 1997 14:00:00 GMT",
        "Fri, 31 Oct 1997 14:00:00 GMT",
        "Sat, 01 Nov 1997 14:00:00 GMT",
        "Sun, 02 Nov 1997 14:00:00 GMT",
        "Mon, 03 Nov 1997 14:00:00 GMT",
        "Tue, 04 Nov 1997 14:00:00 GMT",
        "Wed, 05 Nov 1997 14:00:00 GMT",
        "Thu, 06 Nov 1997 14:00:00 GMT",
        "Fri, 07 Nov 1997 14:00:00 GMT",
        "Sat, 08 Nov 1997 14:00:00 GMT",
        "Sun, 09 Nov 1997 14:00:00 GMT",
        "Mon, 10 Nov 1997 14:00:00 GMT",
        "Tue, 11 Nov 1997 14:00:00 GMT",
        "Wed, 12 Nov 1997 14:00:00 GMT",
        "Thu, 13 Nov 1997 14:00:00 GMT",
        "Fri, 14 Nov 1997 14:00:00 GMT",
        "Sat, 15 Nov 1997 14:00:00 GMT",
        "Sun, 16 Nov 1997 14:00:00 GMT",
        "Mon, 17 Nov 1997 14:00:00 GMT",
        "Tue, 18 Nov 1997 14:00:00 GMT",
        "Wed, 19 Nov 1997 14:00:00 GMT",
        "Thu, 20 Nov 1997 14:00:00 GMT",
        "Fri, 21 Nov 1997 14:00:00 GMT",
        "Sat, 22 Nov 1997 14:00:00 GMT",
        "Sun, 23 Nov 1997 14:00:00 GMT",
        "Mon, 24 Nov 1997 14:00:00 GMT",
        "Tue, 25 Nov 1997 14:00:00 GMT",
        "Wed, 26 Nov 1997 14:00:00 GMT",
        "Thu, 27 Nov 1997 14:00:00 GMT",
        "Fri, 28 Nov 1997 14:00:00 GMT",
        "Sat, 29 Nov 1997 14:00:00 GMT",
        "Sun, 30 Nov 1997 14:00:00 GMT",
        "Mon, 01 Dec 1997 14:00:00 GMT",
        "Tue, 02 Dec 1997 14:00:00 GMT",
        "Wed, 03 Dec 1997 14:00:00 GMT",
        "Thu, 04 Dec 1997 14:00:00 GMT",
        "Fri, 05 Dec 1997 14:00:00 GMT",
        "Sat, 06 Dec 1997 14:00:00 GMT",
        "Sun, 07 Dec 1997 14:00:00 GMT",
        "Mon, 08 Dec 1997 14:00:00 GMT",
        "Tue, 09 Dec 1997 14:00:00 GMT",
        "Wed, 10 Dec 1997 14:00:00 GMT",
        "Thu, 11 Dec 1997 14:00:00 GMT",
        "Fri, 12 Dec 1997 14:00:00 GMT",
        "Sat, 13 Dec 1997 14:00:00 GMT",
        "Sun, 14 Dec 1997 14:00:00 GMT",
        "Mon, 15 Dec 1997 14:00:00 GMT",
        "Tue, 16 Dec 1997 14:00:00 GMT",
        "Wed, 17 Dec 1997 14:00:00 GMT",
        "Thu, 18 Dec 1997 14:00:00 GMT",
        "Fri, 19 Dec 1997 14:00:00 GMT",
        "Sat, 20 Dec 1997 14:00:00 GMT",
        "Sun, 21 Dec 1997 14:00:00 GMT",
        "Mon, 22 Dec 1997 14:00:00 GMT",
        "Tue, 23 Dec 1997 14:00:00 GMT",
      ]
    `;
    testWithConstructorAndRRule({rule, rrule, snapshot});
  });

  describe('Every other day, forever', () => {
    const rule = new RRuleTemporal({
      dtstart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: 'DAILY',
      interval: 2,
    });
    const rrule = 'DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=DAILY;INTERVAL=2';
    const between = [DATE_1997_SEP_02_9AM_NEW_YORK_DST, new Date('1997-12-04T00:00:00.000-05:00')];
    const snapshot = `
      [
        "Tue, 02 Sep 1997 13:00:00 GMT",
        "Thu, 04 Sep 1997 13:00:00 GMT",
        "Sat, 06 Sep 1997 13:00:00 GMT",
        "Mon, 08 Sep 1997 13:00:00 GMT",
        "Wed, 10 Sep 1997 13:00:00 GMT",
        "Fri, 12 Sep 1997 13:00:00 GMT",
        "Sun, 14 Sep 1997 13:00:00 GMT",
        "Tue, 16 Sep 1997 13:00:00 GMT",
        "Thu, 18 Sep 1997 13:00:00 GMT",
        "Sat, 20 Sep 1997 13:00:00 GMT",
        "Mon, 22 Sep 1997 13:00:00 GMT",
        "Wed, 24 Sep 1997 13:00:00 GMT",
        "Fri, 26 Sep 1997 13:00:00 GMT",
        "Sun, 28 Sep 1997 13:00:00 GMT",
        "Tue, 30 Sep 1997 13:00:00 GMT",
        "Thu, 02 Oct 1997 13:00:00 GMT",
        "Sat, 04 Oct 1997 13:00:00 GMT",
        "Mon, 06 Oct 1997 13:00:00 GMT",
        "Wed, 08 Oct 1997 13:00:00 GMT",
        "Fri, 10 Oct 1997 13:00:00 GMT",
        "Sun, 12 Oct 1997 13:00:00 GMT",
        "Tue, 14 Oct 1997 13:00:00 GMT",
        "Thu, 16 Oct 1997 13:00:00 GMT",
        "Sat, 18 Oct 1997 13:00:00 GMT",
        "Mon, 20 Oct 1997 13:00:00 GMT",
        "Wed, 22 Oct 1997 13:00:00 GMT",
        "Fri, 24 Oct 1997 13:00:00 GMT",
        "Sun, 26 Oct 1997 14:00:00 GMT",
        "Tue, 28 Oct 1997 14:00:00 GMT",
        "Thu, 30 Oct 1997 14:00:00 GMT",
        "Sat, 01 Nov 1997 14:00:00 GMT",
        "Mon, 03 Nov 1997 14:00:00 GMT",
        "Wed, 05 Nov 1997 14:00:00 GMT",
        "Fri, 07 Nov 1997 14:00:00 GMT",
        "Sun, 09 Nov 1997 14:00:00 GMT",
        "Tue, 11 Nov 1997 14:00:00 GMT",
        "Thu, 13 Nov 1997 14:00:00 GMT",
        "Sat, 15 Nov 1997 14:00:00 GMT",
        "Mon, 17 Nov 1997 14:00:00 GMT",
        "Wed, 19 Nov 1997 14:00:00 GMT",
        "Fri, 21 Nov 1997 14:00:00 GMT",
        "Sun, 23 Nov 1997 14:00:00 GMT",
        "Tue, 25 Nov 1997 14:00:00 GMT",
        "Thu, 27 Nov 1997 14:00:00 GMT",
        "Sat, 29 Nov 1997 14:00:00 GMT",
        "Mon, 01 Dec 1997 14:00:00 GMT",
        "Wed, 03 Dec 1997 14:00:00 GMT",
      ]
    `;
    testWithConstructorAndRRule({rule, rrule, snapshot, between});
  });

  describe('Every 10 days, 5 occurrences', () => {
    const rule = new RRuleTemporal({
      dtstart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: 'DAILY',
      count: 5,
      interval: 10,
    });
    const rrule = 'DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=DAILY;INTERVAL=10;COUNT=5';
    const snapshot = `
      [
        "Tue, 02 Sep 1997 13:00:00 GMT",
        "Fri, 12 Sep 1997 13:00:00 GMT",
        "Mon, 22 Sep 1997 13:00:00 GMT",
        "Thu, 02 Oct 1997 13:00:00 GMT",
        "Sun, 12 Oct 1997 13:00:00 GMT",
      ]
    `;
    testWithConstructorAndRRule({rule, rrule, snapshot});
  });

  describe('Every day in January, for 3 years', () => {
    const rule1 = new RRuleTemporal({
      dtstart: DATE_1998_JAN_1_9AM_NEW_YORK,
      tzid: RFC_TEST_TZID,
      freq: 'DAILY',
      byMonth: [1],
      until: zdt(2000, 1, 31, 14, 'UTC'),
    });
    const rrule1 = 'DTSTART;TZID=America/New_York:19980101T090000\nRRULE:FREQ=DAILY;UNTIL=20000131T140000Z;BYMONTH=1';
    const rule2 = new RRuleTemporal({
      dtstart: DATE_1998_JAN_1_9AM_NEW_YORK,
      tzid: RFC_TEST_TZID,
      freq: 'YEARLY',
      byDay: ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'],
      byMonth: [1],
      until: zdt(2000, 1, 31, 14, 'UTC'),
    });
    const rrule2 =
      'DTSTART;TZID=America/New_York:19980101T090000\n' +
      'RRULE:FREQ=YEARLY;UNTIL=20000131T140000Z;BYMONTH=1;BYDAY=SU,MO,TU,WE,TH,FR,SA';
    const snapshot = `
[
  "Thu, 01 Jan 1998 14:00:00 GMT",
  "Fri, 02 Jan 1998 14:00:00 GMT",
  "Sat, 03 Jan 1998 14:00:00 GMT",
  "Sun, 04 Jan 1998 14:00:00 GMT",
  "Mon, 05 Jan 1998 14:00:00 GMT",
  "Tue, 06 Jan 1998 14:00:00 GMT",
  "Wed, 07 Jan 1998 14:00:00 GMT",
  "Thu, 08 Jan 1998 14:00:00 GMT",
  "Fri, 09 Jan 1998 14:00:00 GMT",
  "Sat, 10 Jan 1998 14:00:00 GMT",
  "Sun, 11 Jan 1998 14:00:00 GMT",
  "Mon, 12 Jan 1998 14:00:00 GMT",
  "Tue, 13 Jan 1998 14:00:00 GMT",
  "Wed, 14 Jan 1998 14:00:00 GMT",
  "Thu, 15 Jan 1998 14:00:00 GMT",
  "Fri, 16 Jan 1998 14:00:00 GMT",
  "Sat, 17 Jan 1998 14:00:00 GMT",
  "Sun, 18 Jan 1998 14:00:00 GMT",
  "Mon, 19 Jan 1998 14:00:00 GMT",
  "Tue, 20 Jan 1998 14:00:00 GMT",
  "Wed, 21 Jan 1998 14:00:00 GMT",
  "Thu, 22 Jan 1998 14:00:00 GMT",
  "Fri, 23 Jan 1998 14:00:00 GMT",
  "Sat, 24 Jan 1998 14:00:00 GMT",
  "Sun, 25 Jan 1998 14:00:00 GMT",
  "Mon, 26 Jan 1998 14:00:00 GMT",
  "Tue, 27 Jan 1998 14:00:00 GMT",
  "Wed, 28 Jan 1998 14:00:00 GMT",
  "Thu, 29 Jan 1998 14:00:00 GMT",
  "Fri, 30 Jan 1998 14:00:00 GMT",
  "Sat, 31 Jan 1998 14:00:00 GMT",
  "Fri, 01 Jan 1999 14:00:00 GMT",
  "Sat, 02 Jan 1999 14:00:00 GMT",
  "Sun, 03 Jan 1999 14:00:00 GMT",
  "Mon, 04 Jan 1999 14:00:00 GMT",
  "Tue, 05 Jan 1999 14:00:00 GMT",
  "Wed, 06 Jan 1999 14:00:00 GMT",
  "Thu, 07 Jan 1999 14:00:00 GMT",
  "Fri, 08 Jan 1999 14:00:00 GMT",
  "Sat, 09 Jan 1999 14:00:00 GMT",
  "Sun, 10 Jan 1999 14:00:00 GMT",
  "Mon, 11 Jan 1999 14:00:00 GMT",
  "Tue, 12 Jan 1999 14:00:00 GMT",
  "Wed, 13 Jan 1999 14:00:00 GMT",
  "Thu, 14 Jan 1999 14:00:00 GMT",
  "Fri, 15 Jan 1999 14:00:00 GMT",
  "Sat, 16 Jan 1999 14:00:00 GMT",
  "Sun, 17 Jan 1999 14:00:00 GMT",
  "Mon, 18 Jan 1999 14:00:00 GMT",
  "Tue, 19 Jan 1999 14:00:00 GMT",
  "Wed, 20 Jan 1999 14:00:00 GMT",
  "Thu, 21 Jan 1999 14:00:00 GMT",
  "Fri, 22 Jan 1999 14:00:00 GMT",
  "Sat, 23 Jan 1999 14:00:00 GMT",
  "Sun, 24 Jan 1999 14:00:00 GMT",
  "Mon, 25 Jan 1999 14:00:00 GMT",
  "Tue, 26 Jan 1999 14:00:00 GMT",
  "Wed, 27 Jan 1999 14:00:00 GMT",
  "Thu, 28 Jan 1999 14:00:00 GMT",
  "Fri, 29 Jan 1999 14:00:00 GMT",
  "Sat, 30 Jan 1999 14:00:00 GMT",
  "Sun, 31 Jan 1999 14:00:00 GMT",
  "Sat, 01 Jan 2000 14:00:00 GMT",
  "Sun, 02 Jan 2000 14:00:00 GMT",
  "Mon, 03 Jan 2000 14:00:00 GMT",
  "Tue, 04 Jan 2000 14:00:00 GMT",
  "Wed, 05 Jan 2000 14:00:00 GMT",
  "Thu, 06 Jan 2000 14:00:00 GMT",
  "Fri, 07 Jan 2000 14:00:00 GMT",
  "Sat, 08 Jan 2000 14:00:00 GMT",
  "Sun, 09 Jan 2000 14:00:00 GMT",
  "Mon, 10 Jan 2000 14:00:00 GMT",
  "Tue, 11 Jan 2000 14:00:00 GMT",
  "Wed, 12 Jan 2000 14:00:00 GMT",
  "Thu, 13 Jan 2000 14:00:00 GMT",
  "Fri, 14 Jan 2000 14:00:00 GMT",
  "Sat, 15 Jan 2000 14:00:00 GMT",
  "Sun, 16 Jan 2000 14:00:00 GMT",
  "Mon, 17 Jan 2000 14:00:00 GMT",
  "Tue, 18 Jan 2000 14:00:00 GMT",
  "Wed, 19 Jan 2000 14:00:00 GMT",
  "Thu, 20 Jan 2000 14:00:00 GMT",
  "Fri, 21 Jan 2000 14:00:00 GMT",
  "Sat, 22 Jan 2000 14:00:00 GMT",
  "Sun, 23 Jan 2000 14:00:00 GMT",
  "Mon, 24 Jan 2000 14:00:00 GMT",
  "Tue, 25 Jan 2000 14:00:00 GMT",
  "Wed, 26 Jan 2000 14:00:00 GMT",
  "Thu, 27 Jan 2000 14:00:00 GMT",
  "Fri, 28 Jan 2000 14:00:00 GMT",
  "Sat, 29 Jan 2000 14:00:00 GMT",
  "Sun, 30 Jan 2000 14:00:00 GMT",
  "Mon, 31 Jan 2000 14:00:00 GMT",
]
`;
    testWithConstructorAndRRule({rule: rule1, rrule: rrule1, snapshot});
    testWithConstructorAndRRule({rule: rule2, rrule: rrule2, snapshot});
  });

  describe('Weekly for 10 occurrences', () => {
    const rule = new RRuleTemporal({
      dtstart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: 'WEEKLY',
      count: 10,
    });
    const rrule = 'DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=WEEKLY;COUNT=10';
    const snapshot = `
      [
        "Tue, 02 Sep 1997 13:00:00 GMT",
        "Tue, 09 Sep 1997 13:00:00 GMT",
        "Tue, 16 Sep 1997 13:00:00 GMT",
        "Tue, 23 Sep 1997 13:00:00 GMT",
        "Tue, 30 Sep 1997 13:00:00 GMT",
        "Tue, 07 Oct 1997 13:00:00 GMT",
        "Tue, 14 Oct 1997 13:00:00 GMT",
        "Tue, 21 Oct 1997 13:00:00 GMT",
        "Tue, 28 Oct 1997 14:00:00 GMT",
        "Tue, 04 Nov 1997 14:00:00 GMT",
      ]
    `;
    testWithConstructorAndRRule({rule, rrule, snapshot});
  });

  describe('Weekly until December 24, 1997', () => {
    const rule = new RRuleTemporal({
      dtstart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: 'WEEKLY',
      until: DATE_1997_DEC_24_MIDNIGHT_NEW_YORK,
    });
    const rrule = 'DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=WEEKLY;UNTIL=19971224T000000Z';
    const snapshot = `
      [
        "Tue, 02 Sep 1997 13:00:00 GMT",
        "Tue, 09 Sep 1997 13:00:00 GMT",
        "Tue, 16 Sep 1997 13:00:00 GMT",
        "Tue, 23 Sep 1997 13:00:00 GMT",
        "Tue, 30 Sep 1997 13:00:00 GMT",
        "Tue, 07 Oct 1997 13:00:00 GMT",
        "Tue, 14 Oct 1997 13:00:00 GMT",
        "Tue, 21 Oct 1997 13:00:00 GMT",
        "Tue, 28 Oct 1997 14:00:00 GMT",
        "Tue, 04 Nov 1997 14:00:00 GMT",
        "Tue, 11 Nov 1997 14:00:00 GMT",
        "Tue, 18 Nov 1997 14:00:00 GMT",
        "Tue, 25 Nov 1997 14:00:00 GMT",
        "Tue, 02 Dec 1997 14:00:00 GMT",
        "Tue, 09 Dec 1997 14:00:00 GMT",
        "Tue, 16 Dec 1997 14:00:00 GMT",
        "Tue, 23 Dec 1997 14:00:00 GMT",
      ]
    `;
    testWithConstructorAndRRule({rule, rrule, snapshot});
  });

  describe('Every other week, forever', () => {
    const rule = new RRuleTemporal({
      dtstart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: 'WEEKLY',
      interval: 2,
    });
    const rrule = 'DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=WEEKLY;INTERVAL=2;WKST=SU';
    const between = [DATE_1997_SEP_02_9AM_NEW_YORK_DST, new Date('1998-02-18T09:00:00.000-05:00')];
    const snapshot = `
      [
        "Tue, 02 Sep 1997 13:00:00 GMT",
        "Tue, 16 Sep 1997 13:00:00 GMT",
        "Tue, 30 Sep 1997 13:00:00 GMT",
        "Tue, 14 Oct 1997 13:00:00 GMT",
        "Tue, 28 Oct 1997 14:00:00 GMT",
        "Tue, 11 Nov 1997 14:00:00 GMT",
        "Tue, 25 Nov 1997 14:00:00 GMT",
        "Tue, 09 Dec 1997 14:00:00 GMT",
        "Tue, 23 Dec 1997 14:00:00 GMT",
        "Tue, 06 Jan 1998 14:00:00 GMT",
        "Tue, 20 Jan 1998 14:00:00 GMT",
        "Tue, 03 Feb 1998 14:00:00 GMT",
        "Tue, 17 Feb 1998 14:00:00 GMT",
      ]
    `;
    testWithConstructorAndRRule({rule, rrule, snapshot, between});
  });

  describe('Weekly on Tuesday and Thursday for five weeks', () => {
    const rule1 = new RRuleTemporal({
      dtstart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: 'WEEKLY',
      until: zdt(1997, 10, 7, 0, 'UTC'),
      wkst: 'SU',
      byDay: ['TU', 'TH'],
    });
    const rrule1 =
      'DTSTART;TZID=America/New_York:19970902T090000\n' +
      'RRULE:FREQ=WEEKLY;UNTIL=19971007T000000Z;WKST=SU;BYDAY=TU,TH';
    const rule2 = new RRuleTemporal({
      dtstart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: 'WEEKLY',
      count: 10,
      wkst: 'SU',
      byDay: ['TU', 'TH'],
    });
    const rrule2 = 'DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=WEEKLY;COUNT=10;WKST=SU;BYDAY=TU,TH';
    const snapshot = `
      [
        "Tue, 02 Sep 1997 13:00:00 GMT",
        "Thu, 04 Sep 1997 13:00:00 GMT",
        "Tue, 09 Sep 1997 13:00:00 GMT",
        "Thu, 11 Sep 1997 13:00:00 GMT",
        "Tue, 16 Sep 1997 13:00:00 GMT",
        "Thu, 18 Sep 1997 13:00:00 GMT",
        "Tue, 23 Sep 1997 13:00:00 GMT",
        "Thu, 25 Sep 1997 13:00:00 GMT",
        "Tue, 30 Sep 1997 13:00:00 GMT",
        "Thu, 02 Oct 1997 13:00:00 GMT",
      ]
    `;
    testWithConstructorAndRRule({rule: rule1, rrule: rrule1, snapshot});
    testWithConstructorAndRRule({rule: rule2, rrule: rrule2, snapshot});
  });

  describe('Every other week on Monday, Wednesday, and Friday until December 24, 1997, starting on Monday, September 1, 1997', () => {
    const rule = new RRuleTemporal({
      dtstart: zdt(1997, 9, 1, 9),
      tzid: RFC_TEST_TZID,
      freq: 'WEEKLY',
      interval: 2,
      byDay: ['MO', 'WE', 'FR'],
      until: DATE_1997_DEC_24_MIDNIGHT_NEW_YORK,
    });
    const rrule =
      'DTSTART;TZID=America/New_York:19970901T090000\n' +
      'RRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=19971224T000000Z;WKST=SU;BYDAY=MO,WE,FR';
    const snapshot = `
      [
        "Mon, 01 Sep 1997 13:00:00 GMT",
        "Wed, 03 Sep 1997 13:00:00 GMT",
        "Fri, 05 Sep 1997 13:00:00 GMT",
        "Mon, 15 Sep 1997 13:00:00 GMT",
        "Wed, 17 Sep 1997 13:00:00 GMT",
        "Fri, 19 Sep 1997 13:00:00 GMT",
        "Mon, 29 Sep 1997 13:00:00 GMT",
        "Wed, 01 Oct 1997 13:00:00 GMT",
        "Fri, 03 Oct 1997 13:00:00 GMT",
        "Mon, 13 Oct 1997 13:00:00 GMT",
        "Wed, 15 Oct 1997 13:00:00 GMT",
        "Fri, 17 Oct 1997 13:00:00 GMT",
        "Mon, 27 Oct 1997 14:00:00 GMT",
        "Wed, 29 Oct 1997 14:00:00 GMT",
        "Fri, 31 Oct 1997 14:00:00 GMT",
        "Mon, 10 Nov 1997 14:00:00 GMT",
        "Wed, 12 Nov 1997 14:00:00 GMT",
        "Fri, 14 Nov 1997 14:00:00 GMT",
        "Mon, 24 Nov 1997 14:00:00 GMT",
        "Wed, 26 Nov 1997 14:00:00 GMT",
        "Fri, 28 Nov 1997 14:00:00 GMT",
        "Mon, 08 Dec 1997 14:00:00 GMT",
        "Wed, 10 Dec 1997 14:00:00 GMT",
        "Fri, 12 Dec 1997 14:00:00 GMT",
        "Mon, 22 Dec 1997 14:00:00 GMT",
      ]
    `;
    testWithConstructorAndRRule({rule, rrule, snapshot});
  });

  describe('Every other week on Tuesday and Thursday, for 8 occurrences', () => {
    const rule = new RRuleTemporal({
      dtstart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: 'WEEKLY',
      interval: 2,
      byDay: ['TU', 'TH'],
      count: 8,
    });
    const rrule =
      'DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=8;WKST=SU;BYDAY=TU,TH';
    const snapshot = `
      [
        "Tue, 02 Sep 1997 13:00:00 GMT",
        "Thu, 04 Sep 1997 13:00:00 GMT",
        "Tue, 16 Sep 1997 13:00:00 GMT",
        "Thu, 18 Sep 1997 13:00:00 GMT",
        "Tue, 30 Sep 1997 13:00:00 GMT",
        "Thu, 02 Oct 1997 13:00:00 GMT",
        "Tue, 14 Oct 1997 13:00:00 GMT",
        "Thu, 16 Oct 1997 13:00:00 GMT",
      ]
    `;
    testWithConstructorAndRRule({rule, rrule, snapshot});
  });

  describe('Monthly on the first Friday for 10 occurrences', () => {
    const rule = new RRuleTemporal({
      dtstart: zdt(1997, 9, 5, 9),
      tzid: RFC_TEST_TZID,
      freq: 'MONTHLY',
      byDay: ['1FR'],
      count: 10,
    });
    const rrule = 'DTSTART;TZID=America/New_York:19970905T090000\nRRULE:FREQ=MONTHLY;COUNT=10;BYDAY=1FR';
    const snapshot = `
      [
        "Fri, 05 Sep 1997 13:00:00 GMT",
        "Fri, 03 Oct 1997 13:00:00 GMT",
        "Fri, 07 Nov 1997 14:00:00 GMT",
        "Fri, 05 Dec 1997 14:00:00 GMT",
        "Fri, 02 Jan 1998 14:00:00 GMT",
        "Fri, 06 Feb 1998 14:00:00 GMT",
        "Fri, 06 Mar 1998 14:00:00 GMT",
        "Fri, 03 Apr 1998 14:00:00 GMT",
        "Fri, 01 May 1998 13:00:00 GMT",
        "Fri, 05 Jun 1998 13:00:00 GMT",
      ]
`;
    testWithConstructorAndRRule({rule, rrule, snapshot});
  });

  describe('Monthly on the first Friday until December 24, 1997', () => {
    const rule = new RRuleTemporal({
      dtstart: zdt(1997, 9, 5, 9),
      tzid: RFC_TEST_TZID,
      freq: 'MONTHLY',
      byDay: ['1FR'],
      until: DATE_1997_DEC_24_MIDNIGHT_NEW_YORK,
    });
    const rrule = 'DTSTART;TZID=America/New_York:19970905T090000\nRRULE:FREQ=MONTHLY;UNTIL=19971224T000000Z;BYDAY=1FR';
    const snapshot = `
      [
        "Fri, 05 Sep 1997 13:00:00 GMT",
        "Fri, 03 Oct 1997 13:00:00 GMT",
        "Fri, 07 Nov 1997 14:00:00 GMT",
        "Fri, 05 Dec 1997 14:00:00 GMT",
      ]
`;
    testWithConstructorAndRRule({rule, rrule, snapshot});
  });

  describe('Every other month on the first and last Sunday of the month for 10 occurrences', () => {
    const rule = new RRuleTemporal({
      dtstart: zdt(1997, 9, 7, 9),
      tzid: RFC_TEST_TZID,
      freq: 'MONTHLY',
      interval: 2,
      byDay: ['1SU', '-1SU'],
      count: 10,
    });
    const rrule =
      'DTSTART;TZID=America/New_York:19970907T090000\nRRULE:FREQ=MONTHLY;INTERVAL=2;COUNT=10;BYDAY=1SU,-1SU';
    const snapshot = `
      [
        "Sun, 07 Sep 1997 13:00:00 GMT",
        "Sun, 28 Sep 1997 13:00:00 GMT",
        "Sun, 02 Nov 1997 14:00:00 GMT",
        "Sun, 30 Nov 1997 14:00:00 GMT",
        "Sun, 04 Jan 1998 14:00:00 GMT",
        "Sun, 25 Jan 1998 14:00:00 GMT",
        "Sun, 01 Mar 1998 14:00:00 GMT",
        "Sun, 29 Mar 1998 14:00:00 GMT",
        "Sun, 03 May 1998 13:00:00 GMT",
        "Sun, 31 May 1998 13:00:00 GMT",
      ]
`;
    testWithConstructorAndRRule({rule, rrule, snapshot});
  });

  describe('Monthly on the second-to-last Monday of the month for 6 months', () => {
    const rule = new RRuleTemporal({
      dtstart: zdt(1997, 9, 22, 9),
      tzid: RFC_TEST_TZID,
      freq: 'MONTHLY',
      byDay: ['-2MO'],
      count: 6,
    });
    const rrule = 'DTSTART;TZID=America/New_York:19970922T090000\nRRULE:FREQ=MONTHLY;COUNT=6;BYDAY=-2MO';
    const snapshot = `
      [
        "Mon, 22 Sep 1997 13:00:00 GMT",
        "Mon, 20 Oct 1997 13:00:00 GMT",
        "Mon, 17 Nov 1997 14:00:00 GMT",
        "Mon, 22 Dec 1997 14:00:00 GMT",
        "Mon, 19 Jan 1998 14:00:00 GMT",
        "Mon, 16 Feb 1998 14:00:00 GMT",
      ]
`;
    testWithConstructorAndRRule({rule, rrule, snapshot});
  });

  describe('Monthly on the third-to-the-last day of the month, forever:', () => {
    const rule = new RRuleTemporal({
      dtstart: zdt(1997, 9, 28, 9),
      tzid: RFC_TEST_TZID,
      freq: 'MONTHLY',
      byMonthDay: [-3],
    });
    const rrule = 'DTSTART;TZID=America/New_York:19970928T090000\nRRULE:FREQ=MONTHLY;BYMONTHDAY=-3';
    const snapshot = `
      [
        "1997-09-28T13:00:00.000Z",
        "1997-10-29T14:00:00.000Z",
        "1997-11-28T14:00:00.000Z",
        "1997-12-29T14:00:00.000Z",
        "1998-01-29T14:00:00.000Z",
        "1998-02-26T14:00:00.000Z",
      ]
    `;
    testWithConstructorAndRRule({rule, rrule, snapshot, limit: 6, print: formatISO});
  });

  describe('Monthly on the 2nd and 15th of the month for 10 occurrences', () => {
    const rule = new RRuleTemporal({
      dtstart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: 'MONTHLY',
      byMonthDay: [2, 15],
      count: 10,
    });
    const rrule = 'DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=MONTHLY;COUNT=10;BYMONTHDAY=2,15';
    const snapshot = `
      [
        "Tue, 02 Sep 1997 13:00:00 GMT",
        "Mon, 15 Sep 1997 13:00:00 GMT",
        "Thu, 02 Oct 1997 13:00:00 GMT",
        "Wed, 15 Oct 1997 13:00:00 GMT",
        "Sun, 02 Nov 1997 14:00:00 GMT",
        "Sat, 15 Nov 1997 14:00:00 GMT",
        "Tue, 02 Dec 1997 14:00:00 GMT",
        "Mon, 15 Dec 1997 14:00:00 GMT",
        "Fri, 02 Jan 1998 14:00:00 GMT",
        "Thu, 15 Jan 1998 14:00:00 GMT",
      ]
    `;
    testWithConstructorAndRRule({rule, rrule, snapshot});
  });

  describe('Monthly on the first and last day of the month for 10 occurrences', () => {
    const rule = new RRuleTemporal({
      dtstart: zdt(1997, 9, 30, 9),
      tzid: RFC_TEST_TZID,
      freq: 'MONTHLY',
      byMonthDay: [1, -1],
      count: 10,
    });
    const rrule = 'DTSTART;TZID=America/New_York:19970930T090000\nRRULE:FREQ=MONTHLY;COUNT=10;BYMONTHDAY=1,-1';
    const snapshot = `
[
  "Wed, 01 Oct 1997 13:00:00 GMT",
  "Fri, 31 Oct 1997 14:00:00 GMT",
  "Sat, 01 Nov 1997 14:00:00 GMT",
  "Sun, 30 Nov 1997 14:00:00 GMT",
  "Mon, 01 Dec 1997 14:00:00 GMT",
  "Wed, 31 Dec 1997 14:00:00 GMT",
  "Thu, 01 Jan 1998 14:00:00 GMT",
  "Sat, 31 Jan 1998 14:00:00 GMT",
  "Sun, 01 Feb 1998 14:00:00 GMT",
  "Sat, 28 Feb 1998 14:00:00 GMT",
]
`;
    testWithConstructorAndRRule({rule, rrule, snapshot});
  });

  describe('Every 18 months on the 10th thru 15th of the month for 10 occurrences', () => {
    const rule = new RRuleTemporal({
      dtstart: zdt(1997, 9, 10, 9),
      tzid: RFC_TEST_TZID,
      freq: 'MONTHLY',
      byMonthDay: [10, 11, 12, 13, 14, 15],
      interval: 18,
      count: 10,
    });
    const rrule =
      'DTSTART;TZID=America/New_York:19970910T090000\n' +
      'RRULE:FREQ=MONTHLY;INTERVAL=18;COUNT=10;BYMONTHDAY=10,11,12,13,14,15';
    const snapshot = `
      [
        "Wed, 10 Sep 1997 13:00:00 GMT",
        "Thu, 11 Sep 1997 13:00:00 GMT",
        "Fri, 12 Sep 1997 13:00:00 GMT",
        "Sat, 13 Sep 1997 13:00:00 GMT",
        "Sun, 14 Sep 1997 13:00:00 GMT",
        "Mon, 15 Sep 1997 13:00:00 GMT",
        "Wed, 10 Mar 1999 14:00:00 GMT",
        "Thu, 11 Mar 1999 14:00:00 GMT",
        "Fri, 12 Mar 1999 14:00:00 GMT",
        "Sat, 13 Mar 1999 14:00:00 GMT",
      ]
    `;
    testWithConstructorAndRRule({rule, rrule, snapshot});
  });

  describe('Every Tuesday, every other month', () => {
    const rule = new RRuleTemporal({
      dtstart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: 'MONTHLY',
      interval: 2,
      byDay: ['TU'],
    });
    const rrule = 'DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=MONTHLY;INTERVAL=2;BYDAY=TU';
    const between = [DATE_1997_SEP_02_9AM_NEW_YORK_DST, new Date('1998-04-01T09:00:00.000-04:00')];
    const snapshot = `
      [
        "Tue, 02 Sep 1997 13:00:00 GMT",
        "Tue, 09 Sep 1997 13:00:00 GMT",
        "Tue, 16 Sep 1997 13:00:00 GMT",
        "Tue, 23 Sep 1997 13:00:00 GMT",
        "Tue, 30 Sep 1997 13:00:00 GMT",
        "Tue, 04 Nov 1997 14:00:00 GMT",
        "Tue, 11 Nov 1997 14:00:00 GMT",
        "Tue, 18 Nov 1997 14:00:00 GMT",
        "Tue, 25 Nov 1997 14:00:00 GMT",
        "Tue, 06 Jan 1998 14:00:00 GMT",
        "Tue, 13 Jan 1998 14:00:00 GMT",
        "Tue, 20 Jan 1998 14:00:00 GMT",
        "Tue, 27 Jan 1998 14:00:00 GMT",
        "Tue, 03 Mar 1998 14:00:00 GMT",
        "Tue, 10 Mar 1998 14:00:00 GMT",
        "Tue, 17 Mar 1998 14:00:00 GMT",
        "Tue, 24 Mar 1998 14:00:00 GMT",
        "Tue, 31 Mar 1998 14:00:00 GMT",
      ]
    `;
    testWithConstructorAndRRule({rule, rrule, snapshot, between});
  });

  describe('Yearly in June and July for 10 occurrences', () => {
    const rule = new RRuleTemporal({
      dtstart: zdt(1997, 6, 10, 9),
      tzid: RFC_TEST_TZID,
      freq: 'YEARLY',
      byMonth: [6, 7],
      count: 10,
    });
    const rrule = 'DTSTART;TZID=America/New_York:19970610T090000\nRRULE:FREQ=YEARLY;COUNT=10;BYMONTH=6,7';
    const snapshot = `
      [
        "Tue, 10 Jun 1997 13:00:00 GMT",
        "Thu, 10 Jul 1997 13:00:00 GMT",
        "Wed, 10 Jun 1998 13:00:00 GMT",
        "Fri, 10 Jul 1998 13:00:00 GMT",
        "Thu, 10 Jun 1999 13:00:00 GMT",
        "Sat, 10 Jul 1999 13:00:00 GMT",
        "Sat, 10 Jun 2000 13:00:00 GMT",
        "Mon, 10 Jul 2000 13:00:00 GMT",
        "Sun, 10 Jun 2001 13:00:00 GMT",
        "Tue, 10 Jul 2001 13:00:00 GMT",
      ]
    `;
    testWithConstructorAndRRule({rule, rrule, snapshot});
  });

  describe('Every other year on January, February, and March for 10 occurrences', () => {
    const rule = new RRuleTemporal({
      dtstart: zdt(1997, 3, 10, 9),
      tzid: RFC_TEST_TZID,
      freq: 'YEARLY',
      interval: 2,
      count: 10,
      byMonth: [1, 2, 3],
    });
    const rrule = 'DTSTART;TZID=America/New_York:19970310T090000\nRRULE:FREQ=YEARLY;INTERVAL=2;COUNT=10;BYMONTH=1,2,3';
    const snapshot = `
      [
        "Mon, 10 Mar 1997 14:00:00 GMT",
        "Sun, 10 Jan 1999 14:00:00 GMT",
        "Wed, 10 Feb 1999 14:00:00 GMT",
        "Wed, 10 Mar 1999 14:00:00 GMT",
        "Wed, 10 Jan 2001 14:00:00 GMT",
        "Sat, 10 Feb 2001 14:00:00 GMT",
        "Sat, 10 Mar 2001 14:00:00 GMT",
        "Fri, 10 Jan 2003 14:00:00 GMT",
        "Mon, 10 Feb 2003 14:00:00 GMT",
        "Mon, 10 Mar 2003 14:00:00 GMT",
      ]
    `;
    testWithConstructorAndRRule({rule, rrule, snapshot});
  });

  describe('Every third year on the 1st, 100th, and 200th day for 10 occurrences', () => {
    const rule = new RRuleTemporal({
      dtstart: zdt(1997, 1, 1, 9),
      tzid: RFC_TEST_TZID,
      freq: 'YEARLY',
      interval: 3,
      count: 10,
      byYearDay: [1, 100, 200],
    });
    const rrule =
      'DTSTART;TZID=America/New_York:19970101T090000\nRRULE:FREQ=YEARLY;INTERVAL=3;COUNT=10;BYYEARDAY=1,100,200';
    const snapshot = `
      [
        "Wed, 01 Jan 1997 14:00:00 GMT",
        "Thu, 10 Apr 1997 13:00:00 GMT",
        "Sat, 19 Jul 1997 13:00:00 GMT",
        "Sat, 01 Jan 2000 14:00:00 GMT",
        "Sun, 09 Apr 2000 13:00:00 GMT",
        "Tue, 18 Jul 2000 13:00:00 GMT",
        "Wed, 01 Jan 2003 14:00:00 GMT",
        "Thu, 10 Apr 2003 13:00:00 GMT",
        "Sat, 19 Jul 2003 13:00:00 GMT",
        "Sun, 01 Jan 2006 14:00:00 GMT",
      ]
    `;
    testWithConstructorAndRRule({rule, rrule, snapshot});
  });

  describe('Every 20th Monday of the year, forever', () => {
    const rule = new RRuleTemporal({
      dtstart: zdt(1997, 5, 19, 9),
      tzid: RFC_TEST_TZID,
      freq: 'YEARLY',
      byDay: ['20MO'],
    });
    const rrule = 'DTSTART;TZID=America/New_York:19970519T090000\nRRULE:FREQ=YEARLY;BYDAY=20MO';
    const snapshot = `
      [
        "Mon, 19 May 1997 13:00:00 GMT",
        "Mon, 18 May 1998 13:00:00 GMT",
        "Mon, 17 May 1999 13:00:00 GMT",
      ]
`;
    testWithConstructorAndRRule({rule, rrule, snapshot, limit: 3});
  });

  describe('Monday of week number 20 (where the default start of the week is Monday), forever', () => {
    const rule = new RRuleTemporal({
      dtstart: zdt(1997, 5, 12, 9),
      tzid: RFC_TEST_TZID,
      freq: 'YEARLY',
      byDay: ['MO'],
      byWeekNo: [20],
    });
    const rrule = 'DTSTART;TZID=America/New_York:19970512T090000\nRRULE:FREQ=YEARLY;BYWEEKNO=20;BYDAY=MO';
    const snapshot = `
[
  "Mon, 12 May 1997 13:00:00 GMT",
  "Mon, 11 May 1998 13:00:00 GMT",
  "Mon, 10 May 1999 13:00:00 GMT",
]
`;
    testWithConstructorAndRRule({rule, rrule, snapshot, limit: 3});
  });

  describe('Every Thursday in March, forever:', () => {
    const rule = new RRuleTemporal({
      dtstart: zdt(1997, 3, 13, 9),
      tzid: RFC_TEST_TZID,
      freq: 'YEARLY',
      byDay: ['TH'],
      byMonth: [3],
    });
    const rrule = 'DTSTART;TZID=America/New_York:19970313T090000\nRRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=TH';
    const between = [new Date('1997-03-13T09:00:00.000-05:00'), new Date('1999-03-25T09:00:00.000-05:00')];
    const snapshot = `
      [
        "Thu, 13 Mar 1997 14:00:00 GMT",
        "Thu, 20 Mar 1997 14:00:00 GMT",
        "Thu, 27 Mar 1997 14:00:00 GMT",
        "Thu, 05 Mar 1998 14:00:00 GMT",
        "Thu, 12 Mar 1998 14:00:00 GMT",
        "Thu, 19 Mar 1998 14:00:00 GMT",
        "Thu, 26 Mar 1998 14:00:00 GMT",
        "Thu, 04 Mar 1999 14:00:00 GMT",
        "Thu, 11 Mar 1999 14:00:00 GMT",
        "Thu, 18 Mar 1999 14:00:00 GMT",
        "Thu, 25 Mar 1999 14:00:00 GMT",
      ]
    `;
    testWithConstructorAndRRule({rule, rrule, snapshot, between});
  });

  describe('Every Thursday, but only during June, July, and August, forever', () => {
    const rule = new RRuleTemporal({
      dtstart: zdt(1997, 6, 5, 9),
      tzid: RFC_TEST_TZID,
      freq: 'YEARLY',
      byDay: ['TH'],
      byMonth: [6, 7, 8],
    });
    const rrule = 'DTSTART;TZID=America/New_York:19970605T090000\nRRULE:FREQ=YEARLY;BYDAY=TH;BYMONTH=6,7,8';
    const between = [new Date('1997-06-05T09:00:00.000-05:00'), new Date('1999-08-26T09:00:00.000-05:00')];
    const snapshot = `
[
  "Thu, 12 Jun 1997 13:00:00 GMT",
  "Thu, 19 Jun 1997 13:00:00 GMT",
  "Thu, 26 Jun 1997 13:00:00 GMT",
  "Thu, 03 Jul 1997 13:00:00 GMT",
  "Thu, 10 Jul 1997 13:00:00 GMT",
  "Thu, 17 Jul 1997 13:00:00 GMT",
  "Thu, 24 Jul 1997 13:00:00 GMT",
  "Thu, 31 Jul 1997 13:00:00 GMT",
  "Thu, 07 Aug 1997 13:00:00 GMT",
  "Thu, 14 Aug 1997 13:00:00 GMT",
  "Thu, 21 Aug 1997 13:00:00 GMT",
  "Thu, 28 Aug 1997 13:00:00 GMT",
  "Thu, 04 Jun 1998 13:00:00 GMT",
  "Thu, 11 Jun 1998 13:00:00 GMT",
  "Thu, 18 Jun 1998 13:00:00 GMT",
  "Thu, 25 Jun 1998 13:00:00 GMT",
  "Thu, 02 Jul 1998 13:00:00 GMT",
  "Thu, 09 Jul 1998 13:00:00 GMT",
  "Thu, 16 Jul 1998 13:00:00 GMT",
  "Thu, 23 Jul 1998 13:00:00 GMT",
  "Thu, 30 Jul 1998 13:00:00 GMT",
  "Thu, 06 Aug 1998 13:00:00 GMT",
  "Thu, 13 Aug 1998 13:00:00 GMT",
  "Thu, 20 Aug 1998 13:00:00 GMT",
  "Thu, 27 Aug 1998 13:00:00 GMT",
  "Thu, 03 Jun 1999 13:00:00 GMT",
  "Thu, 10 Jun 1999 13:00:00 GMT",
  "Thu, 17 Jun 1999 13:00:00 GMT",
  "Thu, 24 Jun 1999 13:00:00 GMT",
  "Thu, 01 Jul 1999 13:00:00 GMT",
  "Thu, 08 Jul 1999 13:00:00 GMT",
  "Thu, 15 Jul 1999 13:00:00 GMT",
  "Thu, 22 Jul 1999 13:00:00 GMT",
  "Thu, 29 Jul 1999 13:00:00 GMT",
  "Thu, 05 Aug 1999 13:00:00 GMT",
  "Thu, 12 Aug 1999 13:00:00 GMT",
  "Thu, 19 Aug 1999 13:00:00 GMT",
  "Thu, 26 Aug 1999 13:00:00 GMT",
]
`;
    testWithConstructorAndRRule({rule, rrule, snapshot, between});
  });

  describe('Every Friday the 13th, forever:', () => {
    const rule = new RRuleTemporal({
      dtstart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: 'MONTHLY',
      byDay: ['FR'],
      byMonthDay: [13],
    });
    const rrule = 'DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=MONTHLY;BYDAY=FR;BYMONTHDAY=13';
    const between = [DATE_1997_SEP_02_9AM_NEW_YORK_DST, new Date('2000-10-13T09:00:00.000-05:00')];
    const snapshot = `
      [
        "Fri, 13 Feb 1998 14:00:00 GMT",
        "Fri, 13 Mar 1998 14:00:00 GMT",
        "Fri, 13 Nov 1998 14:00:00 GMT",
        "Fri, 13 Aug 1999 13:00:00 GMT",
        "Fri, 13 Oct 2000 13:00:00 GMT",
      ]
    `;
    testWithConstructorAndRRule({rule, rrule, snapshot, between});
  });

  describe('The first Saturday that follows the first Sunday of the month, forever', () => {
    const rule = new RRuleTemporal({
      dtstart: zdt(1997, 9, 13, 9),
      tzid: RFC_TEST_TZID,
      freq: 'MONTHLY',
      byDay: ['SA'],
      byMonthDay: [7, 8, 9, 10, 11, 12, 13],
    });
    const rrule =
      'DTSTART;TZID=America/New_York:19970913T090000\nRRULE:FREQ=MONTHLY;BYDAY=SA;BYMONTHDAY=7,8,9,10,11,12,13';
    const between = [new Date('1997-09-13T09:00:00.000-04:00'), new Date('1998-06-13T09:00:00.000-04:00')];
    const snapshot = `
      [
        "Sat, 13 Sep 1997 13:00:00 GMT",
        "Sat, 11 Oct 1997 13:00:00 GMT",
        "Sat, 08 Nov 1997 14:00:00 GMT",
        "Sat, 13 Dec 1997 14:00:00 GMT",
        "Sat, 10 Jan 1998 14:00:00 GMT",
        "Sat, 07 Feb 1998 14:00:00 GMT",
        "Sat, 07 Mar 1998 14:00:00 GMT",
        "Sat, 11 Apr 1998 13:00:00 GMT",
        "Sat, 09 May 1998 13:00:00 GMT",
        "Sat, 13 Jun 1998 13:00:00 GMT",
      ]
    `;
    testWithConstructorAndRRule({rule, rrule, snapshot, between});
  });

  describe('Every 4 years, the first Tuesday after a Monday in November, forever (U.S. Presidential Election day)', () => {
    const rule = new RRuleTemporal({
      dtstart: zdt(1996, 11, 5, 9),
      tzid: RFC_TEST_TZID,
      freq: 'YEARLY',
      interval: 4,
      byMonth: [11],
      byDay: ['TU'],
      byMonthDay: [2, 3, 4, 5, 6, 7, 8],
    });
    const rrule =
      'DTSTART;TZID=America/New_York:19961105T090000\n' +
      'RRULE:FREQ=YEARLY;INTERVAL=4;BYMONTH=11;BYDAY=TU;BYMONTHDAY=2,3,4,5,6,7,8';
    const between = [new Date('1996-11-05T09:00:00.000-05:00'), new Date('2024-11-05T09:00:00.000-05:00')];
    const snapshot = `
      [
        "Tue, 05 Nov 1996 14:00:00 GMT",
        "Tue, 07 Nov 2000 14:00:00 GMT",
        "Tue, 02 Nov 2004 14:00:00 GMT",
        "Tue, 04 Nov 2008 14:00:00 GMT",
        "Tue, 06 Nov 2012 14:00:00 GMT",
        "Tue, 08 Nov 2016 14:00:00 GMT",
        "Tue, 03 Nov 2020 14:00:00 GMT",
        "Tue, 05 Nov 2024 14:00:00 GMT",
      ]
    `;
    testWithConstructorAndRRule({rule, rrule, snapshot, between});
  });

  describe('The third instance into the month of one of Tuesday, Wednesday, or Thursday, for the next 3 months', () => {
    const rule = new RRuleTemporal({
      dtstart: zdt(1997, 9, 4, 9),
      tzid: RFC_TEST_TZID,
      freq: 'MONTHLY',
      count: 3,
      byDay: ['TU', 'WE', 'TH'],
      bySetPos: [3],
    });
    const rrule = 'DTSTART;TZID=America/New_York:19970904T090000\nRRULE:FREQ=MONTHLY;COUNT=3;BYDAY=TU,WE,TH;BYSETPOS=3';
    const snapshot = `
      [
        "Thu, 04 Sep 1997 13:00:00 GMT",
        "Tue, 07 Oct 1997 13:00:00 GMT",
        "Thu, 06 Nov 1997 14:00:00 GMT",
      ]
    `;
    testWithConstructorAndRRule({rule, rrule, snapshot});
  });

  describe('The second last weekday of the month', () => {
    const rule = new RRuleTemporal({
      dtstart: zdt(1997, 9, 29, 9),
      tzid: RFC_TEST_TZID,
      freq: 'MONTHLY',
      byDay: ['MO', 'TU', 'WE', 'TH', 'FR'],
      bySetPos: [-2],
    });
    const rrule = 'DTSTART;TZID=America/New_York:19970929T090000\nRRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-2';
    const snapshot = `
      [
        "Mon, 29 Sep 1997 13:00:00 GMT",
        "Thu, 30 Oct 1997 14:00:00 GMT",
        "Thu, 27 Nov 1997 14:00:00 GMT",
        "Tue, 30 Dec 1997 14:00:00 GMT",
        "Thu, 29 Jan 1998 14:00:00 GMT",
        "Thu, 26 Feb 1998 14:00:00 GMT",
        "Mon, 30 Mar 1998 14:00:00 GMT",
      ]
`;
    testWithConstructorAndRRule({rule, rrule, snapshot, limit: 7});
  });

  describe('Every 3 hours from 9:00 AM to 5:00 PM on a specific day', () => {
    const rule = new RRuleTemporal({
      dtstart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: 'HOURLY',
      interval: 3,
      until: zdt(1997, 9, 2, 21, 'UTC'),
    });
    // see https://www.rfc-editor.org/errata/eid3883
    const rrule = 'DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=HOURLY;INTERVAL=3;UNTIL=19970902T210000Z';
    const snapshot = `
      [
        "Tue, 02 Sep 1997 13:00:00 GMT",
        "Tue, 02 Sep 1997 16:00:00 GMT",
        "Tue, 02 Sep 1997 19:00:00 GMT",
      ]
    `;
    testWithConstructorAndRRule({rule, rrule, snapshot});
  });

  describe('Every 15 minutes for 6 occurrences', () => {
    const rule = new RRuleTemporal({
      dtstart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: 'MINUTELY',
      interval: 15,
      count: 6,
    });
    const rrule = 'DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=MINUTELY;INTERVAL=15;COUNT=6';
    const snapshot = `
      [
        "Tue, 02 Sep 1997 13:00:00 GMT",
        "Tue, 02 Sep 1997 13:15:00 GMT",
        "Tue, 02 Sep 1997 13:30:00 GMT",
        "Tue, 02 Sep 1997 13:45:00 GMT",
        "Tue, 02 Sep 1997 14:00:00 GMT",
        "Tue, 02 Sep 1997 14:15:00 GMT",
      ]
    `;
    testWithConstructorAndRRule({rule, rrule, snapshot});
  });

  describe('Every hour and a half for 4 occurrences', () => {
    const rule = new RRuleTemporal({
      dtstart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: 'MINUTELY',
      interval: 90,
      count: 4,
    });
    const rrule = 'DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=MINUTELY;INTERVAL=90;COUNT=4';
    const snapshot = `
      [
        "Tue, 02 Sep 1997 13:00:00 GMT",
        "Tue, 02 Sep 1997 14:30:00 GMT",
        "Tue, 02 Sep 1997 16:00:00 GMT",
        "Tue, 02 Sep 1997 17:30:00 GMT",
      ]
    `;
    testWithConstructorAndRRule({rule, rrule, snapshot});
  });

  describe('Every 20 minutes from 9:00 AM to 4:40 PM every day', () => {
    const rule1 = new RRuleTemporal({
      dtstart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: 'DAILY',
      byHour: [9, 10, 11, 12, 13, 14, 15, 16],
      byMinute: [0, 20, 40],
    });
    const rrule1 =
      'DTSTART;TZID=America/New_York:19970902T090000\n' +
      'RRULE:FREQ=DAILY;BYHOUR=9,10,11,12,13,14,15,16;BYMINUTE=0,20,40';
    const rule2 = new RRuleTemporal({
      dtstart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: 'MINUTELY',
      interval: 20,
      byHour: [9, 10, 11, 12, 13, 14, 15, 16],
    });
    const rrule2 =
      'DTSTART;TZID=America/New_York:19970902T090000\n' +
      'RRULE:FREQ=MINUTELY;INTERVAL=20;BYHOUR=9,10,11,12,13,14,15,16';
    const snapshot = `
      [
        "Tue, 02 Sep 1997 13:00:00 GMT",
        "Tue, 02 Sep 1997 13:20:00 GMT",
        "Tue, 02 Sep 1997 13:40:00 GMT",
        "Tue, 02 Sep 1997 14:00:00 GMT",
        "Tue, 02 Sep 1997 14:20:00 GMT",
        "Tue, 02 Sep 1997 14:40:00 GMT",
        "Tue, 02 Sep 1997 15:00:00 GMT",
        "Tue, 02 Sep 1997 15:20:00 GMT",
        "Tue, 02 Sep 1997 15:40:00 GMT",
        "Tue, 02 Sep 1997 16:00:00 GMT",
        "Tue, 02 Sep 1997 16:20:00 GMT",
        "Tue, 02 Sep 1997 16:40:00 GMT",
        "Tue, 02 Sep 1997 17:00:00 GMT",
        "Tue, 02 Sep 1997 17:20:00 GMT",
        "Tue, 02 Sep 1997 17:40:00 GMT",
        "Tue, 02 Sep 1997 18:00:00 GMT",
      ]
    `;
    testWithConstructorAndRRule({rule: rule1, rrule: rrule1, snapshot, limit: 16});
    testWithConstructorAndRRule({rule: rule2, rrule: rrule2, snapshot, limit: 16});
  });

  describe('An example where an invalid date (i.e. February 30) is ignored', () => {
    const rule = new RRuleTemporal({
      dtstart: zdt(2007, 1, 15, 9),
      tzid: RFC_TEST_TZID,
      freq: 'MONTHLY',
      byMonthDay: [15, 30],
      count: 5,
    });
    const rrule = 'DTSTART;TZID=America/New_York:20070115T090000\nRRULE:FREQ=MONTHLY;BYMONTHDAY=15,30;COUNT=5';
    const snapshot = `
      [
        "Mon, 15 Jan 2007 14:00:00 GMT",
        "Tue, 30 Jan 2007 14:00:00 GMT",
        "Thu, 15 Feb 2007 14:00:00 GMT",
        "Thu, 15 Mar 2007 13:00:00 GMT",
        "Fri, 30 Mar 2007 13:00:00 GMT",
      ]
    `;
    testWithConstructorAndRRule({rule, rrule, snapshot});
  });
  describe('An example where the days generated makes a difference because of WKST', () => {
    const rule1 = new RRuleTemporal({
      dtstart: zdt(1997, 8, 5, 9),
      tzid: RFC_TEST_TZID,
      freq: 'WEEKLY',
      interval: 2,
      count: 4,
      byDay: ['TU', 'SU'],
      wkst: 'MO',
    });
    const rrule1 =
      'DTSTART;TZID=America/New_York:19970805T090000\nRRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=MO';
    const snapshot1 = `
      [
        "Tue, 05 Aug 1997 13:00:00 GMT",
        "Sun, 10 Aug 1997 13:00:00 GMT",
        "Tue, 19 Aug 1997 13:00:00 GMT",
        "Sun, 24 Aug 1997 13:00:00 GMT",
      ]
    `;
    testWithConstructorAndRRule({rule: rule1, rrule: rrule1, snapshot: snapshot1});
    const rule2 = new RRuleTemporal({
      dtstart: zdt(1997, 8, 5, 9),
      tzid: RFC_TEST_TZID,
      freq: 'WEEKLY',
      interval: 2,
      count: 4,
      byDay: ['TU', 'SU'],
      wkst: 'SU',
    });
    const rrule2 =
      'DTSTART;TZID=America/New_York:19970805T090000\nRRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=SU';
    const snapshot2 = `
        [
          "Tue, 05 Aug 1997 13:00:00 GMT",
          "Sun, 17 Aug 1997 13:00:00 GMT",
          "Tue, 19 Aug 1997 13:00:00 GMT",
          "Sun, 31 Aug 1997 13:00:00 GMT",
        ]
      `;
    testWithConstructorAndRRule({rule: rule2, rrule: rrule2, snapshot: snapshot2});
  });
});

describe('Additional smoke tests', () => {
  // Cover some scenarios not tested in the iCalendar.org examples, in particular bySecond, and
  // integration tests to make sure invalid inputs get ignored gracefully

  describe('secondly frequency', () => {
    test('Every second', () => {
      const rule = new RRuleTemporal({
        dtstart: DATE_2023_JAN_6_11PM,
        freq: 'SECONDLY',
        interval: 1,
        tzid: 'UTC',
      });

      expect(rule.all(limit(12)).map(formatISO)).toMatchInlineSnapshot(`
              [
                "2023-01-06T23:00:00.000Z",
                "2023-01-06T23:00:01.000Z",
                "2023-01-06T23:00:02.000Z",
                "2023-01-06T23:00:03.000Z",
                "2023-01-06T23:00:04.000Z",
                "2023-01-06T23:00:05.000Z",
                "2023-01-06T23:00:06.000Z",
                "2023-01-06T23:00:07.000Z",
                "2023-01-06T23:00:08.000Z",
                "2023-01-06T23:00:09.000Z",
                "2023-01-06T23:00:10.000Z",
                "2023-01-06T23:00:11.000Z",
              ]
          `);
    });
    test('Every 15 seconds', () => {
      const rule = new RRuleTemporal({
        dtstart: DATE_2023_JAN_6_11PM,
        freq: 'SECONDLY',
        interval: 15,
        tzid: 'UTC',
      });

      expect(rule.all(limit(12)).map(formatISO)).toMatchInlineSnapshot(`
        [
          "2023-01-06T23:00:00.000Z",
          "2023-01-06T23:00:15.000Z",
          "2023-01-06T23:00:30.000Z",
          "2023-01-06T23:00:45.000Z",
          "2023-01-06T23:01:00.000Z",
          "2023-01-06T23:01:15.000Z",
          "2023-01-06T23:01:30.000Z",
          "2023-01-06T23:01:45.000Z",
          "2023-01-06T23:02:00.000Z",
          "2023-01-06T23:02:15.000Z",
          "2023-01-06T23:02:30.000Z",
          "2023-01-06T23:02:45.000Z",
        ]
      `);
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
      expect(rule.all(limit(12)).map(formatISO)).toMatchInlineSnapshot(`
[
  "2023-01-07T23:00:00.000Z",
  "2023-01-14T23:00:00.000Z",
  "2023-01-21T23:00:00.000Z",
  "2023-01-28T23:00:00.000Z",
  "2023-02-04T23:00:00.000Z",
  "2023-02-11T23:00:00.000Z",
  "2023-02-18T23:00:00.000Z",
  "2023-02-25T23:00:00.000Z",
  "2023-03-04T23:00:00.000Z",
  "2023-03-11T23:00:00.000Z",
  "2023-03-18T23:00:00.000Z",
  "2023-03-25T23:00:00.000Z",
]
`);

      const rule2 = new RRuleTemporal({
        dtstart: DATE_2023_JAN_6_11PM,
        freq: 'WEEKLY',
        interval: 1,
        tzid: 'UTC',
        byDay: ['SA'],
      });

      expect(rule2.all(limit(12)).map(formatISO)).toMatchInlineSnapshot(`
        [
          "2023-01-07T23:00:00.000Z",
          "2023-01-14T23:00:00.000Z",
          "2023-01-21T23:00:00.000Z",
          "2023-01-28T23:00:00.000Z",
          "2023-02-04T23:00:00.000Z",
          "2023-02-11T23:00:00.000Z",
          "2023-02-18T23:00:00.000Z",
          "2023-02-25T23:00:00.000Z",
          "2023-03-04T23:00:00.000Z",
          "2023-03-11T23:00:00.000Z",
          "2023-03-18T23:00:00.000Z",
          "2023-03-25T23:00:00.000Z",
        ]
      `);
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
      expect(rule.all(limit(14)).map(formatISO)).toMatchInlineSnapshot(`
        [
          "2019-12-19T00:00:00.000Z",
          "2019-12-26T00:00:00.000Z",
          "2020-01-02T00:00:00.000Z",
          "2020-01-09T00:00:00.000Z",
          "2020-01-16T00:00:00.000Z",
          "2020-01-23T00:00:00.000Z",
          "2020-01-30T00:00:00.000Z",
          "2020-02-06T00:00:00.000Z",
          "2020-02-13T00:00:00.000Z",
          "2020-02-20T00:00:00.000Z",
          "2020-02-27T00:00:00.000Z",
          "2020-03-05T00:00:00.000Z",
          "2020-03-12T00:00:00.000Z",
          "2020-03-19T00:00:00.000Z",
        ]
      `);

      const rule2 = new RRuleTemporal({
        dtstart: DATE_2019,
        freq: 'WEEKLY',
        interval: 1,
        tzid: 'UTC',
        // @ts-expect-error Expect invalid values
        byDay: ['SA', 'SU', 'MO', 0],
      });

      expect(rule2.all(limit(9)).map(formatISO)).toMatchInlineSnapshot(`
        [
          "2019-01-05T00:00:00.000Z",
          "2019-01-06T00:00:00.000Z",
          "2019-01-07T00:00:00.000Z",
          "2019-01-12T00:00:00.000Z",
          "2019-01-13T00:00:00.000Z",
          "2019-01-14T00:00:00.000Z",
          "2019-01-19T00:00:00.000Z",
          "2019-01-20T00:00:00.000Z",
          "2019-01-21T00:00:00.000Z",
        ]
      `);
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
      expect(rule.all(limit(14)).map(formatISO)).toMatchInlineSnapshot(`
        [
          "2019-12-19T00:00:00.000Z",
          "2020-12-19T00:00:00.000Z",
          "2021-12-19T00:00:00.000Z",
          "2022-12-19T00:00:00.000Z",
          "2023-12-19T00:00:00.000Z",
          "2024-12-19T00:00:00.000Z",
          "2025-12-19T00:00:00.000Z",
          "2026-12-19T00:00:00.000Z",
          "2027-12-19T00:00:00.000Z",
          "2028-12-19T00:00:00.000Z",
          "2029-12-19T00:00:00.000Z",
          "2030-12-19T00:00:00.000Z",
          "2031-12-19T00:00:00.000Z",
          "2032-12-19T00:00:00.000Z",
        ]
      `);
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
      expect(rule.all(limit(14)).map(formatISO)).toMatchInlineSnapshot(`
        [
          "2019-12-19T14:30:00.000Z",
          "2019-12-19T14:30:15.000Z",
          "2019-12-20T14:30:00.000Z",
          "2019-12-20T14:30:15.000Z",
          "2019-12-21T14:30:00.000Z",
          "2019-12-21T14:30:15.000Z",
          "2019-12-22T14:30:00.000Z",
          "2019-12-22T14:30:15.000Z",
          "2019-12-23T14:30:00.000Z",
          "2019-12-23T14:30:15.000Z",
          "2019-12-24T14:30:00.000Z",
          "2019-12-24T14:30:15.000Z",
          "2019-12-25T14:30:00.000Z",
          "2019-12-25T14:30:15.000Z",
        ]
      `);
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
      expect(rule.all(limit(14)).map(formatISO)).toMatchInlineSnapshot(`
        [
          "2019-12-19T00:15:00.000Z",
          "2019-12-19T00:15:30.000Z",
          "2019-12-19T00:30:00.000Z",
          "2019-12-19T00:30:30.000Z",
          "2019-12-19T01:15:00.000Z",
          "2019-12-19T01:15:30.000Z",
          "2019-12-19T01:30:00.000Z",
          "2019-12-19T01:30:30.000Z",
          "2019-12-19T02:15:00.000Z",
          "2019-12-19T02:15:30.000Z",
          "2019-12-19T02:30:00.000Z",
          "2019-12-19T02:30:30.000Z",
          "2019-12-19T03:15:00.000Z",
          "2019-12-19T03:15:30.000Z",
        ]
      `);
    });
    it('works with minutely frequency', () => {
      const rule = new RRuleTemporal({
        dtstart: DATE_2019_DECEMBER_19,
        freq: 'MINUTELY',
        interval: 1,
        tzid: 'UTC',
        bySecond: [10, 30, 58],
      });
      expect(rule.all(limit(14)).map(formatISO)).toMatchInlineSnapshot(`
      [
        "2019-12-19T00:00:10.000Z",
        "2019-12-19T00:00:30.000Z",
        "2019-12-19T00:00:58.000Z",
        "2019-12-19T00:01:10.000Z",
        "2019-12-19T00:01:30.000Z",
        "2019-12-19T00:01:58.000Z",
        "2019-12-19T00:02:10.000Z",
        "2019-12-19T00:02:30.000Z",
        "2019-12-19T00:02:58.000Z",
        "2019-12-19T00:03:10.000Z",
        "2019-12-19T00:03:30.000Z",
        "2019-12-19T00:03:58.000Z",
        "2019-12-19T00:04:10.000Z",
        "2019-12-19T00:04:30.000Z",
      ]
`);
    });
    it('works with secondly frequency', () => {
      const rule = new RRuleTemporal({
        dtstart: DATE_2019_DECEMBER_19,
        freq: 'SECONDLY',
        interval: 1,
        tzid: 'UTC',
        bySecond: [10, 30, 58],
      });
      expect(rule.all(limit(14)).map(formatISO)).toMatchInlineSnapshot(`
        [
          "2019-12-19T00:00:10.000Z",
          "2019-12-19T00:00:30.000Z",
          "2019-12-19T00:00:58.000Z",
          "2019-12-19T00:00:10.000Z",
          "2019-12-19T00:00:30.000Z",
          "2019-12-19T00:00:58.000Z",
          "2019-12-19T00:00:10.000Z",
          "2019-12-19T00:00:30.000Z",
          "2019-12-19T00:00:58.000Z",
          "2019-12-19T00:00:10.000Z",
          "2019-12-19T00:00:30.000Z",
          "2019-12-19T00:00:58.000Z",
          "2019-12-19T00:00:10.000Z",
          "2019-12-19T00:00:30.000Z",
        ]
      `);
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

      expect(rule3.all(limit(10)).map(formatISO)).toMatchInlineSnapshot(`
        [
          "2020-04-01T00:00:00.000Z",
          "2021-04-02T00:00:00.000Z",
          "2022-04-02T00:00:00.000Z",
          "2023-04-02T00:00:00.000Z",
          "2024-04-01T00:00:00.000Z",
          "2025-04-02T00:00:00.000Z",
          "2026-04-02T00:00:00.000Z",
          "2027-04-02T00:00:00.000Z",
          "2028-04-01T00:00:00.000Z",
          "2029-04-02T00:00:00.000Z",
        ]
      `);
    });
    it('ignores invalid byYearDay values', () => {
      const rule = new RRuleTemporal({
        dtstart: DATE_2020,
        freq: 'YEARLY',
        byYearDay: [0, -1], // 0 is not a valid day
        interval: 1,
        tzid: 'UTC',
      });

      expect(rule.all(limit(10)).map(formatISO)).toMatchInlineSnapshot(`
        [
          "2020-12-31T00:00:00.000Z",
          "2021-12-31T00:00:00.000Z",
          "2022-12-31T00:00:00.000Z",
          "2023-12-31T00:00:00.000Z",
          "2024-12-31T00:00:00.000Z",
          "2025-12-31T00:00:00.000Z",
          "2026-12-31T00:00:00.000Z",
          "2027-12-31T00:00:00.000Z",
          "2028-12-31T00:00:00.000Z",
          "2029-12-31T00:00:00.000Z",
        ]
      `);
    });
  });

  describe('strict', () => {
    // TODO: need to check this, need to update test?
    it.skip("when omitted, yields dtstart as an occurrence even if it doesn't match the RRule", () => {
      const rule = new RRuleTemporal({
        dtstart: DATE_2019_DECEMBER_19,
        freq: 'MONTHLY',
        interval: 1,
        tzid: 'UTC',
        byMonth: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      });

      expect(rule.all(limit(18)).map(formatISO)).toMatchInlineSnapshot(`
[
  "2020-01-19T00:00:00.000Z",
  "2020-02-19T00:00:00.000Z",
  "2020-03-19T00:00:00.000Z",
  "2020-04-19T00:00:00.000Z",
  "2020-05-19T00:00:00.000Z",
  "2020-06-19T00:00:00.000Z",
  "2020-07-19T00:00:00.000Z",
  "2020-08-19T00:00:00.000Z",
  "2020-09-19T00:00:00.000Z",
  "2020-10-19T00:00:00.000Z",
  "2020-11-19T00:00:00.000Z",
  "2021-01-19T00:00:00.000Z",
  "2021-02-19T00:00:00.000Z",
  "2021-03-19T00:00:00.000Z",
  "2021-04-19T00:00:00.000Z",
  "2021-05-19T00:00:00.000Z",
  "2021-06-19T00:00:00.000Z",
  "2021-07-19T00:00:00.000Z",
]
`);
    });

    // TODO: dtstart with strict?
    it.skip('when true, only yields dtstart if it actually matches the RRule', () => {
      const rule1 = new RRuleTemporal(
        {
          dtstart: DATE_2019_DECEMBER_19,
          freq: 'MONTHLY',
          interval: 1,
          tzid: 'UTC',
          byMonth: [1, 2, 3],
        },
        // { strict: true }
      );

      const rule2 = new RRuleTemporal(
        {
          dtstart: DATE_2019_DECEMBER_19,
          freq: 'MONTHLY',
          interval: 1,
          tzid: 'UTC',
          byMonth: [1, 2, 3, 12],
        },
        // { strict: false }
      );

      expect(rule1.all(limit(3)).map(formatISO)).toMatchInlineSnapshot(`
        [
          "2020-01-19T00:00:00.000Z",
          "2020-02-19T00:00:00.000Z",
          "2020-03-19T00:00:00.000Z",
        ]
      `);
      expect(rule2.all(limit(3)).map(formatISO)).toMatchInlineSnapshot(`
        [
          "2019-12-19T00:00:00.000Z",
          "2020-01-19T00:00:00.000Z",
          "2020-02-19T00:00:00.000Z",
        ]
      `);
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
    expect(rule.all(limit(20)).map(format(tz))).toMatchInlineSnapshot(`
      [
        "2024-03-12T22:00:00+11:00[Australia/Sydney]",
        "2024-04-12T22:00:00+10:00[Australia/Sydney]",
        "2024-05-12T22:00:00+10:00[Australia/Sydney]",
        "2024-06-12T22:00:00+10:00[Australia/Sydney]",
        "2024-07-12T22:00:00+10:00[Australia/Sydney]",
        "2024-08-12T22:00:00+10:00[Australia/Sydney]",
        "2024-09-12T22:00:00+10:00[Australia/Sydney]",
        "2024-10-12T22:00:00+11:00[Australia/Sydney]",
        "2024-11-12T22:00:00+11:00[Australia/Sydney]",
        "2024-12-12T22:00:00+11:00[Australia/Sydney]",
        "2025-01-12T22:00:00+11:00[Australia/Sydney]",
        "2025-02-12T22:00:00+11:00[Australia/Sydney]",
        "2025-03-12T22:00:00+11:00[Australia/Sydney]",
        "2025-04-12T22:00:00+10:00[Australia/Sydney]",
        "2025-05-12T22:00:00+10:00[Australia/Sydney]",
        "2025-06-12T22:00:00+10:00[Australia/Sydney]",
        "2025-07-12T22:00:00+10:00[Australia/Sydney]",
        "2025-08-12T22:00:00+10:00[Australia/Sydney]",
        "2025-09-12T22:00:00+10:00[Australia/Sydney]",
        "2025-10-12T22:00:00+11:00[Australia/Sydney]",
      ]
    `);
    expect(rule.all(limit(20)).map(formatISO)).toMatchInlineSnapshot(`
      [
        "2024-03-12T11:00:00.000Z",
        "2024-04-12T12:00:00.000Z",
        "2024-05-12T12:00:00.000Z",
        "2024-06-12T12:00:00.000Z",
        "2024-07-12T12:00:00.000Z",
        "2024-08-12T12:00:00.000Z",
        "2024-09-12T12:00:00.000Z",
        "2024-10-12T11:00:00.000Z",
        "2024-11-12T11:00:00.000Z",
        "2024-12-12T11:00:00.000Z",
        "2025-01-12T11:00:00.000Z",
        "2025-02-12T11:00:00.000Z",
        "2025-03-12T11:00:00.000Z",
        "2025-04-12T12:00:00.000Z",
        "2025-05-12T12:00:00.000Z",
        "2025-06-12T12:00:00.000Z",
        "2025-07-12T12:00:00.000Z",
        "2025-08-12T12:00:00.000Z",
        "2025-09-12T12:00:00.000Z",
        "2025-10-12T11:00:00.000Z",
      ]
    `);
  });
});

describe('Tests from rust package', function () {
  it('every 2 months on the last Monday', function () {
    const rule = 'DTSTART;TZID=Europe/London:20231030T140000\nRRULE:FREQ=MONTHLY;INTERVAL=2;BYDAY=-1MO';
    expect(parse(rule).all(limit(3)).map(formatISO)).toMatchInlineSnapshot(`
      [
        "2023-10-30T14:00:00.000Z",
        "2023-12-25T14:00:00.000Z",
        "2024-02-26T14:00:00.000Z",
      ]
    `);
  });
  describe('Monthly on 31st or -31st of the month', function () {
    // Recurrence rules may generate recurrence instances with an invalid date (e.g., February 30)
    // or nonexistent local time (e.g., 1:30 AM on a day where the local time is moved forward by an
    // hour at 1:00 AM). Such recurrence instances MUST be ignored and MUST NOT be counted as
    // part of the recurrence set.
    it('Monthly on the 31st of the month', function () {
      const rule = 'DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=MONTHLY;COUNT=10;BYMONTHDAY=31';
      expect(parse(rule).all(limit(16)).map(formatISO)).toMatchInlineSnapshot(`
        [
          "1997-10-31T14:00:00.000Z",
          "1997-12-31T14:00:00.000Z",
          "1998-01-31T14:00:00.000Z",
          "1998-03-31T14:00:00.000Z",
          "1998-05-31T13:00:00.000Z",
          "1998-07-31T13:00:00.000Z",
          "1998-08-31T13:00:00.000Z",
          "1998-10-31T14:00:00.000Z",
          "1998-12-31T14:00:00.000Z",
          "1999-01-31T14:00:00.000Z",
        ]
    `);
    });
    it('Monthly on the 31th-to-last of the month', function () {
      const rule = 'DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=MONTHLY;COUNT=10;BYMONTHDAY=-31';
      expect(parse(rule).all(limit(16)).map(formatISO)).toMatchInlineSnapshot(`
        [
          "1997-10-01T13:00:00.000Z",
          "1997-12-01T14:00:00.000Z",
          "1998-01-01T14:00:00.000Z",
          "1998-03-01T14:00:00.000Z",
          "1998-05-01T13:00:00.000Z",
          "1998-07-01T13:00:00.000Z",
          "1998-08-01T13:00:00.000Z",
          "1998-10-01T13:00:00.000Z",
          "1998-12-01T14:00:00.000Z",
          "1999-01-01T14:00:00.000Z",
        ]
    `);
    });
  });
  const FOUR_HOURS_MS = 14400000;
  it('DST hourly/minutes handling GMT -> BST', function () {
    const tz = 'Europe/London';
    const rule = `DTSTART;TZID=${tz}:20240330T000000\nRRULE:FREQ=DAILY;BYHOUR=0,1,2,3,4;BYMINUTE=0,30`;
    const Y2024_03_31_UTC = 1711843200000;
    const r = [new Date(Y2024_03_31_UTC - FOUR_HOURS_MS), new Date(Y2024_03_31_UTC + FOUR_HOURS_MS)];
    const entries = parse(rule).between(r[0]!, r[1]!);

    // change over at 1am, have gaps
    expect(entries.map(format(tz))).toMatchInlineSnapshot(`
      [
        "2024-03-31T00:00:00+00:00[Europe/London]",
        "2024-03-31T00:30:00+00:00[Europe/London]",
        "2024-03-31T02:00:00+01:00[Europe/London]",
        "2024-03-31T02:30:00+01:00[Europe/London]",
        "2024-03-31T03:00:00+01:00[Europe/London]",
        "2024-03-31T03:30:00+01:00[Europe/London]",
        "2024-03-31T04:00:00+01:00[Europe/London]",
        "2024-03-31T04:30:00+01:00[Europe/London]",
      ]
    `);
    expect(entries.map(formatISO)).toMatchInlineSnapshot(`
      [
        "2024-03-31T00:00:00.000Z",
        "2024-03-31T00:30:00.000Z",
        "2024-03-31T01:00:00.000Z",
        "2024-03-31T01:30:00.000Z",
        "2024-03-31T02:00:00.000Z",
        "2024-03-31T02:30:00.000Z",
        "2024-03-31T03:00:00.000Z",
        "2024-03-31T03:30:00.000Z",
      ]
    `);
  });
  it('DST hourly/minutes handling BST -> GMT', function () {
    const tz = 'Europe/London';
    const rule = `DTSTART;TZID=${tz}:20241026T000000\nRRULE:FREQ=DAILY;BYHOUR=0,1,2,3,4;BYMINUTE=0,30`;
    const Y2024_10_27_UTC = 1729987200000;
    const r = [new Date(Y2024_10_27_UTC - FOUR_HOURS_MS), new Date(Y2024_10_27_UTC + FOUR_HOURS_MS)];
    const entries = parse(rule).between(r[0]!, r[1]!);
    // should have no gaps
    expect(entries.map(format(tz))).toMatchInlineSnapshot(`
      [
        "2024-10-27T00:00:00+01:00[Europe/London]",
        "2024-10-27T00:30:00+01:00[Europe/London]",
        "2024-10-27T01:00:00+01:00[Europe/London]",
        "2024-10-27T01:30:00+01:00[Europe/London]",
        "2024-10-27T02:00:00+00:00[Europe/London]",
        "2024-10-27T02:30:00+00:00[Europe/London]",
        "2024-10-27T03:00:00+00:00[Europe/London]",
        "2024-10-27T03:30:00+00:00[Europe/London]",
      ]
    `);
    // change over at 2am
    expect(entries.map(formatISO)).toMatchInlineSnapshot(`
      [
        "2024-10-26T23:00:00.000Z",
        "2024-10-26T23:30:00.000Z",
        "2024-10-27T00:00:00.000Z",
        "2024-10-27T00:30:00.000Z",
        "2024-10-27T02:00:00.000Z",
        "2024-10-27T02:30:00.000Z",
        "2024-10-27T03:00:00.000Z",
        "2024-10-27T03:30:00.000Z",
      ]
    `);
  });
});

describe('exDate', function () {
  it('Multiple exDate', function () {
    const rule = 'DTSTART:20201114T000000Z\nRRULE:FREQ=DAILY\nEXDATE;TZID=UTC:20201121T000000,20201128T000000Z';
    const r = [new Date('2020-11-14T00:00:00.000Z'), new Date('2020-11-30T00:00:00.000Z')];
    const entries = parse(rule).between(r[0]!, r[1]!).map(formatISO);
    expect(entries).toMatchInlineSnapshot(`
      [
        "2020-11-15T00:00:00.000Z",
        "2020-11-16T00:00:00.000Z",
        "2020-11-17T00:00:00.000Z",
        "2020-11-18T00:00:00.000Z",
        "2020-11-19T00:00:00.000Z",
        "2020-11-20T00:00:00.000Z",
        "2020-11-22T00:00:00.000Z",
        "2020-11-23T00:00:00.000Z",
        "2020-11-24T00:00:00.000Z",
        "2020-11-25T00:00:00.000Z",
        "2020-11-26T00:00:00.000Z",
        "2020-11-27T00:00:00.000Z",
        "2020-11-29T00:00:00.000Z",
      ]
    `);
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

    expect(rule.all().map(formatISO)).toMatchInlineSnapshot(`
[
  "2019-12-19T00:00:00.000Z",
  "2020-02-19T00:00:00.000Z",
  "2020-04-19T00:00:00.000Z",
  "2020-05-14T00:00:00.000Z",
  "2020-05-15T00:00:00.000Z",
  "2020-06-19T00:00:00.000Z",
  "2020-07-18T00:00:00.000Z",
  "2020-08-19T00:00:00.000Z",
  "2020-10-19T00:00:00.000Z",
  "2020-12-19T00:00:00.000Z",
]
`);
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

    expect(rule.all().map(formatISO)).toMatchInlineSnapshot(`
[
  "2019-12-19T00:00:00.000Z",
  "2020-02-19T00:00:00.000Z",
  "2020-04-19T00:00:00.000Z",
  "2020-05-15T00:00:00.000Z",
  "2020-06-19T00:00:00.000Z",
  "2020-07-18T00:00:00.000Z",
  "2020-08-19T00:00:00.000Z",
  "2020-10-19T00:00:00.000Z",
  "2020-12-19T00:00:00.000Z",
  "2021-02-19T00:00:00.000Z",
]
`);
  });
});
// test https://github.com/fmeringdal/rust-rrule/issues/119

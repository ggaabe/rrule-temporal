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
import {assertDates, formatUTC, IAssertDates, limit, zdt} from './helpers';

const INVALID_DATE = '2020-01-01-01-01T:00:00:00Z';

const RFC_TEST_TZID = 'America/New_York';
const DATE_1997_SEP_02_9AM_NEW_YORK_DST = zdt(1997, 9, 2, 9);
const DATE_1998_JAN_1_9AM_NEW_YORK = zdt(1998, 1, 1, 9);
const DATE_1997_DEC_24_MIDNIGHT_NEW_YORK = zdt(1997, 12, 24);

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
      const between = [new Date('1997-09-05T20:00:00.000-04:00'), new Date('1997-09-10T20:00:00.000-04:00')];
      assertDates({rule, between, print: formatUTC}, [
        'Sat, 06 Sep 1997 13:00:00 GMT',
        'Sun, 07 Sep 1997 13:00:00 GMT',
        'Mon, 08 Sep 1997 13:00:00 GMT',
        'Tue, 09 Sep 1997 13:00:00 GMT',
        'Wed, 10 Sep 1997 13:00:00 GMT',
      ]);
    });

    describe('if the specified start date is a occurrence', () => {
      it('includes only occurrences after the specified date by default', () => {
        const between = [new Date('1997-09-05T09:00:00.000-04:00'), new Date('1997-09-10T20:00:00.000-04:00')];
        assertDates({rule, between, inc: false, print: formatUTC}, [
          'Sat, 06 Sep 1997 13:00:00 GMT',
          'Sun, 07 Sep 1997 13:00:00 GMT',
          'Mon, 08 Sep 1997 13:00:00 GMT',
          'Tue, 09 Sep 1997 13:00:00 GMT',
          'Wed, 10 Sep 1997 13:00:00 GMT',
        ]);
      });

      it('returns the specified date when passed inclusive: true', () => {
        const between = [new Date('1997-09-05T09:00:00.000-04:00'), new Date('1997-09-10T20:00:00.000-04:00')];
        assertDates({rule, between, inc: true, print: formatUTC}, [
          'Fri, 05 Sep 1997 13:00:00 GMT',
          'Sat, 06 Sep 1997 13:00:00 GMT',
          'Sun, 07 Sep 1997 13:00:00 GMT',
          'Mon, 08 Sep 1997 13:00:00 GMT',
          'Tue, 09 Sep 1997 13:00:00 GMT',
          'Wed, 10 Sep 1997 13:00:00 GMT',
        ]);
      });
    });

    describe('if the specified end date is a occurrence', () => {
      it('includes only occurrences after the specified date by default', () => {
        const between = [new Date('1997-09-05T20:00:00.000-04:00'), new Date('1997-09-10T09:00:00.000-04:00')];
        assertDates({rule, between, inc: false, print: formatUTC}, [
          'Sat, 06 Sep 1997 13:00:00 GMT',
          'Sun, 07 Sep 1997 13:00:00 GMT',
          'Mon, 08 Sep 1997 13:00:00 GMT',
          'Tue, 09 Sep 1997 13:00:00 GMT',
        ]);
      });

      it('returns the specified date when passed inclusive: true', () => {
        const between = [new Date('1997-09-05T20:00:00.000-04:00'), new Date('1997-09-10T09:00:00.000-04:00')];
        assertDates({rule, between, inc: true, print: formatUTC}, [
          'Sat, 06 Sep 1997 13:00:00 GMT',
          'Sun, 07 Sep 1997 13:00:00 GMT',
          'Mon, 08 Sep 1997 13:00:00 GMT',
          'Tue, 09 Sep 1997 13:00:00 GMT',
          'Wed, 10 Sep 1997 13:00:00 GMT',
        ]);
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

type IAssertRules = Omit<IAssertDates, 'print'> & {rrule: string; dates: string[]};
function assertRules({rule, rrule, dates, between, limit}: IAssertRules) {
  it('using constructor', function () {
    assertDates({rule, between, limit, print: formatUTC}, dates);
  });
  it('using rrule', function () {
    assertDates({rule: new RRuleTemporal({rruleString: rrule}), between, limit, print: formatUTC}, dates);
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
    const dates = [
      'Tue, 02 Sep 1997 13:00:00 GMT',
      'Wed, 03 Sep 1997 13:00:00 GMT',
      'Thu, 04 Sep 1997 13:00:00 GMT',
      'Fri, 05 Sep 1997 13:00:00 GMT',
      'Sat, 06 Sep 1997 13:00:00 GMT',
      'Sun, 07 Sep 1997 13:00:00 GMT',
      'Mon, 08 Sep 1997 13:00:00 GMT',
      'Tue, 09 Sep 1997 13:00:00 GMT',
      'Wed, 10 Sep 1997 13:00:00 GMT',
      'Thu, 11 Sep 1997 13:00:00 GMT',
    ];
    assertRules({rule, rrule, dates});
  });

  describe('Daily until December 24, 1997', () => {
    const rule = new RRuleTemporal({
      dtstart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: 'DAILY',
      until: DATE_1997_DEC_24_MIDNIGHT_NEW_YORK,
    });
    const rrule = 'DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=DAILY;UNTIL=19971224T000000Z';
    const dates = [
      'Tue, 02 Sep 1997 13:00:00 GMT',
      'Wed, 03 Sep 1997 13:00:00 GMT',
      'Thu, 04 Sep 1997 13:00:00 GMT',
      'Fri, 05 Sep 1997 13:00:00 GMT',
      'Sat, 06 Sep 1997 13:00:00 GMT',
      'Sun, 07 Sep 1997 13:00:00 GMT',
      'Mon, 08 Sep 1997 13:00:00 GMT',
      'Tue, 09 Sep 1997 13:00:00 GMT',
      'Wed, 10 Sep 1997 13:00:00 GMT',
      'Thu, 11 Sep 1997 13:00:00 GMT',
      'Fri, 12 Sep 1997 13:00:00 GMT',
      'Sat, 13 Sep 1997 13:00:00 GMT',
      'Sun, 14 Sep 1997 13:00:00 GMT',
      'Mon, 15 Sep 1997 13:00:00 GMT',
      'Tue, 16 Sep 1997 13:00:00 GMT',
      'Wed, 17 Sep 1997 13:00:00 GMT',
      'Thu, 18 Sep 1997 13:00:00 GMT',
      'Fri, 19 Sep 1997 13:00:00 GMT',
      'Sat, 20 Sep 1997 13:00:00 GMT',
      'Sun, 21 Sep 1997 13:00:00 GMT',
      'Mon, 22 Sep 1997 13:00:00 GMT',
      'Tue, 23 Sep 1997 13:00:00 GMT',
      'Wed, 24 Sep 1997 13:00:00 GMT',
      'Thu, 25 Sep 1997 13:00:00 GMT',
      'Fri, 26 Sep 1997 13:00:00 GMT',
      'Sat, 27 Sep 1997 13:00:00 GMT',
      'Sun, 28 Sep 1997 13:00:00 GMT',
      'Mon, 29 Sep 1997 13:00:00 GMT',
      'Tue, 30 Sep 1997 13:00:00 GMT',
      'Wed, 01 Oct 1997 13:00:00 GMT',
      'Thu, 02 Oct 1997 13:00:00 GMT',
      'Fri, 03 Oct 1997 13:00:00 GMT',
      'Sat, 04 Oct 1997 13:00:00 GMT',
      'Sun, 05 Oct 1997 13:00:00 GMT',
      'Mon, 06 Oct 1997 13:00:00 GMT',
      'Tue, 07 Oct 1997 13:00:00 GMT',
      'Wed, 08 Oct 1997 13:00:00 GMT',
      'Thu, 09 Oct 1997 13:00:00 GMT',
      'Fri, 10 Oct 1997 13:00:00 GMT',
      'Sat, 11 Oct 1997 13:00:00 GMT',
      'Sun, 12 Oct 1997 13:00:00 GMT',
      'Mon, 13 Oct 1997 13:00:00 GMT',
      'Tue, 14 Oct 1997 13:00:00 GMT',
      'Wed, 15 Oct 1997 13:00:00 GMT',
      'Thu, 16 Oct 1997 13:00:00 GMT',
      'Fri, 17 Oct 1997 13:00:00 GMT',
      'Sat, 18 Oct 1997 13:00:00 GMT',
      'Sun, 19 Oct 1997 13:00:00 GMT',
      'Mon, 20 Oct 1997 13:00:00 GMT',
      'Tue, 21 Oct 1997 13:00:00 GMT',
      'Wed, 22 Oct 1997 13:00:00 GMT',
      'Thu, 23 Oct 1997 13:00:00 GMT',
      'Fri, 24 Oct 1997 13:00:00 GMT',
      'Sat, 25 Oct 1997 13:00:00 GMT',
      'Sun, 26 Oct 1997 14:00:00 GMT',
      'Mon, 27 Oct 1997 14:00:00 GMT',
      'Tue, 28 Oct 1997 14:00:00 GMT',
      'Wed, 29 Oct 1997 14:00:00 GMT',
      'Thu, 30 Oct 1997 14:00:00 GMT',
      'Fri, 31 Oct 1997 14:00:00 GMT',
      'Sat, 01 Nov 1997 14:00:00 GMT',
      'Sun, 02 Nov 1997 14:00:00 GMT',
      'Mon, 03 Nov 1997 14:00:00 GMT',
      'Tue, 04 Nov 1997 14:00:00 GMT',
      'Wed, 05 Nov 1997 14:00:00 GMT',
      'Thu, 06 Nov 1997 14:00:00 GMT',
      'Fri, 07 Nov 1997 14:00:00 GMT',
      'Sat, 08 Nov 1997 14:00:00 GMT',
      'Sun, 09 Nov 1997 14:00:00 GMT',
      'Mon, 10 Nov 1997 14:00:00 GMT',
      'Tue, 11 Nov 1997 14:00:00 GMT',
      'Wed, 12 Nov 1997 14:00:00 GMT',
      'Thu, 13 Nov 1997 14:00:00 GMT',
      'Fri, 14 Nov 1997 14:00:00 GMT',
      'Sat, 15 Nov 1997 14:00:00 GMT',
      'Sun, 16 Nov 1997 14:00:00 GMT',
      'Mon, 17 Nov 1997 14:00:00 GMT',
      'Tue, 18 Nov 1997 14:00:00 GMT',
      'Wed, 19 Nov 1997 14:00:00 GMT',
      'Thu, 20 Nov 1997 14:00:00 GMT',
      'Fri, 21 Nov 1997 14:00:00 GMT',
      'Sat, 22 Nov 1997 14:00:00 GMT',
      'Sun, 23 Nov 1997 14:00:00 GMT',
      'Mon, 24 Nov 1997 14:00:00 GMT',
      'Tue, 25 Nov 1997 14:00:00 GMT',
      'Wed, 26 Nov 1997 14:00:00 GMT',
      'Thu, 27 Nov 1997 14:00:00 GMT',
      'Fri, 28 Nov 1997 14:00:00 GMT',
      'Sat, 29 Nov 1997 14:00:00 GMT',
      'Sun, 30 Nov 1997 14:00:00 GMT',
      'Mon, 01 Dec 1997 14:00:00 GMT',
      'Tue, 02 Dec 1997 14:00:00 GMT',
      'Wed, 03 Dec 1997 14:00:00 GMT',
      'Thu, 04 Dec 1997 14:00:00 GMT',
      'Fri, 05 Dec 1997 14:00:00 GMT',
      'Sat, 06 Dec 1997 14:00:00 GMT',
      'Sun, 07 Dec 1997 14:00:00 GMT',
      'Mon, 08 Dec 1997 14:00:00 GMT',
      'Tue, 09 Dec 1997 14:00:00 GMT',
      'Wed, 10 Dec 1997 14:00:00 GMT',
      'Thu, 11 Dec 1997 14:00:00 GMT',
      'Fri, 12 Dec 1997 14:00:00 GMT',
      'Sat, 13 Dec 1997 14:00:00 GMT',
      'Sun, 14 Dec 1997 14:00:00 GMT',
      'Mon, 15 Dec 1997 14:00:00 GMT',
      'Tue, 16 Dec 1997 14:00:00 GMT',
      'Wed, 17 Dec 1997 14:00:00 GMT',
      'Thu, 18 Dec 1997 14:00:00 GMT',
      'Fri, 19 Dec 1997 14:00:00 GMT',
      'Sat, 20 Dec 1997 14:00:00 GMT',
      'Sun, 21 Dec 1997 14:00:00 GMT',
      'Mon, 22 Dec 1997 14:00:00 GMT',
      'Tue, 23 Dec 1997 14:00:00 GMT',
    ];
    assertRules({rule, rrule, dates});
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
    const dates = [
      'Tue, 02 Sep 1997 13:00:00 GMT',
      'Thu, 04 Sep 1997 13:00:00 GMT',
      'Sat, 06 Sep 1997 13:00:00 GMT',
      'Mon, 08 Sep 1997 13:00:00 GMT',
      'Wed, 10 Sep 1997 13:00:00 GMT',
      'Fri, 12 Sep 1997 13:00:00 GMT',
      'Sun, 14 Sep 1997 13:00:00 GMT',
      'Tue, 16 Sep 1997 13:00:00 GMT',
      'Thu, 18 Sep 1997 13:00:00 GMT',
      'Sat, 20 Sep 1997 13:00:00 GMT',
      'Mon, 22 Sep 1997 13:00:00 GMT',
      'Wed, 24 Sep 1997 13:00:00 GMT',
      'Fri, 26 Sep 1997 13:00:00 GMT',
      'Sun, 28 Sep 1997 13:00:00 GMT',
      'Tue, 30 Sep 1997 13:00:00 GMT',
      'Thu, 02 Oct 1997 13:00:00 GMT',
      'Sat, 04 Oct 1997 13:00:00 GMT',
      'Mon, 06 Oct 1997 13:00:00 GMT',
      'Wed, 08 Oct 1997 13:00:00 GMT',
      'Fri, 10 Oct 1997 13:00:00 GMT',
      'Sun, 12 Oct 1997 13:00:00 GMT',
      'Tue, 14 Oct 1997 13:00:00 GMT',
      'Thu, 16 Oct 1997 13:00:00 GMT',
      'Sat, 18 Oct 1997 13:00:00 GMT',
      'Mon, 20 Oct 1997 13:00:00 GMT',
      'Wed, 22 Oct 1997 13:00:00 GMT',
      'Fri, 24 Oct 1997 13:00:00 GMT',
      'Sun, 26 Oct 1997 14:00:00 GMT',
      'Tue, 28 Oct 1997 14:00:00 GMT',
      'Thu, 30 Oct 1997 14:00:00 GMT',
      'Sat, 01 Nov 1997 14:00:00 GMT',
      'Mon, 03 Nov 1997 14:00:00 GMT',
      'Wed, 05 Nov 1997 14:00:00 GMT',
      'Fri, 07 Nov 1997 14:00:00 GMT',
      'Sun, 09 Nov 1997 14:00:00 GMT',
      'Tue, 11 Nov 1997 14:00:00 GMT',
      'Thu, 13 Nov 1997 14:00:00 GMT',
      'Sat, 15 Nov 1997 14:00:00 GMT',
      'Mon, 17 Nov 1997 14:00:00 GMT',
      'Wed, 19 Nov 1997 14:00:00 GMT',
      'Fri, 21 Nov 1997 14:00:00 GMT',
      'Sun, 23 Nov 1997 14:00:00 GMT',
      'Tue, 25 Nov 1997 14:00:00 GMT',
      'Thu, 27 Nov 1997 14:00:00 GMT',
      'Sat, 29 Nov 1997 14:00:00 GMT',
      'Mon, 01 Dec 1997 14:00:00 GMT',
      'Wed, 03 Dec 1997 14:00:00 GMT',
    ];
    assertRules({rule, rrule, dates, between});
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
    const dates = [
      'Tue, 02 Sep 1997 13:00:00 GMT',
      'Fri, 12 Sep 1997 13:00:00 GMT',
      'Mon, 22 Sep 1997 13:00:00 GMT',
      'Thu, 02 Oct 1997 13:00:00 GMT',
      'Sun, 12 Oct 1997 13:00:00 GMT',
    ];
    assertRules({rule, rrule, dates});
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
    const dates = [
      'Thu, 01 Jan 1998 14:00:00 GMT',
      'Fri, 02 Jan 1998 14:00:00 GMT',
      'Sat, 03 Jan 1998 14:00:00 GMT',
      'Sun, 04 Jan 1998 14:00:00 GMT',
      'Mon, 05 Jan 1998 14:00:00 GMT',
      'Tue, 06 Jan 1998 14:00:00 GMT',
      'Wed, 07 Jan 1998 14:00:00 GMT',
      'Thu, 08 Jan 1998 14:00:00 GMT',
      'Fri, 09 Jan 1998 14:00:00 GMT',
      'Sat, 10 Jan 1998 14:00:00 GMT',
      'Sun, 11 Jan 1998 14:00:00 GMT',
      'Mon, 12 Jan 1998 14:00:00 GMT',
      'Tue, 13 Jan 1998 14:00:00 GMT',
      'Wed, 14 Jan 1998 14:00:00 GMT',
      'Thu, 15 Jan 1998 14:00:00 GMT',
      'Fri, 16 Jan 1998 14:00:00 GMT',
      'Sat, 17 Jan 1998 14:00:00 GMT',
      'Sun, 18 Jan 1998 14:00:00 GMT',
      'Mon, 19 Jan 1998 14:00:00 GMT',
      'Tue, 20 Jan 1998 14:00:00 GMT',
      'Wed, 21 Jan 1998 14:00:00 GMT',
      'Thu, 22 Jan 1998 14:00:00 GMT',
      'Fri, 23 Jan 1998 14:00:00 GMT',
      'Sat, 24 Jan 1998 14:00:00 GMT',
      'Sun, 25 Jan 1998 14:00:00 GMT',
      'Mon, 26 Jan 1998 14:00:00 GMT',
      'Tue, 27 Jan 1998 14:00:00 GMT',
      'Wed, 28 Jan 1998 14:00:00 GMT',
      'Thu, 29 Jan 1998 14:00:00 GMT',
      'Fri, 30 Jan 1998 14:00:00 GMT',
      'Sat, 31 Jan 1998 14:00:00 GMT',
      'Fri, 01 Jan 1999 14:00:00 GMT',
      'Sat, 02 Jan 1999 14:00:00 GMT',
      'Sun, 03 Jan 1999 14:00:00 GMT',
      'Mon, 04 Jan 1999 14:00:00 GMT',
      'Tue, 05 Jan 1999 14:00:00 GMT',
      'Wed, 06 Jan 1999 14:00:00 GMT',
      'Thu, 07 Jan 1999 14:00:00 GMT',
      'Fri, 08 Jan 1999 14:00:00 GMT',
      'Sat, 09 Jan 1999 14:00:00 GMT',
      'Sun, 10 Jan 1999 14:00:00 GMT',
      'Mon, 11 Jan 1999 14:00:00 GMT',
      'Tue, 12 Jan 1999 14:00:00 GMT',
      'Wed, 13 Jan 1999 14:00:00 GMT',
      'Thu, 14 Jan 1999 14:00:00 GMT',
      'Fri, 15 Jan 1999 14:00:00 GMT',
      'Sat, 16 Jan 1999 14:00:00 GMT',
      'Sun, 17 Jan 1999 14:00:00 GMT',
      'Mon, 18 Jan 1999 14:00:00 GMT',
      'Tue, 19 Jan 1999 14:00:00 GMT',
      'Wed, 20 Jan 1999 14:00:00 GMT',
      'Thu, 21 Jan 1999 14:00:00 GMT',
      'Fri, 22 Jan 1999 14:00:00 GMT',
      'Sat, 23 Jan 1999 14:00:00 GMT',
      'Sun, 24 Jan 1999 14:00:00 GMT',
      'Mon, 25 Jan 1999 14:00:00 GMT',
      'Tue, 26 Jan 1999 14:00:00 GMT',
      'Wed, 27 Jan 1999 14:00:00 GMT',
      'Thu, 28 Jan 1999 14:00:00 GMT',
      'Fri, 29 Jan 1999 14:00:00 GMT',
      'Sat, 30 Jan 1999 14:00:00 GMT',
      'Sun, 31 Jan 1999 14:00:00 GMT',
      'Sat, 01 Jan 2000 14:00:00 GMT',
      'Sun, 02 Jan 2000 14:00:00 GMT',
      'Mon, 03 Jan 2000 14:00:00 GMT',
      'Tue, 04 Jan 2000 14:00:00 GMT',
      'Wed, 05 Jan 2000 14:00:00 GMT',
      'Thu, 06 Jan 2000 14:00:00 GMT',
      'Fri, 07 Jan 2000 14:00:00 GMT',
      'Sat, 08 Jan 2000 14:00:00 GMT',
      'Sun, 09 Jan 2000 14:00:00 GMT',
      'Mon, 10 Jan 2000 14:00:00 GMT',
      'Tue, 11 Jan 2000 14:00:00 GMT',
      'Wed, 12 Jan 2000 14:00:00 GMT',
      'Thu, 13 Jan 2000 14:00:00 GMT',
      'Fri, 14 Jan 2000 14:00:00 GMT',
      'Sat, 15 Jan 2000 14:00:00 GMT',
      'Sun, 16 Jan 2000 14:00:00 GMT',
      'Mon, 17 Jan 2000 14:00:00 GMT',
      'Tue, 18 Jan 2000 14:00:00 GMT',
      'Wed, 19 Jan 2000 14:00:00 GMT',
      'Thu, 20 Jan 2000 14:00:00 GMT',
      'Fri, 21 Jan 2000 14:00:00 GMT',
      'Sat, 22 Jan 2000 14:00:00 GMT',
      'Sun, 23 Jan 2000 14:00:00 GMT',
      'Mon, 24 Jan 2000 14:00:00 GMT',
      'Tue, 25 Jan 2000 14:00:00 GMT',
      'Wed, 26 Jan 2000 14:00:00 GMT',
      'Thu, 27 Jan 2000 14:00:00 GMT',
      'Fri, 28 Jan 2000 14:00:00 GMT',
      'Sat, 29 Jan 2000 14:00:00 GMT',
      'Sun, 30 Jan 2000 14:00:00 GMT',
      'Mon, 31 Jan 2000 14:00:00 GMT',
    ];
    assertRules({rule: rule1, rrule: rrule1, dates});
    assertRules({rule: rule2, rrule: rrule2, dates});
  });

  describe('Weekly for 10 occurrences', () => {
    const rule = new RRuleTemporal({
      dtstart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: 'WEEKLY',
      count: 10,
    });
    const rrule = 'DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=WEEKLY;COUNT=10';
    const dates = [
      'Tue, 02 Sep 1997 13:00:00 GMT',
      'Tue, 09 Sep 1997 13:00:00 GMT',
      'Tue, 16 Sep 1997 13:00:00 GMT',
      'Tue, 23 Sep 1997 13:00:00 GMT',
      'Tue, 30 Sep 1997 13:00:00 GMT',
      'Tue, 07 Oct 1997 13:00:00 GMT',
      'Tue, 14 Oct 1997 13:00:00 GMT',
      'Tue, 21 Oct 1997 13:00:00 GMT',
      'Tue, 28 Oct 1997 14:00:00 GMT',
      'Tue, 04 Nov 1997 14:00:00 GMT',
    ];
    assertRules({rule, rrule, dates});
  });

  describe('Weekly until December 24, 1997', () => {
    const rule = new RRuleTemporal({
      dtstart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: 'WEEKLY',
      until: DATE_1997_DEC_24_MIDNIGHT_NEW_YORK,
    });
    const rrule = 'DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=WEEKLY;UNTIL=19971224T000000Z';
    const dates = [
      'Tue, 02 Sep 1997 13:00:00 GMT',
      'Tue, 09 Sep 1997 13:00:00 GMT',
      'Tue, 16 Sep 1997 13:00:00 GMT',
      'Tue, 23 Sep 1997 13:00:00 GMT',
      'Tue, 30 Sep 1997 13:00:00 GMT',
      'Tue, 07 Oct 1997 13:00:00 GMT',
      'Tue, 14 Oct 1997 13:00:00 GMT',
      'Tue, 21 Oct 1997 13:00:00 GMT',
      'Tue, 28 Oct 1997 14:00:00 GMT',
      'Tue, 04 Nov 1997 14:00:00 GMT',
      'Tue, 11 Nov 1997 14:00:00 GMT',
      'Tue, 18 Nov 1997 14:00:00 GMT',
      'Tue, 25 Nov 1997 14:00:00 GMT',
      'Tue, 02 Dec 1997 14:00:00 GMT',
      'Tue, 09 Dec 1997 14:00:00 GMT',
      'Tue, 16 Dec 1997 14:00:00 GMT',
      'Tue, 23 Dec 1997 14:00:00 GMT',
    ];
    assertRules({rule, rrule, dates});
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
    const dates = [
      'Tue, 02 Sep 1997 13:00:00 GMT',
      'Tue, 16 Sep 1997 13:00:00 GMT',
      'Tue, 30 Sep 1997 13:00:00 GMT',
      'Tue, 14 Oct 1997 13:00:00 GMT',
      'Tue, 28 Oct 1997 14:00:00 GMT',
      'Tue, 11 Nov 1997 14:00:00 GMT',
      'Tue, 25 Nov 1997 14:00:00 GMT',
      'Tue, 09 Dec 1997 14:00:00 GMT',
      'Tue, 23 Dec 1997 14:00:00 GMT',
      'Tue, 06 Jan 1998 14:00:00 GMT',
      'Tue, 20 Jan 1998 14:00:00 GMT',
      'Tue, 03 Feb 1998 14:00:00 GMT',
      'Tue, 17 Feb 1998 14:00:00 GMT',
    ];
    assertRules({rule, rrule, dates, between});
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
    const dates = [
      'Tue, 02 Sep 1997 13:00:00 GMT',
      'Thu, 04 Sep 1997 13:00:00 GMT',
      'Tue, 09 Sep 1997 13:00:00 GMT',
      'Thu, 11 Sep 1997 13:00:00 GMT',
      'Tue, 16 Sep 1997 13:00:00 GMT',
      'Thu, 18 Sep 1997 13:00:00 GMT',
      'Tue, 23 Sep 1997 13:00:00 GMT',
      'Thu, 25 Sep 1997 13:00:00 GMT',
      'Tue, 30 Sep 1997 13:00:00 GMT',
      'Thu, 02 Oct 1997 13:00:00 GMT',
    ];
    assertRules({rule: rule1, rrule: rrule1, dates});
    assertRules({rule: rule2, rrule: rrule2, dates});
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
    const dates = [
      'Mon, 01 Sep 1997 13:00:00 GMT',
      'Wed, 03 Sep 1997 13:00:00 GMT',
      'Fri, 05 Sep 1997 13:00:00 GMT',
      'Mon, 15 Sep 1997 13:00:00 GMT',
      'Wed, 17 Sep 1997 13:00:00 GMT',
      'Fri, 19 Sep 1997 13:00:00 GMT',
      'Mon, 29 Sep 1997 13:00:00 GMT',
      'Wed, 01 Oct 1997 13:00:00 GMT',
      'Fri, 03 Oct 1997 13:00:00 GMT',
      'Mon, 13 Oct 1997 13:00:00 GMT',
      'Wed, 15 Oct 1997 13:00:00 GMT',
      'Fri, 17 Oct 1997 13:00:00 GMT',
      'Mon, 27 Oct 1997 14:00:00 GMT',
      'Wed, 29 Oct 1997 14:00:00 GMT',
      'Fri, 31 Oct 1997 14:00:00 GMT',
      'Mon, 10 Nov 1997 14:00:00 GMT',
      'Wed, 12 Nov 1997 14:00:00 GMT',
      'Fri, 14 Nov 1997 14:00:00 GMT',
      'Mon, 24 Nov 1997 14:00:00 GMT',
      'Wed, 26 Nov 1997 14:00:00 GMT',
      'Fri, 28 Nov 1997 14:00:00 GMT',
      'Mon, 08 Dec 1997 14:00:00 GMT',
      'Wed, 10 Dec 1997 14:00:00 GMT',
      'Fri, 12 Dec 1997 14:00:00 GMT',
      'Mon, 22 Dec 1997 14:00:00 GMT',
    ];
    assertRules({rule, rrule, dates});
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
    const dates = [
      'Tue, 02 Sep 1997 13:00:00 GMT',
      'Thu, 04 Sep 1997 13:00:00 GMT',
      'Tue, 16 Sep 1997 13:00:00 GMT',
      'Thu, 18 Sep 1997 13:00:00 GMT',
      'Tue, 30 Sep 1997 13:00:00 GMT',
      'Thu, 02 Oct 1997 13:00:00 GMT',
      'Tue, 14 Oct 1997 13:00:00 GMT',
      'Thu, 16 Oct 1997 13:00:00 GMT',
    ];
    assertRules({rule, rrule, dates});
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
    const dates = [
      'Fri, 05 Sep 1997 13:00:00 GMT',
      'Fri, 03 Oct 1997 13:00:00 GMT',
      'Fri, 07 Nov 1997 14:00:00 GMT',
      'Fri, 05 Dec 1997 14:00:00 GMT',
      'Fri, 02 Jan 1998 14:00:00 GMT',
      'Fri, 06 Feb 1998 14:00:00 GMT',
      'Fri, 06 Mar 1998 14:00:00 GMT',
      'Fri, 03 Apr 1998 14:00:00 GMT',
      'Fri, 01 May 1998 13:00:00 GMT',
      'Fri, 05 Jun 1998 13:00:00 GMT',
    ];
    assertRules({rule, rrule, dates});
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
    const dates = [
      'Fri, 05 Sep 1997 13:00:00 GMT',
      'Fri, 03 Oct 1997 13:00:00 GMT',
      'Fri, 07 Nov 1997 14:00:00 GMT',
      'Fri, 05 Dec 1997 14:00:00 GMT',
    ];
    assertRules({rule, rrule, dates});
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
    const dates = [
      'Sun, 07 Sep 1997 13:00:00 GMT',
      'Sun, 28 Sep 1997 13:00:00 GMT',
      'Sun, 02 Nov 1997 14:00:00 GMT',
      'Sun, 30 Nov 1997 14:00:00 GMT',
      'Sun, 04 Jan 1998 14:00:00 GMT',
      'Sun, 25 Jan 1998 14:00:00 GMT',
      'Sun, 01 Mar 1998 14:00:00 GMT',
      'Sun, 29 Mar 1998 14:00:00 GMT',
      'Sun, 03 May 1998 13:00:00 GMT',
      'Sun, 31 May 1998 13:00:00 GMT',
    ];
    assertRules({rule, rrule, dates});
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
    const dates = [
      'Mon, 22 Sep 1997 13:00:00 GMT',
      'Mon, 20 Oct 1997 13:00:00 GMT',
      'Mon, 17 Nov 1997 14:00:00 GMT',
      'Mon, 22 Dec 1997 14:00:00 GMT',
      'Mon, 19 Jan 1998 14:00:00 GMT',
      'Mon, 16 Feb 1998 14:00:00 GMT',
    ];
    assertRules({rule, rrule, dates});
  });

  describe('Monthly on the third-to-the-last day of the month, forever:', () => {
    const rule = new RRuleTemporal({
      dtstart: zdt(1997, 9, 28, 9),
      tzid: RFC_TEST_TZID,
      freq: 'MONTHLY',
      byMonthDay: [-3],
    });
    const rrule = 'DTSTART;TZID=America/New_York:19970928T090000\nRRULE:FREQ=MONTHLY;BYMONTHDAY=-3';
    const dates = [
      'Sun, 28 Sep 1997 13:00:00 GMT',
      'Wed, 29 Oct 1997 14:00:00 GMT',
      'Fri, 28 Nov 1997 14:00:00 GMT',
      'Mon, 29 Dec 1997 14:00:00 GMT',
      'Thu, 29 Jan 1998 14:00:00 GMT',
      'Thu, 26 Feb 1998 14:00:00 GMT',
    ];
    assertRules({rule, rrule, dates, limit: 6});
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
    const dates = [
      'Tue, 02 Sep 1997 13:00:00 GMT',
      'Mon, 15 Sep 1997 13:00:00 GMT',
      'Thu, 02 Oct 1997 13:00:00 GMT',
      'Wed, 15 Oct 1997 13:00:00 GMT',
      'Sun, 02 Nov 1997 14:00:00 GMT',
      'Sat, 15 Nov 1997 14:00:00 GMT',
      'Tue, 02 Dec 1997 14:00:00 GMT',
      'Mon, 15 Dec 1997 14:00:00 GMT',
      'Fri, 02 Jan 1998 14:00:00 GMT',
      'Thu, 15 Jan 1998 14:00:00 GMT',
    ];
    assertRules({rule, rrule, dates});
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
    const dates = [
      'Wed, 01 Oct 1997 13:00:00 GMT',
      'Fri, 31 Oct 1997 14:00:00 GMT',
      'Sat, 01 Nov 1997 14:00:00 GMT',
      'Sun, 30 Nov 1997 14:00:00 GMT',
      'Mon, 01 Dec 1997 14:00:00 GMT',
      'Wed, 31 Dec 1997 14:00:00 GMT',
      'Thu, 01 Jan 1998 14:00:00 GMT',
      'Sat, 31 Jan 1998 14:00:00 GMT',
      'Sun, 01 Feb 1998 14:00:00 GMT',
      'Sat, 28 Feb 1998 14:00:00 GMT',
    ];
    assertRules({rule, rrule, dates});
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
    const dates = [
      'Wed, 10 Sep 1997 13:00:00 GMT',
      'Thu, 11 Sep 1997 13:00:00 GMT',
      'Fri, 12 Sep 1997 13:00:00 GMT',
      'Sat, 13 Sep 1997 13:00:00 GMT',
      'Sun, 14 Sep 1997 13:00:00 GMT',
      'Mon, 15 Sep 1997 13:00:00 GMT',
      'Wed, 10 Mar 1999 14:00:00 GMT',
      'Thu, 11 Mar 1999 14:00:00 GMT',
      'Fri, 12 Mar 1999 14:00:00 GMT',
      'Sat, 13 Mar 1999 14:00:00 GMT',
    ];
    assertRules({rule, rrule, dates});
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
    const dates = [
      'Tue, 02 Sep 1997 13:00:00 GMT',
      'Tue, 09 Sep 1997 13:00:00 GMT',
      'Tue, 16 Sep 1997 13:00:00 GMT',
      'Tue, 23 Sep 1997 13:00:00 GMT',
      'Tue, 30 Sep 1997 13:00:00 GMT',
      'Tue, 04 Nov 1997 14:00:00 GMT',
      'Tue, 11 Nov 1997 14:00:00 GMT',
      'Tue, 18 Nov 1997 14:00:00 GMT',
      'Tue, 25 Nov 1997 14:00:00 GMT',
      'Tue, 06 Jan 1998 14:00:00 GMT',
      'Tue, 13 Jan 1998 14:00:00 GMT',
      'Tue, 20 Jan 1998 14:00:00 GMT',
      'Tue, 27 Jan 1998 14:00:00 GMT',
      'Tue, 03 Mar 1998 14:00:00 GMT',
      'Tue, 10 Mar 1998 14:00:00 GMT',
      'Tue, 17 Mar 1998 14:00:00 GMT',
      'Tue, 24 Mar 1998 14:00:00 GMT',
      'Tue, 31 Mar 1998 14:00:00 GMT',
    ];
    assertRules({rule, rrule, dates, between});
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
    const dates = [
      'Tue, 10 Jun 1997 13:00:00 GMT',
      'Thu, 10 Jul 1997 13:00:00 GMT',
      'Wed, 10 Jun 1998 13:00:00 GMT',
      'Fri, 10 Jul 1998 13:00:00 GMT',
      'Thu, 10 Jun 1999 13:00:00 GMT',
      'Sat, 10 Jul 1999 13:00:00 GMT',
      'Sat, 10 Jun 2000 13:00:00 GMT',
      'Mon, 10 Jul 2000 13:00:00 GMT',
      'Sun, 10 Jun 2001 13:00:00 GMT',
      'Tue, 10 Jul 2001 13:00:00 GMT',
    ];
    assertRules({rule, rrule, dates});
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
    const dates = [
      'Mon, 10 Mar 1997 14:00:00 GMT',
      'Sun, 10 Jan 1999 14:00:00 GMT',
      'Wed, 10 Feb 1999 14:00:00 GMT',
      'Wed, 10 Mar 1999 14:00:00 GMT',
      'Wed, 10 Jan 2001 14:00:00 GMT',
      'Sat, 10 Feb 2001 14:00:00 GMT',
      'Sat, 10 Mar 2001 14:00:00 GMT',
      'Fri, 10 Jan 2003 14:00:00 GMT',
      'Mon, 10 Feb 2003 14:00:00 GMT',
      'Mon, 10 Mar 2003 14:00:00 GMT',
    ];
    assertRules({rule, rrule, dates});
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
    const dates = [
      'Wed, 01 Jan 1997 14:00:00 GMT',
      'Thu, 10 Apr 1997 13:00:00 GMT',
      'Sat, 19 Jul 1997 13:00:00 GMT',
      'Sat, 01 Jan 2000 14:00:00 GMT',
      'Sun, 09 Apr 2000 13:00:00 GMT',
      'Tue, 18 Jul 2000 13:00:00 GMT',
      'Wed, 01 Jan 2003 14:00:00 GMT',
      'Thu, 10 Apr 2003 13:00:00 GMT',
      'Sat, 19 Jul 2003 13:00:00 GMT',
      'Sun, 01 Jan 2006 14:00:00 GMT',
    ];
    assertRules({rule, rrule, dates});
  });

  describe('Every 20th Monday of the year, forever', () => {
    const rule = new RRuleTemporal({
      dtstart: zdt(1997, 5, 19, 9),
      tzid: RFC_TEST_TZID,
      freq: 'YEARLY',
      byDay: ['20MO'],
    });
    const rrule = 'DTSTART;TZID=America/New_York:19970519T090000\nRRULE:FREQ=YEARLY;BYDAY=20MO';
    const dates = ['Mon, 19 May 1997 13:00:00 GMT', 'Mon, 18 May 1998 13:00:00 GMT', 'Mon, 17 May 1999 13:00:00 GMT'];
    assertRules({rule, rrule, dates, limit: 3});
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
    const dates = ['Mon, 12 May 1997 13:00:00 GMT', 'Mon, 11 May 1998 13:00:00 GMT', 'Mon, 17 May 1999 13:00:00 GMT'];
    assertRules({rule, rrule, dates, limit: 3});
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
    const dates = [
      'Thu, 13 Mar 1997 14:00:00 GMT',
      'Thu, 20 Mar 1997 14:00:00 GMT',
      'Thu, 27 Mar 1997 14:00:00 GMT',
      'Thu, 05 Mar 1998 14:00:00 GMT',
      'Thu, 12 Mar 1998 14:00:00 GMT',
      'Thu, 19 Mar 1998 14:00:00 GMT',
      'Thu, 26 Mar 1998 14:00:00 GMT',
      'Thu, 04 Mar 1999 14:00:00 GMT',
      'Thu, 11 Mar 1999 14:00:00 GMT',
      'Thu, 18 Mar 1999 14:00:00 GMT',
      'Thu, 25 Mar 1999 14:00:00 GMT',
    ];
    assertRules({rule, rrule, dates, between});
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
    const dates = [
      'Thu, 12 Jun 1997 13:00:00 GMT',
      'Thu, 19 Jun 1997 13:00:00 GMT',
      'Thu, 26 Jun 1997 13:00:00 GMT',
      'Thu, 03 Jul 1997 13:00:00 GMT',
      'Thu, 10 Jul 1997 13:00:00 GMT',
      'Thu, 17 Jul 1997 13:00:00 GMT',
      'Thu, 24 Jul 1997 13:00:00 GMT',
      'Thu, 31 Jul 1997 13:00:00 GMT',
      'Thu, 07 Aug 1997 13:00:00 GMT',
      'Thu, 14 Aug 1997 13:00:00 GMT',
      'Thu, 21 Aug 1997 13:00:00 GMT',
      'Thu, 28 Aug 1997 13:00:00 GMT',
      'Thu, 04 Jun 1998 13:00:00 GMT',
      'Thu, 11 Jun 1998 13:00:00 GMT',
      'Thu, 18 Jun 1998 13:00:00 GMT',
      'Thu, 25 Jun 1998 13:00:00 GMT',
      'Thu, 02 Jul 1998 13:00:00 GMT',
      'Thu, 09 Jul 1998 13:00:00 GMT',
      'Thu, 16 Jul 1998 13:00:00 GMT',
      'Thu, 23 Jul 1998 13:00:00 GMT',
      'Thu, 30 Jul 1998 13:00:00 GMT',
      'Thu, 06 Aug 1998 13:00:00 GMT',
      'Thu, 13 Aug 1998 13:00:00 GMT',
      'Thu, 20 Aug 1998 13:00:00 GMT',
      'Thu, 27 Aug 1998 13:00:00 GMT',
      'Thu, 03 Jun 1999 13:00:00 GMT',
      'Thu, 10 Jun 1999 13:00:00 GMT',
      'Thu, 17 Jun 1999 13:00:00 GMT',
      'Thu, 24 Jun 1999 13:00:00 GMT',
      'Thu, 01 Jul 1999 13:00:00 GMT',
      'Thu, 08 Jul 1999 13:00:00 GMT',
      'Thu, 15 Jul 1999 13:00:00 GMT',
      'Thu, 22 Jul 1999 13:00:00 GMT',
      'Thu, 29 Jul 1999 13:00:00 GMT',
      'Thu, 05 Aug 1999 13:00:00 GMT',
      'Thu, 12 Aug 1999 13:00:00 GMT',
      'Thu, 19 Aug 1999 13:00:00 GMT',
      'Thu, 26 Aug 1999 13:00:00 GMT',
    ];
    assertRules({rule, rrule, dates, between});
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
    const dates = [
      'Fri, 13 Feb 1998 14:00:00 GMT',
      'Fri, 13 Mar 1998 14:00:00 GMT',
      'Fri, 13 Nov 1998 14:00:00 GMT',
      'Fri, 13 Aug 1999 13:00:00 GMT',
      'Fri, 13 Oct 2000 13:00:00 GMT',
    ];
    assertRules({rule, rrule, dates, between});
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
    const dates = [
      'Sat, 13 Sep 1997 13:00:00 GMT',
      'Sat, 11 Oct 1997 13:00:00 GMT',
      'Sat, 08 Nov 1997 14:00:00 GMT',
      'Sat, 13 Dec 1997 14:00:00 GMT',
      'Sat, 10 Jan 1998 14:00:00 GMT',
      'Sat, 07 Feb 1998 14:00:00 GMT',
      'Sat, 07 Mar 1998 14:00:00 GMT',
      'Sat, 11 Apr 1998 13:00:00 GMT',
      'Sat, 09 May 1998 13:00:00 GMT',
      'Sat, 13 Jun 1998 13:00:00 GMT',
    ];
    assertRules({rule, rrule, dates, between});
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
    const dates = [
      'Tue, 05 Nov 1996 14:00:00 GMT',
      'Tue, 07 Nov 2000 14:00:00 GMT',
      'Tue, 02 Nov 2004 14:00:00 GMT',
      'Tue, 04 Nov 2008 14:00:00 GMT',
      'Tue, 06 Nov 2012 14:00:00 GMT',
      'Tue, 08 Nov 2016 14:00:00 GMT',
      'Tue, 03 Nov 2020 14:00:00 GMT',
      'Tue, 05 Nov 2024 14:00:00 GMT',
    ];
    assertRules({rule, rrule, dates, between});
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
    const dates = ['Thu, 04 Sep 1997 13:00:00 GMT', 'Tue, 07 Oct 1997 13:00:00 GMT', 'Thu, 06 Nov 1997 14:00:00 GMT'];
    assertRules({rule, rrule, dates});
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
    const dates = [
      'Mon, 29 Sep 1997 13:00:00 GMT',
      'Thu, 30 Oct 1997 14:00:00 GMT',
      'Thu, 27 Nov 1997 14:00:00 GMT',
      'Tue, 30 Dec 1997 14:00:00 GMT',
      'Thu, 29 Jan 1998 14:00:00 GMT',
      'Thu, 26 Feb 1998 14:00:00 GMT',
      'Mon, 30 Mar 1998 14:00:00 GMT',
    ];
    assertRules({rule, rrule, dates, limit: 7});
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
    const dates = ['Tue, 02 Sep 1997 13:00:00 GMT', 'Tue, 02 Sep 1997 16:00:00 GMT', 'Tue, 02 Sep 1997 19:00:00 GMT'];
    assertRules({rule, rrule, dates});
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
    const dates = [
      'Tue, 02 Sep 1997 13:00:00 GMT',
      'Tue, 02 Sep 1997 13:15:00 GMT',
      'Tue, 02 Sep 1997 13:30:00 GMT',
      'Tue, 02 Sep 1997 13:45:00 GMT',
      'Tue, 02 Sep 1997 14:00:00 GMT',
      'Tue, 02 Sep 1997 14:15:00 GMT',
    ];
    assertRules({rule, rrule, dates});
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
    const dates = [
      'Tue, 02 Sep 1997 13:00:00 GMT',
      'Tue, 02 Sep 1997 14:30:00 GMT',
      'Tue, 02 Sep 1997 16:00:00 GMT',
      'Tue, 02 Sep 1997 17:30:00 GMT',
    ];
    assertRules({rule, rrule, dates});
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
    const dates = [
      'Tue, 02 Sep 1997 13:00:00 GMT',
      'Tue, 02 Sep 1997 13:20:00 GMT',
      'Tue, 02 Sep 1997 13:40:00 GMT',
      'Tue, 02 Sep 1997 14:00:00 GMT',
      'Tue, 02 Sep 1997 14:20:00 GMT',
      'Tue, 02 Sep 1997 14:40:00 GMT',
      'Tue, 02 Sep 1997 15:00:00 GMT',
      'Tue, 02 Sep 1997 15:20:00 GMT',
      'Tue, 02 Sep 1997 15:40:00 GMT',
      'Tue, 02 Sep 1997 16:00:00 GMT',
      'Tue, 02 Sep 1997 16:20:00 GMT',
      'Tue, 02 Sep 1997 16:40:00 GMT',
      'Tue, 02 Sep 1997 17:00:00 GMT',
      'Tue, 02 Sep 1997 17:20:00 GMT',
      'Tue, 02 Sep 1997 17:40:00 GMT',
      'Tue, 02 Sep 1997 18:00:00 GMT',
    ];
    assertRules({rule: rule1, rrule: rrule1, dates, limit: 16});
    assertRules({rule: rule2, rrule: rrule2, dates, limit: 16});
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
    const dates = [
      'Mon, 15 Jan 2007 14:00:00 GMT',
      'Tue, 30 Jan 2007 14:00:00 GMT',
      'Thu, 15 Feb 2007 14:00:00 GMT',
      'Thu, 15 Mar 2007 13:00:00 GMT',
      'Fri, 30 Mar 2007 13:00:00 GMT',
    ];
    assertRules({rule, rrule, dates});
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
    const dates1 = [
      'Tue, 05 Aug 1997 13:00:00 GMT',
      'Sun, 10 Aug 1997 13:00:00 GMT',
      'Tue, 19 Aug 1997 13:00:00 GMT',
      'Sun, 24 Aug 1997 13:00:00 GMT',
    ];
    assertRules({rule: rule1, rrule: rrule1, dates: dates1});
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
    const dates2 = [
      'Tue, 05 Aug 1997 13:00:00 GMT',
      'Sun, 17 Aug 1997 13:00:00 GMT',
      'Tue, 19 Aug 1997 13:00:00 GMT',
      'Sun, 31 Aug 1997 13:00:00 GMT',
    ];
    assertRules({rule: rule2, rrule: rrule2, dates: dates2});
  });
});

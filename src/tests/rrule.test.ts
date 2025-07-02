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

import { RRule } from '@/rrule';
import { Frequency, Weekday } from '@/types';

const INVALID_DATE = '2020-01-01-01-01T:00:00:00Z';

const RFC_TEST_TZID = 'America/New_York';
const DATE_1997_SEP_02_9AM_NEW_YORK_DST = new Date('1997-09-02T09:00:00.000-04:00');
const DATE_1998_JAN_1_9AM_NEW_YORK = new Date('1998-01-01T00:00:00.000-05:00');

const DATE_1997_DEC_24_MIDNIGHT_NEW_YORK = new Date('1997-12-24T00:00:00.000-05:00');

const DATE_2019 = '2019-01-01T00:00:00.000Z';
const DATE_2019_DECEMBER_19 = '2019-12-19T00:00:00.000Z';
const DATE_2020 = '2020-01-01T00:00:00.000Z';
const DATE_2023_JAN_6_11PM = '2023-01-06T23:00:00Z';

describe('RRule class methods', () => {
  const rule = new RRule({
    dtStart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
    tzid: RFC_TEST_TZID,
    freq: Frequency.DAILY,
    count: 10,
  });

  describe('list', () => {
    it('returns all occurrences with no limit passed', () => {
      expect(rule.list().map((d) => d.toUTCString())).toMatchInlineSnapshot(`
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
      expect(rule.list({ limit: 3 }).map((d) => d.toUTCString())).toMatchInlineSnapshot(`
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
      expect(
        rule.before(new Date('1997-09-05T20:00:00.000-04:00'))?.toUTCString()
      ).toMatchInlineSnapshot(`"Fri, 05 Sep 1997 13:00:00 GMT"`);
    });

    describe('if the specified date is a occurrence', () => {
      it('returns the occurrence before the specified date by default', () => {
        expect(
          rule.before(new Date('1997-09-06T09:00:00.000-04:00'))?.toUTCString()
        ).toMatchInlineSnapshot(`"Fri, 05 Sep 1997 13:00:00 GMT"`);
      });

      it('returns the specified date when passed inclusive: true', () => {
        expect(
          rule.before(new Date('1997-09-06T09:00:00.000-04:00'), { inclusive: true })?.toUTCString()
        ).toMatchInlineSnapshot(`"Sat, 06 Sep 1997 13:00:00 GMT"`);
      });
    });

    it('throws an error when passed an invalid date', () => {
      const testFn = () => rule.before(new Date(INVALID_DATE));
      expect(testFn).toThrowErrorMatchingInlineSnapshot(
        `"RRule error: Date passed to \`before\` is invalid"`
      );
    });
  });

  describe('after', () => {
    it('returns the first occurrence that happens after a specified date', () => {
      expect(
        rule.after(new Date('1997-09-05T20:00:00.000-04:00'))?.toUTCString()
      ).toMatchInlineSnapshot(`"Sat, 06 Sep 1997 13:00:00 GMT"`);
    });

    describe('if the specified date is a occurrence', () => {
      it('returns the occurrence after the specified date by default', () => {
        expect(
          rule.after(new Date('1997-09-06T09:00:00.000-04:00'))?.toUTCString()
        ).toMatchInlineSnapshot(`"Sun, 07 Sep 1997 13:00:00 GMT"`);
      });

      it('returns the specified date when passed inclusive: true', () => {
        expect(
          rule.after(new Date('1997-09-06T09:00:00.000-04:00'), { inclusive: true })?.toUTCString()
        ).toMatchInlineSnapshot(`"Sat, 06 Sep 1997 13:00:00 GMT"`);
      });
    });

    it('throws an error when passed an invalid date', () => {
      const testFn = () => rule.after(new Date(INVALID_DATE));
      expect(testFn).toThrowErrorMatchingInlineSnapshot(
        `"RRule error: Date passed to \`after\` is invalid"`
      );
    });
  });

  describe('between', () => {
    it('returns all occurrences between two specified dates', () => {
      expect(
        rule
          .between(
            new Date('1997-09-05T20:00:00.000-04:00'),
            new Date('1997-09-10T20:00:00.000-04:00')
          )
          .map((d) => d.toUTCString())
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
            .between(
              new Date('1997-09-05T09:00:00.000-04:00'),
              new Date('1997-09-10T20:00:00.000-04:00')
            )
            .map((d) => d.toUTCString())
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
            .between(
              new Date('1997-09-05T09:00:00.000-04:00'),
              new Date('1997-09-10T20:00:00.000-04:00'),
              { inclusive: true }
            )
            .map((d) => d.toUTCString())
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
            .between(
              new Date('1997-09-05T20:00:00.000-04:00'),
              new Date('1997-09-10T09:00:00.000-04:00')
            )
            .map((d) => d.toUTCString())
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
            .between(
              new Date('1997-09-05T20:00:00.000-04:00'),
              new Date('1997-09-10T09:00:00.000-04:00'),
              { inclusive: true }
            )
            .map((d) => d.toUTCString())
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
      const testFn = () =>
        rule.between(new Date(INVALID_DATE), new Date('1997-09-10T09:00:00.000-04:00'));
      expect(testFn).toThrowErrorMatchingInlineSnapshot(
        `"RRule error: Start date passed to \`between\` is invalid"`
      );
    });

    it('throws an error when passed an invalid end date', () => {
      const testFn = () =>
        rule.between(new Date('1997-09-10T09:00:00.000-04:00'), new Date(INVALID_DATE));
      expect(testFn).toThrowErrorMatchingInlineSnapshot(
        `"RRule error: End date passed to \`between\` is invalid"`
      );
    });
  });
});

describe('iCalendar.org RFC 5545 Examples', () => {
  // Test against the examples specified at https://icalendar.org/iCalendar-RFC-5545/3-8-5-3-occurrence-rule.html
  // This covers the vast majority of RRule functionality and possible edge cases

  test('Daily for 10 occurrences', () => {
    const rule = new RRule({
      dtStart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: Frequency.DAILY,
      count: 10,
    });

    expect(rule.list().map((d) => d.toUTCString())).toMatchInlineSnapshot(`
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

  test('Daily until December 24, 1997', () => {
    const rule = new RRule({
      dtStart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: Frequency.DAILY,
      until: DATE_1997_DEC_24_MIDNIGHT_NEW_YORK,
    });

    expect(rule.list().map((d) => d.toUTCString())).toMatchInlineSnapshot(`
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
    `);
  });

  test('Every other day, forever', () => {
    const rule = new RRule({
      dtStart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: Frequency.DAILY,
      interval: 2,
    });

    expect(
      rule
        .between(DATE_1997_SEP_02_9AM_NEW_YORK_DST, new Date('1997-12-04T00:00:00.000-05:00'), {
          inclusive: true,
        })
        .map((d) => d.toUTCString())
    ).toMatchInlineSnapshot(`
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
    `);
  });

  test('Every 10 days, 5 occurrences', () => {
    const rule = new RRule({
      dtStart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: Frequency.DAILY,
      count: 5,
      interval: 10,
    });

    expect(rule.list().map((d) => d.toUTCString())).toMatchInlineSnapshot(`
      [
        "Tue, 02 Sep 1997 13:00:00 GMT",
        "Fri, 12 Sep 1997 13:00:00 GMT",
        "Mon, 22 Sep 1997 13:00:00 GMT",
        "Thu, 02 Oct 1997 13:00:00 GMT",
        "Sun, 12 Oct 1997 13:00:00 GMT",
      ]
    `);
  });

  test('Every day in January, for 3 years', () => {
    const rule1 = new RRule({
      dtStart: DATE_1998_JAN_1_9AM_NEW_YORK,
      tzid: RFC_TEST_TZID,
      freq: Frequency.DAILY,
      byMonth: [1],
      until: new Date('2000-01-31T14:00:00Z'),
    });

    const rule2 = new RRule({
      dtStart: DATE_1998_JAN_1_9AM_NEW_YORK,
      tzid: RFC_TEST_TZID,
      freq: Frequency.YEARLY,
      byDay: [Weekday.SU, Weekday.MO, Weekday.TU, Weekday.WE, Weekday.TH, Weekday.FR, Weekday.SA],
      byMonth: [1],
      until: new Date('2000-01-31T14:00:00Z'),
    });

    const snapshot = `
      [
        "Thu, 01 Jan 1998 05:00:00 GMT",
        "Fri, 02 Jan 1998 05:00:00 GMT",
        "Sat, 03 Jan 1998 05:00:00 GMT",
        "Sun, 04 Jan 1998 05:00:00 GMT",
        "Mon, 05 Jan 1998 05:00:00 GMT",
        "Tue, 06 Jan 1998 05:00:00 GMT",
        "Wed, 07 Jan 1998 05:00:00 GMT",
        "Thu, 08 Jan 1998 05:00:00 GMT",
        "Fri, 09 Jan 1998 05:00:00 GMT",
        "Sat, 10 Jan 1998 05:00:00 GMT",
        "Sun, 11 Jan 1998 05:00:00 GMT",
        "Mon, 12 Jan 1998 05:00:00 GMT",
        "Tue, 13 Jan 1998 05:00:00 GMT",
        "Wed, 14 Jan 1998 05:00:00 GMT",
        "Thu, 15 Jan 1998 05:00:00 GMT",
        "Fri, 16 Jan 1998 05:00:00 GMT",
        "Sat, 17 Jan 1998 05:00:00 GMT",
        "Sun, 18 Jan 1998 05:00:00 GMT",
        "Mon, 19 Jan 1998 05:00:00 GMT",
        "Tue, 20 Jan 1998 05:00:00 GMT",
        "Wed, 21 Jan 1998 05:00:00 GMT",
        "Thu, 22 Jan 1998 05:00:00 GMT",
        "Fri, 23 Jan 1998 05:00:00 GMT",
        "Sat, 24 Jan 1998 05:00:00 GMT",
        "Sun, 25 Jan 1998 05:00:00 GMT",
        "Mon, 26 Jan 1998 05:00:00 GMT",
        "Tue, 27 Jan 1998 05:00:00 GMT",
        "Wed, 28 Jan 1998 05:00:00 GMT",
        "Thu, 29 Jan 1998 05:00:00 GMT",
        "Fri, 30 Jan 1998 05:00:00 GMT",
        "Sat, 31 Jan 1998 05:00:00 GMT",
        "Fri, 01 Jan 1999 05:00:00 GMT",
        "Sat, 02 Jan 1999 05:00:00 GMT",
        "Sun, 03 Jan 1999 05:00:00 GMT",
        "Mon, 04 Jan 1999 05:00:00 GMT",
        "Tue, 05 Jan 1999 05:00:00 GMT",
        "Wed, 06 Jan 1999 05:00:00 GMT",
        "Thu, 07 Jan 1999 05:00:00 GMT",
        "Fri, 08 Jan 1999 05:00:00 GMT",
        "Sat, 09 Jan 1999 05:00:00 GMT",
        "Sun, 10 Jan 1999 05:00:00 GMT",
        "Mon, 11 Jan 1999 05:00:00 GMT",
        "Tue, 12 Jan 1999 05:00:00 GMT",
        "Wed, 13 Jan 1999 05:00:00 GMT",
        "Thu, 14 Jan 1999 05:00:00 GMT",
        "Fri, 15 Jan 1999 05:00:00 GMT",
        "Sat, 16 Jan 1999 05:00:00 GMT",
        "Sun, 17 Jan 1999 05:00:00 GMT",
        "Mon, 18 Jan 1999 05:00:00 GMT",
        "Tue, 19 Jan 1999 05:00:00 GMT",
        "Wed, 20 Jan 1999 05:00:00 GMT",
        "Thu, 21 Jan 1999 05:00:00 GMT",
        "Fri, 22 Jan 1999 05:00:00 GMT",
        "Sat, 23 Jan 1999 05:00:00 GMT",
        "Sun, 24 Jan 1999 05:00:00 GMT",
        "Mon, 25 Jan 1999 05:00:00 GMT",
        "Tue, 26 Jan 1999 05:00:00 GMT",
        "Wed, 27 Jan 1999 05:00:00 GMT",
        "Thu, 28 Jan 1999 05:00:00 GMT",
        "Fri, 29 Jan 1999 05:00:00 GMT",
        "Sat, 30 Jan 1999 05:00:00 GMT",
        "Sun, 31 Jan 1999 05:00:00 GMT",
        "Sat, 01 Jan 2000 05:00:00 GMT",
        "Sun, 02 Jan 2000 05:00:00 GMT",
        "Mon, 03 Jan 2000 05:00:00 GMT",
        "Tue, 04 Jan 2000 05:00:00 GMT",
        "Wed, 05 Jan 2000 05:00:00 GMT",
        "Thu, 06 Jan 2000 05:00:00 GMT",
        "Fri, 07 Jan 2000 05:00:00 GMT",
        "Sat, 08 Jan 2000 05:00:00 GMT",
        "Sun, 09 Jan 2000 05:00:00 GMT",
        "Mon, 10 Jan 2000 05:00:00 GMT",
        "Tue, 11 Jan 2000 05:00:00 GMT",
        "Wed, 12 Jan 2000 05:00:00 GMT",
        "Thu, 13 Jan 2000 05:00:00 GMT",
        "Fri, 14 Jan 2000 05:00:00 GMT",
        "Sat, 15 Jan 2000 05:00:00 GMT",
        "Sun, 16 Jan 2000 05:00:00 GMT",
        "Mon, 17 Jan 2000 05:00:00 GMT",
        "Tue, 18 Jan 2000 05:00:00 GMT",
        "Wed, 19 Jan 2000 05:00:00 GMT",
        "Thu, 20 Jan 2000 05:00:00 GMT",
        "Fri, 21 Jan 2000 05:00:00 GMT",
        "Sat, 22 Jan 2000 05:00:00 GMT",
        "Sun, 23 Jan 2000 05:00:00 GMT",
        "Mon, 24 Jan 2000 05:00:00 GMT",
        "Tue, 25 Jan 2000 05:00:00 GMT",
        "Wed, 26 Jan 2000 05:00:00 GMT",
        "Thu, 27 Jan 2000 05:00:00 GMT",
        "Fri, 28 Jan 2000 05:00:00 GMT",
        "Sat, 29 Jan 2000 05:00:00 GMT",
        "Sun, 30 Jan 2000 05:00:00 GMT",
        "Mon, 31 Jan 2000 05:00:00 GMT",
      ]
    `;
    expect(rule1.list().map((d) => d.toUTCString())).toMatchInlineSnapshot(snapshot);
    expect(rule2.list().map((d) => d.toUTCString())).toMatchInlineSnapshot(snapshot);
  });

  test('Weekly for 10 occurrences', () => {
    const rule = new RRule({
      dtStart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: Frequency.WEEKLY,
      count: 10,
    });

    expect(rule.list().map((d) => d.toUTCString())).toMatchInlineSnapshot(`
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
    `);
  });

  test('Weekly until December 24, 1997', () => {
    const rule = new RRule({
      dtStart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: Frequency.WEEKLY,
      until: DATE_1997_DEC_24_MIDNIGHT_NEW_YORK,
    });

    expect(rule.list().map((d) => d.toUTCString())).toMatchInlineSnapshot(`
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
    `);
  });

  test('Every other week, forever', () => {
    const rule = new RRule({
      dtStart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: Frequency.WEEKLY,
      interval: 2,
    });

    expect(
      rule
        .between(DATE_1997_SEP_02_9AM_NEW_YORK_DST, new Date('1998-02-18T09:00:00.000-05:00'), {
          inclusive: true,
        })
        .map((d) => d.toUTCString())
    ).toMatchInlineSnapshot(`
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
    `);
  });

  test('Weekly on Tuesday and Thursday for five weeks', () => {
    const rule1 = new RRule({
      dtStart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: Frequency.WEEKLY,
      until: new Date('1997-10-07T00:00:00Z'),
      wkst: Weekday.SU,
      byDay: [Weekday.TU, Weekday.TH],
    });

    const rule2 = new RRule({
      dtStart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: Frequency.WEEKLY,
      count: 10,
      wkst: Weekday.SU,
      byDay: [Weekday.TU, Weekday.TH],
    });

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
    expect(rule1.list().map((d) => d.toUTCString())).toMatchInlineSnapshot(snapshot);
    expect(rule2.list().map((d) => d.toUTCString())).toMatchInlineSnapshot(snapshot);
  });

  test('Every other week on Monday, Wednesday, and Friday until December 24, 1997, starting on Monday, September 1, 1997', () => {
    const rule = new RRule({
      dtStart: new Date('1997-09-01T09:00:00.000-04:00'),
      tzid: RFC_TEST_TZID,
      freq: Frequency.WEEKLY,
      interval: 2,
      byDay: [Weekday.MO, Weekday.WE, Weekday.FR],
      until: DATE_1997_DEC_24_MIDNIGHT_NEW_YORK,
    });

    expect(rule.list().map((d) => d.toUTCString())).toMatchInlineSnapshot(`
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
    `);
  });

  test('Every other week on Tuesday and Thursday, for 8 occurrences', () => {
    const rule = new RRule({
      dtStart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: Frequency.WEEKLY,
      interval: 2,
      byDay: [Weekday.TU, Weekday.TH],
      count: 8,
    });

    expect(rule.list().map((d) => d.toUTCString())).toMatchInlineSnapshot(`
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
    `);
  });

  test('Monthly on the first Friday for 10 occurrences', () => {
    const rule = new RRule({
      dtStart: new Date('1997-09-05T09:00:00.000-04:00'),
      tzid: RFC_TEST_TZID,
      freq: Frequency.MONTHLY,
      byDay: [[1, Weekday.FR]],
      count: 10,
    });

    expect(rule.list().map((d) => d.toUTCString())).toMatchInlineSnapshot(`
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
    `);
  });

  test('Monthly on the first Friday until December 24, 1997', () => {
    const rule = new RRule({
      dtStart: new Date('1997-09-05T09:00:00.000-04:00'),
      tzid: RFC_TEST_TZID,
      freq: Frequency.MONTHLY,
      byDay: [[1, Weekday.FR]],
      until: DATE_1997_DEC_24_MIDNIGHT_NEW_YORK,
    });

    expect(rule.list().map((d) => d.toUTCString())).toMatchInlineSnapshot(`
      [
        "Fri, 05 Sep 1997 13:00:00 GMT",
        "Fri, 03 Oct 1997 13:00:00 GMT",
        "Fri, 07 Nov 1997 14:00:00 GMT",
        "Fri, 05 Dec 1997 14:00:00 GMT",
      ]
    `);
  });

  test('Every other month on the first and last Sunday of the month for 10 occurrences', () => {
    const rule = new RRule({
      dtStart: new Date('1997-09-07T09:00:00.000-04:00'),
      tzid: RFC_TEST_TZID,
      freq: Frequency.MONTHLY,
      interval: 2,
      byDay: [
        [1, Weekday.SU],
        [-1, Weekday.SU],
      ],
      count: 10,
    });

    expect(rule.list().map((d) => d.toUTCString())).toMatchInlineSnapshot(`
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
    `);
  });

  test('Monthly on the second-to-last Monday of the month for 6 months', () => {
    const rule = new RRule({
      dtStart: new Date('1997-09-22T09:00:00.000-04:00'),
      tzid: RFC_TEST_TZID,
      freq: Frequency.MONTHLY,
      byDay: [[-2, Weekday.MO]],
      count: 6,
    });

    expect(rule.list().map((d) => d.toUTCString())).toMatchInlineSnapshot(`
      [
        "Mon, 22 Sep 1997 13:00:00 GMT",
        "Mon, 20 Oct 1997 13:00:00 GMT",
        "Mon, 17 Nov 1997 14:00:00 GMT",
        "Mon, 22 Dec 1997 14:00:00 GMT",
        "Mon, 19 Jan 1998 14:00:00 GMT",
        "Mon, 16 Feb 1998 14:00:00 GMT",
      ]
    `);
  });

  test('Monthly on the third-to-the-last day of the month, forever:', () => {
    const rule = new RRule({
      dtStart: new Date('1997-09-28T09:00:00.000-04:00'),
      tzid: RFC_TEST_TZID,
      freq: Frequency.MONTHLY,
      byMonthDay: [-3],
    });

    expect(rule.list({ limit: 6 })).toMatchInlineSnapshot(`
      [
        1997-09-28T13:00:00.000Z,
        1997-10-29T14:00:00.000Z,
        1997-11-28T14:00:00.000Z,
        1997-12-29T14:00:00.000Z,
        1998-01-29T14:00:00.000Z,
        1998-02-26T14:00:00.000Z,
      ]
    `);
  });

  test('Monthly on the 2nd and 15th of the month for 10 occurrences', () => {
    const rule = new RRule({
      dtStart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: Frequency.MONTHLY,
      byMonthDay: [2, 15],
      count: 10,
    });

    expect(rule.list().map((d) => d.toUTCString())).toMatchInlineSnapshot(`
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
    `);
  });

  test('Monthly on the first and last day of the month for 10 occurrences', () => {
    const rule = new RRule({
      dtStart: new Date('1997-09-30T09:00:00.000-04:00'),
      tzid: RFC_TEST_TZID,
      freq: Frequency.MONTHLY,
      byMonthDay: [1, -1],
      count: 10,
    });

    expect(rule.list().map((d) => d.toUTCString())).toMatchInlineSnapshot(`
      [
        "Tue, 30 Sep 1997 13:00:00 GMT",
        "Wed, 01 Oct 1997 13:00:00 GMT",
        "Fri, 31 Oct 1997 14:00:00 GMT",
        "Sat, 01 Nov 1997 14:00:00 GMT",
        "Sun, 30 Nov 1997 14:00:00 GMT",
        "Mon, 01 Dec 1997 14:00:00 GMT",
        "Wed, 31 Dec 1997 14:00:00 GMT",
        "Thu, 01 Jan 1998 14:00:00 GMT",
        "Sat, 31 Jan 1998 14:00:00 GMT",
        "Sun, 01 Feb 1998 14:00:00 GMT",
      ]
    `);
  });

  test('Every 18 months on the 10th thru 15th of the month for 10 occurrences', () => {
    const rule = new RRule({
      dtStart: new Date('1997-09-10T09:00:00.000-04:00'),
      tzid: RFC_TEST_TZID,
      freq: Frequency.MONTHLY,
      byMonthDay: [10, 11, 12, 13, 14, 15],
      interval: 18,
      count: 10,
    });

    expect(rule.list().map((d) => d.toUTCString())).toMatchInlineSnapshot(`
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
    `);
  });

  test('Every Tuesday, every other month', () => {
    const rule = new RRule({
      dtStart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: Frequency.MONTHLY,
      interval: 2,
      byDay: [Weekday.TU],
    });

    expect(
      rule
        .between(DATE_1997_SEP_02_9AM_NEW_YORK_DST, new Date('1998-04-01T09:00:00.000-04:00'), {
          inclusive: true,
        })
        .map((d) => d.toUTCString())
    ).toMatchInlineSnapshot(`
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
    `);
  });

  test('Yearly in June and July for 10 occurrences', () => {
    const rule = new RRule({
      dtStart: new Date('1997-06-10T09:00:00.000-04:00'),
      tzid: RFC_TEST_TZID,
      freq: Frequency.YEARLY,
      byMonth: [6, 7],
      count: 10,
    });

    expect(rule.list().map((d) => d.toUTCString())).toMatchInlineSnapshot(`
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
    `);
  });

  test('Every other year on January, February, and March for 10 occurrences', () => {
    const rule = new RRule({
      dtStart: new Date('1997-03-10T09:00:00.000-05:00'),
      tzid: RFC_TEST_TZID,
      freq: Frequency.YEARLY,
      interval: 2,
      count: 10,
      byMonth: [1, 2, 3],
    });

    expect(rule.list().map((d) => d.toUTCString())).toMatchInlineSnapshot(`
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
    `);
  });

  test('Every third year on the 1st, 100th, and 200th day for 10 occurrences', () => {
    const rule = new RRule({
      dtStart: new Date('1997-01-01T09:00:00.000-05:00'),
      tzid: RFC_TEST_TZID,
      freq: Frequency.YEARLY,
      interval: 3,
      count: 10,
      byYearDay: [1, 100, 200],
    });

    expect(rule.list().map((d) => d.toUTCString())).toMatchInlineSnapshot(`
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
    `);
  });

  test('Every 20th Monday of the year, forever', () => {
    const rule = new RRule({
      dtStart: new Date('1997-05-19T09:00:00.000-05:00'),
      tzid: RFC_TEST_TZID,
      freq: Frequency.YEARLY,
      byDay: [[20, Weekday.MO]],
    });

    expect(rule.list({ limit: 3 }).map((d) => d.toUTCString())).toMatchInlineSnapshot(`
      [
        "Mon, 19 May 1997 14:00:00 GMT",
        "Mon, 18 May 1998 14:00:00 GMT",
        "Mon, 17 May 1999 14:00:00 GMT",
      ]
    `);
  });

  test('Monday of week number 20 (where the default start of the week is Monday), forever', () => {
    const rule = new RRule({
      dtStart: new Date('1997-05-12T09:00:00.000-05:00'),
      tzid: RFC_TEST_TZID,
      freq: Frequency.YEARLY,
      byDay: [Weekday.MO],
      byWeekNo: [20],
    });

    expect(rule.list({ limit: 3 }).map((d) => d.toUTCString())).toMatchInlineSnapshot(`
      [
        "Mon, 12 May 1997 14:00:00 GMT",
        "Mon, 11 May 1998 14:00:00 GMT",
        "Mon, 17 May 1999 14:00:00 GMT",
      ]
    `);
  });

  test('Every Thursday in March, forever:', () => {
    const rule = new RRule({
      dtStart: new Date('1997-03-13T09:00:00.000-05:00'),
      tzid: RFC_TEST_TZID,
      freq: Frequency.YEARLY,
      byDay: [Weekday.TH],
      byMonth: [3],
    });

    expect(
      rule
        .between(
          new Date('1997-03-13T09:00:00.000-05:00'),
          new Date('1999-03-25T09:00:00.000-05:00'),
          { inclusive: true }
        )
        .map((d) => d.toUTCString())
    ).toMatchInlineSnapshot(`
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
    `);
  });

  test('Every Thursday, but only during June, July, and August, forever', () => {
    const rule = new RRule({
      dtStart: new Date('1997-06-05T09:00:00.000-05:00'),
      tzid: RFC_TEST_TZID,
      freq: Frequency.YEARLY,
      byDay: [Weekday.TH],
      byMonth: [6, 7, 8],
    });

    expect(
      rule
        .between(
          new Date('1997-06-05T09:00:00.000-05:00'),
          new Date('1999-08-26T09:00:00.000-05:00'),
          { inclusive: true }
        )
        .map((d) => d.toUTCString())
    ).toMatchInlineSnapshot(`
      [
        "Thu, 05 Jun 1997 14:00:00 GMT",
        "Thu, 12 Jun 1997 14:00:00 GMT",
        "Thu, 19 Jun 1997 14:00:00 GMT",
        "Thu, 26 Jun 1997 14:00:00 GMT",
        "Thu, 03 Jul 1997 14:00:00 GMT",
        "Thu, 10 Jul 1997 14:00:00 GMT",
        "Thu, 17 Jul 1997 14:00:00 GMT",
        "Thu, 24 Jul 1997 14:00:00 GMT",
        "Thu, 31 Jul 1997 14:00:00 GMT",
        "Thu, 07 Aug 1997 14:00:00 GMT",
        "Thu, 14 Aug 1997 14:00:00 GMT",
        "Thu, 21 Aug 1997 14:00:00 GMT",
        "Thu, 28 Aug 1997 14:00:00 GMT",
        "Thu, 04 Jun 1998 14:00:00 GMT",
        "Thu, 11 Jun 1998 14:00:00 GMT",
        "Thu, 18 Jun 1998 14:00:00 GMT",
        "Thu, 25 Jun 1998 14:00:00 GMT",
        "Thu, 02 Jul 1998 14:00:00 GMT",
        "Thu, 09 Jul 1998 14:00:00 GMT",
        "Thu, 16 Jul 1998 14:00:00 GMT",
        "Thu, 23 Jul 1998 14:00:00 GMT",
        "Thu, 30 Jul 1998 14:00:00 GMT",
        "Thu, 06 Aug 1998 14:00:00 GMT",
        "Thu, 13 Aug 1998 14:00:00 GMT",
        "Thu, 20 Aug 1998 14:00:00 GMT",
        "Thu, 27 Aug 1998 14:00:00 GMT",
        "Thu, 03 Jun 1999 14:00:00 GMT",
        "Thu, 10 Jun 1999 14:00:00 GMT",
        "Thu, 17 Jun 1999 14:00:00 GMT",
        "Thu, 24 Jun 1999 14:00:00 GMT",
        "Thu, 01 Jul 1999 14:00:00 GMT",
        "Thu, 08 Jul 1999 14:00:00 GMT",
        "Thu, 15 Jul 1999 14:00:00 GMT",
        "Thu, 22 Jul 1999 14:00:00 GMT",
        "Thu, 29 Jul 1999 14:00:00 GMT",
        "Thu, 05 Aug 1999 14:00:00 GMT",
        "Thu, 12 Aug 1999 14:00:00 GMT",
        "Thu, 19 Aug 1999 14:00:00 GMT",
        "Thu, 26 Aug 1999 14:00:00 GMT",
      ]
    `);
  });

  test('Every Friday the 13th, forever:', () => {
    const rule = new RRule({
      dtStart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      exDate: [DATE_1997_SEP_02_9AM_NEW_YORK_DST],
      tzid: RFC_TEST_TZID,
      freq: Frequency.MONTHLY,
      byDay: [Weekday.FR],
      byMonthDay: [13],
    });

    expect(
      rule
        .between(DATE_1997_SEP_02_9AM_NEW_YORK_DST, new Date('2000-10-13T09:00:00.000-05:00'), {
          inclusive: true,
        })
        .map((d) => d.toUTCString())
    ).toMatchInlineSnapshot(`
      [
        "Fri, 13 Feb 1998 14:00:00 GMT",
        "Fri, 13 Mar 1998 14:00:00 GMT",
        "Fri, 13 Nov 1998 14:00:00 GMT",
        "Fri, 13 Aug 1999 13:00:00 GMT",
        "Fri, 13 Oct 2000 13:00:00 GMT",
      ]
    `);
  });

  test('The first Saturday that follows the first Sunday of the month, forever', () => {
    const rule = new RRule({
      dtStart: new Date('1997-09-13T09:00:00.000-04:00'),
      tzid: RFC_TEST_TZID,
      freq: Frequency.MONTHLY,
      byDay: [Weekday.SA],
      byMonthDay: [7, 8, 9, 10, 11, 12, 13],
    });

    expect(
      rule
        .between(
          new Date('1997-09-13T09:00:00.000-04:00'),
          new Date('1998-06-13T09:00:00.000-04:00'),
          { inclusive: true }
        )
        .map((d) => d.toUTCString())
    ).toMatchInlineSnapshot(`
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
    `);
  });

  test('Every 4 years, the first Tuesday after a Monday in November, forever (U.S. Presidential Election day)', () => {
    const rule = new RRule({
      dtStart: new Date('1996-11-05T09:00:00.000-05:00'),
      tzid: RFC_TEST_TZID,
      freq: Frequency.YEARLY,
      interval: 4,
      byMonth: [11],
      byDay: [Weekday.TU],
      byMonthDay: [2, 3, 4, 5, 6, 7, 8],
    });

    expect(
      rule
        .between(
          new Date('1996-11-05T09:00:00.000-05:00'),
          new Date('2024-11-05T09:00:00.000-05:00'),
          { inclusive: true }
        )
        .map((d) => d.toUTCString())
    ).toMatchInlineSnapshot(`
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
    `);
  });

  test('The third instance into the month of one of Tuesday, Wednesday, or Thursday, for the next 3 months', () => {
    const rule = new RRule({
      dtStart: new Date('1997-09-04T09:00:00.000-04:00'),
      tzid: RFC_TEST_TZID,
      freq: Frequency.MONTHLY,
      count: 3,
      byDay: [Weekday.TU, Weekday.WE, Weekday.TH],
      bySetPos: [3],
    });

    expect(rule.list().map((d) => d.toUTCString())).toMatchInlineSnapshot(`
      [
        "Thu, 04 Sep 1997 13:00:00 GMT",
        "Tue, 07 Oct 1997 13:00:00 GMT",
        "Thu, 06 Nov 1997 14:00:00 GMT",
      ]
    `);
  });

  test('The second-to-last weekday of the month', () => {
    const rule = new RRule({
      dtStart: new Date('1997-09-29T09:00:00.000-04:00'),
      tzid: RFC_TEST_TZID,
      freq: Frequency.MONTHLY,
      byDay: [Weekday.MO, Weekday.TU, Weekday.WE, Weekday.TH, Weekday.FR],
      bySetPos: [-2],
    });

    expect(rule.list({ limit: 7 }).map((d) => d.toUTCString())).toMatchInlineSnapshot(`
      [
        "Mon, 29 Sep 1997 13:00:00 GMT",
        "Thu, 30 Oct 1997 14:00:00 GMT",
        "Thu, 27 Nov 1997 14:00:00 GMT",
        "Tue, 30 Dec 1997 14:00:00 GMT",
        "Thu, 29 Jan 1998 14:00:00 GMT",
        "Thu, 26 Feb 1998 14:00:00 GMT",
        "Mon, 30 Mar 1998 14:00:00 GMT",
      ]
    `);
  });

  test('Every 3 hours from 9:00 AM to 5:00 PM on a specific day', () => {
    const rule = new RRule({
      dtStart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: Frequency.HOURLY,
      interval: 3,
      until: new Date('1997-09-02T17:00:00.000-04:00'),
    });

    //  ==> (September 2, 1997 EDT) 09:00,12:00,15:00
    expect(rule.list().map((d) => d.toUTCString())).toMatchInlineSnapshot(`
      [
        "Tue, 02 Sep 1997 13:00:00 GMT",
        "Tue, 02 Sep 1997 16:00:00 GMT",
        "Tue, 02 Sep 1997 19:00:00 GMT",
      ]
    `);
  });

  test('Every 15 minutes for 6 occurrences', () => {
    const rule = new RRule({
      dtStart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: Frequency.MINUTELY,
      interval: 15,
      count: 6,
    });

    // ==> (September 2, 1997 EDT) 09:00,09:15,09:30,09:45,10:00,10:15
    expect(rule.list().map((d) => d.toUTCString())).toMatchInlineSnapshot(`
      [
        "Tue, 02 Sep 1997 13:00:00 GMT",
        "Tue, 02 Sep 1997 13:15:00 GMT",
        "Tue, 02 Sep 1997 13:30:00 GMT",
        "Tue, 02 Sep 1997 13:45:00 GMT",
        "Tue, 02 Sep 1997 14:00:00 GMT",
        "Tue, 02 Sep 1997 14:15:00 GMT",
      ]
    `);
  });

  test('Every hour and a half for 4 occurrences', () => {
    const rule = new RRule({
      dtStart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: Frequency.MINUTELY,
      interval: 90,
      count: 4,
    });

    // ==> (September 2, 1997 EDT) 09:00,10:30;12:00;13:30
    expect(rule.list().map((d) => d.toUTCString())).toMatchInlineSnapshot(`
      [
        "Tue, 02 Sep 1997 13:00:00 GMT",
        "Tue, 02 Sep 1997 14:30:00 GMT",
        "Tue, 02 Sep 1997 16:00:00 GMT",
        "Tue, 02 Sep 1997 17:30:00 GMT",
      ]
    `);
  });

  test('Every 20 minutes from 9:00 AM to 4:40 PM every day', () => {
    const rule1 = new RRule({
      dtStart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: Frequency.DAILY,
      byHour: [9, 10, 11, 12, 13, 14, 15, 16],
      byMinute: [0, 20, 40],
    });

    const rule2 = new RRule({
      dtStart: DATE_1997_SEP_02_9AM_NEW_YORK_DST,
      tzid: RFC_TEST_TZID,
      freq: Frequency.MINUTELY,
      interval: 20,
      byHour: [9, 10, 11, 12, 13, 14, 15, 16],
    });

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
    expect(rule1.list({ limit: 16 }).map((d) => d.toUTCString())).toMatchInlineSnapshot(snapshot);
    expect(rule2.list({ limit: 16 }).map((d) => d.toUTCString())).toMatchInlineSnapshot(snapshot);
  });

  test('An example where an invalid date (i.e. February 30) is ignored', () => {
    const rule = new RRule({
      dtStart: new Date('2007-01-15T09:00:00.000-05:00'),
      tzid: RFC_TEST_TZID,
      freq: Frequency.MONTHLY,
      byMonthDay: [15, 30],
      count: 5,
    });

    expect(rule.list().map((d) => d.toUTCString())).toMatchInlineSnapshot(`
      [
        "Mon, 15 Jan 2007 14:00:00 GMT",
        "Tue, 30 Jan 2007 14:00:00 GMT",
        "Thu, 15 Feb 2007 14:00:00 GMT",
        "Thu, 15 Mar 2007 13:00:00 GMT",
        "Fri, 30 Mar 2007 13:00:00 GMT",
      ]
    `);
  });

  describe('An example where the days generated makes a difference because of WKST', () => {
    const rule1 = new RRule({
      dtStart: new Date('1997-08-05T09:00:00.000-04:00'),
      tzid: RFC_TEST_TZID,
      freq: Frequency.WEEKLY,
      interval: 2,
      count: 4,
      byDay: [Weekday.TU, Weekday.SU],
      wkst: Weekday.MO,
    });

    expect(rule1.list().map((d) => d.toUTCString())).toMatchInlineSnapshot(`
      [
        "Tue, 05 Aug 1997 13:00:00 GMT",
        "Sun, 10 Aug 1997 13:00:00 GMT",
        "Tue, 19 Aug 1997 13:00:00 GMT",
        "Sun, 24 Aug 1997 13:00:00 GMT",
      ]
    `);

    test('changing only WKST from MO to SU yields different results', () => {
      const rule2 = new RRule({
        dtStart: new Date('1997-08-05T09:00:00.000-04:00'),
        tzid: RFC_TEST_TZID,
        freq: Frequency.WEEKLY,
        interval: 2,
        count: 4,
        byDay: [Weekday.TU, Weekday.SU],
        wkst: Weekday.SU,
      });

      expect(rule2.list().map((d) => d.toUTCString())).toMatchInlineSnapshot(`
        [
          "Tue, 05 Aug 1997 13:00:00 GMT",
          "Sun, 17 Aug 1997 13:00:00 GMT",
          "Tue, 19 Aug 1997 13:00:00 GMT",
          "Sun, 31 Aug 1997 13:00:00 GMT",
        ]
      `);
    });
  });
});

describe('Additional smoke tests', () => {
  // Cover some scenarios not tested in the iCalendar.org examples, in particular bySecond, and
  // integration tests to make sure invalid inputs get ignored gracefully

  describe('secondly frequency', () => {
    test('Every second', () => {
      const rule = new RRule({
        dtStart: new Date(DATE_2023_JAN_6_11PM),
        freq: Frequency.SECONDLY,
        interval: 1,
        tzid: 'UTC',
      });

      expect(rule.list({ limit: 12 })).toMatchInlineSnapshot(`
              [
                2023-01-06T23:00:00.000Z,
                2023-01-06T23:00:01.000Z,
                2023-01-06T23:00:02.000Z,
                2023-01-06T23:00:03.000Z,
                2023-01-06T23:00:04.000Z,
                2023-01-06T23:00:05.000Z,
                2023-01-06T23:00:06.000Z,
                2023-01-06T23:00:07.000Z,
                2023-01-06T23:00:08.000Z,
                2023-01-06T23:00:09.000Z,
                2023-01-06T23:00:10.000Z,
                2023-01-06T23:00:11.000Z,
              ]
          `);
    });
    test('Every 15 seconds', () => {
      const rule = new RRule({
        dtStart: new Date(DATE_2023_JAN_6_11PM),
        freq: Frequency.SECONDLY,
        interval: 15,
        tzid: 'UTC',
      });

      expect(rule.list({ limit: 12 })).toMatchInlineSnapshot(`
        [
          2023-01-06T23:00:00.000Z,
          2023-01-06T23:00:15.000Z,
          2023-01-06T23:00:30.000Z,
          2023-01-06T23:00:45.000Z,
          2023-01-06T23:01:00.000Z,
          2023-01-06T23:01:15.000Z,
          2023-01-06T23:01:30.000Z,
          2023-01-06T23:01:45.000Z,
          2023-01-06T23:02:00.000Z,
          2023-01-06T23:02:15.000Z,
          2023-01-06T23:02:30.000Z,
          2023-01-06T23:02:45.000Z,
        ]
      `);
    });
  });

  describe('byDay', () => {
    it('accounts for timezone when determining day of the week', () => {
      const rule = new RRule({
        dtStart: new Date(DATE_2023_JAN_6_11PM),
        freq: Frequency.WEEKLY,
        interval: 1,
        tzid: 'Europe/Madrid',
        byDay: [Weekday.SA],
      });
      expect(rule.list({ limit: 12 })).toMatchInlineSnapshot(`
        [
          2023-01-06T23:00:00.000Z,
          2023-01-13T23:00:00.000Z,
          2023-01-20T23:00:00.000Z,
          2023-01-27T23:00:00.000Z,
          2023-02-03T23:00:00.000Z,
          2023-02-10T23:00:00.000Z,
          2023-02-17T23:00:00.000Z,
          2023-02-24T23:00:00.000Z,
          2023-03-03T23:00:00.000Z,
          2023-03-10T23:00:00.000Z,
          2023-03-17T23:00:00.000Z,
          2023-03-24T23:00:00.000Z,
        ]
      `);

      const rule2 = new RRule({
        dtStart: new Date(DATE_2023_JAN_6_11PM),
        freq: Frequency.WEEKLY,
        interval: 1,
        tzid: 'UTC',
        byDay: [Weekday.SA],
        exDate: [new Date(DATE_2023_JAN_6_11PM)],
      });

      expect(rule2.list({ limit: 12 })).toMatchInlineSnapshot(`
        [
          2023-01-07T23:00:00.000Z,
          2023-01-14T23:00:00.000Z,
          2023-01-21T23:00:00.000Z,
          2023-01-28T23:00:00.000Z,
          2023-02-04T23:00:00.000Z,
          2023-02-11T23:00:00.000Z,
          2023-02-18T23:00:00.000Z,
          2023-02-25T23:00:00.000Z,
          2023-03-04T23:00:00.000Z,
          2023-03-11T23:00:00.000Z,
          2023-03-18T23:00:00.000Z,
          2023-03-25T23:00:00.000Z,
        ]
      `);
    });
    it('ignores invalid byDay values', () => {
      const rule = new RRule({
        dtStart: new Date(DATE_2019_DECEMBER_19),
        freq: Frequency.WEEKLY,
        interval: 1,
        tzid: 'UTC',
        // @ts-expect-error Expect invalid values
        byDay: [Weekday.TH, 0, -2],
      });
      expect(rule.list({ limit: 14 })).toMatchInlineSnapshot(`
        [
          2019-12-19T00:00:00.000Z,
          2019-12-26T00:00:00.000Z,
          2020-01-02T00:00:00.000Z,
          2020-01-09T00:00:00.000Z,
          2020-01-16T00:00:00.000Z,
          2020-01-23T00:00:00.000Z,
          2020-01-30T00:00:00.000Z,
          2020-02-06T00:00:00.000Z,
          2020-02-13T00:00:00.000Z,
          2020-02-20T00:00:00.000Z,
          2020-02-27T00:00:00.000Z,
          2020-03-05T00:00:00.000Z,
          2020-03-12T00:00:00.000Z,
          2020-03-19T00:00:00.000Z,
        ]
      `);

      const rule2 = new RRule({
        dtStart: new Date(DATE_2019),
        freq: Frequency.WEEKLY,
        interval: 1,
        tzid: 'UTC',
        // @ts-expect-error Expect invalid values
        byDay: [Weekday.SA, Weekday.SU, Weekday.MO, 0],
        exDate: [new Date(DATE_2019)],
      });

      expect(rule2.list({ limit: 9 })).toMatchInlineSnapshot(`
        [
          2019-01-05T00:00:00.000Z,
          2019-01-06T00:00:00.000Z,
          2019-01-07T00:00:00.000Z,
          2019-01-12T00:00:00.000Z,
          2019-01-13T00:00:00.000Z,
          2019-01-14T00:00:00.000Z,
          2019-01-19T00:00:00.000Z,
          2019-01-20T00:00:00.000Z,
          2019-01-21T00:00:00.000Z,
        ]
      `);
    });
  });

  describe('byMonth', () => {
    it('ignores invalid byMonth values', () => {
      const rule = new RRule({
        dtStart: new Date(DATE_2019_DECEMBER_19),
        freq: Frequency.YEARLY,
        interval: 1,
        tzid: 'UTC',
        byMonth: [0],
      });
      expect(rule.list({ limit: 14 })).toMatchInlineSnapshot(`
        [
          2019-12-19T00:00:00.000Z,
          2020-12-19T00:00:00.000Z,
          2021-12-19T00:00:00.000Z,
          2022-12-19T00:00:00.000Z,
          2023-12-19T00:00:00.000Z,
          2024-12-19T00:00:00.000Z,
          2025-12-19T00:00:00.000Z,
          2026-12-19T00:00:00.000Z,
          2027-12-19T00:00:00.000Z,
          2028-12-19T00:00:00.000Z,
          2029-12-19T00:00:00.000Z,
          2030-12-19T00:00:00.000Z,
          2031-12-19T00:00:00.000Z,
          2032-12-19T00:00:00.000Z,
        ]
      `);
    });
  });

  describe('byHour, byMinute, bySecond', () => {
    it('works with daily frequency', () => {
      const rule = new RRule({
        dtStart: new Date(DATE_2019_DECEMBER_19),
        freq: Frequency.DAILY,
        interval: 1,
        tzid: 'UTC',
        byHour: [14],
        byMinute: [30],
        bySecond: [0, 15],
        exDate: [new Date(DATE_2019_DECEMBER_19)],
      });
      expect(rule.list({ limit: 14 })).toMatchInlineSnapshot(`
        [
          2019-12-19T14:30:00.000Z,
          2019-12-19T14:30:15.000Z,
          2019-12-20T14:30:00.000Z,
          2019-12-20T14:30:15.000Z,
          2019-12-21T14:30:00.000Z,
          2019-12-21T14:30:15.000Z,
          2019-12-22T14:30:00.000Z,
          2019-12-22T14:30:15.000Z,
          2019-12-23T14:30:00.000Z,
          2019-12-23T14:30:15.000Z,
          2019-12-24T14:30:00.000Z,
          2019-12-24T14:30:15.000Z,
          2019-12-25T14:30:00.000Z,
          2019-12-25T14:30:15.000Z,
        ]
      `);
    });
    it('works with hourly frequency', () => {
      const rule = new RRule({
        dtStart: new Date(DATE_2019_DECEMBER_19),
        freq: Frequency.HOURLY,
        interval: 1,
        tzid: 'UTC',
        byMinute: [15, 30],
        bySecond: [30, 0],
        exDate: [new Date(DATE_2019_DECEMBER_19)],
      });
      expect(rule.list({ limit: 14 })).toMatchInlineSnapshot(`
        [
          2019-12-19T00:15:30.000Z,
          2019-12-19T00:15:00.000Z,
          2019-12-19T00:30:30.000Z,
          2019-12-19T00:30:00.000Z,
          2019-12-19T01:15:30.000Z,
          2019-12-19T01:15:00.000Z,
          2019-12-19T01:30:30.000Z,
          2019-12-19T01:30:00.000Z,
          2019-12-19T02:15:30.000Z,
          2019-12-19T02:15:00.000Z,
          2019-12-19T02:30:30.000Z,
          2019-12-19T02:30:00.000Z,
          2019-12-19T03:15:30.000Z,
          2019-12-19T03:15:00.000Z,
        ]
      `);
    });
    it('works with minutely frequency', () => {
      const rule = new RRule({
        dtStart: new Date(DATE_2019_DECEMBER_19),
        freq: Frequency.HOURLY,
        interval: 1,
        tzid: 'UTC',
        bySecond: [10, 30, 58],
        exDate: [new Date(DATE_2019_DECEMBER_19)],
      });
      expect(rule.list({ limit: 14 })).toMatchInlineSnapshot(`
        [
          2019-12-19T00:00:10.000Z,
          2019-12-19T00:00:30.000Z,
          2019-12-19T00:00:58.000Z,
          2019-12-19T00:01:10.000Z,
          2019-12-19T00:01:30.000Z,
          2019-12-19T00:01:58.000Z,
          2019-12-19T00:02:10.000Z,
          2019-12-19T00:02:30.000Z,
          2019-12-19T00:02:58.000Z,
          2019-12-19T00:03:10.000Z,
          2019-12-19T00:03:30.000Z,
          2019-12-19T00:03:58.000Z,
          2019-12-19T00:04:10.000Z,
          2019-12-19T00:04:30.000Z,
        ]
      `);
    });

    it('works with secondly frequency', () => {
      const rule = new RRule({
        dtStart: new Date(DATE_2019_DECEMBER_19),
        freq: Frequency.SECONDLY,
        interval: 1,
        tzid: 'UTC',
        bySecond: [10, 30, 58],
        exDate: [new Date(DATE_2019_DECEMBER_19)],
      });
      expect(rule.list({ limit: 14 })).toMatchInlineSnapshot(`
        [
          2019-12-19T00:00:10.000Z,
          2019-12-19T00:00:30.000Z,
          2019-12-19T00:00:58.000Z,
          2019-12-19T00:00:10.000Z,
          2019-12-19T00:00:30.000Z,
          2019-12-19T00:00:58.000Z,
          2019-12-19T00:00:10.000Z,
          2019-12-19T00:00:30.000Z,
          2019-12-19T00:00:58.000Z,
          2019-12-19T00:00:10.000Z,
          2019-12-19T00:00:30.000Z,
          2019-12-19T00:00:58.000Z,
          2019-12-19T00:00:10.000Z,
          2019-12-19T00:00:30.000Z,
        ]
      `);
    });
  });

  describe('byYearDay', () => {
    it('respects leap years', () => {
      const rule3 = new RRule({
        dtStart: new Date(DATE_2020),
        freq: Frequency.YEARLY,
        byYearDay: [92],
        interval: 1,
        tzid: 'UTC',
        exDate: [new Date(DATE_2020)],
      });

      expect(rule3.list({ limit: 10 })).toMatchInlineSnapshot(`
        [
          2020-04-01T00:00:00.000Z,
          2021-04-02T00:00:00.000Z,
          2022-04-02T00:00:00.000Z,
          2023-04-02T00:00:00.000Z,
          2024-04-01T00:00:00.000Z,
          2025-04-02T00:00:00.000Z,
          2026-04-02T00:00:00.000Z,
          2027-04-02T00:00:00.000Z,
          2028-04-01T00:00:00.000Z,
          2029-04-02T00:00:00.000Z,
        ]
      `);
    });
    it('ignores invalid byYearDay values', () => {
      const rule = new RRule({
        dtStart: new Date(DATE_2020),
        freq: Frequency.YEARLY,
        byYearDay: [0, -1],
        interval: 1,
        tzid: 'UTC',
      });

      expect(rule.list({ limit: 10 })).toMatchInlineSnapshot(`
        [
          2020-01-01T00:00:00.000Z,
          2021-01-01T00:00:00.000Z,
          2022-01-01T00:00:00.000Z,
          2023-01-01T00:00:00.000Z,
          2024-01-01T00:00:00.000Z,
          2025-01-01T00:00:00.000Z,
          2026-01-01T00:00:00.000Z,
          2027-01-01T00:00:00.000Z,
          2028-01-01T00:00:00.000Z,
          2029-01-01T00:00:00.000Z,
        ]
      `);
    });
  });

  describe('rDate', () => {
    it("includes RDates in the occurrences list even if they don't match the RRule", () => {
      const rule = new RRule({
        dtStart: new Date(DATE_2019_DECEMBER_19),
        freq: Frequency.MONTHLY,
        interval: 2,
        tzid: 'UTC',
        count: 10,
        rDate: [
          new Date('2020-05-14T00:00:00.000Z'),
          new Date('2020-05-15T00:00:00.000Z'),
          new Date('2020-07-18T00:00:00.000Z'),
        ],
      });

      expect(rule.list()).toMatchInlineSnapshot(`
        [
          2019-12-19T00:00:00.000Z,
          2020-02-19T00:00:00.000Z,
          2020-04-19T00:00:00.000Z,
          2020-05-14T00:00:00.000Z,
          2020-05-15T00:00:00.000Z,
          2020-06-19T00:00:00.000Z,
          2020-07-18T00:00:00.000Z,
          2020-08-19T00:00:00.000Z,
          2020-10-19T00:00:00.000Z,
          2020-12-19T00:00:00.000Z,
        ]
      `);
    });

    it('does not yield RDates twice if they already match the RRule', () => {
      const rule = new RRule({
        dtStart: new Date(DATE_2019_DECEMBER_19),
        freq: Frequency.MONTHLY,
        interval: 2,
        tzid: 'UTC',
        count: 10,
        rDate: [
          new Date('2020-04-19T00:00:00.000Z'),
          new Date('2020-05-15T00:00:00.000Z'),
          new Date('2020-07-18T00:00:00.000Z'),
        ],
      });

      expect(rule.list()).toMatchInlineSnapshot(`
        [
          2019-12-19T00:00:00.000Z,
          2020-02-19T00:00:00.000Z,
          2020-04-19T00:00:00.000Z,
          2020-05-15T00:00:00.000Z,
          2020-06-19T00:00:00.000Z,
          2020-07-18T00:00:00.000Z,
          2020-08-19T00:00:00.000Z,
          2020-10-19T00:00:00.000Z,
          2020-12-19T00:00:00.000Z,
          2021-02-19T00:00:00.000Z,
        ]
      `);
    });
  });

  describe('strict', () => {
    it("when omitted, yields dtstart as an occurrence even if it doesn't match the RRule", () => {
      const rule = new RRule({
        dtStart: new Date(DATE_2019_DECEMBER_19),
        freq: Frequency.MONTHLY,
        interval: 1,
        tzid: 'UTC',
        byMonth: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      });

      expect(rule.list({ limit: 18 })).toMatchInlineSnapshot(`
        [
          2019-12-19T00:00:00.000Z,
          2020-01-19T00:00:00.000Z,
          2020-02-19T00:00:00.000Z,
          2020-03-19T00:00:00.000Z,
          2020-04-19T00:00:00.000Z,
          2020-05-19T00:00:00.000Z,
          2020-06-19T00:00:00.000Z,
          2020-07-19T00:00:00.000Z,
          2020-08-19T00:00:00.000Z,
          2020-09-19T00:00:00.000Z,
          2020-10-19T00:00:00.000Z,
          2020-11-19T00:00:00.000Z,
          2021-01-19T00:00:00.000Z,
          2021-02-19T00:00:00.000Z,
          2021-03-19T00:00:00.000Z,
          2021-04-19T00:00:00.000Z,
          2021-05-19T00:00:00.000Z,
          2021-06-19T00:00:00.000Z,
        ]
      `);
    });

    it('when true, only yields dtstart if it actually matches the RRule', () => {
      const rule1 = new RRule(
        {
          dtStart: new Date(DATE_2019_DECEMBER_19),
          freq: Frequency.MONTHLY,
          interval: 1,
          tzid: 'UTC',
          byMonth: [1, 2, 3],
        },
        { strict: true }
      );

      const rule2 = new RRule(
        {
          dtStart: new Date(DATE_2019_DECEMBER_19),
          freq: Frequency.MONTHLY,
          interval: 1,
          tzid: 'UTC',
          byMonth: [1, 2, 3, 12],
        },
        { strict: false }
      );

      expect(rule1.list({ limit: 3 })).toMatchInlineSnapshot(`
        [
          2020-01-19T00:00:00.000Z,
          2020-02-19T00:00:00.000Z,
          2020-03-19T00:00:00.000Z,
        ]
      `);
      expect(rule2.list({ limit: 3 })).toMatchInlineSnapshot(`
        [
          2019-12-19T00:00:00.000Z,
          2020-01-19T00:00:00.000Z,
          2020-02-19T00:00:00.000Z,
        ]
      `);
    });
  });
});

describe('Error handling', () => {
  it('throws an error on an invalid dtStart', () => {
    const testFn = () =>
      new RRule({
        dtStart: new Date(INVALID_DATE),
        freq: Frequency.HOURLY,
        interval: 1,
        tzid: 'UTC',
      });
    expect(testFn).toThrowErrorMatchingInlineSnapshot(
      `"Cannot create RRule: dtStart is an invalid date"`
    );
  });
  it('throws an error on an invalid until', () => {
    const testFn = () =>
      new RRule({
        dtStart: new Date(DATE_2020),
        until: new Date(INVALID_DATE),
        freq: Frequency.HOURLY,
        interval: 1,
        tzid: 'UTC',
      });
    expect(testFn).toThrowErrorMatchingInlineSnapshot(
      `"Cannot create RRule: until is an invalid date"`
    );
  });

  it('throws an error on an interval of 0', () => {
    const testFn = () =>
      new RRule({
        dtStart: new Date(DATE_2020),
        freq: Frequency.HOURLY,
        interval: 0,
        tzid: 'UTC',
      });
    expect(testFn).toThrowErrorMatchingInlineSnapshot(
      `"Cannot create RRule: interval must be greater than 0"`
    );
  });

  it('throws an error when exceeding the iteration limit', () => {
    const testFn = () => {
      const rule = new RRule({
        dtStart: new Date(DATE_2020),
        freq: Frequency.YEARLY,
        byYearDay: [1],
        interval: 1,
        tzid: 'UTC',
      });
      rule.__unsafeSetTimeoutLimit(10); // Speed this test up, don't actually iterate 1000000 times
      rule.list({ limit: 100001 });
    };

    expect(testFn).toThrowErrorMatchingInlineSnapshot(`"RRule iteration limit exceeded"`);
  });
});

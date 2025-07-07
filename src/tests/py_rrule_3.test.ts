import {RRuleTemporal} from '../index';
import {assertDates, zdt} from './helpers';

// https://github.com/dateutil/dateutil/blob/master/tests/test_rrule.py
describe('RRuleTemporal - Python compatibility tests 3 (Secondly)', () => {
  describe('Secondly frequency tests', () => {
    it.skip('testSecondlyByMonthAndMonthDay', () => {
      const rule = new RRuleTemporal({
        freq: 'SECONDLY',
        count: 3,
        byMonth: [1, 3],
        byMonthDay: [5, 7],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1998-01-05T00:00:00.000Z', '1998-01-05T00:00:01.000Z', '1998-01-05T00:00:02.000Z']);
    });
    /*
    it('testSecondlyByWeekDay', () => {
      const rule = new RRuleTemporal({
        freq: 'SECONDLY',
        count: 3,
        byDay: ['TU', 'TH'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-02T09:00:01.000Z', '1997-09-02T09:00:02.000Z']);
    });

    it('testSecondlyByNWeekDay', () => {
      const rule = new RRuleTemporal({
        freq: 'SECONDLY',
        count: 3,
        byDay: ['1TU', '-1TH'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-02T09:00:01.000Z', '1997-09-02T09:00:02.000Z']);
    });

    it('testSecondlyByMonthAndWeekDay', () => {
      const rule = new RRuleTemporal({
        freq: 'SECONDLY',
        count: 3,
        byMonth: [1, 3],
        byDay: ['TU', 'TH'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1998-01-01T00:00:00.000Z', '1998-01-01T00:00:01.000Z', '1998-01-01T00:00:02.000Z']);
    });

    it('testSecondlyByMonthAndNWeekDay', () => {
      const rule = new RRuleTemporal({
        freq: 'SECONDLY',
        count: 3,
        byMonth: [1, 3],
        byDay: ['1TU', '-1TH'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1998-01-01T00:00:00.000Z', '1998-01-01T00:00:01.000Z', '1998-01-01T00:00:02.000Z']);
    });

    it('testSecondlyByMonthDayAndWeekDay', () => {
      const rule = new RRuleTemporal({
        freq: 'SECONDLY',
        count: 3,
        byMonthDay: [1, 3],
        byDay: ['TU', 'TH'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1998-01-01T00:00:00.000Z', '1998-01-01T00:00:01.000Z', '1998-01-01T00:00:02.000Z']);
    });

    it('testSecondlyByMonthAndMonthDayAndWeekDay', () => {
      const rule = new RRuleTemporal({
        freq: 'SECONDLY',
        count: 3,
        byMonth: [1, 3],
        byMonthDay: [1, 3],
        byDay: ['TU', 'TH'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1998-01-01T00:00:00.000Z', '1998-01-01T00:00:01.000Z', '1998-01-01T00:00:02.000Z']);
    });

    it('testSecondlyByYearDay', () => {
      const rule = new RRuleTemporal({
        freq: 'SECONDLY',
        count: 4,
        byYearDay: [1, 100, 200, 365],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, [
        '1997-12-31T00:00:00.000Z',
        '1997-12-31T00:00:01.000Z',
        '1997-12-31T00:00:02.000Z',
        '1997-12-31T00:00:03.000Z',
      ]);
    });

    it('testSecondlyByYearDayNeg', () => {
      const rule = new RRuleTemporal({
        freq: 'SECONDLY',
        count: 4,
        byYearDay: [-365, -266, -166, -1],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, [
        '1997-12-31T00:00:00.000Z',
        '1997-12-31T00:00:01.000Z',
        '1997-12-31T00:00:02.000Z',
        '1997-12-31T00:00:03.000Z',
      ]);
    });

    it('testSecondlyByMonthAndYearDay', () => {
      const rule = new RRuleTemporal({
        freq: 'SECONDLY',
        count: 4,
        byMonth: [4, 7],
        byYearDay: [1, 100, 200, 365],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, [
        '1998-04-10T00:00:00.000Z',
        '1998-04-10T00:00:01.000Z',
        '1998-04-10T00:00:02.000Z',
        '1998-04-10T00:00:03.000Z',
      ]);
    });

    it('testSecondlyByMonthAndYearDayNeg', () => {
      const rule = new RRuleTemporal({
        freq: 'SECONDLY',
        count: 4,
        byMonth: [4, 7],
        byYearDay: [-365, -266, -166, -1],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, [
        '1998-04-10T00:00:00.000Z',
        '1998-04-10T00:00:01.000Z',
        '1998-04-10T00:00:02.000Z',
        '1998-04-10T00:00:03.000Z',
      ]);
    });

    it('testSecondlyByWeekNo', () => {
      const rule = new RRuleTemporal({
        freq: 'SECONDLY',
        count: 3,
        byWeekNo: [20],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1998-05-11T00:00:00.000Z', '1998-05-11T00:00:01.000Z', '1998-05-11T00:00:02.000Z']);
    });

    it('testSecondlyByWeekNoAndWeekDay', () => {
      const rule = new RRuleTemporal({
        freq: 'SECONDLY',
        count: 3,
        byWeekNo: [1],
        byDay: ['MO'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-12-29T00:00:00.000Z', '1997-12-29T00:00:01.000Z', '1997-12-29T00:00:02.000Z']);
    });

    it('testSecondlyByWeekNoAndWeekDayLarge', () => {
      const rule = new RRuleTemporal({
        freq: 'SECONDLY',
        count: 3,
        byWeekNo: [52],
        byDay: ['SU'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-12-28T00:00:00.000Z', '1997-12-28T00:00:01.000Z', '1997-12-28T00:00:02.000Z']);
    });

    it('testSecondlyByWeekNoAndWeekDayLast', () => {
      const rule = new RRuleTemporal({
        freq: 'SECONDLY',
        count: 3,
        byWeekNo: [-1],
        byDay: ['SU'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-12-28T00:00:00.000Z', '1997-12-28T00:00:01.000Z', '1997-12-28T00:00:02.000Z']);
    });

    it('testSecondlyByWeekNoAndWeekDay53', () => {
      const rule = new RRuleTemporal({
        freq: 'SECONDLY',
        count: 3,
        byWeekNo: [53],
        byDay: ['MO'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1998-12-28T00:00:00.000Z', '1998-12-28T00:00:01.000Z', '1998-12-28T00:00:02.000Z']);
    });

    it('testSecondlyByHour', () => {
      const rule = new RRuleTemporal({
        freq: 'SECONDLY',
        count: 3,
        byHour: [6, 18],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T18:00:00.000Z', '1997-09-02T18:00:01.000Z', '1997-09-02T18:00:02.000Z']);
    });

    it('testSecondlyByMinute', () => {
      const rule = new RRuleTemporal({
        freq: 'SECONDLY',
        count: 3,
        byMinute: [6, 18],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T09:06:00.000Z', '1997-09-02T09:06:01.000Z', '1997-09-02T09:06:02.000Z']);
    });

    it('testSecondlyBySecond', () => {
      const rule = new RRuleTemporal({
        freq: 'SECONDLY',
        count: 3,
        bySecond: [6, 18],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T09:00:06.000Z', '1997-09-02T09:00:18.000Z', '1997-09-02T09:01:06.000Z']);
    });

    it('testSecondlyByHourAndMinute', () => {
      const rule = new RRuleTemporal({
        freq: 'SECONDLY',
        count: 3,
        byHour: [6, 18],
        byMinute: [6, 18],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T18:06:00.000Z', '1997-09-02T18:06:01.000Z', '1997-09-02T18:06:02.000Z']);
    });

    it('testSecondlyByHourAndSecond', () => {
      const rule = new RRuleTemporal({
        freq: 'SECONDLY',
        count: 3,
        byHour: [6, 18],
        bySecond: [6, 18],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T18:00:06.000Z', '1997-09-02T18:00:18.000Z', '1997-09-02T18:01:06.000Z']);
    });

    it('testSecondlyByMinuteAndSecond', () => {
      const rule = new RRuleTemporal({
        freq: 'SECONDLY',
        count: 3,
        byMinute: [6, 18],
        bySecond: [6, 18],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T09:06:06.000Z', '1997-09-02T09:06:18.000Z', '1997-09-02T09:18:06.000Z']);
    });

    it('testSecondlyByHourAndMinuteAndSecond', () => {
      const rule = new RRuleTemporal({
        freq: 'SECONDLY',
        count: 3,
        byHour: [6, 18],
        byMinute: [6, 18],
        bySecond: [6, 18],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T18:06:06.000Z', '1997-09-02T18:06:18.000Z', '1997-09-02T18:18:06.000Z']);
    });

    it.skip('testSecondlyByHourAndMinuteAndSecondBug', () => {
      const rule = new RRuleTemporal({
        freq: 'SECONDLY',
        count: 3,
        bySecond: [0],
        byMinute: [1],
        dtstart: Temporal.ZonedDateTime.from({year: 2010, month: 3, day: 22, hour: 12, minute: 1, timeZone: 'UTC'}),
      });
      assertDates({rule}, ['2010-03-22T12:01:00.000Z', '2010-03-22T13:01:00.000Z', '2010-03-22T14:01:00.000Z']);
    });

    it('testUntilNotMatching', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
        until: zdt(1997, 9, 5, 8, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-03T09:00:00.000Z', '1997-09-04T09:00:00.000Z']);
    });

    it('testUntilMatching', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
        until: zdt(1997, 9, 4, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-03T09:00:00.000Z', '1997-09-04T09:00:00.000Z']);
    });

    it('testUntilSingle', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
        until: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T09:00:00.000Z']);
    });

    it('testUntilEmpty', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
        until: zdt(1997, 9, 1, 9, 'UTC'),
      });
      assertDates({rule}, []);
    });

    it('testWkStIntervalMO', () => {
      const rule = new RRuleTemporal({
        freq: 'WEEKLY',
        count: 3,
        interval: 2,
        byDay: ['TU', 'SU'],
        wkst: 'MO',
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-07T09:00:00.000Z', '1997-09-16T09:00:00.000Z']);
    });

    it('testWkStIntervalSU', () => {
      const rule = new RRuleTemporal({
        freq: 'WEEKLY',
        count: 3,
        interval: 2,
        byDay: ['TU', 'SU'],
        wkst: 'SU',
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-14T09:00:00.000Z', '1997-09-16T09:00:00.000Z']);
    });

    it.skip('testDTStartWithMicroseconds', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        count: 3,
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-03T09:00:00.000Z', '1997-09-04T09:00:00.000Z']);
    });
*/
    // it('testMaxYear', () => {
    //   const rule = new RRuleTemporal({
    //     freq: 'YEARLY',
    //     count: 3,
    //     byMonth: [2],
    //     byMonthDay: [31],
    //     dtstart: zdt(9997, 9, 2, 9, 'UTC'),
    //   });
    //   assertDates({rule}, []);
    // });
  });
});

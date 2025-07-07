import {RRuleTemporal} from '../index';
import {assertDates, zdt} from './helpers';

// https://github.com/dateutil/dateutil/blob/master/tests/test_rrule.py
describe('RRuleTemporal - Python compatibility tests 2', () => {
  describe('Daily frequency tests', () => {
    it('testDaily', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        count: 3,
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-03T09:00:00.000Z', '1997-09-04T09:00:00.000Z']);
    });

    it('testDailyInterval', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        count: 3,
        interval: 2,
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-04T09:00:00.000Z', '1997-09-06T09:00:00.000Z']);
    });

    it('testDailyIntervalLarge', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        count: 3,
        interval: 92,
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-12-03T09:00:00.000Z', '1998-03-05T09:00:00.000Z']);
    });

    it('testDailyByMonth', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        count: 3,
        byMonth: [1, 3],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1998-01-01T09:00:00.000Z', '1998-01-02T09:00:00.000Z', '1998-01-03T09:00:00.000Z']);
    });

    it('testDailyByMonthDay', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        count: 3,
        byMonthDay: [1, 3],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-03T09:00:00.000Z', '1997-10-01T09:00:00.000Z', '1997-10-03T09:00:00.000Z']);
    });

    it('testDailyByMonthAndMonthDay', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        count: 3,
        byMonth: [1, 3],
        byMonthDay: [5, 7],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1998-01-05T09:00:00.000Z', '1998-01-07T09:00:00.000Z', '1998-03-05T09:00:00.000Z']);
    });

    it('testDailyByWeekDay', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        count: 3,
        byDay: ['TU', 'TH'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-04T09:00:00.000Z', '1997-09-09T09:00:00.000Z']);
    });

    it.skip('testDailyByNWeekDay', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        count: 3,
        byDay: ['1TU', '-1TH'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-04T09:00:00.000Z', '1997-09-09T09:00:00.000Z']);
    });

    it('testDailyByMonthAndWeekDay', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        count: 3,
        byMonth: [1, 3],
        byDay: ['TU', 'TH'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1998-01-01T09:00:00.000Z', '1998-01-06T09:00:00.000Z', '1998-01-08T09:00:00.000Z']);
    });

    it.skip('testDailyByMonthAndNWeekDay', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        count: 3,
        byMonth: [1, 3],
        byDay: ['1TU', '-1TH'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1998-01-01T09:00:00.000Z', '1998-01-06T09:00:00.000Z', '1998-01-8T09:00:00.000Z']);
    });

    it('testDailyByMonthDayAndWeekDay', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        count: 3,
        byMonthDay: [1, 3],
        byDay: ['TU', 'TH'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1998-01-01T09:00:00.000Z', '1998-02-03T09:00:00.000Z', '1998-03-03T09:00:00.000Z']);
    });

    it('testDailyByMonthAndMonthDayAndWeekDay', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        count: 3,
        byMonth: [1, 3],
        byMonthDay: [1, 3],
        byDay: ['TU', 'TH'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1998-01-01T09:00:00.000Z', '1998-03-03T09:00:00.000Z', '2001-03-01T09:00:00.000Z']);
    });

    it('testDailyByYearDay', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        count: 4,
        byYearDay: [1, 100, 200, 365],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, [
        '1997-12-31T09:00:00.000Z',
        '1998-01-01T09:00:00.000Z',
        '1998-04-10T09:00:00.000Z',
        '1998-07-19T09:00:00.000Z',
      ]);
    });

    it('testDailyByYearDayNeg', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        count: 4,
        byYearDay: [-365, -266, -166, -1],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, [
        '1997-12-31T09:00:00.000Z',
        '1998-01-01T09:00:00.000Z',
        '1998-04-10T09:00:00.000Z',
        '1998-07-19T09:00:00.000Z',
      ]);
    });

    it('testDailyByMonthAndYearDay', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        count: 4,
        byMonth: [1, 7],
        byYearDay: [1, 100, 200, 365],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, [
        '1998-01-01T09:00:00.000Z',
        '1998-07-19T09:00:00.000Z',
        '1999-01-01T09:00:00.000Z',
        '1999-07-19T09:00:00.000Z',
      ]);
    });

    it('testDailyByMonthAndYearDayNeg', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        count: 4,
        byMonth: [1, 7],
        byYearDay: [-365, -266, -166, -1],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, [
        '1998-01-01T09:00:00.000Z',
        '1998-07-19T09:00:00.000Z',
        '1999-01-01T09:00:00.000Z',
        '1999-07-19T09:00:00.000Z',
      ]);
    });

    it('testDailyByWeekNo', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        count: 3,
        byWeekNo: [20],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1998-05-11T09:00:00.000Z', '1998-05-12T09:00:00.000Z', '1998-05-13T09:00:00.000Z']);
    });

    it.skip('testDailyByWeekNoAndWeekDay', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        count: 3,
        byWeekNo: [1],
        byDay: ['MO'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-12-29T09:00:00.000Z', '1999-01-04T09:00:00.000Z', '2000-01-03T09:00:00.000Z']);
    });

    it.skip('testDailyByWeekNoAndWeekDayLarge', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        count: 3,
        byWeekNo: [52],
        byDay: ['SU'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-12-28T09:00:00.000Z', '1998-12-27T09:00:00.000Z', '2000-01-02T09:00:00.000Z']);
    });

    it.skip('testDailyByWeekNoAndWeekDayLast', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        count: 3,
        byWeekNo: [-1],
        byDay: ['SU'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-12-28T09:00:00.000Z', '1999-01-03T09:00:00.000Z', '2000-01-02T09:00:00.000Z']);
    });

    it.skip('testDailyByWeekNoAndWeekDay53', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        count: 3,
        byWeekNo: [53],
        byDay: ['MO'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1998-12-28T09:00:00.000Z', '2004-12-27T09:00:00.000Z', '2009-12-28T09:00:00.000Z']);
    });

    it.skip('testDailyByHour', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        count: 3,
        byHour: [6, 18],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T18:00:00.000Z', '1997-09-03T06:00:00.000Z', '1997-09-03T18:00:00.000Z']);
    });

    it('testDailyByMinute', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        count: 3,
        byMinute: [6, 18],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T09:06:00.000Z', '1997-09-02T09:18:00.000Z', '1997-09-03T09:06:00.000Z']);
    });

    it('testDailyBySecond', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        count: 3,
        bySecond: [6, 18],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T09:00:06.000Z', '1997-09-02T09:00:18.000Z', '1997-09-03T09:00:06.000Z']);
    });

    it.skip('testDailyByHourAndMinute', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        count: 3,
        byHour: [6, 18],
        byMinute: [6, 18],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T18:06:00.000Z', '1997-09-02T18:18:00.000Z', '1997-09-03T06:06:00.000Z']);
    });

    it.skip('testDailyByHourAndSecond', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        count: 3,
        byHour: [6, 18],
        bySecond: [6, 18],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T18:00:06.000Z', '1997-09-02T18:00:18.000Z', '1997-09-03T06:00:06.000Z']);
    });

    it('testDailyByMinuteAndSecond', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        count: 3,
        byMinute: [6, 18],
        bySecond: [6, 18],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T09:06:06.000Z', '1997-09-02T09:06:18.000Z', '1997-09-02T09:18:06.000Z']);
    });

    it.skip('testDailyByHourAndMinuteAndSecond', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        count: 3,
        byHour: [6, 18],
        byMinute: [6, 18],
        bySecond: [6, 18],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T18:06:06.000Z', '1997-09-02T18:06:18.000Z', '1997-09-02T18:18:06.000Z']);
    });

    it.skip('testDailyBySetPos', () => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        count: 3,
        byHour: [6, 18],
        byMinute: [15, 45],
        bySetPos: [3, -3],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T18:15:00.000Z', '1997-09-03T06:45:00.000Z', '1997-09-03T18:15:00.000Z']);
    });
  });

  describe('Hourly frequency tests', () => {
    it('testHourly', () => {
      const rule = new RRuleTemporal({
        freq: 'HOURLY',
        count: 3,
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-02T10:00:00.000Z', '1997-09-02T11:00:00.000Z']);
    });

    it('testHourlyInterval', () => {
      const rule = new RRuleTemporal({
        freq: 'HOURLY',
        count: 3,
        interval: 2,
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-02T11:00:00.000Z', '1997-09-02T13:00:00.000Z']);
    });

    it('testHourlyIntervalLarge', () => {
      const rule = new RRuleTemporal({
        freq: 'HOURLY',
        count: 3,
        interval: 769,
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-10-04T10:00:00.000Z', '1997-11-05T11:00:00.000Z']);
    });

    it('testHourlyByMonth', () => {
      const rule = new RRuleTemporal({
        freq: 'HOURLY',
        count: 3,
        byMonth: [1, 3],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1998-01-01T00:00:00.000Z', '1998-01-01T01:00:00.000Z', '1998-01-01T02:00:00.000Z']);
    });

    it('testHourlyByMonthDay', () => {
      const rule = new RRuleTemporal({
        freq: 'HOURLY',
        count: 3,
        byMonthDay: [1, 3],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-03T00:00:00.000Z', '1997-09-03T01:00:00.000Z', '1997-09-03T02:00:00.000Z']);
    });

    it('testHourlyByMonthAndMonthDay', () => {
      const rule = new RRuleTemporal({
        freq: 'HOURLY',
        count: 3,
        byMonth: [1, 3],
        byMonthDay: [5, 7],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1998-01-05T00:00:00.000Z', '1998-01-05T01:00:00.000Z', '1998-01-05T02:00:00.000Z']);
    });

    it('testHourlyByWeekDay', () => {
      const rule = new RRuleTemporal({
        freq: 'HOURLY',
        count: 3,
        byDay: ['TU', 'TH'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-02T10:00:00.000Z', '1997-09-02T11:00:00.000Z']);
    });

    it('testHourlyByNWeekDay', () => {
      const rule = new RRuleTemporal({
        freq: 'HOURLY',
        count: 3,
        byDay: ['1TU', '-1TH'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-02T10:00:00.000Z', '1997-09-02T11:00:00.000Z']);
    });

    it('testHourlyByMonthAndWeekDay', () => {
      const rule = new RRuleTemporal({
        freq: 'HOURLY',
        count: 3,
        byMonth: [1, 3],
        byDay: ['TU', 'TH'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1998-01-01T00:00:00.000Z', '1998-01-01T01:00:00.000Z', '1998-01-01T02:00:00.000Z']);
    });

    // it('testHourlyByMonthAndNWeekDay', () => {
    //   const rule = new RRuleTemporal({
    //     freq: 'HOURLY',
    //     count: 3,
    //     byMonth: [1, 3],
    //     byDay: ['1TU', '-1TH'],
    //     dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    //   });
    //   assertDates({rule}, ['1998-01-01T00:00:00.000Z', '1998-01-01T01:00:00.000Z', '1998-01-01T02:00:00.000Z']);
    // });

    it('testHourlyByMonthDayAndWeekDay', () => {
      const rule = new RRuleTemporal({
        freq: 'HOURLY',
        count: 3,
        byMonthDay: [1, 3],
        byDay: ['TU', 'TH'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1998-01-01T00:00:00.000Z', '1998-01-01T01:00:00.000Z', '1998-01-01T02:00:00.000Z']);
    });

    it('testHourlyByMonthAndMonthDayAndWeekDay', () => {
      const rule = new RRuleTemporal({
        freq: 'HOURLY',
        count: 3,
        byMonth: [1, 3],
        byMonthDay: [1, 3],
        byDay: ['TU', 'TH'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1998-01-01T00:00:00.000Z', '1998-01-01T01:00:00.000Z', '1998-01-01T02:00:00.000Z']);
    });

    it('testHourlyByYearDay', () => {
      const rule = new RRuleTemporal({
        freq: 'HOURLY',
        count: 4,
        byYearDay: [1, 100, 200, 365],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, [
        '1997-12-31T00:00:00.000Z',
        '1997-12-31T01:00:00.000Z',
        '1997-12-31T02:00:00.000Z',
        '1997-12-31T03:00:00.000Z',
      ]);
    });

    it('testHourlyByYearDayNeg', () => {
      const rule = new RRuleTemporal({
        freq: 'HOURLY',
        count: 4,
        byYearDay: [-365, -266, -166, -1],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, [
        '1997-12-31T00:00:00.000Z',
        '1997-12-31T01:00:00.000Z',
        '1997-12-31T02:00:00.000Z',
        '1997-12-31T03:00:00.000Z',
      ]);
    });

    it('testHourlyByMonthAndYearDay', () => {
      const rule = new RRuleTemporal({
        freq: 'HOURLY',
        count: 4,
        byMonth: [4, 7],
        byYearDay: [1, 100, 200, 365],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, [
        '1998-04-10T00:00:00.000Z',
        '1998-04-10T01:00:00.000Z',
        '1998-04-10T02:00:00.000Z',
        '1998-04-10T03:00:00.000Z',
      ]);
    });

    it('testHourlyByMonthAndYearDayNeg', () => {
      const rule = new RRuleTemporal({
        freq: 'HOURLY',
        count: 4,
        byMonth: [4, 7],
        byYearDay: [-365, -266, -166, -1],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, [
        '1998-04-10T00:00:00.000Z',
        '1998-04-10T01:00:00.000Z',
        '1998-04-10T02:00:00.000Z',
        '1998-04-10T03:00:00.000Z',
      ]);
    });

    // it('testHourlyByWeekNo', () => {
    //   const rule = new RRuleTemporal({
    //     freq: 'HOURLY',
    //     count: 3,
    //     byWeekNo: [20],
    //     dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    //   });
    //   assertDates({rule}, ['1998-05-11T00:00:00.000Z', '1998-05-11T01:00:00.000Z', '1998-05-11T02:00:00.000Z']);
    // });

    it.skip('testHourlyByWeekNoAndWeekDay', () => {
      const rule = new RRuleTemporal({
        freq: 'HOURLY',
        count: 3,
        byWeekNo: [1],
        byDay: ['MO'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-12-29T00:00:00.000Z', '1997-12-29T01:00:00.000Z', '1997-12-29T02:00:00.000Z']);
    });

    it('testHourlyByWeekNoAndWeekDayLarge', () => {
      const rule = new RRuleTemporal({
        freq: 'HOURLY',
        count: 3,
        byWeekNo: [52],
        byDay: ['SU'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-12-28T00:00:00.000Z', '1997-12-28T01:00:00.000Z', '1997-12-28T02:00:00.000Z']);
    });

    it.skip('testHourlyByWeekNoAndWeekDayLast', () => {
      const rule = new RRuleTemporal({
        freq: 'HOURLY',
        count: 3,
        byWeekNo: [-1],
        byDay: ['SU'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-12-28T00:00:00.000Z', '1997-12-28T01:00:00.000Z', '1997-12-28T02:00:00.000Z']);
    });

    it.skip('testHourlyByWeekNoAndWeekDay53', () => {
      const rule = new RRuleTemporal({
        freq: 'HOURLY',
        count: 3,
        byWeekNo: [53],
        byDay: ['MO'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1998-12-28T00:00:00.000Z', '1998-12-28T01:00:00.000Z', '1998-12-28T02:00:00.000Z']);
    });

    it.skip('testHourlyByHour', () => {
      const rule = new RRuleTemporal({
        freq: 'HOURLY',
        count: 3,
        byHour: [6, 18],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T18:00:00.000Z', '1997-09-03T06:00:00.000Z', '1997-09-03T18:00:00.000Z']);
    });

    it('testHourlyByMinute', () => {
      const rule = new RRuleTemporal({
        freq: 'HOURLY',
        count: 3,
        byMinute: [6, 18],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T09:06:00.000Z', '1997-09-02T09:18:00.000Z', '1997-09-02T10:06:00.000Z']);
    });
    /*
        it('testHourlyBySecond', () => {
          const rule = new RRuleTemporal({
            freq: 'HOURLY',
            count: 3,
            bySecond: [6, 18],
            dtstart: zdt(1997, 9, 2, 9, 'UTC'),
          });
          assertDates({rule}, ['1997-09-02T09:00:06.000Z', '1997-09-02T09:00:18.000Z', '1997-09-02T10:00:06.000Z']);
        });

        it('testHourlyByHourAndMinute', () => {
          const rule = new RRuleTemporal({
            freq: 'HOURLY',
            count: 3,
            byHour: [6, 18],
            byMinute: [6, 18],
            dtstart: zdt(1997, 9, 2, 9, 'UTC'),
          });
          assertDates({rule}, ['1997-09-02T18:06:00.000Z', '1997-09-02T18:18:00.000Z', '1997-09-03T06:06:00.000Z']);
        });

        it('testHourlyByHourAndSecond', () => {
          const rule = new RRuleTemporal({
            freq: 'HOURLY',
            count: 3,
            byHour: [6, 18],
            bySecond: [6, 18],
            dtstart: zdt(1997, 9, 2, 9, 'UTC'),
          });
          assertDates({rule}, ['1997-09-02T18:00:06.000Z', '1997-09-02T18:00:18.000Z', '1997-09-03T06:00:06.000Z']);
        });

        it('testHourlyByMinuteAndSecond', () => {
          const rule = new RRuleTemporal({
            freq: 'HOURLY',
            count: 3,
            byMinute: [6, 18],
            bySecond: [6, 18],
            dtstart: zdt(1997, 9, 2, 9, 'UTC'),
          });
          assertDates({rule}, ['1997-09-02T09:06:06.000Z', '1997-09-02T09:06:18.000Z', '1997-09-02T09:18:06.000Z']);
        });

        it('testHourlyByHourAndMinuteAndSecond', () => {
          const rule = new RRuleTemporal({
            freq: 'HOURLY',
            count: 3,
            byHour: [6, 18],
            byMinute: [6, 18],
            bySecond: [6, 18],
            dtstart: zdt(1997, 9, 2, 9, 'UTC'),
          });
          assertDates({rule}, ['1997-09-02T18:06:06.000Z', '1997-09-02T18:06:18.000Z', '1997-09-02T18:18:06.000Z']);
        });

        it('testHourlyBySetPos', () => {
          const rule = new RRuleTemporal({
            freq: 'HOURLY',
            count: 3,
            byMinute: [15, 45],
            bySecond: [15, 45],
            bySetPos: [3, -3],
            dtstart: zdt(1997, 9, 2, 9, 'UTC'),
          });
          assertDates({rule}, ['1997-09-02T09:15:45.000Z', '1997-09-02T09:45:15.000Z', '1997-09-02T10:15:45.000Z']);
        });
      });

      describe('Minutely frequency tests', () => {
        it('testMinutely', () => {
          const rule = new RRuleTemporal({
            freq: 'MINUTELY',
            count: 3,
            dtstart: zdt(1997, 9, 2, 9, 'UTC'),
          });
          assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-02T09:01:00.000Z', '1997-09-02T09:02:00.000Z']);
        });

        it('testMinutelyInterval', () => {
          const rule = new RRuleTemporal({
            freq: 'MINUTELY',
            count: 3,
            interval: 2,
            dtstart: zdt(1997, 9, 2, 9, 'UTC'),
          });
          assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-02T09:02:00.000Z', '1997-09-02T09:04:00.000Z']);
        });

        it('testMinutelyIntervalLarge', () => {
          const rule = new RRuleTemporal({
            freq: 'MINUTELY',
            count: 3,
            interval: 1501,
            dtstart: zdt(1997, 9, 2, 9, 'UTC'),
          });
          assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-03T10:01:00.000Z', '1997-09-04T11:02:00.000Z']);
        });

        it('testMinutelyByMonth', () => {
          const rule = new RRuleTemporal({
            freq: 'MINUTELY',
            count: 3,
            byMonth: [1, 3],
            dtstart: zdt(1997, 9, 2, 9, 'UTC'),
          });
          assertDates({rule}, ['1998-01-01T00:00:00.000Z', '1998-01-01T00:01:00.000Z', '1998-01-01T00:02:00.000Z']);
        });

        it('testMinutelyByMonthDay', () => {
          const rule = new RRuleTemporal({
            freq: 'MINUTELY',
            count: 3,
            byMonthDay: [1, 3],
            dtstart: zdt(1997, 9, 2, 9, 'UTC'),
          });
          assertDates({rule}, ['1997-09-03T00:00:00.000Z', '1997-09-03T00:01:00.000Z', '1997-09-03T00:02:00.000Z']);
        });

        it('testMinutelyByMonthAndMonthDay', () => {
          const rule = new RRuleTemporal({
            freq: 'MINUTELY',
            count: 3,
            byMonth: [1, 3],
            byMonthDay: [5, 7],
            dtstart: zdt(1997, 9, 2, 9, 'UTC'),
          });
          assertDates({rule}, ['1998-01-05T00:00:00.000Z', '1998-01-05T00:01:00.000Z', '1998-01-05T00:02:00.000Z']);
        });

        it('testMinutelyByWeekDay', () => {
          const rule = new RRuleTemporal({
            freq: 'MINUTELY',
            count: 3,
            byDay: ['TU', 'TH'],
            dtstart: zdt(1997, 9, 2, 9, 'UTC'),
          });
          assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-02T09:01:00.000Z', '1997-09-02T09:02:00.000Z']);
        });

        it('testMinutelyByNWeekDay', () => {
          const rule = new RRuleTemporal({
            freq: 'MINUTELY',
            count: 3,
            byDay: ['1TU', '-1TH'],
            dtstart: zdt(1997, 9, 2, 9, 'UTC'),
          });
          assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-02T09:01:00.000Z', '1997-09-02T09:02:00.000Z']);
        });

        it('testMinutelyByMonthAndWeekDay', () => {
          const rule = new RRuleTemporal({
            freq: 'MINUTELY',
            count: 3,
            byMonth: [1, 3],
            byDay: ['TU', 'TH'],
            dtstart: zdt(1997, 9, 2, 9, 'UTC'),
          });
          assertDates({rule}, ['1998-01-01T00:00:00.000Z', '1998-01-01T00:01:00.000Z', '1998-01-01T00:02:00.000Z']);
        });

        it('testMinutelyByMonthAndNWeekDay', () => {
          const rule = new RRuleTemporal({
            freq: 'MINUTELY',
            count: 3,
            byMonth: [1, 3],
            byDay: ['1TU', '-1TH'],
            dtstart: zdt(1997, 9, 2, 9, 'UTC'),
          });
          assertDates({rule}, ['1998-01-01T00:00:00.000Z', '1998-01-01T00:01:00.000Z', '1998-01-01T00:02:00.000Z']);
        });

        it('testMinutelyByMonthDayAndWeekDay', () => {
          const rule = new RRuleTemporal({
            freq: 'MINUTELY',
            count: 3,
            byMonthDay: [1, 3],
            byDay: ['TU', 'TH'],
            dtstart: zdt(1997, 9, 2, 9, 'UTC'),
          });
          assertDates({rule}, ['1998-01-01T00:00:00.000Z', '1998-01-01T00:01:00.000Z', '1998-01-01T00:02:00.000Z']);
        });

        it('testMinutelyByMonthAndMonthDayAndWeekDay', () => {
          const rule = new RRuleTemporal({
            freq: 'MINUTELY',
            count: 3,
            byMonth: [1, 3],
            byMonthDay: [1, 3],
            byDay: ['TU', 'TH'],
            dtstart: zdt(1997, 9, 2, 9, 'UTC'),
          });
          assertDates({rule}, ['1998-01-01T00:00:00.000Z', '1998-01-01T00:01:00.000Z', '1998-01-01T00:02:00.000Z']);
        });

        it('testMinutelyByYearDay', () => {
          const rule = new RRuleTemporal({
            freq: 'MINUTELY',
            count: 4,
            byYearDay: [1, 100, 200, 365],
            dtstart: zdt(1997, 9, 2, 9, 'UTC'),
          });
          assertDates({rule}, [
            '1997-12-31T00:00:00.000Z',
            '1997-12-31T00:01:00.000Z',
            '1997-12-31T00:02:00.000Z',
            '1997-12-31T00:03:00.000Z',
          ]);
        });

        it('testMinutelyByYearDayNeg', () => {
          const rule = new RRuleTemporal({
            freq: 'MINUTELY',
            count: 4,
            byYearDay: [-365, -266, -166, -1],
            dtstart: zdt(1997, 9, 2, 9, 'UTC'),
          });
          assertDates({rule}, [
            '1997-12-31T00:00:00.000Z',
            '1997-12-31T00:01:00.000Z',
            '1997-12-31T00:02:00.000Z',
            '1997-12-31T00:03:00.000Z',
          ]);
        });

        it('testMinutelyByMonthAndYearDay', () => {
          const rule = new RRuleTemporal({
            freq: 'MINUTELY',
            count: 4,
            byMonth: [4, 7],
            byYearDay: [1, 100, 200, 365],
            dtstart: zdt(1997, 9, 2, 9, 'UTC'),
          });
          assertDates({rule}, [
            '1998-04-10T00:00:00.000Z',
            '1998-04-10T00:01:00.000Z',
            '1998-04-10T00:02:00.000Z',
            '1998-04-10T00:03:00.000Z',
          ]);
        });
*/
    it.skip('testMinutelyByMonthAndYearDayNeg', () => {
      const rule = new RRuleTemporal({
        freq: 'MINUTELY',
        count: 4,
        byMonth: [4, 7],
        byYearDay: [-365, -266, -166, -1],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, [
        '1998-04-10T00:00:00.000Z',
        '1998-04-10T00:01:00.000Z',
        '1998-04-10T00:02:00.000Z',
        '1998-04-10T00:03:00.000Z',
      ]);
    });

    // it('testMinutelyByWeekNo', () => {
    //   const rule = new RRuleTemporal({
    //     freq: 'MINUTELY',
    //     count: 3,
    //     byWeekNo: [20],
    //     dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    //   });
    //   assertDates({rule}, ['1998-05-11T00:00:00.000Z', '1998-05-11T00:01:00.000Z', '1998-05-11T00:02:00.000Z']);
    // });

    it.skip('testMinutelyByWeekNoAndWeekDay', () => {
      const rule = new RRuleTemporal({
        freq: 'MINUTELY',
        count: 3,
        byWeekNo: [1],
        byDay: ['MO'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-12-29T00:00:00.000Z', '1997-12-29T00:01:00.000Z', '1997-12-29T00:02:00.000Z']);
    });

    it.skip('testMinutelyByWeekNoAndWeekDayLarge', () => {
      const rule = new RRuleTemporal({
        freq: 'MINUTELY',
        count: 3,
        byWeekNo: [52],
        byDay: ['SU'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-12-28T00:00:00.000Z', '1997-12-28T00:01:00.000Z', '1997-12-28T00:02:00.000Z']);
    });

    it.skip('testMinutelyByWeekNoAndWeekDayLast', () => {
      const rule = new RRuleTemporal({
        freq: 'MINUTELY',
        count: 3,
        byWeekNo: [-1],
        byDay: ['SU'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-12-28T00:00:00.000Z', '1997-12-28T00:01:00.000Z', '1997-12-28T00:02:00.000Z']);
    });

    it.skip('testMinutelyByWeekNoAndWeekDay53', () => {
      const rule = new RRuleTemporal({
        freq: 'MINUTELY',
        count: 3,
        byWeekNo: [53],
        byDay: ['MO'],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1998-12-28T00:00:00.000Z', '1998-12-28T00:01:00.000Z', '1998-12-28T00:02:00.000Z']);
    });

    it.skip('testMinutelyByHour', () => {
      const rule = new RRuleTemporal({
        freq: 'MINUTELY',
        count: 3,
        byHour: [6, 18],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T18:00:00.000Z', '1997-09-02T18:01:00.000Z', '1997-09-02T18:02:00.000Z']);
    });

    it.skip('testMinutelyByMinute', () => {
      const rule = new RRuleTemporal({
        freq: 'MINUTELY',
        count: 3,
        byMinute: [6, 18],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T09:06:00.000Z', '1997-09-02T09:18:00.000Z', '1997-09-02T10:06:00.000Z']);
    });

    it('testMinutelyBySecond', () => {
      const rule = new RRuleTemporal({
        freq: 'MINUTELY',
        count: 3,
        bySecond: [6, 18],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T09:00:06.000Z', '1997-09-02T09:00:18.000Z', '1997-09-02T09:01:06.000Z']);
    });

    it.skip('testMinutelyByHourAndMinute', () => {
      const rule = new RRuleTemporal({
        freq: 'MINUTELY',
        count: 3,
        byHour: [6, 18],
        byMinute: [6, 18],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T18:06:00.000Z', '1997-09-02T18:18:00.000Z', '1997-09-03T06:06:00.000Z']);
    });

    it.skip('testMinutelyByHourAndSecond', () => {
      const rule = new RRuleTemporal({
        freq: 'MINUTELY',
        count: 3,
        byHour: [6, 18],
        bySecond: [6, 18],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T18:00:06.000Z', '1997-09-02T18:00:18.000Z', '1997-09-02T18:01:06.000Z']);
    });

    it('testMinutelyByMinuteAndSecond', () => {
      const rule = new RRuleTemporal({
        freq: 'MINUTELY',
        count: 3,
        byMinute: [6, 18],
        bySecond: [6, 18],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T09:06:06.000Z', '1997-09-02T09:06:18.000Z', '1997-09-02T09:18:06.000Z']);
    });

    it.skip('testMinutelyByHourAndMinuteAndSecond', () => {
      const rule = new RRuleTemporal({
        freq: 'MINUTELY',
        count: 3,
        byHour: [6, 18],
        byMinute: [6, 18],
        bySecond: [6, 18],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T18:06:06.000Z', '1997-09-02T18:06:18.000Z', '1997-09-02T18:18:06.000Z']);
    });

    it.skip('testMinutelyBySetPos', () => {
      const rule = new RRuleTemporal({
        freq: 'MINUTELY',
        count: 3,
        bySecond: [15, 30, 45],
        bySetPos: [3, -3],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T09:00:15.000Z', '1997-09-02T09:00:45.000Z', '1997-09-02T09:01:15.000Z']);
    });
  });

  describe('Secondly frequency tests', () => {
    it('testSecondly', () => {
      const rule = new RRuleTemporal({
        freq: 'SECONDLY',
        count: 3,
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-02T09:00:01.000Z', '1997-09-02T09:00:02.000Z']);
    });

    it('testSecondlyInterval', () => {
      const rule = new RRuleTemporal({
        freq: 'SECONDLY',
        count: 3,
        interval: 2,
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
      assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-02T09:00:02.000Z', '1997-09-02T09:00:04.000Z']);
    });

    // it('testSecondlyIntervalLarge', () => {
    //   const rule = new RRuleTemporal({
    //     freq: 'SECONDLY',
    //     count: 3,
    //     interval: 90061,
    //     dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    //   });
    //   assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-03T10:01:01.000Z', '1997-09-04T11:02:02.000Z']);
    // });

    // it('testSecondlyByMonth', () => {
    //   const rule = new RRuleTemporal({
    //     freq: 'SECONDLY',
    //     count: 3,
    //     byMonth: [1, 3],
    //     dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    //   });
    //   assertDates({rule}, ['1998-01-01T00:00:00.000Z', '1998-01-01T00:00:01.000Z', '1998-01-01T00:00:02.000Z']);
    // });
    //
    // it('testSecondlyByMonthDay', () => {
    //   const rule = new RRuleTemporal({
    //     freq: 'SECONDLY',
    //     count: 3,
    //     byMonthDay: [1, 3],
    //     dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    //   });
    //   assertDates({rule}, ['1997-09-03T00:00:00.000Z', '1997-09-03T00:00:01.000Z', '1997-09-03T00:00:02.000Z']);
    // });
  });
});

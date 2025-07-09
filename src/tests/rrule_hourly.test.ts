import {RRuleTemporal} from '../index';
import {assertDates, zdt} from './helpers';

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

  it('testHourlyByWeekNo', () => {
    const rule = new RRuleTemporal({
      freq: 'HOURLY',
      count: 3,
      byWeekNo: [20],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-05-11T00:00:00.000Z', '1998-05-11T01:00:00.000Z', '1998-05-11T02:00:00.000Z']);
  });

  it('testHourlyByWeekNoAndWeekDay', () => {
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

  it('testHourlyByWeekNoAndWeekDayLast', () => {
    const rule = new RRuleTemporal({
      freq: 'HOURLY',
      count: 3,
      byWeekNo: [-1],
      byDay: ['SU'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-12-28T00:00:00.000Z', '1997-12-28T01:00:00.000Z', '1997-12-28T02:00:00.000Z']);
  });

  it('testHourlyByWeekNoAndWeekDay53', () => {
    const rule = new RRuleTemporal({
      freq: 'HOURLY',
      count: 3,
      byWeekNo: [53],
      byDay: ['MO'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-12-28T00:00:00.000Z', '1998-12-28T01:00:00.000Z', '1998-12-28T02:00:00.000Z']);
  });

  it('testHourlyByHour', () => {
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

import {RRuleTemporal} from '../index';
import {assertDates, zdt} from './helpers';

describe('Weekly frequency tests', () => {
  it('testWeekly', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      count: 3,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-09T09:00:00.000Z', '1997-09-16T09:00:00.000Z']);
  });

  it('testWeeklyInterval', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      count: 3,
      interval: 2,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-16T09:00:00.000Z', '1997-09-30T09:00:00.000Z']);
  });

  it('testWeeklyIntervalLarge', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      count: 3,
      interval: 20,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1998-01-20T09:00:00.000Z', '1998-06-09T09:00:00.000Z']);
  });

  it('testWeeklyByMonth', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      count: 3,
      byMonth: [1, 3],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-01-06T09:00:00.000Z', '1998-01-13T09:00:00.000Z', '1998-01-20T09:00:00.000Z']);
  });

  it('testWeeklyByMonthDay', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      count: 3,
      byMonthDay: [1, 3],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-03T09:00:00.000Z', '1997-10-01T09:00:00.000Z', '1997-10-03T09:00:00.000Z']);
  });

  it('testWeeklyByMonthAndMonthDay', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      count: 3,
      byMonth: [1, 3],
      byMonthDay: [5, 7],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-01-05T09:00:00.000Z', '1998-01-07T09:00:00.000Z', '1998-03-05T09:00:00.000Z']);
  });

  it('testWeeklyByWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      count: 3,
      byDay: ['TU', 'TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-04T09:00:00.000Z', '1997-09-09T09:00:00.000Z']);
  });

  it('testWeeklyByNWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      count: 3,
      byDay: ['1TU', '-1TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-04T09:00:00.000Z', '1997-09-09T09:00:00.000Z']);
  });

  it('testWeeklyByMonthAndWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      count: 3,
      byMonth: [1, 3],
      byDay: ['TU', 'TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-01-01T09:00:00.000Z', '1998-01-06T09:00:00.000Z', '1998-01-08T09:00:00.000Z']);
  });

  it('testWeeklyByMonthAndNWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      count: 3,
      byMonth: [1, 3],
      byDay: ['1TU', '-1TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-01-01T09:00:00.000Z', '1998-01-06T09:00:00.000Z', '1998-01-08T09:00:00.000Z']);
  });

  it('testWeeklyByMonthDayAndWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      count: 3,
      byMonthDay: [1, 3],
      byDay: ['TU', 'TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-01-01T09:00:00.000Z', '1998-02-03T09:00:00.000Z', '1998-03-03T09:00:00.000Z']);
  });

  it('testWeeklyByMonthAndMonthDayAndWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      count: 3,
      byMonth: [1, 3],
      byMonthDay: [1, 3],
      byDay: ['TU', 'TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-01-01T09:00:00.000Z', '1998-03-03T09:00:00.000Z', '2001-03-01T09:00:00.000Z']);
  });

  it('testWeeklyByYearDay', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
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

  it('testWeeklyByYearDayNeg', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
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

  it('testWeeklyByMonthAndYearDay', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
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

  it('testWeeklyByMonthAndYearDayNeg', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
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

  it('testWeeklyByHour', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      count: 3,
      byHour: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T18:00:00.000Z', '1997-09-09T06:00:00.000Z', '1997-09-09T18:00:00.000Z']);
  });

  it('testWeeklyByMinute', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      count: 3,
      byMinute: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:06:00.000Z', '1997-09-02T09:18:00.000Z', '1997-09-09T09:06:00.000Z']);
  });

  it('testWeeklyBySecond', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      count: 3,
      bySecond: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:00:06.000Z', '1997-09-02T09:00:18.000Z', '1997-09-09T09:00:06.000Z']);
  });

  it('testWeeklyByHourAndMinute', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      count: 3,
      byHour: [6, 18],
      byMinute: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T18:06:00.000Z', '1997-09-02T18:18:00.000Z', '1997-09-09T06:06:00.000Z']);
  });

  it('testWeeklyByHourAndSecond', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      count: 3,
      byHour: [6, 18],
      bySecond: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T18:00:06.000Z', '1997-09-02T18:00:18.000Z', '1997-09-09T06:00:06.000Z']);
  });

  it('testWeeklyByMinuteAndSecond', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      count: 3,
      byMinute: [6, 18],
      bySecond: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:06:06.000Z', '1997-09-02T09:06:18.000Z', '1997-09-02T09:18:06.000Z']);
  });

  it('testWeeklyByHourAndMinuteAndSecond', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      count: 3,
      byHour: [6, 18],
      byMinute: [6, 18],
      bySecond: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T18:06:06.000Z', '1997-09-02T18:06:18.000Z', '1997-09-02T18:18:06.000Z']);
  });

  it('testWeeklyBySetPos', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      count: 3,
      byDay: ['TU', 'TH'],
      byHour: [6, 18],
      bySetPos: [3, -3],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T18:00:00.000Z', '1997-09-04T06:00:00.000Z', '1997-09-09T18:00:00.000Z']);
  });
});

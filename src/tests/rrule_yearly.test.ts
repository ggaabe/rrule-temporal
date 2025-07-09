import {RRuleTemporal} from '../index';
import {assertDates, zdt} from './helpers';

describe('Yearly frequency tests', () => {
  it('testYearly', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1998-09-02T09:00:00.000Z', '1999-09-02T09:00:00.000Z']);
  });

  it('testYearlyInterval', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      interval: 2,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1999-09-02T09:00:00.000Z', '2001-09-02T09:00:00.000Z']);
  });

  it('testYearlyIntervalLarge', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      interval: 100,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:00:00.000Z', '2097-09-02T09:00:00.000Z', '2197-09-02T09:00:00.000Z']);
  });

  it('testYearlyByMonth', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byMonth: [1, 3],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-01-02T09:00:00.000Z', '1998-03-02T09:00:00.000Z', '1999-01-02T09:00:00.000Z']);
  });

  it('testYearlyByMonthDay', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byMonthDay: [1, 3],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-03T09:00:00.000Z', '1997-10-01T09:00:00.000Z', '1997-10-03T09:00:00.000Z']);
  });

  it('testYearlyByMonthAndMonthDay', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byMonth: [1, 3],
      byMonthDay: [5, 7],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-01-05T09:00:00.000Z', '1998-01-07T09:00:00.000Z', '1998-03-05T09:00:00.000Z']);
  });

  it('testYearlyByWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byDay: ['TU', 'TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-04T09:00:00.000Z', '1997-09-09T09:00:00.000Z']);
  });

  it('testYearlyByNWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byDay: ['1TU', '-1TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-12-25T09:00:00.000Z', '1998-01-06T09:00:00.000Z', '1998-12-31T09:00:00.000Z']);
  });

  it('testYearlyByNWeekDayLarge', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byDay: ['3TU', '-3TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-12-11T09:00:00.000Z', '1998-01-20T09:00:00.000Z', '1998-12-17T09:00:00.000Z']);
  });

  it('testYearlyByMonthAndWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byMonth: [1, 3],
      byDay: ['TU', 'TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-01-01T09:00:00.000Z', '1998-01-06T09:00:00.000Z', '1998-01-08T09:00:00.000Z']);
  });

  it('testYearlyByMonthAndNWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byMonth: [1, 3],
      byDay: ['1TU', '-1TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-01-06T09:00:00.000Z', '1998-01-29T09:00:00.000Z', '1998-03-03T09:00:00.000Z']);
  });

  it('testYearlyByMonthAndNWeekDayLarge', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byMonth: [1, 3],
      byDay: ['3TU', '-3TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-01-15T09:00:00.000Z', '1998-01-20T09:00:00.000Z', '1998-03-12T09:00:00.000Z']);
  });

  it('testYearlyByMonthDayAndWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byMonthDay: [1, 3],
      byDay: ['TU', 'TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-01-01T09:00:00.000Z', '1998-02-03T09:00:00.000Z', '1998-03-03T09:00:00.000Z']);
  });

  it('testYearlyByMonthAndMonthDayAndWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byMonth: [1, 3],
      byMonthDay: [1, 3],
      byDay: ['TU', 'TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-01-01T09:00:00.000Z', '1998-03-03T09:00:00.000Z', '2001-03-01T09:00:00.000Z']);
  });

  it('testYearlyByYearDay', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
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

  it('testYearlyByYearDayNeg', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
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

  it('testYearlyByMonthAndYearDay', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 4,
      byMonth: [4, 7],
      byYearDay: [1, 100, 200, 365],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, [
      '1998-04-10T09:00:00.000Z',
      '1998-07-19T09:00:00.000Z',
      '1999-04-10T09:00:00.000Z',
      '1999-07-19T09:00:00.000Z',
    ]);
  });

  it('testYearlyByMonthAndYearDayNeg', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 4,
      byMonth: [4, 7],
      byYearDay: [-365, -266, -166, -1],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, [
      '1998-04-10T09:00:00.000Z',
      '1998-07-19T09:00:00.000Z',
      '1999-04-10T09:00:00.000Z',
      '1999-07-19T09:00:00.000Z',
    ]);
  });

  it('testYearlyByHour', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byHour: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T18:00:00.000Z', '1998-09-02T06:00:00.000Z', '1998-09-02T18:00:00.000Z']);
  });

  it('testYearlyByMinute', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byMinute: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:06:00.000Z', '1997-09-02T09:18:00.000Z', '1998-09-02T09:06:00.000Z']);
  });

  it('testYearlyBySecond', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      bySecond: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:00:06.000Z', '1997-09-02T09:00:18.000Z', '1998-09-02T09:00:06.000Z']);
  });

  it('testYearlyByHourAndMinute', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byHour: [6, 18],
      byMinute: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T18:06:00.000Z', '1997-09-02T18:18:00.000Z', '1998-09-02T06:06:00.000Z']);
  });

  it('testYearlyByHourAndSecond', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byHour: [6, 18],
      bySecond: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T18:00:06.000Z', '1997-09-02T18:00:18.000Z', '1998-09-02T06:00:06.000Z']);
  });

  it('testYearlyByMinuteAndSecond', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byMinute: [6, 18],
      bySecond: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:06:06.000Z', '1997-09-02T09:06:18.000Z', '1997-09-02T09:18:06.000Z']);
  });

  it('testYearlyByHourAndMinuteAndSecond', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byHour: [6, 18],
      byMinute: [6, 18],
      bySecond: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T18:06:06.000Z', '1997-09-02T18:06:18.000Z', '1997-09-02T18:18:06.000Z']);
  });

  it('testYearlyBySetPos', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byMonthDay: [15],
      byHour: [6, 18],
      bySetPos: [3, -3],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-11-15T18:00:00.000Z', '1998-02-15T06:00:00.000Z', '1998-11-15T18:00:00.000Z']);
  });
});

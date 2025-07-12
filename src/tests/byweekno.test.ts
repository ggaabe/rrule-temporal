import {RRuleTemporal} from '../index';
import {assertDates, zdt} from './helpers';

describe('BYWEEKNO frequency tests', () => {
  it('testYearlyByWeekNo', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 7,
      byWeekNo: [20],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, [
      '1998-05-12T09:00:00.000Z',
      '1999-05-18T09:00:00.000Z',
      '2000-05-16T09:00:00.000Z',
      '2001-05-15T09:00:00.000Z',
      '2002-05-14T09:00:00.000Z',
      '2003-05-13T09:00:00.000Z',
      '2004-05-11T09:00:00.000Z',
    ]);
  });

  it('testYearlyByWeekNoAndWeekDay', () => {
    // That's a nice one. The first days of week number one
    // may be in the last year.
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byWeekNo: [1],
      byDay: ['MO'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-12-29T09:00:00.000Z', '1999-01-04T09:00:00.000Z', '2000-01-03T09:00:00.000Z']);
  });

  it('testYearlyByWeekNoAndWeekDayLarge', () => {
    // Another nice test. The last days of week number 52/53
    // may be in the next year.
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byWeekNo: [52],
      byDay: ['SU'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-12-28T09:00:00.000Z', '1998-12-27T09:00:00.000Z', '2000-01-02T09:00:00.000Z']);
  });

  it('testYearlyByWeekNoAndWeekDayLast', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byWeekNo: [-1],
      byDay: ['SU'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-12-28T09:00:00.000Z', '1999-01-03T09:00:00.000Z', '2000-01-02T09:00:00.000Z']);
  });

  it('testYearlyByWeekNoAndWeekDay53', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byWeekNo: [53],
      byDay: ['MO'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-12-28T09:00:00.000Z', '2004-12-27T09:00:00.000Z', '2009-12-28T09:00:00.000Z']);
  });
});

// These are not defined in the RFC
describe('BYWEEKNO non-rfc frequencies', () => {
  it.skip('testMonthlyByWeekNo', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      byWeekNo: [20],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-05-12T09:00:00.000Z', '1999-05-18T09:00:00.000Z', '2000-05-16T09:00:00.000Z']);
  });

  it.skip('testMonthlyByWeekNoAndWeekDay', () => {
    // That's a nice one. The first days of week number one
    // may be in the last year.
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      byWeekNo: [1],
      byDay: ['MO'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-12-29T09:00:00.000Z', '1999-01-04T09:00:00.000Z', '2000-01-03T09:00:00.000Z']);
  });

  it.skip('testMonthlyByWeekNoAndWeekDayLarge', () => {
    // Another nice test. The last days of week number 52/53
    // may be in the next year.
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      byWeekNo: [52],
      byDay: ['SU'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-12-28T09:00:00.000Z', '1998-12-27T09:00:00.000Z', '2000-01-02T09:00:00.000Z']);
  });

  it.skip('testMonthlyByWeekNoAndWeekDayLast', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      byWeekNo: [-1],
      byDay: ['SU'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-12-28T09:00:00.000Z', '1999-01-03T09:00:00.000Z', '2000-01-02T09:00:00.000Z']);
  });

  it.skip('testMonthlyByWeekNoAndWeekDay53', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      byWeekNo: [53],
      byDay: ['MO'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-12-29T09:00:00.000Z', '1998-12-28T09:00:00.000Z', '1999-12-27T09:00:00.000Z']);
  });

  it.skip('testWeeklyByWeekNo', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      count: 3,
      byWeekNo: [20],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-05-12T09:00:00.000Z', '1999-05-18T09:00:00.000Z', '2000-05-16T09:00:00.000Z']);
  });

  it.skip('testWeeklyByWeekNoAndWeekDay', () => {
    // That's a nice one. The first days of week number one
    // may be in the last year.
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      count: 3,
      byWeekNo: [1],
      byDay: ['MO'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-12-29T09:00:00.000Z', '1999-01-04T09:00:00.000Z', '2000-01-03T09:00:00.000Z']);
  });

  it.skip('testWeeklyByWeekNoAndWeekDayLarge', () => {
    // Another nice test. The last days of week number 52/53
    // may be in the next year.
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      count: 3,
      byWeekNo: [52],
      byDay: ['SU'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-12-28T09:00:00.000Z', '1998-12-27T09:00:00.000Z', '2000-01-02T09:00:00.000Z']);
  });

  it.skip('testWeeklyByWeekNoAndWeekDayLast', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      count: 3,
      byWeekNo: [-1],
      byDay: ['SU'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-12-28T09:00:00.000Z', '1999-01-03T09:00:00.000Z', '2000-01-02T09:00:00.000Z']);
  });

  it.skip('testWeeklyByWeekNoAndWeekDay53', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      count: 3,
      byWeekNo: [53],
      byDay: ['MO'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-12-29T09:00:00.000Z', '1998-12-28T09:00:00.000Z', '1999-12-27T09:00:00.000Z']);
  });
});

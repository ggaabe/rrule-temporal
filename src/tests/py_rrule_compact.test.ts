import {RRuleTemporal} from '../index';
import {assertDates, zdt} from './helpers';

// https://github.com/dateutil/dateutil/blob/master/tests/test_rrule.py
describe('RRuleTemporal - Python compatibility tests', () => {
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

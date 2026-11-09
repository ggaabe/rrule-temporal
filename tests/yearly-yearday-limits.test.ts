import {RRuleTemporal} from '../src';

function dates(rruleString: string): string[] {
  return new RRuleTemporal({rruleString}).all().map((date) => date.toPlainDate().toString());
}

describe('YEARLY rules with BYYEARDAY or an ordinal BYDAY', () => {
  test('BYDAY limits BYYEARDAY', () => {
    // Day -2 of the year is Dec 30, and it is a Thursday only in some years.
    expect(dates('DTSTART:20271230T090000Z\nRRULE:FREQ=YEARLY;BYYEARDAY=-2;BYDAY=TH;COUNT=4')).toEqual([
      '2027-12-30',
      '2032-12-30',
      '2038-12-30',
      '2049-12-30',
    ]);

    // Day 366 only exists in leap years and has to be a Sunday as well.
    expect(dates('DTSTART:20281231T090000Z\nRRULE:FREQ=YEARLY;BYYEARDAY=366;BYDAY=SU;COUNT=3')).toEqual([
      '2028-12-31',
      '2056-12-31',
      '2084-12-31',
    ]);

    expect(
      dates('DTSTART:20250106T090000Z\nRRULE:FREQ=YEARLY;INTERVAL=2;BYYEARDAY=1,2,3,4,5,6,7;BYDAY=MO;COUNT=5'),
    ).toEqual(['2025-01-06', '2027-01-04', '2029-01-01', '2031-01-06', '2033-01-03']);
  });

  test('BYMONTHDAY limits BYYEARDAY', () => {
    // Day 60 is Mar 1 only in a common year (Feb 29 in a leap year).
    expect(dates('DTSTART:20230101T090000Z\nRRULE:FREQ=YEARLY;BYYEARDAY=1,60,100,200;BYMONTHDAY=1;COUNT=6')).toEqual([
      '2023-01-01',
      '2023-03-01',
      '2024-01-01',
      '2025-01-01',
      '2025-03-01',
      '2026-01-01',
    ]);
  });

  test('BYMONTHDAY limits an ordinal BYDAY counted over the year', () => {
    expect(dates('DTSTART:20241229T090000Z\nRRULE:FREQ=YEARLY;BYMONTHDAY=-3,-2;BYDAY=-1SU;COUNT=5')).toEqual([
      '2024-12-29',
      '2029-12-30',
      '2030-12-29',
      '2035-12-30',
      '2040-12-30',
    ]);
  });

  test('BYYEARDAY and an ordinal BYDAY have to agree instead of adding up', () => {
    // Dec 31 is the last Sunday of the year only when it is a Sunday.
    expect(dates('DTSTART:20281231T123700Z\nRRULE:FREQ=YEARLY;BYYEARDAY=366;BYDAY=-2WE,3SA,-1SU;COUNT=4')).toEqual([
      '2028-12-31',
      '2056-12-31',
      '2084-12-31',
      '2124-12-31',
    ]);
  });

  test('a weekday without an ordinal keeps meaning every such day next to an ordinal one', () => {
    expect(dates('DTSTART:20250101T090000Z\nRRULE:FREQ=YEARLY;BYDAY=MO,2TU;COUNT=5')).toEqual([
      '2025-01-06',
      '2025-01-13',
      '2025-01-14',
      '2025-01-20',
      '2025-01-27',
    ]);

    // Mondays on the 5th last day of a month, and the last Friday of the year when it is one
    expect(dates('DTSTART:20240101T090000Z\nRRULE:FREQ=YEARLY;BYDAY=MO,-1FR;BYMONTHDAY=-5;COUNT=4')).toEqual([
      '2024-05-27',
      '2024-12-27',
      '2025-01-27',
      '2025-02-24',
    ]);
  });

  test('a named zone gives the same days as UTC', () => {
    expect(
      dates('DTSTART;TZID=America/New_York:20271230T090000\nRRULE:FREQ=YEARLY;BYYEARDAY=-2;BYDAY=TH;COUNT=4'),
    ).toEqual(['2027-12-30', '2032-12-30', '2038-12-30', '2049-12-30']);
    expect(
      dates('DTSTART;TZID=Europe/Paris:20241229T090000\nRRULE:FREQ=YEARLY;BYMONTHDAY=-3,-2;BYDAY=-1SU;COUNT=5'),
    ).toEqual(['2024-12-29', '2029-12-30', '2030-12-29', '2035-12-30', '2040-12-30']);
    expect(dates('DTSTART;TZID=Europe/Paris:20250101T090000\nRRULE:FREQ=YEARLY;BYDAY=MO,2TU;COUNT=5')).toEqual([
      '2025-01-06',
      '2025-01-13',
      '2025-01-14',
      '2025-01-20',
      '2025-01-27',
    ]);
  });

  test('next(), previous() and between() follow all()', () => {
    const rule = new RRuleTemporal({
      rruleString: 'DTSTART:20271230T090000Z\nRRULE:FREQ=YEARLY;BYYEARDAY=-2;BYDAY=TH',
    });
    expect(rule.next(new Date('2027-12-31T00:00:00Z'))?.toPlainDate().toString()).toBe('2032-12-30');
    expect(rule.previous(new Date('2050-01-01T00:00:00Z'))?.toPlainDate().toString()).toBe('2049-12-30');
    expect(
      rule
        .between(new Date('2028-01-01T00:00:00Z'), new Date('2050-01-01T00:00:00Z'))
        .map((date) => date.toPlainDate().toString()),
    ).toEqual(['2032-12-30', '2038-12-30', '2049-12-30']);
  });
});

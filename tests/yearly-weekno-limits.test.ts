import {RRuleTemporal} from '../src';
import {Temporal} from '../src/temporal-impl';

describe('YEARLY rules with BYWEEKNO that take their weekday from DTSTART', () => {
  // 1 January 2025 is a Wednesday, so every occurrence is the Wednesday of week 20
  const yearly = ['2025-05-14', '2026-05-13', '2027-05-19', '2028-05-17', '2029-05-16', '2030-05-15'];
  const everyOtherYear = ['2025-05-14', '2027-05-19', '2029-05-16', '2031-05-14', '2033-05-18', '2035-05-16'];

  test.each([
    ['without an end', 'DTSTART:20250101T090000Z\nRRULE:FREQ=YEARLY;BYWEEKNO=20', yearly],
    ['with UNTIL', 'DTSTART:20250101T090000Z\nRRULE:FREQ=YEARLY;BYWEEKNO=20;UNTIL=20400101T000000Z', yearly],
    ['in a time zone', 'DTSTART;TZID=America/New_York:20250101T090000\nRRULE:FREQ=YEARLY;BYWEEKNO=20', yearly],
    ['every other year', 'DTSTART:20250101T090000Z\nRRULE:FREQ=YEARLY;INTERVAL=2;BYWEEKNO=20', everyOtherYear],
  ])('queries that start after the year of DTSTART keep that weekday, %s', (_name, rruleString, expected) => {
    const rule = new RRuleTemporal({rruleString});
    const day = (date: Temporal.ZonedDateTime | null | undefined) => date?.toPlainDate().toString() ?? null;
    const occurrences = rule.all((_date, index) => index < 6);
    expect(occurrences.map(day)).toEqual(expected);

    // The search for these starts in 2026 or later, on another weekday than DTSTART's
    const from = new Date('2026-06-01T00:00:00Z');
    const to = new Date('2030-01-01T00:00:00Z');
    const inWindow = occurrences.filter(
      (date) => date.epochMilliseconds > from.getTime() && date.epochMilliseconds < to.getTime(),
    );
    expect(inWindow.length).toBeGreaterThan(1);
    expect(day(rule.next(from))).toBe(day(inWindow[0]));
    expect(day(rule.previous(to))).toBe(day(inWindow.at(-1)));
    expect(rule.between(from, to).map(day)).toEqual(inWindow.map(day));
    for (const date of inWindow) {
      expect(rule.matches(date)).toBe(true);
      expect(rule.occursOn(date.toPlainDate())).toBe(true);
      expect(rule.occursOn(date.toPlainDate().add({days: 1}))).toBe(false);
    }
  });
});

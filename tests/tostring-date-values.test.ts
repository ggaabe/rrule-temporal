import {RRuleTemporal} from '../src';
import {Temporal} from '../src/temporal-impl';

const allDay = [
  'DTSTART;VALUE=DATE:20250101',
  'RRULE:FREQ=WEEKLY;UNTIL=20250301;BYDAY=WE',
  'RDATE;VALUE=DATE:20250110',
  'EXDATE;VALUE=DATE:20250108',
].join('\n');
const timedAtMidnight = [
  'DTSTART:20250101T000000Z',
  'RRULE:FREQ=WEEKLY;UNTIL=20250301T000000Z;BYDAY=WE',
  'RDATE:20250110T000000Z',
  'EXDATE:20250108T000000Z',
].join('\n');
const instants = (rule: RRuleTemporal) => rule.all().map((date) => date.toString());

describe('toString() of a rule with DATE values', () => {
  test.each([false, true])('keeps DTSTART, UNTIL, RDATE and EXDATE as dates (strict: %s)', (strict) => {
    expect(new RRuleTemporal({rruleString: allDay, strict}).toString()).toBe(allDay);
  });

  test.each([false, true])('leaves a rule with times at midnight UTC as date-times (strict: %s)', (strict) => {
    expect(new RRuleTemporal({rruleString: timedAtMidnight, strict}).toString()).toBe(
      [
        'DTSTART;TZID=UTC:20250101T000000',
        'RRULE:FREQ=WEEKLY;UNTIL=20250301T000000Z;BYDAY=WE',
        'RDATE:20250110T000000Z',
        'EXDATE:20250108T000000Z',
      ].join('\n'),
    );
  });

  test('a rule built from options at midnight stays a date-time rule', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 2,
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00+00:00[UTC]'),
    });
    expect(rule.toString()).toBe('DTSTART;TZID=UTC:20250101T000000\nRRULE:FREQ=DAILY;COUNT=2');
  });

  test('a date-only DTSTART without VALUE=DATE is written with it', () => {
    expect(new RRuleTemporal({rruleString: 'DTSTART:20250101\nRRULE:FREQ=DAILY;COUNT=3'}).toString()).toBe(
      'DTSTART;VALUE=DATE:20250101\nRRULE:FREQ=DAILY;COUNT=3',
    );
  });

  test('with() keeps the dates after a selector edit', () => {
    const edited = new RRuleTemporal({rruleString: allDay}).with({byDay: ['MO', 'FR']});
    expect(edited.toString()).toBe(allDay.replace('BYDAY=WE', 'BYDAY=MO,FR'));
    // And after a second edit of the result
    expect(edited.with({interval: 2}).toString()).toBe(
      allDay.replace('FREQ=WEEKLY;UNTIL=20250301;BYDAY=WE', 'FREQ=WEEKLY;INTERVAL=2;UNTIL=20250301;BYDAY=MO,FR'),
    );
  });

  test('the written rule reads back as the same rule', () => {
    for (const tzid of [undefined, 'America/New_York', 'Pacific/Auckland']) {
      const rule = new RRuleTemporal({rruleString: allDay, tzid});
      // A DATE has no time zone, so reading it back takes the zone it was read in
      const again = new RRuleTemporal({rruleString: rule.toString(), tzid, strict: true});
      expect(rule.toString()).toBe(allDay);
      expect(again.toString()).toBe(allDay);
      expect(instants(again)).toEqual(instants(rule));
      expect(instants(rule)).toHaveLength(9);
    }
  });

  test('a date whose day starts after midnight is still a date', () => {
    // Clocks went from 00:00 to 01:00 on 4 November 2018 in São Paulo
    const rruleString = 'DTSTART;VALUE=DATE:20181104\nRRULE:FREQ=DAILY;UNTIL=20181106\nEXDATE;VALUE=DATE:20181105';
    const rule = new RRuleTemporal({rruleString, tzid: 'America/Sao_Paulo'});
    expect(rule.all()[0]!.toString()).toBe('2018-11-04T01:00:00-02:00[America/Sao_Paulo]');
    expect(rule.toString()).toBe(rruleString);
  });

  test('an RDATE or EXDATE with a time of day keeps it on a line of its own', () => {
    const rule = new RRuleTemporal({rruleString: `${allDay}\nRDATE:20250115T120000Z\nEXDATE:20250122T093000Z`});
    expect(rule.toString()).toBe(
      [
        'DTSTART;VALUE=DATE:20250101',
        'RRULE:FREQ=WEEKLY;UNTIL=20250301;BYDAY=WE',
        'RDATE;VALUE=DATE:20250110',
        'RDATE:20250115T120000Z',
        'EXDATE;VALUE=DATE:20250108',
        'EXDATE:20250122T093000Z',
      ].join('\n'),
    );
    expect(instants(new RRuleTemporal({rruleString: rule.toString()}))).toEqual(instants(rule));
  });

  test('an RDATE or EXDATE read as a date-time at midnight stays a date-time', () => {
    const rruleString = [
      'DTSTART;VALUE=DATE:20250101',
      'RRULE:FREQ=WEEKLY;UNTIL=20250301;BYDAY=WE',
      'RDATE;VALUE=DATE:20250110',
      'RDATE:20250115T000000Z',
      'EXDATE;VALUE=DATE:20250108',
      'EXDATE:20250122T000000Z',
    ].join('\n');
    const rule = new RRuleTemporal({rruleString});
    expect(rule.toString()).toBe(rruleString);
    expect(rule.with({interval: 2}).toString()).toBe(rruleString.replace('FREQ=WEEKLY', 'FREQ=WEEKLY;INTERVAL=2'));
    expect(new RRuleTemporal({rruleString: rule.toString(), strict: true}).toString()).toBe(rruleString);

    // Midnight in the zone the rule is read in, written with VALUE=DATE-TIME
    const inNewYork = 'DTSTART;VALUE=DATE:20250101\nRRULE:FREQ=DAILY;COUNT=2\nRDATE;VALUE=DATE-TIME:20250115T050000Z';
    expect(new RRuleTemporal({rruleString: inNewYork, tzid: 'America/New_York'}).toString()).toBe(
      inNewYork.replace(';VALUE=DATE-TIME', ''),
    );

    // options() has no value type per date, so a rule rebuilt from them goes by the time of day
    expect(new RRuleTemporal(rule.options()).toString()).toBe(
      [
        'DTSTART;VALUE=DATE:20250101',
        'RRULE:FREQ=WEEKLY;UNTIL=20250301;BYDAY=WE',
        'RDATE;VALUE=DATE:20250110,20250115',
        'EXDATE;VALUE=DATE:20250108,20250122',
      ].join('\n'),
    );
  });

  test('dates added through with() are written as dates when they start a day', () => {
    const rule = new RRuleTemporal({rruleString: 'DTSTART;VALUE=DATE:20250101\nRRULE:FREQ=DAILY;COUNT=5'});
    const edited = rule.with({
      exDate: [Temporal.ZonedDateTime.from('2025-01-03T00:00:00+00:00[UTC]')],
      rDate: [Temporal.ZonedDateTime.from('2025-01-20T15:30:00+00:00[UTC]')],
    });
    expect(edited.toString()).toBe(
      'DTSTART;VALUE=DATE:20250101\nRRULE:FREQ=DAILY;COUNT=5\nRDATE:20250120T153000Z\nEXDATE;VALUE=DATE:20250103',
    );
  });

  test('UNTIL is written as the date it falls on', () => {
    const rule = new RRuleTemporal({rruleString: allDay});
    const edited = rule.with({until: Temporal.ZonedDateTime.from('2025-02-05T15:00:00+00:00[UTC]')});
    expect(edited.toString()).toBe(allDay.replace('UNTIL=20250301', 'UNTIL=20250205'));
    // The same occurrences either way: they are all at the start of a day
    expect(instants(new RRuleTemporal({rruleString: edited.toString()}))).toEqual(instants(edited));
  });

  test('a new dtstart with a time of day makes it a date-time rule', () => {
    const rule = new RRuleTemporal({rruleString: allDay});
    const edited = rule.with({dtstart: Temporal.ZonedDateTime.from('2025-01-01T09:30:00+00:00[UTC]')});
    expect(edited.toString()).toBe(
      [
        'DTSTART;TZID=UTC:20250101T093000',
        'RRULE:FREQ=WEEKLY;UNTIL=20250301T000000Z;BYDAY=WE',
        'RDATE:20250110T000000Z',
        'EXDATE:20250108T000000Z',
      ].join('\n'),
    );
    // A new dtstart on another day keeps the dates
    const moved = rule.with({dtstart: Temporal.ZonedDateTime.from('2025-01-08T00:00:00+00:00[UTC]')});
    expect(moved.toString()).toBe(allDay.replace('DTSTART;VALUE=DATE:20250101', 'DTSTART;VALUE=DATE:20250108'));
  });

  test('options() says which rule has DATE values, and only that', () => {
    const fromDates = new RRuleTemporal({rruleString: allDay}).options();
    const fromTimes = new RRuleTemporal({rruleString: timedAtMidnight}).options();
    expect(fromDates.allDay).toBe(true);
    expect('allDay' in fromTimes).toBe(false);
    expect(Object.keys(fromDates).sort()).toEqual([...Object.keys(fromTimes), 'allDay'].sort());
    expect(fromDates.dtstart.toString()).toBe(fromTimes.dtstart.toString());
    expect(fromDates.until?.toString()).toBe(fromTimes.until?.toString());
  });
});

describe('the allDay option', () => {
  const midnight = Temporal.ZonedDateTime.from('2025-01-01T00:00:00+00:00[UTC]');

  test('a rule rebuilt from its options keeps its DATE values', () => {
    const rule = new RRuleTemporal({rruleString: allDay});
    const rebuilt = new RRuleTemporal(rule.options());
    expect(rebuilt.toString()).toBe(allDay);
    expect(instants(rebuilt)).toEqual(instants(rule));
  });

  test('a rule built from options is written with DATE values', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      byDay: ['WE'],
      dtstart: midnight,
      until: Temporal.ZonedDateTime.from('2025-03-01T00:00:00+00:00[UTC]'),
      rDate: [Temporal.ZonedDateTime.from('2025-01-10T00:00:00+00:00[UTC]')],
      exDate: [Temporal.ZonedDateTime.from('2025-01-08T00:00:00+00:00[UTC]')],
      allDay: true,
    });
    expect(rule.toString()).toBe(allDay);
    expect(rule.options().allDay).toBe(true);
    // The same occurrences as without it
    expect(instants(rule)).toEqual(instants(new RRuleTemporal({...rule.options(), allDay: false})));
  });

  test('the day is the one in the time zone of the rule', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 2,
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00-05:00[America/New_York]'),
      rDate: [Temporal.ZonedDateTime.from('2025-01-10T05:00:00+00:00[UTC]')],
      allDay: true,
    });
    expect(rule.toString()).toBe('DTSTART;VALUE=DATE:20250101\nRRULE:FREQ=DAILY;COUNT=2\nRDATE;VALUE=DATE:20250110');
  });

  test('it has no effect on a dtstart with a time of day', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 2,
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T09:30:00+00:00[UTC]'),
      allDay: true,
    });
    expect(rule.toString()).toBe('DTSTART;TZID=UTC:20250101T093000\nRRULE:FREQ=DAILY;COUNT=2');
  });

  test('with() turns it on and off', () => {
    const timed = new RRuleTemporal({rruleString: timedAtMidnight});
    expect(timed.with({allDay: true}).toString()).toBe(allDay);

    const dates = new RRuleTemporal({rruleString: allDay});
    expect(dates.with({allDay: false}).toString()).toBe(timed.toString());
    expect(dates.with({allDay: false}).options().allDay).toBe(false);
  });

  test('a new dtstart with a time of day turns it off', () => {
    const rule = new RRuleTemporal({rruleString: allDay});
    const timed = rule.with({dtstart: Temporal.ZonedDateTime.from('2025-01-01T09:30:00+00:00[UTC]')});
    expect('allDay' in timed.options()).toBe(false);
    // Another day keeps it
    expect(rule.with({dtstart: midnight.add({days: 7})}).options().allDay).toBe(true);
  });

  test('it goes with an rruleString too', () => {
    // A DTSTART given beside the rule
    expect(new RRuleTemporal({rruleString: 'FREQ=DAILY;COUNT=2', dtstart: midnight, allDay: true}).toString()).toBe(
      'DTSTART;VALUE=DATE:20250101\nRRULE:FREQ=DAILY;COUNT=2',
    );
    // A DATE in the string that the caller wants written with times
    const timed = new RRuleTemporal({rruleString: allDay, allDay: false});
    expect(timed.toString()).toBe(new RRuleTemporal({rruleString: timedAtMidnight}).toString());
    expect(instants(timed)).toEqual(instants(new RRuleTemporal({rruleString: allDay})));
  });
});

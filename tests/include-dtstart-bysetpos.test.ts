import {RRuleTemporal} from '../src';
import {Temporal} from '../src/temporal-impl';

// includeDtstart adds DTSTART when the rule does not generate it. BYSETPOS can
// skip a DTSTART that every BYxxx filter accepts, as a last-Friday rule skips
// any other Friday, so that DTSTART must still be added and counted (#150).
const rule = (dtstart: string, rrule: string, includeDtstart = true) =>
  new RRuleTemporal({
    rruleString: `DTSTART;TZID=Australia/Sydney:${dtstart}\nRRULE:${rrule}`,
    includeDtstart,
  });
const dates = (values: Temporal.ZonedDateTime[]) => values.map((value) => value.toString().slice(0, 10));

describe('includeDtstart with BYSETPOS', () => {
  it.each([
    ['FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1;COUNT=4', ['2026-10-09', '2026-10-30', '2026-11-27', '2026-12-25']],
    ['FREQ=MONTHLY;BYDAY=FR;BYSETPOS=1;COUNT=3', ['2026-10-09', '2026-11-06', '2026-12-04']],
    ['FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-2;COUNT=3', ['2026-10-09', '2026-10-29', '2026-11-27']],
    ['FREQ=YEARLY;BYMONTH=10;BYDAY=FR;BYSETPOS=-1;COUNT=3', ['2026-10-09', '2026-10-30', '2027-10-29']],
  ])('adds a DTSTART that %s skips', (rrule, expected) => {
    expect(dates(rule('20261009T090000', rrule).all())).toEqual(expected);
  });

  it('does not repeat a DTSTART that BYSETPOS selects', () => {
    const selected = rule('20261030T090000', 'FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1;COUNT=3');
    expect(dates(selected.all())).toEqual(['2026-10-30', '2026-11-27', '2026-12-25']);
  });

  it('answers every query with the added DTSTART', () => {
    const lastFriday = rule('20261009T090000', 'FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1');
    const dtstart = lastFriday.options().dtstart;
    const first = '2026-10-09T09:00:00+11:00[Australia/Sydney]';
    expect(String(lastFriday.next(dtstart.subtract({days: 1})))).toBe(first);
    expect(String(lastFriday.previous(dtstart.add({days: 10})))).toBe(first);
    expect(lastFriday.between(dtstart.subtract({days: 1}), dtstart.add({days: 30})).map(String)).toEqual([
      first,
      '2026-10-30T09:00:00+11:00[Australia/Sydney]',
    ]);
    expect(lastFriday.matches(dtstart)).toBe(true);
    expect(lastFriday.occursOn(dtstart.toPlainDate())).toBe(true);
    expect(dates(lastFriday.all((_, index) => index < 2))).toEqual(['2026-10-09', '2026-10-30']);
  });

  // Every generation path: DTSTART precedes the rule's own occurrences and
  // counts toward COUNT, unless the rule already starts with it.
  const shapes = [
    'FREQ=YEARLY;BYMONTH=1,10;BYDAY=FR;BYSETPOS=1,-1',
    'FREQ=MONTHLY;BYDAY=FR;BYSETPOS=2,-1',
    'FREQ=MONTHLY;BYMONTHDAY=1,9,15,31;BYSETPOS=-1',
    'FREQ=MONTHLY;BYDAY=FR;BYHOUR=9,17;BYSETPOS=-1',
    'FREQ=WEEKLY;BYDAY=MO,WE,FR;BYSETPOS=-1',
    'FREQ=DAILY;BYHOUR=9,17;BYSETPOS=-1',
    'FREQ=HOURLY;BYMINUTE=0,30;BYSETPOS=-1',
  ];
  describe.each(['UTC', 'America/Chicago'])('%s', (zone) => {
    it.each(shapes.flatMap((shape) => ['20261009T090000', '20261030T090000'].map((start) => [shape, start])))(
      'adds DTSTART to %s from %s only when the rule skips it',
      (shape, start) => {
        const text = `DTSTART;TZID=${zone}:${start}\nRRULE:${shape};COUNT=5`;
        const plain = new RRuleTemporal({rruleString: text}).all();
        const included = new RRuleTemporal({rruleString: text, includeDtstart: true});
        const dtstart = included.options().dtstart;
        const generated = plain[0]?.epochNanoseconds === dtstart.epochNanoseconds;
        const expected = (generated ? plain : [dtstart, ...plain]).slice(0, 5).map(String);
        expect(included.all().map(String)).toEqual(expected);
        expect(String(included.next(dtstart.subtract({seconds: 1})))).toBe(expected[0]);
        expect(included.matches(dtstart)).toBe(true);
      },
    );
  });
});

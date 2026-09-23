import {RRuleTemporal} from '../src';
import {Temporal} from '../src/temporal-impl';

const dates = (values: Array<{toString(): string}>) => values.map(String);

describe('BYSETPOS on numeric fast paths', () => {
  it.each(['UTC', 'America/Chicago'])(
    'emits a candidate selected by two positions once and counts it once (%s)',
    (zone) => {
      const rruleString = `DTSTART;TZID=${zone}:20260101T090000\nRRULE:FREQ=MONTHLY;BYMONTHDAY=1,2,3;BYSETPOS=1,-3;COUNT=4`;
      const rule = new RRuleTemporal({rruleString, cache: false});
      const expected = ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01'].map((day) =>
        Temporal.ZonedDateTime.from(`${day}T09:00:00[${zone}]`).toString(),
      );
      expect(dates(rule.all())).toEqual(expected);
      expect(dates(rule.all(() => true))).toEqual(expected);
      const after = Temporal.ZonedDateTime.from(`2026-01-01T09:00:00[${zone}]`);
      expect(String(rule.next(after))).toBe(expected[1]);
      expect(dates(rule.between(after, after.add({months: 3}), true))).toEqual(expected);

      const unbounded = new RRuleTemporal({rruleString: rruleString.replace(';COUNT=4', '')});
      expect(String(unbounded.next(after))).toBe(expected[1]);
      expect(dates(unbounded.between(after, after.add({months: 3}), true))).toEqual(expected);
    },
  );

  describe('omits a skipped candidate before ranking', () => {
    // US DST starts on 2026-03-08, the second Sunday, so 02:00 does not exist
    // then: the third Sunday at 02:00 that exists is March 22, not March 15.
    const rruleString = 'DTSTART;TZID=America/Chicago:20260101T090000\nRRULE:FREQ=MONTHLY;BYDAY=SU;BYSETPOS=3;BYHOUR=2';
    const march = '2026-03-22T02:00:00-05:00[America/Chicago]';

    it('in generation', () => {
      const rule = new RRuleTemporal({rruleString: `${rruleString};COUNT=6`, cache: false});
      expect(dates(rule.all())[2]).toBe(march);
      expect(dates(rule.all())).toEqual(dates(rule.all(() => true)));
    });

    it('in queries on rules without COUNT', () => {
      const rule = new RRuleTemporal({rruleString});
      const target = Temporal.ZonedDateTime.from('2026-03-01T00:00:00[America/Chicago]');
      expect(String(rule.next(target))).toBe(march);
      expect(String(rule.previous(target.add({days: 22})))).toBe(march);
      expect(dates(rule.between(target, target.add({days: 30})))).toEqual([march]);
      expect(rule.matches(Temporal.ZonedDateTime.from('2026-03-15T02:00:00-05:00[America/Chicago]'))).toBe(false);
    });
  });
});

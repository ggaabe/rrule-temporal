import {RRuleTemporal} from '../src';
import {Temporal} from '../src/temporal-impl';

// previous() reaches its answer by scanning forward from a phase-aligned dtstart near the
// target rather than from DTSTART, so the occurrences in between are never generated. An RDATE
// is an absolute instant, and used to be flushed into that same scan, which left previous()
// answering with an RDATE in place of the rule occurrence the aligned scan had skipped.

const iso = (value: {epochMilliseconds: number} | null) =>
  value === null ? null : new Date(value.epochMilliseconds).toISOString();

/** Walks previous() backwards from `until` down to `after`, the way a caller paging a range does. */
function walkBack(rule: RRuleTemporal, after: Date, until: Date): (string | null)[] {
  const out: (string | null)[] = [];
  let cursor: Date | Temporal.ZonedDateTime = until;
  let inclusive = true;

  for (let i = 0; i < 200; i++) {
    const occurrence = rule.previous(cursor, inclusive) as {epochMilliseconds: number} | null;
    if (occurrence === null || occurrence.epochMilliseconds <= after.getTime()) break;
    out.push(iso(occurrence));
    cursor = new Date(occurrence.epochMilliseconds);
    inclusive = false;
  }

  return out.reverse();
}

const forward = (rule: RRuleTemporal, after: Date, until: Date) =>
  rule.between(after, new Date(until.getTime() + 1)).map((o) => iso(o as {epochMilliseconds: number}));

const AFTER = new Date('2026-09-09T08:00:00Z');
const UNTIL = new Date('2026-09-09T12:00:00Z');
const BASE = 'DTSTART:20260909T000000Z\nRRULE:FREQ=HOURLY';

describe('previous() with RDATE', () => {
  const cases: [string, string][] = [
    ['no RDATE', BASE],
    ['an RDATE inside the range', `${BASE}\nRDATE:20260909T103012Z`],
    ['an RDATE on a minute boundary', `${BASE}\nRDATE:20260909T103000Z`],
    ['two RDATEs inside the range', `${BASE}\nRDATE:20260909T093000Z,20260909T103000Z`],
    ['an RDATE after the last occurrence', `${BASE}\nRDATE:20260909T115959Z`],
    ['an RDATE before the range', `${BASE}\nRDATE:20260909T073000Z`],
    ['an EXDATE and no RDATE', `${BASE}\nEXDATE:20260909T100000Z`],
    ['an RDATE and an EXDATE', `${BASE}\nRDATE:20260909T103012Z\nEXDATE:20260909T100000Z`],
  ];

  it.each(cases)('walks the same occurrences backwards as between() does forwards: %s', (_label, rruleString) => {
    const rule = new RRuleTemporal({rruleString, tzid: 'UTC'});

    expect(walkBack(rule, AFTER, UNTIL)).toEqual(forward(rule, AFTER, UNTIL));
  });

  it('answers with the rule occurrence rather than an earlier RDATE', () => {
    const rule = new RRuleTemporal({rruleString: `${BASE}\nRDATE:20260909T103012Z`, tzid: 'UTC'});

    // 11:00 is the rule's own occurrence below 12:00; 10:30:12 is the RDATE below that.
    expect(iso(rule.previous(UNTIL, false) as {epochMilliseconds: number})).toBe('2026-09-09T11:00:00.000Z');
    expect(iso(rule.previous(new Date('2026-09-09T11:00:00Z'), false) as {epochMilliseconds: number})).toBe(
      '2026-09-09T10:30:12.000Z',
    );
  });

  it('still answers with an RDATE when it is the latest occurrence', () => {
    const rule = new RRuleTemporal({rruleString: `${BASE}\nRDATE:20260909T113000Z`, tzid: 'UTC'});

    expect(iso(rule.previous(new Date('2026-09-09T11:45:00Z'), false) as {epochMilliseconds: number})).toBe(
      '2026-09-09T11:30:00.000Z',
    );
  });

  it('honors inc on an RDATE that lands exactly on the target', () => {
    const rule = new RRuleTemporal({rruleString: `${BASE}\nRDATE:20260909T113000Z`, tzid: 'UTC'});
    const target = new Date('2026-09-09T11:30:00Z');

    expect(iso(rule.previous(target, true) as {epochMilliseconds: number})).toBe('2026-09-09T11:30:00.000Z');
    expect(iso(rule.previous(target, false) as {epochMilliseconds: number})).toBe('2026-09-09T11:00:00.000Z');
  });

  it('returns an RDATE that precedes DTSTART when the rule has nothing earlier', () => {
    const rule = new RRuleTemporal({rruleString: `${BASE}\nRDATE:20260908T235000Z`, tzid: 'UTC'});

    expect(iso(rule.previous(new Date('2026-09-09T00:00:00Z'), false) as {epochMilliseconds: number})).toBe(
      '2026-09-08T23:50:00.000Z',
    );
  });
});

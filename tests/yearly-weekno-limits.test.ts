import {RRuleTemporal} from '../src';
import {Temporal} from '../src/temporal-impl';

const dates = (rruleString: string, options: {strict?: boolean} = {}) =>
  new RRuleTemporal({rruleString, ...options}).all().map((date) => date.toPlainDate().toString());
const from2025 = (rule: string, options: {strict?: boolean} = {}) =>
  dates(`DTSTART:20250101T090000Z\nRRULE:${rule}`, options);

describe('YEARLY rules with BYWEEKNO next to BYMONTHDAY or BYYEARDAY', () => {
  test('BYMONTHDAY limits the days of the numbered week', () => {
    // The 15th in the years it falls in week 20, whatever its weekday
    expect(from2025('FREQ=YEARLY;BYWEEKNO=20;BYMONTHDAY=15;COUNT=4')).toEqual([
      '2025-05-15',
      '2026-05-15',
      '2028-05-15',
      '2029-05-15',
    ]);
    expect(from2025('FREQ=YEARLY;BYWEEKNO=20;BYDAY=TH;BYMONTHDAY=15;COUNT=4')).toEqual([
      '2025-05-15',
      '2031-05-15',
      '2036-05-15',
      '2042-05-15',
    ]);
    expect(from2025('FREQ=YEARLY;BYWEEKNO=20;BYMONTH=5;BYMONTHDAY=15;COUNT=3')).toEqual([
      '2025-05-15',
      '2026-05-15',
      '2028-05-15',
    ]);
    expect(from2025('FREQ=YEARLY;BYWEEKNO=-1;BYMONTHDAY=28;COUNT=3')).toEqual([
      '2025-12-28',
      '2026-12-28',
      '2027-12-28',
    ]);
  });

  test('BYYEARDAY limits the days of the numbered week instead of adding its own', () => {
    expect(from2025('FREQ=YEARLY;BYWEEKNO=20;BYYEARDAY=135;BYDAY=TH;COUNT=4')).toEqual([
      '2025-05-15',
      '2031-05-15',
      '2042-05-15',
      // Day 135 of a leap year
      '2048-05-14',
    ]);
    expect(from2025('FREQ=YEARLY;BYWEEKNO=20;BYYEARDAY=135;COUNT=4')).toEqual([
      '2025-05-15',
      '2026-05-15',
      '2029-05-15',
      '2030-05-15',
    ]);
    expect(dates('DTSTART:20180101T000000Z\nRRULE:FREQ=YEARLY;BYYEARDAY=-1;BYWEEKNO=1;BYDAY=MO;COUNT=3')).toEqual([
      '2018-12-31',
      '2029-12-31',
      '2035-12-31',
    ]);
  });

  test('a week that reaches into the neighboring year is limited there too', () => {
    // Week 1 can start in December and week 53 can end in January
    expect(from2025('FREQ=YEARLY;BYWEEKNO=1,53;BYMONTHDAY=31,1;COUNT=5')).toEqual([
      '2025-01-01',
      '2025-12-31',
      '2026-01-01',
      '2026-12-31',
      '2027-01-01',
    ]);
    // Day 366 of 2024 is in week 1 of 2025
    expect(dates('DTSTART:20230101T000000Z\nRRULE:FREQ=YEARLY;BYYEARDAY=366;BYWEEKNO=1;COUNT=2')).toEqual([
      '2024-12-31',
      '2036-12-31',
    ]);
  });

  test('strict mode reads these rules the same way', () => {
    for (const rule of [
      'FREQ=YEARLY;BYWEEKNO=20;BYMONTHDAY=15;COUNT=4',
      'FREQ=YEARLY;BYWEEKNO=20;BYDAY=TH;BYMONTHDAY=15;COUNT=4',
      'FREQ=YEARLY;BYWEEKNO=20;BYYEARDAY=135;BYDAY=TH;COUNT=4',
    ]) {
      expect(from2025(rule, {strict: true})).toEqual(from2025(rule));
    }
  });

  test('parts that never agree leave no occurrences', () => {
    // Week 20 is in May
    expect(from2025('FREQ=YEARLY;BYWEEKNO=20;BYMONTHDAY=1;COUNT=2')).toEqual([]);
    expect(from2025('FREQ=YEARLY;BYWEEKNO=20;BYYEARDAY=1;BYDAY=MO;COUNT=2')).toEqual([]);
    // One day a year at most, so there is never a second one for BYSETPOS
    expect(from2025('FREQ=YEARLY;BYWEEKNO=20;BYMONTHDAY=15;BYSETPOS=2;COUNT=2')).toEqual([]);

    const rule = new RRuleTemporal({
      rruleString: 'DTSTART:20250101T090000Z\nRRULE:FREQ=YEARLY;BYWEEKNO=20;BYMONTHDAY=1',
    });
    expect(rule.next(new Date('2025-01-01T00:00:00Z'))).toBeNull();
    expect(rule.between(new Date('2025-01-01T00:00:00Z'), new Date('2035-01-01T00:00:00Z'))).toEqual([]);
  });

  test('BYSETPOS and WKST apply to the limited days', () => {
    expect(from2025('FREQ=YEARLY;BYWEEKNO=20;BYMONTHDAY=12,13,14,15,16,17,18;BYSETPOS=-1;COUNT=3')).toEqual([
      '2025-05-18',
      '2026-05-17',
      '2027-05-18',
    ]);
    // With weeks from Sunday, week 20 runs from 11 to 17 May in 2025 and from 17 to 23 May in 2026
    expect(from2025('FREQ=YEARLY;WKST=SU;BYWEEKNO=20;BYMONTHDAY=11,17,18;COUNT=4')).toEqual([
      '2025-05-11',
      '2025-05-17',
      '2026-05-17',
      '2026-05-18',
    ]);
  });

  test('next(), previous(), between(), matches() and occursOn() follow all()', () => {
    const rule = new RRuleTemporal({
      rruleString:
        'DTSTART;TZID=America/New_York:20250101T090000\nRRULE:FREQ=YEARLY;BYWEEKNO=20;BYDAY=TH;BYMONTHDAY=15',
    });
    const at = (iso: string) => Temporal.ZonedDateTime.from(`${iso}[America/New_York]`);

    expect(rule.next(at('2025-05-15T09:00:00'))?.toString()).toBe('2031-05-15T09:00:00-04:00[America/New_York]');
    expect(rule.next(at('2025-05-15T09:00:00'), true)?.toString()).toBe('2025-05-15T09:00:00-04:00[America/New_York]');
    expect(rule.previous(at('2031-05-15T09:00:00'))?.toString()).toBe('2025-05-15T09:00:00-04:00[America/New_York]');
    expect(
      rule.between(at('2025-01-01T00:00:00'), at('2040-01-01T00:00:00')).map((date) => date.toPlainDate().toString()),
    ).toEqual(['2025-05-15', '2031-05-15', '2036-05-15']);
    // The Thursday of week 20 of 2026 is the 14th
    expect(rule.matches(at('2026-05-14T09:00:00'))).toBe(false);
    expect(rule.matches(at('2031-05-15T09:00:00'))).toBe(true);
    expect(rule.occursOn(Temporal.PlainDate.from('2026-05-14'))).toBe(false);
    expect(rule.occursOn(Temporal.PlainDate.from('2036-05-15'))).toBe(true);
  });

  test('BYWEEKNO without them keeps its days', () => {
    // The weekday of DTSTART, a Wednesday
    expect(from2025('FREQ=YEARLY;BYWEEKNO=20;COUNT=3')).toEqual(['2025-05-14', '2026-05-13', '2027-05-19']);
    expect(from2025('FREQ=YEARLY;BYWEEKNO=20;BYDAY=MO,FR;COUNT=4')).toEqual([
      '2025-05-12',
      '2025-05-16',
      '2026-05-11',
      '2026-05-15',
    ]);
    expect(from2025('FREQ=YEARLY;BYWEEKNO=20;BYMONTH=5;BYDAY=MO;COUNT=2')).toEqual(['2025-05-12', '2026-05-11']);
  });

  test('a WEEKLY rule with BYWEEKNO keeps the reading it had', () => {
    // BYWEEKNO is only valid with FREQ=YEARLY, and such a rule shares the YEARLY code
    expect(from2025('FREQ=WEEKLY;BYWEEKNO=20;BYMONTHDAY=15;COUNT=3')).toEqual([
      '2025-05-14',
      '2026-05-13',
      '2027-05-19',
    ]);
    expect(from2025('FREQ=WEEKLY;BYWEEKNO=20;BYYEARDAY=135;COUNT=3')).toEqual([
      '2025-05-14',
      '2025-05-15',
      '2026-05-13',
    ]);
  });
});

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

/**
 * Seeded comparison with a brute-force reading: the days of the numbered weeks of each
 * recurrence year, kept when they pass every BYxxx part present. A week belongs to the
 * year that numbers it, so week 1 can bring days of the December before. Plain integer
 * calendar arithmetic, no library code.
 */
const seed = Number(process.env.RRULE_WEEKNO_FUZZ_SEED ?? 0x161) >>> 0;
const cases = Number(process.env.RRULE_WEEKNO_FUZZ_CASES ?? 200);
const WD = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const DAY_MS = 86_400_000;
const epochDay = (year: number, month: number, day: number) => Date.UTC(year, month - 1, day) / DAY_MS;
const isoDow = (day: number) => ((((day + 3) % 7) + 7) % 7) + 1;
const isLeap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

type Rule = {
  start: {year: number; month: number; day: number; hour: number};
  interval: number;
  byWeekNo: number[];
  byMonth?: number[];
  byYearDay?: number[];
  byMonthDay?: number[];
  byDay?: string[];
  byHour?: number[];
  bySetPos?: number[];
  count?: number;
  untilMs: number;
};

/** The Monday that starts week 1 of a year: the one on or before 4 January. */
const firstWeekStart = (year: number) => {
  const jan4 = epochDay(year, 1, 4);
  return jan4 - (isoDow(jan4) - 1);
};

function reference(rule: Rule): number[] {
  const {start} = rule;
  const startDay = epochDay(start.year, start.month, start.day);
  const startMs = startDay * DAY_MS + start.hour * 3_600_000;
  const weekdays = rule.byDay
    ? rule.byDay.map((token) => WD.indexOf(token) + 1)
    : rule.byMonthDay || rule.byYearDay
      ? [1, 2, 3, 4, 5, 6, 7]
      : [isoDow(startDay)];
  const out: number[] = [];
  for (let year = start.year; epochDay(year, 1, 1) * DAY_MS <= rule.untilMs + 7 * DAY_MS; year += rule.interval) {
    const first = firstWeekStart(year);
    const weeks = (firstWeekStart(year + 1) - first) / 7;
    const numbers = new Set(rule.byWeekNo.map((n) => (n > 0 ? n : weeks + n + 1)).filter((n) => n >= 1 && n <= weeks));
    let set: number[] = [];
    for (const number of [...numbers].sort((a, b) => a - b)) {
      for (let offset = 0; offset < 7; offset++) {
        const day = first + (number - 1) * 7 + offset;
        const date = new Date(day * DAY_MS);
        const [y, month, dom] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
        const monthLength = new Date(Date.UTC(y, month, 0)).getUTCDate();
        const yearLength = isLeap(y) ? 366 : 365;
        const dayOfYear = day - epochDay(y, 1, 1) + 1;
        if (!weekdays.includes(isoDow(day))) continue;
        if (rule.byMonth && !rule.byMonth.includes(month)) continue;
        if (rule.byMonthDay && !rule.byMonthDay.some((n) => (n > 0 ? n : monthLength + n + 1) === dom)) continue;
        if (rule.byYearDay && !rule.byYearDay.some((n) => (n > 0 ? n : yearLength + n + 1) === dayOfYear)) continue;
        for (const hour of rule.byHour ?? [start.hour]) set.push(day * DAY_MS + hour * 3_600_000);
      }
    }
    if (rule.bySetPos && set.length) {
      const all = set;
      set = [...new Set(rule.bySetPos.map((p) => all[p > 0 ? p - 1 : all.length + p]!))]
        .filter((ms) => ms !== undefined)
        .sort((a, b) => a - b);
    }
    for (const ms of set) {
      if (ms < startMs || ms > rule.untilMs) continue;
      out.push(ms);
      if (out.length === rule.count) return out;
    }
  }
  return out;
}

function randomRule(random: (n: number) => number): Rule {
  const pick = <T>(values: T[]) => values[random(values.length)]!;
  const some = <T>(make: () => T, max: number) => [...new Set(Array.from({length: 1 + random(max)}, make))];
  const start = {year: 1996 + random(40), month: 1 + random(12), day: 1 + random(28), hour: random(24)};
  const rule: Rule = {
    start,
    interval: pick([1, 1, 1, 1, 2, 3, 5, 28]),
    byWeekNo: some(() => pick([1, 1, 2, 9, 20, 26, 52, 53, 53, -1, -2, -52, -53]), 3),
    untilMs: epochDay(start.year + 20 + random(60), 1 + random(12), 1 + random(28)) * DAY_MS,
  };
  const limits = random(4);
  if (limits === 0 || limits === 2) {
    rule.byMonthDay = some(() => pick([1, 2, 3, 4, 13, 15, 28, 29, 30, 31, -1, -2, -3, -31]), 4);
  }
  if (limits === 1 || limits === 2) {
    rule.byYearDay = some(() => pick([1, 2, 3, 60, 135, 140, 362, 363, 364, 365, 366, -1, -2, -3, -366]), 4);
  }
  if (random(2)) rule.byDay = some(() => pick(WD), 3);
  // BYMONTH only next to a limit: BYWEEKNO=20;BYMONTH=1 alone still runs into maxIterations without UNTIL
  if (limits !== 3 && random(5) === 0) rule.byMonth = some(() => pick([1, 5, 12]), 2);
  if (random(5) === 0) rule.byHour = some(() => random(24), 2).sort((a, b) => a - b);
  // A position past the days only next to a limit: BYWEEKNO=20;BYSETPOS=2 alone still runs into maxIterations
  if (random(6) === 0) rule.bySetPos = [limits === 3 ? pick([1, -1]) : pick([1, -1, 2])];
  if (random(3) === 0) rule.count = 1 + random(8);
  return rule;
}

function toRruleString(rule: Rule): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const {start} = rule;
  const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const parts = [
    'FREQ=YEARLY',
    `INTERVAL=${rule.interval}`,
    `BYWEEKNO=${rule.byWeekNo}`,
    rule.byMonth && `BYMONTH=${rule.byMonth}`,
    rule.byYearDay && `BYYEARDAY=${rule.byYearDay}`,
    rule.byMonthDay && `BYMONTHDAY=${rule.byMonthDay}`,
    rule.byDay && `BYDAY=${rule.byDay}`,
    rule.byHour && `BYHOUR=${rule.byHour}`,
    rule.bySetPos && `BYSETPOS=${rule.bySetPos}`,
    // A rule string takes COUNT or UNTIL; the reference stops at both
    rule.count !== undefined ? `COUNT=${rule.count}` : `UNTIL=${stamp(rule.untilMs)}`,
  ].filter(Boolean);
  const dtstart = `${pad(start.year, 4)}${pad(start.month)}${pad(start.day)}T${pad(start.hour)}0000Z`;
  return `DTSTART:${dtstart}\nRRULE:${parts.join(';')}`;
}

describe(`YEARLY BYWEEKNO limits against a brute-force reading (seed=${seed})`, () => {
  it('all(), between(), next() and previous() agree with it', () => {
    let state = seed;
    const random = (n: number) => (((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32) * n) | 0;
    for (let index = 0; index < cases; index++) {
      const rule = randomRule(random);
      const text = toRruleString(rule);
      const rrule = new RRuleTemporal({rruleString: text});
      const ms = (found: {epochMilliseconds: number}[]) => found.map((date) => date.epochMilliseconds);
      let actual: number[] | string;
      try {
        actual = ms(rrule.all());
      } catch (error) {
        actual = String(error);
      }
      // A COUNT rule has no UNTIL, so the reference only covers it up to its own horizon
      const expected = reference(rule);
      if (rule.count !== undefined && expected.length < rule.count) {
        expect(Array.isArray(actual) ? actual.slice(0, expected.length) : actual, text).toEqual(expected);
        continue;
      }
      expect(actual, text).toEqual(expected);
      if (expected.length === 0) continue;
      const first = expected[0]!;
      const last = expected.at(-1)!;
      const middle = expected[expected.length >> 1]!;
      const at = (epochMs: number) => Temporal.Instant.fromEpochMilliseconds(epochMs).toZonedDateTimeISO('UTC');
      expect(ms(rrule.between(at(first), at(last), true)), `between ${text}`).toEqual(expected);
      expect(rrule.next(at(middle), false)?.epochMilliseconds ?? null, `next ${text}`).toBe(
        expected.find((value) => value > middle) ?? null,
      );
      expect(rrule.previous(at(middle), true)?.epochMilliseconds ?? null, `previous ${text}`).toBe(middle);
    }
  }, 120_000);
});

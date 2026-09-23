import {RRuleTemporal} from '../src';
import {Temporal} from '../src/temporal-impl';
import {ZoneOffsetResolver} from '../src/tz-offset';

const epoch = (text: string) => Temporal.Instant.from(text).epochMilliseconds;

describe('time zone transition table regressions', () => {
  it('places transitions on the exact second after a request with nonzero milliseconds', () => {
    const resolver = new ZoneOffsetResolver('America/Chicago');
    resolver.offsetMsAt(epoch('2024-03-01T12:34:56.123Z'));
    for (const delta of [-1, 0, 1, 122, 123, 999]) {
      const ms = epoch('2024-03-10T08:00:00Z') + delta;
      expect(resolver.offsetMsAt(ms), `offset at transition ${delta}ms`).toBe(
        Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO('America/Chicago').offsetNanoseconds / 1e6,
      );
    }
  });

  it('detects a short-lived offset regime without an earlier transition to anchor the table', () => {
    const resolver = new ZoneOffsetResolver('America/Argentina/Tucuman');
    resolver.offsetMsAt(epoch('2004-05-01T12:00:00Z'));
    expect(resolver.offsetMsAt(epoch('2004-06-05T12:00:00Z'))).toBe(-4 * 3_600_000);
  });

  it('grows coverage toward later requests instead of doubling it backward', () => {
    // Each request lands just past the previous margin. Growing both ends on
    // every miss doubled the table into the distant past until it left
    // Temporal's range (or, with daily probes, took unbounded time).
    const resolver = new ZoneOffsetResolver('America/Chicago');
    const start = epoch('2020-01-01T00:00:00Z');
    for (let step = 0; step < 60; step++) {
      const ms = start + step * 550 * 86_400_000;
      expect(resolver.offsetMsAt(ms), `request ${step}`).toBe(
        Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO('America/Chicago').offsetNanoseconds / 1e6,
      );
    }
  });

  it.each(['America/Chicago', 'Australia/Lord_Howe', 'Africa/Casablanca', 'Asia/Tokyo'])(
    'splices incremental coverage extensions seamlessly in %s',
    (zone) => {
      const resolver = new ZoneOffsetResolver(zone);
      const temporalOffset = (ms: number) =>
        Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(zone).offsetNanoseconds / 1e6;
      // Alternate directions so the table is assembled from several segments.
      for (const year of [2024, 2031, 2018, 2040, 1995, 2026]) resolver.offsetMsAt(Date.UTC(year, 5, 1));
      for (let ms = Date.UTC(1993, 0, 1); ms < Date.UTC(2042, 0, 1); ms += 23 * 3_600_000 + 17 * 60_000) {
        expect(resolver.offsetMsAt(ms), `${zone} ${new Date(ms).toISOString()}`).toBe(temporalOffset(ms));
      }
    },
  );

  it('detects a DST regime lasting only a week', () => {
    for (const day of [1, 5, 10, 15, 20, 25]) {
      const resolver = new ZoneOffsetResolver('America/Recife');
      resolver.offsetMsAt(epoch(`2000-01-${String(day).padStart(2, '0')}T12:00:00Z`));
      for (const date of ['2000-10-07T12:00:00Z', '2000-10-10T12:00:00Z', '2000-10-16T12:00:00Z']) {
        const ms = epoch(date);
        expect(resolver.offsetMsAt(ms), `cache start Jan ${day}, ${date}`).toBe(
          Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO('America/Recife').offsetNanoseconds / 1e6,
        );
      }
    }
  });
});

// temporal-polyfill samples most zones every 60 days, so its offsets differ
// from Intl in some short regimes. The table must follow the Temporal
// implementation that constructs this library's values, or integer fast paths
// disagree with the general engine about which instant a wall time names.
const polyfillSensitiveRegimes = [
  ['Africa/Casablanca', '2012-07-25T12:00:00Z'],
  ['Africa/Casablanca', '2030-01-15T12:00:00Z'],
  ['Africa/Cairo', '2014-07-10T12:00:00Z'],
  ['Pacific/Fiji', '2021-01-10T12:00:00Z'],
  ['America/Argentina/San_Luis', '2008-01-20T12:00:00Z'],
] as const;

describe('time zone table agrees with the Temporal implementation', () => {
  it.each(polyfillSensitiveRegimes)('%s around %s', (zone, instant) => {
    const midpoint = epoch(instant);
    const resolver = new ZoneOffsetResolver(zone);
    for (let hours = -24 * 60; hours <= 24 * 60; hours += 7) {
      const ms = midpoint + hours * 3_600_000;
      expect(resolver.offsetMsAt(ms), `${zone} ${new Date(ms).toISOString()}`).toBe(
        Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(zone).offsetNanoseconds / 1e6,
      );
    }
  });

  it.each(polyfillSensitiveRegimes)('generates the same %s occurrences on every path around %s', (zone, instant) => {
    const start = Temporal.Instant.from(instant)
      .toZonedDateTimeISO(zone)
      .subtract({days: 20})
      .with({hour: 12, minute: 0, second: 0});
    const rule = new RRuleTemporal({freq: 'DAILY', count: 40, dtstart: start, cache: false});
    const generated = rule.all().map(String);
    expect(generated).toEqual(rule.all(() => true).map(String));
    expect(generated.every((value) => value.includes('T12:00:00'))).toBe(true);
    const target = start.add({days: 25, hours: 1});
    expect(String(rule.next(target))).toBe(generated[26]);
    expect(String(rule.previous(target))).toBe(generated[25]);
  });

  it('continues past the polyfill search horizon in a zone without transitions', () => {
    const resolver = new ZoneOffsetResolver('Asia/Tokyo');
    const now = Date.now();
    for (const years of [0, 5, 20, 60]) {
      const ms = now + years * 365 * 86_400_000;
      expect(resolver.offsetMsAt(ms)).toBe(9 * 3_600_000);
    }
  });
});

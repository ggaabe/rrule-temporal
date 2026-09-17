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

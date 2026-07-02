import {Temporal} from '../src/temporal-impl';
import {getZoneOffsetResolver} from '../src/tz-offset';

const MS_PER_HOUR = 3_600_000;

// Verify the integer offset resolver against the Temporal implementation
// itself: offsetMsAt must match ZonedDateTime.offsetNanoseconds, and
// epochMsForWall must match PlainDateTime.toZonedDateTime's default
// ('compatible') disambiguation — including inside DST gaps and folds.
describe('ZoneOffsetResolver', () => {
  const zones = [
    'America/Chicago', // classic US DST (1h)
    'Europe/London', // DST around midnight UTC
    'Pacific/Auckland', // southern hemisphere DST
    'Australia/Lord_Howe', // 30-minute DST shift
    'Asia/Kathmandu', // +05:45 fixed offset
    'America/Santiago', // southern hemisphere, transitions at midnight-adjacent hours
  ];

  // Sample days that straddle DST transitions in each zone during 2023-2025,
  // plus quiet mid-season days.
  const sampleStarts = [
    '2023-03-10T00:00:00',
    '2023-11-04T00:00:00',
    '2024-03-30T00:00:00',
    '2024-04-06T00:00:00',
    '2024-09-28T00:00:00',
    '2024-10-05T00:00:00',
    '2025-01-15T00:00:00',
    '2025-07-15T00:00:00',
  ];

  function wallMsOf(pdt: Temporal.PlainDateTime): number {
    const date = new Date(0);
    date.setUTCFullYear(pdt.year, pdt.month - 1, pdt.day);
    date.setUTCHours(pdt.hour, pdt.minute, pdt.second, pdt.millisecond);
    return date.getTime();
  }

  for (const zone of zones) {
    it(`matches Temporal 'compatible' resolution in ${zone}`, () => {
      const resolver = getZoneOffsetResolver(zone);
      for (const startIso of sampleStarts) {
        let pdt = Temporal.PlainDateTime.from(startIso);
        // Sweep 3 days in 30-minute steps around each sample start.
        for (let step = 0; step < 3 * 48; step++) {
          const expected = pdt.toZonedDateTime(zone);
          const resolution = resolver.epochMsForWall(wallMsOf(pdt));
          if (resolution.epochMs !== expected.epochMilliseconds) {
            throw new Error(
              `${zone} ${pdt.toString()}: resolver=${resolution.epochMs} temporal=${expected.epochMilliseconds}`,
            );
          }
          // Every resolved instant must also report the right offset.
          expect(resolver.offsetMsAt(expected.epochMilliseconds)).toBe(expected.offsetNanoseconds / 1_000_000);
          pdt = pdt.add({minutes: 30});
        }
      }
    });
  }

  it('flags DST-gap wall times as pushed', () => {
    const resolver = getZoneOffsetResolver('America/Chicago');
    // 2024-03-10 02:30 does not exist in Chicago (2:00 -> 3:00 jump).
    const gapWall = Date.UTC(2024, 2, 10, 2, 30, 0, 0);
    const resolution = resolver.epochMsForWall(gapWall);
    expect(resolution.pushed).toBe(true);
    // 'compatible' pushes to 03:30-05:00.
    expect(resolution.epochMs).toBe(Temporal.ZonedDateTime.from('2024-03-10T03:30:00-05:00[America/Chicago]').epochMilliseconds);
    // The fold (fall back) picks the earlier interpretation and is not a push.
    const foldWall = Date.UTC(2024, 10, 3, 1, 30, 0, 0);
    const foldResolution = resolver.epochMsForWall(foldWall);
    expect(foldResolution.pushed).toBe(false);
    expect(foldResolution.epochMs).toBe(
      Temporal.ZonedDateTime.from('2024-11-03T01:30:00-05:00[America/Chicago]').epochMilliseconds,
    );
  });

  it('handles fixed-offset time zone identifiers without Intl', () => {
    const resolver = getZoneOffsetResolver('+05:30');
    expect(resolver.offsetMsAt(0)).toBe(5.5 * MS_PER_HOUR);
    const wall = Date.UTC(2024, 0, 1, 12, 0, 0, 0);
    expect(resolver.epochMsForWall(wall)).toEqual({epochMs: wall - 5.5 * MS_PER_HOUR, pushed: false});
  });
});

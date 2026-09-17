import {ZoneOffsetResolver} from '../src/tz-offset';

// Midpoints of known short offset regimes. Compare against this runtime's
// Intl data, since historical corrections and future timezone rules change.
const cases = [
  ['Africa/Tunis', '1943-04-21T00:30:00Z'],
  ['America/Argentina/Tucuman', '2004-06-07T03:30:00Z'],
  ['America/Boa_Vista', '2000-10-11T15:30:00Z'],
  ['America/Fortaleza', '2000-10-15T02:30:00Z'],
  ['America/Maceio', '2000-10-15T02:30:00Z'],
  ['America/Noronha', '2000-10-11T13:30:00Z'],
  ['America/Recife', '2000-10-11T14:30:00Z'],
  ['Asia/Gaza', '2040-10-23T11:30:00Z'],
  ['Asia/Hebron', '2040-10-23T11:30:00Z'],
  ['Europe/Riga', '1944-10-07T12:00:00Z'],
  ['Europe/Simferopol', '1944-04-07T23:30:00Z'],
  ['Europe/Tirane', '1943-04-04T01:00:00Z'],
  ['Europe/Vienna', '1945-04-07T01:00:00Z'],
] as const;

function intlOffset(zone: string, epochMs: number): number {
  const fields = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(epochMs)
      .map(({type, value}) => [type, Number(value)]),
  );
  return Date.UTC(fields.year!, fields.month! - 1, fields.day!, fields.hour!, fields.minute!, fields.second!) - epochMs;
}

it.each(cases)('finds the short offset regime in %s at %s', (zone, instant) => {
  const midpoint = Date.parse(instant);
  const expected = intlOffset(zone, midpoint);
  for (let shift = 0; shift < 30; shift++) {
    const resolver = new ZoneOffsetResolver(zone);
    resolver.offsetMsAt(midpoint - (30 + shift) * 86_400_000);
    expect(resolver.offsetMsAt(midpoint), `cache starts ${30 + shift} days earlier`).toBe(expected);
  }
});

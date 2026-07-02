import {Temporal} from '../src/temporal-impl';
import {RRuleTemporal} from '../src/index';

// Differential tests for the epoch-integer fast paths: the same rule
// evaluated via all() (fast path eligible) and via all(iterator) — a
// pass-through iterator routes evaluation through the general Temporal
// engine, so both engines must agree occurrence-for-occurrence.
//
// Zones are chosen adversarially: 1-hour and 30-minute DST shifts, both
// hemispheres, midnight-adjacent transitions, and odd fixed offsets.
const ZONES = [
  'America/Chicago',
  'Europe/London',
  'Pacific/Auckland',
  'Australia/Lord_Howe',
  'America/Santiago',
  'Asia/Kathmandu',
];

interface Scenario {
  label: string;
  opts: (dtstart: Temporal.ZonedDateTime) => ConstructorParameters<typeof RRuleTemporal>[0];
}

const SCENARIOS: Scenario[] = [
  {
    label: 'DAILY across a year',
    opts: (dtstart) => ({freq: 'DAILY', count: 400, dtstart}),
  },
  {
    label: 'DAILY INTERVAL=3',
    opts: (dtstart) => ({freq: 'DAILY', interval: 3, count: 200, dtstart}),
  },
  {
    label: 'DAILY weekdays only',
    opts: (dtstart) => ({freq: 'DAILY', count: 300, byDay: ['MO', 'TU', 'WE', 'TH', 'FR'], dtstart}),
  },
  {
    label: 'HOURLY across DST transitions',
    opts: (dtstart) => ({freq: 'HOURLY', count: 400, dtstart}),
  },
  {
    label: 'MINUTELY INTERVAL=90',
    opts: (dtstart) => ({freq: 'MINUTELY', interval: 90, count: 400, dtstart}),
  },
  {
    label: 'WEEKLY MO/WE/FR INTERVAL=2',
    opts: (dtstart) => ({freq: 'WEEKLY', interval: 2, count: 150, byDay: ['MO', 'WE', 'FR'], dtstart}),
  },
  {
    label: 'WEEKLY default weekday, WKST=SU',
    opts: (dtstart) => ({freq: 'WEEKLY', count: 110, wkst: 'SU', dtstart}),
  },
  {
    label: 'MONTHLY last weekday (BYSETPOS=-1)',
    opts: (dtstart) => ({
      freq: 'MONTHLY',
      count: 60,
      byDay: ['MO', 'TU', 'WE', 'TH', 'FR'],
      bySetPos: [-1],
      dtstart,
    }),
  },
  {
    label: 'MONTHLY BYMONTHDAY=15,-1',
    opts: (dtstart) => ({freq: 'MONTHLY', count: 60, byMonthDay: [15, -1], dtstart}),
  },
  {
    label: 'MONTHLY 2nd Tuesday with BYHOUR expansion',
    opts: (dtstart) => ({freq: 'MONTHLY', count: 90, byDay: ['2TU'], byHour: [9, 17], dtstart}),
  },
  {
    label: 'MONTHLY restricted by BYMONTH',
    opts: (dtstart) => ({freq: 'MONTHLY', count: 40, byDay: ['1SA'], byMonth: [3, 6, 9, 12], dtstart}),
  },
];

// Start dates shortly before northern/southern DST transitions plus quiet
// periods; 23:59 and 01:30 exercise day boundaries and fold times.
const DTSTART_ISO = ['2023-02-21T23:59:00', '2023-09-20T01:30:00', '2024-03-01T12:00:00'];

describe.each(ZONES)('epoch fast path matches general engine in %s', (zone) => {
  it.each(SCENARIOS.map((s) => [s.label, s] as const))('%s', (_label, scenario) => {
    for (const iso of DTSTART_ISO) {
      const dtstart = Temporal.PlainDateTime.from(iso).toZonedDateTime(zone);
      const fastRule = new RRuleTemporal(scenario.opts(dtstart));
      const generalRule = new RRuleTemporal(scenario.opts(dtstart));

      const fast = fastRule.all();
      const general = generalRule.all(() => true);

      const fastKeys = fast.map((d) => d.toString());
      const generalKeys = general.map((d) => d.toString());
      expect(fastKeys).toEqual(generalKeys);
    }
  });
});

describe('epoch fast path DST-gap handling', () => {
  it('defers to the general engine when the time of day falls in a DST gap', () => {
    // 02:30 does not exist on US spring-forward days; the fast path must
    // yield exactly what the general engine produces for those dates.
    const dtstart = Temporal.PlainDateTime.from('2024-03-08T02:30:00').toZonedDateTime('America/Chicago');
    const rule = new RRuleTemporal({freq: 'DAILY', count: 5, dtstart});
    const viaFast = rule.all().map((d) => d.toString());
    const viaGeneral = new RRuleTemporal({freq: 'DAILY', count: 5, dtstart}).all(() => true).map((d) => d.toString());
    expect(viaFast).toEqual(viaGeneral);
    // The gap day itself resolves forward per 'compatible' disambiguation.
    expect(viaFast[2]).toContain('2024-03-10T03:30:00-05:00');
  });

  it('emits both instants of a repeated MINUTELY wall time but skips repeated HOURLY hours', () => {
    // Across the 2024-11-03 Chicago fall-back.
    const hourly = new RRuleTemporal({
      freq: 'HOURLY',
      count: 6,
      dtstart: Temporal.PlainDateTime.from('2024-11-02T23:30:00').toZonedDateTime('America/Chicago'),
    });
    const hourlyGeneral = new RRuleTemporal({
      freq: 'HOURLY',
      count: 6,
      dtstart: Temporal.PlainDateTime.from('2024-11-02T23:30:00').toZonedDateTime('America/Chicago'),
    });
    expect(hourly.all().map((d) => d.toString())).toEqual(hourlyGeneral.all(() => true).map((d) => d.toString()));
  });
});

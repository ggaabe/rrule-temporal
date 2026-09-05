import {RRuleTemporal, type RRuleOptions} from '../src';
import {Temporal} from '../src/temporal-impl';

// Disable the optimized visitors explicitly: empty EXDATE lists now retain
// fast generation and are no longer a way to force the legacy engine.
function general<T>(run: () => T): T {
  const prototype = RRuleTemporal.prototype as unknown as {
    allUtcFastPath(): null;
    allTzEpochFastPath(): null;
    visitUtcPeriodCandidates(): null;
  };
  const spies = [
    vi.spyOn(prototype, 'allUtcFastPath').mockReturnValue(null),
    vi.spyOn(prototype, 'allTzEpochFastPath').mockReturnValue(null),
    vi.spyOn(prototype, 'visitUtcPeriodCandidates').mockReturnValue(null),
  ];
  try {
    return run();
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
}

const start = Temporal.ZonedDateTime.from('2024-01-17T12:34:56.123[UTC]');
const weekdays = ['MO', 'TU', 'WE', 'TH', 'FR'];
const strings = (dates: ReturnType<RRuleTemporal['all']>) => dates.map((date) => date.toString());

function compare(options: RRuleOptions): void {
  const all = () => strings(new RRuleTemporal({...options, cache: false}).all());
  expect(all()).toEqual(general(all));

  const iterate = () => {
    const seen: Array<[string, number]> = [];
    const result = new RRuleTemporal({...options, cache: false}).all((date, index) => {
      seen.push([date.toString(), index]);
      return index < 3;
    });
    return {result: strings(result), seen};
  };
  expect(iterate()).toEqual(general(iterate));
}

describe('UTC numeric calendar periods match the general Temporal engine', () => {
  it.each(['MONTHLY', 'YEARLY'] as const)('preserves %s bounds, positions, and recurrence-set ordering', (freq) => {
    for (const bySetPos of [undefined, [1, -1], [-1, 1, 2, -2], [1, -1000]]) {
      compare({
        freq,
        dtstart: start,
        count: 16,
        interval: 2,
        byMonth: [1, 2, 6, 12],
        byDay: weekdays,
        byHour: [6, 12, 18],
        byMinute: [0, 34],
        bySetPos,
        includeDtstart: true,
        until: start.add({years: 7}),
        rDate: [start.subtract({days: 2}), start, start.add({years: 10}), start],
        exDate: [start, start.add({days: 1})],
      });
    }
  });

  it('clips UNTIL-only queries after ranking the complete recurrence period', () => {
    for (const freq of ['MONTHLY', 'YEARLY'] as const) {
      for (const inclusive of [false, true]) {
        const query = () => {
          const rule = new RRuleTemporal({
            freq,
            dtstart: start,
            byDay: weekdays,
            byHour: [6, 18],
            bySetPos: [1, -1],
            until: start.add({years: 10}),
            cache: false,
          });
          const lower = start.add({years: 3}).with({month: 2, day: 1, hour: 6});
          const upper = lower.add({years: 1}).with({month: 11, day: 30, hour: 18});
          return strings(rule.between(lower, upper, inclusive));
        };
        expect(query()).toEqual(general(query));
      }
    }
  });

  it('preserves nanoseconds through the fallback, including negative epochs', () => {
    for (const fraction of ['000000001', '123456789', '999999999']) {
      compare({
        freq: 'YEARLY',
        dtstart: Temporal.ZonedDateTime.from(`0001-01-17T12:34:56.${fraction}[UTC]`),
        count: 8,
        byMonthDay: [1, -1],
        byHour: [6, 18],
        bySetPos: [1, -1],
      });
    }
  });

  it('preserves non-UTC, calendar, RSCALE, and ordinal-intersection fallbacks', () => {
    for (const zone of ['UTC', 'America/Chicago', 'Australia/Lord_Howe', '+05:45']) {
      for (const extra of [
        {byYearDay: [1, -1]},
        {byWeekNo: [1, -1], byDay: ['MO']},
        {byDay: ['1MO', 'FR']},
        {byDay: ['53MO', '-53FR']},
        {byDay: ['1MO'], byMonthDay: [1, 2]},
        {byMonth: [2], byMonthDay: [29], rscale: 'GREGORIAN', skip: 'FORWARD' as const},
      ]) {
        compare({freq: 'YEARLY', dtstart: start.withTimeZone(zone), count: 6, ...extra});
      }
    }
    compare({freq: 'YEARLY', dtstart: start.withCalendar('gregory'), count: 6, byMonthDay: [1, -1]});
    compare({freq: 'MONTHLY', dtstart: start.withCalendar('hebrew'), count: 6, byDay: weekdays, byHour: [6, 18]});
  });

  it('keeps candidate-budget failures and callback delivery at the same boundary', () => {
    for (const freq of ['MONTHLY', 'YEARLY'] as const) {
      for (const bySetPos of [undefined, [1, -1], [1, 2, -1, -2], [100_000]]) {
        for (const maxCandidateEvaluations of [1, 2, 3, 4, 7]) {
          const run = () => {
            const seen: string[] = [];
            let error: string | undefined;
            try {
              new RRuleTemporal({
                freq,
                dtstart: start,
                count: 4,
                byDay: weekdays,
                byHour: [6, 18],
                bySetPos,
                maxIterations: 2,
                maxCandidateEvaluations,
              }).all((date) => {
                seen.push(date.toString());
                return true;
              });
            } catch (caught) {
              error = (caught as Error).message;
            }
            return {seen, error};
          };
          expect(run()).toEqual(general(run));
        }
      }
    }
  });

  it('selects dense yearly positions without allocating the time product', () => {
    const dates = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2024-01-01T00:00:00[UTC]'),
      count: 2,
      byDay: weekdays,
      byHour: Array.from({length: 24}, (_, index) => index),
      byMinute: Array.from({length: 60}, (_, index) => index),
      bySecond: Array.from({length: 60}, (_, index) => index),
      bySetPos: [1, -1],
      maxCandidateEvaluations: 2,
    }).all();
    expect(strings(dates)).toEqual(['2024-01-01T00:00:00+00:00[UTC]', '2024-12-31T23:59:59+00:00[UTC]']);
  });

  it('matches deterministic Gregorian cases across leap centuries and early years', () => {
    let seed = 0x61c88647;
    const random = (limit: number) => {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      return seed % limit;
    };
    const years = [-400, -1, 0, 1, 99, 100, 1900, 1999, 2024, 2099, 2399];
    for (let index = 0; index < 120; index++) {
      const dtstart = Temporal.ZonedDateTime.from({
        timeZone: 'UTC',
        year: years[random(years.length)]!,
        month: 1 + random(12),
        day: 1 + random(28),
        hour: random(24),
        minute: random(60),
        second: random(60),
        millisecond: random(1000),
      });
      const shapes = [
        {byMonthDay: [1, 15, -1]},
        {byDay: weekdays},
        {byDay: ['1MO', '-1FR'], byMonth: [1, 2, 6, 12]},
        {byDay: ['1MO', '-10FR']},
        {byDay: weekdays, byMonthDay: [1, 2, -1, -2]},
      ];
      compare({
        freq: index % 2 ? 'YEARLY' : 'MONTHLY',
        dtstart,
        interval: 1 + random(4),
        count: 1 + random(16),
        byHour: [6, 18],
        byMinute: [0, 30],
        bySetPos: [undefined, [1, -1], [-2, 2]][random(3)],
        until: dtstart.add({years: 4}),
        ...shapes[random(shapes.length)],
      });
    }
  });
});

describe('exception-bearing linear rules retain fast generation', () => {
  it.each(['UTC', 'America/Chicago', 'Australia/Lord_Howe', '+05:45'])('matches the general engine in %s', (zone) => {
    const dtstart = start.withTimeZone(zone);
    for (const freq of ['DAILY', 'HOURLY', 'MINUTELY', 'SECONDLY'] as const) {
      for (const interval of [1, 3]) {
        compare({
          freq,
          dtstart,
          interval,
          count: 30,
          rDate: [dtstart.subtract({days: 1}), dtstart, dtstart.add({years: 1}), dtstart],
          exDate: [dtstart, dtstart.add({days: 3}), dtstart.add({hours: 3})],
        });
      }
    }
    compare({
      freq: 'DAILY',
      dtstart,
      count: 100,
      interval: 2,
      byDay: weekdays,
      byHour: [6, 18],
      exDate: [dtstart],
      includeDtstart: true,
    });
  });

  it('preserves DST-gap fallback with exceptions', () => {
    compare({
      freq: 'DAILY',
      count: 10,
      dtstart: Temporal.ZonedDateTime.from('2024-03-08T02:30:00[America/Chicago]'),
      exDate: [Temporal.ZonedDateTime.from('2024-03-09T02:30:00[America/Chicago]')],
    });
  });

  it('preserves calendar and mismatched-zone outputs with exceptions', () => {
    for (const calendar of ['gregory', 'hebrew']) {
      compare({freq: 'DAILY', count: 6, dtstart: start.withCalendar(calendar), rDate: [start]});
    }
    compare({freq: 'HOURLY', count: 6, tzid: 'UTC', dtstart: start.withTimeZone('America/Chicago'), exDate: [start]});
  });

  it('retains the legacy iteration limits for expanded rules with exceptions', () => {
    for (const zone of ['UTC', 'America/Chicago']) {
      for (const freq of ['DAILY', 'WEEKLY', 'MONTHLY'] as const) {
        const run = () => {
          try {
            return strings(
              new RRuleTemporal({
                freq,
                dtstart: start.withTimeZone(zone),
                count: 10,
                byDay: weekdays,
                byHour: [6, 12, 18],
                maxIterations: 1,
                maxCandidateEvaluations: 2,
                exDate: [start],
              }).all(),
            );
          } catch (error) {
            return (error as Error).message;
          }
        };
        expect(run()).toEqual(general(run));
      }
    }
  });
});

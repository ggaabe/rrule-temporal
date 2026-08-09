import {RRuleTemporal} from '../src';
import {Temporal} from '../src/temporal-impl';
import {getWasmKernelMetrics, resetWasmKernelMetrics} from '../src/wasm-engine';

interface WasmTestGlobals {
  __RRULE_TEMPORAL_DISABLE_WASM__?: boolean;
  __RRULE_TEMPORAL_FORCE_WASM__?: boolean;
}

const wasmGlobals = globalThis as WasmTestGlobals;

function allStrings(rruleString: string, wasm: boolean): {dates: string[]; operations: number} {
  wasmGlobals.__RRULE_TEMPORAL_FORCE_WASM__ = true;
  wasmGlobals.__RRULE_TEMPORAL_DISABLE_WASM__ = !wasm;
  resetWasmKernelMetrics();
  const dates = new RRuleTemporal({rruleString, cache: false}).all().map((date) => date.toString());
  return {dates, operations: getWasmKernelMetrics().operations};
}

function expectDifferential(rruleString: string): void {
  const wasm = allStrings(rruleString, true);
  expect(wasm.operations).toBeGreaterThan(0);
  const javascript = allStrings(rruleString, false);
  expect(javascript.operations).toBe(0);
  expect(wasm.dates).toEqual(javascript.dates);
}

describe('RRuleTemporal WebAssembly fast-path differential behavior', () => {
  afterEach(() => {
    delete wasmGlobals.__RRULE_TEMPORAL_DISABLE_WASM__;
    delete wasmGlobals.__RRULE_TEMPORAL_FORCE_WASM__;
  });

  it.each([
    'DTSTART;TZID=UTC:20250101T090000\nRRULE:FREQ=SECONDLY;COUNT=120;INTERVAL=3',
    'DTSTART;TZID=UTC:20250101T090000\nRRULE:FREQ=DAILY;COUNT=180;BYDAY=MO,TU,WE,TH,FR',
    'DTSTART;TZID=UTC:20250101T090000\nRRULE:FREQ=DAILY;COUNT=180;BYDAY=MO,WE,FR;BYHOUR=9,17;BYMINUTE=0,30',
    'DTSTART;TZID=UTC:20250101T090000\nRRULE:FREQ=DAILY;COUNT=80;INTERVAL=2;BYDAY=MO;BYHOUR=9,17',
    'DTSTART;TZID=UTC:20250101T090000\nRRULE:FREQ=WEEKLY;COUNT=180;BYDAY=MO,WE,FR;BYHOUR=9,17;WKST=SU',
    'DTSTART;TZID=UTC:20240101T090000\nRRULE:FREQ=MONTHLY;COUNT=80;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=1,-1',
    'DTSTART;TZID=UTC:20240101T090000\nRRULE:FREQ=MONTHLY;COUNT=40;BYMONTHDAY=1,-1;BYSETPOS=1,-1',
    'DTSTART;TZID=UTC:20240228T090000\nRRULE:FREQ=DAILY;UNTIL=20240302T090000Z',
  ])('matches the JavaScript engine for %s', (rruleString) => {
    expectDifferential(rruleString);
  });

  it.each(['America/Chicago', 'Europe/London', 'Australia/Lord_Howe', 'Asia/Kathmandu'])(
    'matches named-zone generation in %s',
    (timeZone) => {
      expectDifferential(`DTSTART;TZID=${timeZone}:20230115T090000\nRRULE:FREQ=DAILY;COUNT=500;BYDAY=MO,TU,WE,TH,FR`);
      expectDifferential(
        `DTSTART;TZID=${timeZone}:20230115T090000\nRRULE:FREQ=WEEKLY;COUNT=240;BYDAY=MO,WE,FR;BYHOUR=9,17`,
      );
      expectDifferential(
        `DTSTART;TZID=${timeZone}:20230115T090000\nRRULE:FREQ=MONTHLY;COUNT=120;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1`,
      );
    },
  );

  it('falls back for DST-gap-sensitive wall times', () => {
    wasmGlobals.__RRULE_TEMPORAL_FORCE_WASM__ = true;
    wasmGlobals.__RRULE_TEMPORAL_DISABLE_WASM__ = false;
    resetWasmKernelMetrics();
    const rule = new RRuleTemporal({
      rruleString: 'DTSTART;TZID=America/New_York:20240308T023000\nRRULE:FREQ=DAILY;COUNT=5',
      cache: false,
    });
    expect(rule.all()).toHaveLength(5);
    expect(getWasmKernelMetrics().operations).toBe(0);
  });

  it('falls back without losing sub-millisecond precision', () => {
    wasmGlobals.__RRULE_TEMPORAL_FORCE_WASM__ = true;
    wasmGlobals.__RRULE_TEMPORAL_DISABLE_WASM__ = false;
    resetWasmKernelMetrics();
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      cache: false,
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T09:00:00.000123456[UTC]'),
    });
    expect(rule.all().map((date) => date.nanosecond)).toEqual([456, 456, 456]);
    expect(getWasmKernelMetrics().operations).toBe(0);
  });

  it('uses proleptic-Gregorian years 0000 through 0099 in both engines', () => {
    const run = (wasm: boolean) => {
      wasmGlobals.__RRULE_TEMPORAL_FORCE_WASM__ = true;
      wasmGlobals.__RRULE_TEMPORAL_DISABLE_WASM__ = !wasm;
      resetWasmKernelMetrics();
      const dates = new RRuleTemporal({
        freq: 'MONTHLY',
        count: 128,
        byDay: ['MO', 'TU', 'WE', 'TH', 'FR'],
        bySetPos: [-1],
        cache: false,
        dtstart: Temporal.ZonedDateTime.from({timeZone: 'UTC', year: 1, month: 1, day: 1, hour: 9}),
      })
        .all()
        .map((date) => date.toString());
      return {dates, operations: getWasmKernelMetrics().operations};
    };

    const wasm = run(true);
    const javascript = run(false);
    expect(wasm.operations).toBeGreaterThan(0);
    expect(javascript.operations).toBe(0);
    expect(wasm.dates).toEqual(javascript.dates);
    expect(wasm.dates[0]).toBe('0001-01-31T09:00:00+00:00[UTC]');
  });

  it('falls back before narrowing an out-of-range BYSETPOS through the i32 ABI', () => {
    wasmGlobals.__RRULE_TEMPORAL_FORCE_WASM__ = true;
    wasmGlobals.__RRULE_TEMPORAL_DISABLE_WASM__ = false;
    resetWasmKernelMetrics();
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 64,
      byDay: ['MO', 'TU', 'WE', 'TH', 'FR'],
      bySetPos: [4_294_967_297],
      maxIterations: 5,
      cache: false,
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T09:00:00[UTC]'),
    });

    expect(() => rule.all()).toThrow('Maximum iterations (5) exceeded');
    expect(getWasmKernelMetrics().operations).toBe(0);
  });

  it('falls back before a huge monthly interval can leave Temporal range or wrap in WASM', () => {
    wasmGlobals.__RRULE_TEMPORAL_FORCE_WASM__ = true;
    wasmGlobals.__RRULE_TEMPORAL_DISABLE_WASM__ = false;
    resetWasmKernelMetrics();
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      interval: 1_834_791_034,
      count: 128,
      until: Temporal.ZonedDateTime.from('+032000-12-31T09:00:00[UTC]'),
      byDay: ['MO', 'TU', 'WE', 'TH', 'FR'],
      bySetPos: [-1],
      cache: false,
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T09:00:00[UTC]'),
    });

    expect(() => rule.all()).toThrow();
    expect(getWasmKernelMetrics().operations).toBe(0);
  });

  it('uses packed epochs for distant COUNT range and reverse queries', () => {
    const ics = 'DTSTART;TZID=America/Chicago:20000101T090000\nRRULE:FREQ=DAILY;COUNT=9000';
    const target = Temporal.ZonedDateTime.from('2023-04-10T09:00:00[America/Chicago]');
    const end = target.add({days: 2});

    const run = (wasm: boolean) => {
      wasmGlobals.__RRULE_TEMPORAL_FORCE_WASM__ = true;
      wasmGlobals.__RRULE_TEMPORAL_DISABLE_WASM__ = !wasm;
      resetWasmKernelMetrics();
      const rule = new RRuleTemporal({rruleString: ics, cache: false});
      return {
        next: rule.next(target)?.toString(),
        previous: rule.previous(target)?.toString(),
        between: rule.between(target, end, true).map((date) => date.toString()),
        operations: getWasmKernelMetrics().operations,
      };
    };

    const wasm = run(true);
    const javascript = run(false);
    expect(wasm.operations).toBe(3);
    expect(javascript.operations).toBe(0);
    expect({...wasm, operations: 0}).toEqual(javascript);
  });

  it('orders named-zone query candidates by instant across a repeated DST hour', () => {
    const ics = 'DTSTART;TZID=America/Chicago:20200101T012000\nRRULE:FREQ=DAILY;COUNT=1000;BYHOUR=1;BYMINUTE=20,30,40';
    const windowStart = Temporal.ZonedDateTime.from('2020-11-01T00:00:00-05:00[America/Chicago]');
    const before = Temporal.ZonedDateTime.from('2020-11-01T01:15:00-06:00[America/Chicago]');

    const run = (wasm: boolean) => {
      delete wasmGlobals.__RRULE_TEMPORAL_FORCE_WASM__;
      wasmGlobals.__RRULE_TEMPORAL_DISABLE_WASM__ = !wasm;
      resetWasmKernelMetrics();
      const rule = new RRuleTemporal({rruleString: ics, cache: false});
      return {
        previous: rule.previous(before)?.toString(),
        between: rule.between(windowStart, before, true).map((date) => date.toString()),
        operations: getWasmKernelMetrics().operations,
      };
    };

    const wasm = run(true);
    const javascript = run(false);
    expect(wasm.operations).toBe(2);
    expect(javascript.operations).toBe(0);
    expect({...wasm, operations: 0}).toEqual(javascript);
    expect(wasm.previous).toBe('2020-11-01T01:40:00-05:00[America/Chicago]');
    expect(wasm.between).toHaveLength(3);
  });

  it('falls back after a huge expanded DAILY plan reaches Temporal range', () => {
    const start = Temporal.ZonedDateTime.from('2025-01-01T09:00:00[UTC]');
    const query = start.add({days: 64_000_000});

    const run = (wasm: boolean) => {
      delete wasmGlobals.__RRULE_TEMPORAL_FORCE_WASM__;
      wasmGlobals.__RRULE_TEMPORAL_DISABLE_WASM__ = !wasm;
      resetWasmKernelMetrics();
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        interval: 1_000_000,
        count: 4_300,
        byHour: [9],
        cache: false,
        dtstart: start,
      });
      return {
        next: rule.next(query)?.toString(),
        previous: rule.previous(query)?.toString(),
        operations: getWasmKernelMetrics().operations,
      };
    };

    const wasm = run(true);
    const javascript = run(false);
    expect(wasm.operations).toBe(2);
    expect(javascript.operations).toBe(0);
    expect({...wasm, operations: 0}).toEqual(javascript);
  });

  it('switches COUNT queries only after the automatic distance crossover', () => {
    delete wasmGlobals.__RRULE_TEMPORAL_FORCE_WASM__;
    wasmGlobals.__RRULE_TEMPORAL_DISABLE_WASM__ = false;
    const rule = new RRuleTemporal({
      rruleString: 'DTSTART;TZID=UTC:20250101T090000\nRRULE:FREQ=DAILY;COUNT=9000',
      cache: false,
    });
    const start = Temporal.ZonedDateTime.from('2025-01-01T09:00:00[UTC]');

    resetWasmKernelMetrics();
    expect(rule.next(start.add({days: 63}))?.toString()).toBe(start.add({days: 64}).toString());
    expect(getWasmKernelMetrics().operations).toBe(0);

    resetWasmKernelMetrics();
    expect(rule.next(start.add({days: 64}))?.toString()).toBe(start.add({days: 65}).toString());
    expect(getWasmKernelMetrics().operations).toBe(1);
  });

  it('switches monthly BYSETPOS all() only at its automatic count crossover', () => {
    delete wasmGlobals.__RRULE_TEMPORAL_FORCE_WASM__;
    wasmGlobals.__RRULE_TEMPORAL_DISABLE_WASM__ = false;
    const rule = (count: number) =>
      new RRuleTemporal({
        rruleString: `DTSTART;TZID=UTC:20250101T090000\nRRULE:FREQ=MONTHLY;COUNT=${count};BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1`,
        cache: false,
      });

    resetWasmKernelMetrics();
    expect(rule(127).all()).toHaveLength(127);
    expect(getWasmKernelMetrics().operations).toBe(0);

    resetWasmKernelMetrics();
    expect(rule(128).all()).toHaveLength(128);
    expect(getWasmKernelMetrics().operations).toBe(1);
  });

  it.each([
    'DTSTART;TZID=UTC:20200101T090000\nRRULE:FREQ=DAILY;COUNT=180;INTERVAL=2',
    'DTSTART;TZID=UTC:19000101T090000\nRRULE:FREQ=DAILY;COUNT=180;INTERVAL=2',
    'DTSTART;TZID=UTC:20200101T090000\nRRULE:FREQ=DAILY;COUNT=180;BYDAY=MO,WE,FR',
    'DTSTART;TZID=UTC:20200101T090000\nRRULE:FREQ=DAILY;COUNT=180;BYHOUR=9,17;BYMINUTE=0,30',
    'DTSTART;TZID=UTC:20200101T090000\nRRULE:FREQ=MINUTELY;COUNT=180;INTERVAL=7',
    'DTSTART;TZID=America/Chicago:20200101T090000\nRRULE:FREQ=DAILY;COUNT=180;INTERVAL=2',
    'DTSTART;TZID=America/Chicago:20200101T090000\nRRULE:FREQ=DAILY;COUNT=180;BYDAY=MO,WE,FR',
    'DTSTART;TZID=America/Chicago:20200101T090000\nRRULE:FREQ=DAILY;COUNT=180;BYHOUR=9,17;BYMINUTE=0,30',
    'DTSTART;TZID=America/Chicago:20200101T090000\nRRULE:FREQ=HOURLY;COUNT=180;INTERVAL=2',
  ])('preserves query boundaries and inclusivity for %s', (rruleString) => {
    wasmGlobals.__RRULE_TEMPORAL_FORCE_WASM__ = true;
    wasmGlobals.__RRULE_TEMPORAL_DISABLE_WASM__ = true;
    const rule = new RRuleTemporal({rruleString, cache: false});
    const all = rule.all();
    const target = all[Math.floor(all.length / 2)]!;
    const windowStart = target.subtract({nanoseconds: 1});
    const windowEnd = target.add({nanoseconds: 1});

    const query = (wasm: boolean) => {
      wasmGlobals.__RRULE_TEMPORAL_DISABLE_WASM__ = !wasm;
      resetWasmKernelMetrics();
      const value = {
        nextExclusive: rule.next(target, false)?.toString(),
        nextInclusive: rule.next(target, true)?.toString(),
        previousExclusive: rule.previous(target, false)?.toString(),
        previousInclusive: rule.previous(target, true)?.toString(),
        betweenExclusive: rule.between(windowStart, windowEnd, false).map((date) => date.toString()),
        betweenInclusive: rule.between(target, target, true).map((date) => date.toString()),
      };
      return {value, operations: getWasmKernelMetrics().operations};
    };

    const javascript = query(false);
    const wasm = query(true);
    expect(wasm.operations).toBe(6);
    expect(javascript.operations).toBe(0);
    expect(wasm.value).toEqual(javascript.value);
  });
});

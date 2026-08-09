import {
  generateDailyExpandedWasm,
  generateDailyWasm,
  generateFixedStepWasm,
  generateMonthlyWasm,
  generateWeeklyWasm,
  getWasmKernelMetrics,
  resetWasmEngineForTesting,
  resetWasmKernelMetrics,
} from '../src/wasm-engine';
import {Temporal} from '../src/temporal-impl';

const MS_PER_DAY = 86_400_000;

function values(result: Float64Array | null): number[] {
  expect(result).not.toBeNull();
  return Array.from(result!);
}

describe('embedded WebAssembly recurrence kernel', () => {
  beforeEach(() => {
    (globalThis as {__RRULE_TEMPORAL_DISABLE_WASM__?: boolean}).__RRULE_TEMPORAL_DISABLE_WASM__ = false;
    resetWasmKernelMetrics();
  });

  it('generates fixed-step epochs in one batched call', () => {
    expect(
      values(
        generateFixedStepWasm({
          startMs: 1_000,
          stepMs: 250,
          count: 4,
          maxIterations: 10,
        }),
      ),
    ).toEqual([1_000, 1_250, 1_500, 1_750]);
  });

  it('filters daily rules with a weekday bit mask', () => {
    // 1970-01-01 is Thursday. Monday and Wednesday are bits zero and two.
    expect(
      values(
        generateDailyWasm({
          startMs: 0,
          stepDays: 1,
          startDayOfWeek: 4,
          weekdayMask: (1 << 0) | (1 << 2),
          count: 4,
          maxIterations: 10,
        }),
      ),
    ).toEqual([4 * MS_PER_DAY, 6 * MS_PER_DAY, 11 * MS_PER_DAY, 13 * MS_PER_DAY]);
  });

  it('expands daily and weekly time slots without crossing the JS boundary per occurrence', () => {
    const start = Date.UTC(2025, 0, 1, 9);
    const slots = [9 * 3_600_000, 17 * 3_600_000];

    const daily = values(
      generateDailyExpandedWasm({
        startWallMs: start,
        stepDays: 1,
        startDayOfWeek: 3,
        weekdayMask: 0,
        timeSlotsMs: slots,
        count: 4,
        maxIterations: 10,
      }),
    );
    expect(daily).toEqual([
      Date.UTC(2025, 0, 1, 9),
      Date.UTC(2025, 0, 1, 17),
      Date.UTC(2025, 0, 2, 9),
      Date.UTC(2025, 0, 2, 17),
    ]);

    const weekly = values(
      generateWeeklyWasm({
        startWallMs: start,
        startDayOfWeek: 3,
        weekStartDay: 1,
        intervalWeeks: 1,
        weekdayMask: (1 << 0) | (1 << 2) | (1 << 4),
        timeSlotsMs: [9 * 3_600_000],
        count: 5,
        maxIterations: 10,
      }),
    );
    expect(weekly).toEqual([
      Date.UTC(2025, 0, 1, 9),
      Date.UTC(2025, 0, 3, 9),
      Date.UTC(2025, 0, 6, 9),
      Date.UTC(2025, 0, 8, 9),
      Date.UTC(2025, 0, 10, 9),
    ]);
  });

  it('preserves the existing DAILY interval alignment for simple and expanded rules', () => {
    const start = Date.UTC(2025, 0, 1, 9); // Wednesday
    const mondayMask = 1 << 0;
    expect(
      values(
        generateDailyWasm({
          startMs: start,
          stepDays: 2,
          startDayOfWeek: 3,
          weekdayMask: mondayMask,
          count: 2,
          maxIterations: 20,
        }),
      ),
    ).toEqual([Date.UTC(2025, 0, 13, 9), Date.UTC(2025, 0, 27, 9)]);

    expect(
      values(
        generateDailyExpandedWasm({
          startWallMs: start,
          stepDays: 2,
          startDayOfWeek: 3,
          weekdayMask: mondayMask,
          timeSlotsMs: [9 * 3_600_000, 17 * 3_600_000],
          count: 4,
          maxIterations: 20,
        }),
      ),
    ).toEqual([Date.UTC(2025, 0, 6, 9), Date.UTC(2025, 0, 6, 17), Date.UTC(2025, 0, 20, 9), Date.UTC(2025, 0, 20, 17)]);
  });

  it('selects the last weekday of each Gregorian month', () => {
    const result = values(
      generateMonthlyWasm({
        startWallMs: Date.UTC(2025, 0, 1, 9),
        startYear: 2025,
        startMonth: 1,
        intervalMonths: 1,
        monthMask: 0,
        weekdayMask: 0b00011111,
        positiveMonthDayMask: 0,
        negativeMonthDayMask: 0,
        timeSlotsMs: [9 * 3_600_000],
        bySetPos: [-1],
        count: 3,
        maxIterations: 10,
      }),
    );
    expect(result).toEqual([Date.UTC(2025, 0, 31, 9), Date.UTC(2025, 1, 28, 9), Date.UTC(2025, 2, 31, 9)]);
    expect(getWasmKernelMetrics().operations).toBeGreaterThan(0);
  });

  it.each([1, 9999])('keeps Gregorian monthly arithmetic exact around year %i', (year) => {
    const start = Temporal.ZonedDateTime.from({
      timeZone: 'UTC',
      year,
      month: 1,
      day: 1,
      hour: 9,
    });
    const result = values(
      generateMonthlyWasm({
        startWallMs: start.epochMilliseconds,
        startYear: year,
        startMonth: 1,
        intervalMonths: 1,
        monthMask: 0,
        weekdayMask: 0b00011111,
        positiveMonthDayMask: 0,
        negativeMonthDayMask: 0,
        timeSlotsMs: [9 * 3_600_000],
        bySetPos: [-1],
        count: 2,
        maxIterations: 4,
      }),
    );

    const expected: number[] = [];
    for (let month = 1; month <= 2; month++) {
      let lastWeekday = start.with({month, day: 1}).add({months: 1}).subtract({days: 1});
      while (lastWeekday.dayOfWeek > 5) lastWeekday = lastWeekday.subtract({days: 1});
      expected.push(lastWeekday.epochMilliseconds);
    }
    expect(result).toEqual(expected);
  });

  it('rejects a monthly interval before its civil arithmetic can wrap', () => {
    expect(
      generateMonthlyWasm({
        startWallMs: Date.UTC(2025, 0, 1, 9),
        startYear: 2025,
        startMonth: 1,
        intervalMonths: 1_834_791_034,
        monthMask: 0,
        weekdayMask: 0b00011111,
        positiveMonthDayMask: 0,
        negativeMonthDayMask: 0,
        timeSlotsMs: [9 * 3_600_000],
        bySetPos: [-1],
        count: 128,
        maxIterations: 128,
      }),
    ).toBeNull();
  });

  it('honors the JavaScript fallback switch', () => {
    (globalThis as {__RRULE_TEMPORAL_DISABLE_WASM__?: boolean}).__RRULE_TEMPORAL_DISABLE_WASM__ = true;
    expect(generateFixedStepWasm({startMs: 0, stepMs: 1, count: 1, maxIterations: 1})).toBeNull();
  });

  it('grows and retries the packed output buffer for UNTIL-bounded rules', () => {
    const result = generateFixedStepWasm({startMs: 0, stepMs: 1, untilMs: 1_000, maxIterations: 2_000});
    expect(result).toHaveLength(1_001);
    expect(result?.[1_000]).toBe(1_000);
    expect(getWasmKernelMetrics().retries).toBeGreaterThan(0);
  });

  it('returns control to JavaScript when WebAssembly is unavailable', () => {
    const holder = globalThis as {WebAssembly?: unknown};
    const original = holder.WebAssembly;
    try {
      holder.WebAssembly = undefined;
      resetWasmEngineForTesting();
      expect(generateFixedStepWasm({startMs: 0, stepMs: 1, count: 1, maxIterations: 1})).toBeNull();
      expect(getWasmKernelMetrics().unavailable).toBe(1);
    } finally {
      holder.WebAssembly = original;
      resetWasmEngineForTesting();
    }
  });

  it('invalidates a trapped module so public callers can fall back to JavaScript', () => {
    const holder = globalThis as {WebAssembly?: unknown};
    const original = holder.WebAssembly;
    try {
      holder.WebAssembly = {
        Module: class {},
        Instance: class {
          exports = {
            memory: {buffer: new ArrayBuffer(64 * 1024)},
            __new: () => 8,
            generateFixedStep: () => {
              throw new Error('synthetic runtime trap');
            },
          };
        },
      };
      resetWasmEngineForTesting();

      expect(generateFixedStepWasm({startMs: 0, stepMs: 1, count: 1, maxIterations: 1})).toBeNull();
      expect(generateFixedStepWasm({startMs: 0, stepMs: 1, count: 1, maxIterations: 1})).toBeNull();
      expect(getWasmKernelMetrics()).toMatchObject({initializations: 1, operations: 1, unavailable: 1});
    } finally {
      holder.WebAssembly = original;
      resetWasmEngineForTesting();
    }
  });
});

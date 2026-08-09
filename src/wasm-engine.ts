import {RECURRENCE_WASM_BYTES} from './generated/recurrence-wasm';

const STATUS_CAPACITY = -1;
const STATUS_MAX_ITERATIONS = -2;
const MAX_WASM_OCCURRENCES = 1_000_000;

interface WasmMemory {
  readonly buffer: ArrayBuffer;
}

interface WebAssemblyApi {
  Module: new (bytes: Uint8Array) => unknown;
  Instance: new (
    module: unknown,
    imports?: Record<string, Record<string, (...args: number[]) => void>>,
  ) => {
    readonly exports: object;
  };
}

interface RecurrenceWasmExports {
  memory: WasmMemory;
  __new(size: number, id: number): number;
  generateFixedStep(
    startMs: number,
    stepMs: number,
    untilMs: number,
    hasUntil: number,
    countLimit: number,
    maxIterations: number,
    outputPtr: number,
    capacity: number,
  ): number;
  generateDaily(
    startMs: number,
    stepDays: number,
    startDayOfWeek: number,
    weekdayMask: number,
    untilMs: number,
    hasUntil: number,
    countLimit: number,
    maxIterations: number,
    outputPtr: number,
    capacity: number,
  ): number;
  generateDailyExpanded(
    startWallMs: number,
    stepDays: number,
    startDayOfWeek: number,
    weekdayMask: number,
    timeSlotsPtr: number,
    timeSlotCount: number,
    untilMs: number,
    hasUntil: number,
    countLimit: number,
    maxIterations: number,
    outputPtr: number,
    capacity: number,
  ): number;
  generateWeekly(
    startWallMs: number,
    startDayOfWeek: number,
    weekStartDay: number,
    intervalWeeks: number,
    weekdayMask: number,
    timeSlotsPtr: number,
    timeSlotCount: number,
    untilMs: number,
    hasUntil: number,
    countLimit: number,
    maxIterations: number,
    outputPtr: number,
    capacity: number,
  ): number;
  generateMonthly(
    startWallMs: number,
    startYear: number,
    startMonth: number,
    intervalMonths: number,
    monthMask: number,
    weekdayMask: number,
    positiveMonthDayMask: number,
    negativeMonthDayMask: number,
    timeSlotsPtr: number,
    timeSlotCount: number,
    setPosPtr: number,
    setPosCount: number,
    untilMs: number,
    hasUntil: number,
    countLimit: number,
    maxIterations: number,
    outputPtr: number,
    capacity: number,
  ): number;
}

interface KernelCommon {
  untilMs?: number;
  count?: number;
  maxIterations: number;
}

export interface FixedStepKernelInput extends KernelCommon {
  startMs: number;
  stepMs: number;
}

export interface DailyKernelInput extends KernelCommon {
  startMs: number;
  stepDays: number;
  startDayOfWeek: number;
  weekdayMask: number;
}

export interface DailyExpandedKernelInput extends KernelCommon {
  startWallMs: number;
  stepDays: number;
  startDayOfWeek: number;
  weekdayMask: number;
  timeSlotsMs: readonly number[];
}

export interface WeeklyKernelInput extends KernelCommon {
  startWallMs: number;
  startDayOfWeek: number;
  weekStartDay: number;
  intervalWeeks: number;
  weekdayMask: number;
  timeSlotsMs: readonly number[];
}

export interface MonthlyKernelInput extends KernelCommon {
  startWallMs: number;
  startYear: number;
  startMonth: number;
  intervalMonths: number;
  monthMask: number;
  weekdayMask: number;
  positiveMonthDayMask: number;
  negativeMonthDayMask: number;
  timeSlotsMs: readonly number[];
  bySetPos: readonly number[];
}

interface KernelMetrics {
  initializations: number;
  operations: number;
  retries: number;
  unavailable: number;
}

const metrics: KernelMetrics = {
  initializations: 0,
  operations: 0,
  retries: 0,
  unavailable: 0,
};

class RecurrenceWasmEngine {
  private outputPtr = 0;
  private outputCapacity = 0;
  private f64InputPtr = 0;
  private f64InputCapacity = 0;
  private i32InputPtr = 0;
  private i32InputCapacity = 0;

  constructor(private readonly exports: RecurrenceWasmExports) {}

  private allocate(byteLength: number): number {
    return this.exports.__new(Math.max(byteLength, 8), 0);
  }

  private ensureOutput(capacity: number): boolean {
    if (capacity > MAX_WASM_OCCURRENCES) return false;
    if (capacity <= this.outputCapacity) return true;
    const nextCapacity = Math.min(MAX_WASM_OCCURRENCES, Math.max(capacity, this.outputCapacity * 2, 256));
    this.outputPtr = this.allocate(nextCapacity * Float64Array.BYTES_PER_ELEMENT);
    this.outputCapacity = nextCapacity;
    return true;
  }

  private writeF64Input(values: readonly number[]): number {
    if (values.length === 0) return 0;
    if (values.length > this.f64InputCapacity) {
      const nextCapacity = Math.max(values.length, this.f64InputCapacity * 2, 8);
      this.f64InputPtr = this.allocate(nextCapacity * Float64Array.BYTES_PER_ELEMENT);
      this.f64InputCapacity = nextCapacity;
    }
    new Float64Array(this.exports.memory.buffer, this.f64InputPtr, values.length).set(values);
    return this.f64InputPtr;
  }

  private writeI32Input(values: readonly number[]): number {
    if (values.length === 0) return 0;
    if (values.length > this.i32InputCapacity) {
      const nextCapacity = Math.max(values.length, this.i32InputCapacity * 2, 8);
      this.i32InputPtr = this.allocate(nextCapacity * Int32Array.BYTES_PER_ELEMENT);
      this.i32InputCapacity = nextCapacity;
    }
    new Int32Array(this.exports.memory.buffer, this.i32InputPtr, values.length).set(values);
    return this.i32InputPtr;
  }

  private run(common: KernelCommon, invoke: (outputPtr: number, capacity: number) => number): Float64Array | null {
    const count = common.count ?? -1;
    let capacity = count >= 0 ? Math.max(count, 1) : Math.min(Math.max(common.maxIterations, 1), 256);
    if (!this.ensureOutput(capacity)) return null;

    metrics.operations += 1;
    while (true) {
      const result = invoke(this.outputPtr, capacity);
      if (result >= 0) {
        return new Float64Array(this.exports.memory.buffer, this.outputPtr, result);
      }
      if (result === STATUS_MAX_ITERATIONS) {
        throw new Error(`Maximum iterations (${common.maxIterations}) exceeded in all()`);
      }
      if (result !== STATUS_CAPACITY) return null;

      metrics.retries += 1;
      const nextCapacity = Math.min(capacity * 2, MAX_WASM_OCCURRENCES);
      if (nextCapacity <= capacity) return null;
      capacity = nextCapacity;
      if (!this.ensureOutput(capacity)) return null;
    }
  }

  fixedStep(input: FixedStepKernelInput): Float64Array | null {
    return this.run(input, (outputPtr, capacity) =>
      this.exports.generateFixedStep(
        input.startMs,
        input.stepMs,
        input.untilMs ?? 0,
        input.untilMs === undefined ? 0 : 1,
        input.count ?? -1,
        input.maxIterations,
        outputPtr,
        capacity,
      ),
    );
  }

  daily(input: DailyKernelInput): Float64Array | null {
    return this.run(input, (outputPtr, capacity) =>
      this.exports.generateDaily(
        input.startMs,
        input.stepDays,
        input.startDayOfWeek,
        input.weekdayMask,
        input.untilMs ?? 0,
        input.untilMs === undefined ? 0 : 1,
        input.count ?? -1,
        input.maxIterations,
        outputPtr,
        capacity,
      ),
    );
  }

  dailyExpanded(input: DailyExpandedKernelInput): Float64Array | null {
    const timeSlotsPtr = this.writeF64Input(input.timeSlotsMs);
    return this.run(input, (outputPtr, capacity) =>
      this.exports.generateDailyExpanded(
        input.startWallMs,
        input.stepDays,
        input.startDayOfWeek,
        input.weekdayMask,
        timeSlotsPtr,
        input.timeSlotsMs.length,
        input.untilMs ?? 0,
        input.untilMs === undefined ? 0 : 1,
        input.count ?? -1,
        input.maxIterations,
        outputPtr,
        capacity,
      ),
    );
  }

  weekly(input: WeeklyKernelInput): Float64Array | null {
    const timeSlotsPtr = this.writeF64Input(input.timeSlotsMs);
    return this.run(input, (outputPtr, capacity) =>
      this.exports.generateWeekly(
        input.startWallMs,
        input.startDayOfWeek,
        input.weekStartDay,
        input.intervalWeeks,
        input.weekdayMask,
        timeSlotsPtr,
        input.timeSlotsMs.length,
        input.untilMs ?? 0,
        input.untilMs === undefined ? 0 : 1,
        input.count ?? -1,
        input.maxIterations,
        outputPtr,
        capacity,
      ),
    );
  }

  monthly(input: MonthlyKernelInput): Float64Array | null {
    const timeSlotsPtr = this.writeF64Input(input.timeSlotsMs);
    const setPosPtr = this.writeI32Input(input.bySetPos);
    return this.run(input, (outputPtr, capacity) =>
      this.exports.generateMonthly(
        input.startWallMs,
        input.startYear,
        input.startMonth,
        input.intervalMonths,
        input.monthMask,
        input.weekdayMask,
        input.positiveMonthDayMask,
        input.negativeMonthDayMask,
        timeSlotsPtr,
        input.timeSlotsMs.length,
        setPosPtr,
        input.bySetPos.length,
        input.untilMs ?? 0,
        input.untilMs === undefined ? 0 : 1,
        input.count ?? -1,
        input.maxIterations,
        outputPtr,
        capacity,
      ),
    );
  }
}

let engine: RecurrenceWasmEngine | null | undefined;

function wasmDisabled(): boolean {
  return Boolean((globalThis as {__RRULE_TEMPORAL_DISABLE_WASM__?: boolean}).__RRULE_TEMPORAL_DISABLE_WASM__);
}

function getEngine(): RecurrenceWasmEngine | null {
  if (wasmDisabled()) return null;
  if (engine !== undefined) return engine;

  try {
    const wasm = (globalThis as {WebAssembly?: WebAssemblyApi}).WebAssembly;
    if (!wasm) throw new Error('WebAssembly is unavailable');
    const module = new wasm.Module(RECURRENCE_WASM_BYTES);
    const instance = new wasm.Instance(module, {
      env: {
        abort: () => {
          throw new Error('rrule-temporal WASM kernel aborted');
        },
      },
    });
    engine = new RecurrenceWasmEngine(instance.exports as RecurrenceWasmExports);
    metrics.initializations += 1;
  } catch {
    engine = null;
    metrics.unavailable += 1;
  }
  return engine;
}

function runWithEngine(operation: (current: RecurrenceWasmEngine) => Float64Array | null): Float64Array | null {
  const current = getEngine();
  if (!current) return null;
  try {
    return operation(current);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Maximum iterations')) throw error;
    // Allocation failure, a runtime trap, or a restrictive host must never
    // make a previously supported recurrence unusable. Discard the instance
    // and let the caller continue through the JavaScript engine.
    engine = null;
    metrics.unavailable += 1;
    return null;
  }
}

export function generateFixedStepWasm(input: FixedStepKernelInput): Float64Array | null {
  return runWithEngine((current) => current.fixedStep(input));
}

export function generateDailyWasm(input: DailyKernelInput): Float64Array | null {
  return runWithEngine((current) => current.daily(input));
}

export function generateDailyExpandedWasm(input: DailyExpandedKernelInput): Float64Array | null {
  return runWithEngine((current) => current.dailyExpanded(input));
}

export function generateWeeklyWasm(input: WeeklyKernelInput): Float64Array | null {
  return runWithEngine((current) => current.weekly(input));
}

export function generateMonthlyWasm(input: MonthlyKernelInput): Float64Array | null {
  return runWithEngine((current) => current.monthly(input));
}

/** Internal diagnostics used by differential tests and the benchmark harness. */
export function getWasmKernelMetrics(): Readonly<KernelMetrics> {
  return {...metrics};
}

/** Internal test hook; the published RRuleTemporal API does not expose engine selection. */
export function resetWasmKernelMetrics(): void {
  metrics.initializations = 0;
  metrics.operations = 0;
  metrics.retries = 0;
  metrics.unavailable = 0;
}

/** Internal test hook for exercising initialization and CSP fallback. */
export function resetWasmEngineForTesting(): void {
  engine = undefined;
  resetWasmKernelMetrics();
}

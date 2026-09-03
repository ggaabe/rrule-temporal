import {RRuleTemporal, type RRuleOptions} from '../src';
import {Temporal} from '../src/temporal-impl';

type Occurrence = ReturnType<RRuleTemporal['all']>[number];
type InspectableRule = RRuleTemporal & {
  numericQueryPlanCache?: {kind: string} | null;
};

interface RandomSource {
  integer(minimum: number, maximum: number): number;
  pick<T>(values: readonly T[]): T;
  shuffle<T>(values: readonly T[]): T[];
  subset<T>(values: readonly T[], maximum: number): T[];
  chance(probability: number): boolean;
}

const DEFAULT_SEED = 0x6d2b79f5;
const DEFAULT_CASES_PER_FAMILY = 40;
const ZONES = ['UTC', 'America/Chicago', 'Europe/Berlin', 'Australia/Lord_Howe', 'Pacific/Apia', 'Asia/Kathmandu'];
const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const BOUNDARY_YEARS = [1, 4, 99, 100, 399, 400, 1582, 1899, 1900, 1999, 2000, 2001, 2024, 2099, 2100, 2399, 2400];

function positiveIntegerEnvironmentValue(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive safe integer`);
  return value;
}

function seedEnvironmentValue(): number {
  const raw = process.env.RRULE_FUZZ_SEED;
  if (raw === undefined) return DEFAULT_SEED;
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new Error('RRULE_FUZZ_SEED must be a decimal or hexadecimal safe integer');
  return value >>> 0;
}

function createRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  const next = () => (state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0) / 0x1_0000_0000;
  const integer = (minimum: number, maximum: number) => minimum + Math.floor(next() * (maximum - minimum + 1));
  const pick = <T>(values: readonly T[]): T => values[integer(0, values.length - 1)]!;
  const shuffle = <T>(values: readonly T[]): T[] => {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index--) {
      const swapIndex = integer(0, index);
      [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
    }
    return result;
  };
  return {
    integer,
    pick,
    shuffle,
    subset: <T>(values: readonly T[], maximum: number) =>
      shuffle(values).slice(0, integer(1, Math.min(maximum, values.length))),
    chance: (probability: number) => next() < probability,
  };
}

function makeDtstart(random: RandomSource, index: number): Temporal.ZonedDateTime {
  const boundaryCase = index % 11 === 0;
  return Temporal.ZonedDateTime.from({
    timeZone: boundaryCase ? 'UTC' : random.pick(ZONES),
    year: boundaryCase ? random.pick(BOUNDARY_YEARS) : random.integer(1900, 2070),
    month: random.integer(1, 12),
    day: random.integer(1, 28),
    hour: random.pick([6, 9, 12, 18]),
    minute: random.pick([0, 7, 30, 43]),
    second: random.pick([0, 11, 37]),
    millisecond: random.pick([0, 123, 999]),
  });
}

function timeParts(random: RandomSource, dtstart: Temporal.ZonedDateTime): Record<string, number[]> {
  const result: Record<string, number[]> = {};
  if (random.chance(0.7)) {
    result.byHour = random.chance(0.3) ? random.subset([6, 9, 12, 18], 2) : [dtstart.hour];
  }
  if (random.chance(0.45)) {
    result.byMinute = random.chance(0.2) ? random.subset([0, 7, 30, 43, 59], 2) : [dtstart.minute];
  }
  if (random.chance(0.3)) result.bySecond = [dtstart.second];
  return result;
}

function yearlyOptions(random: RandomSource, index: number): RRuleOptions {
  const dtstart = makeDtstart(random, index);
  const options: Record<string, unknown> = {
    freq: 'YEARLY',
    interval: random.integer(1, 5),
    count: random.integer(6, 24),
    dtstart,
    cache: false,
    maxIterations: 20_000,
  };

  switch (index % 7) {
    case 0:
      break;
    case 1:
      options.byMonth = random.subset([1, 2, 3, 4, 6, 9, 11, 12], 4);
      break;
    case 2:
      if (random.chance(0.75)) options.byMonth = random.subset([1, 2, 3, 4, 6, 9, 11, 12], 5);
      options.byMonthDay = random.subset([1, 2, 7, 15, 28, -1, -2, -7], 4);
      Object.assign(options, timeParts(random, dtstart));
      break;
    case 3:
      if (random.chance(0.8)) options.byMonth = random.subset([1, 2, 3, 4, 6, 9, 11, 12], 5);
      options.byDay = random.subset(WEEKDAYS, 6);
      Object.assign(options, timeParts(random, dtstart));
      break;
    case 4:
      options.byMonth = random.subset([1, 2, 3, 4, 6, 9, 11, 12], 5);
      options.byDay = random.subset(['1MO', '2TU', '3WE', '-1FR', '-2SA', '4SU'], 3);
      Object.assign(options, timeParts(random, dtstart));
      break;
    case 5:
      options.byDay = random.subset(['1MO', '2TU', '10WE', '-1FR', '-2SA', '-10SU'], 3);
      Object.assign(options, timeParts(random, dtstart));
      break;
    case 6:
      if (random.chance(0.8)) options.byMonth = random.subset([1, 2, 3, 4, 6, 9, 11, 12], 5);
      options.byDay = random.subset(WEEKDAYS, 6);
      options.bySetPos = random.subset([1, 2, 3, -1, -2, -3], 4);
      Object.assign(options, timeParts(random, dtstart));
      break;
  }
  return options as unknown as RRuleOptions;
}

function exceptionBaseOptions(random: RandomSource, index: number): RRuleOptions {
  const dtstart = makeDtstart(random, index + 20_000);
  const common = {
    interval: random.integer(1, 5),
    count: random.integer(8, 30),
    dtstart,
    cache: false,
    maxIterations: 20_000,
  };
  switch (index % 5) {
    case 0:
      return {...common, freq: random.pick(['SECONDLY', 'MINUTELY', 'HOURLY'] as const)};
    case 1:
      return {...common, freq: 'DAILY', byDay: WEEKDAYS, ...timeParts(random, dtstart)};
    case 2:
      return {
        ...common,
        freq: 'WEEKLY',
        byDay: random.subset(WEEKDAYS, 6),
        wkst: random.pick(WEEKDAYS),
        ...timeParts(random, dtstart),
      };
    case 3:
      return {
        ...common,
        freq: 'MONTHLY',
        byMonthDay: random.subset([1, 2, 7, 15, 28, -1, -2], 4),
        ...timeParts(random, dtstart),
      };
    default:
      return {
        ...common,
        freq: 'YEARLY',
        byMonth: random.subset([1, 2, 3, 4, 6, 9, 11, 12], 5),
        byMonthDay: random.subset([1, 2, 7, 15, 28, -1, -2], 4),
        ...timeParts(random, dtstart),
      };
  }
}

function epoch(value: Occurrence | null | undefined): bigint | null {
  return value?.epochNanoseconds ?? null;
}

function epochList(values: Occurrence[]): bigint[] {
  return values.map((value) => value.epochNanoseconds);
}

function verifyQueries(options: RRuleOptions, random: RandomSource, label: string): string | null {
  const expected = new RRuleTemporal(options).all();
  const callbackResult = new RRuleTemporal(options).all(() => true);
  expect(epochList(callbackResult), `${label}: callback iterator`).toEqual(epochList(expected));
  expect(expected.length, `${label}: non-empty occurrence set`).toBeGreaterThan(0);

  const rule = new RRuleTemporal(options);
  const ranks = [
    ...new Set([0, Math.floor(expected.length / 2), expected.length - 1, random.integer(0, expected.length - 1)]),
  ];
  for (const rank of ranks) {
    const occurrence = expected[rank]!;
    for (const inclusive of [false, true]) {
      const expectedNext = expected.find((value) =>
        inclusive
          ? value.epochNanoseconds >= occurrence.epochNanoseconds
          : value.epochNanoseconds > occurrence.epochNanoseconds,
      );
      const expectedPrevious = expected.findLast((value) =>
        inclusive
          ? value.epochNanoseconds <= occurrence.epochNanoseconds
          : value.epochNanoseconds < occurrence.epochNanoseconds,
      );
      expect(epoch(rule.next(occurrence, inclusive)), `${label}: next rank ${rank}, inclusive=${inclusive}`).toBe(
        epoch(expectedNext),
      );
      expect(
        epoch(rule.previous(occurrence, inclusive)),
        `${label}: previous rank ${rank}, inclusive=${inclusive}`,
      ).toBe(epoch(expectedPrevious));
    }
    expect(rule.matches(occurrence), `${label}: matches rank ${rank}`).toBe(true);
    expect(
      epochList(rule.between(occurrence.subtract({nanoseconds: 1}), occurrence.add({nanoseconds: 1}))),
      `${label}: nanosecond window rank ${rank}`,
    ).toEqual([occurrence.epochNanoseconds]);
  }

  expect(rule.previous(expected[0]!.subtract({days: 13})), `${label}: before start`).toBeNull();
  expect(rule.next(expected.at(-1)!.add({days: 13})), `${label}: after end`).toBeNull();

  const left = expected[random.integer(0, expected.length - 1)]!;
  const right = expected[random.integer(0, expected.length - 1)]!;
  const start = Temporal.ZonedDateTime.compare(left, right) <= 0 ? left : right;
  const end = start === left ? right : left;
  for (const inclusive of [false, true]) {
    const window = expected.filter((value) =>
      inclusive
        ? value.epochNanoseconds >= start.epochNanoseconds && value.epochNanoseconds <= end.epochNanoseconds
        : value.epochNanoseconds > start.epochNanoseconds && value.epochNanoseconds < end.epochNanoseconds,
    );
    expect(epochList(rule.between(start, end, inclusive)), `${label}: between, inclusive=${inclusive}`).toEqual(
      epochList(window),
    );
  }

  const dtstart = (options as {dtstart: Temporal.ZonedDateTime}).dtstart;
  const occurrenceDay = new Temporal.ZonedDateTime(
    random.pick(expected).epochNanoseconds,
    dtstart.timeZoneId,
  ).toPlainDate();
  for (const day of [occurrenceDay.subtract({days: 1}), occurrenceDay, occurrenceDay.add({days: 1})]) {
    const expectedResult = expected.some(
      (value) =>
        new Temporal.ZonedDateTime(value.epochNanoseconds, dtstart.timeZoneId).toPlainDate().toString() ===
        day.toString(),
    );
    expect(rule.occursOn(day), `${label}: occursOn ${day}`).toBe(expectedResult);
  }

  return (rule as InspectableRule).numericQueryPlanCache?.kind ?? null;
}

const casesPerFamily = positiveIntegerEnvironmentValue('RRULE_FUZZ_CASES', DEFAULT_CASES_PER_FAMILY);
const seed = seedEnvironmentValue();

describe(`numeric query differential fuzzing (seed=0x${seed.toString(16)})`, () => {
  it(`matches ${casesPerFamily} randomized YEARLY occurrence sets`, () => {
    const random = createRandom(seed);
    let optimizedCases = 0;
    for (let index = 0; index < casesPerFamily; index++) {
      if (verifyQueries(yearlyOptions(random, index), random, `YEARLY case ${index}`) === 'yearly') optimizedCases++;
    }
    expect(optimizedCases).toBeGreaterThanOrEqual(Math.floor(casesPerFamily * 0.8));
  });

  it(`matches ${casesPerFamily} randomized RDATE/EXDATE occurrence sets`, () => {
    const random = createRandom(seed ^ 0xa5a5a5a5);
    const optimizedKinds = new Set<string>();
    for (let index = 0; index < casesPerFamily; index++) {
      const base = exceptionBaseOptions(random, index);
      const baseDates = new RRuleTemporal(base).all();
      const dtstart = (base as {dtstart: Temporal.ZonedDateTime}).dtstart;
      const middleExtra = baseDates[Math.floor(baseDates.length / 2)]!.add({nanoseconds: 137});
      const duplicate = random.pick(baseDates);
      const options = {
        ...base,
        rDate: random.shuffle([
          baseDates.at(-1)!.add({hours: 1, nanoseconds: 79}),
          middleExtra,
          dtstart.subtract({hours: 1}).add({nanoseconds: 31}),
          duplicate,
          middleExtra,
        ]),
        exDate: random.shuffle([
          random.pick(baseDates),
          ...(index % 3 === 0 ? [middleExtra] : []),
          ...(index % 7 === 0 ? [duplicate] : []),
        ]),
      } as RRuleOptions;
      const kind = verifyQueries(options, random, `exception case ${index}`);
      if (kind) optimizedKinds.add(kind);
    }
    expect(optimizedKinds).toEqual(new Set(['fixed-step', 'daily', 'weekly', 'monthly', 'yearly']));
  });
});

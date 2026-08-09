const MS_PER_DAY: f64 = 86_400_000.0;
const MIN_TEMPORAL_EPOCH_MS: f64 = -8_640_000_000_000_000.0;
const MAX_TEMPORAL_EPOCH_MS: f64 = 8_640_000_000_000_000.0;
const MIN_SAFE_MONTH_INDEX: i64 = -3_261_840;
const MAX_SAFE_MONTH_INDEX: i64 = 3_309_119;

const STATUS_CAPACITY: i32 = -1;
const STATUS_MAX_ITERATIONS: i32 = -2;
const STATUS_UNSUPPORTED: i32 = -3;

@inline
function epochInTemporalRange(epochMilliseconds: f64): bool {
  return epochMilliseconds >= MIN_TEMPORAL_EPOCH_MS && epochMilliseconds <= MAX_TEMPORAL_EPOCH_MS;
}

@inline
function writeEpoch(outputPtr: i32, capacity: i32, index: i32, epochMilliseconds: f64): bool {
  if (index >= capacity) return false;
  store<f64>(outputPtr + (index << 3), epochMilliseconds);
  return true;
}

@inline
function countReached(emitted: i32, countLimit: i32): bool {
  return countLimit >= 0 && emitted >= countLimit;
}

@inline
function dayAllowed(dayOfWeek: i32, weekdayMask: i32): bool {
  return weekdayMask == 0 || (weekdayMask & (1 << (dayOfWeek - 1))) != 0;
}

@inline
function addIsoDays(dayOfWeek: i32, deltaDays: i32): i32 {
  let value = (dayOfWeek - 1 + (deltaDays % 7)) % 7;
  if (value < 0) value += 7;
  return value + 1;
}

@inline
function isoDayOfWeekOfEpochDay(epochDay: i32): i32 {
  let value = (epochDay + 3) % 7;
  if (value < 0) value += 7;
  return value + 1;
}

@inline
function floorDiv(value: i32, divisor: i32): i32 {
  let quotient = value / divisor;
  const remainder = value % divisor;
  if (remainder != 0 && ((remainder < 0) != (divisor < 0))) quotient -= 1;
  return quotient;
}

@inline
function isLeapYear(year: i32): bool {
  return year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
}

@inline
function daysInMonth(year: i32, month: i32): i32 {
  if (month == 2) return isLeapYear(year) ? 29 : 28;
  if (month == 4 || month == 6 || month == 9 || month == 11) return 30;
  return 31;
}

/** Days since 1970-01-01 for a proleptic-Gregorian civil date. */
@inline
function daysFromCivil(yearInput: i32, month: i32, day: i32): i32 {
  let year = yearInput;
  if (month <= 2) year -= 1;
  const era = floorDiv(year, 400);
  const yearOfEra = year - era * 400;
  const adjustedMonth = month + (month > 2 ? -3 : 9);
  const dayOfYear = (153 * adjustedMonth + 2) / 5 + day - 1;
  const dayOfEra = yearOfEra * 365 + yearOfEra / 4 - yearOfEra / 100 + dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
}

@inline
function monthDayAllowed(day: i32, lastDay: i32, positiveMask: i32, negativeMask: i32): bool {
  if (positiveMask == 0 && negativeMask == 0) return true;
  if ((positiveMask & (1 << (day - 1))) != 0) return true;
  const reverseDay = lastDay - day + 1;
  return (negativeMask & (1 << (reverseDay - 1))) != 0;
}

@inline
function candidateDayAllowed(
  day: i32,
  firstDayOfWeek: i32,
  lastDay: i32,
  weekdayMask: i32,
  positiveMonthDayMask: i32,
  negativeMonthDayMask: i32,
): bool {
  const monthDayMatches = monthDayAllowed(day, lastDay, positiveMonthDayMask, negativeMonthDayMask);
  if (!monthDayMatches) return false;
  if (weekdayMask == 0) return positiveMonthDayMask != 0 || negativeMonthDayMask != 0;
  return dayAllowed(addIsoDays(firstDayOfWeek, day - 1), weekdayMask);
}

@inline
function selectedMultiplicity(candidateIndex: i32, candidateCount: i32, setPosPtr: i32, setPosCount: i32): i32 {
  if (setPosCount == 0) return 1;
  let matches = 0;
  for (let i = 0; i < setPosCount; i++) {
    const position = load<i32>(setPosPtr + (i << 2));
    const selectedIndex = position > 0 ? position - 1 : candidateCount + position;
    if (selectedIndex == candidateIndex) matches += 1;
  }
  return matches;
}

export function generateFixedStep(
  startMs: f64,
  stepMs: f64,
  untilMs: f64,
  hasUntil: i32,
  countLimit: i32,
  maxIterations: i32,
  outputPtr: i32,
  capacity: i32,
): i32 {
  let currentMs = startMs;
  let emitted = 0;
  let iterations = 0;

  while (true) {
    iterations += 1;
    if (iterations > maxIterations) return STATUS_MAX_ITERATIONS;
    if (hasUntil != 0 && currentMs > untilMs) break;
    if (!epochInTemporalRange(currentMs)) return STATUS_UNSUPPORTED;
    if (!writeEpoch(outputPtr, capacity, emitted, currentMs)) return STATUS_CAPACITY;
    emitted += 1;
    if (countReached(emitted, countLimit)) break;
    currentMs += stepMs;
  }

  return emitted;
}

export function generateDaily(
  startMs: f64,
  stepDays: i32,
  startDayOfWeek: i32,
  weekdayMask: i32,
  untilMs: f64,
  hasUntil: i32,
  countLimit: i32,
  maxIterations: i32,
  outputPtr: i32,
  capacity: i32,
): i32 {
  let currentMs = startMs;
  let currentDayOfWeek = startDayOfWeek;

  if (weekdayMask != 0) {
    let steps = 0;
    while (steps < 7 && !dayAllowed(currentDayOfWeek, weekdayMask)) {
      currentMs += <f64>stepDays * MS_PER_DAY;
      currentDayOfWeek = addIsoDays(currentDayOfWeek, stepDays);
      steps += 1;
    }
    if (!dayAllowed(currentDayOfWeek, weekdayMask)) return 0;
  }

  let emitted = 0;
  let iterations = 0;
  while (true) {
    iterations += 1;
    if (iterations > maxIterations) return STATUS_MAX_ITERATIONS;
    if (hasUntil != 0 && currentMs > untilMs) break;

    if (dayAllowed(currentDayOfWeek, weekdayMask)) {
      if (!epochInTemporalRange(currentMs)) return STATUS_UNSUPPORTED;
      if (!writeEpoch(outputPtr, capacity, emitted, currentMs)) return STATUS_CAPACITY;
      emitted += 1;
      if (countReached(emitted, countLimit)) break;
    }

    currentMs += <f64>stepDays * MS_PER_DAY;
    currentDayOfWeek = addIsoDays(currentDayOfWeek, stepDays);
  }

  return emitted;
}

export function generateDailyExpanded(
  startWallMs: f64,
  stepDays: i32,
  startDayOfWeek: i32,
  weekdayMask: i32,
  timeSlotsPtr: i32,
  timeSlotCount: i32,
  untilMs: f64,
  hasUntil: i32,
  countLimit: i32,
  maxIterations: i32,
  outputPtr: i32,
  capacity: i32,
): i32 {
  let epochDay = <i64>Math.floor(startWallMs / MS_PER_DAY);
  let currentDayOfWeek = startDayOfWeek;

  if (weekdayMask != 0) {
    let offset = 0;
    while (offset < 7 && !dayAllowed(currentDayOfWeek, weekdayMask)) {
      epochDay += 1;
      currentDayOfWeek = addIsoDays(currentDayOfWeek, 1);
      offset += 1;
    }
    if (!dayAllowed(currentDayOfWeek, weekdayMask)) return 0;
  }

  let emitted = 0;
  let iterations = 0;
  while (true) {
    iterations += 1;
    if (iterations > maxIterations) return STATUS_MAX_ITERATIONS;

    if (dayAllowed(currentDayOfWeek, weekdayMask)) {
      const dayStartMs = <f64>epochDay * MS_PER_DAY;
      for (let slotIndex = 0; slotIndex < timeSlotCount; slotIndex++) {
        const occurrenceMs = dayStartMs + load<f64>(timeSlotsPtr + (slotIndex << 3));
        if (occurrenceMs < startWallMs) continue;
        if (hasUntil != 0 && occurrenceMs > untilMs) return emitted;
        if (!epochInTemporalRange(occurrenceMs)) return STATUS_UNSUPPORTED;
        if (!writeEpoch(outputPtr, capacity, emitted, occurrenceMs)) return STATUS_CAPACITY;
        emitted += 1;
        if (countReached(emitted, countLimit)) return emitted;
      }
    }

    epochDay += <i64>stepDays;
    currentDayOfWeek = addIsoDays(currentDayOfWeek, stepDays);
  }
}

export function generateWeekly(
  startWallMs: f64,
  startDayOfWeek: i32,
  weekStartDay: i32,
  intervalWeeks: i32,
  weekdayMask: i32,
  timeSlotsPtr: i32,
  timeSlotCount: i32,
  untilMs: f64,
  hasUntil: i32,
  countLimit: i32,
  maxIterations: i32,
  outputPtr: i32,
  capacity: i32,
): i32 {
  const startEpochDay = <i64>Math.floor(startWallMs / MS_PER_DAY);
  const weekStartOffset = (startDayOfWeek - weekStartDay + 7) % 7;
  let currentWeekStartDay = startEpochDay - weekStartOffset;
  let emitted = 0;
  let iterations = 0;

  while (true) {
    iterations += 1;
    if (iterations > maxIterations) return STATUS_MAX_ITERATIONS;

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const isoDay = addIsoDays(weekStartDay, dayOffset);
      if (!dayAllowed(isoDay, weekdayMask)) continue;
      const dayStartMs = <f64>(currentWeekStartDay + dayOffset) * MS_PER_DAY;
      for (let slotIndex = 0; slotIndex < timeSlotCount; slotIndex++) {
        const occurrenceMs = dayStartMs + load<f64>(timeSlotsPtr + (slotIndex << 3));
        if (occurrenceMs < startWallMs) continue;
        if (hasUntil != 0 && occurrenceMs > untilMs) return emitted;
        if (!epochInTemporalRange(occurrenceMs)) return STATUS_UNSUPPORTED;
        if (!writeEpoch(outputPtr, capacity, emitted, occurrenceMs)) return STATUS_CAPACITY;
        emitted += 1;
        if (countReached(emitted, countLimit)) return emitted;
      }
    }

    currentWeekStartDay += <i64>intervalWeeks * 7;
  }
}

export function generateMonthly(
  startWallMs: f64,
  startYear: i32,
  startMonth: i32,
  intervalMonths: i32,
  monthMask: i32,
  weekdayMask: i32,
  positiveMonthDayMask: i32,
  negativeMonthDayMask: i32,
  timeSlotsPtr: i32,
  timeSlotCount: i32,
  setPosPtr: i32,
  setPosCount: i32,
  untilMs: f64,
  hasUntil: i32,
  countLimit: i32,
  maxIterations: i32,
  outputPtr: i32,
  capacity: i32,
): i32 {
  let monthIndex = <i64>startYear * 12 + startMonth - 1;
  let emitted = 0;
  let iterations = 0;

  while (true) {
    iterations += 1;
    if (iterations > maxIterations) return STATUS_MAX_ITERATIONS;
    if (monthIndex < MIN_SAFE_MONTH_INDEX || monthIndex > MAX_SAFE_MONTH_INDEX) return STATUS_UNSUPPORTED;

    const monthIndexI32 = <i32>monthIndex;
    const year = floorDiv(monthIndexI32, 12);
    const month = monthIndexI32 - year * 12 + 1;
    if (monthMask == 0 || (monthMask & (1 << (month - 1))) != 0) {
      const lastDay = daysInMonth(year, month);
      const monthStartDay = daysFromCivil(year, month, 1);
      const firstDayOfWeek = isoDayOfWeekOfEpochDay(monthStartDay);
      let candidateCount = 0;

      for (let day = 1; day <= lastDay; day++) {
        if (
          candidateDayAllowed(
            day,
            firstDayOfWeek,
            lastDay,
            weekdayMask,
            positiveMonthDayMask,
            negativeMonthDayMask,
          )
        ) {
          candidateCount += timeSlotCount;
        }
      }

      let candidateIndex = 0;
      for (let day = 1; day <= lastDay; day++) {
        if (
          !candidateDayAllowed(
            day,
            firstDayOfWeek,
            lastDay,
            weekdayMask,
            positiveMonthDayMask,
            negativeMonthDayMask,
          )
        ) {
          continue;
        }

        const dayStartMs = <f64>(monthStartDay + day - 1) * MS_PER_DAY;
        for (let slotIndex = 0; slotIndex < timeSlotCount; slotIndex++) {
          const occurrenceMs = dayStartMs + load<f64>(timeSlotsPtr + (slotIndex << 3));
          const multiplicity = selectedMultiplicity(candidateIndex, candidateCount, setPosPtr, setPosCount);
          candidateIndex += 1;
          if (occurrenceMs < startWallMs || multiplicity == 0) continue;
          if (hasUntil != 0 && occurrenceMs > untilMs) return emitted;
          if (!epochInTemporalRange(occurrenceMs)) return STATUS_UNSUPPORTED;
          for (let duplicate = 0; duplicate < multiplicity; duplicate++) {
            if (!writeEpoch(outputPtr, capacity, emitted, occurrenceMs)) return STATUS_CAPACITY;
            emitted += 1;
            if (countReached(emitted, countLimit)) return emitted;
          }
        }
      }
    }

    monthIndex += <i64>intervalMonths;
  }
}

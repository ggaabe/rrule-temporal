const MS_PER_SECOND = 1_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

// Sampling step for discovering offset transitions. Real tzdb offset regimes
// last multiple weeks at minimum (the shortest in practice are ~4-week
// Ramadan DST suspensions), so 15-day sampling cannot skip over one.
const SAMPLE_STEP_MS = 15 * MS_PER_DAY;
// Extra coverage built around requested instants so tables rarely rebuild.
const COVERAGE_MARGIN_MS = 400 * MS_PER_DAY;
// A UTC offset can never exceed ±18h (RFC 5545 / Temporal both cap at ±14h in
// practice), so probes ±30h from a wall time bracket its possible instants.
const PROBE_DISTANCE_MS = 30 * MS_PER_HOUR;

export interface WallResolution {
  epochMs: number;
  /** True when the wall time falls in a DST gap and was pushed forward. */
  pushed: boolean;
}

function parseFixedOffsetMs(tzid: string): number | null {
  if (tzid === 'UTC' || tzid === 'Etc/UTC' || tzid === 'Etc/GMT') return 0;
  const match = /^([+-])(\d{2}):?(\d{2})(?::?(\d{2}))?$/.exec(tzid);
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  return sign * ((Number(match[2]) * 60 + Number(match[3])) * 60 + Number(match[4] ?? 0)) * MS_PER_SECOND;
}

/**
 * Resolves IANA time zone offsets with a lazily built transition table, so
 * hot loops can convert between wall-clock time and epoch time in O(log n)
 * integer operations instead of going through a Temporal implementation.
 *
 * Wall-clock times are represented as "milliseconds since 1970-01-01T00:00
 * as if the local time were UTC" — the natural output of integer calendar
 * math and `Date.UTC`.
 */
export class ZoneOffsetResolver {
  private readonly fixedOffsetMs: number | null;
  private dtf?: Intl.DateTimeFormat;
  /** transitions[i] is the instant at which offsets[i + 1] takes effect. */
  private transitions: number[] = [];
  private offsets: number[] = [];
  private coverStart = 0;
  private coverEnd = 0;
  private covered = false;

  constructor(private readonly tzid: string) {
    this.fixedOffsetMs = parseFixedOffsetMs(tzid);
  }

  private formatter(): Intl.DateTimeFormat {
    return (this.dtf ??= new Intl.DateTimeFormat('en-US', {
      timeZone: this.tzid,
      hourCycle: 'h23',
      era: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }));
  }

  /** Exact offset via Intl (expensive; only used while building tables). */
  private exactOffsetMs(epochMs: number): number {
    const parts = this.formatter().formatToParts(epochMs);
    let year = 0;
    let bce = false;
    let month = 1;
    let day = 1;
    let hour = 0;
    let minute = 0;
    let second = 0;
    for (const part of parts) {
      switch (part.type) {
        case 'year':
          year = Number(part.value);
          break;
        case 'era':
          bce = part.value === 'BC' || part.value === 'B';
          break;
        case 'month':
          month = Number(part.value);
          break;
        case 'day':
          day = Number(part.value);
          break;
        case 'hour':
          hour = Number(part.value) % 24;
          break;
        case 'minute':
          minute = Number(part.value);
          break;
        case 'second':
          second = Number(part.value);
          break;
      }
    }
    if (bce) year = 1 - year;
    // Date.UTC misinterprets years 0-99; build via setUTCFullYear instead.
    const wall = new Date(0);
    wall.setUTCFullYear(year, month - 1, day);
    wall.setUTCHours(hour, minute, second, 0);
    // formatToParts is second-granular; align the epoch the same way.
    return wall.getTime() - Math.floor(epochMs / MS_PER_SECOND) * MS_PER_SECOND;
  }

  private ensureCoverage(fromMs: number, toMs: number): void {
    if (this.fixedOffsetMs !== null) return;
    if (this.covered && fromMs >= this.coverStart && toMs <= this.coverEnd) return;

    let newStart = Math.min(fromMs, this.covered ? this.coverStart : fromMs) - COVERAGE_MARGIN_MS;
    let newEnd = Math.max(toMs, this.covered ? this.coverEnd : toMs) + COVERAGE_MARGIN_MS;
    if (this.covered) {
      // Grow exponentially so repeated near-miss queries amortize rebuilds.
      const grownSpan = Math.max(newEnd - newStart, 2 * (this.coverEnd - this.coverStart));
      if (newStart < this.coverStart) newStart = Math.min(newStart, newEnd - grownSpan);
      if (newEnd > this.coverEnd) newEnd = Math.max(newEnd, newStart + grownSpan);
    }
    this.rebuild(newStart, newEnd);
  }

  private rebuild(startMs: number, endMs: number): void {
    const transitions: number[] = [];
    const offsets: number[] = [this.exactOffsetMs(startMs)];

    let cursor = startMs;
    let cursorOffset = offsets[0]!;
    while (cursor < endMs) {
      const next = Math.min(cursor + SAMPLE_STEP_MS, endMs);
      const nextOffset = this.exactOffsetMs(next);
      if (nextOffset === cursorOffset) {
        cursor = next;
        continue;
      }
      // Binary-search the first second-aligned instant with the new offset.
      let lo = cursor;
      let hi = next;
      while (hi - lo > MS_PER_SECOND) {
        let mid = lo + Math.floor((hi - lo) / 2 / MS_PER_SECOND) * MS_PER_SECOND;
        if (mid <= lo) mid = lo + MS_PER_SECOND;
        if (this.exactOffsetMs(mid) === cursorOffset) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      const transitionOffset = this.exactOffsetMs(hi);
      transitions.push(hi);
      offsets.push(transitionOffset);
      cursor = hi;
      cursorOffset = transitionOffset;
    }

    this.transitions = transitions;
    this.offsets = offsets;
    this.coverStart = startMs;
    this.coverEnd = endMs;
    this.covered = true;
  }

  offsetMsAt(epochMs: number): number {
    if (this.fixedOffsetMs !== null) return this.fixedOffsetMs;
    this.ensureCoverage(epochMs, epochMs);
    const transitions = this.transitions;
    let lo = 0;
    let hi = transitions.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (transitions[mid]! <= epochMs) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return this.offsets[lo]!;
  }

  /**
   * Resolve a local wall-clock time to an instant using RFC 5545 semantics
   * (Temporal's 'compatible' disambiguation): ambiguous times take the
   * earlier interpretation, skipped times are pushed forward past the gap.
   */
  epochMsForWall(wallMs: number): WallResolution {
    if (this.fixedOffsetMs !== null) {
      return {epochMs: wallMs - this.fixedOffsetMs, pushed: false};
    }
    this.ensureCoverage(wallMs - PROBE_DISTANCE_MS, wallMs + PROBE_DISTANCE_MS);

    const offsetBefore = this.offsetMsAt(wallMs - PROBE_DISTANCE_MS);
    const epochWithBefore = wallMs - offsetBefore;
    if (this.offsetMsAt(epochWithBefore) === offsetBefore) {
      // Unambiguous, or the earlier of two interpretations (fold).
      return {epochMs: epochWithBefore, pushed: false};
    }

    const offsetAfter = this.offsetMsAt(wallMs + PROBE_DISTANCE_MS);
    const epochWithAfter = wallMs - offsetAfter;
    if (this.offsetMsAt(epochWithAfter) === offsetAfter) {
      return {epochMs: epochWithAfter, pushed: false};
    }

    // DST gap: push forward using the pre-transition offset.
    return {epochMs: epochWithBefore, pushed: true};
  }

  /**
   * True if the given wall-clock time of day can fall inside a DST gap for
   * any transition within [fromEpochMs, toEpochMs]. Used by fast paths to
   * detect rules whose nominal local time may be skipped by a transition —
   * those defer to the general engine, whose cursor-chaining semantics
   * across gaps are the observable behavior.
   */
  timeOfDayMayHitGap(timeOfDayMs: number, fromEpochMs: number, toEpochMs: number): boolean {
    if (this.fixedOffsetMs !== null) return false;
    this.ensureCoverage(fromEpochMs, toEpochMs);
    for (let i = 0; i < this.transitions.length; i++) {
      const transition = this.transitions[i]!;
      if (transition < fromEpochMs || transition > toEpochMs) continue;
      const offsetBefore = this.offsets[i]!;
      const offsetAfter = this.offsets[i + 1]!;
      const gapMs = offsetAfter - offsetBefore;
      if (gapMs <= 0) continue; // fall-back transitions create folds, not gaps
      const gapStartTod = (((transition + offsetBefore) % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY;
      const delta = timeOfDayMs - gapStartTod;
      // Modular comparison so gap windows crossing midnight are handled.
      const within = delta >= 0 ? delta < gapMs : delta + MS_PER_DAY < gapMs;
      if (within) return true;
    }
    return false;
  }
}

const resolverCache = new Map<string, ZoneOffsetResolver>();

export function getZoneOffsetResolver(tzid: string): ZoneOffsetResolver {
  let resolver = resolverCache.get(tzid);
  if (!resolver) {
    resolver = new ZoneOffsetResolver(tzid);
    resolverCache.set(tzid, resolver);
  }
  return resolver;
}

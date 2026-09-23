import {Temporal, isNativeTemporal} from './temporal-impl';

const MS_PER_SECOND = 1_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

// temporal-polyfill's forward transition search stops about three years past
// the later of its starting instant and the current time, so `null` there only
// means "none within that horizon". Resume well inside it rather than at it.
const POLYFILL_RESUME_STEP_MS = 180 * MS_PER_DAY;
// Extra coverage built around requested instants so tables rarely rebuild.
const COVERAGE_MARGIN_MS = 400 * MS_PER_DAY;
// A UTC offset can never exceed ±18h (RFC 5545 / Temporal both cap at ±14h in
// practice), so probes ±30h from a wall time bracket its possible instants.
const PROBE_DISTANCE_MS = 30 * MS_PER_HOUR;
// Temporal instants lie within ±10^8 days of the epoch.
const MAX_EPOCH_MS = 8_640_000_000_000_000;

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
  /** transitions[i] is the instant at which offsets[i + 1] takes effect. */
  private transitions: number[] = [];
  private offsets: number[] = [];
  private coverStart = 0;
  private coverEnd = 0;
  private covered = false;

  constructor(private readonly tzid: string) {
    this.fixedOffsetMs = parseFixedOffsetMs(tzid);
  }

  private zonedAt(epochMs: number): Temporal.ZonedDateTime {
    return new Temporal.ZonedDateTime(BigInt(epochMs) * 1_000_000n, this.tzid);
  }

  private ensureCoverage(fromMs: number, toMs: number): void {
    if (this.fixedOffsetMs !== null) return;
    if (this.covered && fromMs >= this.coverStart && toMs <= this.coverEnd) return;

    // Extensions scan only the newly covered span, so the margin alone
    // amortizes them. Grow only toward the request: growing both ends on every
    // miss doubled the table away from the queries.
    let newStart = !this.covered || fromMs < this.coverStart ? fromMs - COVERAGE_MARGIN_MS : this.coverStart;
    let newEnd = !this.covered || toMs > this.coverEnd ? toMs + COVERAGE_MARGIN_MS : this.coverEnd;
    // Margins and growth must not push an in-range request out of range.
    newStart = Math.max(newStart, Math.min(fromMs, -MAX_EPOCH_MS));
    newEnd = Math.min(newEnd, Math.max(toMs, MAX_EPOCH_MS));
    // Transition instants are second-aligned. Carrying the requesting
    // occurrence's milliseconds into the binary search shifts every boundary.
    newStart = Math.floor(newStart / MS_PER_SECOND) * MS_PER_SECOND;
    newEnd = Math.ceil(newEnd / MS_PER_SECOND) * MS_PER_SECOND;

    if (!this.covered) {
      const table = this.scan(newStart, newEnd);
      this.transitions = table.transitions;
      this.offsets = table.offsets;
    } else {
      // Scan only the newly covered spans and splice them onto the table.
      if (newStart < this.coverStart) {
        const head = this.scan(newStart, this.coverStart);
        this.transitions = head.transitions.concat(this.transitions);
        this.offsets = head.offsets.concat(this.offsets.slice(1));
      }
      if (newEnd > this.coverEnd) {
        const tail = this.scan(this.coverEnd, newEnd);
        this.transitions = this.transitions.concat(tail.transitions);
        this.offsets = this.offsets.concat(tail.offsets.slice(1));
      }
    }
    this.coverStart = newStart;
    this.coverEnd = newEnd;
    this.covered = true;
  }

  /**
   * Transitions in (startMs, endMs], with offsets[0] in effect at startMs.
   * Reads them from the Temporal implementation that constructs this
   * library's values, so the table agrees with every ZonedDateTime emitted.
   * Probing Intl directly can disagree with the polyfill, whose own sampling
   * misses some short regimes (e.g. Morocco's Ramadan offsets), and costs a
   * formatToParts() call per day of coverage.
   */
  private scan(startMs: number, endMs: number): {transitions: number[]; offsets: number[]} {
    let cursor = this.zonedAt(startMs);
    const transitions: number[] = [];
    const offsets = [cursor.offsetNanoseconds / 1_000_000];
    while (true) {
      const next = cursor.getTimeZoneTransition('next');
      if (next) {
        if (next.epochMilliseconds > endMs) break;
        transitions.push(next.epochMilliseconds);
        offsets.push(next.offsetNanoseconds / 1_000_000);
        cursor = next;
        continue;
      }
      if (isNativeTemporal) break;
      const resumeMs =
        Math.ceil((Math.max(cursor.epochMilliseconds, Date.now()) + POLYFILL_RESUME_STEP_MS) / MS_PER_SECOND) *
        MS_PER_SECOND;
      if (resumeMs >= endMs || resumeMs > MAX_EPOCH_MS) break;
      const resumed = this.zonedAt(resumeMs);
      const lastOffset = offsets[offsets.length - 1]!;
      if (resumed.offsetNanoseconds / 1_000_000 !== lastOffset) {
        // Only reachable if the polyfill's search horizon shrinks below the
        // resume step: bisect to the second for the transition it skipped.
        let lo = cursor.epochMilliseconds;
        let hi = resumeMs;
        while (hi - lo > MS_PER_SECOND) {
          let mid = lo + Math.floor((hi - lo) / 2 / MS_PER_SECOND) * MS_PER_SECOND;
          if (mid <= lo) mid = lo + MS_PER_SECOND;
          if (this.zonedAt(mid).offsetNanoseconds / 1_000_000 === lastOffset) lo = mid;
          else hi = mid;
        }
        transitions.push(hi);
        offsets.push(this.zonedAt(hi).offsetNanoseconds / 1_000_000);
      }
      cursor = resumed;
    }
    return {transitions, offsets};
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
    const transitions = this.transitions;
    let first = 0;
    let last = transitions.length;
    while (first < last) {
      const mid = (first + last) >> 1;
      if (transitions[mid]! < fromEpochMs) first = mid + 1;
      else last = mid;
    }
    for (let i = first; i < transitions.length && transitions[i]! <= toEpochMs; i++) {
      const transition = transitions[i]!;
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

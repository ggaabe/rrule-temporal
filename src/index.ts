// rrule-temporal.ts
// A robust RFC-5545 RRule implementation using the Temporal polyfill
// Supports FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, BYHOUR, BYMINUTE, DTSTART, UNTIL, COUNT, TZID

import { Temporal } from "@js-temporal/polyfill";

// Allowed frequency values
type Freq =
  | "YEARLY"
  | "MONTHLY"
  | "WEEKLY"
  | "DAILY"
  | "HOURLY"
  | "MINUTELY"
  | "SECONDLY";

interface RRuleOptions {
  freq: Freq;
  interval: number;
  count?: number;
  until?: Temporal.ZonedDateTime;
  byHour?: number[];
  byMinute?: number[];
  dtstart: Temporal.ZonedDateTime;
  tzid?: string;
}

/**
 * Parse either a full ICS snippet or an RRULE line into ManualOpts
 * Accepts:
 *  - "DTSTART...\nRRULE:..." ICS snippet
 *  - "RRULE:..." alone (dtstart must be provided by caller)
 */
function parseRRuleString(
  input: string,
  fallbackDtstart?: Temporal.ZonedDateTime
): ManualOpts {
  let dtstart: Temporal.ZonedDateTime;
  let tzid: string = "";
  let rruleLine: string;

  console.log("input", input);

  if (/^DTSTART/m.test(input)) {
    // ICS snippet: split DTSTART and RRULE
    const [dtLine, rrLine] = input.split(/\r?\n/);
    const m = dtLine?.match(/DTSTART(?:;TZID=([^:]+))?:(\d{8}T\d{6})/);
    if (!m) throw new Error("Invalid DTSTART in ICS snippet");
    tzid = m[1] || tzid;
    const isoDate = `${m[2]!.slice(0, 4)}-${m[2]!.slice(4, 6)}-${m[2]!.slice(
      6,
      8
    )}T${m[2]!.slice(9)}`;
    dtstart = Temporal.PlainDateTime.from(isoDate).toZonedDateTime(tzid);
    rruleLine = rrLine!;
  } else {
    // Only RRULE line; require fallback
    if (!fallbackDtstart)
      throw new Error("dtstart required when parsing RRULE alone");
    dtstart = fallbackDtstart;
    tzid = fallbackDtstart.timeZoneId;
    rruleLine = input.replace(/^RRULE:/, "RRULE:");
  }

  // Parse RRULE
  const parts = rruleLine.replace(/^RRULE:/, "").split(";");
  const opts: ManualOpts = { dtstart, tzid, freq: "DAILY" } as any;
  for (const part of parts) {
    const [key, val] = part.split("=");
    switch (key) {
      case "FREQ":
        opts.freq = val as Freq;
        break;
      case "INTERVAL":
        opts.interval = parseInt(val!, 10);
        break;
      case "COUNT":
        opts.count = parseInt(val!, 10);
        break;
      case "UNTIL": {
        // RFC5545 UNTIL is YYYYMMDDTHHMMSSZ or without Z
        if (/Z$/.test(val!)) {
          const iso = `${val!.slice(0, 4)}-${val!.slice(4, 6)}-${val!.slice(
            6,
            8
          )}T${val!.slice(9, 15)}Z`;
          opts.until = Temporal.Instant.from(iso).toZonedDateTimeISO(
            tzid || "UTC"
          );
        } else {
          const iso = `${val!.slice(0, 4)}-${val!.slice(4, 6)}-${val!.slice(
            6,
            8
          )}T${val!.slice(9, 15)}`;
          opts.until = Temporal.PlainDateTime.from(iso).toZonedDateTime(
            tzid || "UTC"
          );
        }
        break;
      }
      case "BYHOUR":
        opts.byHour = val!.split(",").map((n) => parseInt(n, 10));
        break;
      case "BYMINUTE":
        opts.byMinute = val!.split(",").map((n) => parseInt(n, 10));
        break;
    }
  }

  return opts;
}

interface BaseOpts {
  tzid?: string;
}
interface ManualOpts extends BaseOpts {
  freq: Freq;
  interval?: number;
  count?: number;
  until?: Temporal.ZonedDateTime;
  byHour?: number[];
  byMinute?: number[];
  dtstart: string | Temporal.ZonedDateTime;
}
interface IcsOpts extends BaseOpts {
  rruleString: string; // full "DTSTART...\nRRULE..." snippet
}
export type RRuleOpts = ManualOpts | IcsOpts;
export class RRuleTemporal {
  private tzid: string;
  private originalDtstart: Temporal.ZonedDateTime;

  private opts: ManualOpts;

  constructor(params: { rruleString: string } | ManualOpts) {
    let manual: ManualOpts;
    if ("rruleString" in params) {
      // parse full ICS snippet
      manual = parseRRuleString(params.rruleString);
      this.tzid = manual.tzid || "UTC";
      this.originalDtstart = manual.dtstart as Temporal.ZonedDateTime;
    } else {
      // manual options
      manual = { ...params };
      if (typeof manual.dtstart === "string") {
        throw new Error("Manual dtstart must be a ZonedDateTime");
      }
      manual.tzid = manual.tzid || manual.dtstart.timeZoneId;
      this.tzid = manual.tzid;
      this.originalDtstart = manual.dtstart as Temporal.ZonedDateTime;
    }
    if (!manual.freq) throw new Error("RRULE must include FREQ");
    // default interval
    manual.interval = manual.interval ?? 1;
    this.opts = manual;
  }

  private rawAdvance(zdt: Temporal.ZonedDateTime): Temporal.ZonedDateTime {
    const { freq, interval } = this.opts;
    switch (freq) {
      case "DAILY":
        return zdt.add({ days: interval });
      case "WEEKLY":
        return zdt.add({ weeks: interval });
      case "MONTHLY":
        return zdt.add({ months: interval });
      case "YEARLY":
        return zdt.add({ years: interval });
      case "HOURLY":
        return zdt.add({ hours: interval });
      case "MINUTELY":
        return zdt.add({ minutes: interval });
      case "SECONDLY":
        return zdt.add({ seconds: interval });
      default:
        throw new Error(`Unsupported FREQ: ${freq}`);
    }
  }

  private applyTimeOverride(
    zdt: Temporal.ZonedDateTime
  ): Temporal.ZonedDateTime {
    const { byHour, byMinute } = this.opts;
    let dt = zdt;
    if (byHour) dt = dt.with({ hour: byHour[0] });
    if (byMinute) dt = dt.with({ minute: byMinute[0] });
    return dt;
  }

  private computeFirst(): Temporal.ZonedDateTime {
    const { byHour, byMinute } = this.opts;
    let candidate = this.originalDtstart;
    if (byHour || byMinute) {
      candidate = this.applyTimeOverride(candidate);
      if (
        Temporal.Instant.compare(
          candidate.toInstant(),
          this.originalDtstart.toInstant()
        ) < 0
      ) {
        candidate = this.applyTimeOverride(
          this.rawAdvance(this.originalDtstart)
        );
      }
    }
    return candidate;
  }

  all(
    iterator?: (date: Temporal.ZonedDateTime, i: number) => boolean
  ): Temporal.ZonedDateTime[] {
    if (!this.opts.count && !this.opts.until && !iterator) {
      throw new Error("all() requires iterator when no COUNT/UNTIL");
    }
    const dates: Temporal.ZonedDateTime[] = [];
    let current = this.computeFirst();
    let i = 0;
    while (true) {
      if (
        this.opts.until &&
        Temporal.ZonedDateTime.compare(current, this.opts.until) > 0
      )
        break;
      if (this.opts.count !== undefined && i >= this.opts.count) break;
      if (iterator && !iterator(current, i)) break;
      dates.push(current);
      const base = this.rawAdvance(current);
      current = this.applyTimeOverride(base);
      i++;
    }
    return dates;
  }

  between(
    after: Date | Temporal.ZonedDateTime,
    before: Date | Temporal.ZonedDateTime,
    inc = false
  ): Temporal.ZonedDateTime[] {
    const startInst =
      after instanceof Date
        ? Temporal.Instant.from(after.toISOString())
        : after.toInstant();
    const endInst =
      before instanceof Date
        ? Temporal.Instant.from(before.toISOString())
        : before.toInstant();
    const results: Temporal.ZonedDateTime[] = [];
    let current = this.computeFirst();
    while (true) {
      const inst = current.toInstant();
      // NEW: we break *earlier* when exclusive
      if (inc) {
        // inclusive: keep inst ≤ endInst, so only break when inst > endInst
        if (Temporal.Instant.compare(inst, endInst) > 0) break;
      } else {
        // exclusive: drop inst ≥ endInst, so break when inst ≥ endInst
        if (Temporal.Instant.compare(inst, endInst) >= 0) break;
      }

      // push any inst ≥ startInst
      if (Temporal.Instant.compare(inst, startInst) >= 0) {
        results.push(current);
      }
      current = this.applyTimeOverride(this.rawAdvance(current));
    }
    return results;
  }

  next(
    after: Date | Temporal.ZonedDateTime = new Date(),
    inc = false
  ): Temporal.ZonedDateTime | null {
    const afterInst =
      after instanceof Date
        ? Temporal.Instant.from(after.toISOString())
        : after.toInstant();
    let current = this.computeFirst();
    let i = 0;
    while (true) {
      const inst = current.toInstant();
      if (
        inc
          ? Temporal.Instant.compare(inst, afterInst) >= 0
          : Temporal.Instant.compare(inst, afterInst) > 0
      )
        return current;
      if (this.opts.count !== undefined && i >= this.opts.count - 1)
        return null;
      if (
        this.opts.until &&
        Temporal.ZonedDateTime.compare(current, this.opts.until) >= 0
      )
        return null;
      current = this.applyTimeOverride(this.rawAdvance(current));
      i++;
    }
  }

  previous(
    before: Date | Temporal.ZonedDateTime = new Date(),
    inc = false
  ): Temporal.ZonedDateTime | null {
    const beforeInst =
      before instanceof Date
        ? Temporal.Instant.from(before.toISOString())
        : before.toInstant();
    let current = this.computeFirst();
    let prev: Temporal.ZonedDateTime | null = null;
    let i = 0;
    while (true) {
      const inst = current.toInstant();
      if (
        inc
          ? Temporal.Instant.compare(inst, beforeInst) > 0
          : Temporal.Instant.compare(inst, beforeInst) >= 0
      )
        break;
      prev = current;
      if (this.opts.count !== undefined && i >= this.opts.count - 1) break;
      if (
        this.opts.until &&
        Temporal.ZonedDateTime.compare(current, this.opts.until) >= 0
      )
        break;
      current = this.applyTimeOverride(this.rawAdvance(current));
      i++;
    }
    return prev;
  }

  toString(): string {
    const iso = this.originalDtstart
      .toString({ smallestUnit: "second" })
      .replace(/[-:]/g, "");
    const dtLine = `DTSTART;TZID=${this.tzid}:${iso.slice(0, 15)}`;
    const parts = [];
    const { freq, interval, count, byHour, byMinute } = this.opts;
    parts.push(`FREQ=${freq}`);
    if (interval !== 1) parts.push(`INTERVAL=${interval}`);
    if (count !== undefined) parts.push(`COUNT=${count}`);
    if (byHour) parts.push(`BYHOUR=${byHour.join(",")}`);
    if (byMinute) parts.push(`BYMINUTE=${byMinute.join(",")}`);
    return [dtLine, `RRULE:${parts.join(";")}`].join("\n");
  }
}

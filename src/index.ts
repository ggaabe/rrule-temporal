// rrule-temporal.ts
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

// Extended ManualOpts to include BYDAY and BYMONTH
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
  byDay?: string[]; // e.g. ["MO","WE","FR"]
  byMonth?: number[]; // e.g. [1,4,7]
  dtstart: string | Temporal.ZonedDateTime;
}
interface IcsOpts extends BaseOpts {
  rruleString: string; // full "DTSTART...\nRRULE..." snippet
}
export type RRuleOpts = ManualOpts | IcsOpts;

/**
 * Parse either a full ICS snippet or an RRULE line into ManualOpts
 */
function parseRRuleString(
  input: string,
  fallbackDtstart?: Temporal.ZonedDateTime
): ManualOpts {
  let dtstart: Temporal.ZonedDateTime;
  let tzid: string = "";
  let rruleLine: string;

  if (/^DTSTART/m.test(input)) {
    // ICS snippet: split DTSTART and RRULE
    const [dtLine, rrLine] = input.split(/\r?\n/);
    const m = dtLine?.match(/DTSTART(?:;TZID=([^:]+))?:(\d{8}T\d{6})/);
    if (!m) throw new Error("Invalid DTSTART in ICS snippet");
    tzid = m[1] || tzid;
    const isoDate =
      `${m[2]!.slice(0, 4)}-${m[2]!.slice(4, 6)}-${m[2]!.slice(6, 8)}` +
      `T${m[2]!.slice(9)}`;
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
  const opts = { dtstart, tzid } as ManualOpts;
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
          const iso =
            `${val!.slice(0, 4)}-${val!.slice(4, 6)}-` +
            `${val!.slice(6, 8)}T${val!.slice(9, 15)}Z`;
          opts.until = Temporal.Instant.from(iso).toZonedDateTimeISO(
            tzid || "UTC"
          );
        } else {
          const iso =
            `${val!.slice(0, 4)}-${val!.slice(4, 6)}-` +
            `${val!.slice(6, 8)}T${val!.slice(9, 15)}`;
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
      case "BYDAY":
        opts.byDay = val!.split(","); // e.g. ["MO","2FR","-1SU"]
        break;
      case "BYMONTH":
        opts.byMonth = val!.split(",").map((n) => parseInt(n, 10));
        break;
    }
  }

  return opts;
}

export class RRuleTemporal {
  private tzid: string;
  private originalDtstart: Temporal.ZonedDateTime;
  private opts: ManualOpts;

  constructor(params: { rruleString: string } | ManualOpts) {
    let manual: ManualOpts;
    if ("rruleString" in params) {
      manual = parseRRuleString(params.rruleString);
      this.tzid = manual.tzid || "UTC";
      this.originalDtstart = manual.dtstart as Temporal.ZonedDateTime;
    } else {
      manual = { ...params };
      if (typeof manual.dtstart === "string") {
        throw new Error("Manual dtstart must be a ZonedDateTime");
      }
      manual.tzid = manual.tzid || manual.dtstart.timeZoneId;
      this.tzid = manual.tzid;
      this.originalDtstart = manual.dtstart as Temporal.ZonedDateTime;
    }
    if (!manual.freq) throw new Error("RRULE must include FREQ");
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

  // --- NEW: constraint checks ---
  // 2) Replace your matchesByDay with this:
  private matchesByDay(zdt: Temporal.ZonedDateTime): boolean {
    const { byDay } = this.opts;
    if (!byDay) return true;

    // map two‑letter to Temporal dayOfWeek (1=Mon … 7=Sun)
    const dayMap: Record<string, number> = {
      MO: 1,
      TU: 2,
      WE: 3,
      TH: 4,
      FR: 5,
      SA: 6,
      SU: 7,
    };

    for (const token of byDay) {
      // 1) match and destructure
      const m = token.match(/^([+-]?\d)?(MO|TU|WE|TH|FR|SA|SU)$/);
      if (!m) continue;
      const ord = m[1] ? parseInt(m[1], 10) : 0;

      // 2) pull weekday into its own variable and guard
      const weekday = m[2];
      if (!weekday) continue; // now TS knows `weekday` is string

      const wd = dayMap[weekday]; // no more "undefined index" error

      // no ordinal → simple weekday match
      if (ord === 0) {
        if (zdt.dayOfWeek === wd) return true;
        continue;
      }

      // build all days in month with this weekday
      const year = zdt.year;
      const month = zdt.month;
      let dt = zdt.with({ day: 1 });
      const candidates: number[] = [];
      while (dt.month === month) {
        if (dt.dayOfWeek === wd) candidates.push(dt.day);
        dt = dt.add({ days: 1 });
      }

      // pick the “ord-th” entry (supports negative ord)
      const idx = ord > 0 ? ord - 1 : candidates.length + ord;
      if (candidates[idx] === zdt.day) return true;
    }

    return false;
  }

  private matchesByMonth(zdt: Temporal.ZonedDateTime): boolean {
    const { byMonth } = this.opts;
    if (!byMonth) return true;
    return byMonth.includes(zdt.month);
  }

  private matchesAll(zdt: Temporal.ZonedDateTime): boolean {
    return this.matchesByDay(zdt) && this.matchesByMonth(zdt);
  }

  // --- updated all() to only emit matching occurrences ---
  all(
    iterator?: (date: Temporal.ZonedDateTime, i: number) => boolean
  ): Temporal.ZonedDateTime[] {
    if (!this.opts.count && !this.opts.until && !iterator) {
      throw new Error("all() requires iterator when no COUNT/UNTIL");
    }
    const dates: Temporal.ZonedDateTime[] = [];
    let matchCount = 0;

    // --- MONTHLY + BYDAY branch ---
    if (this.opts.freq === "MONTHLY" && this.opts.byDay) {
      const original = this.originalDtstart;
      // start at first-of-month of dtstart
      let monthCursor = original.with({ day: 1 });

      outer: while (true) {
        // expand every 2FR/4FR/etc in this month
        const occs = this.generateMonthlyOccurrences(monthCursor);

        for (const occ of occs) {
          // 1) stop on UNTIL
          if (
            this.opts.until &&
            Temporal.ZonedDateTime.compare(occ, this.opts.until) > 0
          ) {
            break outer;
          }
          // 2) skip anything before dtstart
          if (Temporal.ZonedDateTime.compare(occ, original) < 0) {
            continue;
          }
          // 3) stop on COUNT
          if (this.opts.count !== undefined && matchCount >= this.opts.count) {
            break outer;
          }
          // 4) iterator callback
          if (iterator && !iterator(occ, matchCount)) {
            break outer;
          }
          // 5) accept
          dates.push(occ);
          matchCount++;
        }

        // advance by N months
        monthCursor = monthCursor.add({ months: this.opts.interval! });
      }

      return dates;
    }

    if (this.opts.freq === "YEARLY" && this.opts.byMonth) {
      const months = [...this.opts.byMonth].sort((a, b) => a - b);
      const start = this.originalDtstart;
      let i = 0;
      while (true) {
        // pick which month for this occurrence
        const cycle = Math.floor(i / months.length);
        const idx = i % months.length;
        const year = start.year + cycle * this.opts.interval!;
        let occ = start.with({ year, month: months[idx] });
        occ = this.applyTimeOverride(occ);

        // stop on UNTIL
        if (this.opts.until && occ > this.opts.until) break;
        // stop on COUNT
        if (this.opts.count !== undefined && i >= this.opts.count) break;
        // iterator callback
        if (iterator && !iterator(occ, i)) break;

        dates.push(occ);
        i++;
      }
      return dates;
    }

    // --- fallback for non‑monthly or no BYDAY ---
    let current = this.computeFirst();
    while (true) {
      // UNTIL check
      if (
        this.opts.until &&
        Temporal.ZonedDateTime.compare(current, this.opts.until) > 0
      ) {
        break;
      }

      if (this.matchesAll(current)) {
        // COUNT
        if (this.opts.count !== undefined && matchCount >= this.opts.count) {
          break;
        }
        if (iterator && !iterator(current, matchCount)) {
          break;
        }
        dates.push(current);
        matchCount++;
      }

      current = this.applyTimeOverride(this.rawAdvance(current));
    }
    return dates;
  }

  // --- updated between() to filter by constraints ---
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

    // --- MONTHLY + BYDAY branch ---
    if (this.opts.freq === "MONTHLY" && this.opts.byDay) {
      // begin in the month of the first occurrence
      let monthCursor = this.computeFirst().with({ day: 1 });

      outer: while (true) {
        const occs = this.generateMonthlyOccurrences(monthCursor);

        for (const occ of occs) {
          const inst = occ.toInstant();

          // break when beyond 'before'
          if (
            inc
              ? Temporal.Instant.compare(inst, endInst) > 0
              : Temporal.Instant.compare(inst, endInst) >= 0
          ) {
            break outer;
          }

          // only include if on/after 'after'
          if (Temporal.Instant.compare(inst, startInst) >= 0) {
            results.push(occ);
          }
        }

        monthCursor = monthCursor.add({ months: this.opts.interval! });
      }

      return results;
    }

    // 2) YEARLY + BYMONTH
    if (this.opts.freq === "YEARLY" && this.opts.byMonth) {
      const start = this.originalDtstart;
      const months = [...this.opts.byMonth].sort((a, b) => a - b);
      let i = 0;

      outer: while (true) {
        const year = start.year + i * this.opts.interval!;
        const month = months[i % months.length];
        let occ = start.with({ year, month });
        occ = this.applyTimeOverride(occ);
        const inst = occ.toInstant();

        // break on window end
        if (
          inc
            ? Temporal.Instant.compare(inst, endInst) > 0
            : Temporal.Instant.compare(inst, endInst) >= 0
        ) {
          break;
        }
        // only include if on/after 'after'
        if (Temporal.Instant.compare(inst, startInst) >= 0) {
          results.push(occ);
        }

        i++;
      }

      return results;
    }

    // --- fallback for non‑monthly or no BYDAY ---
    let current = this.computeFirst();
    while (true) {
      const inst = current.toInstant();

      // break on window end
      if (inc) {
        if (Temporal.Instant.compare(inst, endInst) > 0) break;
      } else {
        if (Temporal.Instant.compare(inst, endInst) >= 0) break;
      }

      if (
        Temporal.Instant.compare(inst, startInst) >= 0 &&
        this.matchesAll(current)
      ) {
        results.push(current);
      }

      current = this.applyTimeOverride(this.rawAdvance(current));
    }
    return results;
  }

  // --- updated next() to honor BYDAY/BYMONTH ---
  next(
    after: Date | Temporal.ZonedDateTime = new Date(),
    inc = false
  ): Temporal.ZonedDateTime | null {
    const afterInst =
      after instanceof Date
        ? Temporal.Instant.from(after.toISOString())
        : after.toInstant();

    let current = this.computeFirst();
    let matchCount = 0;

    while (true) {
      const inst = current.toInstant();

      // if this satisfies constraints, check if it's beyond 'after'
      if (this.matchesAll(current)) {
        const ok = inc
          ? Temporal.Instant.compare(inst, afterInst) >= 0
          : Temporal.Instant.compare(inst, afterInst) > 0;
        if (ok) return current;

        // count it toward COUNT
        matchCount++;
        if (this.opts.count !== undefined && matchCount >= this.opts.count) {
          return null;
        }
      }

      // stop on UNTIL
      if (
        this.opts.until &&
        Temporal.ZonedDateTime.compare(current, this.opts.until) >= 0
      ) {
        return null;
      }

      current = this.applyTimeOverride(this.rawAdvance(current));
    }
  }

  // --- updated previous() to honor BYDAY/BYMONTH ---
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

    while (true) {
      const inst = current.toInstant();

      // if beyond window, stop
      if (
        inc
          ? Temporal.Instant.compare(inst, beforeInst) > 0
          : Temporal.Instant.compare(inst, beforeInst) >= 0
      ) {
        break;
      }

      // track it if it matches constraints
      if (this.matchesAll(current)) {
        prev = current;
      }

      if (
        this.opts.until &&
        Temporal.ZonedDateTime.compare(current, this.opts.until) >= 0
      ) {
        break;
      }

      current = this.applyTimeOverride(this.rawAdvance(current));
    }

    return prev;
  }

  toString(): string {
    const iso = this.originalDtstart
      .toString({ smallestUnit: "second" })
      .replace(/[-:]/g, "");
    const dtLine = `DTSTART;TZID=${this.tzid}:${iso.slice(0, 15)}`;
    const parts: string[] = [];
    const { freq, interval, count, byHour, byMinute, byDay, byMonth } =
      this.opts;

    parts.push(`FREQ=${freq}`);
    if (interval !== 1) parts.push(`INTERVAL=${interval}`);
    if (count !== undefined) parts.push(`COUNT=${count}`);
    if (byHour) parts.push(`BYHOUR=${byHour.join(",")}`);
    if (byMinute) parts.push(`BYMINUTE=${byMinute.join(",")}`);
    if (byDay) parts.push(`BYDAY=${byDay.join(",")}`);
    if (byMonth) parts.push(`BYMONTH=${byMonth.join(",")}`);

    return [dtLine, `RRULE:${parts.join(";")}`].join("\n");
  }

  /**
   * Given any date in a month, return all the ZonedDateTimes in that month
   * matching your opts.byDay and opts.byMonth (or the single "same day" if no BYDAY).
   */
  private generateMonthlyOccurrences(
    sample: Temporal.ZonedDateTime
  ): Temporal.ZonedDateTime[] {
    const { byDay, byMonth, tzid } = this.opts;

    // 1) Skip entire month if BYMONTH excludes it
    if (byMonth && !byMonth.includes(sample.month)) {
      return [];
    }

    // 2) If no BYDAY, just return the sample (we'll override time later)
    if (!byDay || byDay.length === 0) {
      return [sample];
    }

    // Map MO,TU…SU → dayOfWeek numbers
    const dayMap: Record<string, number> = {
      MO: 1,
      TU: 2,
      WE: 3,
      TH: 4,
      FR: 5,
      SA: 6,
      SU: 7,
    };

    // Parse tokens into { ord, wd }
    type Token = { ord: number; wd: number };
    const tokens: Token[] = byDay
      .map((tok) => {
        const m = tok.match(/^([+-]?\d)?(MO|TU|WE|TH|FR|SA|SU)$/);
        if (!m) return null;
        const ord = m[1] ? parseInt(m[1], 10) : 0;
        const wd = dayMap[m[2]!];
        return { ord, wd };
      })
      .filter((x): x is Token => x !== null);

    // 3) Build a map from weekday → all day‑of‑month numbers
    const year = sample.year;
    const month = sample.month;
    let cursor = Temporal.ZonedDateTime.from({
      year,
      month,
      day: 1,
      hour: sample.hour,
      minute: sample.minute,
      second: sample.second,
      timeZone: tzid,
    });
    const weekdayBuckets: Record<number, number[]> = {};
    while (cursor.month === month) {
      const dow = cursor.dayOfWeek;
      weekdayBuckets[dow] = weekdayBuckets[dow] || [];
      weekdayBuckets[dow].push(cursor.day);
      cursor = cursor.add({ days: 1 });
    }

    // 4) For each token, pick the right day‑of‑month
    const results: Temporal.ZonedDateTime[] = [];
    for (const { ord, wd } of tokens) {
      const days = weekdayBuckets[wd] || [];
      if (!days.length) continue;

      if (ord === 0) {
        // simple weekday: include *all* Fridays, e.g.
        for (const d of days) {
          results.push(sample.with({ day: d }));
        }
      } else {
        // ordinal: 2FR → days[1], -1FR → days[days.length-1], etc.
        const idx = ord > 0 ? ord - 1 : days.length + ord;
        const dayNum = days[idx];
        if (dayNum) {
          results.push(sample.with({ day: dayNum }));
        }
      }
    }

    // 5) Apply your BYHOUR/BYMINUTE overrides and sort chronologically
    return results
      .map((zdt) => this.applyTimeOverride(zdt))
      .sort((a, b) => Temporal.ZonedDateTime.compare(a, b));
  }
}

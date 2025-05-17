// rrule-temporal.ts
import { Temporal } from "@js-temporal/polyfill";

// ---------------------------------------------------------------------------
// Helper utilities for the toText() feature
// ---------------------------------------------------------------------------
const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];


export type DateFormatter = (
  year: number,
  month: string,
  day: number
) => string;

const defaultDateFormatter: DateFormatter = (
  year: number,
  month: string,
  day: number
) => `${month} ${day}, ${year}`;

function ordinal(n: number): string {
  const abs = Math.abs(n);
  const suffix =
    abs % 10 === 1 && abs % 100 !== 11
      ? "st"
      : abs % 10 === 2 && abs % 100 !== 12
      ? "nd"
      : abs % 10 === 3 && abs % 100 !== 13
      ? "rd"
      : "th";
  return n < 0 ? `last` : `${abs}${suffix}`;
}

function list(
  arr: (string | number)[],
  mapFn: (x: string | number) => string = (x) => `${x}`,
  final = "and"
) {
  const mapped = arr.map(mapFn);
  if (mapped.length === 1) return mapped[0];
  return (
    mapped.slice(0, -1).join(", ") +
    ` ${final} ` +
    mapped[mapped.length - 1]
  );
}

function formatByDayToken(tok: string): string {
  const m = tok.match(/^([+-]?\d)?(MO|TU|WE|TH|FR|SA|SU)$/);
  if (!m) return tok;
  const ord = m[1] ? parseInt(m[1], 10) : 0;
  const name = WEEKDAY_NAMES[
    { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 }[m[2] as any]
  ];
  if (ord === 0) return name;
  if (ord === -1) return `last ${name}`;
  return `${ordinal(ord)} ${name}`;
}

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
  dtstart: Temporal.ZonedDateTime;
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
  let tzid: string = "UTC";
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
        opts.byHour = val!
          .split(",")
          .map((n) => parseInt(n, 10))
          .sort((a, b) => a - b);
        break;
      case "BYMINUTE":
        opts.byMinute = val!
          .split(",")
          .map((n) => parseInt(n, 10))
          .sort((a, b) => a - b);
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

function joinList(items: string[]): string {
  if (items.length === 1) return items[0]!;
  const last = items[items.length - 1];
  return items.slice(0, -1).join(", ") + " and " + last;
}

function nth(n: number): string {
  if (n === -1) return "last";
  const abs = Math.abs(n);
  const suffix =
    abs % 10 === 1 && abs % 100 !== 11
      ? "st"
      : abs % 10 === 2 && abs % 100 !== 12
      ? "nd"
      : abs % 10 === 3 && abs % 100 !== 13
      ? "rd"
      : "th";
  return n < 0 ? `${abs}${suffix} last` : `${abs}${suffix}`;
}

function formatDay(token: string): string {
  const m = token.match(/^([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/);
  if (!m) return token;
  const ord = m[1] ? parseInt(m[1], 10) : 0;
  const map = {
    MO: 0,
    TU: 1,
    WE: 2,
    TH: 3,
    FR: 4,
    SA: 5,
    SU: 6,
  } as const;
  const idx = map[m[2] as keyof typeof map]!;
  const name = WEEKDAY_NAMES[idx]!;
  return ord ? `${nth(ord)} ${name}` : name;
}

function formatTime(hour: number, minute = 0): string {
  const hr12 = ((hour + 11) % 12) + 1;
  const ampm = hour < 12 ? "AM" : "PM";
  if (minute) {
    return `${hr12}:${String(minute).padStart(2, "0")} ${ampm}`;
  }
  return `${hr12} ${ampm}`;
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

  /**  Expand one base ZonedDateTime into all BYHOUR × BYMINUTE combinations,
   *  keeping chronological order.  If BYHOUR/BYMINUTE are not present the
   *  original date is returned unchanged.
   */
  private expandByHourMinute(
    base: Temporal.ZonedDateTime
  ): Temporal.ZonedDateTime[] {
    const hours = this.opts.byHour ?? [base.hour];
    const minutes = this.opts.byMinute ?? [base.minute];

    const out: Temporal.ZonedDateTime[] = [];
    for (const h of hours) {
      for (const m of minutes) {
        out.push(base.with({ hour: h, minute: m }));
      }
    }
    return out.sort((a, b) => Temporal.ZonedDateTime.compare(a, b));
  }

  private nextCandidateSameDate(
    zdt: Temporal.ZonedDateTime
  ): Temporal.ZonedDateTime {
    const { byHour, byMinute } = this.opts;
    if (byHour && byHour.length > 1) {
      const idx = byHour.indexOf(zdt.hour);
      if (idx !== -1 && idx < byHour.length - 1) {
        // next hour on the same day
        return zdt.with({
          hour: byHour[idx + 1],
          minute: byMinute ? byMinute[0] : zdt.minute,
        });
      }
    }
    // we were already at the last BYHOUR -> advance the date
    return this.applyTimeOverride(this.rawAdvance(zdt));
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
    let zdt = this.originalDtstart;

    // If it's WEEKLY with BYDAY, advance zdt to the first matching weekday ≥ dtstart
    if (this.opts.freq === "WEEKLY" && this.opts.byDay?.length) {
      const dayMap: Record<string, number> = {
        MO: 1,
        TU: 2,
        WE: 3,
        TH: 4,
        FR: 5,
        SA: 6,
        SU: 7,
      };
      const targetDow = dayMap[this.opts.byDay[0]!]!;
      const delta = (targetDow - zdt.dayOfWeek + 7) % 7;
      zdt = zdt.add({ days: delta });
    }

    // then your existing BYHOUR/BYMINUTE override logic:
    const { byHour, byMinute } = this.opts;
    if (byHour || byMinute) {
      zdt = this.applyTimeOverride(zdt);
      if (
        Temporal.Instant.compare(
          zdt.toInstant(),
          this.originalDtstart.toInstant()
        ) < 0
      ) {
        zdt = this.applyTimeOverride(this.rawAdvance(this.originalDtstart));
      }
    }

    return zdt;
  }

  // inside class RRuleTemporal:

  private generateWeeklyOccurrences(
    sample: Temporal.ZonedDateTime
  ): Temporal.ZonedDateTime[] {
    const dayMap: Record<string, number> = {
      MO: 1,
      TU: 2,
      WE: 3,
      TH: 4,
      FR: 5,
      SA: 6,
      SU: 7,
    };
    const tokens = this.opts.byDay?.length
      ? [...this.opts.byDay] // rule-specified weekdays
      : [Object.entries(dayMap).find(([, d]) => d === sample.dayOfWeek)![0]]; // default = same weekday

    // Build occurrences for every weekday × every BYHOUR
    const occs = tokens.flatMap((tok) => {
      const targetDow = dayMap[tok]!;
      const delta = (targetDow - sample.dayOfWeek + 7) % 7;
      const sameDate = sample.add({ days: delta });
      return this.expandByHourMinute(sameDate);
    });

    return occs.sort((a, b) => Temporal.ZonedDateTime.compare(a, b));
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

  options() {
    return this.opts;
  }

  /**
   * Returns all occurrences of the rule.
   * @param iterator - An optional callback iterator function that can be used to filter or modify the occurrences.
   * @returns An array of Temporal.ZonedDateTime objects representing all occurrences of the rule.
   */
  all(
    iterator?: (date: Temporal.ZonedDateTime, i: number) => boolean
  ): Temporal.ZonedDateTime[] {
    if (!this.opts.count && !this.opts.until && !iterator) {
      throw new Error("all() requires iterator when no COUNT/UNTIL");
    }
    const dates: Temporal.ZonedDateTime[] = [];

    // --- 1) MONTHLY + BYDAY (multi-day expansions) ---
    if (this.opts.freq === "MONTHLY" && this.opts.byDay) {
      const start = this.originalDtstart;
      let monthCursor = start.with({ day: 1 });
      let matchCount = 0;

      outer_month: while (true) {
        const occs = this.generateMonthlyOccurrences(monthCursor);
        // Skip this month entirely if **any** occurrence precedes DTSTART.
        if (
          monthCursor.month === start.month &&
          occs.some((o) => Temporal.ZonedDateTime.compare(o, start) < 0)
        ) {
          monthCursor = monthCursor.add({ months: this.opts.interval! });
          continue outer_month;
        }

        for (const occ of occs) {
          if (Temporal.ZonedDateTime.compare(occ, start) < 0) continue;
          if (
            this.opts.until &&
            Temporal.ZonedDateTime.compare(occ, this.opts.until) > 0
          ) {
            break outer_month;
          }
          if (this.opts.count !== undefined && matchCount >= this.opts.count) {
            break outer_month;
          }
          if (iterator && !iterator(occ, matchCount)) {
            break outer_month;
          }
          dates.push(occ);
          matchCount++;
        }
        monthCursor = monthCursor.add({ months: this.opts.interval! });
      }
      return dates;
    }

    // --- 2) WEEKLY + BYDAY (or default to DTSTART’s weekday) ---
    if (this.opts.freq === "WEEKLY") {
      const start = this.originalDtstart;
      // Build the list of target weekdays (1=Mon..7=Sun)
      const dayMap: Record<string, number> = {
        MO: 1,
        TU: 2,
        WE: 3,
        TH: 4,
        FR: 5,
        SA: 6,
        SU: 7,
      };
      // If no BYDAY, default to DTSTART’s weekday token
      const tokens = this.opts.byDay
        ? [...this.opts.byDay]
        : [Object.entries(dayMap).find(([, d]) => d === start.dayOfWeek)![0]];
      const dows = tokens
        .map((tok) => dayMap[tok])
        .filter((d): d is number => d !== undefined)
        .sort((a, b) => a - b);

      // Find the very first weekCursor: the earliest of this week’s matching days ≥ start
      const firstWeekDates = dows.map((dw) => {
        const delta = (dw - start.dayOfWeek + 7) % 7;
        return start.add({ days: delta });
      });
      let weekCursor = firstWeekDates.reduce((a, b) =>
        Temporal.ZonedDateTime.compare(a, b) <= 0 ? a : b
      );
      let matchCount = 0;

      outer_week: while (true) {
        // Generate this week’s occurrences
        const baseDow = weekCursor.dayOfWeek;
        const occs = dows
          .flatMap((dw) => {
            const delta = dw - baseDow;
            const sameDate = weekCursor.add({ days: delta });
            return this.expandByHourMinute(sameDate);
          })
          .sort((a, b) => Temporal.ZonedDateTime.compare(a, b));

        for (const occ of occs) {
          if (Temporal.ZonedDateTime.compare(occ, start) < 0) continue;
          if (
            this.opts.until &&
            Temporal.ZonedDateTime.compare(occ, this.opts.until) > 0
          ) {
            break outer_week;
          }
          if (this.opts.count !== undefined && matchCount >= this.opts.count) {
            break outer_week;
          }
          if (iterator && !iterator(occ, matchCount)) {
            break outer_week;
          }
          dates.push(occ);
          matchCount++;
        }

        weekCursor = weekCursor.add({ weeks: this.opts.interval! });
      }

      return dates;
    }

    // --- 3) YEARLY + BYMONTH (one per year, rotating) ---
    if (this.opts.freq === "YEARLY" && this.opts.byMonth) {
      const start = this.originalDtstart;
      const months = [...this.opts.byMonth].sort((a, b) => a - b);
      let i = 0;

      while (true) {
        const year = start.year + i * this.opts.interval!;
        const month = months[i % months.length];
        let occ = start.with({ year, month });
        occ = this.applyTimeOverride(occ);

        if (i === 0 && Temporal.ZonedDateTime.compare(occ, start) < 0) {
          i++;
          continue;
        }
        if (
          this.opts.until &&
          Temporal.ZonedDateTime.compare(occ, this.opts.until) > 0
        ) {
          break;
        }
        if (this.opts.count !== undefined && i >= this.opts.count) {
          break;
        }
        if (iterator && !iterator(occ, i)) {
          break;
        }

        dates.push(occ);
        i++;
      }
      return dates;
    }

    // --- 4) fallback: step + filter ---
    let current = this.computeFirst();
    let matchCount = 0;

    while (true) {
      if (
        this.opts.until &&
        Temporal.ZonedDateTime.compare(current, this.opts.until) > 0
      ) {
        break;
      }
      if (this.matchesAll(current)) {
        if (this.opts.count !== undefined && matchCount >= this.opts.count) {
          break;
        }
        if (iterator && !iterator(current, matchCount)) {
          break;
        }
        dates.push(current);
        matchCount++;
      }
      current = this.nextCandidateSameDate(current);
    }

    return dates;
  }

  /**
   * Returns all occurrences of the rule within a specified time window.
   * @param after - The start date or Temporal.ZonedDateTime object.
   * @param before - The end date or Temporal.ZonedDateTime object.
   * @param inc - Optional boolean flag to include the end date in the results.
   * @returns An array of Temporal.ZonedDateTime objects representing all occurrences of the rule within the specified time window.
   */
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

    // 1) MONTHLY + BYDAY
    if (this.opts.freq === "MONTHLY" && this.opts.byDay) {
      let monthCursor = this.computeFirst().with({ day: 1 });

      outer: while (true) {
        const occs = this.generateMonthlyOccurrences(monthCursor);
        for (const occ of occs) {
          const inst = occ.toInstant();
          if (
            inc
              ? Temporal.Instant.compare(inst, endInst) > 0
              : Temporal.Instant.compare(inst, endInst) >= 0
          ) {
            break outer;
          }
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

        if (
          inc
            ? Temporal.Instant.compare(inst, endInst) > 0
            : Temporal.Instant.compare(inst, endInst) >= 0
        ) {
          break;
        }
        if (Temporal.Instant.compare(inst, startInst) >= 0) {
          results.push(occ);
        }
        i++;
      }
      return results;
    }

    if (this.opts.freq === "WEEKLY") {
      const startInst =
        after instanceof Date
          ? Temporal.Instant.from(after.toISOString())
          : after.toInstant();
      const endInst =
        before instanceof Date
          ? Temporal.Instant.from(before.toISOString())
          : before.toInstant();

      let weekCursor = this.computeFirst();
      const results: Temporal.ZonedDateTime[] = [];

      outer: while (true) {
        const occs = this.generateWeeklyOccurrences(weekCursor);
        for (const occ of occs) {
          const inst = occ.toInstant();
          // break when beyond end
          if (
            inc
              ? Temporal.Instant.compare(inst, endInst) > 0
              : Temporal.Instant.compare(inst, endInst) >= 0
          ) {
            break outer;
          }
          // include if on/after start
          if (Temporal.Instant.compare(inst, startInst) >= 0) {
            results.push(occ);
          }
        }
        weekCursor = weekCursor.add({ weeks: this.opts.interval! });
      }
      return results;
    }

    // 3) fallback
    let current = this.computeFirst();
    while (true) {
      const inst = current.toInstant();
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
      current = this.nextCandidateSameDate(current);
    }
    return results;
  }

  /**
   * Returns the next occurrence of the rule after a specified date.
   * @param after - The start date or Temporal.ZonedDateTime object.
   * @param inc - Optional boolean flag to include occurrences on the start date.
   * @returns The next occurrence of the rule after the specified date or null if no occurrences are found.
   */
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

      current = this.nextCandidateSameDate(current);
    }
  }

  /**
   * Returns the previous occurrence of the rule before a specified date.
   * @param before - The end date or Temporal.ZonedDateTime object.
   * @param inc - Optional boolean flag to include occurrences on the end date.
   * @returns The previous occurrence of the rule before the specified date or null if no occurrences are found.
   */
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

      current = this.nextCandidateSameDate(current);
    }

    return prev;
  }

  toString(): string {
    const iso = this.originalDtstart
      .toString({ smallestUnit: "second" })
      .replace(/[-:]/g, "");
    const dtLine = `DTSTART;TZID=${this.tzid}:${iso.slice(0, 15)}`;
    const parts: string[] = [];
    const {
      freq,
      interval,
      count,
      until,
      byHour,
      byMinute,
      byDay,
      byMonth,
    } = this.opts;

    parts.push(`FREQ=${freq}`);
    if (interval !== 1) parts.push(`INTERVAL=${interval}`);
    if (count !== undefined) parts.push(`COUNT=${count}`);
    if (until) {
      const u = until
        .toInstant()
        .toString()
        .replace(/[-:]/g, "");
      parts.push(`UNTIL=${u.slice(0, 15)}Z`);
    }
    if (byHour) parts.push(`BYHOUR=${byHour.join(",")}`);
    if (byMinute) parts.push(`BYMINUTE=${byMinute.join(",")}`);
    if (byDay) parts.push(`BYDAY=${byDay.join(",")}`);
    if (byMonth) parts.push(`BYMONTH=${byMonth.join(",")}`);

    return [dtLine, `RRULE:${parts.join(";")}`].join("\n");
  }

  toText(dateFormatter: DateFormatter = defaultDateFormatter): string {
    const { freq, interval = 1, byDay, byMonth, byHour, byMinute, count, until } = this.opts;
    const freqWord: Record<Freq, string> = {
      YEARLY: "year",
      MONTHLY: "month",
      WEEKLY: "week",
      DAILY: "day",
      HOURLY: "hour",
      MINUTELY: "minute",
      SECONDLY: "second",
    };
    const parts: string[] = [];
    let usedSpecial = false;
    if (freq === "WEEKLY" && byDay && interval === 1) {
      const tokens = byDay.map((d) => d.replace(/^[+-]?\d+/, ""));
      const set = new Set(tokens);
      const weekdays = ["MO", "TU", "WE", "TH", "FR"];
      const alldays = [...weekdays, "SA", "SU"];
      if (weekdays.every((d) => set.has(d)) && set.size === weekdays.length) {
        parts.push("every weekday");
        usedSpecial = true;
      } else if (alldays.every((d) => set.has(d)) && set.size === alldays.length) {
        parts.push("every day");
        usedSpecial = true;
      }
    }
    if (!usedSpecial) {
      parts.push("every");
      if (interval !== 1) parts.push(String(interval));
      parts.push(interval !== 1 ? freqWord[freq] + "s" : freqWord[freq]);
    }
    if (byMonth && byMonth.length) {
      parts.push("in");
      parts.push(joinList(byMonth.map((m) => MONTH_NAMES[m - 1]!)));
    }
    if (byDay && byDay.length && !(freq === "WEEKLY" && usedSpecial)) {
      parts.push("on");
      parts.push(joinList(byDay.map(formatDay)));
    }
    let tzAbbr: string | undefined;
    if (byHour && byHour.length) {
      parts.push("at");
      if (this.tzid) {
        const fmt = new Intl.DateTimeFormat("en-US", {
          timeZone: this.tzid,
          timeZoneName: "short",
        });
        const str = fmt.format(new Date(this.originalDtstart.epochMilliseconds));
        tzAbbr = str.split(/\s+/).pop();
      }
      const times: string[] = [];
      for (const h of byHour) {
        if (byMinute && byMinute.length) {
          for (const m of byMinute) {
            times.push(formatTime(h, m));
          }
        } else {
          times.push(formatTime(h));
        }
      }
      parts.push(joinList(times));
      if (tzAbbr) parts.push(tzAbbr);
    }
    if (count !== undefined) {
      parts.push("for");
      parts.push(String(count));
      parts.push(count === 1 ? "time" : "times");
    }
    if (until) {
      parts.push("until");
      parts.push(
        dateFormatter(until.year, MONTH_NAMES[until.month - 1]!, until.day)
      );
    }
    return parts.join(" ");
  }

  /**
   * Convert this rule to a human readable English description.
   */
  toText(formatter: DateFormatter = defaultDateFormatter): string {
    const {
      freq,
      interval = 1,
      count,
      until,
      byDay,
      byHour,
      byMonth,
    } = this.opts;

    const parts: string[] = ["every"];

    const base = {
      YEARLY: "year",
      MONTHLY: "month",
      WEEKLY: "week",
      DAILY: "day",
      HOURLY: "hour",
      MINUTELY: "minute",
      SECONDLY: "second",
    }[freq];

    // Special cases for WEEKLY with full weekday sets
    const daysNormalized = byDay?.map((d) => d.toUpperCase());
    const isWeekdays =
      daysNormalized &&
      daysNormalized.length === 5 &&
      ["MO", "TU", "WE", "TH", "FR"].every((d) => daysNormalized.includes(d));
    const isEveryday =
      daysNormalized &&
      daysNormalized.length === 7 &&
      ["MO", "TU", "WE", "TH", "FR", "SA", "SU"].every((d) =>
        daysNormalized.includes(d)
      );

    if (freq === "WEEKLY" && interval === 1 && isWeekdays) {
      parts.push("weekday");
    } else if (freq === "WEEKLY" && interval === 1 && isEveryday) {
      parts.push("day");
    } else {
      if (interval !== 1) {
        parts.push(interval.toString(), base + "s");
      } else {
        parts.push(base);
      }
    }

    if (freq === "WEEKLY" && byDay && !isWeekdays && !isEveryday) {
      parts.push("on", list(byDay, formatByDayToken));
    } else if (byDay && freq !== "WEEKLY") {
      parts.push("on", list(byDay, formatByDayToken));
    }

    if (byMonth) {
      parts.push("in", list(byMonth, (m) => MONTH_NAMES[m - 1]));
    }

    if (byHour) {
      parts.push("at", list(byHour, (h) => h.toString()));
    }

    if (until) {
      parts.push(
        "until",
        formatter(until.year, MONTH_NAMES[until.month - 1], until.day)
      );
    } else if (count !== undefined) {
      parts.push("for", count.toString(), count === 1 ? "time" : "times");
    }

    return parts.join(" ");
  }

  /**
   * Given any date in a month, return all the ZonedDateTimes in that month
   * matching your opts.byDay and opts.byMonth (or the single "same day" if no BYDAY).
   */
  private generateMonthlyOccurrences(
    sample: Temporal.ZonedDateTime
  ): Temporal.ZonedDateTime[] {
    const { byDay, byMonth, tzid } = this.opts;

    // 1) Skip whole month if BYMONTH says so
    if (byMonth && !byMonth.includes(sample.month)) return [];

    // 2) If no BYDAY ⇒ just take this exact calendar day
    if (!byDay || byDay.length === 0) {
      return this.expandByHourMinute(sample);
    }

    const dayMap: Record<string, number> = {
      MO: 1,
      TU: 2,
      WE: 3,
      TH: 4,
      FR: 5,
      SA: 6,
      SU: 7,
    };

    type Token = { ord: number; wd: number };
    const tokens: Token[] = byDay
      .map((tok) => {
        const m = tok.match(/^([+-]?\d)?(MO|TU|WE|TH|FR|SA|SU)$/);
        if (!m) return null;
        return { ord: m[1] ? parseInt(m[1], 10) : 0, wd: dayMap[m[2]!] };
      })
      .filter((x): x is Token => x !== null);

    // Bucket every weekday in this month
    const buckets: Record<number, number[]> = {};
    let cursor = sample.with({ day: 1 });
    while (cursor.month === sample.month) {
      const dow = cursor.dayOfWeek;
      (buckets[dow] ||= []).push(cursor.day);
      cursor = cursor.add({ days: 1 });
    }

    // Resolve tokens → concrete days
    const hits: Temporal.ZonedDateTime[] = [];
    for (const { ord, wd } of tokens) {
      const list = buckets[wd] ?? [];
      if (!list.length) continue;

      if (ord === 0) {
        // every Monday, etc.
        for (const d of list) hits.push(sample.with({ day: d }));
      } else {
        const idx = ord > 0 ? ord - 1 : list.length + ord;
        const dayN = list[idx];
        if (dayN) hits.push(sample.with({ day: dayN }));
      }
    }

    // Expand to all BYHOUR/BYMINUTE and sort
    return hits
      .flatMap((z) => this.expandByHourMinute(z))
      .sort((a, b) => Temporal.ZonedDateTime.compare(a, b));
  }
}

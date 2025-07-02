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
): string {
  const mapped = arr.map(mapFn);
  if (mapped.length === 1) return mapped[0]!;
  return (
    mapped.slice(0, -1).join(", ") + ` ${final} ` + mapped[mapped.length - 1]
  );
}

function formatByDayToken(tok: string | number): string {
  if (typeof tok === "number") return tok.toString();
  const m = tok.match(/^([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/);
  if (!m) return tok;
  const ord = m[1] ? parseInt(m[1], 10) : 0;
  const weekdayMap: { [key: string]: number } = {
    MO: 0,
    TU: 1,
    WE: 2,
    TH: 3,
    FR: 4,
    SA: 5,
    SU: 6,
  };
  const idx = weekdayMap[m[2] as keyof typeof weekdayMap];
  const name = WEEKDAY_NAMES[idx!];
  if (ord === 0) return name!;
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

// interface RRuleOptions {
//   freq: Freq;
//   interval: number;
//   count?: number;
//   until?: Temporal.ZonedDateTime;
//   byHour?: number[];
//   byMinute?: number[];
//   dtstart: Temporal.ZonedDateTime;
//   tzid?: string;
// }

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
  bySecond?: number[];
  byDay?: string[]; // e.g. ["MO","WE","FR"]
  byMonth?: number[]; // e.g. [1,4,7]
  byMonthDay?: number[]; // e.g. [1,15,-1]
  byYearDay?: number[];
  byWeekNo?: number[];
  bySetPos?: number[];
  wkst?: string;
  rDate?: (Date | Temporal.ZonedDateTime)[];
  dtstart: Temporal.ZonedDateTime;
}
interface IcsOpts extends BaseOpts {
  rruleString: string; // full "DTSTART...\nRRULE..." snippet
}
export type RRuleOptions = ManualOpts | IcsOpts;

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
      case "BYMONTHDAY":
        opts.byMonthDay = val!.split(",").map((n) => parseInt(n, 10));
        break;
      case "BYSECOND":
        opts.bySecond = val!
          .split(",")
          .map((n) => parseInt(n, 10))
          .sort((a, b) => a - b);
        break;
      case "BYYEARDAY":
        opts.byYearDay = val!.split(",").map((n) => parseInt(n, 10));
        break;
      case "BYWEEKNO":
        opts.byWeekNo = val!.split(",").map((n) => parseInt(n, 10));
        break;
      case "BYSETPOS":
        opts.bySetPos = val!.split(",").map((n) => parseInt(n, 10));
        break;
      case "WKST":
        opts.wkst = val!;
        break;
    }
  }

  return opts;
}

// function joinList(items: string[]): string {
//   if (items.length === 1) return items[0]!;
//   const last = items[items.length - 1];
//   return items.slice(0, -1).join(", ") + " and " + last;
// }

// function nth(n: number): string {
//   if (n === -1) return "last";
//   const abs = Math.abs(n);
//   const suffix =
//     abs % 10 === 1 && abs % 100 !== 11
//       ? "st"
//       : abs % 10 === 2 && abs % 100 !== 12
//       ? "nd"
//       : abs % 10 === 3 && abs % 100 !== 13
//       ? "rd"
//       : "th";
//   return n < 0 ? `${abs}${suffix} last` : `${abs}${suffix}`;
// }

// function formatDay(token: string): string {
//   const m = token.match(/^([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/);
//   if (!m) return token;
//   const ord = m[1] ? parseInt(m[1], 10) : 0;
//   const map = {
//     MO: 0,
//     TU: 1,
//     WE: 2,
//     TH: 3,
//     FR: 4,
//     SA: 5,
//     SU: 6,
//   } as const;
//   const idx = map[m[2] as keyof typeof map]!;
//   const name = WEEKDAY_NAMES[idx]!;
//   return ord ? `${nth(ord)} ${name}` : name;
// }

function formatTime(hour: number, minute = 0): string {
  const hr12 = ((hour + 11) % 12) + 1;
  const ampm = hour < 12 ? "AM" : "PM";
  if (minute) {
    return `${hr12}:${String(minute).padStart(2, "0")} ${ampm}`;
  }
  return `${hr12} ${ampm}`;
}

function tzAbbreviation(zdt: Temporal.ZonedDateTime): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zdt.timeZoneId,
    timeZoneName: "short",
    hour: "numeric",
  }).formatToParts(new Date(zdt.epochMilliseconds));
  const tzPart = parts.find((p) => p.type === "timeZoneName");
  return tzPart?.value || zdt.timeZoneId;
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
    if (manual.interval <= 0) {
      throw new Error("Cannot create RRule: interval must be greater than 0");
    }
    if (manual.until && !(manual.until instanceof Temporal.ZonedDateTime)) {
      throw new Error("Manual until must be a ZonedDateTime");
    }
    this.opts = this.sanitizeOpts(manual);
  }

  private sanitizeOpts(opts: ManualOpts): ManualOpts {
    const validDay = /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/;
    if (opts.byDay) {
      opts.byDay = opts.byDay.filter((d) => validDay.test(d));
      if (opts.byDay.length === 0) delete opts.byDay;
    }
    if (opts.byMonth) {
      opts.byMonth = opts.byMonth.filter((n) => Number.isInteger(n) && n >= 1 && n <= 12);
      if (opts.byMonth.length === 0) delete opts.byMonth;
    }
    if (opts.byMonthDay) {
      opts.byMonthDay = opts.byMonthDay.filter((n) => Number.isInteger(n) && n !== 0 && n >= -31 && n <= 31);
      if (opts.byMonthDay.length === 0) delete opts.byMonthDay;
    }
    if (opts.byYearDay) {
      opts.byYearDay = opts.byYearDay.filter((n) => Number.isInteger(n) && n !== 0 && n >= -366 && n <= 366);
      if (opts.byYearDay.length === 0) delete opts.byYearDay;
    }
    if (opts.byWeekNo) {
      opts.byWeekNo = opts.byWeekNo.filter((n) => Number.isInteger(n) && n !== 0 && n >= -53 && n <= 53);
      if (opts.byWeekNo.length === 0) delete opts.byWeekNo;
    }
    if (opts.byHour) {
      opts.byHour = opts.byHour.filter((n) => Number.isInteger(n) && n >= 0 && n <= 23);
      if (opts.byHour.length === 0) delete opts.byHour;
    }
    if (opts.byMinute) {
      opts.byMinute = opts.byMinute.filter((n) => Number.isInteger(n) && n >= 0 && n <= 59);
      if (opts.byMinute.length === 0) delete opts.byMinute;
    }
    if (opts.bySecond) {
      opts.bySecond = opts.bySecond.filter((n) => Number.isInteger(n) && n >= 0 && n <= 59);
      if (opts.bySecond.length === 0) delete opts.bySecond;
    }
    if (opts.bySetPos) {
      opts.bySetPos = opts.bySetPos.filter((n) => Number.isInteger(n) && n !== 0);
      if (opts.bySetPos.length === 0) delete opts.bySetPos;
    }
    return opts;
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

  /**  Expand one base ZonedDateTime into all BYHOUR × BYMINUTE × BYSECOND
   *  combinations, keeping chronological order. If the options are not
   *  present the original date is returned unchanged.
   */
  private expandByTime(base: Temporal.ZonedDateTime): Temporal.ZonedDateTime[] {
    const hours = this.opts.byHour ?? [base.hour];
    const minutes = this.opts.byMinute ?? [base.minute];
    const seconds = this.opts.bySecond ?? [base.second];

    const out: Temporal.ZonedDateTime[] = [];
    for (const h of hours) {
      for (const m of minutes) {
        for (const s of seconds) {
          out.push(base.with({ hour: h, minute: m, second: s }));
        }
      }
    }
    return out.sort((a, b) => Temporal.ZonedDateTime.compare(a, b));
  }

  private nextCandidateSameDate(
    zdt: Temporal.ZonedDateTime
  ): Temporal.ZonedDateTime {
    const { freq, interval = 1, byHour, byMinute, bySecond } = this.opts;

    // Special case: HOURLY frequency with a single BYHOUR token would
    // otherwise keep returning the same time (e.g. always 12:00).  When
    // BYDAY filters are also present this results in an infinite loop.
    if (freq === "HOURLY" && byHour && byHour.length === 1) {
      return this.applyTimeOverride(zdt.add({ days: interval }));
    }

    // MINUTELY frequency with a single BYMINUTE value would also repeat
    // the same time. Move forward a full hour before reapplying overrides.
    if (freq === "MINUTELY" && byMinute && byMinute.length === 1) {
      return this.applyTimeOverride(zdt.add({ hours: interval }));
    }

    if (freq === "SECONDLY" && bySecond && bySecond.length === 1) {
      return this
        .applyTimeOverride(zdt.add({ minutes: interval }))
        .with({ second: bySecond[0] });
    }

    // SECONDLY frequency with a single BYMINUTE value should emit every
    // second within that minute. When the minute rolls over, jump to the
    // next hour and reset seconds.
    if (freq === "SECONDLY" && byMinute && byMinute.length === 1) {
      const next = zdt.add({ seconds: interval });
      if (next.minute === byMinute[0]) return next;
      return this
        .applyTimeOverride(zdt.add({ hours: interval }))
        .with({ second: 0 });
    }

    if (bySecond && bySecond.length > 1) {
      const idx = bySecond.indexOf(zdt.second);
      if (idx !== -1 && idx < bySecond.length - 1) {
        return zdt.with({ second: bySecond[idx + 1] });
      }
    }

    if (byMinute && byMinute.length > 1) {
      const idx = byMinute.indexOf(zdt.minute);
      if (idx !== -1 && idx < byMinute.length - 1) {
        // next minute within the same hour
        return zdt.with({ minute: byMinute[idx + 1] });
      }
    }

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
    // we were already at the last BYHOUR/BYMINUTE/BYSECOND -> advance the date
    return this.applyTimeOverride(this.rawAdvance(zdt));
  }

  private applyTimeOverride(
    zdt: Temporal.ZonedDateTime
  ): Temporal.ZonedDateTime {
    const { byHour, byMinute, bySecond } = this.opts;
    let dt = zdt;
    if (byHour) dt = dt.with({ hour: byHour[0] });
    if (byMinute) dt = dt.with({ minute: byMinute[0] });
    if (bySecond) dt = dt.with({ second: bySecond[0] });
    return dt;
  }

  private computeFirst(): Temporal.ZonedDateTime {
    let zdt = this.originalDtstart;

    // If BYDAY is present, advance zdt to the first matching weekday ≥ DTSTART.
    // When the frequency is smaller than a week (e.g. HOURLY or SECONDLY),
    // iterating one unit at a time until the desired weekday can be extremely
    // slow.  We instead jump directly to the next matching weekday whenever all
    // BYDAY tokens are simple two-letter codes (e.g. "MO").
    if (this.opts.byDay?.length) {
      const dayMap: Record<string, number> = {
        MO: 1,
        TU: 2,
        WE: 3,
        TH: 4,
        FR: 5,
        SA: 6,
        SU: 7,
      };

      let deltas: number[] = [];
      if (
        ["DAILY", "HOURLY", "MINUTELY", "SECONDLY"].includes(this.opts.freq) &&
        this.opts.byDay.every((tok) => /^[A-Z]{2}$/.test(tok))
      ) {
        deltas = this.opts.byDay.map(
          (tok) => (dayMap[tok]! - zdt.dayOfWeek + 7) % 7
        );
      } else {
        deltas = this.opts.byDay
          .map((tok) => {
            const wdTok = tok.match(/(MO|TU|WE|TH|FR|SA|SU)$/)?.[1];
            return wdTok ? (dayMap[wdTok]! - zdt.dayOfWeek + 7) % 7 : null;
          })
          .filter((d): d is number => d !== null);
      }

      if (deltas.length) {
        zdt = zdt.add({ days: Math.min(...deltas) });
      }
    }

    // then your existing BYHOUR/BYMINUTE override logic:
    const { byHour, byMinute, bySecond } = this.opts;
    if (byHour || byMinute || bySecond) {
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
      return this.expandByTime(sameDate);
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
      const m = token.match(/^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/);
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
      // const year = zdt.year;
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

  private matchesByMonthDay(zdt: Temporal.ZonedDateTime): boolean {
    const { byMonthDay } = this.opts;
    if (!byMonthDay) return true;
    const lastDay = zdt
      .with({ day: 1 })
      .add({ months: 1 })
      .subtract({ days: 1 }).day;
    return byMonthDay.some((d) =>
      d > 0 ? zdt.day === d : zdt.day === lastDay + d + 1
    );
  }

  private matchesAll(zdt: Temporal.ZonedDateTime): boolean {
    return (
      this.matchesByDay(zdt) &&
      this.matchesByMonth(zdt) &&
      this.matchesByMonthDay(zdt) &&
      this.matchesByYearDay(zdt) &&
      this.matchesByWeekNo(zdt)
    );
  }

  private matchesByYearDay(zdt: Temporal.ZonedDateTime): boolean {
    const { byYearDay } = this.opts;
    if (!byYearDay) return true;
    const dayOfYear = zdt.dayOfYear;
    const last = zdt.with({ month: 12, day: 31 }).dayOfYear;
    return byYearDay.some((d) => (d > 0 ? dayOfYear === d : dayOfYear === last + d + 1));
  }

  private matchesByWeekNo(zdt: Temporal.ZonedDateTime): boolean {
    const { byWeekNo, wkst } = this.opts;
    if (!byWeekNo) return true;
    const dayMap: Record<string, number> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };
    const startDow = dayMap[wkst || "MO"];
    const jan1 = zdt.with({ month: 1, day: 1 });
    const delta = (jan1.dayOfWeek - startDow + 7) % 7;
    const firstWeekStart = jan1.subtract({ days: delta });
    const diffDays = zdt.toPlainDate().since(firstWeekStart.toPlainDate()).days;
    const week = Math.floor(diffDays / 7) + 1;
    const lastWeekDiff = zdt
      .with({ month: 12, day: 31 })
      .toPlainDate()
      .since(firstWeekStart.toPlainDate()).days;
    const lastWeek = Math.floor(lastWeekDiff / 7) + 1;
    return byWeekNo.some((n) => (n > 0 ? week === n : week === lastWeek + n + 1));
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

    // --- 1) MONTHLY + BYDAY/BYMONTHDAY (multi-day expansions) ---
    if (
      this.opts.freq === "MONTHLY" &&
      (this.opts.byDay || this.opts.byMonthDay)
    ) {
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
            return this.expandByTime(sameDate);
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
    if (
      this.opts.freq === "YEARLY" &&
      this.opts.byMonth &&
      !this.opts.byDay &&
      !this.opts.byMonthDay
    ) {
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

    // --- 4) YEARLY + BYDAY/BYMONTHDAY ---
    if (
      this.opts.freq === "YEARLY" &&
      (this.opts.byDay || this.opts.byMonthDay)
    ) {
      const start = this.originalDtstart;
      let yearCursor = start.with({ month: 1, day: 1 });
      let matchCount = 0;

      outer_year: while (true) {
        const occs = this.generateYearlyOccurrences(yearCursor);
        for (const occ of occs) {
          if (Temporal.ZonedDateTime.compare(occ, start) < 0) continue;
          if (
            this.opts.until &&
            Temporal.ZonedDateTime.compare(occ, this.opts.until) > 0
          ) {
            break outer_year;
          }
          if (this.opts.count !== undefined && matchCount >= this.opts.count) {
            break outer_year;
          }
          if (iterator && !iterator(occ, matchCount)) {
            break outer_year;
          }
          dates.push(occ);
          matchCount++;
        }
        yearCursor = yearCursor.add({ years: this.opts.interval! });
      }
      return dates;
    }

    // --- 4b) YEARLY + BYYEARDAY/BYWEEKNO ---
    if (
      this.opts.freq === "YEARLY" &&
      (this.opts.byYearDay || this.opts.byWeekNo)
    ) {
      const start = this.originalDtstart;
      let yearCursor = start.with({ month: 1, day: 1 });
      let matchCount = 0;

      outer_year2: while (true) {
        const occs = this.generateYearlyOccurrences(yearCursor);
        for (const occ of occs) {
          if (Temporal.ZonedDateTime.compare(occ, start) < 0) continue;
          if (
            this.opts.until &&
            Temporal.ZonedDateTime.compare(occ, this.opts.until) > 0
          ) {
            break outer_year2;
          }
          if (this.opts.count !== undefined && matchCount >= this.opts.count) {
            break outer_year2;
          }
          if (iterator && !iterator(occ, matchCount)) {
            break outer_year2;
          }
          dates.push(occ);
          matchCount++;
        }
        yearCursor = yearCursor.add({ years: this.opts.interval! });
      }
      return dates;
    }

    // --- 5) fallback: step + filter ---
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

    if (this.opts.rDate) {
      const extras = this.opts.rDate.map((d) =>
        d instanceof Temporal.ZonedDateTime
          ? d
          : Temporal.Instant.from(d.toISOString()).toZonedDateTimeISO(this.tzid)
      );
      dates.push(...extras);
      dates.sort((a, b) => Temporal.ZonedDateTime.compare(a, b));
      const dedup: Temporal.ZonedDateTime[] = [];
      for (const d of dates) {
        if (
          dedup.length === 0 ||
          Temporal.ZonedDateTime.compare(d, dedup[dedup.length - 1]) !== 0
        ) {
          dedup.push(d);
        }
      }
      return dedup;
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

    // 1) MONTHLY + BYDAY/BYMONTHDAY
    if (
      this.opts.freq === "MONTHLY" &&
      (this.opts.byDay || this.opts.byMonthDay)
    ) {
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
          const startOk = inc
            ? Temporal.Instant.compare(inst, startInst) >= 0
            : Temporal.Instant.compare(inst, startInst) > 0;
          if (startOk) {
            results.push(occ);
          }
        }
        monthCursor = monthCursor.add({ months: this.opts.interval! });
      }
      return this.mergeRDates(results, startInst, endInst, inc);
    }

    // 2) YEARLY + BYMONTH
    if (
      this.opts.freq === "YEARLY" &&
      this.opts.byMonth &&
      !this.opts.byDay &&
      !this.opts.byMonthDay
    ) {
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
        const startOk = inc
          ? Temporal.Instant.compare(inst, startInst) >= 0
          : Temporal.Instant.compare(inst, startInst) > 0;
        if (startOk) {
          results.push(occ);
        }
        i++;
      }
      return this.mergeRDates(results, startInst, endInst, inc);
    }

    // YEARLY + BYDAY/BYMONTHDAY
    if (
      this.opts.freq === "YEARLY" &&
      (this.opts.byDay || this.opts.byMonthDay)
    ) {
      const start = this.originalDtstart;
      let yearCursor = start.with({ month: 1, day: 1 });

      outer_year: while (true) {
        const occs = this.generateYearlyOccurrences(yearCursor);
        for (const occ of occs) {
          const inst = occ.toInstant();
          if (
            inc
              ? Temporal.Instant.compare(inst, endInst) > 0
              : Temporal.Instant.compare(inst, endInst) >= 0
          ) {
            break outer_year;
          }
          const startOk = inc
            ? Temporal.Instant.compare(inst, startInst) >= 0
            : Temporal.Instant.compare(inst, startInst) > 0;
          if (startOk) {
            results.push(occ);
          }
        }
        yearCursor = yearCursor.add({ years: this.opts.interval! });
      }
      return this.mergeRDates(results, startInst, endInst, inc);
    }

    if (
      this.opts.freq === "YEARLY" &&
      (this.opts.byYearDay || this.opts.byWeekNo)
    ) {
      const start = this.originalDtstart;
      let yearCursor = start.with({ month: 1, day: 1 });

      outer_year2: while (true) {
        const occs = this.generateYearlyOccurrences(yearCursor);
        for (const occ of occs) {
          const inst = occ.toInstant();
          if (
            inc
              ? Temporal.Instant.compare(inst, endInst) > 0
              : Temporal.Instant.compare(inst, endInst) >= 0
          ) {
            break outer_year2;
          }
          const startOk = inc
            ? Temporal.Instant.compare(inst, startInst) >= 0
            : Temporal.Instant.compare(inst, startInst) > 0;
          if (startOk) {
            results.push(occ);
          }
        }
        yearCursor = yearCursor.add({ years: this.opts.interval! });
      }
      return this.mergeRDates(results, startInst, endInst, inc);
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
          const startOk = inc
            ? Temporal.Instant.compare(inst, startInst) >= 0
            : Temporal.Instant.compare(inst, startInst) > 0;
          if (startOk) {
            results.push(occ);
          }
        }
        weekCursor = weekCursor.add({ weeks: this.opts.interval! });
      }
      return this.mergeRDates(results, startInst, endInst, inc);
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
      const startOk = inc
        ? Temporal.Instant.compare(inst, startInst) >= 0
        : Temporal.Instant.compare(inst, startInst) > 0;
      if (startOk && this.matchesAll(current)) {
        results.push(current);
      }
      current = this.nextCandidateSameDate(current);
    }
    return this.mergeRDates(results, startInst, endInst, inc);
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

    let result: Temporal.ZonedDateTime | null = null;
    this.all((occ) => {
      const inst = occ.toInstant();
      const ok = inc
        ? Temporal.Instant.compare(inst, afterInst) >= 0
        : Temporal.Instant.compare(inst, afterInst) > 0;
      if (ok) {
        result = occ;
        return false;
      }
      return true;
    });

    return result;
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

    let prev: Temporal.ZonedDateTime | null = null;
    this.all((occ) => {
      const inst = occ.toInstant();
      const beyond = inc
        ? Temporal.Instant.compare(inst, beforeInst) > 0
        : Temporal.Instant.compare(inst, beforeInst) >= 0;
      if (beyond) return false;
      prev = occ;
      return true;
    });

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
      byMonthDay,
    } = this.opts;

    parts.push(`FREQ=${freq}`);
    if (interval !== 1) parts.push(`INTERVAL=${interval}`);
    if (count !== undefined) parts.push(`COUNT=${count}`);
    if (until) {
      const u = until.toInstant().toString().replace(/[-:]/g, "");
      parts.push(`UNTIL=${u.slice(0, 15)}Z`);
    }
    if (byHour) parts.push(`BYHOUR=${byHour.join(",")}`);
    if (byMinute) parts.push(`BYMINUTE=${byMinute.join(",")}`);
    if (byDay) parts.push(`BYDAY=${byDay.join(",")}`);
    if (byMonth) parts.push(`BYMONTH=${byMonth.join(",")}`);
    if (byMonthDay) parts.push(`BYMONTHDAY=${byMonthDay.join(",")}`);

    return [dtLine, `RRULE:${parts.join(";")}`].join("\n");
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
      byMinute,
      byMonth,
      byMonthDay,
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
      parts.push(
        "in",
        list(byMonth, (m) => MONTH_NAMES[(m as number) - 1]!)
      );
    }

    if (byMonthDay) {
      parts.push(
        "on the",
        list(byMonthDay, (d) => ordinal(d as number)),
        "day of the month"
      );
    }

    if (byHour) {
      const minutes = byMinute ?? [0];
      const times = byHour.flatMap((h) => minutes.map((m) => formatTime(h, m)));
      parts.push("at", list(times));
      parts.push(tzAbbreviation(this.originalDtstart));
    }

    if (until) {
      parts.push(
        "until",
        formatter(until.year, MONTH_NAMES[until.month - 1]!, until.day)
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
    const { byDay, byMonth, byMonthDay } = this.opts;

    // 1) Skip whole month if BYMONTH says so
    if (byMonth && !byMonth.includes(sample.month)) return [];

    const lastDay = sample
      .with({ day: 1 })
      .add({ months: 1 })
      .subtract({ days: 1 }).day;

    // days matched by BYMONTHDAY tokens
    let byMonthDayHits: number[] = [];
    if (byMonthDay && byMonthDay.length > 0) {
      byMonthDayHits = byMonthDay
        .map((d) => (d > 0 ? d : lastDay + d + 1))
        .filter((d) => d >= 1 && d <= lastDay);
    }

    if (!byDay && byMonthDayHits.length) {
      const dates = byMonthDayHits.map((d) => sample.with({ day: d }));
      return dates
        .flatMap((z) => this.expandByTime(z))
        .sort((a, b) => Temporal.ZonedDateTime.compare(a, b));
    }

    if (!byDay) {
      return this.expandByTime(sample);
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
        const m = tok.match(/^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/);
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

    // Resolve tokens → concrete days from BYDAY
    const byDayHits: number[] = [];
    for (const { ord, wd } of tokens) {
      const list = buckets[wd] ?? [];
      if (!list.length) continue;

      if (ord === 0) {
        // every Monday, etc.
        for (const d of list) byDayHits.push(d);
      } else {
        const idx = ord > 0 ? ord - 1 : list.length + ord;
        const dayN = list[idx];
        if (dayN) byDayHits.push(dayN);
      }
    }
    // Combine with BYMONTHDAY if present
    let finalDays = byDayHits;
    if (byMonthDayHits.length) {
      finalDays = finalDays.filter((d) => byMonthDayHits.includes(d));
    }

    const hits = finalDays.map((d) => sample.with({ day: d }));
    let expanded = hits
      .flatMap((z) => this.expandByTime(z))
      .sort((a, b) => Temporal.ZonedDateTime.compare(a, b));
    expanded = this.applyBySetPos(expanded);
    return expanded;
  }

  /**
   * Given any date in a year, return all ZonedDateTimes in that year matching
   * the BYDAY/BYMONTHDAY/BYMONTH constraints. Months default to DTSTART's month
   * if BYMONTH is not specified.
   */
  private generateYearlyOccurrences(
    sample: Temporal.ZonedDateTime
  ): Temporal.ZonedDateTime[] {
    const months = this.opts.byMonth
      ? [...this.opts.byMonth].sort((a, b) => a - b)
      : [this.originalDtstart.month];

    let occs: Temporal.ZonedDateTime[] = [];

    if (this.opts.byDay && this.opts.byDay.some((t) => /\d{2}/.test(t))) {
      // nth weekday of year
      const dayMap: Record<string, number> = {
        MO: 1,
        TU: 2,
        WE: 3,
        TH: 4,
        FR: 5,
        SA: 6,
        SU: 7,
      };
      for (const tok of this.opts.byDay) {
        const m = tok.match(/^([+-]?\d{1,2})(MO|TU|WE|TH|FR|SA|SU)$/);
        if (!m) continue;
        const ord = parseInt(m[1], 10);
        const wd = dayMap[m[2]];
        let dt: Temporal.ZonedDateTime;
        if (ord > 0) {
          const jan1 = sample.with({ month: 1, day: 1 });
          const delta = (wd - jan1.dayOfWeek + 7) % 7;
          dt = jan1.add({ days: delta + 7 * (ord - 1) });
        } else {
          const dec31 = sample.with({ month: 12, day: 31 });
          const delta = (dec31.dayOfWeek - wd + 7) % 7;
          dt = dec31.subtract({ days: delta + 7 * (-ord - 1) });
        }
        if (!this.opts.byMonth || this.opts.byMonth.includes(dt.month)) {
          occs.push(...this.expandByTime(dt));
        }
      }
    } else if (!this.opts.byYearDay && !this.opts.byWeekNo) {
      occs = months.flatMap((m) => {
        const monthSample = sample.with({ month: m, day: 1 });
        return this.generateMonthlyOccurrences(monthSample);
      });
    }

    if (this.opts.byYearDay) {
      const last = sample.with({ month: 12, day: 31 }).dayOfYear;
      for (const d of this.opts.byYearDay) {
        const dayNum = d > 0 ? d : last + d + 1;
        const dt = sample
          .with({ month: 1, day: 1 })
          .add({ days: dayNum - 1 });
        if (!this.opts.byMonth || this.opts.byMonth.includes(dt.month)) {
          occs.push(...this.expandByTime(dt));
        }
      }
    }

    if (this.opts.byWeekNo) {
      const dayMap: Record<string, number> = {
        MO: 1,
        TU: 2,
        WE: 3,
        TH: 4,
        FR: 5,
        SA: 6,
        SU: 7,
      };
      const wkst = dayMap[this.opts.wkst || "MO"];
      const jan1 = sample.with({ month: 1, day: 1 });
      const delta = (jan1.dayOfWeek - wkst + 7) % 7;
      const firstWeekStart = jan1.subtract({ days: delta });
      const lastWeekDiff = sample
        .with({ month: 12, day: 31 })
        .toPlainDate()
        .since(firstWeekStart.toPlainDate()).days;
      const lastWeek = Math.floor(lastWeekDiff / 7) + 1;

      const tokens = this.opts.byDay?.length
        ? this.opts.byDay.map((tok) => tok.match(/(MO|TU|WE|TH|FR|SA|SU)$/)?.[1])
        : [this.opts.wkst || "MO"];

      for (const weekNo of this.opts.byWeekNo) {
        const weekIndex = weekNo > 0 ? weekNo - 1 : lastWeek + weekNo;
        const weekStart = firstWeekStart.add({ weeks: weekIndex });
        for (const tok of tokens) {
          if (!tok) continue;
          const targetDow = dayMap[tok];
          const inst = weekStart.add({ days: (targetDow - wkst + 7) % 7 });
          if (!this.opts.byMonth || this.opts.byMonth.includes(inst.month)) {
            occs.push(...this.expandByTime(inst));
          }
        }
      }
    }

    occs = occs.sort((a, b) => Temporal.ZonedDateTime.compare(a, b));
    occs = this.applyBySetPos(occs);
    return occs;
  }

  private applyBySetPos(list: Temporal.ZonedDateTime[]): Temporal.ZonedDateTime[] {
    const { bySetPos } = this.opts;
    if (!bySetPos || !bySetPos.length) return list;
    const sorted = [...list].sort((a, b) => Temporal.ZonedDateTime.compare(a, b));
    const out: Temporal.ZonedDateTime[] = [];
    const len = sorted.length;
    for (const pos of bySetPos) {
      const idx = pos > 0 ? pos - 1 : len + pos;
      if (idx >= 0 && idx < len) out.push(sorted[idx]);
    }
    return out.sort((a, b) => Temporal.ZonedDateTime.compare(a, b));
  }

  private mergeRDates(
    list: Temporal.ZonedDateTime[],
    startInst: Temporal.Instant,
    endInst: Temporal.Instant,
    inc: boolean
  ): Temporal.ZonedDateTime[] {
    if (!this.opts.rDate) return list;
    const extras = this.opts.rDate.map((d) =>
      d instanceof Temporal.ZonedDateTime
        ? d
        : Temporal.Instant.from(d.toISOString()).toZonedDateTimeISO(this.tzid)
    );
    for (const z of extras) {
      const inst = z.toInstant();
      const startOk = inc
        ? Temporal.Instant.compare(inst, startInst) >= 0
        : Temporal.Instant.compare(inst, startInst) > 0;
      const endOk = inc
        ? Temporal.Instant.compare(inst, endInst) <= 0
        : Temporal.Instant.compare(inst, endInst) < 0;
      if (startOk && endOk) list.push(z);
    }
    list.sort((a, b) => Temporal.ZonedDateTime.compare(a, b));
    const dedup: Temporal.ZonedDateTime[] = [];
    for (const d of list) {
      if (
        dedup.length === 0 ||
        Temporal.ZonedDateTime.compare(d, dedup[dedup.length - 1]) !== 0
      ) {
        dedup.push(d);
      }
    }
    return dedup;
  }
}

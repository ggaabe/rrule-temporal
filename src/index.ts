// rrule-temporal.ts
import {Temporal} from '@js-temporal/polyfill';

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
/**
 * Shared options for all rule constructors.
 *
 * @property tzid - Time zone identifier as defined in RFC&nbsp;5545 §3.2.19.
 * @property maxIterations - Safety cap when generating occurrences.
 * @property includeDtstart - Include DTSTART even if it does not match the rule.
 */
interface BaseOpts {
  tzid?: string;
  maxIterations?: number;
  includeDtstart?: boolean;
}

/**
 * Manual rule definition following the recurrence rule parts defined in
 * RFC&nbsp;5545 §3.3.10.
 */
interface ManualOpts extends BaseOpts {
  /** FREQ: recurrence frequency */
  freq: Freq;
  /** INTERVAL between each occurrence of {@link freq} */
  interval?: number;
  /** COUNT: total number of occurrences */
  count?: number;
  /** UNTIL: last possible occurrence */
  until?: Temporal.ZonedDateTime;
  /** BYHOUR: hours to include (0-23) */
  byHour?: number[];
  /** BYMINUTE: minutes to include (0-59) */
  byMinute?: number[];
  /** BYSECOND: seconds to include (0-59) */
  bySecond?: number[];
  /** BYDAY: list of weekdays e.g. ["MO","WE","FR"] */
  byDay?: string[];
  /** BYMONTH: months of the year (1-12) */
  byMonth?: number[];
  /** BYMONTHDAY: days of the month (1..31 or negative from end) */
  byMonthDay?: number[];
  /** BYYEARDAY: days of the year (1..366 or negative from end) */
  byYearDay?: number[];
  /** BYWEEKNO: ISO week numbers (1..53 or negative from end) */
  byWeekNo?: number[];
  /** BYSETPOS: select n-th occurrence(s) after other filters */
  bySetPos?: number[];
  /** WKST: weekday on which the week starts ("MO".."SU") */
  wkst?: string;
  /** RDATE: additional dates to include */
  rDate?: Temporal.ZonedDateTime[];
  /** EXDATE: exception dates to exclude */
  exDate?: Temporal.ZonedDateTime[];
  /** DTSTART: first occurrence */
  dtstart: Temporal.ZonedDateTime;
}
interface IcsOpts extends BaseOpts {
  rruleString: string; // full "DTSTART...\nRRULE..." snippet
}
export type RRuleOptions = ManualOpts | IcsOpts;

/**
 * Unfold lines according to RFC 5545 specification.
 * Lines can be folded by inserting CRLF followed by a single linear white-space character.
 * This function removes such folding by removing CRLF and the immediately following space/tab.
 */
function unfoldLine(foldedLine: string): string {
  // Remove CRLF followed by a single space or tab
  return foldedLine.replace(/\r?\n[ \t]/g, '');
}

/**
 * Parse date values from EXDATE or RDATE lines
 */
function parseDateValues(
  dateValues: string[],
  tzid: string
): Temporal.ZonedDateTime[] {
  const dates: Temporal.ZonedDateTime[] = [];

  for (const dateValue of dateValues) {
    // Handle Z suffix like UNTIL does
    if (/Z$/.test(dateValue)) {
      const iso =
        `${dateValue.slice(0, 4)}-${dateValue.slice(4, 6)}-` +
        `${dateValue.slice(6, 8)}T${dateValue.slice(9, 15)}Z`;
      dates.push(Temporal.Instant.from(iso).toZonedDateTimeISO(tzid || "UTC"));
    } else {
      const isoDate =
        `${dateValue.slice(0, 4)}-${dateValue.slice(4, 6)}-${dateValue.slice(6, 8)}` +
        `T${dateValue.slice(9)}`;
      dates.push(Temporal.PlainDateTime.from(isoDate).toZonedDateTime(tzid));
    }
  }

  return dates;
}

/**
 * Parse either a full ICS snippet or an RRULE line into ManualOpts
 */
function parseRRuleString(input: string, targetTimezone?: string): ManualOpts {
  // Unfold the input according to RFC 5545 specification
  const unfoldedInput = unfoldLine(input).trim();

  let dtstart: Temporal.ZonedDateTime;
  let tzid: string = "UTC";
  let rruleLine: string;
  let exDate: Temporal.ZonedDateTime[] = [];
  let rDate: Temporal.ZonedDateTime[] = [];

  if (/^DTSTART/mi.test(unfoldedInput)) {
    // ICS snippet: split DTSTART, RRULE, EXDATE, and RDATE
    const lines = unfoldedInput.split(/\s+/);
    const dtLine = lines[0];
    const rrLine = lines.find(line => line.match(/^RRULE:/i));
    const exLines = lines.filter(line => line.match(/^EXDATE/i));
    const rLines = lines.filter(line => line.match(/^RDATE/i));

    const m = dtLine?.match(/DTSTART(?:;TZID=([^:]+))?:(\d{8}T\d{6}Z?)/i);
    if (!m) throw new Error("Invalid DTSTART in ICS snippet");
    tzid = m[1] ?? targetTimezone ?? tzid;
    dtstart = parseDateValues([m[2]!],tzid)[0]!

    rruleLine = rrLine!;

    // Parse EXDATE lines
    for (const exLine of exLines) {
      const exMatch = exLine.match(/EXDATE(?:;TZID=([^:]+))?:(.+)/i);
      if (exMatch) {
        const exTzid = exMatch[1] || tzid;
        const dateValues = exMatch[2]!.split(',');
        exDate.push(...parseDateValues(dateValues, exTzid));
      }
    }

    // Parse RDATE lines
    for (const rLine of rLines) {
      const rMatch = rLine.match(/RDATE(?:;TZID=([^:]+))?:(.+)/i);
      if (rMatch) {
        const rTzid = rMatch[1] || tzid;
        const dateValues = rMatch[2]!.split(',');
        rDate.push(...parseDateValues(dateValues, rTzid));
      }
    }
  } else {
      throw new Error("dtstart required when parsing RRULE alone");
  }

  // Parse RRULE
  const parts = rruleLine ? rruleLine.replace(/^RRULE:/i, "").split(";") : [];
  const opts = {
    dtstart,
    tzid,
    exDate: exDate.length > 0 ? exDate : undefined,
    rDate: rDate.length > 0 ? rDate : undefined
  } as ManualOpts;
  for (const part of parts) {
    const [key, val] = part.split("=");
    if (!key) continue;
    switch (key.toUpperCase()) {
      case "FREQ":
        opts.freq = val!.toUpperCase() as Freq;
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


export class RRuleTemporal {
  private tzid: string;
  private originalDtstart: Temporal.ZonedDateTime;
  private opts: ManualOpts;
  private maxIterations: number;
  private includeDtstart: boolean;

  constructor(params: ({ rruleString: string } & BaseOpts) | ManualOpts) {
    let manual: ManualOpts;
    if ("rruleString" in params) {
      const parsed = parseRRuleString(params.rruleString, params.tzid)
      this.tzid = parsed.tzid ?? params.tzid ?? "UTC";
      this.originalDtstart = parsed.dtstart as Temporal.ZonedDateTime;
      manual = {...params,...parsed};
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
    this.maxIterations = manual.maxIterations ?? 10000;
    this.includeDtstart = manual.includeDtstart ?? false; // Default to RFC 5545 compliant behavior
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
      opts.byHour = opts.byHour.filter((n) => Number.isInteger(n) && n >= 0 && n <= 23).sort((a, b) => a - b);
      if (opts.byHour.length === 0) delete opts.byHour;
    }
    if (opts.byMinute) {
      opts.byMinute = opts.byMinute.filter((n) => Number.isInteger(n) && n >= 0 && n <= 59).sort((a, b) => a - b);
      if (opts.byMinute.length === 0) delete opts.byMinute;
    }
    if (opts.bySecond) {
      opts.bySecond = opts.bySecond.filter((n) => Number.isInteger(n) && n >= 0 && n <= 59).sort((a, b) => a - b);
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

    // MINUTELY frequency with BYHOUR constraint but no BYMINUTE - advance by interval minutes
    // and check if we're still in an allowed hour, otherwise find the next allowed hour
    if (freq === "MINUTELY" && byHour && byHour.length > 1 && !byMinute && interval > 1) {
      const next = zdt.add({ minutes: interval });
      if (byHour.includes(next.hour)) {
        return next;
      }
      // Find next allowed hour
      const nextHour = byHour.find(h => h > zdt.hour) || byHour[0];
      if (nextHour && nextHour > zdt.hour) {
        return zdt.with({ hour: nextHour, minute: 0 });
      }
      // Move to next day and use first allowed hour
      return this.applyTimeOverride(zdt.add({ days: 1 }));
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
        return zdt.with({
          minute: byMinute[idx + 1],
          second: bySecond ? bySecond[0] : zdt.second
        });
      }
    }

    if (byHour && byHour.length > 1) {
      const idx = byHour.indexOf(zdt.hour);
      if (idx !== -1 && idx < byHour.length - 1) {
        // next hour on the same day
        return zdt.with({
          hour: byHour[idx + 1],
          minute: byMinute ? byMinute[0] : zdt.minute,
          second: bySecond ? bySecond[0] : zdt.second,
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
    const startDow = dayMap[(wkst ?? "MO") as keyof typeof dayMap]!;
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
    let iterationCount = 0;

    // --- 1) MONTHLY + BYDAY/BYMONTHDAY (multi-day expansions) ---
    if (
      this.opts.freq === "MONTHLY" &&
      (this.opts.byDay || this.opts.byMonthDay)
    ) {
      const start = this.originalDtstart;
      let monthCursor = start.with({ day: 1 });
      let matchCount = 0;

      // Include dtstart even if it doesn't match the rule when includeDtstart is true
      if (this.includeDtstart && !this.matchesAll(start)) {
        if (iterator && !iterator(start, matchCount)) {
          return this.applyCountLimitAndMergeRDates(dates, iterator);
        }
        dates.push(start);
        matchCount++;
        if (this.shouldBreakForCountLimit(matchCount)) {
          return this.applyCountLimitAndMergeRDates(dates, iterator);
        }
      }

      outer_month: while (true) {
        if (++iterationCount > this.maxIterations) {
          throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
        }

        const occs = this.generateMonthlyOccurrences(monthCursor);
        // Skip this month entirely if **any** occurrence precedes DTSTART AND
        // DTSTART matches the rule (i.e., DTSTART is in the occurrences list).
        if (
          monthCursor.month === start.month &&
          occs.some((o) => Temporal.ZonedDateTime.compare(o, start) < 0) &&
          occs.some((o) => Temporal.ZonedDateTime.compare(o, start) === 0)
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
          if (iterator && !iterator(occ, matchCount)) {
            break outer_month;
          }
          dates.push(occ);
          matchCount++;
          if (this.shouldBreakForCountLimit(matchCount)) {
            break outer_month;
          }
        }
        monthCursor = monthCursor.add({ months: this.opts.interval! });
      }

      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }

    // --- 2) WEEKLY + BYDAY (or default to DTSTART’s weekday) ---
    if (this.opts.freq === "WEEKLY") {
      if (this.opts.byYearDay && this.opts.byYearDay.length > 0) {
        const start = this.originalDtstart;

        // Include dtstart even if it doesn't match the rule when includeDtstart is true
        if (this.includeDtstart && !this.matchesAll(start)) {
          if (iterator && !iterator(start, 0)) {
            return this.applyCountLimitAndMergeRDates(dates, iterator);
          }
          dates.push(start);
          if (this.shouldBreakForCountLimit(1)) {
            return this.applyCountLimitAndMergeRDates(dates, iterator);
          }
        }

        let yearCursor = start.with({ month: 1, day: 1 });
        let matchCount = dates.length;

        outer_year_for_weekly: while (true) {
          if (++iterationCount > this.maxIterations) {
            throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
          }

          const occs = this.generateYearlyOccurrences(yearCursor);
          for (const occ of occs) {
            if (Temporal.ZonedDateTime.compare(occ, start) < 0) continue;
            if (
              this.opts.until &&
              Temporal.ZonedDateTime.compare(occ, this.opts.until) > 0
            ) {
              break outer_year_for_weekly;
            }
            if (iterator && !iterator(occ, matchCount)) {
              break outer_year_for_weekly;
            }
            dates.push(occ);
            matchCount++;
            if (this.shouldBreakForCountLimit(matchCount)) {
              break outer_year_for_weekly;
            }
          }
          if (this.opts.until && yearCursor.year > this.opts.until.year) {
            break;
          }
          yearCursor = yearCursor.add({ years: 1 });
        }

        return this.applyCountLimitAndMergeRDates(dates, iterator);
      }
      const start = this.originalDtstart;

      // Include dtstart even if it doesn't match the rule when includeDtstart is true
      if (this.includeDtstart && !this.matchesAll(start)) {
        if (iterator && !iterator(start, 0)) {
          return this.applyCountLimitAndMergeRDates(dates, iterator);
        }
        dates.push(start);
        if (this.shouldBreakForCountLimit(1)) {
          return this.applyCountLimitAndMergeRDates(dates, iterator);
        }
      }

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
        .map((tok) => dayMap[tok.slice(-2) as keyof typeof dayMap])
        .filter((d): d is number => d !== undefined)
        .sort((a, b) => a - b);

      // Find the very first weekCursor: the earliest of this week’s matching days ≥ start
      const firstWeekDates = dows.map((dw) => {
        const delta = (dw - start.dayOfWeek + 7) % 7;
        return start.add({ days: delta });
      });
      let firstOccurrence = firstWeekDates.reduce((a, b) =>
        Temporal.ZonedDateTime.compare(a, b) <= 0 ? a : b
      );

      // Get the week start day (default to Monday if not specified)
      const wkstDay = dayMap[this.opts.wkst || 'MO'] ?? 1;

      // Align weekCursor to the week start that contains the first occurrence
      const firstOccWeekOffset = (firstOccurrence.dayOfWeek - wkstDay + 7) % 7;
      let weekCursor = firstOccurrence.subtract({ days: firstOccWeekOffset });
      let matchCount = 0;

      outer_week: while (true) {
        // Generate this week’s occurrences
        if (++iterationCount > this.maxIterations) {
          throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
        }

        let occs = dows
          .flatMap((dw) => {
            const delta = (dw - wkstDay + 7) % 7;
            const sameDate = weekCursor.add({ days: delta });
            return this.expandByTime(sameDate);
          })
          .sort((a, b) => Temporal.ZonedDateTime.compare(a, b));

        occs = this.applyBySetPos(occs);

        for (const occ of occs) {
          if (Temporal.ZonedDateTime.compare(occ, start) < 0) continue;
          if (
            this.opts.until &&
            Temporal.ZonedDateTime.compare(occ, this.opts.until) > 0
          ) {
            break outer_week;
          }
          if (iterator && !iterator(occ, matchCount)) {
            break outer_week;
          }
          dates.push(occ);
          matchCount++;
          if (this.shouldBreakForCountLimit(matchCount)) {
            break outer_week;
          }
        }

        weekCursor = weekCursor.add({ weeks: this.opts.interval! });
      }

      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }

    // --- 3) MONTHLY + BYMONTH (without BYDAY/BYMONTHDAY) ---
    if (
      this.opts.freq === "MONTHLY" &&
      this.opts.byMonth &&
      !this.opts.byDay &&
      !this.opts.byMonthDay
    ) {
      const start = this.originalDtstart;

      // Include dtstart even if it doesn't match the rule when includeDtstart is true
      if (this.includeDtstart && !this.matchesAll(start)) {
        if (iterator && !iterator(start, 0)) {
          return this.applyCountLimitAndMergeRDates(dates, iterator);
        }
        dates.push(start);
        if (this.shouldBreakForCountLimit(1)) {
          return this.applyCountLimitAndMergeRDates(dates, iterator);
        }
      }

      const months = [...this.opts.byMonth].sort((a, b) => a - b);
      let monthOffset = 0;
      let matchCount = dates.length; // Account for dtstart already added in non-strict mode

      // Find the first month >= dtstart.month
      let startMonthIndex = months.findIndex(m => m >= start.month);
      if (startMonthIndex === -1) {
        // All months are before dtstart.month, start from first month of next year
        startMonthIndex = 0;
        monthOffset = 1;
      }

      while (true) {
        if (++iterationCount > this.maxIterations) {
          throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
        }

        const monthIndex = startMonthIndex + monthOffset;
        const targetMonth = months[monthIndex % months.length];
        const yearsToAdd = Math.floor(monthIndex / months.length);

        const candidate = start.with({
          year: start.year + yearsToAdd,
          month: targetMonth
        });

        if (
          this.opts.until &&
          Temporal.ZonedDateTime.compare(candidate, this.opts.until) > 0
        ) {
          break;
        }

        if (Temporal.ZonedDateTime.compare(candidate, start) >= 0) {
          if (iterator && !iterator(candidate, matchCount)) {
            break;
          }
          dates.push(candidate);
          matchCount++;
          if (this.shouldBreakForCountLimit(matchCount)) {
            break;
          }
        }

        monthOffset++;
      }

      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }

    // --- 4) YEARLY + BYMONTH (all specified months per year) ---
    if (
      this.opts.freq === "YEARLY" &&
      this.opts.byMonth &&
      !this.opts.byDay &&
      !this.opts.byMonthDay
    ) {
      const start = this.originalDtstart;

      // Include dtstart even if it doesn't match the rule when includeDtstart is true
      if (this.includeDtstart && !this.matchesAll(start)) {
        if (iterator && !iterator(start, 0)) {
          return this.applyCountLimitAndMergeRDates(dates, iterator);
        }
        dates.push(start);
        if (this.shouldBreakForCountLimit(1)) {
          return this.applyCountLimitAndMergeRDates(dates, iterator);
        }
      }
      const months = [...this.opts.byMonth].sort((a, b) => a - b);
      let yearOffset = 0;
      let matchCount = 0;

      while (true) {
        if (++iterationCount > this.maxIterations) {
          throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
        }

        const year = start.year + yearOffset * this.opts.interval!;

        for (const month of months) {
          let occ = start.with({ year, month });
          occ = this.applyTimeOverride(occ);

          if (Temporal.ZonedDateTime.compare(occ, start) < 0) {
            continue;
          }
          if (
            this.opts.until &&
            Temporal.ZonedDateTime.compare(occ, this.opts.until) > 0
          ) {
            return dates;
          }
          if (iterator && !iterator(occ, matchCount)) {
            return dates;
          }

          dates.push(occ);
          matchCount++;
          if (this.shouldBreakForCountLimit(matchCount)) {
            return this.applyCountLimitAndMergeRDates(dates, iterator);
          }
        }
        yearOffset++;
      }

      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }

    // --- 5) YEARLY + BYDAY/BYMONTHDAY ---
    if (
      this.opts.freq === "YEARLY" &&
      (this.opts.byDay || this.opts.byMonthDay)
    ) {
      const start = this.originalDtstart;

      // Include dtstart even if it doesn't match the rule when includeDtstart is true
      if (this.includeDtstart && !this.matchesAll(start)) {
        if (iterator && !iterator(start, 0)) {
          return this.applyCountLimitAndMergeRDates(dates, iterator);
        }
        dates.push(start);
        if (this.shouldBreakForCountLimit(1)) {
          return this.applyCountLimitAndMergeRDates(dates, iterator);
        }
      }

      let yearCursor = start.with({ month: 1, day: 1 });
      let matchCount = 0;

      outer_year: while (true) {
        if (++iterationCount > this.maxIterations) {
          throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
        }

        const occs = this.generateYearlyOccurrences(yearCursor);
        for (const occ of occs) {
          if (Temporal.ZonedDateTime.compare(occ, start) < 0) continue;
          if (
            this.opts.until &&
            Temporal.ZonedDateTime.compare(occ, this.opts.until) > 0
          ) {
            break outer_year;
          }
          if (iterator && !iterator(occ, matchCount)) {
            break outer_year;
          }
          dates.push(occ);
          matchCount++;
          if (this.shouldBreakForCountLimit(matchCount)) {
            break outer_year;
          }
        }
        yearCursor = yearCursor.add({ years: this.opts.interval! });
      }

      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }

    // --- 6) YEARLY + BYYEARDAY/BYWEEKNO ---
    if (
      this.opts.freq === "YEARLY" &&
      (this.opts.byYearDay || this.opts.byWeekNo)
    ) {
      const start = this.originalDtstart;

      // Include dtstart even if it doesn't match the rule when includeDtstart is true
      if (this.includeDtstart && !this.matchesAll(start)) {
        if (iterator && !iterator(start, 0)) {
          return this.applyCountLimitAndMergeRDates(dates, iterator);
        }
        dates.push(start);
        if (this.shouldBreakForCountLimit(1)) {
          return this.applyCountLimitAndMergeRDates(dates, iterator);
        }
      }

      let yearCursor = start.with({ month: 1, day: 1 });
      let matchCount = 0;

      outer_year2: while (true) {
        if (++iterationCount > this.maxIterations) {
          throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
        }

        const occs = this.generateYearlyOccurrences(yearCursor);
        for (const occ of occs) {
          if (Temporal.ZonedDateTime.compare(occ, start) < 0) continue;
          if (
            this.opts.until &&
            Temporal.ZonedDateTime.compare(occ, this.opts.until) > 0
          ) {
            break outer_year2;
          }
          if (iterator && !iterator(occ, matchCount)) {
            break outer_year2;
          }
          dates.push(occ);
          matchCount++;
          if (this.shouldBreakForCountLimit(matchCount)) {
            break outer_year2;
          }
        }
        yearCursor = yearCursor.add({ years: this.opts.interval! });
      }

      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }

    // --- 7) fallback: step + filter ---
    let current = this.computeFirst();
    let matchCount = 0;

    // Include dtstart even if it doesn't match the rule when includeDtstart is true
    if (this.includeDtstart && Temporal.ZonedDateTime.compare(current, this.originalDtstart) > 0) {
      // dtstart doesn't match the rule, but we should include it in non-strict mode
      if (iterator && !iterator(this.originalDtstart, matchCount)) {
        return this.applyCountLimitAndMergeRDates(dates, iterator);
      }
      dates.push(this.originalDtstart);
      matchCount++;
      if (this.shouldBreakForCountLimit(matchCount)) {
        return this.applyCountLimitAndMergeRDates(dates, iterator);
      }
    }

    while (true) {
      if (++iterationCount > this.maxIterations) {
        throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
      }

      if (
        this.opts.until &&
        Temporal.ZonedDateTime.compare(current, this.opts.until) > 0
      ) {
        break;
      }
      if (this.matchesAll(current)) {
        if (iterator && !iterator(current, matchCount)) {
          break;
        }
        dates.push(current);
        matchCount++;
        if (this.shouldBreakForCountLimit(matchCount)) {
          break;
        }
      }
      current = this.nextCandidateSameDate(current);
    }

    return this.applyCountLimitAndMergeRDates(dates, iterator);
  }

  /**
   * Converts rDate entries to ZonedDateTime and merges with existing dates.
   * @param dates - Array of dates to merge with
   * @returns Merged and deduplicated array of dates
   */
  private mergeAndDeduplicateRDates(dates: Temporal.ZonedDateTime[]): Temporal.ZonedDateTime[] {
    if (!this.opts.rDate) return dates;

    dates.push(...this.opts.rDate);
    dates.sort((a, b) => Temporal.ZonedDateTime.compare(a, b));

    // Deduplicate
    const dedup: Temporal.ZonedDateTime[] = [];
    for (const d of dates) {
      if (
        dedup.length === 0 ||
        Temporal.ZonedDateTime.compare(d, dedup[dedup.length - 1]!) !== 0
      ) {
        dedup.push(d);
      }
    }
    return dedup;
  }

  /**
   * Excludes exDate entries from the given array of dates.
   * @param dates - Array of dates to filter
   * @returns Filtered array with exDate entries removed
   */
  private excludeExDates(dates: Temporal.ZonedDateTime[]): Temporal.ZonedDateTime[] {
    if (!this.opts.exDate || this.opts.exDate.length === 0) return dates;

    return dates.filter(date => {
      return !this.opts.exDate!.some(exDate =>
        Temporal.ZonedDateTime.compare(date, exDate) === 0
      );
    });
  }

  /**
   * Applies count limit and merges rDates with the rule-generated dates.
   * @param dates - Array of dates generated by the rule
   * @param iterator - Optional iterator function
   * @returns Final array of dates after merging and applying count limit
   */
  private applyCountLimitAndMergeRDates(
    dates: Temporal.ZonedDateTime[],
    iterator?: (date: Temporal.ZonedDateTime, count: number) => boolean
  ): Temporal.ZonedDateTime[] {
    const merged = this.mergeAndDeduplicateRDates(dates);
    const excluded = this.excludeExDates(merged);

    // Apply count limit to the final combined result
    if (this.opts.count !== undefined) {
      let finalCount = 0;
      const finalDates: Temporal.ZonedDateTime[] = [];
      for (const d of excluded) {
        if (finalCount >= this.opts.count) break;
        if (iterator && !iterator(d, finalCount)) break;
        finalDates.push(d);
        finalCount++;
      }
      return finalDates;
    }

    return excluded;
  }

  /**
   * Checks if the count limit should break the loop based on rDate presence.
   * @param matchCount - Current number of matches
   * @returns true if the loop should break
   */
  private shouldBreakForCountLimit(matchCount: number): boolean {
    if (this.opts.count === undefined) return false;

    if (!this.opts.rDate) {
      return matchCount >= this.opts.count;
    }

    // If we have rDates, generate enough rule occurrences to reach the count limit
    // when combined with rDates. Add a reasonable safety margin.
    const rDateCount = this.opts.rDate.length;
    const targetRuleCount = Math.max(this.opts.count - rDateCount, 0);
    const safetyMargin = Math.min(targetRuleCount, 10);
    return matchCount >= targetRuleCount + safetyMargin;
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
    let iterationCount = 0;

    // 1) MONTHLY + BYDAY/BYMONTHDAY
    if (
      this.opts.freq === "MONTHLY" &&
      (this.opts.byDay || this.opts.byMonthDay)
    ) {
      let monthCursor = this.computeFirst().with({ day: 1 });

      outer: while (true) {
        if (++iterationCount > this.maxIterations) {
          throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in between()`);
        }

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
      let yearOffset = 0;

      outer: while (true) {
        if (++iterationCount > this.maxIterations) {
          throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in between()`);
        }

        const year = start.year + yearOffset * this.opts.interval!;

        for (const month of months) {
          let occ = start.with({ year, month });
          occ = this.applyTimeOverride(occ);
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
        yearOffset++;
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
        if (++iterationCount > this.maxIterations) {
          throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in between()`);
        }

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
        if (++iterationCount > this.maxIterations) {
          throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in between()`);
        }

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
        if (++iterationCount > this.maxIterations) {
          throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in between()`);
        }

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
      if (++iterationCount > this.maxIterations) {
        throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in between()`);
      }

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
    const rule: string[] = [];
    const {
      freq,
      interval,
      count,
      until,
      byHour,
      byMinute,
      bySecond,
      byDay,
      byMonth,
      byMonthDay,
      bySetPos,
      byWeekNo,
      byYearDay,
      wkst,
      rDate,
      exDate
    } = this.opts;

    rule.push(`FREQ=${freq}`);
    if (interval !== 1) rule.push(`INTERVAL=${interval}`);
    if (count !== undefined) rule.push(`COUNT=${count}`);
    if (until) {
      const u = until.toInstant().toString().replace(/[-:]/g, "");
      rule.push(`UNTIL=${u.slice(0, 15)}Z`);
    }
    if (byHour) rule.push(`BYHOUR=${byHour.join(",")}`);
    if (byMinute) rule.push(`BYMINUTE=${byMinute.join(",")}`);
    if (bySecond) rule.push(`BYSECOND=${bySecond.join(",")}`);
    if (byDay) rule.push(`BYDAY=${byDay.join(",")}`);
    if (byMonth) rule.push(`BYMONTH=${byMonth.join(",")}`);
    if (byMonthDay) rule.push(`BYMONTHDAY=${byMonthDay.join(",")}`);
    if (bySetPos) rule.push(`BYSETPOS=${bySetPos.join(",")}`);
    if (byWeekNo) rule.push(`BYWEEKNO=${byWeekNo.join(",")}`);
    if (byYearDay) rule.push(`BYYEARDAY=${byYearDay.join(",")}`);
    if (wkst) rule.push(`WKST=${wkst}`);

    const lines = [dtLine, `RRULE:${rule.join(";")}`];
    if(rDate){
      lines.push(`RDATE:${this.joinDates(rDate)}`);
    }
    if(exDate){
      lines.push(`EXDATE:${this.joinDates(exDate)}`);
    }
    return lines.join("\n");
  }

  private joinDates(dates:Temporal.ZonedDateTime[]){
    return dates.map(d => d.toInstant().toString().replace(/[-:]/g, "").slice(0,15)+'Z');
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

    if (!byDay && byMonthDay && byMonthDay.length > 0) {
      if (byMonthDayHits.length === 0) {
        // No valid days found for this month, return empty array
        return [];
      }
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
    if (byMonthDay && byMonthDay.length > 0) {
      if (byMonthDayHits.length === 0) {
        // No valid days found for BYMONTHDAY, return empty array
        return [];
      }
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
        const ord = parseInt(m[1]!, 10);
        const wd = dayMap[m[2] as keyof typeof dayMap]!;
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
      const wkst = dayMap[(this.opts.wkst || "MO") as keyof typeof dayMap]!;
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
          const targetDow = dayMap[tok as keyof typeof dayMap]!;
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
      if (idx >= 0 && idx < len) out.push(sorted[idx]!);
    }
    return out.sort((a, b) => Temporal.ZonedDateTime.compare(a, b));
  }

  private mergeRDates(
    list: Temporal.ZonedDateTime[],
    startInst: Temporal.Instant,
    endInst: Temporal.Instant,
    inc: boolean
  ): Temporal.ZonedDateTime[] {
    if (!this.opts.rDate) return this.excludeExDates(list);

    // Filter extras by time window
    for (const z of this.opts.rDate) {
      const inst = z.toInstant();
      const startOk = inc
        ? Temporal.Instant.compare(inst, startInst) >= 0
        : Temporal.Instant.compare(inst, startInst) > 0;
      const endOk = inc
        ? Temporal.Instant.compare(inst, endInst) <= 0
        : Temporal.Instant.compare(inst, endInst) < 0;
      if (startOk && endOk) list.push(z);
    }

    // Sort and deduplicate using the common helper
    list.sort((a, b) => Temporal.ZonedDateTime.compare(a, b));
    const dedup: Temporal.ZonedDateTime[] = [];
    for (const d of list) {
      if (
        dedup.length === 0 ||
        Temporal.ZonedDateTime.compare(d, dedup[dedup.length - 1]!) !== 0
      ) {
        dedup.push(d);
      }
    }
    return this.excludeExDates(dedup);
  }
}

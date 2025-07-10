import {Temporal} from '@js-temporal/polyfill';

// Allowed frequency values
type Freq = 'YEARLY' | 'MONTHLY' | 'WEEKLY' | 'DAILY' | 'HOURLY' | 'MINUTELY' | 'SECONDLY';

/**
 * Shared options for all rule constructors.
 */
interface BaseOpts {
  /** Time zone identifier as defined in RFC&nbsp;5545 §3.2.19. */
  tzid?: string;
  /** Safety cap when generating occurrences. */
  maxIterations?: number;
  /** Include DTSTART as an occurrence even if it does not match the rule pattern. */
  includeDtstart?: boolean;
}

/**
 * Manual rule definition following the recurrence rule parts defined in
 * RFC 5545 §3.3.10.
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
 * Parse a single ICS date-time string into a Temporal.ZonedDateTime
 */
function parseIcsDateTime(dateStr: string, tzid: string, valueType?: string): Temporal.ZonedDateTime {
  const isDate = valueType === 'DATE' || !dateStr.includes('T');

  if (isDate) {
    const isoDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
    return Temporal.PlainDate.from(isoDate).toZonedDateTime({timeZone: tzid});
  }

  if (/Z$/.test(dateStr)) {
    const iso = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}T${dateStr.slice(9, 15)}Z`;
    return Temporal.Instant.from(iso).toZonedDateTimeISO(tzid || 'UTC');
  } else {
    const isoDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}T${dateStr.slice(9)}`;
    return Temporal.PlainDateTime.from(isoDate).toZonedDateTime(tzid);
  }
}

/**
 * Parse date values from EXDATE or RDATE lines
 */
function parseDateValues(dateValues: string[], tzid: string, valueType?: string) {
  const dates: Temporal.ZonedDateTime[] = [];

  for (const dateValue of dateValues) {
    dates.push(parseIcsDateTime(dateValue, tzid, valueType));
  }

  return dates;
}

function parseDateLines(lines: string[], linePrefix: 'EXDATE' | 'RDATE', defaultTzid: string) {
  const dates: Temporal.ZonedDateTime[] = [];
  const regex = new RegExp(`^${linePrefix}(?:;VALUE=([^;]+))?(?:;TZID=([^:]+))?:(.+)`, 'i');

  for (const line of lines) {
    const match = line.match(regex);
    if (match) {
      const [, valueType, tzid, dateValuesStr] = match;
      const timezone = tzid || defaultTzid;
      const dateValues = dateValuesStr!.split(',');
      dates.push(...parseDateValues(dateValues, timezone, valueType));
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
  let tzid: string = 'UTC';
  let rruleLine: string;
  let exDate: Temporal.ZonedDateTime[] = [];
  let rDate: Temporal.ZonedDateTime[] = [];

  if (/^DTSTART/im.test(unfoldedInput)) {
    // ICS snippet: split DTSTART, RRULE, EXDATE, and RDATE
    const lines = unfoldedInput.split(/\s+/);
    const dtLine = lines.find((line) => line.match(/^DTSTART/i))!;
    const rrLine = lines.find((line) => line.match(/^RRULE:/i));
    const exLines = lines.filter((line) => line.match(/^EXDATE/i));
    const rLines = lines.filter((line) => line.match(/^RDATE/i));

    const dtMatch = dtLine.match(/DTSTART(?:;VALUE=([^;]+))?(?:;TZID=([^:]+))?:(.+)/i);
    if (!dtMatch) throw new Error('Invalid DTSTART in ICS snippet');

    const [, valueType, dtTzid, dtValue] = dtMatch;
    tzid = dtTzid ?? targetTimezone ?? tzid;
    dtstart = parseIcsDateTime(dtValue!, tzid, valueType);

    rruleLine = rrLine!;

    exDate = parseDateLines(exLines, 'EXDATE', tzid);
    rDate = parseDateLines(rLines, 'RDATE', tzid);
  } else {
    throw new Error('dtstart required when parsing RRULE alone');
  }

  // Parse RRULE
  const parts = rruleLine ? rruleLine.replace(/^RRULE:/i, '').split(';') : [];
  const opts = {
    dtstart,
    tzid,
    exDate: exDate.length > 0 ? exDate : undefined,
    rDate: rDate.length > 0 ? rDate : undefined,
  } as ManualOpts;
  for (const part of parts) {
    const [key, val] = part.split('=');
    if (!key) continue;
    switch (key.toUpperCase()) {
      case 'FREQ':
        opts.freq = val!.toUpperCase() as Freq;
        break;
      case 'INTERVAL':
        opts.interval = parseInt(val!, 10);
        break;
      case 'COUNT':
        opts.count = parseInt(val!, 10);
        break;
      case 'UNTIL': {
        // RFC5545 UNTIL is YYYYMMDDTHHMMSSZ or without Z
        opts.until = parseIcsDateTime(val!, tzid || 'UTC');
        if (!/Z$/.test(val!) && tzid !== 'UTC') {
          throw new Error('UNTIL rule part MUST always be specified as a date with UTC time');
        }
        break;
      }
      case 'BYHOUR':
        opts.byHour = val!
          .split(',')
          .map((n) => parseInt(n, 10))
          .sort((a, b) => a - b);
        break;
      case 'BYMINUTE':
        opts.byMinute = val!
          .split(',')
          .map((n) => parseInt(n, 10))
          .sort((a, b) => a - b);
        break;
      case 'BYDAY':
        opts.byDay = val!.split(','); // e.g. ["MO","2FR","-1SU"]
        break;
      case 'BYMONTH':
        opts.byMonth = val!.split(',').map((n) => parseInt(n, 10));
        break;
      case 'BYMONTHDAY':
        opts.byMonthDay = val!.split(',').map((n) => parseInt(n, 10));
        break;
      case 'BYSECOND':
        opts.bySecond = val!
          .split(',')
          .map((n) => parseInt(n, 10))
          .sort((a, b) => a - b);
        break;
      case 'BYYEARDAY':
        opts.byYearDay = val!.split(',').map((n) => parseInt(n, 10));
        break;
      case 'BYWEEKNO':
        opts.byWeekNo = val!.split(',').map((n) => parseInt(n, 10));
        break;
      case 'BYSETPOS':
        opts.bySetPos = val!.split(',').map((n) => parseInt(n, 10));
        break;
      case 'WKST':
        opts.wkst = val!;
        break;
    }
  }

  return opts;
}

export class RRuleTemporal {
  private tzid: string;
  private originalDtstart: Temporal.ZonedDateTime;
  private opts: ManualOpts;
  private maxIterations: number;
  private includeDtstart: boolean;

  constructor(params: ({rruleString: string} & BaseOpts) | ManualOpts) {
    let manual: ManualOpts;
    if ('rruleString' in params) {
      const parsed = parseRRuleString(params.rruleString, params.tzid);
      this.tzid = parsed.tzid ?? params.tzid ?? 'UTC';
      this.originalDtstart = parsed.dtstart as Temporal.ZonedDateTime;
      manual = {...params, ...parsed};
    } else {
      manual = {...params};
      if (typeof manual.dtstart === 'string') {
        throw new Error('Manual dtstart must be a ZonedDateTime');
      }
      manual.tzid = manual.tzid || manual.dtstart.timeZoneId;
      this.tzid = manual.tzid;
      this.originalDtstart = manual.dtstart as Temporal.ZonedDateTime;
    }
    if (!manual.freq) throw new Error('RRULE must include FREQ');
    manual.interval = manual.interval ?? 1;
    if (manual.interval <= 0) {
      throw new Error('Cannot create RRule: interval must be greater than 0');
    }
    if (manual.until && !(manual.until instanceof Temporal.ZonedDateTime)) {
      throw new Error('Manual until must be a ZonedDateTime');
    }
    this.opts = this.sanitizeOpts(manual);
    this.maxIterations = manual.maxIterations ?? 10000;
    this.includeDtstart = manual.includeDtstart ?? false; // Default to RFC 5545 compliant behavior
  }

  private sanitizeNumericArray(
    arr: number[] | undefined,
    min: number,
    max: number,
    allowZero = false,
    sort = false,
  ): number[] | undefined {
    if (!arr) return undefined;
    const sanitized = arr.filter((n) => Number.isInteger(n) && n >= min && n <= max && (allowZero || n !== 0));
    if (sanitized.length === 0) return undefined;
    return sort ? sanitized.sort((a, b) => a - b) : sanitized;
  }

  private sanitizeOpts(opts: ManualOpts): ManualOpts {
    const validDay = /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/;
    if (opts.byDay) {
      opts.byDay = opts.byDay.filter((d) => validDay.test(d));
      if (opts.byDay.length === 0) delete opts.byDay;
    }
    opts.byMonth = this.sanitizeNumericArray(opts.byMonth, 1, 12, false, false);
    opts.byMonthDay = this.sanitizeNumericArray(opts.byMonthDay, -31, 31, false, false);
    opts.byYearDay = this.sanitizeNumericArray(opts.byYearDay, -366, 366, false, false);
    opts.byWeekNo = this.sanitizeNumericArray(opts.byWeekNo, -53, 53, false, false);
    opts.byHour = this.sanitizeNumericArray(opts.byHour, 0, 23, true, true);
    opts.byMinute = this.sanitizeNumericArray(opts.byMinute, 0, 59, true, true);
    opts.bySecond = this.sanitizeNumericArray(opts.bySecond, 0, 59, true, true);
    if (opts.bySetPos) {
      if (opts.bySetPos.some((p) => p === 0)) {
        throw new Error('bySetPos may not contain 0');
      }
      opts.bySetPos = this.sanitizeNumericArray(opts.bySetPos, -Infinity, Infinity, false, false);
    }
    return opts;
  }

  private rawAdvance(zdt: Temporal.ZonedDateTime): Temporal.ZonedDateTime {
    const {freq, interval} = this.opts;
    switch (freq) {
      case 'DAILY':
        return zdt.add({days: interval});
      case 'WEEKLY':
        return zdt.add({weeks: interval});
      case 'MONTHLY':
        return zdt.add({months: interval});
      case 'YEARLY':
        return zdt.add({years: interval});
      case 'HOURLY':
        return zdt.add({hours: interval});
      case 'MINUTELY':
        return zdt.add({minutes: interval});
      case 'SECONDLY':
        return zdt.add({seconds: interval});
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
          out.push(base.with({hour: h, minute: m, second: s}));
        }
      }
    }
    return out.sort((a, b) => Temporal.ZonedDateTime.compare(a, b));
  }

  private nextCandidateSameDate(zdt: Temporal.ZonedDateTime): Temporal.ZonedDateTime {
    const {freq, interval = 1, byHour, byMinute, bySecond} = this.opts;

    // Special case: HOURLY frequency with a single BYHOUR token would
    // otherwise keep returning the same time (e.g. always 12:00).  When
    // BYDAY filters are also present this results in an infinite loop.
    if (freq === 'HOURLY' && byHour && byHour.length === 1) {
      return this.applyTimeOverride(zdt.add({days: interval}));
    }

    // MINUTELY frequency with a single BYMINUTE value would also repeat
    // the same time. Move forward a full hour before reapplying overrides.
    if (freq === 'MINUTELY' && byMinute && byMinute.length === 1) {
      return this.applyTimeOverride(zdt.add({hours: interval}));
    }

    if (bySecond && bySecond.length > 1) {
      const idx = bySecond.indexOf(zdt.second);
      if (idx !== -1 && idx < bySecond.length - 1) {
        return zdt.with({second: bySecond[idx + 1]});
      }
    }

    // MINUTELY frequency with BYHOUR constraint but no BYMINUTE - advance by interval minutes
    // and check if we're still in an allowed hour, otherwise find the next allowed hour
    if (freq === 'MINUTELY' && byHour && byHour.length > 1 && !byMinute) {
      const next = zdt.add({minutes: interval});
      if (byHour.includes(next.hour)) {
        return next.with({second: bySecond ? bySecond[0] : zdt.second});
      }
      // Find next allowed hour
      const nextHour = byHour.find((h) => h > zdt.hour) || byHour[0];
      if (nextHour && nextHour > zdt.hour) {
        return zdt.with({hour: nextHour, minute: 0, second: bySecond ? bySecond[0] : zdt.second});
      }
      // Move to next day and use first allowed hour
      return this.applyTimeOverride(zdt.add({days: 1}));
    }

    if (freq === 'SECONDLY' && bySecond && bySecond.length === 1) {
      return this.applyTimeOverride(zdt.add({minutes: interval})).with({second: bySecond[0]});
    }

    // SECONDLY frequency with a single BYMINUTE value should emit every
    // second within that minute. When the minute rolls over, jump to the
    // next hour and reset seconds.
    if (freq === 'SECONDLY' && byMinute && byMinute.length === 1) {
      const next = zdt.add({seconds: interval});
      if (next.minute === byMinute[0]) return next;
      return this.applyTimeOverride(zdt.add({hours: interval})).with({second: 0});
    }

    if (byMinute && byMinute.length > 1) {
      const idx = byMinute.indexOf(zdt.minute);
      if (idx !== -1 && idx < byMinute.length - 1) {
        // next minute within the same hour
        return zdt.with({
          minute: byMinute[idx + 1],
          second: bySecond ? bySecond[0] : zdt.second,
        });
      }
      // For MINUTELY frequency, when we reach the last BYMINUTE value, advance to next valid hour
      if (freq === 'MINUTELY' && idx === byMinute.length - 1) {
        if (byHour && byHour.length > 0) {
          const currentHourIdx = byHour.indexOf(zdt.hour);
          if (currentHourIdx !== -1 && currentHourIdx < byHour.length - 1) {
            // next hour on same day
            return zdt.with({
              hour: byHour[currentHourIdx + 1],
              minute: byMinute[0],
              second: bySecond ? bySecond[0] : zdt.second,
            });
          } else {
            // last hour for today, advance day and take first hour
            return this.applyTimeOverride(zdt.add({days: 1}));
          }
        }
        // No byHour, just advance by interval
        return zdt.add({hours: interval}).with({
          minute: byMinute[0],
          second: bySecond ? bySecond[0] : zdt.second,
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

    // For HOURLY frequency with BYHOUR, after exhausting same-day hours,
    // advance to the next day and use the first BYHOUR
    if (freq === 'HOURLY' && byHour && byHour.length > 1) {
      return this.applyTimeOverride(zdt.add({days: 1}));
    }
    // we were already at the last BYHOUR/BYMINUTE/BYSECOND -> advance the date
    return this.applyTimeOverride(this.rawAdvance(zdt));
  }

  private applyTimeOverride(zdt: Temporal.ZonedDateTime): Temporal.ZonedDateTime {
    const {byHour, byMinute, bySecond} = this.opts;
    let dt = zdt;
    if (byHour) dt = dt.with({hour: byHour[0]});
    if (byMinute) dt = dt.with({minute: byMinute[0]});
    if (bySecond) dt = dt.with({second: bySecond[0]});
    return dt;
  }

  private computeFirst(): Temporal.ZonedDateTime {
    let zdt = this.originalDtstart;

    // If BYWEEKNO is present with small frequencies, jump to the first matching week
    if (this.opts.byWeekNo?.length && ['DAILY', 'HOURLY', 'MINUTELY', 'SECONDLY'].includes(this.opts.freq)) {
      let targetWeek = this.opts.byWeekNo[0]!;
      let targetYear = zdt.year;

      // Find the first year >= dtstart.year that has the target week
      while (targetYear <= zdt.year + 10) {
        // reasonable upper bound
        const jan1 = zdt.with({year: targetYear, month: 1, day: 1});
        const dec31 = zdt.with({year: targetYear, month: 12, day: 31});

        // Check if this year has the target week
        let hasTargetWeek = false;
        if (targetWeek > 0) {
          let maxWeek = 52;
          if (jan1.dayOfWeek === 4 || dec31.dayOfWeek === 4) {
            maxWeek = 53;
          }
          hasTargetWeek = targetWeek <= maxWeek;
        } else {
          // Negative week number
          let maxWeek = 52;
          if (jan1.dayOfWeek === 4 || dec31.dayOfWeek === 4) {
            maxWeek = 53;
          }
          hasTargetWeek = -targetWeek <= maxWeek;
        }

        if (hasTargetWeek) {
          // Calculate the first day of the target week
          const firstThursday = jan1.add({days: (4 - jan1.dayOfWeek + 7) % 7});
          let weekStart: Temporal.ZonedDateTime;

          if (targetWeek > 0) {
            weekStart = firstThursday.subtract({days: 3}).add({weeks: targetWeek - 1});
          } else {
            const lastWeek = jan1.dayOfWeek === 4 || dec31.dayOfWeek === 4 ? 53 : 52;
            weekStart = firstThursday.subtract({days: 3}).add({weeks: lastWeek + targetWeek});
          }

          // If we have BYDAY, find the specific day in that week
          if (this.opts.byDay?.length) {
            const dayMap: Record<string, number> = {MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7};

            const targetDays = this.opts.byDay
              .map((tok) => tok.match(/(MO|TU|WE|TH|FR|SA|SU)$/)?.[1]!)
              .filter(Boolean)
              .map((day) => dayMap[day!]!)
              .filter(Boolean);

            if (targetDays.length) {
              const candidates = targetDays.map((dayOfWeek) => {
                const delta = (dayOfWeek - weekStart.dayOfWeek + 7) % 7;
                return weekStart.add({days: delta});
              });

              const firstCandidate = candidates.sort((a, b) => Temporal.ZonedDateTime.compare(a, b))[0];
              if (firstCandidate && Temporal.ZonedDateTime.compare(firstCandidate, this.originalDtstart) >= 0) {
                zdt = firstCandidate;
                break;
              }
            }
          } else {
            // No BYDAY, use the start of the week
            if (Temporal.ZonedDateTime.compare(weekStart, this.originalDtstart) >= 0) {
              zdt = weekStart;
              break;
            }
          }
        }

        targetYear++;
      }
    }

    // If BYDAY is present, advance zdt to the first matching weekday ≥ DTSTART.
    // When the frequency is smaller than a week (e.g. HOURLY or SECONDLY),
    // iterating one unit at a time until the desired weekday can be extremely
    // slow.  We instead jump directly to the next matching weekday whenever all
    // BYDAY tokens are simple two-letter codes (e.g. "MO").
    if (this.opts.byDay?.length && !this.opts.byWeekNo) {
      const dayMap: Record<string, number> = {MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7};

      // Check if we have ordinal BYDAY tokens (e.g., "1TU", "-1TH")
      const hasOrdinalTokens = this.opts.byDay.some((tok) => /^[+-]?\d/.test(tok));

      if (hasOrdinalTokens && this.opts.byMonth && (this.opts.freq === 'MINUTELY' || this.opts.freq === 'SECONDLY')) {
        // Handle ordinal BYDAY tokens with BYMONTH for MINUTELY/SECONDLY frequency - find the first matching occurrence
        const months = [...this.opts.byMonth].sort((a, b) => a - b);
        let foundFirst = false;

        // Start from the current year and month, then check future months
        for (let year = zdt.year; year <= zdt.year + 10 && !foundFirst; year++) {
          for (const month of months) {
            // Skip past months in the current year
            if (year === zdt.year && month < zdt.month) continue;

            const monthSample = zdt.with({year, month, day: 1});
            const monthlyOccs = this.generateMonthlyOccurrences(monthSample);

            for (const occ of monthlyOccs) {
              if (Temporal.ZonedDateTime.compare(occ, zdt) >= 0) {
                if (!occ.toPlainDate().equals(zdt.toPlainDate())) {
                  zdt = this.applyTimeOverride(occ.with({hour: 0, minute: 0, second: 0}));
                } else {
                  zdt = occ;
                }
                foundFirst = true;
                break;
              }
            }
            if (foundFirst) break;
          }
        }
      } else {
        // Handle simple weekday tokens or non-BYMONTH cases
        let deltas: number[] = [];
        if (
          ['DAILY', 'HOURLY', 'MINUTELY', 'SECONDLY'].includes(this.opts.freq) &&
          this.opts.byDay.every((tok) => /^[A-Z]{2}$/.test(tok))
        ) {
          deltas = this.opts.byDay.map((tok) => (dayMap[tok]! - zdt.dayOfWeek + 7) % 7);
        } else {
          deltas = this.opts.byDay
            .map((tok) => {
              const wdTok = tok.match(/(MO|TU|WE|TH|FR|SA|SU)$/)?.[1];
              return wdTok ? (dayMap[wdTok]! - zdt.dayOfWeek + 7) % 7 : null;
            })
            .filter((d): d is number => d !== null);
        }

        if (deltas.length) {
          zdt = zdt.add({days: Math.min(...deltas)});
        }
      }
    }

    // Apply time overrides based on frequency and BYHOUR/BYMINUTE/BYSECOND
    const {byHour, byMinute, bySecond} = this.opts;

    // For HOURLY frequency without BYHOUR, start from 00:00 only if we jumped to a different date
    if (
      this.opts.freq === 'HOURLY' &&
      !byHour &&
      Temporal.ZonedDateTime.compare(
        zdt.with({hour: 0, minute: 0, second: 0, microsecond: 0, nanosecond: 0}),
        this.originalDtstart,
      ) > 0
    ) {
      zdt = zdt.with({hour: 0, minute: 0, second: 0, microsecond: 0, nanosecond: 0});
    }

    // For MINUTELY frequency without BYMINUTE, start from 00:00 only if we jumped to a different date
    if (
      this.opts.freq === 'MINUTELY' &&
      !byMinute &&
      Temporal.ZonedDateTime.compare(
        zdt.with({hour: 0, minute: 0, second: 0, microsecond: 0, nanosecond: 0}),
        this.originalDtstart,
      ) > 0
    ) {
      zdt = zdt.with({hour: 0, minute: 0, second: 0, microsecond: 0, nanosecond: 0});
    }

    // For SECONDLY frequency with BYWEEKNO without BYSECOND, start from 00:00 only if we jumped to a different date
    if (
      this.opts.freq === 'SECONDLY' &&
      this.opts.byWeekNo?.length &&
      !bySecond &&
      Temporal.ZonedDateTime.compare(
        zdt.with({hour: 0, minute: 0, second: 0, microsecond: 0, nanosecond: 0}),
        this.originalDtstart,
      ) > 0
    ) {
      zdt = zdt.with({hour: 0, minute: 0, second: 0, microsecond: 0, nanosecond: 0});
    }

    if (byHour || byMinute || bySecond) {
      const candidates = this.expandByTime(zdt);
      for (const candidate of candidates) {
        if (Temporal.ZonedDateTime.compare(candidate, this.originalDtstart) >= 0) {
          return candidate;
        }
      }

      // No candidates found on the start date that are >= dtstart.
      // Advance to the next interval and return the first possible time.
      zdt = this.applyTimeOverride(this.rawAdvance(zdt));
    }

    return zdt;
  }

  // --- NEW: constraint checks ---
  // 2) Replace your matchesByDay with this:
  private matchesByDay(zdt: Temporal.ZonedDateTime): boolean {
    const {byDay, freq} = this.opts;
    if (!byDay) return true;

    // map two‑letter to Temporal dayOfWeek (1=Mon … 7=Sun)
    const dayMap: Record<string, number> = {MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7};

    for (const token of byDay) {
      // 1) match and destructure
      const m = token.match(/^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/);
      if (!m) continue;
      const ord = m[1] ? parseInt(m[1], 10) : 0;

      // 2) pull weekday into its own variable and guard
      const weekday = m[2];
      if (!weekday) continue; // now TS knows `weekday` is string

      const wd = dayMap[weekday]; // no more "undefined index" error

      if (freq === 'DAILY') {
        if (zdt.dayOfWeek === wd) return true;
        continue;
      }

      // no ordinal → simple weekday match
      if (ord === 0) {
        if (zdt.dayOfWeek === wd) return true;
        continue;
      }

      // build all days in month with this weekday
      // const year = zdt.year;
      const month = zdt.month;
      let dt = zdt.with({day: 1});
      const candidates: number[] = [];
      while (dt.month === month) {
        if (dt.dayOfWeek === wd) candidates.push(dt.day);
        dt = dt.add({days: 1});
      }

      // pick the “ord-th” entry (supports negative ord)
      const idx = ord > 0 ? ord - 1 : candidates.length + ord;
      if (candidates[idx] === zdt.day) return true;
    }

    return false;
  }

  private matchesByMonth(zdt: Temporal.ZonedDateTime): boolean {
    const {byMonth} = this.opts;
    if (!byMonth) return true;
    return byMonth.includes(zdt.month);
  }

  private matchesNumericConstraint(value: number, constraints: number[], maxPositiveValue: number): boolean {
    return constraints.some((c) => {
      const target = c > 0 ? c : maxPositiveValue + c + 1;
      return value === target;
    });
  }

  private matchesByMonthDay(zdt: Temporal.ZonedDateTime): boolean {
    const {byMonthDay} = this.opts;
    if (!byMonthDay) return true;
    const lastDay = zdt.with({day: 1}).add({months: 1}).subtract({days: 1}).day;
    return this.matchesNumericConstraint(zdt.day, byMonthDay, lastDay);
  }

  private matchesByHour(zdt: Temporal.ZonedDateTime): boolean {
    const {byHour} = this.opts;
    if (!byHour) return true;
    if (byHour.includes(zdt.hour)) {
      return true;
    }

    // Handle DST spring-forward case. Check if any of the hours specified
    // in the rule, when applied, would result in the hour of the candidate time.
    for (const h of byHour) {
      const intendedTime = zdt.with({hour: h});
      if (intendedTime.hour === zdt.hour) {
        // This indicates that setting the hour to `h` resulted in `zdt.hour`,
        // which is the signature of a DST jump where `h` was the skipped hour.
        return true;
      }
    }

    return false;
  }

  private matchesByMinute(zdt: Temporal.ZonedDateTime): boolean {
    const {byMinute} = this.opts;
    if (!byMinute) return true;
    return byMinute.includes(zdt.minute);
  }

  private matchesBySecond(zdt: Temporal.ZonedDateTime): boolean {
    const {bySecond} = this.opts;
    if (!bySecond) return true;
    return bySecond.includes(zdt.second);
  }

  private matchesAll(zdt: Temporal.ZonedDateTime): boolean {
    return (
      this.matchesByDay(zdt) &&
      this.matchesByMonth(zdt) &&
      this.matchesByMonthDay(zdt) &&
      this.matchesByYearDay(zdt) &&
      this.matchesByWeekNo(zdt) &&
      this.matchesByHour(zdt) &&
      this.matchesByMinute(zdt) &&
      this.matchesBySecond(zdt)
    );
  }

  private matchesByYearDay(zdt: Temporal.ZonedDateTime): boolean {
    const {byYearDay} = this.opts;
    if (!byYearDay) return true;
    const dayOfYear = zdt.dayOfYear;
    const last = zdt.with({month: 12, day: 31}).dayOfYear;
    return this.matchesNumericConstraint(dayOfYear, byYearDay, last);
  }

  private getIsoWeekInfo(zdt: Temporal.ZonedDateTime): {week: number; year: number} {
    // Using ISO 8601 week date system. Week starts on Monday.
    // The week year is the year of the Thursday of that week.
    const thursday = zdt.add({days: 4 - zdt.dayOfWeek});
    const year = thursday.year;

    // The first Thursday of the year.
    const firstThursday = thursday
      .with({month: 1, day: 1})
      .add({days: (4 - thursday.with({month: 1, day: 1}).dayOfWeek + 7) % 7});

    const diffDays = thursday.toPlainDate().since(firstThursday.toPlainDate()).days;
    const week = Math.floor(diffDays / 7) + 1;
    return {week, year};
  }

  private matchesByWeekNo(zdt: Temporal.ZonedDateTime): boolean {
    const {byWeekNo} = this.opts;
    if (!byWeekNo) return true;

    const {week, year} = this.getIsoWeekInfo(zdt);

    const jan1 = zdt.with({year, month: 1, day: 1});
    const dec31 = zdt.with({year, month: 12, day: 31});
    let lastWeek = 52;
    if (jan1.dayOfWeek === 4 || dec31.dayOfWeek === 4) {
      lastWeek = 53;
    }

    return byWeekNo.some((wn) => {
      if (wn > 0) {
        return week === wn;
      } else {
        return week === lastWeek + wn + 1;
      }
    });
  }

  options() {
    return this.opts;
  }

  private addDtstartIfNeeded(
    dates: Temporal.ZonedDateTime[],
    iterator?: (date: Temporal.ZonedDateTime, i: number) => boolean,
  ): boolean {
    if (this.includeDtstart && !this.matchesAll(this.originalDtstart)) {
      if (iterator && !iterator(this.originalDtstart, dates.length)) {
        return false; // stop
      }
      dates.push(this.originalDtstart);
      if (this.shouldBreakForCountLimit(dates.length)) {
        return false; // stop
      }
    }
    return true; // continue
  }

  private processOccurrences(
    occs: Temporal.ZonedDateTime[],
    dates: Temporal.ZonedDateTime[],
    start: Temporal.ZonedDateTime,
    iterator?: (date: Temporal.ZonedDateTime, i: number) => boolean,
    extraFilters?: (occ: Temporal.ZonedDateTime) => boolean,
  ): {
    shouldBreak: boolean;
  } {
    let shouldBreak = false;
    for (const occ of occs) {
      if (Temporal.ZonedDateTime.compare(occ, start) < 0) continue;
      if (this.opts.until && Temporal.ZonedDateTime.compare(occ, this.opts.until) > 0) {
        shouldBreak = true;
        break;
      }
      if (extraFilters && !extraFilters(occ)) {
        continue;
      }
      if (iterator && !iterator(occ, dates.length)) {
        shouldBreak = true;
        break;
      }
      dates.push(occ);
      if (this.shouldBreakForCountLimit(dates.length)) {
        shouldBreak = true;
        break;
      }
    }
    return {shouldBreak};
  }

  /**
   * Returns all occurrences of the rule.
   * @param iterator - An optional callback iterator function that can be used to filter or modify the occurrences.
   * @returns An array of Temporal.ZonedDateTime objects representing all occurrences of the rule.
   */
  all(iterator?: (date: Temporal.ZonedDateTime, i: number) => boolean): Temporal.ZonedDateTime[] {
    if (!this.opts.count && !this.opts.until && !iterator) {
      throw new Error('all() requires iterator when no COUNT/UNTIL');
    }
    const dates: Temporal.ZonedDateTime[] = [];
    let iterationCount = 0;

    // --- 1) MONTHLY + BYDAY/BYMONTHDAY (multi-day expansions) ---
    if (this.opts.freq === 'MONTHLY' && (this.opts.byDay || this.opts.byMonthDay)) {
      const start = this.originalDtstart;
      if (!this.addDtstartIfNeeded(dates, iterator)) {
        return this.applyCountLimitAndMergeRDates(dates, iterator);
      }

      let monthCursor = start.with({day: 1});

      while (true) {
        if (++iterationCount > this.maxIterations) {
          throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
        }

        let occs = this.generateMonthlyOccurrences(monthCursor);
        occs = this.applyBySetPos(occs);
        // Skip this month entirely if **any** occurrence precedes DTSTART AND
        // DTSTART matches the rule (i.e., DTSTART is in the occurrences list).
        if (
          monthCursor.month === start.month &&
          occs.some((o) => Temporal.ZonedDateTime.compare(o, start) < 0) &&
          occs.some((o) => Temporal.ZonedDateTime.compare(o, start) === 0)
        ) {
          monthCursor = monthCursor.add({months: this.opts.interval!});
          continue;
        }

        const {shouldBreak} = this.processOccurrences(occs, dates, start, iterator);
        if (shouldBreak) {
          break;
        }
        monthCursor = monthCursor.add({months: this.opts.interval!});
      }

      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }

    // --- 2) WEEKLY + BYDAY (or default to DTSTART’s weekday) ---
    if (this.opts.freq === 'WEEKLY' && !(this.opts.byYearDay && this.opts.byYearDay.length > 0)) {
      const start = this.originalDtstart;
      if (!this.addDtstartIfNeeded(dates, iterator)) {
        return this.applyCountLimitAndMergeRDates(dates, iterator);
      }

      // Build the list of target weekdays (1=Mon..7=Sun)
      const dayMap: Record<string, number> = {MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7};
      // If no BYDAY, default to DTSTART’s weekday token
      const tokens = this.opts.byDay
        ? [...this.opts.byDay]
        : this.opts.byMonthDay && this.opts.byMonthDay.length > 0
          ? Object.keys(dayMap)
          : [Object.entries(dayMap).find(([, d]) => d === start.dayOfWeek)![0]];
      const dows = tokens
        .map((tok) => dayMap[tok.slice(-2) as keyof typeof dayMap])
        .filter((d): d is number => d !== undefined)
        .sort((a, b) => a - b);

      // Find the very first weekCursor: the earliest of this week’s matching days ≥ start
      const firstWeekDates = dows.map((dw) => {
        const delta = (dw - start.dayOfWeek + 7) % 7;
        return start.add({days: delta});
      });
      let firstOccurrence = firstWeekDates.reduce((a, b) => (Temporal.ZonedDateTime.compare(a, b) <= 0 ? a : b));

      // Get the week start day (default to Monday if not specified)
      const wkstDay = dayMap[this.opts.wkst || 'MO'] ?? 1;

      // Align weekCursor to the week start that contains the first occurrence
      const firstOccWeekOffset = (firstOccurrence.dayOfWeek - wkstDay + 7) % 7;
      let weekCursor = firstOccurrence.subtract({days: firstOccWeekOffset});

      while (true) {
        // Generate this week’s occurrences
        if (++iterationCount > this.maxIterations) {
          throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
        }

        let occs = dows
          .flatMap((dw) => {
            const delta = (dw - wkstDay + 7) % 7;
            const sameDate = weekCursor.add({days: delta});
            return this.expandByTime(sameDate);
          })
          .sort((a, b) => Temporal.ZonedDateTime.compare(a, b));

        occs = this.applyBySetPos(occs);

        const {shouldBreak} = this.processOccurrences(
          occs,
          dates,
          start,
          iterator,
          (occ) => this.matchesByMonth(occ) && this.matchesByMonthDay(occ),
        );

        if (shouldBreak) {
          break;
        }

        weekCursor = weekCursor.add({weeks: this.opts.interval!});
      }

      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }

    // --- 3) MONTHLY + BYMONTH (without BYDAY/BYMONTHDAY) ---
    if (
      this.opts.freq === 'MONTHLY' &&
      this.opts.byMonth &&
      !this.opts.byDay &&
      !this.opts.byMonthDay &&
      !this.opts.byYearDay
    ) {
      const start = this.originalDtstart;
      if (!this.addDtstartIfNeeded(dates, iterator)) {
        return this.applyCountLimitAndMergeRDates(dates, iterator);
      }

      const months = [...this.opts.byMonth].sort((a, b) => a - b);
      let monthOffset = 0;

      // Find the first month >= dtstart.month
      let startMonthIndex = months.findIndex((m) => m >= start.month);
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
          month: targetMonth,
        });

        if (this.opts.until && Temporal.ZonedDateTime.compare(candidate, this.opts.until) > 0) {
          break;
        }

        if (Temporal.ZonedDateTime.compare(candidate, start) >= 0) {
          if (iterator && !iterator(candidate, dates.length)) {
            break;
          }
          dates.push(candidate);
          if (this.shouldBreakForCountLimit(dates.length)) {
            break;
          }
        }

        monthOffset++;
      }

      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }

    // --- 4) YEARLY + BYMONTH (all specified months per year) ---
    if (
      this.opts.freq === 'YEARLY' &&
      this.opts.byMonth &&
      !this.opts.byDay &&
      !this.opts.byMonthDay &&
      !this.opts.byYearDay &&
      !this.opts.byWeekNo
    ) {
      const start = this.originalDtstart;
      if (!this.addDtstartIfNeeded(dates, iterator)) {
        return this.applyCountLimitAndMergeRDates(dates, iterator);
      }
      const months = [...this.opts.byMonth].sort((a, b) => a - b);
      let yearOffset = 0;

      while (true) {
        if (++iterationCount > this.maxIterations) {
          throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
        }

        const year = start.year + yearOffset * this.opts.interval!;

        for (const month of months) {
          let occ = start.with({year, month});
          occ = this.applyTimeOverride(occ);

          if (Temporal.ZonedDateTime.compare(occ, start) < 0) {
            continue;
          }
          if (this.opts.until && Temporal.ZonedDateTime.compare(occ, this.opts.until) > 0) {
            return dates;
          }
          if (iterator && !iterator(occ, dates.length)) {
            return dates;
          }

          dates.push(occ);
          if (this.shouldBreakForCountLimit(dates.length)) {
            return this.applyCountLimitAndMergeRDates(dates, iterator);
          }
        }
        yearOffset++;
      }

      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }

    // --- 5) YEARLY + BY... rules (also handles WEEKLY + BYYEARDAY) ---
    if (
      (this.opts.freq === 'YEARLY' &&
        (this.opts.byDay || this.opts.byMonthDay || this.opts.byYearDay || this.opts.byWeekNo)) ||
      (this.opts.freq === 'WEEKLY' && this.opts.byYearDay && this.opts.byYearDay.length > 0)
    ) {
      const start = this.originalDtstart;
      if (!this.addDtstartIfNeeded(dates, iterator)) {
        return this.applyCountLimitAndMergeRDates(dates, iterator);
      }

      let yearCursor = start.with({month: 1, day: 1});

      while (true) {
        if (++iterationCount > this.maxIterations) {
          throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
        }

        const occs = this.generateYearlyOccurrences(yearCursor);
        const {shouldBreak} = this.processOccurrences(occs, dates, start, iterator);

        if (shouldBreak) {
          break;
        }

        const interval = this.opts.freq === 'WEEKLY' ? 1 : this.opts.interval!;
        yearCursor = yearCursor.add({years: interval});

        if (this.opts.freq === 'WEEKLY' && this.opts.until && yearCursor.year > this.opts.until.year) {
          break;
        }
      }

      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }

    // --- 6a) MINUTELY/SECONDLY with limiting BYXXX constraints (special case) ---
    if (
      (this.opts.freq === 'MINUTELY' || this.opts.freq === 'SECONDLY') &&
      (this.opts.byMonth || this.opts.byWeekNo || this.opts.byYearDay || this.opts.byMonthDay || this.opts.byDay)
    ) {
      if (!this.addDtstartIfNeeded(dates, iterator)) {
        return this.applyCountLimitAndMergeRDates(dates, iterator);
      }
      let current = this.computeFirst();

      while (true) {
        if (++iterationCount > this.maxIterations) {
          throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
        }

        if (this.opts.until && Temporal.ZonedDateTime.compare(current, this.opts.until) > 0) {
          break;
        }

        // Check if current date matches all constraints
        if (this.matchesAll(current)) {
          if (iterator && !iterator(current, dates.length)) {
            break;
          }
          dates.push(current);
          if (this.shouldBreakForCountLimit(dates.length)) {
            break;
          }
          current = this.nextCandidateSameDate(current);
        } else {
          // Current date doesn't match constraints, find next candidate efficiently
          current = this.findNextValidDate(current);
        }
      }

      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }

    // --- 6c) MONTHLY + BYYEARDAY (special case) ---
    if (
      this.opts.freq === 'MONTHLY' &&
      this.opts.byYearDay &&
      this.opts.byYearDay.length > 0 &&
      !this.opts.byDay &&
      !this.opts.byMonthDay
    ) {
      const start = this.originalDtstart;
      if (!this.addDtstartIfNeeded(dates, iterator)) {
        return this.applyCountLimitAndMergeRDates(dates, iterator);
      }

      let year = start.year;
      const yearDays = [...this.opts.byYearDay].sort((a, b) => a - b);
      const interval = this.opts.interval!;
      const startMonthAbs = start.year * 12 + start.month;

      outer_loop: while (true) {
        if (this.shouldBreakForCountLimit(dates.length)) {
          break;
        }
        if (++iterationCount > this.maxIterations) {
          throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
        }

        const yearStart = start.with({year, month: 1, day: 1});
        const lastDayOfYear = yearStart.with({month: 12, day: 31}).dayOfYear;

        for (const yd of yearDays) {
          const dayNum = yd > 0 ? yd : lastDayOfYear + yd + 1;
          if (dayNum <= 0 || dayNum > lastDayOfYear) continue;

          const baseOcc = yearStart.add({days: dayNum - 1});

          for (const occ of this.expandByTime(baseOcc)) {
            if (Temporal.ZonedDateTime.compare(occ, start) < 0) continue;
            if (dates.some((d) => Temporal.ZonedDateTime.compare(d, occ) === 0)) continue;

            const occMonthAbs = occ.year * 12 + occ.month;
            if ((occMonthAbs - startMonthAbs) % interval !== 0) {
              continue;
            }

            if (!this.matchesByMonth(occ)) {
              continue;
            }

            if (this.opts.until && Temporal.ZonedDateTime.compare(occ, this.opts.until) > 0) {
              break outer_loop;
            }

            if (iterator && !iterator(occ, dates.length)) {
              break outer_loop;
            }

            dates.push(occ);

            if (this.shouldBreakForCountLimit(dates.length)) {
              break outer_loop;
            }
          }
        }

        year++;
        if (this.opts.until && year > this.opts.until.year + 2) {
          break;
        }
        if (!this.opts.until && this.opts.count) {
          const yearsToScan = Math.ceil(this.opts.count / (this.opts.byYearDay.length || 1)) * interval + 5;
          if (year > start.year + yearsToScan) {
            break;
          }
        }
      }
      return this.applyCountLimitAndMergeRDates(dates, iterator);
    }

    // --- 7) fallback: step + filter ---
    // Handle MINUTELY/HOURLY/DAILY frequency with BYSETPOS
    if (
      (this.opts.freq === 'MINUTELY' || this.opts.freq === 'HOURLY' || this.opts.freq === 'DAILY') &&
      this.opts.bySetPos
    ) {
      const start = this.originalDtstart;
      if (!this.addDtstartIfNeeded(dates, iterator)) {
        return this.applyCountLimitAndMergeRDates(dates, iterator);
      }

      let cursor;
      let duration;

      switch (this.opts.freq) {
        case 'MINUTELY':
          cursor = start.with({second: 0, microsecond: 0, nanosecond: 0});
          duration = {minutes: this.opts.interval!};
          break;
        case 'HOURLY':
          cursor = start.with({minute: 0, second: 0, microsecond: 0, nanosecond: 0});
          duration = {hours: this.opts.interval!};
          break;
        case 'DAILY':
          cursor = start.with({hour: 0, minute: 0, second: 0, microsecond: 0, nanosecond: 0});
          duration = {days: this.opts.interval!};
          break;
        default:
          // Should not be reached
          return this.applyCountLimitAndMergeRDates(dates, iterator);
      }

      while (true) {
        if (++iterationCount > this.maxIterations) {
          throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
        }

        // Generate all occurrences for this period
        let periodOccs = this.expandByTime(cursor);
        periodOccs = periodOccs.filter((occ) => this.matchesAll(occ));
        periodOccs = this.applyBySetPos(periodOccs);

        const {shouldBreak} = this.processOccurrences(periodOccs, dates, start, iterator);
        if (shouldBreak) {
          break;
        }

        cursor = cursor.add(duration);
        if (this.opts.until && Temporal.ZonedDateTime.compare(cursor, this.opts.until) > 0) {
          break;
        }
      }
    } else {
      let current = this.computeFirst();

      // Include dtstart even if it doesn't match the rule when includeDtstart is true
      if (this.includeDtstart && Temporal.ZonedDateTime.compare(current, this.originalDtstart) > 0) {
        // dtstart doesn't match the rule, but we should include it in non-strict mode
        if (iterator && !iterator(this.originalDtstart, dates.length)) {
          return this.applyCountLimitAndMergeRDates(dates, iterator);
        }
        dates.push(this.originalDtstart);
        if (this.shouldBreakForCountLimit(dates.length)) {
          return this.applyCountLimitAndMergeRDates(dates, iterator);
        }
      }

      while (true) {
        if (++iterationCount > this.maxIterations) {
          throw new Error(`Maximum iterations (${this.maxIterations}) exceeded in all()`);
        }

        if (this.opts.until && Temporal.ZonedDateTime.compare(current, this.opts.until) > 0) {
          break;
        }
        if (this.matchesAll(current)) {
          if (iterator && !iterator(current, dates.length)) {
            break;
          }
          dates.push(current);
          if (this.shouldBreakForCountLimit(dates.length)) {
            break;
          }
        }
        current = this.nextCandidateSameDate(current);
      }
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
      if (dedup.length === 0 || Temporal.ZonedDateTime.compare(d, dedup[dedup.length - 1]!) !== 0) {
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

    return dates.filter((date) => {
      return !this.opts.exDate!.some((exDate) => Temporal.ZonedDateTime.compare(date, exDate) === 0);
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
    iterator?: (date: Temporal.ZonedDateTime, count: number) => boolean,
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
    inc = false,
  ): Temporal.ZonedDateTime[] {
    const startInst = after instanceof Date ? Temporal.Instant.from(after.toISOString()) : after.toInstant();
    const endInst = before instanceof Date ? Temporal.Instant.from(before.toISOString()) : before.toInstant();

    const beforeZdt = Temporal.Instant.from(endInst).toZonedDateTimeISO(this.tzid);

    const tempOpts = {...this.opts};

    if (!tempOpts.until || Temporal.ZonedDateTime.compare(beforeZdt, tempOpts.until) < 0) {
      tempOpts.until = beforeZdt;
    }

    // We don't want to be limited by count
    delete tempOpts.count;

    const tempRule = new RRuleTemporal(tempOpts);
    const allDates = tempRule.all();

    return allDates.filter((date) => {
      const inst = date.toInstant();
      const afterStart = inc
        ? Temporal.Instant.compare(inst, startInst) >= 0
        : Temporal.Instant.compare(inst, startInst) > 0;

      const beforeEnd = inc
        ? Temporal.Instant.compare(inst, endInst) <= 0
        : Temporal.Instant.compare(inst, endInst) < 0;

      return afterStart && beforeEnd;
    });
  }

  /**
   * Returns the next occurrence of the rule after a specified date.
   * @param after - The start date or Temporal.ZonedDateTime object.
   * @param inc - Optional boolean flag to include occurrences on the start date.
   * @returns The next occurrence of the rule after the specified date or null if no occurrences are found.
   */
  next(after: Date | Temporal.ZonedDateTime = new Date(), inc = false): Temporal.ZonedDateTime | null {
    const afterInst = after instanceof Date ? Temporal.Instant.from(after.toISOString()) : after.toInstant();

    let result: Temporal.ZonedDateTime | null = null;
    this.all((occ) => {
      const inst = occ.toInstant();
      const ok = inc ? Temporal.Instant.compare(inst, afterInst) >= 0 : Temporal.Instant.compare(inst, afterInst) > 0;
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
  previous(before: Date | Temporal.ZonedDateTime = new Date(), inc = false): Temporal.ZonedDateTime | null {
    const beforeInst = before instanceof Date ? Temporal.Instant.from(before.toISOString()) : before.toInstant();

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
    const iso = this.originalDtstart.toString({smallestUnit: 'second'}).replace(/[-:]/g, '');
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
      exDate,
    } = this.opts;

    rule.push(`FREQ=${freq}`);
    if (interval !== 1) rule.push(`INTERVAL=${interval}`);
    if (count !== undefined) rule.push(`COUNT=${count}`);
    if (until) {
      rule.push(`UNTIL=${this.formatIcsDateTime(until)}`);
    }
    if (byHour) rule.push(`BYHOUR=${byHour.join(',')}`);
    if (byMinute) rule.push(`BYMINUTE=${byMinute.join(',')}`);
    if (bySecond) rule.push(`BYSECOND=${bySecond.join(',')}`);
    if (byDay) rule.push(`BYDAY=${byDay.join(',')}`);
    if (byMonth) rule.push(`BYMONTH=${byMonth.join(',')}`);
    if (byMonthDay) rule.push(`BYMONTHDAY=${byMonthDay.join(',')}`);
    if (bySetPos) rule.push(`BYSETPOS=${bySetPos.join(',')}`);
    if (byWeekNo) rule.push(`BYWEEKNO=${byWeekNo.join(',')}`);
    if (byYearDay) rule.push(`BYYEARDAY=${byYearDay.join(',')}`);
    if (wkst) rule.push(`WKST=${wkst}`);

    const lines = [dtLine, `RRULE:${rule.join(';')}`];
    if (rDate) {
      lines.push(`RDATE:${this.joinDates(rDate)}`);
    }
    if (exDate) {
      lines.push(`EXDATE:${this.joinDates(exDate)}`);
    }
    return lines.join('\n');
  }

  private formatIcsDateTime(date: Temporal.ZonedDateTime): string {
    return date.toInstant().toString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  }

  private joinDates(dates: Temporal.ZonedDateTime[]) {
    return dates.map((d) => this.formatIcsDateTime(d));
  }

  /**
   * Given any date in a month, return all the ZonedDateTimes in that month
   * matching your opts.byDay and opts.byMonth (or the single "same day" if no BYDAY).
   */
  private generateMonthlyOccurrences(sample: Temporal.ZonedDateTime): Temporal.ZonedDateTime[] {
    const {byDay, byMonth, byMonthDay} = this.opts;

    // 1) Skip whole month if BYMONTH says so
    if (byMonth && !byMonth.includes(sample.month)) return [];

    const lastDay = sample.with({day: 1}).add({months: 1}).subtract({days: 1}).day;

    // days matched by BYMONTHDAY tokens
    let byMonthDayHits: number[] = [];
    if (byMonthDay && byMonthDay.length > 0) {
      byMonthDayHits = byMonthDay.map((d) => (d > 0 ? d : lastDay + d + 1)).filter((d) => d >= 1 && d <= lastDay);
    }

    if (!byDay && byMonthDay && byMonthDay.length > 0) {
      if (byMonthDayHits.length === 0) {
        // No valid days found for this month, return empty array
        return [];
      }
      const dates = byMonthDayHits.map((d) => sample.with({day: d}));
      return dates.flatMap((z) => this.expandByTime(z)).sort((a, b) => Temporal.ZonedDateTime.compare(a, b));
    }

    if (!byDay) {
      return this.expandByTime(sample);
    }

    const dayMap: Record<string, number> = {MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7};

    type Token = {ord: number; wd: number};
    const tokens: Token[] = byDay
      .map((tok) => {
        const m = tok.match(/^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/);
        if (!m) return null;
        return {ord: m[1] ? parseInt(m[1], 10) : 0, wd: dayMap[m[2]!]};
      })
      .filter((x): x is Token => x !== null);

    // Bucket every weekday in this month
    const buckets: Record<number, number[]> = {};
    let cursor = sample.with({day: 1});
    while (cursor.month === sample.month) {
      const dow = cursor.dayOfWeek;
      (buckets[dow] ||= []).push(cursor.day);
      cursor = cursor.add({days: 1});
    }

    // Resolve tokens → concrete days from BYDAY
    const byDayHits: number[] = [];
    for (const {ord, wd} of tokens) {
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

    const hits = finalDays.map((d) => sample.with({day: d}));
    return hits.flatMap((z) => this.expandByTime(z)).sort((a, b) => Temporal.ZonedDateTime.compare(a, b));
  }

  /**
   * Given any date in a year, return all ZonedDateTimes in that year matching
   * the BYDAY/BYMONTHDAY/BYMONTH constraints. Months default to DTSTART's month
   * if BYMONTH is not specified.
   */
  private generateYearlyOccurrences(sample: Temporal.ZonedDateTime): Temporal.ZonedDateTime[] {
    const months = this.opts.byMonth
      ? [...this.opts.byMonth].sort((a, b) => a - b)
      : this.opts.byMonthDay
        ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
        : [this.originalDtstart.month];

    let occs: Temporal.ZonedDateTime[] = [];

    const hasOrdinalByDay = this.opts.byDay && this.opts.byDay.some((t) => /^[+-]?\d/.test(t));
    if (hasOrdinalByDay && !this.opts.byMonth) {
      // nth weekday of year
      const dayMap: Record<string, number> = {MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7};
      for (const tok of this.opts.byDay!) {
        const m = tok.match(/^([+-]?\d{1,2})(MO|TU|WE|TH|FR|SA|SU)$/);
        if (!m) continue;
        const ord = parseInt(m[1]!, 10);
        const wd = dayMap[m[2] as keyof typeof dayMap]!;
        let dt: Temporal.ZonedDateTime;
        if (ord > 0) {
          const jan1 = sample.with({month: 1, day: 1});
          const delta = (wd - jan1.dayOfWeek + 7) % 7;
          dt = jan1.add({days: delta + 7 * (ord - 1)});
        } else {
          const dec31 = sample.with({month: 12, day: 31});
          const delta = (dec31.dayOfWeek - wd + 7) % 7;
          dt = dec31.subtract({days: delta + 7 * (-ord - 1)});
        }
        // byMonth is already checked to be falsy in the outer condition
        occs.push(...this.expandByTime(dt));
      }
    } else if (!this.opts.byYearDay && !this.opts.byWeekNo) {
      occs = months.flatMap((m) => {
        const monthSample = sample.with({month: m, day: 1});
        return this.generateMonthlyOccurrences(monthSample);
      });
    }

    if (this.opts.byYearDay) {
      const last = sample.with({month: 12, day: 31}).dayOfYear;
      for (const d of this.opts.byYearDay) {
        const dayNum = d > 0 ? d : last + d + 1;
        const dt =
          this.opts.freq === 'MINUTELY'
            ? sample.with({month: 1, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0}).add({days: dayNum - 1})
            : sample.with({month: 1, day: 1}).add({days: dayNum - 1});
        if (!this.opts.byMonth || this.opts.byMonth!.includes(dt.month)) {
          occs.push(...this.expandByTime(dt));
        }
      }
    }

    if (this.opts.byWeekNo) {
      const dayMap: Record<string, number> = {MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7};
      const wkst = dayMap[(this.opts.wkst || 'MO') as keyof typeof dayMap]!;
      const jan1 = sample.with({month: 1, day: 1});
      const delta = (jan1.dayOfWeek - wkst + 7) % 7;
      const firstWeekStart = jan1.subtract({days: delta});
      const lastWeekDiff = sample.with({month: 12, day: 31}).toPlainDate().since(firstWeekStart.toPlainDate()).days;
      const lastWeek = Math.floor(lastWeekDiff / 7) + 1;

      const tokens = this.opts.byDay?.length
        ? this.opts.byDay.map((tok) => tok.match(/(MO|TU|WE|TH|FR|SA|SU)$/)?.[1])
        : [this.opts.wkst || 'MO'];

      for (const weekNo of this.opts.byWeekNo) {
        const weekIndex = weekNo > 0 ? weekNo - 1 : lastWeek + weekNo;
        const weekStart = firstWeekStart.add({weeks: weekIndex});
        for (const tok of tokens) {
          if (!tok) continue;
          const targetDow = dayMap[tok as keyof typeof dayMap]!;
          const inst = weekStart.add({days: (targetDow - wkst + 7) % 7});
          if (!this.opts.byMonth || this.opts.byMonth!.includes(inst.month)) {
            occs.push(...this.expandByTime(inst));
          }
        }
      }
    }

    occs = occs.sort((a, b) => Temporal.ZonedDateTime.compare(a, b));
    occs = this.applyBySetPos(occs);
    return occs;
  }

  /**
   * Helper to find the next valid value from a sorted array
   */
  private findNextValidValue<T>(currentValue: T, validValues: T[], compare: (a: T, b: T) => number): T | null {
    return validValues.find((v) => compare(v, currentValue) > 0) || null;
  }

  /**
   * Efficiently find the next valid date for MINUTELY and SECONDLY frequency by jumping over
   * large gaps when BYXXX constraints don't match.
   */
  private findNextValidDate(current: Temporal.ZonedDateTime): Temporal.ZonedDateTime {
    // Try to jump efficiently based on which constraints are failing

    // Check BYMONTH first (largest potential jump)
    if (this.opts.byMonth && !this.opts.byMonth.includes(current.month)) {
      const months = [...this.opts.byMonth].sort((a, b) => a - b);
      const nextMonth = this.findNextValidValue(current.month, months, (a, b) => a - b);
      if (nextMonth) {
        current = current.with({month: nextMonth, day: 1, hour: 0, minute: 0, second: 0});
      } else {
        // Move to next year and use first valid month
        current = current.add({years: 1}).with({month: months[0], day: 1, hour: 0, minute: 0, second: 0});
      }
      current = this.applyTimeOverride(current);
      return current;
    }

    // Check BYYEARDAY (can jump across months)
    if (this.opts.byYearDay && !this.matchesByYearDay(current)) {
      const yearDays = [...this.opts.byYearDay].sort((a, b) => a - b);
      const currentYearDay = current.dayOfYear;
      const lastDayOfYear = current.with({month: 12, day: 31}).dayOfYear;

      let nextYearDay = yearDays.find((d) => {
        const dayNum = d > 0 ? d : lastDayOfYear + d + 1;
        return dayNum > currentYearDay;
      });

      if (nextYearDay) {
        const dayNum = nextYearDay > 0 ? nextYearDay : lastDayOfYear + nextYearDay + 1;
        if (this.opts.freq === 'MINUTELY' || this.opts.freq === 'SECONDLY') {
          current = current
            .with({month: 1, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0})
            .add({days: dayNum - 1});
        } else {
          current = current.with({month: 1, day: 1}).add({days: dayNum - 1});
        }
      } else {
        // Move to next year and use first valid yearday
        const nextYear = current.add({years: 1});
        const nextYearLastDay = nextYear.with({month: 12, day: 31}).dayOfYear;
        const firstYearDay = yearDays[0];
        if (firstYearDay !== undefined) {
          const dayNum = firstYearDay > 0 ? firstYearDay : nextYearLastDay + firstYearDay + 1;
          if (this.opts.freq === 'MINUTELY' || this.opts.freq === 'SECONDLY') {
            current = nextYear
              .with({month: 1, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0})
              .add({days: dayNum - 1});
          } else {
            current = nextYear.with({month: 1, day: 1}).add({days: dayNum - 1});
          }
        }
      }
      current = this.applyTimeOverride(current);
      return current;
    }

    // Check BYWEEKNO (can jump across weeks/months)
    if (this.opts.byWeekNo && !this.matchesByWeekNo(current)) {
      // This is complex, so for now just advance by a week
      current = current.add({weeks: 1}).with({hour: 0, minute: 0, second: 0});
      current = this.applyTimeOverride(current);
      return current;
    }

    // Check BYMONTHDAY (can jump within month)
    if (this.opts.byMonthDay && !this.matchesByMonthDay(current)) {
      const monthDays = [...this.opts.byMonthDay].sort((a, b) => a - b);
      const lastDayOfMonth = current.with({day: 1}).add({months: 1}).subtract({days: 1}).day;
      const currentDay = current.day;

      // Convert negative monthdays to positive and find valid candidates
      const validDays = monthDays
        .map((d) => (d > 0 ? d : lastDayOfMonth + d + 1))
        .filter((d) => d > 0 && d <= lastDayOfMonth)
        .sort((a, b) => a - b);

      const nextDay = this.findNextValidValue(currentDay, validDays, (a, b) => a - b);

      if (nextDay) {
        current = current.with({day: nextDay, hour: 0, minute: 0, second: 0});
      } else {
        // Move to next month and use first valid day
        const nextMonth = current.add({months: 1}).with({day: 1});
        const nextMonthLastDay = nextMonth.add({months: 1}).subtract({days: 1}).day;
        const firstMonthDay = monthDays[0];
        if (firstMonthDay !== undefined) {
          const dayNum = firstMonthDay > 0 ? firstMonthDay : nextMonthLastDay + firstMonthDay + 1;
          current = nextMonth.with({
            day: Math.max(1, Math.min(dayNum, nextMonthLastDay)),
            hour: 0,
            minute: 0,
            second: 0,
          });
        }
      }
      current = this.applyTimeOverride(current);
      return current;
    }

    // Check BYDAY (can jump within week)
    if (this.opts.byDay && !this.matchesByDay(current)) {
      // For simple weekday constraints, jump to next matching day
      const dayMap: Record<string, number> = {MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7};
      const currentDow = current.dayOfWeek;

      let nextDow = 8; // Invalid day to start with
      for (const token of this.opts.byDay) {
        const match = token.match(/^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/);
        if (match && !match[1]) {
          // Simple weekday without ordinal
          const dow = dayMap[match[2] as keyof typeof dayMap];
          if (dow && dow > currentDow) {
            nextDow = Math.min(nextDow, dow);
          }
        }
      }

      if (nextDow <= 7) {
        current = current.add({days: nextDow - currentDow}).with({hour: 0, minute: 0, second: 0});
      } else {
        // Jump to next week and try first matching day
        current = current.add({days: 7 - currentDow + 1}).with({hour: 0, minute: 0, second: 0});
      }
      current = this.applyTimeOverride(current);
      return current;
    }

    // If no specific constraint detected, just advance by the frequency
    return this.nextCandidateSameDate(current);
  }

  private applyBySetPos(list: Temporal.ZonedDateTime[]): Temporal.ZonedDateTime[] {
    const {bySetPos} = this.opts;
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
}

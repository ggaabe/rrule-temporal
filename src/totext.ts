import { Temporal } from "@js-temporal/polyfill";
import { RRuleTemporal } from "./index";

interface LocaleData {
  weekdayNames: string[];
  monthNames: string[];
}

const en: LocaleData = {
  weekdayNames: [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ],
  monthNames: [
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
  ],
};

const ALL_LOCALES: Record<string, LocaleData> = { en };
const env = process.env.TOTEXT_LANGS;
const active = env ? env.split(',').map(s => s.trim()).filter(Boolean) : Object.keys(ALL_LOCALES);
const LOCALES: Record<string, LocaleData> = {};
for (const l of active) {
  if (ALL_LOCALES[l]) LOCALES[l] = ALL_LOCALES[l];
}

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
  return mapped.slice(0, -1).join(", ") + ` ${final} ` + mapped[mapped.length - 1];
}

function formatByDayToken(tok: string | number, locale: LocaleData): string {
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
  const name = locale.weekdayNames[idx!];
  if (ord === 0) return name!;
  if (ord === -1) return `last ${name}`;
  return `${ordinal(ord)} ${name}`;
}

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

export function toText(
  input: RRuleTemporal | string,
  locale?: string
): string {
  const rule = typeof input === "string" ? new RRuleTemporal({ rruleString: input }) : input;
  const opts = rule.options();
  const lang = (locale ?? Intl.DateTimeFormat().resolvedOptions().locale).split("-")[0];
  const data = LOCALES[lang] || en;
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
  } = opts;

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

  const daysNormalized = byDay?.map((d) => d.toUpperCase());
  const isWeekdays =
    daysNormalized &&
    daysNormalized.length === 5 &&
    ["MO", "TU", "WE", "TH", "FR"].every((d) => daysNormalized.includes(d));
  const isEveryday =
    daysNormalized &&
    daysNormalized.length === 7 &&
    ["MO", "TU", "WE", "TH", "FR", "SA", "SU"].every((d) => daysNormalized.includes(d));

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
    parts.push("on", list(byDay, (t) => formatByDayToken(t, data)));
  } else if (byDay && freq !== "WEEKLY") {
    parts.push("on", list(byDay, (t) => formatByDayToken(t, data)));
  }

  if (byMonth) {
    parts.push("in", list(byMonth, (m) => data.monthNames[(m as number) - 1]!));
  }

  if (byMonthDay) {
    parts.push("on the", list(byMonthDay, (d) => ordinal(d as number)), "day of the month");
  }

  if (byHour) {
    const minutes = byMinute ?? [0];
    const times = byHour.flatMap((h) => minutes.map((m) => formatTime(h, m)));
    parts.push("at", list(times));
    parts.push(tzAbbreviation(opts.dtstart));
  }

  if (until) {
    const monthName = data.monthNames[until.month - 1]!;
    parts.push("until", `${monthName} ${until.day}, ${until.year}`);
  } else if (count !== undefined) {
    parts.push("for", count.toString(), count === 1 ? "time" : "times");
  }

  return parts.join(" ");
}

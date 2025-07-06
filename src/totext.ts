import { Temporal } from "@js-temporal/polyfill";
import { RRuleTemporal } from "./index";

interface LocaleData {
  weekdayNames: string[];
  monthNames: string[];
  /** Word used when joining list elements */
  and: string;
  /** Word used for "last" ordinal */
  last: string;
  /** Translate basic tokens */
  tokens: Record<string, string>;
  /** Ordinal number formatter */
  ordinal: (n: number) => string;
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
  and: "and",
  last: "last",
  tokens: {
    every: "every",
    weekday: "weekday",
    day: "day",
    days: "days",
    year: "year",
    years: "years",
    month: "month",
    months: "months",
    week: "week",
    weeks: "weeks",
    hour: "hour",
    hours: "hours",
    minute: "minute",
    minutes: "minutes",
    second: "second",
    seconds: "seconds",
    on: "on",
    in: "in",
    "on the": "on the",
    "day of the month": "day of the month",
    "day of the year": "day of the year",
    "in week": "in week",
    at: "at",
    "at minute": "at minute",
    "at second": "at second",
    until: "until",
    for: "for",
    time: "time",
    times: "times",
    instance: "instance",
    "week starts on": "week starts on",
    with: "with",
    "additional date": "additional date",
    "additional dates": "additional dates",
    excluding: "excluding",
    date: "date",
    dates: "dates",
  },
  ordinal: ordinalEn,
};

const es: LocaleData = {
  weekdayNames: [
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado",
    "domingo",
  ],
  monthNames: [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ],
  and: "y",
  last: "último",
  tokens: {
    every: "cada",
    weekday: "día de semana",
    day: "día",
    days: "días",
    year: "año",
    years: "años",
    month: "mes",
    months: "meses",
    week: "semana",
    weeks: "semanas",
    hour: "hora",
    hours: "horas",
    minute: "minuto",
    minutes: "minutos",
    second: "segundo",
    seconds: "segundos",
    on: "el",
    in: "en",
    "on the": "el",
    "day of the month": "día del mes",
    "day of the year": "día del año",
    "in week": "en la semana",
    at: "a las",
    "at minute": "en el minuto",
    "at second": "en el segundo",
    until: "hasta",
    for: "por",
    time: "vez",
    times: "veces",
    instance: "ocasión",
    "week starts on": "la semana comienza el",
    with: "con",
    "additional date": "fecha adicional",
    "additional dates": "fechas adicionales",
    excluding: "excluyendo",
    date: "fecha",
    dates: "fechas",
  },
  ordinal: (n: number) => (n < 0 ? "último" : `${Math.abs(n)}º`),
};

const hi: LocaleData = {
  weekdayNames: [
    "सोमवार",
    "मंगलवार",
    "बुधवार",
    "गुरुवार",
    "शुक्रवार",
    "शनिवार",
    "रविवार",
  ],
  monthNames: [
    "जनवरी",
    "फरवरी",
    "मार्च",
    "अप्रैल",
    "मई",
    "जून",
    "जुलाई",
    "अगस्त",
    "सितंबर",
    "अक्टूबर",
    "नवंबर",
    "दिसंबर",
  ],
  and: "और",
  last: "अंतिम",
  tokens: {
    every: "हर",
    weekday: "सप्ताह के दिन",
    day: "दिन",
    days: "दिन",
    year: "साल",
    years: "साल",
    month: "माह",
    months: "माह",
    week: "सप्ताह",
    weeks: "सप्ताह",
    hour: "घंटा",
    hours: "घंटे",
    minute: "मिनट",
    minutes: "मिनट",
    second: "सेकंड",
    seconds: "सेकंड",
    on: "को",
    in: "में",
    "on the": "को",
    "day of the month": "महीने का दिन",
    "day of the year": "साल का दिन",
    "in week": "सप्ताह में",
    at: "पर",
    "at minute": "मिनट पर",
    "at second": "सेकंड पर",
    until: "तक",
    for: "के लिए",
    time: "बार",
    times: "बार",
    instance: "घटना",
    "week starts on": "सप्ताह प्रारंभ होता है",
    with: "साथ",
    "additional date": "अतिरिक्त दिनांक",
    "additional dates": "अतिरिक्त दिनांकें",
    excluding: "को छोड़कर",
    date: "दिनांक",
    dates: "दिनांकें",
  },
  ordinal: (n: number) => (n < 0 ? "अंतिम" : `${Math.abs(n)}वां`),
};

const yue: LocaleData = {
  weekdayNames: [
    "星期一",
    "星期二",
    "星期三",
    "星期四",
    "星期五",
    "星期六",
    "星期日",
  ],
  monthNames: [
    "一月",
    "二月",
    "三月",
    "四月",
    "五月",
    "六月",
    "七月",
    "八月",
    "九月",
    "十月",
    "十一月",
    "十二月",
  ],
  and: "及",
  last: "最後",
  tokens: {
    every: "每",
    weekday: "平日",
    day: "日",
    days: "日",
    year: "年",
    years: "年",
    month: "月",
    months: "月",
    week: "週",
    weeks: "週",
    hour: "小時",
    hours: "小時",
    minute: "分鐘",
    minutes: "分鐘",
    second: "秒",
    seconds: "秒",
    on: "於",
    in: "在",
    "on the": "於",
    "day of the month": "本月的日子",
    "day of the year": "本年的日子",
    "in week": "在週",
    at: "於",
    "at minute": "在分鐘",
    "at second": "在秒",
    until: "直到",
    for: "共",
    time: "次",
    times: "次",
    instance: "次",
    "week starts on": "週從",
    with: "包括",
    "additional date": "額外日期",
    "additional dates": "額外日期",
    excluding: "不包括",
    date: "日期",
    dates: "日期",
  },
  ordinal: (n: number) => (n < 0 ? "最後" : `第${Math.abs(n)}`),
};

const ALL_LOCALES: Record<string, LocaleData> = { en, es, hi, yue };
const env = process.env.TOTEXT_LANGS;
const active = env ? env.split(',').map(s => s.trim()).filter(Boolean) : Object.keys(ALL_LOCALES);
const LOCALES: Record<string, LocaleData> = {};
for (const l of active) {
  if (ALL_LOCALES[l]) LOCALES[l] = ALL_LOCALES[l];
}

function ordinalEn(n: number): string {
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

function t(locale: LocaleData, key: string): string {
  return locale.tokens[key] ?? key;
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
  if (ord === -1) return `${locale.last} ${name}`;
  return `${locale.ordinal(ord)} ${name}`;
}

function formatTime(hour: number, minute = 0, second = 0): string {
  const hr12 = ((hour + 11) % 12) + 1;
  const ampm = hour < 12 ? "AM" : "PM";
  const mm = String(minute).padStart(2, "0");
  const ss = String(second).padStart(2, "0");
  if (second) {
    return `${hr12}:${mm}:${ss} ${ampm}`;
  }
  if (minute) {
    return `${hr12}:${mm} ${ampm}`;
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
  const data = LOCALES[lang!] || en;
  const {
    freq,
    interval = 1,
    count,
    until,
    byDay,
    byHour,
    byMinute,
    bySecond,
    byMonth,
    byMonthDay,
    byYearDay,
    byWeekNo,
    bySetPos,
    wkst,
    rDate,
    exDate,
  } = opts;

  const parts: string[] = [t(data, "every")];

  const baseKey = ({
    YEARLY: "year",
    MONTHLY: "month",
    WEEKLY: "week",
    DAILY: "day",
    HOURLY: "hour",
    MINUTELY: "minute",
    SECONDLY: "second",
  } as Record<string, string>)[freq];
  const base = t(data, baseKey as string);

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
    parts.push(t(data, "weekday"));
  } else if (freq === "WEEKLY" && interval === 1 && isEveryday) {
    parts.push(t(data, "day"));
  } else {
    if (interval !== 1) {
      const plural = data.tokens[`${baseKey}s`] || `${base}s`;
      parts.push(interval.toString(), plural);
    } else {
      parts.push(base);
    }
  }

  if (freq === "WEEKLY" && byDay && !isWeekdays && !isEveryday) {
    parts.push(t(data, "on"), list(byDay, (t) => formatByDayToken(t, data), data.and));
  } else if (byDay && freq !== "WEEKLY") {
    parts.push(t(data, "on"), list(byDay, (t) => formatByDayToken(t, data), data.and));
  }

  if (byMonth) {
    parts.push(
      t(data, "in"),
      list(byMonth, (m) => data.monthNames[(m as number) - 1]!, data.and)
    );
  }

  if (byMonthDay) {
    parts.push(
      t(data, "on the"),
      list(byMonthDay, (d) => data.ordinal(d as number), data.and),
      t(data, "day of the month")
    );
  }

  if (byYearDay) {
    parts.push(
      t(data, "on the"),
      list(byYearDay, (d) => data.ordinal(d as number), data.and),
      t(data, "day of the year")
    );
  }

  if (byWeekNo) {
    parts.push(t(data, "in week"), list(byWeekNo, (n) => n.toString(), data.and));
  }

  if (byHour) {
    const minutes = byMinute ?? [0];
    const seconds = bySecond ?? [0];
    const times = byHour.flatMap((h) =>
      minutes.flatMap((m) => seconds.map((s) => formatTime(h, m, s)))
    );
    parts.push(t(data, "at"), list(times, (t) => String(t), data.and));
    parts.push(tzAbbreviation(opts.dtstart));
  }

  if (!byHour && byMinute) {
    parts.push(t(data, "at minute"), list(byMinute, (n) => `${n}`, data.and));
  }

  if (!byHour && !byMinute && bySecond) {
    parts.push(t(data, "at second"), list(bySecond, (n) => `${n}`, data.and));
  }

  if (until) {
    const monthName = data.monthNames[until.month - 1]!;
    parts.push(t(data, "until"), `${monthName} ${until.day}, ${until.year}`);
  } else if (count !== undefined) {
    parts.push(
      t(data, "for"),
      count.toString(),
      count === 1 ? t(data, "time") : t(data, "times")
    );
  }

  if (bySetPos) {
    parts.push(
      t(data, "on the"),
      list(bySetPos, (n) => data.ordinal(n as number), data.and),
      t(data, "instance")
    );
  }

  if (wkst) {
    const wkName = formatByDayToken(wkst, data);
    parts.push(t(data, "week starts on"), wkName);
  }

  if (rDate && rDate.length) {
    parts.push(
      t(data, "with"),
      `${rDate.length}`,
      rDate.length === 1 ? t(data, "additional date") : t(data, "additional dates")
    );
  }

  if (exDate && exDate.length) {
    parts.push(
      t(data, "excluding"),
      `${exDate.length}`,
      exDate.length === 1 ? t(data, "date") : t(data, "dates")
    );
  }

  return parts.join(" ");
}

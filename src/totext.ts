import {Temporal} from '@js-temporal/polyfill';
import {RRuleTemporal} from './index';

interface UnitStrings {
  singular: string;
  plural: string;
}

interface LocaleData {
  weekdayNames: string[];
  monthNames: string[];
  units: {
    year: UnitStrings;
    month: UnitStrings;
    week: UnitStrings;
    day: UnitStrings;
    hour: UnitStrings;
    minute: UnitStrings;
    second: UnitStrings;
  };
  words: {
    every: string;
    weekday: string;
    on: string;
    in: string;
    on_the: string;
    day_of_month: string;
    day_of_year: string;
    in_week: string;
    at: string;
    at_minute: string;
    at_second: string;
    until: string;
    for: string;
    time: string;
    times: string;
    instance: string;
    week_starts_on: string;
    with: string;
    additional_date: string;
    additional_dates: string;
    excluding: string;
    date: string;
    dates: string;
    and: string;
    last: string;
  };
  ordinal?: (n: number) => string;
}

const en: LocaleData = {
  weekdayNames: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  monthNames: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
  units: {
    year: {singular: 'year', plural: 'years'},
    month: {singular: 'month', plural: 'months'},
    week: {singular: 'week', plural: 'weeks'},
    day: {singular: 'day', plural: 'days'},
    hour: {singular: 'hour', plural: 'hours'},
    minute: {singular: 'minute', plural: 'minutes'},
    second: {singular: 'second', plural: 'seconds'},
  },
  words: {
    every: 'every',
    weekday: 'weekday',
    on: 'on',
    in: 'in',
    on_the: 'on the',
    day_of_month: 'day of the month',
    day_of_year: 'day of the year',
    in_week: 'in week',
    at: 'at',
    at_minute: 'at minute',
    at_second: 'at second',
    until: 'until',
    for: 'for',
    time: 'time',
    times: 'times',
    instance: 'instance',
    week_starts_on: 'week starts on',
    with: 'with',
    additional_date: 'additional date',
    additional_dates: 'additional dates',
    excluding: 'excluding',
    date: 'date',
    dates: 'dates',
    and: 'and',
    last: 'last',
  },
  ordinal: (n: number) => {
    const abs = Math.abs(n);
    const suffix =
      abs % 10 === 1 && abs % 100 !== 11
        ? 'st'
        : abs % 10 === 2 && abs % 100 !== 12
          ? 'nd'
          : abs % 10 === 3 && abs % 100 !== 13
            ? 'rd'
            : 'th';
    return n < 0 ? `last` : `${abs}${suffix}`;
  },
};

const es: LocaleData = {
  weekdayNames: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'],
  monthNames: [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ],
  units: {
    year: {singular: 'año', plural: 'años'},
    month: {singular: 'mes', plural: 'meses'},
    week: {singular: 'semana', plural: 'semanas'},
    day: {singular: 'día', plural: 'días'},
    hour: {singular: 'hora', plural: 'horas'},
    minute: {singular: 'minuto', plural: 'minutos'},
    second: {singular: 'segundo', plural: 'segundos'},
  },
  words: {
    every: 'cada',
    weekday: 'día de la semana',
    on: 'en',
    in: 'en',
    on_the: 'el',
    day_of_month: 'día del mes',
    day_of_year: 'día del año',
    in_week: 'en la semana',
    at: 'a las',
    at_minute: 'en el minuto',
    at_second: 'en el segundo',
    until: 'hasta',
    for: 'durante',
    time: 'vez',
    times: 'veces',
    instance: 'ocasión',
    week_starts_on: 'la semana comienza el',
    with: 'con',
    additional_date: 'fecha adicional',
    additional_dates: 'fechas adicionales',
    excluding: 'excluyendo',
    date: 'fecha',
    dates: 'fechas',
    and: 'y',
    last: 'último',
  },
  ordinal: (n: number) => (n < 0 ? 'último' : `${Math.abs(n)}º`),
};

const hi: LocaleData = {
  weekdayNames: ['सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार', 'रविवार'],
  monthNames: [
    'जनवरी',
    'फरवरी',
    'मार्च',
    'अप्रैल',
    'मई',
    'जून',
    'जुलाई',
    'अगस्त',
    'सितंबर',
    'अक्टूबर',
    'नवंबर',
    'दिसंबर',
  ],
  units: {
    year: {singular: 'साल', plural: 'साल'},
    month: {singular: 'महीना', plural: 'महीने'},
    week: {singular: 'सप्ताह', plural: 'सप्ताह'},
    day: {singular: 'दिन', plural: 'दिन'},
    hour: {singular: 'घंटा', plural: 'घंटे'},
    minute: {singular: 'मिनट', plural: 'मिनट'},
    second: {singular: 'सेकंड', plural: 'सेकंड'},
  },
  words: {
    every: 'हर',
    weekday: 'सप्ताह का दिन',
    on: 'को',
    in: 'में',
    on_the: 'को',
    day_of_month: 'महीने का दिन',
    day_of_year: 'साल का दिन',
    in_week: 'सप्ताह',
    at: 'पर',
    at_minute: 'मिनट पर',
    at_second: 'सेकंड पर',
    until: 'तक',
    for: 'के लिए',
    time: 'बार',
    times: 'बार',
    instance: 'बार',
    week_starts_on: 'सप्ताह शुरू होता है',
    with: 'साथ',
    additional_date: 'अतिरिक्त तारीख',
    additional_dates: 'अतिरिक्त तारीखें',
    excluding: 'को छोड़कर',
    date: 'तारीख',
    dates: 'तारीखें',
    and: 'और',
    last: 'आखिरी',
  },
  ordinal: (n: number) => (n < 0 ? 'आखिरी' : `${Math.abs(n)}वां`),
};

const yue: LocaleData = {
  weekdayNames: ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'],
  monthNames: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],
  units: {
    year: {singular: '年', plural: '年'},
    month: {singular: '月', plural: '月'},
    week: {singular: '週', plural: '週'},
    day: {singular: '日', plural: '日'},
    hour: {singular: '小時', plural: '小時'},
    minute: {singular: '分鐘', plural: '分鐘'},
    second: {singular: '秒', plural: '秒'},
  },
  words: {
    every: '每',
    weekday: '平日',
    on: '在',
    in: '於',
    on_the: '在',
    day_of_month: '月的日子',
    day_of_year: '年的日子',
    in_week: '第',
    at: '在',
    at_minute: '在第',
    at_second: '在第',
    until: '直到',
    for: '共',
    time: '次',
    times: '次',
    instance: '次',
    week_starts_on: '星期開始於',
    with: '帶有',
    additional_date: '額外日期',
    additional_dates: '額外日期',
    excluding: '排除',
    date: '日期',
    dates: '日期',
    and: '和',
    last: '最後',
  },
  ordinal: (n: number) => (n < 0 ? '最後' : `第${Math.abs(n)}`),
};

const ar: LocaleData = {
  weekdayNames: ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'],
  monthNames: [
    'يناير',
    'فبراير',
    'مارس',
    'أبريل',
    'مايو',
    'يونيو',
    'يوليو',
    'أغسطس',
    'سبتمبر',
    'أكتوبر',
    'نوفمبر',
    'ديسمبر',
  ],
  units: {
    year: {singular: 'سنة', plural: 'سنوات'},
    month: {singular: 'شهر', plural: 'أشهر'},
    week: {singular: 'أسبوع', plural: 'أسابيع'},
    day: {singular: 'يوم', plural: 'أيام'},
    hour: {singular: 'ساعة', plural: 'ساعات'},
    minute: {singular: 'دقيقة', plural: 'دقائق'},
    second: {singular: 'ثانية', plural: 'ثواني'},
  },
  words: {
    every: 'كل',
    weekday: 'يوم من أيام الأسبوع',
    on: 'في',
    in: 'في',
    on_the: 'في الـ',
    day_of_month: 'يوم من الشهر',
    day_of_year: 'يوم من السنة',
    in_week: 'في الأسبوع',
    at: 'عند',
    at_minute: 'في الدقيقة',
    at_second: 'في الثانية',
    until: 'حتى',
    for: 'لمدة',
    time: 'مرة',
    times: 'مرات',
    instance: 'مرة',
    week_starts_on: 'يبدأ الأسبوع يوم',
    with: 'مع',
    additional_date: 'تاريخ إضافي',
    additional_dates: 'تواريخ إضافية',
    excluding: 'باستثناء',
    date: 'تاريخ',
    dates: 'تواريخ',
    and: 'و',
    last: 'الأخير',
  },
  ordinal: (n: number) => {
    if (n < 0) return 'الأخير';
    const abs = Math.abs(n);
    const map: Record<number, string> = {
      1: 'الأول',
      2: 'الثاني',
      3: 'الثالث',
      4: 'الرابع',
      5: 'الخامس',
      6: 'السادس',
      7: 'السابع',
      8: 'الثامن',
      9: 'التاسع',
      10: 'العاشر',
      11: 'الحادي عشر',
      12: 'الثاني عشر',
      13: 'الثالث عشر',
    };
    return map[abs] || abs.toString();
  },
};

const he: LocaleData = {
  weekdayNames: ['יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'יום שבת', 'יום ראשון'],
  monthNames: [
    'ינואר',
    'פברואר',
    'מרץ',
    'אפריל',
    'מאי',
    'יוני',
    'יולי',
    'אוגוסט',
    'ספטמבר',
    'אוקטובר',
    'נובמבר',
    'דצמבר',
  ],
  units: {
    year: {singular: 'שנה', plural: 'שנים'},
    month: {singular: 'חודש', plural: 'חודשים'},
    week: {singular: 'שבוע', plural: 'שבועות'},
    day: {singular: 'יום', plural: 'ימים'},
    hour: {singular: 'שעה', plural: 'שעות'},
    minute: {singular: 'דקה', plural: 'דקות'},
    second: {singular: 'שניה', plural: 'שניות'},
  },
  words: {
    every: 'כל',
    weekday: 'יום חול',
    on: 'ב',
    in: 'ב',
    on_the: 'ב',
    day_of_month: 'יום בחודש',
    day_of_year: 'יום בשנה',
    in_week: 'בשבוע',
    at: 'בשעה',
    at_minute: 'בדקה',
    at_second: 'בשניה',
    until: 'עד',
    for: 'במשך',
    time: 'פעם',
    times: 'פעמים',
    instance: 'פעם',
    week_starts_on: 'שבוע מתחיל ב',
    with: 'עם',
    additional_date: 'תאריך נוסף',
    additional_dates: 'תאריכים נוספים',
    excluding: 'למעט',
    date: 'תאריך',
    dates: 'תאריכים',
    and: 'ו',
    last: 'אחרון',
  },
  ordinal: (n: number) => {
    if (n < 0) return 'אחרון';
    const abs = Math.abs(n);
    const map: Record<number, string> = {
      1: 'ראשון',
      2: 'שני',
      3: 'שלישי',
      4: 'רביעי',
      5: 'חמישי',
      6: 'שישי',
      7: 'שביעי',
      8: 'שמיני',
      9: 'תשיעי',
      10: 'עשירי',
      11: 'אחד עשר',
      12: 'שנים עשר',
      13: 'שלושה עשר',
    };
    return map[abs] || abs.toString();
  },
};

const zh: LocaleData = {
  weekdayNames: ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'],
  monthNames: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],
  units: {
    year: {singular: '年', plural: '年'},
    month: {singular: '月', plural: '月'},
    week: {singular: '周', plural: '周'},
    day: {singular: '日', plural: '日'},
    hour: {singular: '小时', plural: '小时'},
    minute: {singular: '分钟', plural: '分钟'},
    second: {singular: '秒', plural: '秒'},
  },
  words: {
    every: '每',
    weekday: '工作日',
    on: '在',
    in: '在',
    on_the: '在',
    day_of_month: '月的日子',
    day_of_year: '年的日子',
    in_week: '第',
    at: '在',
    at_minute: '在第',
    at_second: '在第',
    until: '直到',
    for: '共',
    time: '次',
    times: '次',
    instance: '次',
    week_starts_on: '星期开始于',
    with: '带有',
    additional_date: '额外日期',
    additional_dates: '额外日期',
    excluding: '排除',
    date: '日期',
    dates: '日期',
    and: '和',
    last: '最后',
  },
  ordinal: (n: number) => (n < 0 ? '最后' : `第${Math.abs(n)}`),
};

const ALL_LOCALES: Record<string, LocaleData> = {en, es, hi, yue, ar, he, zh};
const env = typeof process !== 'undefined' && process.env ? process.env.TOTEXT_LANGS : undefined;
const active = env
  ? env
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  : Object.keys(ALL_LOCALES);
const LOCALES: Record<string, LocaleData> = {};
for (const l of active) {
  if (ALL_LOCALES[l]) LOCALES[l] = ALL_LOCALES[l];
}

function defaultOrdinal(n: number): string {
  const abs = Math.abs(n);
  const suffix =
    abs % 10 === 1 && abs % 100 !== 11
      ? 'st'
      : abs % 10 === 2 && abs % 100 !== 12
        ? 'nd'
        : abs % 10 === 3 && abs % 100 !== 13
          ? 'rd'
          : 'th';
  return n < 0 ? `last` : `${abs}${suffix}`;
}

function ordinal(n: number, locale: LocaleData): string {
  return locale.ordinal ? locale.ordinal(n) : defaultOrdinal(n);
}

function list(arr: (string | number)[], mapFn: (x: string | number) => string = (x) => `${x}`, final: string): string {
  const mapped = arr.map(mapFn);
  if (mapped.length === 1) return mapped[0]!;
  return mapped.slice(0, -1).join(', ') + ` ${final} ` + mapped[mapped.length - 1];
}

function formatByDayToken(tok: string | number, locale: LocaleData): string {
  if (typeof tok === 'number') return tok.toString();
  const m = tok.match(/^([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/);
  if (!m) return tok;
  const ord = m[1] ? parseInt(m[1], 10) : 0;
  const weekdayMap: {[key: string]: number} = {
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
  if (ord === -1) return `${locale.words.last} ${name}`;
  return `${ordinal(ord, locale)} ${name}`;
}

function formatTime(hour: number, minute = 0, second = 0): string {
  const hr12 = ((hour + 11) % 12) + 1;
  const ampm = hour < 12 ? 'AM' : 'PM';
  const mm = String(minute).padStart(2, '0');
  const ss = String(second).padStart(2, '0');
  if (second) {
    return `${hr12}:${mm}:${ss} ${ampm}`;
  }
  if (minute) {
    return `${hr12}:${mm} ${ampm}`;
  }
  return `${hr12} ${ampm}`;
}

function tzAbbreviation(zdt: Temporal.ZonedDateTime): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zdt.timeZoneId,
    timeZoneName: 'short',
    hour: 'numeric',
  }).formatToParts(new Date(zdt.epochMilliseconds));
  const tzPart = parts.find((p) => p.type === 'timeZoneName');
  return tzPart?.value || zdt.timeZoneId;
}

export function toText(input: RRuleTemporal | string, locale?: string): string {
  const rule = typeof input === 'string' ? new RRuleTemporal({rruleString: input}) : input;
  const opts = rule.options();
  const lang = (locale ?? Intl.DateTimeFormat().resolvedOptions().locale).split('-')[0];
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

  const parts: string[] = [data.words.every];

  const baseKey = {
    YEARLY: 'year',
    MONTHLY: 'month',
    WEEKLY: 'week',
    DAILY: 'day',
    HOURLY: 'hour',
    MINUTELY: 'minute',
    SECONDLY: 'second',
  }[freq] as keyof LocaleData['units'];
  const base = data.units[baseKey];

  const daysNormalized = byDay?.map((d) => d.toUpperCase());
  const isWeekdays =
    daysNormalized &&
    daysNormalized.length === 5 &&
    ['MO', 'TU', 'WE', 'TH', 'FR'].every((d) => daysNormalized.includes(d));
  const isEveryday =
    daysNormalized &&
    daysNormalized.length === 7 &&
    ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'].every((d) => daysNormalized.includes(d));

  if (freq === 'WEEKLY' && interval === 1 && isWeekdays) {
    parts.push(data.words.weekday);
  } else if (freq === 'WEEKLY' && interval === 1 && isEveryday) {
    parts.push(data.units.day.singular);
  } else {
    if (interval !== 1) {
      parts.push(interval.toString(), base.plural);
    } else {
      parts.push(base.singular);
    }
  }

  if (freq === 'WEEKLY' && byDay && !isWeekdays && !isEveryday) {
    parts.push(
      data.words.on,
      list(byDay, (t) => formatByDayToken(t, data), data.words.and),
    );
  } else if (byDay && freq !== 'WEEKLY') {
    parts.push(
      data.words.on,
      list(byDay, (t) => formatByDayToken(t, data), data.words.and),
    );
  }

  if (byMonth) {
    parts.push(
      data.words.in,
      list(byMonth, (m) => data.monthNames[(m as number) - 1]!, data.words.and),
    );
  }

  if (byMonthDay) {
    parts.push(
      data.words.on_the,
      list(byMonthDay, (d) => ordinal(d as number, data), data.words.and),
      data.words.day_of_month,
    );
  }

  if (byYearDay) {
    parts.push(
      data.words.on_the,
      list(byYearDay, (d) => ordinal(d as number, data), data.words.and),
      data.words.day_of_year,
    );
  }

  if (byWeekNo) {
    parts.push(
      data.words.in_week,
      list(byWeekNo, (n) => n.toString(), data.words.and),
    );
  }

  if (byHour) {
    const minutes = byMinute ?? [0];
    const seconds = bySecond ?? [0];
    const times = byHour.flatMap((h) => minutes.flatMap((m) => seconds.map((s) => formatTime(h, m, s))));
    parts.push(data.words.at, list(times, undefined, data.words.and));
    parts.push(tzAbbreviation(opts.dtstart));
  }

  if (!byHour && byMinute) {
    parts.push(data.words.at_minute, list(byMinute, undefined, data.words.and));
  }

  if (!byHour && !byMinute && bySecond) {
    parts.push(data.words.at_second, list(bySecond, undefined, data.words.and));
  }

  if (until) {
    const monthName = data.monthNames[until.month - 1]!;
    parts.push(data.words.until, `${monthName} ${until.day}, ${until.year}`);
  } else if (count !== undefined) {
    parts.push(data.words.for, count.toString(), count === 1 ? data.words.time : data.words.times);
  }

  if (bySetPos) {
    parts.push(
      data.words.on_the,
      list(bySetPos, (n) => ordinal(n as number, data), data.words.and),
      data.words.instance,
    );
  }

  if (wkst) {
    const wkName = formatByDayToken(wkst, data);
    parts.push(data.words.week_starts_on, wkName);
  }

  if (rDate && rDate.length) {
    parts.push(
      data.words.with,
      `${rDate.length}`,
      rDate.length === 1 ? data.words.additional_date : data.words.additional_dates,
    );
  }

  if (exDate && exDate.length) {
    parts.push(data.words.excluding, `${exDate.length}`, exDate.length === 1 ? data.words.date : data.words.dates);
  }

  return parts.join(' ');
}

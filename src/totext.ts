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
    starting_from: string;
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
    starting_from: 'starting from',
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

const de: LocaleData = {
  weekdayNames: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'],
  monthNames: [
    'Januar',
    'Februar',
    'März',
    'April',
    'Mai',
    'Juni',
    'Juli',
    'August',
    'September',
    'Oktober',
    'November',
    'Dezember',
  ],
  units: {
    year: {singular: 'Jahr', plural: 'Jahre'},
    month: {singular: 'Monat', plural: 'Monate'},
    week: {singular: 'Woche', plural: 'Wochen'},
    day: {singular: 'Tag', plural: 'Tage'},
    hour: {singular: 'Stunde', plural: 'Stunden'},
    minute: {singular: 'Minute', plural: 'Minuten'},
    second: {singular: 'Sekunde', plural: 'Sekunden'},
  },
  words: {
    every: 'jede/n/s',
    weekday: 'Werktag',
    on: 'am',
    in: 'im',
    on_the: 'am',
    day_of_month: 'Tag des Monats',
    day_of_year: 'Tag des Jahres',
    in_week: 'in Kalenderwoche',
    at: 'um',
    at_minute: 'in Minute',
    at_second: 'in Sekunde',
    until: 'bis',
    for: 'für',
    time: 'Mal',
    times: 'Mal',
    instance: 'Vorkommen',
    week_starts_on: 'Woche beginnt am',
    with: 'mit',
    additional_date: 'zusätzlichem Datum',
    additional_dates: 'zusätzlichen Daten',
    excluding: 'ohne',
    date: 'Datum',
    dates: 'Daten',
    and: 'und',
    last: 'letzter',
    starting_from: 'beginnend am',
  },
  ordinal: (n: number) => {
    if (n < 0) return 'letzten';
    return `${Math.abs(n)}.`;
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
    starting_from: 'a partir de',
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
    starting_from: 'से शुरू',
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
    starting_from: '由',
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
    starting_from: 'ابتداءً من',
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
    starting_from: 'החל מ',
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
    starting_from: '从',
  },
  ordinal: (n: number) => (n < 0 ? '最后' : `第${Math.abs(n)}`),
};

const fr: LocaleData = {
  weekdayNames: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'],
  monthNames: [
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre',
  ],
  units: {
    year: {singular: 'année', plural: 'ans'},
    month: {singular: 'mois', plural: 'mois'},
    week: {singular: 'semaine', plural: 'semaines'},
    day: {singular: 'jour', plural: 'jours'},
    hour: {singular: 'heure', plural: 'heures'},
    minute: {singular: 'minute', plural: 'minutes'},
    second: {singular: 'seconde', plural: 'secondes'},
  },
  words: {
    every: 'chaque',
    weekday: 'jour de semaine',
    on: 'le',
    in: 'dans',
    on_the: 'le',
    day_of_month: 'jour du mois',
    day_of_year: "jour de l'année",
    in_week: 'dans la semaine',
    at: 'à',
    at_minute: 'à la minute',
    at_second: 'à la seconde',
    until: "jusqu'au",
    for: 'pendant',
    time: 'fois',
    times: 'fois',
    instance: 'occurrence',
    week_starts_on: 'la semaine commence le',
    with: 'avec',
    additional_date: 'date supplémentaire',
    additional_dates: 'dates supplémentaires',
    excluding: 'en excluant',
    date: 'date',
    dates: 'dates',
    and: 'et',
    last: 'dernier',
    starting_from: 'à partir du',
  },
  ordinal: (n: number) => {
    const abs = Math.abs(n);
    if (n < 0) return 'dernier';
    if (abs === 1) return '1er';
    return `${abs}e`;
  },
};

const ALL_LOCALES: Record<string, LocaleData> = {en, de, es, hi, yue, ar, he, zh, fr};
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

function weekdayTokenFromZdt(zdt: Temporal.ZonedDateTime): string {
  const tokens = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
  return tokens[zdt.dayOfWeek - 1]!;
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

function formatLocalizedDate(zdt: Temporal.ZonedDateTime, locale: string): string {
  try {
    return zdt.toLocaleString(locale, {dateStyle: 'long'});
  } catch {
    return zdt.toLocaleString('en', {dateStyle: 'long'});
  }
}

export interface ToTextOptions {
  includeDtstart?: boolean;
}

export function toText(input: RRuleTemporal | string, locale?: string, options: ToTextOptions = {}): string {
  const rule = typeof input === 'string' ? new RRuleTemporal({rruleString: input}) : input;
  const opts = rule.options();
  const resolvedLocale = locale ?? Intl.DateTimeFormat().resolvedOptions().locale;
  const lang = resolvedLocale.split('-')[0];
  const data = LOCALES[lang!] || en;
  const dateLocale = LOCALES[lang!] ? resolvedLocale : 'en';
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

  const dayOrLarger = freq === 'YEARLY' || freq === 'MONTHLY' || freq === 'WEEKLY' || freq === 'DAILY';
  const hasExplicitTime = Boolean(byHour || byMinute || bySecond);
  const dtstartHasTime = opts.dtstart.hour !== 0 || opts.dtstart.minute !== 0 || opts.dtstart.second !== 0;
  const shouldDefaultTime = dayOrLarger && (hasExplicitTime || dtstartHasTime);

  const textByDay = byDay ?? (freq === 'WEEKLY' ? [weekdayTokenFromZdt(opts.dtstart)] : undefined);
  const textByHour = byHour ?? (shouldDefaultTime ? [opts.dtstart.hour] : undefined);
  const textByMinute = textByHour ? byMinute ?? [opts.dtstart.minute] : byMinute;
  const textBySecond = textByHour ? bySecond ?? [opts.dtstart.second] : bySecond;

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

  const daysNormalized = textByDay?.map((d) => d.toUpperCase());
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

  if (freq === 'WEEKLY' && textByDay && !isWeekdays && !isEveryday) {
    parts.push(
      data.words.on,
      list(textByDay, (t) => formatByDayToken(t, data), data.words.and),
    );
  } else if (textByDay && freq !== 'WEEKLY') {
    parts.push(
      data.words.on,
      list(textByDay, (t) => formatByDayToken(t, data), data.words.and),
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

  if (textByHour) {
    const minutes = textByMinute ?? [0];
    const seconds = textBySecond ?? [0];
    const times = textByHour.flatMap((h) => minutes.flatMap((m) => seconds.map((s) => formatTime(h, m, s))));
    parts.push(data.words.at, list(times, undefined, data.words.and));
    parts.push(tzAbbreviation(opts.dtstart));
  }

  if (!textByHour && textByMinute) {
    parts.push(data.words.at_minute, list(textByMinute, undefined, data.words.and));
  }

  if (!textByHour && !textByMinute && textBySecond) {
    parts.push(data.words.at_second, list(textBySecond, undefined, data.words.and));
  }

  if (options.includeDtstart) {
    parts.push(data.words.starting_from, formatLocalizedDate(opts.dtstart, dateLocale));
  }

  if (until) {
    parts.push(data.words.until, formatLocalizedDate(until, dateLocale));
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

  // Mention RSCALE/SKIP explicitly when present (language-agnostic annotation)
  if (opts.rscale) {
    const rscale = opts.rscale as string;
    const skip = opts.skip as string | undefined;
    parts.push(`(RSCALE=${rscale}${skip ? `;SKIP=${skip}` : ''})`);
  }

  return parts.join(' ');
}

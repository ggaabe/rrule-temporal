import {RRuleTemporal} from '../src';
import {toText} from '../src/totext';
import {Temporal} from '@js-temporal/polyfill';

function zdt(y: number, m: number, d: number, h: number, tz = 'UTC') {
  return Temporal.ZonedDateTime.from({year: y, month: m, day: d, hour: h, minute: 0, timeZone: tz});
}

const expected = {
  de: [
    'jede/n/s Tag',
    'jede/n/s Tag um 10 Uhr, 12 Uhr und 17 Uhr UTC',
    'jede/n/s Woche am Sonntag um 10 Uhr, 12 Uhr und 17 Uhr UTC',
    'jede/n/s Tag um 17:30 GMT-6',
    'jede/n/s Tag um 6:15:45 UTC',
    'jede/n/s Werktag',
    'jede/n/s 2 Minuten',
    'jede/n/s Woche am Sonntag bis 10. November 2012',
    'jede/n/s Jahr am 100. Tag des Jahres',
    'jede/n/s Jahr in Kalenderwoche 20',
    'jede/n/s Monat am Montag und Mittwoch am 2. Vorkommen',
    'jede/n/s Monat für 1 Mal mit 1 zusätzlichem Datum ohne 2 Daten',
  ],
  es: [
    'cada día',
    'cada día a las 10, 12 y 17 UTC',
    'cada semana en domingo a las 10, 12 y 17 UTC',
    'cada día a las 17:30 GMT-6',
    'cada día a las 6:15:45 UTC',
    'cada día de la semana',
    'cada 2 minutos',
    'cada semana en domingo hasta 10 de noviembre de 2012',
    'cada año el 100º día del año',
    'cada año en la semana 20',
    'cada mes en lunes y miércoles el 2º ocasión',
    'cada mes durante 1 vez con 1 fecha adicional excluyendo 2 fechas',
  ],
  hi: [
    'हर दिन',
    'हर दिन पर 10 AM, 12 PM और 5 PM UTC',
    'हर सप्ताह को रविवार पर 10 AM, 12 PM और 5 PM UTC',
    'हर दिन पर 5:30 pm GMT-6',
    'हर दिन पर 6:15:45 AM UTC',
    'हर सप्ताह का दिन',
    'हर 2 मिनट',
    'हर सप्ताह को रविवार तक 10 नवंबर 2012',
    'हर साल को 100वां साल का दिन',
    'हर साल सप्ताह 20',
    'हर महीना को सोमवार और बुधवार को 2वां बार',
    'हर महीना के लिए 1 बार साथ 1 अतिरिक्त तारीख को छोड़कर 2 तारीखें',
  ],
  yue: [
    '每 日',
    '每 日 在 上午10時, 下午12時 和 下午5時 utc',
    '每 週 在 星期日 在 上午10時, 下午12時 和 下午5時 utc',
    '每 日 在 下午5:30 GMT-6',
    '每 日 在 上午6:15:45 utc',
    '每 平日',
    '每 2 分鐘',
    '每 週 在 星期日 直到 2012年11月10日',
    '每 年 在 第100 年的日子',
    '每 年 第 20',
    '每 月 在 星期一 和 星期三 在 第2 次',
    '每 月 共 1 次 帶有 1 額外日期 排除 2 日期',
  ],
  ar: [
    'كل يوم',
    'كل يوم عند 10 ص, 12 م و 5 م utc',
    'كل أسبوع في الأحد عند 10 ص, 12 م و 5 م utc',
    'كل يوم عند 5:30 م غرينتش-6',
    'كل يوم عند 6:15:45 ص utc',
    'كل يوم من أيام الأسبوع',
    'كل 2 دقائق',
    'كل أسبوع في الأحد حتى 10 نوفمبر 2012',
    'كل سنة في الـ 100 يوم من السنة',
    'كل سنة في الأسبوع 20',
    'كل شهر في الاثنين و الأربعاء في الـ الثاني مرة',
    'كل شهر لمدة 1 مرة مع 1 تاريخ إضافي باستثناء 2 تواريخ',
  ],
  he: [
    'כל יום',
    'כל יום בשעה 10, 12 ו 17 utc',
    'כל שבוע ב יום ראשון בשעה 10, 12 ו 17 utc',
    'כל יום בשעה 17:30 GMT-6‎',
    'כל יום בשעה 6:15:45 utc',
    'כל יום חול',
    'כל 2 דקות',
    'כל שבוע ב יום ראשון עד 10 בנובמבר 2012',
    'כל שנה ב 100 יום בשנה',
    'כל שנה בשבוע 20',
    'כל חודש ב יום שני ו יום רביעי ב שני פעם',
    'כל חודש במשך 1 פעם עם 1 תאריך נוסף למעט 2 תאריכים',
  ],
  'zh-Hans': [
    '每 日',
    '每 日 在 10时, 12时 和 17时 utc',
    '每 周 在 星期日 在 10时, 12时 和 17时 UTC',
    '每 日 在 17:30 GMT-6',
    '每 日 在 6:15:45 utc',
    '每 工作日',
    '每 2 分钟',
    '每 周 在 星期日 直到 2012年11月10日',
    '每 年 在 第100 年的日子',
    '每 年 第 20',
    '每 月 在 星期一 和 星期三 在 第2 次',
    '每 月 共 1 次 带有 1 额外日期 排除 2 日期',
  ],
  fr: [
    'chaque jour',
    'chaque jour à 10 h, 12 h et 17 h UTC',
    'chaque semaine le dimanche à 10 h, 12 h et 17 h UTC',
    'chaque jour à 17:30 UTC−6',
    'chaque jour à 6:15:45 UTC',
    'chaque jour de semaine',
    'chaque 2 minutes',
    "chaque semaine le dimanche jusqu'au 10 novembre 2012",
    "chaque année le 100e jour de l'année",
    'chaque année dans la semaine 20',
    'chaque mois le lundi et mercredi le 2e occurrence',
    'chaque mois pendant 1 fois avec 1 date supplémentaire en excluant 2 dates',
  ],
};

function buildRules() {
  const until = Temporal.Instant.from('2012-11-10T00:00:00Z').toZonedDateTimeISO('UTC');
  const rDate = [zdt(2025, 2, 10, 0, 'UTC')];
  const exDate = [zdt(2025, 3, 10, 0, 'UTC'), zdt(2025, 4, 10, 0, 'UTC')];
  return [
    new RRuleTemporal({freq: 'DAILY', dtstart: zdt(2025, 1, 1, 0)}),
    new RRuleTemporal({freq: 'DAILY', byHour: [10, 12, 17], dtstart: zdt(2025, 1, 1, 0)}),
    new RRuleTemporal({freq: 'WEEKLY', byDay: ['SU'], byHour: [10, 12, 17], dtstart: zdt(2025, 1, 1, 0)}),
    new RRuleTemporal({freq: 'DAILY', byHour: [17], byMinute: [30], dtstart: zdt(2025, 1, 1, 0, 'America/Chicago')}),
    new RRuleTemporal({freq: 'DAILY', byHour: [6], byMinute: [15], bySecond: [45], dtstart: zdt(2025, 1, 1, 0)}),
    new RRuleTemporal({freq: 'WEEKLY', byDay: ['MO', 'TU', 'WE', 'TH', 'FR'], dtstart: zdt(2025, 1, 1, 0)}),
    new RRuleTemporal({freq: 'MINUTELY', interval: 2, dtstart: zdt(2025, 1, 1, 0)}),
    new RRuleTemporal({freq: 'WEEKLY', until, dtstart: zdt(2012, 1, 1, 0)}),
    new RRuleTemporal({freq: 'YEARLY', byYearDay: [100], dtstart: zdt(2025, 1, 1, 0)}),
    new RRuleTemporal({freq: 'YEARLY', byWeekNo: [20], dtstart: zdt(2025, 1, 1, 0)}),
    new RRuleTemporal({freq: 'MONTHLY', byDay: ['MO', 'WE'], bySetPos: [2], dtstart: zdt(2025, 1, 1, 0)}),
    new RRuleTemporal({freq: 'MONTHLY', count: 1, rDate, exDate, dtstart: zdt(2025, 1, 1, 0)}),
  ];
}

describe('toText i18n advanced cases', () => {
  const rules = buildRules();
  for (const lang of Object.keys(expected) as (keyof typeof expected)[]) {
    test.each(rules.map((r, i) => [expected[lang][i], r]))('%s', (text, rule) => {
      expect(toText(rule, lang).toLowerCase()).toBe(text?.toLowerCase());
    });
  }
});

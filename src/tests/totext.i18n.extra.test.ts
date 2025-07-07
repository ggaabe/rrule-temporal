import {RRuleTemporal} from '../index';
import {toText} from '../totext';
import {Temporal} from '@js-temporal/polyfill';

function zdt(y: number, m: number, d: number, h: number, tz = 'UTC') {
  return Temporal.ZonedDateTime.from({year: y, month: m, day: d, hour: h, minute: 0, timeZone: tz});
}

const expected = {
  es: [
    'cada día',
    'cada día a las 10 AM, 12 PM y 5 PM UTC',
    'cada semana en domingo a las 10 AM, 12 PM y 5 PM UTC',
    'cada día a las 5:30 PM CST',
    'cada día a las 6:15:45 AM UTC',
    'cada día de la semana',
    'cada 2 minutos',
    'cada semana hasta noviembre 10, 2012',
    'cada año el 100º día del año',
    'cada año en la semana 20',
    'cada mes en lunes y miércoles el 2º ocasión',
    'cada mes durante 1 vez con 1 fecha adicional excluyendo 2 fechas',
  ],
  hi: [
    'हर दिन',
    'हर दिन पर 10 AM, 12 PM और 5 PM UTC',
    'हर सप्ताह को रविवार पर 10 AM, 12 PM और 5 PM UTC',
    'हर दिन पर 5:30 PM CST',
    'हर दिन पर 6:15:45 AM UTC',
    'हर सप्ताह का दिन',
    'हर 2 मिनट',
    'हर सप्ताह तक नवंबर 10, 2012',
    'हर साल को 100वां साल का दिन',
    'हर साल सप्ताह 20',
    'हर महीना को सोमवार और बुधवार को 2वां बार',
    'हर महीना के लिए 1 बार साथ 1 अतिरिक्त तारीख को छोड़कर 2 तारीखें',
  ],
  yue: [
    '每 日',
    '每 日 在 10 AM, 12 PM 和 5 PM UTC',
    '每 週 在 星期日 在 10 AM, 12 PM 和 5 PM UTC',
    '每 日 在 5:30 PM CST',
    '每 日 在 6:15:45 AM UTC',
    '每 平日',
    '每 2 分鐘',
    '每 週 直到 十一月 10, 2012',
    '每 年 在 第100 年的日子',
    '每 年 第 20',
    '每 月 在 星期一 和 星期三 在 第2 次',
    '每 月 共 1 次 帶有 1 額外日期 排除 2 日期',
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
      expect(toText(rule, lang).toLowerCase()).toBe(text.toLowerCase());
    });
  }
});

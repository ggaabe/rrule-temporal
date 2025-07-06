import { RRuleTemporal } from "../index";
import { toText } from "../totext";
import { Temporal } from "@js-temporal/polyfill";

function make(ruleStr: string): RRuleTemporal {
  const dtstart = Temporal.ZonedDateTime.from({
    year: 2025,
    month: 6,
    day: 1,
    hour: 0,
    minute: 0,
    timeZone: "America/New_York",
  });
  const dt = dtstart.toPlainDateTime().toString().replace(/[-:]/g, "");
  const ics = `DTSTART;TZID=${dtstart.timeZoneId}:${dt}\n${ruleStr}`;
  return new RRuleTemporal({ rruleString: ics });
}

const cases = [
  "RRULE:FREQ=DAILY",
  "RRULE:FREQ=DAILY;BYHOUR=10,12,17",
  "RRULE:FREQ=WEEKLY;BYDAY=SU;BYHOUR=10,12,17",
  "RRULE:FREQ=WEEKLY",
  "RRULE:FREQ=HOURLY",
  "RRULE:INTERVAL=4;FREQ=HOURLY",
  "RRULE:FREQ=WEEKLY;BYDAY=TU",
  "RRULE:FREQ=WEEKLY;BYDAY=MO,WE",
  "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  "RRULE:INTERVAL=2;FREQ=WEEKLY",
  "RRULE:FREQ=MONTHLY",
  "RRULE:INTERVAL=6;FREQ=MONTHLY",
  "RRULE:FREQ=YEARLY",
  "RRULE:FREQ=YEARLY;BYDAY=+1FR",
  "RRULE:FREQ=YEARLY;BYDAY=+13FR",
  "RRULE:FREQ=DAILY;BYHOUR=17;BYMINUTE=30",
  "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;BYHOUR=10,16",
  "RRULE:FREQ=WEEKLY;BYDAY=TU,TH;BYHOUR=9,15;BYMINUTE=30",
];

const expectations: Record<string, string[]> = {
  es: [
    "cada día",
    "cada día a las 10 AM, 12 PM y 5 PM EDT",
    "cada semana el domingo a las 10 AM, 12 PM y 5 PM EDT",
    "cada semana",
    "cada hora",
    "cada 4 horas",
    "cada semana el martes",
    "cada semana el lunes y miércoles",
    "cada día de semana",
    "cada 2 semanas",
    "cada mes",
    "cada 6 meses",
    "cada año",
    "cada año el 1º viernes",
    "cada año el 13º viernes",
    "cada día a las 5:30 PM EDT",
    "cada semana el lunes y miércoles a las 10 AM y 4 PM EDT",
    "cada semana el martes y jueves a las 9:30 AM y 3:30 PM EDT",
  ],
  hi: [
    "हर दिन",
    "हर दिन पर 10 AM, 12 PM और 5 PM EDT",
    "हर सप्ताह को रविवार पर 10 AM, 12 PM और 5 PM EDT",
    "हर सप्ताह",
    "हर घंटा",
    "हर 4 घंटे",
    "हर सप्ताह को मंगलवार",
    "हर सप्ताह को सोमवार और बुधवार",
    "हर सप्ताह के दिन",
    "हर 2 सप्ताह",
    "हर माह",
    "हर 6 माह",
    "हर साल",
    "हर साल को 1वां शुक्रवार",
    "हर साल को 13वां शुक्रवार",
    "हर दिन पर 5:30 PM EDT",
    "हर सप्ताह को सोमवार और बुधवार पर 10 AM और 4 PM EDT",
    "हर सप्ताह को मंगलवार और गुरुवार पर 9:30 AM और 3:30 PM EDT",
  ],
  yue: [
    "每 日",
    "每 日 於 10 AM, 12 PM 及 5 PM EDT",
    "每 週 於 星期日 於 10 AM, 12 PM 及 5 PM EDT",
    "每 週",
    "每 小時",
    "每 4 小時",
    "每 週 於 星期二",
    "每 週 於 星期一 及 星期三",
    "每 平日",
    "每 2 週",
    "每 月",
    "每 6 月",
    "每 年",
    "每 年 於 第1 星期五",
    "每 年 於 第13 星期五",
    "每 日 於 5:30 PM EDT",
    "每 週 於 星期一 及 星期三 於 10 AM 及 4 PM EDT",
    "每 週 於 星期二 及 星期四 於 9:30 AM 及 3:30 PM EDT",
  ],
};

describe("toText i18n", () => {
  for (const locale of Object.keys(expectations)) {
    const exps = expectations[locale]!;
    test.each(cases.map((c, i) => [exps[i], c]))(`${locale} %s`, (expected, ruleStr) => {
      const rule = make(ruleStr);
      expect(toText(rule, locale).toLowerCase()).toBe(expected.toLowerCase());
    });
  }
});

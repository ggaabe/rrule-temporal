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

describe("toText", () => {
  const cases: [string, string][] = [
    ["Every day", "RRULE:FREQ=DAILY"],
    [
      "Every day at 10 AM, 12 PM and 5 PM EDT",
      "RRULE:FREQ=DAILY;BYHOUR=10,12,17",
    ],
    [
      "Every week on Sunday at 10 AM, 12 PM and 5 PM EDT",
      "RRULE:FREQ=WEEKLY;BYDAY=SU;BYHOUR=10,12,17",
    ],
    ["Every week", "RRULE:FREQ=WEEKLY"],
    ["Every hour", "RRULE:FREQ=HOURLY"],
    ["Every 4 hours", "RRULE:INTERVAL=4;FREQ=HOURLY"],
    ["Every week on Tuesday", "RRULE:FREQ=WEEKLY;BYDAY=TU"],
    [
      "Every week on Monday and Wednesday",
      "RRULE:FREQ=WEEKLY;BYDAY=MO,WE",
    ],
    ["Every weekday", "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"],
    ["Every 2 weeks", "RRULE:INTERVAL=2;FREQ=WEEKLY"],
    ["Every month", "RRULE:FREQ=MONTHLY"],
    ["Every 6 months", "RRULE:INTERVAL=6;FREQ=MONTHLY"],
    ["Every year", "RRULE:FREQ=YEARLY"],
    ["Every year on 1st Friday", "RRULE:FREQ=YEARLY;BYDAY=+1FR"],
    ["Every year on 13th Friday", "RRULE:FREQ=YEARLY;BYDAY=+13FR"],
    ["Every day at 5:30 PM EDT", "RRULE:FREQ=DAILY;BYHOUR=17;BYMINUTE=30"],
    [
      "Every week on Monday and Wednesday at 10 AM and 4 PM EDT",
      "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;BYHOUR=10,16",
    ],
    [
      "Every week on Tuesday and Thursday at 9:30 AM and 3:30 PM EDT",
      "RRULE:FREQ=WEEKLY;BYDAY=TU,TH;BYHOUR=9,15;BYMINUTE=30",
    ],
  ];

  test.each(cases)("%s", (text, ruleStr) => {
    const rule = make(ruleStr);
    expect(toText(rule).toLowerCase()).toBe(text.toLowerCase());
  });
});

import { RRuleTemporal } from "../index";
import { Temporal } from "@js-temporal/polyfill";

const baseICS = "DTSTART;TZID=UTC:20200101T000000";
function make(rr: string) {
  return new RRuleTemporal({ rruleString: `${baseICS}\n${rr}`.trim() });
}

describe("toText", () => {
  const cases: [string, string][] = [
    ["Every day", "RRULE:FREQ=DAILY"],
    ["Every day at 10, 12 and 17", "RRULE:FREQ=DAILY;BYHOUR=10,12,17"],
    [
      "Every week on Sunday at 10, 12 and 17",
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
    ["Every year on the 1st Friday", "RRULE:FREQ=YEARLY;BYDAY=+1FR"],
    ["Every year on the 13th Friday", "RRULE:FREQ=YEARLY;BYDAY=+13FR"],
  ];

  test.each(cases)("%s", (text, ruleStr) => {
    const rule = make(ruleStr);
    expect(rule.toText().toLowerCase()).toBe(text.toLowerCase());
  });
});

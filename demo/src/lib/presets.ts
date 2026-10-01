export interface Preset {
  id: string;
  title: string;
  /** The feature the example shows off. */
  feature: string;
  ics: string;
  includeDtstart?: boolean;
}

export const presets: Preset[] = [
  {
    id: 'last-business-day',
    title: 'Last business day of the month',
    feature: 'BYSETPOS',
    ics: 'DTSTART;TZID=America/Chicago:20261030T170000\nRRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1',
  },
  {
    id: 'weekdays',
    title: 'Every weekday at 9:00',
    feature: 'BYDAY',
    ics: 'DTSTART;TZID=America/New_York:20261005T090000\nRRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  },
  {
    id: 'biweekly',
    title: 'Every other Tuesday and Thursday',
    feature: 'INTERVAL',
    ics: 'DTSTART;TZID=Europe/London:20261006T183000\nRRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH',
  },
  {
    id: 'last-friday',
    title: 'Last Friday of the month',
    feature: 'BYSETPOS',
    ics: 'DTSTART;TZID=Australia/Sydney:20261030T160000\nRRULE:FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1',
  },
  {
    id: 'thanksgiving',
    title: 'US Thanksgiving',
    feature: 'Nth weekday',
    ics: 'DTSTART;TZID=America/New_York:20261126T120000\nRRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=4TH',
  },
  {
    id: 'payday',
    title: 'Payday on the 15th and last day',
    feature: 'Negative BYMONTHDAY',
    ics: 'DTSTART;TZID=UTC:20261015T090000\nRRULE:FREQ=MONTHLY;BYMONTHDAY=15,-1',
  },
  {
    id: 'quarterly',
    title: 'First Monday of each quarter',
    feature: 'INTERVAL + ordinal',
    ics: 'DTSTART;TZID=Europe/Paris:20261005T100000\nRRULE:FREQ=MONTHLY;INTERVAL=3;BYDAY=1MO',
  },
  {
    id: 'twenty-minutes',
    title: 'Every 20 minutes, 9:00 to 16:40',
    feature: 'MINUTELY',
    ics: 'DTSTART;TZID=America/New_York:20261005T090000\nRRULE:FREQ=MINUTELY;INTERVAL=20;BYHOUR=9,10,11,12,13,14,15,16',
  },
  {
    id: 'dst-gap',
    title: '2:30 AM across a DST gap',
    feature: 'Daylight saving',
    ics: 'DTSTART;TZID=America/New_York:20270310T023000\nRRULE:FREQ=DAILY;COUNT=8',
  },
  {
    id: 'holidays',
    title: 'Standup, skipping holidays',
    feature: 'EXDATE + RDATE',
    ics:
      'DTSTART;TZID=America/Los_Angeles:20261214T093000\nRRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;COUNT=12\n' +
      'EXDATE;TZID=America/Los_Angeles:20261224T093000,20261225T093000\n' +
      'RDATE;TZID=America/Los_Angeles:20261226T100000',
  },
  {
    id: 'hanukkah',
    title: 'Hanukkah, 25 Kislev',
    feature: 'Hebrew calendar',
    ics: 'DTSTART;TZID=Asia/Jerusalem:20261205T180000\nRRULE:RSCALE=HEBREW;FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=25',
  },
  {
    id: 'indian-new-year',
    title: 'Indian national new year',
    feature: 'Indian calendar',
    ics: 'DTSTART;TZID=Asia/Kolkata:20270322T090000\nRRULE:RSCALE=INDIAN;FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1',
  },
  {
    id: 'leap-day',
    title: 'Leap day, or February 28',
    feature: 'SKIP=BACKWARD',
    ics: 'DTSTART;TZID=UTC:20280229T090000\nRRULE:RSCALE=GREGORIAN;FREQ=YEARLY;SKIP=BACKWARD',
  },
  {
    id: 'off-pattern-start',
    title: 'Kickoff, then last Fridays',
    feature: 'includeDtstart',
    ics: 'DTSTART;TZID=Australia/Sydney:20261009T160000\nRRULE:FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1',
    includeDtstart: true,
  },
];

export const defaultPreset = presets[0]!;

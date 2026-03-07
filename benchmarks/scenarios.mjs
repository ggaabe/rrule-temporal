export const TIMEZONES = [
  { id: 'UTC', label: 'UTC' },
  { id: 'America/Chicago', label: 'America/Chicago' },
];

export const SCENARIOS = [
  {
    id: 'daily_30',
    label: '30 daily occurrences',
    description: 'Equivalent to the published rrule-rust benchmark case.',
    expectedCount: 30,
    buildIcs: (tzid) =>
      `DTSTART;TZID=${tzid}:20230221T235900\nRRULE:FREQ=DAILY;COUNT=30;INTERVAL=1`,
  },
  {
    id: 'daily_weekdays_520',
    label: 'Daily weekdays across many cycles',
    description: '520 weekday-only daily occurrences.',
    expectedCount: 520,
    buildIcs: (tzid) =>
      `DTSTART;TZID=${tzid}:20230221T235900\nRRULE:FREQ=DAILY;COUNT=520;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR`,
  },
  {
    id: 'hourly_720',
    label: '720 hourly occurrences',
    description: 'Simple hourly frequency across 30 days.',
    expectedCount: 720,
    buildIcs: (tzid) =>
      `DTSTART;TZID=${tzid}:20230121T235900\nRRULE:FREQ=HOURLY;COUNT=720;INTERVAL=1`,
  },
  {
    id: 'minutely_1440',
    label: '1,440 minutely occurrences',
    description: 'Simple minutely frequency across 24 hours.',
    expectedCount: 1440,
    buildIcs: (tzid) =>
      `DTSTART;TZID=${tzid}:20230221T235900\nRRULE:FREQ=MINUTELY;COUNT=1440;INTERVAL=1`,
  },
  {
    id: 'weekly_mwf_780',
    label: 'Weekly MO/WE/FR across many cycles',
    description: '780 occurrences over roughly 5 years.',
    expectedCount: 780,
    buildIcs: (tzid) =>
      `DTSTART;TZID=${tzid}:20230221T235900\nRRULE:FREQ=WEEKLY;COUNT=780;INTERVAL=1;BYDAY=MO,WE,FR`,
  },
  {
    id: 'monthly_last_weekday_240',
    label: 'Monthly last weekday across 20 years',
    description: '240 occurrences using BYDAY + BYSETPOS=-1.',
    expectedCount: 240,
    buildIcs: (tzid) =>
      `DTSTART;TZID=${tzid}:20230221T235900\nRRULE:FREQ=MONTHLY;COUNT=240;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1`,
  },
  {
    id: 'monthly_first_last_weekday_480',
    label: 'Monthly first and last weekday across 20 years',
    description: '480 occurrences using BYDAY + BYSETPOS=1,-1.',
    expectedCount: 480,
    buildIcs: (tzid) =>
      `DTSTART;TZID=${tzid}:20230221T235900\nRRULE:FREQ=MONTHLY;COUNT=480;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=1,-1`,
  },
];

export function findScenario(id) {
  return SCENARIOS.find((scenario) => scenario.id === id) ?? null;
}

export function findTimezone(id) {
  return TIMEZONES.find((timezone) => timezone.id === id) ?? null;
}

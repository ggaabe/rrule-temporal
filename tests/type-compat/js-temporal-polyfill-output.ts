import {Temporal} from '@js-temporal/polyfill';
import {RRuleTemporal} from '../../dist/index.js';

const dtstart = Temporal.ZonedDateTime.from('2026-01-01T09:00:00+00:00[UTC]');
const rule = new RRuleTemporal({
  temporal: Temporal,
  freq: 'DAILY',
  count: 3,
  dtstart,
});

const next: Temporal.ZonedDateTime | null = rule.next(dtstart.subtract({nanoseconds: 1}));
const date: Temporal.PlainDate | undefined = next?.toPlainDate();
void date;

rule.all((occurrence) => {
  const exact: Temporal.ZonedDateTime = occurrence;
  return exact.epochNanoseconds >= dtstart.epochNanoseconds;
});

const optionsDate: Temporal.ZonedDateTime = rule.options().dtstart;
const updatedDate: Temporal.ZonedDateTime | undefined = rule.with({count: 1}).all()[0];
void optionsDate;
void updatedDate;

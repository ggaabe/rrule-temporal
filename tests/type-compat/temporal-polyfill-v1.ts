import {Temporal} from 'temporal-polyfill';
import {RRuleTemporal, type RRuleOptions} from '../../dist/index.js';

const dtstart = Temporal.Now.zonedDateTimeISO('UTC');
const until = dtstart.add({days: 2});
const rDate = dtstart.add({days: 4});
const exDate = dtstart.add({days: 1});

const options: RRuleOptions = {
  freq: 'DAILY',
  dtstart,
  until,
  rDate: [rDate],
  exDate: [exDate],
};

const rule = new RRuleTemporal(options);
const typedOutputRule = new RRuleTemporal({...options, temporal: Temporal});

rule.all((date) => date.equals(dtstart));
rule.between(dtstart, until, true);
rule.next(dtstart);
rule.previous(until);
rule.occursOn(dtstart.toPlainDate());
rule.with({dtstart, until, rDate: [rDate], exDate: [exDate]});

const typedOutput: Temporal.ZonedDateTime | null = typedOutputRule.next(dtstart);
void typedOutput;

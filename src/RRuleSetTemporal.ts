import {Temporal} from '@js-temporal/polyfill';
import {RRuleTemporal} from './RRuleTemporal';

export type DateFilter = Date | Temporal.ZonedDateTime;

export interface RRuleSetOpts {
  includeRules?: RRuleTemporal[];
  includeDates?: Temporal.ZonedDateTime[];
  excludeRules?: RRuleTemporal[];
  excludeDates?: Temporal.ZonedDateTime[];
  maxIterations?: number;
}

function cloneZdt(zdt: Temporal.ZonedDateTime): Temporal.ZonedDateTime {
  return Temporal.ZonedDateTime.from(zdt.toString());
}

function instantKey(zdt: Temporal.ZonedDateTime): string {
  return zdt.toInstant().epochNanoseconds.toString();
}

function compareByInstant(a: Temporal.ZonedDateTime, b: Temporal.ZonedDateTime): number {
  return Temporal.Instant.compare(a.toInstant(), b.toInstant());
}

function dedupeDates(dates: Temporal.ZonedDateTime[]): Temporal.ZonedDateTime[] {
  const byInstant = new Map<string, Temporal.ZonedDateTime>();
  for (const date of dates) {
    const cloned = cloneZdt(date);
    const key = instantKey(cloned);
    if (!byInstant.has(key)) {
      byInstant.set(key, cloned);
    }
  }
  return [...byInstant.values()].sort(compareByInstant);
}

function dedupeRules(rules: RRuleTemporal[]): RRuleTemporal[] {
  const unique = new Map<string, RRuleTemporal>();
  for (const rule of rules) {
    if (!(rule instanceof RRuleTemporal)) {
      throw new TypeError(`${String(rule)} is not a RRuleTemporal instance`);
    }
    const key = rule.toString();
    if (!unique.has(key)) {
      unique.set(key, rule);
    }
  }
  return [...unique.values()];
}

export class RRuleSetTemporal {
  private includeRules: RRuleTemporal[];
  private includeDates: Temporal.ZonedDateTime[];
  private excludeRules: RRuleTemporal[];
  private excludeDates: Temporal.ZonedDateTime[];
  private readonly maxIterations: number;

  constructor(opts: RRuleSetOpts = {}) {
    this.includeRules = dedupeRules(opts.includeRules ?? []);
    this.includeDates = dedupeDates(opts.includeDates ?? []);
    this.excludeRules = dedupeRules(opts.excludeRules ?? []);
    this.excludeDates = dedupeDates(opts.excludeDates ?? []);
    this.maxIterations = opts.maxIterations ?? 10000;
  }

  rrule(rule: RRuleTemporal) {
    this.includeRules = dedupeRules([...this.includeRules, rule]);
  }

  exrule(rule: RRuleTemporal) {
    this.excludeRules = dedupeRules([...this.excludeRules, rule]);
  }

  rdate(date: Temporal.ZonedDateTime) {
    this.includeDates = dedupeDates([...this.includeDates, date]);
  }

  exdate(date: Temporal.ZonedDateTime) {
    this.excludeDates = dedupeDates([...this.excludeDates, date]);
  }

  rrules() {
    return [...this.includeRules];
  }

  exrules() {
    return [...this.excludeRules];
  }

  rdates() {
    return this.includeDates.map(cloneZdt);
  }

  exdates() {
    return this.excludeDates.map(cloneZdt);
  }

  options(): RRuleSetOpts {
    return {
      includeRules: this.rrules(),
      includeDates: this.rdates(),
      excludeRules: this.exrules(),
      excludeDates: this.exdates(),
      maxIterations: this.maxIterations,
    };
  }
}

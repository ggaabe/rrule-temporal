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

function normalizeDateFilter(date: DateFilter): Temporal.Instant {
  return date instanceof Date ? Temporal.Instant.from(date.toISOString()) : date.toInstant();
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

  between(after: DateFilter, before: DateFilter, inc = false): Temporal.ZonedDateTime[] {
    const afterInstant = normalizeDateFilter(after);
    const beforeInstant = normalizeDateFilter(before);

    const included = dedupeDates([
      ...this.includeRules.flatMap((rule) => rule.between(after, before, inc)),
      ...this.includeDates.filter((date) => this.isWithinWindow(date, afterInstant, beforeInstant, inc)),
    ]);

    const excluded = new Set(
      dedupeDates([
        ...this.excludeRules.flatMap((rule) => rule.between(after, before, inc)),
        ...this.excludeDates.filter((date) => this.isWithinWindow(date, afterInstant, beforeInstant, inc)),
      ]).map(instantKey),
    );

    return included.filter((date) => !excluded.has(instantKey(date)));
  }

  all(iterator?: (d: Temporal.ZonedDateTime, len: number) => boolean): Temporal.ZonedDateTime[] {
    const included = dedupeDates([
      ...this.includeRules.flatMap((rule) => rule.all()),
      ...this.includeDates,
    ]);

    const excluded = new Set(
      dedupeDates([
        ...this.excludeRules.flatMap((rule) => rule.all()),
        ...this.excludeDates,
      ]).map(instantKey),
    );

    const results = included.filter((date) => !excluded.has(instantKey(date)));
    if (!iterator) {
      return results;
    }

    const accepted: Temporal.ZonedDateTime[] = [];
    for (let index = 0; index < results.length; index++) {
      const date = results[index]!;
      if (!iterator(date, index)) {
        break;
      }
      accepted.push(date);
    }
    return accepted;
  }

  count(): number {
    return this.all().length;
  }

  private isWithinWindow(
    date: Temporal.ZonedDateTime,
    afterInstant: Temporal.Instant,
    beforeInstant: Temporal.Instant,
    inc: boolean,
  ): boolean {
    const instant = date.toInstant();
    const afterComparison = Temporal.Instant.compare(instant, afterInstant);
    const beforeComparison = Temporal.Instant.compare(instant, beforeInstant);

    if (inc) {
      return afterComparison >= 0 && beforeComparison <= 0;
    }

    return afterComparison > 0 && beforeComparison < 0;
  }
}

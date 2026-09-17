# Invalid recurrence dates and times: issues #140 and #141

Both [#140](https://github.com/ggaabe/rrule-temporal/issues/140) and
[#141](https://github.com/ggaabe/rrule-temporal/issues/141) reproduced after
PR #142. That audit compared query methods with complete generation and retained
the general generator's existing behavior. Agreement between those paths did
not establish RFC correctness: they could agree on the same wrong occurrences.

[RFC 5545 §3.3.10](https://datatracker.ietf.org/doc/html/rfc5545#section-3.3.10)
requires invalid generated dates and nonexistent local times to be omitted
without consuming COUNT. Unspecified fields come from DTSTART. This differs
from the interpretation of an explicitly supplied DTSTART or RDATE in a gap.
[RFC 7529 §4.1](https://datatracker.ietf.org/doc/html/rfc7529#section-4.1)
allows explicit SKIP policies to adjust invalid calendar dates.

## Corrections

- Calendar periods advance using PlainDate values, independently of emitted
  instants. January 31 repeats on the 31st of eligible months; February 29
  repeats in eligible leap years. INTERVAL retains its original phase.
- Inherited dates are validated before time expansion. The numeric YEARLY
  plan also omits invalid days, including century exceptions to leap years.
  Query anchors back up to a valid original-field anchor instead of clamping.
- Generated local times are resolved and checked against their nominal fields
  before BYSETPOS or COUNT. This includes half-hour gaps, skipped dates,
  expanded monthly/yearly rules, and RSCALE generation. Explicit date inputs
  retain their interpretation; generated repeated times use the earlier fold.
- RSCALE applies SKIP to inherited invalid months/days without constraining
  them first. Period termination retains eligible dates in partial final
  weeks and time slots earlier than the inherited DTSTART time.
- Subdaily time overrides no longer accept a shifted hour as matching BYHOUR
  or move backward when a missing hour/minute is reapplied.
- `occursOn()` rejects a completely skipped date and resolves the next date's
  midnight independently after a midnight gap.

The independent oracle found two additional defects during this work:

- Weekly date filters must run before BYSETPOS, so selecting the first/last
  occurrence ranks only eligible dates.
- Monthly UTC and named-zone fast paths must stop at UNTIL even if every
  visited period is empty. Checking the bound only when emitting a candidate
  can otherwise run to the iteration ceiling.

## Verification

`tests/invalid-generated-candidates.test.ts` supplies 57 direct regressions.
They cover both reports, COUNT/UNTIL, intervals, BYMONTH, negative month days,
BYSETPOS, queries, iteration, exceptions, distant seeks, folds, New York and
Lord Howe gaps, Samoa's skipped date, midnight boundaries, and RSCALE SKIP.
Older tests that explicitly expected clamping or shifted generated times now
assert the RFC omission behavior.

`tests/calendar-rfc-oracle.fuzz.test.ts` independently walks actual Gregorian
dates using Date, groups them into recurrence periods, applies date/time filters
and positional selection, and resolves wall times with `@js-temporal/polyfill`.
Invalid dates are absent from its enumeration. It uses rejection to distinguish
gaps from folds rather than the production generator's resolution check.
It compares generation, streaming, and inclusive/exclusive queries, including
COUNT and recurrence exceptions. It does not call library generation helpers.

The existing query-window fuzz suite still compares all seven frequencies,
calendars, RSCALE shapes, and optimized/general paths. The numeric-plan suite
continues to exercise large COUNT queries and RDATE/EXDATE merging.

Extended runs use reproducible seeds:

```sh
RRULE_RFC_FUZZ_SEED=140 RRULE_RFC_FUZZ_CASES=500 \
  RRULE_RFC_FUZZ_REPORT=/tmp/rfc-140.json \
  npm test -- tests/calendar-rfc-oracle.fuzz.test.ts
RRULE_RFC_FUZZ_SEED=141 RRULE_RFC_FUZZ_CASES=250 \
  RRULE_RFC_FUZZ_REPORT=/tmp/rfc-141.json \
  npm test -- tests/calendar-rfc-oracle.fuzz.test.ts
RRULE_WINDOW_FUZZ_SEED=140 RRULE_WINDOW_FUZZ_CASES=400 \
  npm test -- tests/query-window-invariants.fuzz.test.ts
RRULE_WINDOW_FUZZ_SEED=141 RRULE_WINDOW_FUZZ_CASES=200 \
  npm test -- tests/query-window-invariants.fuzz.test.ts
RRULE_FUZZ_SEED=140 RRULE_FUZZ_CASES=300 \
  npm test -- tests/numeric-query-plan.fuzz.test.ts
npm test
npm run test:types
```

Results and performance measurements are recorded in
[the audit results](../benchmarks/results/issues-140-141-2026-09-17.json).
The independent oracle covers Gregorian DAILY/WEEKLY/MONTHLY/YEARLY rules;
direct tests and differential tests cover the additional shapes listed above.
These finite corpora are regression evidence, not a proof of every RRULE or
future timezone database.

## Performance

UTC period selection and numeric COUNT plans remain enabled. The checked
general resolver reuses an existing zoned value, and a single time slot avoids
sorting an entire transition day. Named-zone generation can use its existing
fast path before applying RDATE union and EXDATE subtraction, just as UTC
generation does; COUNT still bounds the rule before exceptions are applied.
Gap-sensitive rules retain the checked general path. Non-default candidate
budgets also use the general engine, so acceleration cannot bypass that limit.

The generation benchmark compares unchanged occurrence sets with PR #142,
alternates implementations, and records five warm samples per scenario. It
includes dense positional selection, exceptions, callback termination, and
UTC/named-zone workloads. Changed invalid-date/gap semantics are tested against
RFC expectations instead of the old implementation.

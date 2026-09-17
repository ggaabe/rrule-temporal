# Recurrence optimization audit for #139

This audit began with [issue #139](https://github.com/ggaabe/rrule-temporal/issues/139)
on v2.2.5. `between()` copied `includeDtstart: true` after replacing the real
DTSTART with a traversal anchor, creating an occurrence inside an empty window.
The review covered the shared query alignment, numeric COUNT plans, UTC and
zoned generators, streamed period visitors, and timezone offset cache.

## Corrections

| Area | Failure and correction |
| --- | --- |
| DTSTART identity | Share anchor/inclusion options across `between()`, `next()`, and `previous()`. Only the original DTSTART can be forced into the set. |
| DAILY phase | A weekday filter must select points on the DTSTART/INTERVAL cadence. General generation and expanded numeric paths now use the same interval-aware weekday search. |
| Calendar and timezone | Query arithmetic retains the source calendar; fast-path output retains calendar identity. Period clipping and termination use the candidate clock. Incompatible manual TZID/DTSTART combinations use the general path. |
| Month-end seeking | Account for earlier constrained additions when seeking simple Gregorian monthly/yearly rules. The calculation is bounded by the 400-year Gregorian cycle. Preserve the existing generator's month-end policy. |
| Unsafe alignment | Keep RSCALE, non-ISO month/year arithmetic, monthly week-number traversal, and calendar sequences crossing midnight gaps on their original traversal. |
| DST generation and queries | Restore inherited time fields in period visitors, advance to the next allowed hour after a gap, resolve calendar folds consistently, preserve explicitly supplied later-fold starts, and avoid reintroducing the second HOURLY fold occurrence. |
| Week-number streaming | Sort dates from all signed week numbers before visiting them or applying COUNT. Include next week-year spillover at UNTIL/query boundaries. Derive the year length from adjacent week-year boundaries, including WKST and non-ISO calendars. |
| Timezone cache | Align transition searches to seconds. Native Temporal supplies exact transitions. Polyfill sampling is daily, covering short historical regimes that fifteen-day probes missed. |

## Verification design

`tests/query-window-invariants.fuzz.test.ts` constructs bounded source rules and
independently enumerates from the real DTSTART with the UTC generator, zoned
generator, and UTC period visitor optimizations disabled. It compares full and
early-stop iteration, `next()`, `previous()`, `between()`, `matches()`, and
`occursOn()` against that complete occurrence set. Queries include arbitrary
non-occurrence boundaries as well as exact occurrences and nanosecond offsets.

The corpus varies all seven frequencies, intervals, inclusion, COUNT/UNTIL,
RDATE/EXDATE, cache settings, time expansion, signed date/week filters,
BYSETPOS, six timezone choices, timezone overrides, calendars, RSCALE, month
ends, leap days, DST changes, and Samoa's skipped date. Existing numeric-plan
fuzzing separately exercises large COUNT indexing and recurrence-set merging.

Direct regressions provide expected answers for #139, interval phase, genuine
DTSTART inclusion/exclusion, fold interpretation, and signed-week ordering.
They supplement differential tests, whose reference engine can share a defect.
The existing RFC examples, RSCALE tests, dense-candidate limits, type checks,
and native/polyfill interoperability tests remain part of the full suite.
Timezone tests compare thirteen short offset regimes against the host's Intl
database with thirty different cache origins per regime, plus exact transition
boundaries at millisecond precision.

## Reproducing the extended runs

```sh
RRULE_WINDOW_FUZZ_SEED=139 RRULE_WINDOW_FUZZ_CASES=600 \
  RRULE_WINDOW_FUZZ_REPORT=/tmp/window-139.json \
  npm test -- tests/query-window-invariants.fuzz.test.ts
RRULE_WINDOW_FUZZ_SEED=99139 RRULE_WINDOW_FUZZ_CASES=400 \
  RRULE_WINDOW_FUZZ_REPORT=/tmp/window-99139.json \
  npm test -- tests/query-window-invariants.fuzz.test.ts
RRULE_FUZZ_CASES=300 npm test -- tests/numeric-query-plan.fuzz.test.ts
npm test
npm run test:types
```

The report records the seed, generated-rule count, comparison count, and any
counterexamples. Failures include serialized options and the exact query.
Ordinary `npm test` runs the deterministic smaller corpus on every PR's Node
20/24/26 matrix; the environment variables expand it without editing tests.

## Results

- 1,260 tests in 55 files pass on Node 20.20.2, 24.20.0, and 26.7.0.
- Seed 139: 4,200 rules and 151,200 comparisons on native Temporal.
- Seed 99139: 2,800 rules and 100,800 comparisons on the bundled polyfill.
- No mismatches across those 252,000 window comparisons; all 600 additional
  numeric-plan fuzz cases pass with all five optimized plan families exercised.
- Build and public type checks pass. Detailed timing and fuzz summaries are in
  [the audit results](../benchmarks/results/issue-139-2026-09-17.json).

## Performance and limits

The v2.2.5 comparison uses the published package with the same benchmark
harness and asserts identical results for the benchmark scenarios. The primary
UTC and dense generation optimizations remain enabled. Distant SECONDLY and
clamped monthly queries have regressions with a small iteration budget to
prevent accidental full-history scans.

Across nineteen generation scenarios, warm medians were within approximately
7% of v2.2.5 (five alternating samples per implementation, Node 25.2.1 on an
Apple M2 Max). For the longest Chicago monthly case, first-call table setup
increased from 23 ms to 132 ms on the polyfill; warm generation remained about
0.90 ms. These are local measurements, not universal performance guarantees.

Daily timezone probing costs more on the first polyfill query that builds or
extends a transition table. Warm lookups remain integer table lookups; native
Temporal avoids that sampling cost entirely. Safety limits remain enforced.
Conservative alignment fallbacks can do more work for unusual calendar and
midnight-transition shapes.

This is a targeted correctness audit, not a proof of every possible RRULE or
future timezone database. It preserves compatibility semantics outside the
identified defects, including the general engine's constrained month-end
arithmetic, rather than changing the library's entire recurrence model.

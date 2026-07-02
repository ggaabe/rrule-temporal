# Changelog

## 2.0.0 (2026-07-02)

The recurrence engine was rebuilt around integer epoch math and a pluggable
Temporal implementation. Time-zone-aware rules run **25–60× faster** than
1.6.0 (e.g. "monthly last weekday over 20 years" in `America/Chicago` went
from ~29 ms to ~0.9 ms per `all()` on the polyfill backend and ~0.45 ms on
native Temporal), `next()`/`previous()` no longer scan the whole rule
history, and repeated `all()` calls are served from a cache. Behavior is
locked in by ~80 new tests, including differential fast-path-vs-general
checks across DST transitions in six time zones, and the full suite passes
on both the polyfill and native Temporal backends.

### Breaking changes

- **Returned Temporal objects come from a different implementation.**
  1.x returned `@js-temporal/polyfill` instances. 2.0 returns instances from
  the runtime's **native `Temporal`** when it exists (Node 26+, Chrome 144+,
  Firefox 139+) and otherwise from a bundled **`temporal-polyfill`**. The
  TypeScript surface is unchanged (`temporal-spec` structural types), but:
  - `instanceof` checks against `@js-temporal/polyfill` classes now fail.
  - Passing returned objects into a *different* implementation's methods
    (e.g. `theirZdt.equals(occurrence)`) can throw errors such as
    `TypeError: Missing timeZone`. Re-hydrate instead:

    ```ts
    import { Temporal as AppTemporal } from "@js-temporal/polyfill"; // or any implementation
    const converted = rule.all().map((zdt) => AppTemporal.ZonedDateTime.from(zdt.toString()));
    // or, preserving nanosecond precision:
    // AppTemporal.ZonedDateTime.fromEpochNanoseconds(zdt.epochNanoseconds)
    ```
  Inputs were and remain accepted from any implementation — `dtstart`,
  `until`, `rDate`, `exDate`, and date filters are normalized internally.
- **`@js-temporal/polyfill` is no longer a dependency.** The polyfill
  fallback (`temporal-polyfill/full`) is bundled into the published files,
  so `rrule-temporal` has no runtime Temporal dependency to install. If your
  code imported `@js-temporal/polyfill` transitively through this package,
  add it to your own dependencies.
- **`all()` memoizes results per rule instance.** Callers receive a fresh
  array each call, but the `ZonedDateTime` instances inside are shared
  across calls, and bounded rules keep their occurrence list alive for the
  lifetime of the rule object. Opt out per rule with `cache: false`.
- **`next()`/`previous()` start near the query point** (for rules without
  `COUNT`) instead of iterating from `DTSTART`. Far-future queries that
  previously exhausted `maxIterations` and threw now return the correct
  occurrence; the iteration cap still protects rules that can never match.
- **Parse-error message text changed.** Invalid values are still rejected
  (same call sites, still `throw`), but the message strings come from the
  active Temporal implementation and are not a stable API.
- **`engines` now declares Node >= 20**, matching what CI tests (20, 24, 26).

### Added

- `cache?: boolean` rule option (default `true`) controlling `all()`
  memoization.
- Native Temporal support: on runtimes that ship `Temporal`, the library
  uses it automatically — no polyfill code runs and occurrence
  materialization is several times faster.
- Epoch-integer fast paths for **every** time zone (previously UTC-only):
  daily, hourly/minutely fixed-step, weekly, and monthly BYDAY/BYMONTHDAY
  rules iterate wall-clock time as integers and resolve instants through a
  cached per-zone offset-transition table with RFC 5545 `compatible`
  gap/fold semantics. Rules whose time of day can fall inside a DST gap
  automatically use the general engine so gap behavior is unchanged.

### Changed

- RFC 7529 `RSCALE` non-Gregorian rules (Chinese, Hebrew, Indian) always
  compute calendar math with the bundled polyfill, even when native Temporal
  is active: implementations disagree on non-ISO calendar details (V8
  numbers Chinese calendar years in a continuous era, and its Hebrew date
  arithmetic is incomplete), and recurrence results must not change with the
  runtime.
- `toText()` formats times and dates via `Intl.DateTimeFormat` directly, so
  output is identical across Temporal implementations.
- `EXDATE` exclusion uses a set of epoch values; `RDATE` merging skips
  re-sorting already-chronological results.
- Benchmarks in `benchmarks/` now measure cached and uncached modes for all
  three libraries; both README tables were refreshed.

## 1.6.0 and earlier

See the [GitHub releases](https://github.com/ggaabe/rrule-temporal/releases).

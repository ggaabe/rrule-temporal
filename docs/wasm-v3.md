# WebAssembly v3 candidate

## Outcome

This branch is a working hybrid engine, not a wholesale rewrite. The existing
TypeScript parser, validation, Temporal normalization, serialization, calendar
handling, and JavaScript recurrence engine remain in place. Eligible Gregorian
recurrence arithmetic is sent to a synchronous batched WebAssembly call,
which returns packed epoch-millisecond values. JavaScript then constructs the
same active-runtime `Temporal.ZonedDateTime` values returned by 2.x.

The public interface is unchanged. No asynchronous initializer, WASI runtime,
filesystem lookup, native add-on, or caller-supplied Temporal adapter is
required.

## Runtime architecture

1. The constructor parses and sanitizes the rule exactly as before.
2. An eligible operation encodes scalar rule fields plus compact bit masks and
   numeric time-slot arrays.
3. The embedded module is instantiated synchronously on the first profitable
   call. Compilation or CSP failure is remembered and selects JavaScript.
4. A batched WASM call fills a reusable `Float64Array` with exact integral epoch
   milliseconds (or local wall-clock milliseconds for named-zone calendar
   rules).
5. JavaScript resolves named-zone wall times with the existing host-`Intl`
   transition cache and materializes only the public Temporal results.
6. Any unsupported case falls through to the 2.x engine.

The generated module is approximately 2.8 KiB. It uses a raw numeric ABI, a
stub allocator, no WASI imports, no threads, no SIMD requirement, and no
per-occurrence JavaScript callback. Its byte array is bundled into both ESM and
CJS output, avoiding asynchronous `.wasm` loading and bundler-specific asset
rules.

## Automatic selection

The branch deliberately does not route every technically supported rule to
WASM. Existing 2.x integer loops are already efficient, and Temporal object
construction dominates dense results.

Automatic WASM selection currently covers:

- UTC monthly BYSETPOS `all()` calls with at least 128 requested results.
- COUNT-bounded `next()`, `previous()`, `between()`, and therefore `matches()`
  queries with at least 128 occurrences when their recurrence is an eligible
  DAILY or simple fixed-step HOURLY/MINUTELY/SECONDLY rule.
- Query dates at least `max(64, ceil(COUNT / 256))` recurrence periods after
  DTSTART, so near-start and very-large-COUNT lookups retain the early-stopping
  JavaScript iterator instead of eagerly constructing an entire packed series.
- UTC and named IANA zones for DAILY queries whose wall time cannot encounter
  a DST gap over the rule span.
- Millisecond-precision ISO/Gregorian dates with a COUNT no greater than
  250,000 for query plans.

Eager `all()` plans are capped at 1,000,000 packed occurrences; larger rules
stay on the JavaScript engine.

The kernel itself also implements daily time-slot expansion, weekly BYDAY/WKST
expansion, monthly BYDAY/BYMONTHDAY/BYMONTH/BYSETPOS, inclusive UNTIL, and
period-based iteration limits. Forced-engine differential tests exercise this
broader surface even where automatic selection presently favors JavaScript.

JavaScript remains authoritative for:

- Arbitrary iterator callbacks.
- RDATE and EXDATE.
- `includeDtstart: true` mismatch semantics.
- Sub-millisecond DTSTART or UNTIL values.
- Non-ISO calendars and RFC 7529 RSCALE.
- Ordinal BYDAY and Gregorian combinations not yet encoded by the kernel.
- Named-zone UNTIL calendar rules and wall times that may enter a DST gap.
- Very large plans, unsupported runtime capabilities, and WASM/CSP failure.

## Why the 100× result belongs to queries, not `all()`

An eager `all()` returning N compatible Temporal objects must still allocate N
JavaScript objects. WASM can reduce recurrence arithmetic, but it cannot remove
that public-interface cost. On the development Node 24/polyfill host, the
forced-WASM monthly paths improved end-to-end `all()` by 1.2–1.3×.

COUNT-bounded range queries had a different pathology. The 2.x implementation
could not phase-jump because COUNT depends on the occurrence index, so a query
near occurrence 8,500 constructed roughly 8,500 Temporal values only to
discard them. The v3 path generates their epoch values in WASM, binary-searches
the packed series, and constructs only the one or few values returned.

Latest warm, uncached public-operation results on the development Node 24 host:

| Public operation                                     |  Forced JS | Forced WASM | Speedup |
| ---------------------------------------------------- | ---------: | ----------: | ------: |
| `all()`, monthly last weekday, 240 results           |   1.274 ms |    0.954 ms |    1.3× |
| `all()`, monthly first and last weekday, 480 results |   2.518 ms |    2.019 ms |    1.2× |
| `next()`, daily COUNT=9000 near #8500, UTC           | 104.767 ms |    0.071 ms |  1,477× |
| `previous()`, same rule, UTC                         | 135.052 ms |    0.106 ms |  1,271× |
| `between()`, same rule, UTC                          |  65.573 ms |    0.125 ms |    523× |
| `next()`, same rule, America/Chicago                 | 148.910 ms |    0.527 ms |    283× |
| `previous()`, same rule, America/Chicago             | 105.832 ms |    0.323 ms |    328× |
| `between()`, same rule, America/Chicago              |  68.705 ms |    0.350 ms |    196× |

Run `npm --prefix benchmarks run benchmark:wasm` to reproduce the harness. It
uses preconstructed uncached rules, interleaves forced-JavaScript and
forced-WASM samples, validates equality before timing, and eagerly consumes
every returned `epochNanoseconds` value in a rolling checksum.

These figures are workload- and machine-specific. The defensible claim is that
the 100× stretch target is exceeded for the selected sparse COUNT-query class;
it is not an across-the-board `all()` claim.

## Build and verification

`npm run build:wasm` compiles `assembly/recurrence.ts` with an exactly pinned
AssemblyScript dev dependency and regenerates
`src/generated/recurrence-wasm.ts`. `npm run build` performs that step before
the existing `tsdown` ESM/CJS build.

AssemblyScript requires Node 20 or later for source builds. The published
bundles do not include the compiler: ESM, CJS, missing-WebAssembly fallback,
and Vite production bundling were smoke-tested on the supported CI runtimes,
with additional runtime smoke coverage on Node 18. The embedded module is
about 2.8 KiB; in the measured build it added about 7.6 KiB gzip to the shared
ESM chunk. The documented alpha tarball is 181.1 kB, about 21.7 kB over 2.0.2
including the newly shipped v3 design notes and changelog.

Required release checks:

```bash
npm test
npm run test:types
npm --prefix benchmarks run benchmark:wasm
```

The tests force each engine independently and assert that WASM was actually
selected, avoiding a vacuous differential test that silently exercised the
fallback twice. They cover UTC and multiple IANA zones, half-hour offsets,
DST transitions and repeated hours, time-slot expansion, inclusive
boundaries, pre-1970 and years 0001/9999, negative BYMONTHDAY/BYSETPOS,
sub-millisecond fallback, runtime traps, unavailable WebAssembly, extreme
interval/range fallback, and distant COUNT queries.

## Production follow-up

The raw ABI is intentionally implementation-neutral. AssemblyScript makes the
prototype reproducible using the repository's existing npm toolchain and emits
a compact module. Before calling 3.0 stable, a Rust `wasm32v1-none` kernel is
worth evaluating for stronger overflow discipline, fuzzing, and future
Gregorian rank/select work. Replacing the module would not alter the public or
host-side TypeScript interface.

The next high-value extensions are direct WEEKLY/MONTHLY query plans, a copied
zone-transition table so named-zone UNTIL rules never cross into JavaScript per
candidate, chunked output for very large result sets, and randomized
differential/property testing across the 400-year Gregorian cycle.

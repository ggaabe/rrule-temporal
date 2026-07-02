import {Temporal as TemporalPolyfill} from 'temporal-polyfill/full';
import type {Temporal as TemporalTypes} from 'temporal-spec';

// Runtime binding for the Temporal implementation used internally.
//
// Prefer the runtime's native Temporal (Node 26+, Chrome 144+, Firefox 139+):
// it is dramatically faster than any polyfill. Fall back to the bundled
// `temporal-polyfill/full` build, which includes the non-ISO calendar support
// (Hebrew/Chinese/Indian) required for RFC 7529 RSCALE rules.
//
// All user-supplied Temporal objects are normalized into this implementation
// at the API boundary (via ISO-string round-trip), so instances from other
// implementations interoperate regardless of which binding is active.
export const Temporal: typeof TemporalPolyfill =
  (globalThis as {Temporal?: typeof TemporalPolyfill}).Temporal ?? TemporalPolyfill;

/** True when the runtime's native Temporal is in use (vs the polyfill). */
export const isNativeTemporal = Temporal !== TemporalPolyfill;

// Non-ISO calendar computations (RFC 7529 RSCALE) are always pinned to the
// bundled polyfill: implementations disagree on non-ISO calendar details —
// e.g. V8's native Temporal numbers Chinese calendar years in a continuous
// era while the polyfills use related-Gregorian years — and recurrence
// results must not change with the runtime.
export {TemporalPolyfill as PolyfillTemporal};

// Non-instantiated namespace merged with the const above so that qualified
// type positions (`Temporal.ZonedDateTime` etc.) keep working; it is erased
// at compile time and emits no runtime code.
export namespace Temporal {
  export type ZonedDateTime = TemporalTypes.ZonedDateTime;
  export type Instant = TemporalTypes.Instant;
  export type PlainDate = TemporalTypes.PlainDate;
  export type PlainTime = TemporalTypes.PlainTime;
  export type PlainDateTime = TemporalTypes.PlainDateTime;
  export type PlainYearMonth = TemporalTypes.PlainYearMonth;
  export type PlainMonthDay = TemporalTypes.PlainMonthDay;
  export type Duration = TemporalTypes.Duration;
  export type DurationLike = TemporalTypes.DurationLike;
  export type ZonedDateTimeLike = TemporalTypes.ZonedDateTimeLike;
}

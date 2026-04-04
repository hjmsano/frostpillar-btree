# ADR 0014: Optimize hot path and reduce footprint

- Status: Accepted
- Date: 2026-03-24

## Context

The library targets "lightweight, fast, tiny footprint" but had per-operation validation overhead, dead code, and always-allocated data structures that worked against those goals.

Specifically:

1. `assertComparatorReflexivity` and transitivity checks ran on every `put()`.
2. `validateComparatorResult` (`Number.isFinite` check) wrapped every `compareUserKeys` call.
3. `unwrapEntryId` was a no-op function called on every entry ID access.
4. `VALID_DUPLICATE_KEY_POLICIES` was allocated as a `Set` just for a membership check.
5. Binary search used `Math.floor((lower + upper) / 2)` instead of a bitwise shift.
6. The `entryKeys` Map was always maintained even when entry-ID-based lookup was not needed.

## Decision

1. **Remove hot-path comparator validation.** `assertComparatorReflexivity` and transitivity checks no longer run on every `put()`. `validateComparatorResult` no longer wraps every `compareUserKeys` call. These checks remain available in `assertInvariants()`.
2. **Inline `unwrapEntryId`.** The no-op function is removed; call sites use the value directly.
3. **Replace `VALID_DUPLICATE_KEY_POLICIES` Set.** Membership check is now a simple `!==` chain, avoiding Set allocation.
4. **Use `>>> 1` in binary search.** `Math.floor((lower + upper) / 2)` is replaced with `(lower + upper) >>> 1` (unsigned right shift).
5. **Add `enableEntryIdLookup` config option.** New optional boolean on `InMemoryBTreeConfig` (defaults `false`). When `false`, the `entryKeys` Map is not maintained, saving memory. `removeById`, `peekById`, and `updateById` throw `BTreeValidationError` if called with lookup disabled.
6. **Integrate `assertInvariants` and `getStats` directly.** These methods are now always available on `InMemoryBTree` without requiring a separate debug import. The former `./debug` subpath export and monkey-patching pattern have been removed.

## Consequences

- Insert and query paths are faster due to removal of per-operation validation overhead.
- Bundle size potential is smaller due to dead-code elimination.
- Users who do not need entry-ID-based lookup can set `enableEntryIdLookup: false` to reduce memory usage.
- Comparator contract violations are now detected at `assertInvariants()` time rather than per-operation, shifting the validation model from fail-fast to explicit check.

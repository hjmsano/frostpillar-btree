# ADR 0018: Preserve autoScale restore state and harden input limits

- Status: Accepted
- Date: 2026-03-25

## Context

Three issues were identified in the current implementation:

1. `clone()` and `fromJSON()` reset `autoScale` trees to tier-0 capacities, even when the source tree had already scaled up.
2. Constructor runtime validation did not reject non-function `compareKeys`, leading to late `TypeError` instead of typed validation errors.
3. Input hardening gaps remained for untrusted sources:
   - `fromJSON` allowed very large payloads (`10_000_000` entries).
   - `ConcurrentInMemoryBTree.sync()` had no explicit mutation-batch upper bound.

These behaviors conflicted with the project goal of predictable performance and robust failure modes.

## Decision

1. Preserve `autoScale` capacity snapshot in restore paths:
   - `clone()` now applies the source tree's current `maxLeafEntries`/`maxBranchChildren` before inserting entries.
   - `fromJSON()` now applies serialized capacity snapshot before bulk insertion when `autoScale` is enabled.
2. Add constructor runtime validation:
   - `compareKeys` must be a function; otherwise throw `BTreeValidationError`.
3. Tighten untrusted-input limits:
   - Reduce `MAX_SERIALIZED_ENTRIES` from `10_000_000` to `1_000_000`.
   - Add `maxSyncMutationsPerBatch` to `ConcurrentInMemoryBTreeConfig` with default `100_000` and allowed range `1..1_000_000`.
   - Enforce this limit during `sync()` and fail fast with `BTreeConcurrencyError`.

## Consequences

- Restored/cloned `autoScale` trees no longer regress to tier-0 behavior after prior high-water growth.
- Invalid JS runtime configuration fails early with typed errors.
- Large untrusted sync/log payloads are bounded by explicit policy, reducing memory-spike risk.
- API surface grows by one optional concurrency config (`maxSyncMutationsPerBatch`), and docs/spec/tests must remain aligned.

# ADR 0024: Concurrent read throughput and lazy delete rebalance

- Status: Accepted
- Date: 2026-04-08

## Context

Benchmark profiling identified two further optimization targets from the performance work items list:

1. **Concurrent read overhead**: In `'strong'` read mode, every individual `get()` call triggers a full `sync` against the shared store. For read-heavy workloads that need freshness, this produces excessive round-trips (one per read).
2. **autoScale delete churn**: Under `autoScale`, the dynamic `minLeafEntries` increases as the tree scales up. Mass deletions (`deleteRange`, repeated `remove`) trigger aggressive rebalancing because many leaves fall below the scaled-up minimum, causing unnecessary borrow/merge cascades.

## Decision

### 1. `syncThenRead` helper

Added `ConcurrentInMemoryBTree.syncThenRead<TResult>(fn)` that:

- Syncs once with the store
- Executes the caller-provided `fn` against the local `InMemoryBTree` within the same exclusive lock
- Returns the callback's result

This allows read-heavy workloads to amortize sync cost across many reads. The method works in both `'strong'` and `'local'` read modes (it always syncs regardless of `readMode`).

The callback receives the internal tree directly. Callers must not mutate the tree within the callback; this contract is documented but not enforced at the type level to avoid introducing a separate read-only interface wrapper.

### 2. `deleteRebalancePolicy` config option

Added `deleteRebalancePolicy: 'standard' | 'lazy'` to `InMemoryBTreeConfig`:

- `'standard'` (default): Existing behavior; rebalance triggers at `minLeafEntries`.
- `'lazy'`: Rebalance triggers at `Math.max(1, Math.ceil(minLeafEntries / 4))` for leaf nodes during delete operations. Branch rebalancing continues to use the standard threshold.

The lazy threshold is centralized in `leafRebalanceThreshold()` (exported from `rebalance.ts`) and used by both `rebalanceAfterLeafRemoval` and `deleteRange`'s `spliceLeafAndRebalance`.

`assertInvariants()` accepts the relaxed threshold when `deleteRebalancePolicy` is `'lazy'`.

The policy is:

- Stored in `BTreeState` and preserved through `clone()` and `toJSON()`/`fromJSON()`.
- Omitted from `BTreeJSON.config` when `'standard'` (backward-compatible with existing serialized data).
- Not included in the concurrent config fingerprint, since it is a per-instance optimization that does not affect logical data consistency.

## Consequences

### API surface

- New method: `ConcurrentInMemoryBTree.syncThenRead<TResult>(fn: (tree: InMemoryBTree) => TResult): Promise<TResult>`
- New config option: `InMemoryBTreeConfig.deleteRebalancePolicy?: 'standard' | 'lazy'`
- New exported type: `DeleteRebalancePolicy`

### Benchmark additions

- Concurrent section: `get-local` (readMode local + explicit sync) and `syncThenRead` (batched reads via syncThenRead)
- Variant section: `as-lazy` config variant (autoScale + lazy delete rebalance) with `delete-range` benchmarks for comparison

### Spec

Updated spec version 2.27 to 2.28:

- Added `syncThenRead` to sections 6.2 and 6.3
- Added `deleteRebalancePolicy` to section 4.1
- Added `DeleteRebalancePolicy` type to section 2 canonical exports

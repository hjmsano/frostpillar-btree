# ADR 0021: Concurrent read modes and performance optimizations

- Status: Accepted
- Date: 2026-03-26

## Context

A performance review identified several optimization opportunities across the library. The most impactful is an architectural issue in `ConcurrentInMemoryBTree`: every read operation (`get`, `hasKey`, `range`, etc.) is fully serialized through a single promise queue and always calls `store.getLogEntriesSince()` before returning. This causes:

1. **Head-of-line blocking**: reads queue behind writes and other reads.
2. **Per-read sync overhead**: every read incurs an async round-trip to the store, even when the store has not changed.

Additional hot-path inefficiencies were found in the core B+ tree:

3. **`range()` boundary handling**: non-boundary leaves are scanned entry-by-entry instead of bulk-copied. Boundary leaves use linear scan instead of binary search.
4. **`bulkLoad` intermediate arrays**: `chunkWithMinOccupancy` slices a flat intermediate array, doubling peak memory.
5. **Pre-allocation gaps**: `snapshot()`, `walkLeafEntries`, `fromJSON`, and `putMany` grow arrays via `push()` without pre-allocating from known sizes.
6. **`deleteRange` splice cost**: repeated small-range deletes use `Array.splice` instead of `copyWithin`.
7. **`clone()` intermediate objects**: `collectEntryPairs` creates `{ key, value }` wrapper objects only to feed them into `putMany`.

## Decision

### P1: Configurable read mode for `ConcurrentInMemoryBTree`

Introduce a `readMode` configuration option with two values:

- **`strong`** (default): current behavior. Every read syncs before returning. Guarantees linearizable reads.
- **`local`**: reads execute against the local in-memory tree without syncing. Reads still serialize through the operation queue to prevent read/write interleaving on the local tree, but skip the `store.getLogEntriesSince()` call.

Rationale for Option B (read modes) over alternatives:

- **vs. staleness window (time-based)**: time-based staleness is hard to reason about and unpredictable under variable load.
- **vs. version-aware sync skip**: still requires an async round-trip (`getLatestVersion()`), and forces a new method on the store contract (breaking change).
- **vs. reader-writer queue separation**: significantly more complex (~40-60 lines) for a benefit that only materializes under concurrent read pressure.

The `local` mode does not change the store interface and is a ~20-line change. Callers who need freshness continue using `strong` (the default). Callers in read-heavy workloads opt into `local` and call `sync()` explicitly when they need to catch up.

### P2-a: `range()` fast-path and binary boundary

Mirror the bulk-copy fast-path already present in `countRangeEntries`: when the last entry in a non-boundary leaf is within range, push all remaining entries without per-entry comparison. For the boundary leaf, use `upperBoundInLeaf` / `lowerBoundInLeaf` to find the end position via binary search instead of linear scan.

### P2-b: `bulkLoad` single-pass construction

Build leaf entry chunks directly during the entry loop instead of creating a flat intermediate array and slicing it. This eliminates the intermediate array and all `slice()` copies.

### P3-a: Pre-allocation in snapshot, serialization, and fromJSON

Pre-allocate result arrays using `new Array(state.entryCount)` or `new Array(json.entries.length)` and fill by index instead of `push()`.

### P3-b: `putMany` pre-allocation

Pre-allocate the `ids` array with `new Array<EntryId>(entries.length)` and assign by index.

### P3-c: `deleteRange` copyWithin optimization

Replace `Array.splice` in `spliceLeafAndRebalance` with `copyWithin` + length truncation, consistent with the `leafRemoveAt` strategy.

### P3-d: `clone()` direct bulk-load

Replace `collectEntryPairs` + `putMany` with a direct leaf-chain traversal that feeds entries into `bulkLoad` without intermediate `{ key, value }` wrapper objects.

## Consequences

- `ConcurrentInMemoryBTreeConfig` gains an optional `readMode` field. Default (`strong`) preserves backward compatibility.
- `local` mode trades freshness for throughput. Callers must call `sync()` explicitly to catch up.
- The store interface (`SharedTreeStore`) is unchanged.
- `range()` on large ranges eliminates ~(N - 2 boundary leaves) * leafSize unnecessary comparisons.
- `bulkLoad` peak memory is halved for large loads.
- Pre-allocations reduce GC pressure from array resizing.
- `clone()` eliminates N intermediate object allocations.
- Spec updated to version 2.23 with read mode semantics and performance requirements.

# ADR 0023: deleteRange and range performance optimizations

- Status: Accepted
- Date: 2026-04-08

## Context

Benchmark profiling (`pnpm bench`) identified two hot paths as optimization targets:

1. **`deleteRange`** (`2580 ns/op` at N=65536): the `findRemoveEnd` helper used a linear scan to locate the end position within each leaf, making wide-range deletes O(K) per leaf instead of O(log L).
2. **`range` / `select-window`** (`1090 ns/op` at N=65536): `InMemoryBTree.range()` collected internal entries via `rangeQueryEntries` then applied a separate `.map(toPublicEntry)` pass, doubling the allocation and iteration cost for large result sets.

Additionally, no streaming API existed for range iteration, forcing callers to materialize the full result array even when only per-entry processing was needed.

## Decision

### 1. deleteRange: binary search + whole-leaf fast-path

Replaced the linear `findRemoveEnd` scan with:

- **Whole-leaf fast-path**: when the last entry in the current leaf is within the deletion range, all entries from the current index to the end of the leaf are removed without per-entry comparator calls.
- **Binary search boundary**: for boundary leaves (where the range ends mid-leaf), `lowerBoundInLeaf` / `upperBoundInLeaf` locates the end position in O(log L) instead of O(L).

### 2. range: single-pass public entry copy

Added `rangeQueryPublicEntries` which integrates `toPublicEntry` inline during collection, eliminating the second `.map()` pass. `InMemoryBTree.range()` now calls this function directly.

The original `rangeQueryEntries` and its `appendLeafSlice` helper were removed as dead code since no internal or external callers remained.

### 3. forEachRange streaming API

Added `forEachRange(startKey, endKey, callback, options?)` to both `InMemoryBTree` and `ConcurrentInMemoryBTree`. This iterates over entries in the specified range without materializing a result array, using the same cursor and fast-path logic as the range query.

## Consequences

### Performance

At N=65536 (default config):

| Metric          | Before (ns/op) | After (ns/op) | Change     |
| --------------- | -------------- | ------------- | ---------- |
| `delete-range`  | 1886           | 1817          | -3.6%      |
| `select-window` | 983            | 585           | **-40.5%** |
| `select-point`  | 216            | 203           | -6.3%      |

The `select-window` improvement is the most significant, driven by eliminating the `.map()` pass.

### API surface

- New method: `InMemoryBTree.forEachRange(startKey, endKey, callback, options?): void`
- New method: `ConcurrentInMemoryBTree.forEachRange(startKey, endKey, callback, options?): Promise<void>`

### Spec

Updated spec version 2.26 → 2.27:

- Added `forEachRange` to sections 4.2, 4.3, 6.2, and 7
- Added `deleteRangeEntries` binary search requirement to section 7.1
- Added `range()` single-pass copy requirement to section 7.1

# ADR 0025: leafInsertAt splice elimination and bulk iteration zero-copy

- Status: Accepted
- Date: 2026-04-08

## Context

Benchmark profiling identified two further optimization targets:

1. **`leafInsertAt` splice fallback** (`put` hot path): when the `entryOffset` gap was unavailable or the insertion point was in the second half, `leafInsertAt` fell back to `Array.splice()`. V8 may reallocate the backing store on each `splice(index, 0, item)` call, adding overhead to every `put` that takes the fallback path.

2. **`toPublicEntry` in bulk iteration** (`entries`, `entriesReversed`, `forEach`, `forEachRange`, `snapshot`): each call created a `{ entryId, key, value }` shallow copy. For N-entry traversals, this produced N unnecessary object allocations. The copies existed to prevent callers from holding mutable references to internal `LeafEntry` objects, which `updateEntryById` previously mutated in place.

## Decision

### 1. Replace splice with push + copyWithin

`leafInsertAt` now uses `push()` to grow the array by one, `copyWithin()` to shift elements right, and direct assignment to place the new entry. When inserting at the end (`phys >= len`), it simplifies to a single `push()`.

### 2. Replace-not-mutate for entry updates

`updateEntryById` now creates a new entry object and replaces it in the leaf array instead of mutating `entry.value` in place. The same pattern was applied to the `put` duplicate-replace path in `putEntryIntoLeaf`. This guarantees that once a `LeafEntry` object is created, its fields are never modified.

### 3. Zero-copy bulk iteration

With the replace-not-mutate invariant in place, bulk iteration operations (`entries`, `entriesReversed`, `forEach`, `forEachRange`, `snapshot`) now return internal entry references directly, eliminating N allocations per traversal.

Single-entry APIs (`peekFirst`, `findFirst`, `range`, etc.) continue to return shallow copies via `toPublicEntry`, as required by the spec.

### 4. Deduplicate traversal helpers

`snapshotEntries` (public API, frozen entries) and `collectInternalEntries` (internal use, unfrozen entries for clone) remain as separate functions. `snapshotEntries` applies `freezeEntry` for safe external exposure, while `collectInternalEntries` returns raw internal references for internal operations like `clone()` that need unfrozen entries for `putMany`.

## Consequences

### Performance

At N=65536 (default config):

| Metric          | Before (ns/op) | After (ns/op) | Change     |
| --------------- | -------------- | ------------- | ---------- |
| `entries`       | 19.64          | 16.04         | **-18.3%** |
| `entries-rev`   | 19.28          | 16.14         | **-16.3%** |
| `clone`         | 16.09          | 13.82         | **-14.1%** |
| `select-window` | 585            | 546           | **-6.7%**  |
| `put`           | 784            | 785           | ~0%        |
| `delete-range`  | 1817           | 1816          | ~0%        |

No regressions observed.

### Spec

Updated spec version 2.28 to 2.29:

- Section 7.1: `leafInsertAt` must use `push` + `copyWithin` instead of `splice` for second-half inserts
- Section 7.1: `updateEntryById` must replace the entry object, not mutate in place
- Section 7.1: bulk iteration operations MAY return internal entry references directly

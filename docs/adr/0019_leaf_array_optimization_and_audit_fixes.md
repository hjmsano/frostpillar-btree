# ADR 0019: Leaf array optimization and audit fixes

- Status: Accepted
- Date: 2026-03-25

## Context

A comprehensive audit of the codebase identified performance bottlenecks, a minor bug, documentation gaps, and test coverage holes. The audit found the library is genuinely lightweight (about 6.0 KiB gzip core) and well-structured after prior optimizations (ADR 0014, 0015), but several targeted improvements remained.

Key findings:

1. **Leaf `Array.splice` overhead**: Every single-element insert and remove in leaf nodes used `Array.splice`, which shifts all subsequent elements — O(leafSize) per operation. With leaf sizes of 32-512, this is the dominant bottleneck.
2. **`computeAutoScaleTier` allocation**: Returned a new `{ maxLeaf, maxBranch }` wrapper on every call, invoked on every insert via `maybeAutoScale`.
3. **`countRangeEntries` callback overhead**: Delegated to `walkRange` with a closure, adding per-entry function call cost.
4. **`clear()` sequence creep**: `nextSequence` was not reset, meaning sequences crept toward `MAX_SAFE_INTEGER` across insert/clear cycles.
5. **Documentation gaps**: `autoScale` tier thresholds undocumented; README missing some API methods.
6. **Test gaps**: Error prototype chain, autoScale tier boundaries, bulk load overflow, and concurrency version semantics lacked explicit tests.

## Decision

### Phase 1: Quick wins

- **P3 fix**: `computeAutoScaleTier` returns the frozen tier object directly instead of allocating a wrapper. Return type narrowed to `{ readonly maxLeaf: number; readonly maxBranch: number }`.
- **B1 fix**: `clear()` resets `nextSequence` to 0. Spec updated to mandate this.
- **D1-D2 fix**: README.md and README-JA.md updated with autoScale tier threshold tables.

### Phase 2: Leaf array optimizations

- **`leafRemoveAt`**: New helper that shifts the smaller side of the logical entry array. If the removed index is in the first half, shifts left entries right by 1 using `copyWithin` and increments `entryOffset` (with amortized compaction). If in the second half, shifts right entries left. Halves average remove cost.
- **`leafInsertAt`**: New helper that exploits the `entryOffset` gap. If inserting in the first half and gap space exists, shifts left entries left via `copyWithin` and fills the gap. Otherwise falls back to `splice`. Avoids shifting when gap is available.
- **Inlined `countRangeEntries`**: Walks the leaf chain directly with a counter instead of delegating to `walkRange` with a callback. `walkRange` remains for `rangeQueryEntries`.

### Phase 3: Test hardening

- **Error prototype chain tests**: Verify `instanceof`, `.name`, `.message`, `.stack` for all 3 error classes, plus mutual exclusion.
- **AutoScale tier boundary tests**: Exact boundary transitions at 999/1000, 9999/10000 entries; verify no downscale on removal; verify `clear()` resets tier.
- **Bulk load overflow tests**: `putMany` near `MAX_SAFE_INTEGER` boundary; sequential fallback on non-empty tree; `clear()` sequence reset enables re-bulk-load.

Concurrency version semantic tests were confirmed already covered by existing `storeContract.test.ts`.

### Phase 4: Structural unification and remaining fixes

- **S4: Zero-allocation reads** — Unified internal `LeafEntry` with public `BTreeEntry` by renaming internal fields (`userKey` → `key`, `sequence` → `entryId`). `LeafEntry` is now a type alias for `BTreeEntry`. Read operations (`peekFirst`, `peekLast`, `findFirst`, `getPairOrNextLower`, `entries`, `entriesReversed`, `range`) return stored entry references directly. `NodeKey.userKey` renamed to `NodeKey.key` for consistency. `compareNodeKeys` in integrity helpers changed to accept scalar parameters instead of `NodeKey` objects.
- **B2: deleteRange loop guard** — Added tree-height-based iteration bound to the rebalance loop in `spliceLeafAndRebalance`.
- **B3: Error prototype chain** — Added `Object.setPrototypeOf(this, new.target.prototype)` to all three error class constructors for correct `instanceof` behavior.
- **Max-lines fix** — Extracted constructor logic to `createInitialState` in types.ts, reducing InMemoryBTree.ts from 323 to 274 lines.

### Phase 5: Cursor-based putMany for non-empty trees

- **P5: Cursor-hint leaf scanning** — `putEntry` refactored into `findLeafForKey` + `putEntryIntoLeaf` (pure extraction, no logic change). New `findLeafFromHint` scans forward through the leaf chain with a `log2(entryCount)` scan budget, falling back to root descent when budget exhausted. `putManyEntries` for non-empty trees uses the cursor to achieve O(1) amortized leaf lookup per entry instead of O(log M).
- Acceptance tests verify batch-vs-single-put equivalence (EntryId + snapshot), cross-split batches, sparse batches (budget fallback), and duplicate-key handling per policy.

## Consequences

- Put and remove operations shift fewer array elements on average (up to 2x improvement for mid-leaf operations).
- Read operations allocate zero wrapper objects — stored entries are returned directly.
- `putMany` on non-empty trees avoids redundant root-to-leaf descents for sorted input (up to 17x fewer comparisons for large batches).
- `maybeAutoScale` path eliminates one object allocation per put.
- `count()` avoids per-entry function call overhead for large ranges.
- `clear()` guarantees fresh `EntryId` numbering, preventing theoretical sequence overflow after many cycles.
- `deleteRange` rebalance loop bounded by tree height.
- Error `instanceof` checks work correctly even under ES5 transpilation.
- Test count increased from 339 to 381, covering all identified gaps including cursor-hint acceptance tests.
- Spec updated to version 2.20 documenting all optimization requirements.
- Breaking change: internal `LeafEntry` fields renamed. External `BTreeEntry` interface unchanged.

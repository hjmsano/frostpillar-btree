# Spec: B+ Tree Library Contract

Status: Active
Version: 2.26
Last Updated: 2026-04-08

## 1. Scope

This document defines the normative behavior for the exported library surface in `src/`.

In scope:

- standalone in-memory B+ tree behavior (`InMemoryBTree`)
- shared-store coordination behavior (`ConcurrentInMemoryBTree`)
- comparator requirements
- mutation/read semantics
- structural integrity requirements
- benchmark and complexity guardrails

Out of scope:

- distributed consensus across multiple machines
- persistence implementation details of `SharedTreeStore`

## 2. Canonical API Surface (`src/index.ts`)

The package MUST expose named exports for:

- `InMemoryBTree`
- `ConcurrentInMemoryBTree`
- `BTreeConcurrencyError`
- `BTreeInvariantError`
- `BTreeValidationError`
- `type BTreeEntry`
- `type BTreeStats`
- `type EntryId`
- `type InMemoryBTreeConfig`
- `type BTreeMutation`
- `type ConcurrentInMemoryBTreeConfig`
- `type SharedTreeLog`
- `type SharedTreeStore`
- `type DuplicateKeyPolicy`
- `type KeyComparator`
- `type RangeBounds`
- `type BTreeJSON`
- `type ReadMode`

The package MUST expose a `./core` subpath (`frostpillar-btree/core`) that exports single-process APIs without the concurrent coordinator surface:

- `InMemoryBTree`
- `BTreeValidationError`
- `BTreeInvariantError`
- `type BTreeEntry`
- `type BTreeJSON`
- `type BTreeStats`
- `type DuplicateKeyPolicy`
- `type EntryId`
- `type InMemoryBTreeConfig`
- `type RangeBounds`
- `type KeyComparator`

The repository build contract MUST produce two browser bundles:

- `dist/frostpillar-btree.min.js` built from `src/index.ts` (full API, including concurrency surface)
- `dist/frostpillar-btree-core.min.js` built from `src/InMemoryBTree.ts` (single-process core API only)

## 3. Comparator Contract

`compareKeys(left, right)` MUST:

- return `< 0` when `left` is smaller than `right`
- return `0` when keys are equal
- return `> 0` when `left` is larger than `right`
- return a finite number only (`NaN`, `Infinity`, and `-Infinity` are invalid)
- satisfy reflexivity (`compare(x, x) === 0`)
- satisfy transitivity for observed key triples

Reflexivity/transitivity requirements are enforced by `assertInvariants()`, not on every mutation or read operation.

Comparator violations MUST throw:

- `BTreeInvariantError` when detected through `assertInvariants()` (including comparator finiteness/reflexivity/transitivity checks).

Regular mutation/read paths MUST NOT perform eager comparator finiteness validation.

## 4. `InMemoryBTree` Contract

### 4.1 Constructor

- `compareKeys` is required.
- `compareKeys` MUST be a function at runtime. Non-function values MUST throw `BTreeValidationError`.
- `maxLeafEntries` defaults to `64`.
- `maxBranchChildren` defaults to `64`.
- `maxLeafEntries` and `maxBranchChildren` MUST be integers `>= 3` and `<= 16384`.
- `duplicateKeys` defaults to `'replace'`. See [section 4.5](#45-key-uniqueness-policy).
- `enableEntryIdLookup` defaults to `false`. When `false`, the internal entry-ID lookup map is not maintained, reducing memory usage. `removeById`, `peekById`, and `updateById` MUST throw `BTreeValidationError` if called when lookup is disabled.
- `autoScale` defaults to `false`.
- When `autoScale` is `true`, constructor capacity MUST be derived from tier 0 (`maxLeafEntries=32`, `maxBranchChildren=32`) and MAY scale up as `entryCount` grows.
- `autoScale` MUST NOT be combined with explicit `maxLeafEntries` or `maxBranchChildren`; constructor MUST throw `BTreeValidationError` if both are provided.

### 4.2 Operations

- `put(key, value): EntryId`
- `putMany(entries): EntryId[]`
- `remove(key): { entryId, key, value } | null`
- `removeById(entryId): { entryId, key, value } | null`
- `peekById(entryId): { entryId, key, value } | null`
- `updateById(entryId, value): { entryId, key, value } | null`
- `popFirst(): { entryId, key, value } | null`
- `peekFirst(): { entryId, key, value } | null`
- `popLast(): { entryId, key, value } | null`
- `peekLast(): { entryId, key, value } | null`
- `get(key): TValue | null`
- `hasKey(key): boolean`
- `findFirst(key): { entryId, key, value } | null`
- `findLast(key): { entryId, key, value } | null`
- `nextHigherKey(key): TKey | null`
- `nextLowerKey(key): TKey | null`
- `getPairOrNextLower(key): { entryId, key, value } | null`
- `count(startKey, endKey, options?): number`
- `deleteRange(startKey, endKey, options?): number`
- `range(startKey, endKey, options?): Array<{ entryId, key, value }>`
- `entries(): IterableIterator<{ entryId, key, value }>`
- `entriesReversed(): IterableIterator<{ entryId, key, value }>`
- `keys(): IterableIterator<TKey>`
- `values(): IterableIterator<TValue>`
- `[Symbol.iterator](): IterableIterator<{ entryId, key, value }>`
- `forEach(callback, thisArg?): void`
- `snapshot(): Array<{ entryId, key, value }>`
- `clear(): void`
- `clone(): InMemoryBTree<TKey, TValue>`
- `toJSON(): BTreeJSON<TKey, TValue>`
- `static fromJSON(json, compareKeys): InMemoryBTree<TKey, TValue>`
- `size(): number`
- `getStats(): { height, leafCount, branchCount, entryCount }`
- `assertInvariants(): void`

`getStats()` and `assertInvariants()` are always available on `InMemoryBTree` instances without any additional imports.

### 4.3 Ordering and Read Semantics

- Entries MUST be ordered by comparator.
- When `duplicateKeys` is `'allow'`, equal keys MUST preserve insertion order.
- `range(start, end)` MUST be inclusive on both bounds by default.
- `range(start, end, options?)` accepts an optional `RangeBounds` parameter with `lowerBound` and `upperBound` fields, each `'inclusive'` (default) or `'exclusive'`.
- `range(start, end)` MUST return `[]` for empty tree.
- `range(start, end)` MUST return `[]` when `start > end`.
- When both bounds are exclusive and `start === end` (comparator returns 0), `range` MUST return `[]`.
- When `duplicateKeys` is `'allow'`, `range(key, key)` MUST return all equal-key entries in insertion order (with default inclusive bounds).
- `count(startKey, endKey, options?)` MUST return the number of entries in the specified range without allocating a result array.
- `count(startKey, endKey, options?)` MUST follow the same bound semantics as `range`: inclusive by default, configurable via `RangeBounds`.
- `count(startKey, endKey)` MUST return `0` for empty tree.
- `count(startKey, endKey)` MUST return `0` when `startKey > endKey`.
- When both bounds are exclusive and `startKey === endKey` (comparator returns 0), `count` MUST return `0`.
- `get(key)` MUST return the value of the first matching key entry, or `null` when the key is missing.
- `hasKey(key)` MUST return `true` when at least one entry exists for `key`, otherwise `false`.
- `findFirst(key)` MUST return the first (earliest inserted) entry matching `key`, or `null` when no match exists.
- `findFirst(key)` MUST return `null` for empty tree.
- `findLast(key)` MUST return the last (most recently inserted) entry matching `key`, or `null` when no match exists.
- `findLast(key)` MUST return `null` for empty tree.
- When `duplicateKeys` is `'reject'` or `'replace'`, `findFirst(key)` and `findLast(key)` MUST return the same entry.
- `nextHigherKey(key)` MUST return the smallest key strictly greater than `key` according to the comparator, or `null` when no such key exists.
- `nextHigherKey(key)` MUST return `null` for empty tree.
- When `duplicateKeys` is `'allow'` and multiple entries share the same key, `nextHigherKey` MUST skip all entries with equal key and return the next distinct key.
- `nextLowerKey(key)` MUST return the largest key strictly less than `key` according to the comparator, or `null` when no such key exists.
- `nextLowerKey(key)` MUST return `null` for empty tree.
- When `duplicateKeys` is `'allow'` and multiple entries share the same key, `nextLowerKey` MUST skip all entries with equal key and return the previous distinct key.
- `getPairOrNextLower(key)` MUST return the first entry with an exact key match, or the entry with the largest key strictly less than `key`, or `null` when no such entry exists.
- `getPairOrNextLower(key)` MUST return `null` for empty tree.
- When `duplicateKeys` is `'allow'` and an exact match exists, `getPairOrNextLower` MUST return the first (earliest inserted) entry with that key.
- `snapshot()` MUST return all entries in order.
- `snapshot()` MUST return `[]` for empty tree.
- `peekLast()` MUST return the largest key entry without removing it; empty tree returns `null`.
- `entries()`, `keys()`, `values()`, and `[Symbol.iterator]()` MUST iterate in ascending comparator order.
- `entriesReversed()` MUST iterate in descending comparator order.
- When `duplicateKeys` is `'allow'`, `entriesReversed()` MUST visit equal-key entries in reverse insertion order.
- Iteration order for equal keys MUST preserve insertion order when `duplicateKeys` is `'allow'`.
- `forEach` MUST iterate in the same order as `entries()`.
- When the tree is not mutated during traversal, iterators and `forEach` MUST visit each logical entry exactly once.
- If the caller mutates the tree during iterator/`forEach` traversal, inclusion and visitation order of in-flight traversal are implementation-defined.

### 4.4 Mutation Semantics

- `put` MUST return an `EntryId`: the new entry's ID for `'allow'`, and the existing entry's ID for `'replace'` when the key already exists.
- `put` in `'reject'` and `'replace'` modes MUST resolve duplicate detection from the same leaf descent used for insertion position resolution (single-pass duplicate decision; no separate pre-scan).
- `putMany(entries)` MUST accept a `ReadonlyArray<{ key: TKey; value: TValue }>` of entries pre-sorted in ascending order by the tree's comparator.
- `putMany` MUST throw `BTreeValidationError` if the input array is not sorted in non-descending order (when `duplicateKeys` is `'allow'`) or strictly ascending order (when `duplicateKeys` is `'reject'` or `'replace'`).
- `putMany` MUST NOT silently sort unsorted input (no hidden `O(N log N)` fallback).
- `putMany` MUST return an `EntryId[]` of the same length as the input, where each element is the `EntryId` for the corresponding input entry (following the same duplicate key semantics as `put`).
- When the tree is empty, `putMany` MUST construct the tree in `O(N)` via bottom-up bulk load (no per-entry tree traversal).
- When the tree is non-empty, `putMany` MUST produce results identical to calling `put` for each entry in order: same `EntryId` sequence, same duplicate-key resolution, same final tree state observable through the public API. Implementations MAY optimize internal traversal (e.g., cursor hints that scan forward through the leaf chain) as long as observable results are identical.
- `putMany` with an empty input array MUST return `[]` and leave the tree unchanged.
- `remove` MUST remove the first matching key entry; missing key returns `null`.
- `removeById` MUST target the exact logical entry identified by `EntryId`.
- `updateById` MUST target the exact logical entry identified by `EntryId`.
- `updateById` MUST return the post-update `{ entryId, key, value }` when found.
- `popFirst` MUST remove the smallest key entry; empty tree returns `null`.
- `popLast` MUST remove the largest key entry; empty tree returns `null`.
- `deleteRange(startKey, endKey, options?)` MUST delete all entries in the specified range in-place without pre-materializing all entries into an array.
- `deleteRange` MUST return the number of deleted entries.
- `deleteRange` MUST follow the same bound semantics as `range`/`count`: inclusive by default, configurable via `RangeBounds`.
- `deleteRange` MUST return `0` for empty tree.
- `deleteRange` MUST return `0` when `startKey > endKey`.
- When both bounds are exclusive and `startKey === endKey`, `deleteRange` MUST return `0`.
- `deleteRange` MUST maintain tree integrity (leaf-link consistency, node occupancy, ancestor keys) after each individual entry removal.
- When `enableEntryIdLookup` is `true`, `deleteRange` MUST remove all deleted entries from the entry-ID lookup map.
- `clear` MUST reset the tree to an empty state in O(1).
- `clear` MUST NOT reset the internal sequence counter. The counter continues to increase monotonically across `clear` calls, preventing `EntryId` reuse within the lifetime of the instance.
- After `clear`, `size()` MUST be `0`, `snapshot()` MUST be `[]`, `range()` MUST return `[]`, and `peekFirst()` / `peekLast()` / `popFirst()` / `popLast()` MUST return `null`.
- When `enableEntryIdLookup` is `true`, `clear` MUST remove all entry-ID lookup state.

### 4.5 Key Uniqueness Policy

- `duplicateKeys` defaults to `'replace'`.
- Valid values are `'allow'`, `'reject'`, and `'replace'`.
- Invalid values MUST throw `BTreeValidationError`.
- When `'allow'`: multiple entries with the same key MAY coexist; insertion order is preserved among equal keys.
- When `'reject'`: `put` with an existing key MUST throw `BTreeValidationError`.
- When `'replace'` (default): `put` with an existing key MUST overwrite the value of the first matching entry and return its original `EntryId`. The `entryCount` MUST NOT change on replacement.
- `assertInvariants()` MUST verify no duplicate user keys exist when policy is `'reject'` or `'replace'`.

### 4.6 Clone and Serialization

- `clone()` MUST return a new `InMemoryBTree` instance that is structurally independent from the source tree.
- The cloned tree MUST preserve the same `compareKeys`, `maxLeafEntries`, `maxBranchChildren`, `duplicateKeys`, `enableEntryIdLookup`, and `autoScale` configuration.
- When `autoScale` is `true`, `clone()` MUST preserve the source tree's current auto-scaled capacity values (`maxLeafEntries` and `maxBranchChildren`), not reset to tier 0.
- The cloned tree MUST contain the same entries in the same order as the source tree.
- The cloned tree MUST have new `EntryId` values; original `EntryId`s are NOT preserved.
- Mutations on the source tree MUST NOT affect the cloned tree, and vice versa.
- `clone()` on an empty tree MUST return an empty tree.

- `toJSON()` MUST return a `BTreeJSON<TKey, TValue>` object containing:
  - `version`: a numeric format version (currently `1`).
  - `config`: an object with `maxLeafEntries`, `maxBranchChildren`, `duplicateKeys`, `enableEntryIdLookup`, and `autoScale`.
  - `entries`: an array of `[key, value]` tuples in comparator order.
- `toJSON()` on an empty tree MUST return a payload with an empty `entries` array.
- The `toJSON()` return value MUST be serializable via `JSON.stringify` provided keys and values are JSON-serializable.

- `fromJSON(json, compareKeys)` MUST be a static factory method on `InMemoryBTree`.
- `fromJSON` MUST accept a `BTreeJSON<TKey, TValue>` payload and a `KeyComparator<TKey>` function, and return a new `InMemoryBTree<TKey, TValue>`.
- `fromJSON` MUST throw `BTreeValidationError` when `json.version` is not a supported version number.
- `fromJSON` MUST throw `BTreeValidationError` when `json.entries.length` exceeds `1_000_000` (`MAX_SERIALIZED_ENTRIES`).
- `fromJSON` MUST validate that entries are sorted by the provided `compareKeys` before reconstruction. For `duplicateKeys: 'reject'` or `'replace'`, entries MUST be in strictly ascending key order. For `duplicateKeys: 'allow'`, entries MUST be in non-descending key order. Violations MUST throw `BTreeValidationError` with a message that distinguishes unsorted entries from duplicate keys.
- `fromJSON` MUST reconstruct the tree using the config from the payload and the provided comparator.
- When `json.config.autoScale` is `true`, `fromJSON` MUST restore the serialized capacity snapshot (`maxLeafEntries` and `maxBranchChildren`) before bulk insertion, so capacity does not reset to tier 0.
- Round-trip: `fromJSON(tree.toJSON(), compareKeys).snapshot()` MUST produce entries with the same keys and values (in the same order) as `tree.snapshot()`, though `EntryId` values MAY differ.

- `clone` complexity: `O(N)` where `N` is the entry count.
- `toJSON` complexity: `O(N)`.
- `fromJSON` complexity: `O(N)` (via bulk load when applicable).

## 5. Tree Integrity Contract

For non-root nodes:

- leaf occupancy MUST be `>= baseMinLeafEntries` where `baseMinLeafEntries` is derived from constructor-time leaf capacity
- branch occupancy MUST be `>= baseMinBranchChildren` where `baseMinBranchChildren` is derived from constructor-time branch capacity
- no node may exceed current configured maximum capacity (which MAY be higher than the constructor-time value when `autoScale` is enabled)

Minimum occupancy is checked against `baseMin*` (constructor-time values), not the current dynamic `min*` values. This is intentional for `autoScale` compatibility: `autoScale` only increases capacity and does not retroactively rebalance existing nodes, so nodes created at a lower tier may legitimately have fewer entries than the current tier's minimum. Rebalancing uses the dynamic `min*` values to ensure that newly touched nodes meet the current tier's requirements going forward.

Whole-tree invariants:

- all leaves MUST be at the same depth
- branch cached min keys MUST match child minimum keys
- leaf links (`prev`/`next`) MUST be consistent and acyclic
- tracked `entryCount` MUST match traversal count

`assertInvariants()` MUST throw `BTreeInvariantError` on violations.

## 6. `ConcurrentInMemoryBTree` Contract

### 6.1 Shared Store Interface

`SharedTreeStore<TKey, TValue>` MUST provide:

- `getLogEntriesSince(version): Promise<{ version: bigint, mutations: BTreeMutation[] }>`
- `append(expectedVersion, mutations): Promise<{ applied: boolean, version: bigint }>`

`append` version semantics:

- when `applied` is `true`, returned `version` MUST be strictly greater than `expectedVersion`
- when `applied` is `false`, returned `version` MUST NOT be less than `expectedVersion` (i.e. `>= expectedVersion`)

### 6.2 Operations

`ConcurrentInMemoryBTree<TKey, TValue>` MUST provide:

- `put`, `remove`, `removeById`, `peekById`, `updateById`, `popFirst`, `popLast`, `peekFirst`, `peekLast`, `findFirst`, `findLast`, `get`, `hasKey`, `range`, `count`, `nextHigherKey`, `nextLowerKey`, `getPairOrNextLower`, `snapshot`, `size`, `getStats`, `assertInvariants`, `sync`
- `putMany(entries)` — coordinated bulk insert; appends a single `putMany` mutation and applies locally
- `deleteRange(startKey, endKey, options?)` — coordinated range delete; appends a single `deleteRange` mutation and applies locally; returns the count of deleted entries
- `clear()` — coordinated full clear; appends a single `clear` mutation and applies locally
- `entries()` — returns `Promise<BTreeEntry<TKey, TValue>[]>` (materialized in ascending order within the read lock)
- `entriesReversed()` — returns `Promise<BTreeEntry<TKey, TValue>[]>` (materialized in descending order within the read lock)
- `keys()` — returns `Promise<TKey[]>` (materialized in ascending order within the read lock)
- `values()` — returns `Promise<TValue[]>` (materialized in ascending order within the read lock)
- `forEach(cb)` — returns `Promise<void>`; invokes `cb` for each entry in ascending order within the read lock
- `[Symbol.asyncIterator]()` — async iteration over all entries in ascending order via `entries()`
- `clone()` — returns `Promise<InMemoryBTree<TKey, TValue>>`; a non-concurrent, independent copy of the current tree state (synced first in `'strong'` mode)
- `toJSON()` — returns `Promise<BTreeJSON<TKey, TValue>>`
- `static fromJSON(json, compareKeys)` — static factory; returns a local `InMemoryBTree` without store involvement; delegates to `InMemoryBTree.fromJSON`

with async signatures equivalent to the in-memory API for the listed operation subset.

Iteration methods (`entries`, `entriesReversed`, `keys`, `values`, `forEach`) MUST materialize results within the exclusive read lock and return arrays (or invoke callbacks) rather than returning lazy iterators. This ensures the read is atomic with respect to concurrent writes.

`putMany` MUST accept a `ReadonlyArray<{ key: TKey; value: TValue }>` pre-sorted in ascending comparator order and MUST return `Promise<EntryId[]>`.

`deleteRange` MUST return `Promise<number>` (count of deleted entries) and MUST follow the same bound semantics as `range`/`count`.

`clear` MUST return `Promise<void>`.

The `putMany`, `deleteRange`, and `clear` mutation types MUST be validated during `sync` with the same field-presence checks as other mutation types:
- `putMany` requires `entries` (array of `{ key, value }` objects)
- `deleteRange` requires `startKey`, `endKey`, and optional `options`
- `clear` requires no additional fields

### 6.3 Coordination Guarantees

- Mutations MUST run with optimistic retries (`sync -> evaluate -> append`).
- Failed append attempts MUST retry from the latest store version.
- Successful append MUST apply the same mutation locally before returning.
- A coordinator MUST advance local `currentVersion` only after local mutation apply succeeds.
- Mutation append responses with invalid shape/types (`applied` not boolean or `version` not bigint) MUST throw `BTreeConcurrencyError`.
- Mutation append responses that violate shared-store version semantics MUST throw `BTreeConcurrencyError`.
- `readMode` defaults to `'strong'`. Valid values are `'strong'` and `'local'`. Invalid values MUST throw `BTreeConcurrencyError`.
- When `readMode` is `'strong'` (default): reads MUST `sync` before returning (`peekById`, `peekFirst`, `peekLast`, `findFirst`, `findLast`, `get`, `hasKey`, `range`, `count`, `nextHigherKey`, `nextLowerKey`, `getPairOrNextLower`, `snapshot`, `size`, `getStats`, `assertInvariants`, `entries`, `entriesReversed`, `keys`, `values`, `forEach`, `clone`, `toJSON`).
- When `readMode` is `'local'`: reads MUST execute against the local in-memory tree without calling `store.getLogEntriesSince()`. Reads still serialize through the operation queue to prevent read/write interleaving on the local tree.
- In `'local'` mode, callers MUST call `sync()` explicitly to incorporate remote mutations. Between explicit `sync()` calls, reads MAY return stale data.
- A single instance MUST serialize overlapping async operations regardless of read mode.
- Unknown mutation payloads from store MUST throw `BTreeConcurrencyError`.
- During `sync`, the coordinator MUST validate all mutations in the fetched batch before applying any mutation. Validation MUST check both the mutation type and the presence of required fields for each known type (`put` requires `key` and `value`; `remove` requires `key`; `removeById` requires `entryId`; `updateById` requires `entryId` and `value`; `init` requires `configFingerprint`; `putMany` requires `entries`; `deleteRange` requires `startKey` and `endKey`; `clear` requires no additional fields). When an expected config fingerprint is provided, validation MUST also verify that each `init` mutation's `configFingerprint` matches the expected value; a mismatch MUST throw `BTreeConcurrencyError`. If any mutation fails validation, the coordinator MUST throw `BTreeConcurrencyError` without modifying local tree state.
- Retry exhaustion MUST throw `BTreeConcurrencyError`.
- `maxRetries` MUST be an integer `>= 1` and `<= 1024`. Invalid values MUST throw `BTreeConcurrencyError`.
- `maxSyncMutationsPerBatch` defaults to `100_000` and MUST be an integer `>= 1` and `<= 1_000_000`. Invalid values MUST throw `BTreeConcurrencyError`.
- During `sync`, if a fetched mutation batch size exceeds `maxSyncMutationsPerBatch`, the instance MUST throw `BTreeConcurrencyError` before applying any mutation.
- All instances sharing the same store MUST use identical `compareKeys`, `duplicateKeys`, `maxLeafEntries`, `maxBranchChildren`, `enableEntryIdLookup`, and `autoScale` configurations.
- The first write from any instance MUST prepend an `init` mutation carrying a config fingerprint derived from `duplicateKeys`, `maxLeafEntries`, `maxBranchChildren`, `enableEntryIdLookup`, and `autoScale`.
- When an `init` mutation is replayed during sync, the instance MUST compare the fingerprint to its own. A mismatch MUST throw `BTreeConcurrencyError`.
- `init` mutations MUST NOT modify tree state (no-op for the local tree).
- Comparator consistency (`compareKeys`) remains the caller's responsibility; it cannot be serialized into the fingerprint.
- If a mutation throws at runtime during replay (after batch validation succeeds), the coordinator MUST throw `BTreeConcurrencyError` and permanently mark the instance as corrupted. All subsequent operations on a corrupted instance MUST throw `BTreeConcurrencyError`. Callers MUST discard the instance and create a new one to recover.
- Any inner exception raised by tree operations during replay MUST be wrapped and surfaced as `BTreeConcurrencyError`, including the original error's message. `BTreeValidationError` or `BTreeInvariantError` MUST NOT propagate out of `sync`.
- If local application of a mutation throws after the mutation has been successfully appended to the store, the coordinator MUST immediately mark the instance as corrupted and throw `BTreeConcurrencyError` wrapping the original error. The instance MUST NOT allow any subsequent operations (including reads) against the potentially broken tree state.

`put` returns a log-derived `EntryId`; after synchronization, that ID MAY be used across instances backed by the same shared store.

## 7. Complexity and Benchmark Contract

Expected trends:

- `put`: `O(log N)`
- `remove`: `O(log N)`
- `popFirst`: `O(1)` head access + rebalance up to `O(log N)`
- `popLast`: `O(1)` tail access + rebalance up to `O(log N)`
- `peekFirst` / `peekLast`: `O(1)`
- `get`: `O(log N)`
- `findFirst` / `findLast`: `O(log N)`
- `nextHigherKey` / `nextLowerKey` / `getPairOrNextLower`: `O(log N)`
- `count`: `O(log N + K)` where `K` is the number of entries in the range (traversal only, no array allocation)
- `deleteRange`: `O(K log N)` where `K` is the number of deleted entries (iterative find-and-remove with per-entry rebalance)
- `range`: `O(log N + K)` where `K` is result size
- `entries` / `entriesReversed` / `keys` / `values` / `[Symbol.iterator]` / `forEach`: `O(N)` traversal, no mandatory full-snapshot allocation
- `putMany` (empty tree): `O(N)` bulk load
- `putMany` (non-empty tree): `O(N log L + S log(N + M))` amortized where `M` is the existing tree size, `L` is the leaf capacity, and `S` is the number of leaf splits. For dense batches this approaches `O(N log L)`; for sparse batches it degrades gracefully to `O(N log(N + M))` via scan-budget fallback.
- `clone`: `O(N)`
- `toJSON`: `O(N)`
- `fromJSON`: `O(N)` (bulk load when applicable)
- `clear`: `O(1)`
- coordinated operations: base complexity + append/retry overhead

Repository quality gates:

- manual benchmark command: `pnpm bench`
- benchmark MUST NOT run in default quality gates (`pnpm test`, `pnpm check`)
- bundle build scripts MUST provide:
- `pnpm build:bundle` for `dist/frostpillar-btree.min.js`
- `pnpm build:bundle:core` for `dist/frostpillar-btree-core.min.js`
- benchmark output MUST include multi-size normalized indicators for:
- `put`
- `remove`
- `pop-first`
- `head-access`
- `exists-point` (`hasKey`-based point read without result-array allocation)
- `select-point` and `select-window` (`range`-based reads)
- `put-many-empty` and `put-many-populated` (`putMany`-based bulk put compared against repeated `put`)
- benchmark runner MUST reject stale build output and require `dist/index.js` built from current `src/` state

### 7.1 Internal Hot-Path Optimization

Internal navigation functions (`findLeafForKey`, `lowerBoundInLeaf`, `upperBoundInLeaf`) MUST accept key components (`userKey`, `sequence`) as separate scalar parameters rather than wrapped `NodeKey` objects. Binary search loops within these functions MUST inline the composite key comparison (user key first, sequence as tiebreaker) to avoid per-step function call overhead. This requirement applies only to hot-path navigation; cold-path code (rebalancing, integrity validation) MAY continue to use `NodeKey` objects where they are stored in branch node key arrays.

Leaf single-element insert (`leafInsertAt`) and remove (`leafRemoveAt`) MUST shift the smaller side of the logical entry array to minimize data movement. When the `entryOffset` gap is available and the insertion point is in the first half, the insert helper MUST shift the left portion left into the gap instead of splicing the right portion. When removing, if the removed index is in the first half, the helper MUST shift the left portion right and increment `entryOffset` (with amortized compaction). Array `splice` remains acceptable for bulk operations (splits, bulk range deletes).

`countRangeEntries` MUST walk the leaf chain directly without callback indirection, avoiding per-entry function call overhead.

`computeAutoScaleTier` MUST NOT allocate a new object on each call; it MUST return a reference to an existing tier descriptor.

The internal leaf storage type (`LeafEntry`) MUST be structurally identical to the public `BTreeEntry<TKey, TValue>` type (`{ entryId: EntryId; key: TKey; value: TValue }`). Read operations (`peekFirst`, `peekLast`, `findFirst`, `findLast`, `getPairOrNextLower`, `entries`, `entriesReversed`, `range`) MUST return shallow copies via `toPublicEntry` to prevent callers from holding mutable references to internal entries. This ensures that subsequent `updateById` calls do not silently mutate previously returned entry objects.

`deleteRange` rebalance loops MUST include a safety-guard iteration bound (`minLeafEntries + 4`) to prevent theoretical infinite loops. Normal convergence takes at most `minLeafEntries + 2` iterations; the extra margin accounts for unforeseen edge cases.

`rangeQueryEntries` MUST use a bulk-copy fast-path for non-boundary leaves: when the last entry in a leaf is within the query range, all remaining entries in that leaf MUST be pushed without per-entry comparator calls. For boundary leaves, `rangeQueryEntries` MUST use binary search (`upperBoundInLeaf` / `lowerBoundInLeaf`) to locate the end position instead of linear scan.

`bulkLoadEntries` MUST build leaf entry chunks in a single pass without creating a flat intermediate array. The implementation MUST NOT allocate a temporary array of all leaf entries and then slice it into chunks.

`snapshot()`, `walkLeafEntries`, `fromJSON` pair construction, and `putMany` id collection MUST pre-allocate result arrays from known sizes (`state.entryCount`, `json.entries.length`, `entries.length`) instead of growing via `push()`.

`clone()` MUST traverse the source tree's leaf chain directly and feed entries into bulk load without allocating intermediate `{ key, value }` wrapper objects per entry.

Internal navigation helpers (`findFirstMatchingUserKey`, `findLastMatchingUserKey`, `findPairOrNextLower`) MUST reuse a single shared cursor object (`state._cursor`) to avoid per-call allocation. Callers of these helpers MUST extract needed data from the cursor before invoking any other navigation helper, as the cursor is overwritten on each call. This invariant is internal and MUST NOT leak into the public API surface.

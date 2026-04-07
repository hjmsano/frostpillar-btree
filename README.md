# frostpillar-btree

[English/英語](./README.md) | [Japanese/日本語](./README-JA.md)

[![npm version](https://img.shields.io/npm/v/@frostpillar/frostpillar-btree)](https://www.npmjs.com/package/@frostpillar/frostpillar-btree)
[![Node.js >=24](https://img.shields.io/badge/Node.js-%3E%3D24-green.svg)](https://nodejs.org/)
[![CI](https://github.com/hjmsano/frostpillar-btree/actions/workflows/ci.yml/badge.svg)](https://github.com/hjmsano/frostpillar-btree/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

A [B+ tree](https://en.wikipedia.org/wiki/B%2B_tree) is a self-balancing tree data structure that keeps data sorted and supports searches, insertions, and deletions in O(log n) time. Unlike a plain sorted array, it handles frequent inserts and deletes efficiently without re-sorting.

`frostpillar-btree` is a tiny, zero-dependency in-memory B+ tree for TypeScript, Node.js, and browser JavaScript. Use it as a sorted key-value store for task queues, priority lists, leaderboards, or any scenario where you need fast ordered access. It also supports coordinated state across multiple processes via a pluggable shared store.

## Features

- **Zero dependencies** -- no runtime packages required
- **Works everywhere** -- Node.js (ESM and CJS), TypeScript, and browsers (IIFE bundle)
- **Dual browser bundles** -- full API bundle and smaller single-process core bundle
- **Configurable key uniqueness** -- `'replace'` (default, map semantics), `'reject'` (unique constraint), or `'allow'` (multimap)
- **Full TypeScript type safety** -- strict generics with branded `EntryId`
- **Cross-process coordination** -- `ConcurrentInMemoryBTree` provides optimistic concurrency via a pluggable shared store

## Quick Example

```ts
import { InMemoryBTree } from '@frostpillar/frostpillar-btree';

const tree = new InMemoryBTree<number, string>({
  compareKeys: (left: number, right: number): number => left - right,
  enableEntryIdLookup: true,
});

const idTen = tree.put(10, 'ten');
tree.put(20, 'twenty');

console.log(tree.peekById(idTen));
console.log(tree.range(10, 20));
```

---

## Table of Contents

- [Getting Started](#getting-started)
- [User Manual](#user-manual)
  - [InMemoryBTree (Single-Process)](#inmemorybtree-single-process)
  - [ConcurrentInMemoryBTree (Multi-Process)](#concurrentinmemorybtree-multi-process)
  - [Error Handling](#error-handling)
- [API Reference](#api-reference)
  - [InMemoryBTree](#inmemorybtree)
  - [ConcurrentInMemoryBTree](#concurrentinmemorybtree)
  - [Exported Types](#exported-types)
- [How to Contribute](#how-to-contribute)

---

## Getting Started

### Installation (Node.js / TypeScript)

Install:

```bash
npm install @frostpillar/frostpillar-btree
# or
pnpm add @frostpillar/frostpillar-btree
```

If you only need the single-process API, import from the core subpath:

```ts
import { InMemoryBTree } from '@frostpillar/frostpillar-btree/core';
```

#### CommonJS

CommonJS is also supported. Use `require()` as usual:

```js
const { InMemoryBTree } = require('@frostpillar/frostpillar-btree');
// or the core subpath:
const { InMemoryBTree } = require('@frostpillar/frostpillar-btree/core');
```

### Installation (Browser)

A minified IIFE bundle is available on the [GitHub Releases](https://github.com/hjmsano/frostpillar-btree/releases) page. Both bundles target ES2020:

- `frostpillar-btree.min.js` (full API): exposes `window.FrostpillarBTree`
- `frostpillar-btree-core.min.js` (single-process core): exposes `window.FrostpillarBTreeCore`

1. Download the bundle you need from the Releases page.
2. Place it in your static assets directory.
3. Load with a `<script>` tag:

```html
<script src="./frostpillar-btree.min.js"></script>
<!-- or -->
<script src="./frostpillar-btree-core.min.js"></script>
```

After loading, use the matching global:

```js
const { InMemoryBTree } = window.FrostpillarBTree;
// or:
// const { InMemoryBTree } = window.FrostpillarBTreeCore;
```

### Compatibility

| Environment | Requirement                                                       |
| ----------- | ----------------------------------------------------------------- |
| Node.js     | >= 24.0.0 (ESM and CJS)                                           |
| Browser     | ES2020-compatible (Chrome 80+, Firefox 74+, Safari 14+, Edge 80+) |
| TypeScript  | >= 5.0                                                            |

---

## User Manual

> **Error overview:** Operations may throw `BTreeValidationError` (bad comparator or config), `BTreeInvariantError` (corrupted tree structure), or `BTreeConcurrencyError` (concurrent retry exhaustion). See [Error Handling](#error-handling) for details and examples.

### InMemoryBTree (Single-Process)

`InMemoryBTree` is the core class for single-process use. It stores key-value pairs in a B+ tree structure with O(log n) put, remove, and lookup operations.

#### Creating a Tree

You must provide a `compareKeys` function that defines the sort order. It follows the same convention as `Array.prototype.sort`: return negative if `left < right`, positive if `left > right`, and `0` if equal.

**Node.js / TypeScript:**

```ts
import { InMemoryBTree } from '@frostpillar/frostpillar-btree';

const tree = new InMemoryBTree<number, string>({
  compareKeys: (left: number, right: number): number => left - right,
});
```

**Browser:**

```js
const { InMemoryBTree } = window.FrostpillarBTree;

const tree = new InMemoryBTree({
  compareKeys: (left, right) => {
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  },
});
```

You can optionally tune the tree shape with `maxLeafEntries` and `maxBranchChildren` (both default to 64, minimum 3, maximum 16384):

```ts
const tree = new InMemoryBTree<string, number>({
  compareKeys: (a, b) => a.localeCompare(b),
  maxLeafEntries: 128,
  maxBranchChildren: 128,
});
```

#### Inserting Entries

`put()` adds a key-value pair and returns an `EntryId` (a branded `number`). In `'replace'` mode, inserting an existing key returns the original entry's `EntryId`. You can use this ID later to peek, update, or remove the specific entry.

**Node.js / TypeScript:**

```ts
const id1 = tree.put(10, 'ten');
const id2 = tree.put(20, 'twenty');
tree.put(10, 'updated ten'); // default 'replace' mode: overwrites, id1 is preserved
```

**Browser:**

```js
const id1 = tree.put(10, 'ten');
const id2 = tree.put(20, 'twenty');
```

**`putMany(entries)`** -- insert multiple pre-sorted entries at once. When the tree is empty, uses an optimized bulk-load that builds the tree in O(n) instead of O(n log n). Entries must be sorted in ascending key order (strictly ascending when `duplicateKeys` is `'reject'` or `'replace'`):

```ts
const ids = tree.putMany([
  { key: 1, value: 'a' },
  { key: 2, value: 'b' },
  { key: 3, value: 'c' },
]);
```

#### Reading Entries

**`peekById(entryId)`** -- look up a specific entry by its ID without removing it:

```ts
const entry = tree.peekById(id1);
// { entryId: 0, key: 10, value: 'updated ten' } or null if not found
```

**`peekFirst()`** -- get the smallest entry without removing it:

```ts
const first = tree.peekFirst();
// { entryId: ..., key: 10, value: 'ten' } or null if empty
```

**`get(key)`** -- look up the value for a key without allocating a result array:

```ts
const value = tree.get(10); // 'ten' or null if not found
```

**`hasKey(key)`** -- check if at least one entry exists for a key:

```ts
const exists = tree.hasKey(10); // true
```

**`findFirst(key)`** -- find the first entry matching a key. Returns a `BTreeEntry` or `null`:

```ts
const entry = tree.findFirst(10);
// { entryId: ..., key: 10, value: 'ten' } or null
```

**`findLast(key)`** -- find the last (most recently inserted) entry matching a key. Returns a `BTreeEntry` or `null`:

```ts
const entry = tree.findLast(10);
// { entryId: ..., key: 10, value: 'ten' } or null
```

**`peekLast()`** -- get the largest entry without removing it:

```ts
const last = tree.peekLast();
// { entryId: ..., key: 20, value: 'twenty' } or null if empty
```

#### Updating Entries

**`updateById(entryId, newValue)`** -- update the value of an existing entry. The key and position in the tree remain unchanged:

```ts
const updated = tree.updateById(id1, 'TEN');
// { entryId: 0, key: 10, value: 'TEN' } or null if not found
```

#### Removing Entries

**`remove(key)`** -- remove the first matching entry by key:

```ts
const removed = tree.remove(10);
// { entryId: ..., key: 10, value: 'ten' } or null if not found
```

**`removeById(entryId)`** -- remove a specific entry by its ID:

```ts
const removed = tree.removeById(id2);
// { entryId: ..., key: 20, value: 'twenty' } or null if not found
```

**`popFirst()`** -- remove and return the smallest entry (useful for priority queues):

```ts
const first = tree.popFirst();
// { entryId: ..., key: 10, value: 'ten' } or null if empty
```

**`popLast()`** -- remove and return the largest entry:

```ts
const last = tree.popLast();
// { entryId: ..., key: 20, value: 'twenty' } or null if empty
```

**`clear()`** -- remove all entries and reset the tree to its empty state in O(1). The internal sequence counter is **not** reset, so `EntryId` values continue to increase monotonically and are never reused within the lifetime of the instance.

```ts
tree.clear();
tree.size(); // 0
```

**`deleteRange(startKey, endKey, options?)`** -- remove all entries in a range. Follows the same bound semantics as `range`:

```ts
tree.deleteRange(2, 4); // removes keys 2, 3, 4 — returns count of deleted entries
tree.deleteRange(2, 4, { lowerBound: 'exclusive' }); // removes keys 3, 4
```

#### Querying

**`count(startKey, endKey, options?)`** -- count entries in a range without allocating a result array. Follows the same bound semantics as `range`:

```ts
tree.put(1, 'a');
tree.put(2, 'b');
tree.put(3, 'c');
tree.put(4, 'd');

tree.count(2, 3); // 2
tree.count(1, 4, { lowerBound: 'exclusive' }); // 3
tree.count(1, 4, { upperBound: 'exclusive' }); // 3
```

**`range(startKey, endKey, options?)`** -- get all entries between `startKey` and `endKey` (inclusive on both bounds by default):

```ts
tree.put(1, 'a');
tree.put(2, 'b');
tree.put(3, 'c');
tree.put(4, 'd');

const entries = tree.range(2, 3);
// [{ entryId: ..., key: 2, value: 'b' }, { entryId: ..., key: 3, value: 'c' }]
```

You can use `RangeBounds` to control whether each bound is inclusive or exclusive:

```ts
tree.range(2, 4, { lowerBound: 'exclusive' });
// excludes key 2 → [{ key: 3, ... }, { key: 4, ... }]

tree.range(2, 4, { upperBound: 'exclusive' });
// excludes key 4 → [{ key: 2, ... }, { key: 3, ... }]

tree.range(2, 4, { lowerBound: 'exclusive', upperBound: 'exclusive' });
// excludes both → [{ key: 3, ... }]
```

**`nextHigherKey(key)`** -- return the smallest key that is strictly greater than the given key:

```ts
tree.put(10, 'a');
tree.put(20, 'b');
tree.nextHigherKey(10); // 20
tree.nextHigherKey(20); // null
```

**`nextLowerKey(key)`** -- return the largest key that is strictly less than the given key:

```ts
tree.nextLowerKey(20); // 10
tree.nextLowerKey(10); // null
```

**`getPairOrNextLower(key)`** -- return the entry matching the key, or the entry with the largest key strictly less than the given key:

```ts
tree.getPairOrNextLower(15); // { entryId: ..., key: 10, value: 'a' }
tree.getPairOrNextLower(10); // { entryId: ..., key: 10, value: 'a' } (exact match)
```

#### Iterating

**`entries()`** -- lazily iterate all entries in ascending key order without allocating a snapshot array:

```ts
for (const entry of tree.entries()) {
  console.log(entry.key, entry.value);
}
```

**`entriesReversed()`** -- lazily iterate all entries in descending key order:

```ts
for (const entry of tree.entriesReversed()) {
  console.log(entry.key, entry.value); // largest key first
}
```

**`keys()`** / **`values()`** -- iterate keys or values only:

```ts
const allKeys = [...tree.keys()]; // [1, 2, 3]
const allValues = [...tree.values()]; // ['a', 'b', 'c']
```

**`for...of`** -- the tree itself is iterable (delegates to `entries()`):

```ts
for (const entry of tree) {
  console.log(entry.key, entry.value);
}
const asArray = [...tree]; // spread also works
```

**`forEach(callback, thisArg?)`** -- visit each entry in ascending key order:

```ts
tree.forEach((entry) => {
  console.log(entry.key, entry.value);
});
```

**`snapshot()`** -- get all entries in sorted order:

```ts
const all = tree.snapshot();
// [{ entryId, key, value }, ...]
```

**`size()`** -- get the total number of entries:

```ts
const count = tree.size(); // 4
```

#### Diagnostics

**`getStats()`** -- inspect the tree's internal structure:

```ts
const stats = tree.getStats();
// { height: 1, leafCount: 1, branchCount: 0, entryCount: 4 }
```

**`assertInvariants()`** -- verify B+ tree structural integrity. Throws `BTreeInvariantError` if the tree is corrupted. Useful in tests:

```ts
tree.assertInvariants(); // throws if invalid
```

#### Clone and Serialization

**`clone()`** -- create a structurally independent copy. The tree structure (nodes, links, entry IDs) is fully independent, but stored key and value references are shared with the source tree:

```ts
const copy = tree.clone();
copy.put(99, 'new');
tree.hasKey(99); // false — original is unaffected
```

Note: `EntryId` values are reassigned in the clone — IDs from the source tree are not valid for the clone.

**`toJSON()` / `fromJSON()`** -- serialize and reconstruct:

```ts
const json = tree.toJSON();
const restored = InMemoryBTree.fromJSON(json, (a, b) => a - b);
```

#### Key Uniqueness Policy

Control how `put` handles duplicate keys via the `duplicateKeys` option:

```ts
const tree = new InMemoryBTree<number, string>({
  compareKeys: (a, b) => a - b,
  duplicateKeys: 'replace', // default
});
```

| Policy                | Behavior                                                                       | Use case                              |
| --------------------- | ------------------------------------------------------------------------------ | ------------------------------------- |
| `'replace'` (default) | Overwrites the value of the existing entry and returns its original `EntryId`. | Key-value map / dictionary            |
| `'reject'`            | Throws `BTreeValidationError` if the key already exists.                       | Unique index / set                    |
| `'allow'`             | Allows multiple entries with the same key, ordered by insertion time.          | Multimap / event log / priority queue |

#### Behavior Notes

- `range(start, end)` is inclusive on both bounds by default. Pass `RangeBounds` to use exclusive bounds. Returns `[]` when `start > end`.
- `EntryId` is a branded `number` starting at `0`. Since `0` is falsy in JavaScript, avoid `if (entryId)` checks — use `if (entryId !== null)` or `if (entryId !== undefined)` instead.
- Comparator contract checks (including finiteness, reflexivity, and transitivity) are enforced by `assertInvariants()`, not by eager checks on every normal operation.
- `compareKeys` must be a function at runtime. Passing a non-function value throws `BTreeValidationError`.
- `enableEntryIdLookup` defaults to `false`. Set `enableEntryIdLookup: true` only when you need `peekById` / `updateById` / `removeById`.
- `autoScale` defaults to `false`. When `true`, node capacity tiers grow with entry count (32 -> 64 -> 128 -> 256 -> 512 for leaves). autoScale only increases capacity -- it never shrinks.

  | Entry Count | maxLeafEntries | maxBranchChildren |
  | ----------- | -------------- | ----------------- |
  | 0+          | 32             | 32                |
  | 1,000+      | 64             | 64                |
  | 10,000+     | 128            | 128               |
  | 100,000+    | 256            | 128               |
  | 1,000,000+  | 512            | 256               |

- `autoScale` cannot be combined with explicit `maxLeafEntries` or `maxBranchChildren`.
- `fromJSON` rejects payloads with more than `1,000,000` entries.

---

### ConcurrentInMemoryBTree (Multi-Process)

`ConcurrentInMemoryBTree` enables multiple processes or instances to share tree state through a pluggable shared store. It uses optimistic concurrency control: each mutation is appended to the store, and conflicts are resolved by re-syncing and retrying.

#### How It Works

1. Each instance holds a local `InMemoryBTree` as a cache.
2. Before reads, the instance syncs from the shared store.
3. For writes, the instance appends mutations to the store. If a concurrent write occurred, it re-syncs and retries (up to `maxRetries`, default 16).
4. All async operations on a single instance are serialized to prevent double-apply.

#### Implementing SharedTreeStore

`ConcurrentInMemoryBTree` coordinates through a shared store that implements just two methods:

- **`getLogEntriesSince(version)`** -- returns all mutations since a given version, so each instance can catch up.
- **`append(expectedVersion, mutations)`** -- atomically appends mutations if the version matches (compare-and-swap). Returns `{ applied, version }`.

A store that returns historical mutations from `getLogEntriesSince` enables **multi-instance catch-up**: any instance can replay missed mutations to converge on the same state. Stores that do not replay mutations (returning an empty `mutations` array with an updated `version`) are also supported — in this mode, each instance only sees its own local writes and version advancement. Choose the replay strategy that matches your consistency requirements.

The store can be backed by anything: an in-memory array, a database table, a Redis stream, etc. Below is a complete in-memory reference implementation with replay support.

**Node.js / TypeScript:**

```ts
import {
  ConcurrentInMemoryBTree,
  type BTreeMutation,
  type SharedTreeLog,
  type SharedTreeStore,
} from '@frostpillar/frostpillar-btree';

class InMemorySharedStore<TKey, TValue> implements SharedTreeStore<
  TKey,
  TValue
> {
  private versions: {
    version: bigint;
    mutations: BTreeMutation<TKey, TValue>[];
  }[] = [{ version: 0n, mutations: [] }];

  public async getLogEntriesSince(
    version: bigint,
  ): Promise<SharedTreeLog<TKey, TValue>> {
    const latestVersion = this.versions[this.versions.length - 1].version;
    if (version >= latestVersion) {
      return { version: latestVersion, mutations: [] };
    }

    const unseen: BTreeMutation<TKey, TValue>[] = [];
    for (const entry of this.versions) {
      if (entry.version > version) {
        unseen.push(...entry.mutations);
      }
    }

    return {
      version: latestVersion,
      mutations: structuredClone(unseen),
    };
  }

  public async append(
    expectedVersion: bigint,
    mutations: BTreeMutation<TKey, TValue>[],
  ): Promise<{ applied: boolean; version: bigint }> {
    const latestVersion = this.versions[this.versions.length - 1].version;
    if (latestVersion !== expectedVersion) {
      return { applied: false, version: latestVersion };
    }

    const nextVersion = latestVersion + 1n;
    this.versions.push({
      version: nextVersion,
      mutations: structuredClone(mutations),
    });
    return { applied: true, version: nextVersion };
  }
}
```

**Browser:**

```js
const { ConcurrentInMemoryBTree } = window.FrostpillarBTree;

// Implement SharedTreeStore in the same way.
// The interface requires two async methods:
//   getLogEntriesSince(version) => { version, mutations }
//   append(expectedVersion, mutations) => { applied, version }
```

#### Creating Coordinated Instances

```ts
const store = new InMemorySharedStore<number, string>();

const instanceA = new ConcurrentInMemoryBTree<number, string>({
  compareKeys: (left: number, right: number): number => left - right,
  enableEntryIdLookup: true,
  store,
});

const instanceB = new ConcurrentInMemoryBTree<number, string>({
  compareKeys: (left: number, right: number): number => left - right,
  enableEntryIdLookup: true,
  store,
});
```

You can optionally set `maxRetries` (default: 16, minimum: 1, maximum: 1024):

```ts
const instance = new ConcurrentInMemoryBTree<number, string>({
  compareKeys: (a, b) => a - b,
  store,
  maxRetries: 32,
});
```

You can also set `maxSyncMutationsPerBatch` to cap mutations applied during one `sync` (default: `100000`, minimum: `1`, maximum: `1000000`):

```ts
const hardened = new ConcurrentInMemoryBTree<number, string>({
  compareKeys: (a, b) => a - b,
  store,
  maxSyncMutationsPerBatch: 50000,
});
```

#### Using the Concurrent API

All methods are async. Writes coordinate through the store; reads sync before returning (when `readMode` is `'strong'`, the default).

You can set `readMode` to `'local'` to skip sync on reads. In local mode, reads execute against the local tree only and may return stale data. Use explicit `sync()` to catch up:

```ts
const localInstance = new ConcurrentInMemoryBTree<number, string>({
  compareKeys: (a, b) => a - b,
  store,
  readMode: 'local',
});

await localInstance.put(1, 'one');
await localInstance.sync(); // explicitly pull latest state
const value = await localInstance.get(1);
```

```ts
// Instance A inserts
const insertedId = await instanceA.put(100, 'draft docs');

// Instance B can immediately use the same EntryId
const updated = await instanceB.updateById(insertedId, 'publish docs');

// Instance A removes
const removed = await instanceA.removeById(insertedId);

// Instance B syncs and sees the removal
await instanceB.sync();
const rows = await instanceB.snapshot(); // []
```

#### Behavior Notes

- All instances sharing the same store MUST use identical configuration (`compareKeys`, `duplicateKeys`, `maxLeafEntries`, `maxBranchChildren`, `enableEntryIdLookup`, `autoScale`). The first write appends an `init` mutation with a config fingerprint; other instances validate against it during sync and throw `BTreeConcurrencyError` on mismatch. Comparator consistency remains the caller's responsibility.
- `EntryId` values are log-derived. When instances share the same store and synchronize, an `EntryId` can be used across instances for `peekById`, `removeById`, and `updateById`.
- A single instance serializes all async operations (`sync`, reads, writes) to prevent local double-apply.
- Cross-process guarantees depend on atomic versioned append behavior in the shared store.
- If a mutation cannot be applied after `maxRetries` attempts, a `BTreeConcurrencyError` is thrown.

---

### Error Handling

`@frostpillar/frostpillar-btree` exports three error classes. All extend `Error`.

#### BTreeValidationError

Thrown when configuration/policy constraints are violated.

**Causes:**

- `maxLeafEntries` or `maxBranchChildren` is not an integer, less than 3, or greater than 16384
- `duplicateKeys` is set to an invalid value
- `put` is called with an existing key when `duplicateKeys` is `'reject'`
- `removeById`, `peekById`, or `updateById` is called when `enableEntryIdLookup` is `false`

```ts
import {
  BTreeValidationError,
  InMemoryBTree,
} from '@frostpillar/frostpillar-btree';

try {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (a, b) => a - b,
    duplicateKeys: 'reject',
  });
  tree.put(1, 'one');
  tree.put(1, 'duplicate'); // throws BTreeValidationError
} catch (error) {
  if (error instanceof BTreeValidationError) {
    console.error('Duplicate key rejected:', error.message);
  }
}
```

#### BTreeInvariantError

Thrown by `assertInvariants()` when the B+ tree's internal structure is inconsistent, including comparator reflexivity/transitivity violations. This indicates a bug in the library, a broken comparator contract, or corruption caused by external manipulation.

```ts
import {
  BTreeInvariantError,
  InMemoryBTree,
} from '@frostpillar/frostpillar-btree';

const tree = new InMemoryBTree<number, string>({
  compareKeys: (a, b) => (a === b ? 1 : a - b),
});
tree.put(1, 'one');

try {
  tree.assertInvariants();
} catch (error) {
  if (error instanceof BTreeInvariantError) {
    console.error('Tree structure is corrupted:', error.message);
  }
}
```

#### BTreeConcurrencyError

Thrown by `ConcurrentInMemoryBTree` when:

- A mutation cannot be applied after `maxRetries` retries due to concurrent updates
- The shared store violates its version contract
- `maxRetries` is set to an invalid value (not an integer >= 1 and <= 1024)
- `maxSyncMutationsPerBatch` is set to an invalid value (not an integer >= 1 and <= 1000000)
- A sync batch exceeds `maxSyncMutationsPerBatch`

```ts
import {
  BTreeConcurrencyError,
  ConcurrentInMemoryBTree,
  type SharedTreeStore,
} from '@frostpillar/frostpillar-btree';

const store: SharedTreeStore<number, string> = {
  async getLogEntriesSince() {
    return { version: 0n, mutations: [] };
  },
  async append() {
    return { applied: true, version: 1n };
  },
};

try {
  new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (a, b) => a - b,
    store,
    maxRetries: 0,
  });
} catch (error) {
  if (error instanceof BTreeConcurrencyError) {
    console.error('Invalid concurrency config:', error.message);
  }
}
```

---

#### Shared Store Security Assumptions

`ConcurrentInMemoryBTree` assumes the shared store is **trusted**. It does not defend against a store that returns maliciously crafted or arbitrarily large mutation payloads.

**Trust boundary:**
- The store is under your control or the control of your application.
- All instances sharing a store must use identical configuration (enforced via config fingerprint on the first write, but only when an `init` mutation is present in the replayed batch).
- Mutations are structurally validated before replay, but semantic correctness (e.g., key type consistency) is the caller's responsibility.

**Hardening recommendations for shared or multi-tenant deployments:**
- Do not expose `append` or `getLogEntriesSince` to untrusted clients without an authorization layer.
- Apply size limits to stored mutation payloads at the store level before they reach `ConcurrentInMemoryBTree`.
- Use `maxSyncMutationsPerBatch` to cap the number of mutations applied per sync call (default: 100,000).
- If a `sync()` throws `BTreeConcurrencyError` due to a replay failure, the instance is permanently poisoned. Discard it and create a new one.

---

## API Reference

### InMemoryBTree

| Method               | Signature                                                                             | Description                                                                             |
| -------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `put`                | `(key: TKey, value: TValue) => EntryId`                                               | Insert a key-value pair. Returns an `EntryId`.                                          |
| `putMany`            | `(entries: readonly { key: TKey; value: TValue }[]) => EntryId[]`                     | Bulk insert pre-sorted entries. O(n) on empty tree; cursor-optimized on non-empty tree. |
| `remove`             | `(key: TKey) => BTreeEntry<TKey, TValue> \| null`                                     | Remove the first matching entry by key.                                                 |
| `removeById`         | `(entryId: EntryId) => BTreeEntry<TKey, TValue> \| null`                              | Remove a specific entry by ID.                                                          |
| `peekById`           | `(entryId: EntryId) => BTreeEntry<TKey, TValue> \| null`                              | Look up an entry by ID without removing it.                                             |
| `updateById`         | `(entryId: EntryId, value: TValue) => BTreeEntry<TKey, TValue> \| null`               | Update the value of an entry by ID.                                                     |
| `popFirst`           | `() => BTreeEntry<TKey, TValue> \| null`                                              | Remove and return the smallest entry.                                                   |
| `popLast`            | `() => BTreeEntry<TKey, TValue> \| null`                                              | Remove and return the largest entry.                                                    |
| `peekFirst`          | `() => BTreeEntry<TKey, TValue> \| null`                                              | Return the smallest entry without removing it.                                          |
| `peekLast`           | `() => BTreeEntry<TKey, TValue> \| null`                                              | Return the largest entry without removing it.                                           |
| `findFirst`          | `(key: TKey) => BTreeEntry<TKey, TValue> \| null`                                     | Return the first entry matching key, or null.                                           |
| `findLast`           | `(key: TKey) => BTreeEntry<TKey, TValue> \| null`                                     | Return the last entry matching key, or null.                                            |
| `get`                | `(key: TKey) => TValue \| null`                                                       | Return the value of the first matching key, or null.                                    |
| `hasKey`             | `(key: TKey) => boolean`                                                              | Check if at least one entry exists for the key.                                         |
| `count`              | `(startKey: TKey, endKey: TKey, options?: RangeBounds) => number`                     | Count entries in range without array allocation. Bounds default to inclusive.           |
| `range`              | `(startKey: TKey, endKey: TKey, options?: RangeBounds) => BTreeEntry<TKey, TValue>[]` | Return entries between startKey and endKey. Bounds default to inclusive.                |
| `nextHigherKey`      | `(key: TKey) => TKey \| null`                                                         | Return the next key strictly greater than key.                                          |
| `nextLowerKey`       | `(key: TKey) => TKey \| null`                                                         | Return the next key strictly less than key.                                             |
| `getPairOrNextLower` | `(key: TKey) => BTreeEntry<TKey, TValue> \| null`                                     | Return exact match or next lower entry.                                                 |
| `deleteRange`        | `(startKey: TKey, endKey: TKey, options?: RangeBounds) => number`                     | Remove entries in range, return count deleted.                                          |
| `entries`            | `() => IterableIterator<BTreeEntry<TKey, TValue>>`                                    | Lazily iterate all entries in ascending key order.                                      |
| `entriesReversed`    | `() => IterableIterator<BTreeEntry<TKey, TValue>>`                                    | Lazily iterate all entries in descending key order.                                     |
| `keys`               | `() => IterableIterator<TKey>`                                                        | Lazily iterate all keys in ascending order.                                             |
| `values`             | `() => IterableIterator<TValue>`                                                      | Lazily iterate all values in ascending key order.                                       |
| `[Symbol.iterator]`  | `() => IterableIterator<BTreeEntry<TKey, TValue>>`                                    | Enables `for...of` and spread. Delegates to `entries()`.                                |
| `forEach`            | `(callback: (entry) => void, thisArg?) => void`                                       | Visit each entry in ascending key order.                                                |
| `snapshot`           | `() => BTreeEntry<TKey, TValue>[]`                                                    | Return all entries in sorted order.                                                     |
| `clear`              | `() => void`                                                                          | Remove all entries and reset to empty state in O(1).                                    |
| `size`               | `() => number`                                                                        | Return the total number of entries.                                                     |
| `getStats`           | `() => BTreeStats`                                                                    | Return structural statistics.                                                           |
| `assertInvariants`   | `() => void`                                                                          | Assert B+ tree structural integrity. Throws if invalid.                                 |
| `clone`              | `() => InMemoryBTree<TKey, TValue>`                                                   | Return a structurally independent copy (shared key/value refs).                         |
| `toJSON`             | `() => BTreeJSON<TKey, TValue>`                                                       | Serialize to a versioned JSON-safe payload.                                             |
| `fromJSON` (static)  | `(json, compareKeys) => InMemoryBTree<TKey, TValue>`                                  | Reconstruct a tree from a `toJSON` payload.                                             |

**Constructor:**

```ts
new InMemoryBTree<TKey, TValue>(config: InMemoryBTreeConfig<TKey>)
```

### ConcurrentInMemoryBTree

Exposes a subset of `InMemoryBTree` methods as async equivalents returning `Promise`. Writes coordinate through the shared store; reads sync before returning when `readMode` is `'strong'` (the default). When `readMode` is `'local'`, reads execute against the local tree without syncing. Methods such as `putMany`, iterators, `clear`, `clone`, `deleteRange`, and `toJSON`/`fromJSON` are not yet available on the concurrent wrapper.

| Method               | Signature                                                                                      | Description                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `sync`               | `() => Promise<void>`                                                                          | Fetch and apply the latest log entries from the shared store. |
| `put`                | `(key: TKey, value: TValue) => Promise<EntryId>`                                               | Insert with optimistic concurrency.                           |
| `remove`             | `(key: TKey) => Promise<BTreeEntry<TKey, TValue> \| null>`                                     | Remove the first matching entry by key.                       |
| `removeById`         | `(entryId: EntryId) => Promise<BTreeEntry<TKey, TValue> \| null>`                              | Remove a specific entry by ID.                                |
| `peekById`           | `(entryId: EntryId) => Promise<BTreeEntry<TKey, TValue> \| null>`                              | Look up an entry by ID (syncs first).                         |
| `updateById`         | `(entryId: EntryId, value: TValue) => Promise<BTreeEntry<TKey, TValue> \| null>`               | Update an entry by ID with optimistic concurrency.            |
| `popFirst`           | `() => Promise<BTreeEntry<TKey, TValue> \| null>`                                              | Remove and return the smallest entry.                         |
| `popLast`            | `() => Promise<BTreeEntry<TKey, TValue> \| null>`                                              | Remove and return the largest entry.                          |
| `peekFirst`          | `() => Promise<BTreeEntry<TKey, TValue> \| null>`                                              | Return the smallest entry (syncs first).                      |
| `peekLast`           | `() => Promise<BTreeEntry<TKey, TValue> \| null>`                                              | Return the largest entry (syncs first).                       |
| `findFirst`          | `(key: TKey) => Promise<BTreeEntry<TKey, TValue> \| null>`                                     | Return the first entry matching key (syncs first).            |
| `findLast`           | `(key: TKey) => Promise<BTreeEntry<TKey, TValue> \| null>`                                     | Return the last entry matching key (syncs first).             |
| `get`                | `(key: TKey) => Promise<TValue \| null>`                                                       | Return value by key (syncs first).                            |
| `hasKey`             | `(key: TKey) => Promise<boolean>`                                                              | Check key existence (syncs first).                            |
| `count`              | `(startKey: TKey, endKey: TKey, options?: RangeBounds) => Promise<number>`                     | Count entries in range (syncs first).                         |
| `range`              | `(startKey: TKey, endKey: TKey, options?: RangeBounds) => Promise<BTreeEntry<TKey, TValue>[]>` | Range query (syncs first).                                    |
| `nextHigherKey`      | `(key: TKey) => Promise<TKey \| null>`                                                         | Next key strictly greater (syncs first).                      |
| `nextLowerKey`       | `(key: TKey) => Promise<TKey \| null>`                                                         | Next key strictly less (syncs first).                         |
| `getPairOrNextLower` | `(key: TKey) => Promise<BTreeEntry<TKey, TValue> \| null>`                                     | Exact match or next lower (syncs first).                      |
| `snapshot`           | `() => Promise<BTreeEntry<TKey, TValue>[]>`                                                    | Return all entries (syncs first).                             |
| `size`               | `() => Promise<number>`                                                                        | Return entry count (syncs first).                             |
| `getStats`           | `() => Promise<BTreeStats>`                                                                    | Return structural statistics (syncs first).                   |
| `assertInvariants`   | `() => Promise<void>`                                                                          | Assert structural integrity (syncs first).                    |

**Constructor:**

```ts
new ConcurrentInMemoryBTree<TKey, TValue>(config: ConcurrentInMemoryBTreeConfig<TKey, TValue>)
```

### Exported Types

| Type                                          | Description                                                                                                                                                                         |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EntryId`                                     | Branded `number` identifying a specific entry.                                                                                                                                      |
| `BTreeEntry<TKey, TValue>`                    | `{ entryId: EntryId; key: TKey; value: TValue }`                                                                                                                                    |
| `BTreeJSON<TKey, TValue>`                     | Versioned JSON-serializable payload produced by `toJSON()` and consumed by `fromJSON()`.                                                                                            |
| `BTreeStats`                                  | `{ height: number; leafCount: number; branchCount: number; entryCount: number }`                                                                                                    |
| `KeyComparator<TKey>`                         | `(left: TKey, right: TKey) => number`                                                                                                                                               |
| `DuplicateKeyPolicy`                          | `'allow' \| 'reject' \| 'replace'`                                                                                                                                                  |
| `RangeBounds`                                 | `{ lowerBound?: 'inclusive' \| 'exclusive'; upperBound?: 'inclusive' \| 'exclusive' }`                                                                                              |
| `InMemoryBTreeConfig<TKey>`                   | `{ compareKeys: KeyComparator<TKey>; maxLeafEntries?: number; maxBranchChildren?: number; duplicateKeys?: DuplicateKeyPolicy; enableEntryIdLookup?: boolean; autoScale?: boolean }` |
| `ReadMode`                                    | `'strong' \| 'local'`                                                                                                                                                               |
| `ConcurrentInMemoryBTreeConfig<TKey, TValue>` | Extends `InMemoryBTreeConfig<TKey>` with `store: SharedTreeStore<TKey, TValue>`, `maxRetries?: number`, `maxSyncMutationsPerBatch?: number`, and `readMode?: ReadMode`.             |
| `SharedTreeStore<TKey, TValue>`               | Interface with `getLogEntriesSince(version)` and `append(expectedVersion, mutations)`.                                                                                              |
| `SharedTreeLog<TKey, TValue>`                 | `{ version: bigint; mutations: BTreeMutation<TKey, TValue>[] }`                                                                                                                     |
| `BTreeMutation<TKey, TValue>`                 | Discriminated union: `init`, `put`, `remove`, `removeById`, `updateById`, `popFirst`, `popLast`.                                                                                    |
| `BTreeValidationError`                        | Error thrown for comparator or config violations.                                                                                                                                   |
| `BTreeInvariantError`                         | Error thrown for tree structural integrity violations.                                                                                                                              |
| `BTreeConcurrencyError`                       | Error thrown for concurrency conflicts or store contract violations.                                                                                                                |

> **Subpath exports:** The `/core` subpath (`@frostpillar/frostpillar-btree/core`) exports only single-process types: `InMemoryBTree`, `EntryId`, `BTreeEntry`, `BTreeJSON`, `BTreeStats`, `KeyComparator`, `DuplicateKeyPolicy`, `RangeBounds`, `InMemoryBTreeConfig`, `BTreeValidationError`, and `BTreeInvariantError`. Concurrency-related exports (`ConcurrentInMemoryBTree`, `ConcurrentInMemoryBTreeConfig`, `ReadMode`, `SharedTreeStore`, `SharedTreeLog`, `BTreeMutation`, `BTreeConcurrencyError`) are available only from the main entry point.

---

## How to Contribute

### Prerequisites

- Node.js >= 24.0.0
- pnpm >= 10.0.0

### Setup

```bash
git clone https://github.com/hjmsano/frostpillar-btree.git
cd frostpillar-btree
pnpm install
```

### Development Commands

| Command                                                         | Description                                          |
| --------------------------------------------------------------- | ---------------------------------------------------- |
| `pnpm build`                                                    | Build ESM, CJS, and type declarations into `dist/`.  |
| `pnpm test`                                                     | Run all tests.                                       |
| `pnpm test tests/inMemoryBTree.test.ts`                         | Run InMemoryBTree tests.                             |
| `pnpm test tests/concurrentInMemoryBTree.test.ts`               | Run ConcurrentInMemoryBTree tests.                   |
| `pnpm test tests/concurrentInMemoryBTree.operations.test.ts`    | Run concurrent operations tests.                     |
| `pnpm test tests/concurrentInMemoryBTree.storeContract.test.ts` | Run store contract tests.                            |
| `pnpm test tests/bundleBuildContract.test.ts`                   | Run bundle build contract tests.                     |
| `pnpm test tests/githubActionsWorkflows.test.ts`                | Run workflow contract tests.                         |
| `pnpm build:bundle`                                             | Build full browser bundle (includes concurrent API). |
| `pnpm build:bundle:core`                                        | Build core browser bundle (InMemoryBTree only).      |
| `pnpm bench`                                                    | Run benchmarks (run `pnpm build` first).             |
| `pnpm check`                                                    | Run typecheck + lint + test + textlint.              |

### Branch and Release Model

- The default branch is `main`.
- Releases are managed by [Release Please](https://github.com/googleapis/release-please) via `.github/workflows/ci-release.yml`.
- Merge conventional-commit PRs into `main`. Release Please opens/updates a version-bump PR against `main`.
- Merging the version-bump PR triggers: GitHub Release creation, browser bundle uploads (`frostpillar-btree.min.js` and `frostpillar-btree-core.min.js`), and npm publish.

### Documentation

- [Docs index](./docs/INDEX.md)
- [Library spec](./docs/specs/01_in-memory-btree.md)
- [Release spec](./docs/specs/02_release-driven-cicd-and-publish.md)

## License

[MIT](./LICENSE)

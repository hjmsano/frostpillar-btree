# Architecture Overview

Status: Active
Last Updated: 2026-03-26

## Layering

1. Public API (`src/index.ts`)
- Exposes `InMemoryBTree` and concurrency abstractions.

2. Core tree model (`src/btree/types.ts`)
- Node/entry/state types, key comparison and capacity validation.

3. Navigation/query (`src/btree/navigation.ts`)
- Branch selection, bounds search, and range traversal.

4. Mutation (`src/btree/mutations.ts`, `src/btree/deleteRange.ts`, `src/btree/bulkLoad.ts`)
- Insert, remove, pop-first, pop-last, update, clear, range deletion, bulk load, and split.

5. Rebalance (`src/btree/rebalance.ts`)
- Merge, redistribute, and post-removal rebalancing.

6. Integrity (`src/btree/integrity.ts`, `src/btree/integrity-helpers.ts`)
- Structural invariant assertions and helper functions.

7. Statistics (`src/btree/stats.ts`)
- Tree stats.

8. Auto-scaling (`src/btree/autoScale.ts`)
- Entry-count-based capacity tier management.

9. Serialization (`src/btree/serialization.ts`)
- `toJSON` / `fromJSON` support.

10. Concurrency coordination (`src/concurrency/*`)
- `ConcurrentInMemoryBTree` optimistic append-log retry loop.
- successful append and local mutation apply are coupled in one internal path.
- shared store contract and retry policy.

## Data model summary

- Leaves store sorted key-value entries.
- Branches store ordered child pointers.
- Leaves are doubly linked for efficient range scanning.
- Root may be a leaf or branch depending on size.

## Concurrency model

- Base `InMemoryBTree` is synchronous and local.
- Non-function comparator config fails fast with typed validation errors.
- Comparator contract checks (finiteness/reflexivity/transitivity) are validated via `assertInvariants()`.
- `ConcurrentInMemoryBTree` provides beyond-single-process safety with optimistic retries.
- `ConcurrentInMemoryBTree` serializes async operations per instance to avoid duplicated local replay during overlapping `sync` and mutation paths.
- `ConcurrentInMemoryBTree` validates append-response version semantics and fails fast on shared-store contract violations.
- Guarantees depend on an atomic shared store (`append` against expected version).

## Performance intent

- Insert/remove/lookup start: expected `O(log N)`.
- Range materialization after start seek: expected `O(K)` for `K` returned entries.
- `popFirst`: expected `O(1)` head access plus up to `O(log N)` rebalance.
- `popLast`: expected `O(1)` tail access plus up to `O(log N)` rebalance.
- `peekFirst` / `peekLast`: expected `O(1)`.
- Coordinated writes: additional shared-store and retry overhead.

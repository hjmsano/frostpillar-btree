# ADR 0016: Prioritize API expansion with performance guardrails

- Status: Accepted
- Date: 2026-03-25

## Context

`InMemoryBTree` currently provides core mutation/query operations (`put/remove/popFirst/peekFirst/findFirst/range/snapshot`) but lacks several expected collection ergonomics and range utilities.

The requested feature set is valuable, but this repository prioritizes:

1. small and fast runtime behavior
2. predictable complexity on hot paths
3. minimal API and implementation overhead

We need a delivery order that maximizes user value while minimizing regression risk.

## Decision

Prioritize by this rule:

1. high value + low risk to hot paths first
2. allocation-reducing traversal APIs before convenience wrappers
3. structural or metadata-heavy changes later

### Priority tiers

| Tier     | Features                                                                                                                                                                                      | Expected perf impact                                                             | Decision                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------- |
| P0       | `get(key)`, `peekLast()`, `popLast()`, `clear()`, iterators (`Symbol.iterator`, `entries()`, `keys()`, `values()`), `forEach()`                                                               | Mostly neutral or positive (less array allocation than `snapshot`/`range`)       | Do first                        |
| P1       | reverse iteration (`entriesReversed()`), half-open/exclusive bounds for range, `count(lo, hi)`, key navigation (`nextHigherKey`, `nextLowerKey`, `getPairOrNextLower`), `deleteRange(lo, hi)` | Moderate risk if implemented with extra scans/rebalance loops                    | Do second with benchmark checks |
| P2       | sorted fast path (`putMany`/`bulkLoad`), `clone()`, serialization (`toJSON`/`fromJSON`)                                                                                                       | Potentially high code size and maintenance cost; perf upside depends on workload | Do third after P0/P1 stabilize  |
| Deferred | `toArray`/`keysArray`/`valuesArray`, `map/filter/reduce`, full ES6 `Map` compatibility, immutable API (`with`/`without`), set ops, rank queries, `freeze`/`unfreeze`                          | Mostly convenience or significant structural lift                                | Re-evaluate later               |

### Notes on specific tradeoffs

- `toArray`/`keysArray`/`valuesArray` are deferred because iterators provide the same capability with lower memory pressure; users can materialize arrays explicitly.
- `map/filter/reduce` are deferred because they are thin wrappers once iterators exist.
- rank queries are deferred because subtree-size augmentation changes core node invariants and rebalance behavior.
- immutable API and full `Map` compatibility are deferred due to broad API and implementation surface expansion.

## Work items

All items follow the repository contract: spec update -> failing tests -> implementation -> verification (`pnpm test`, `pnpm check`, and benchmark review when complexity-sensitive).

1. **WI-01: Spec baseline update for P0 APIs**
   - Update `docs/specs/01_in-memory-btree.md` with method signatures and semantics for `get`, tail-end ops, iterators, `forEach`, `clear`.
   - Define ordering guarantees for forward iteration and mutation behavior guarantees for `clear`.
2. **WI-02: Implement `get(key)`**
   - Add value lookup method returning `TValue | null` (or chosen contract) without forcing `range(key, key)` allocation.
   - Add unit tests for miss/hit/duplicate policy interactions.
3. **WI-03: Implement `peekLast()` and `popLast()`**
   - Use `rightmostLeaf` for O(1) tail read and O(1)+rebalance tail pop.
   - Add split/merge edge-case tests symmetric to `peekFirst/popFirst`.
4. **WI-04: Implement iterator surface**
   - Add `Symbol.iterator`, `entries()`, `keys()`, `values()`, and `forEach()`.
   - Ensure deterministic order and zero mutation of tree state during traversal.
   - Add tests for `for...of`, spread, and iterator exhaustion behavior.
5. **WI-05: Implement `clear()`**
   - O(1) reset to empty leaf root and counters.
   - Ensure `entryKeys` handling respects `enableEntryIdLookup`.
6. **WI-06: Add reverse traversal and range bound options**
   - Introduce `entriesReversed()` and extend `range` with bound options (`[lo, hi]`, `[lo, hi)`, `(lo, hi]`, `(lo, hi)`).
   - Add correctness tests around duplicate keys and boundary equality.
7. **WI-07: Add `count(lo, hi, options?)`**
   - Count entries without array allocation.
   - Add tests for empty, single-key, duplicate-key, and large-window cases.
8. **WI-08: Add `deleteRange(lo, hi, options?)`**
   - Delete range in-place without pre-materializing all entries.
   - Return deleted count.
   - Add stress tests for rebalance and leaf-link consistency.
9. **WI-09: Add key navigation primitives**
   - Add floor/ceiling-style helpers (`nextHigherKey`, `nextLowerKey`, `getPairOrNextLower`).
   - Add tests for no-hit, exact-hit, and duplicate-key behavior.
10. **WI-10: Evaluate and add sorted bulk insert** _(done)_
    - Added `putMany(entries)` accepting pre-sorted `readonly { key, value }[]`.
    - Unsorted input throws `BTreeValidationError` (no hidden sort fallback).
    - Empty tree + `duplicateKeys: 'allow'`: O(N) bottom-up bulk load via `bulkLoad.ts`.
    - Non-empty tree or `reject`/`replace` policy: sequential `put` calls.
    - Benchmark shows bulk load ~2.7x faster than repeated `put` at 65K entries.
    - Spec v2.14, 27 new tests, benchmark entries `put-many-empty` / `put-many-pop`.
11. **WI-11: Add `clone` and serialization** _(done)_
    - Added `clone()` returning a structurally independent deep copy via `putMany` rebuild.
    - Added `toJSON()` producing a versioned `BTreeJSON` payload (version 1) with config metadata and `[key, value]` tuple entries.
    - Added static `fromJSON(json, compareKeys)` factory that validates version, reconstructs config, and rebuilds via `putMany`.
    - Serialization helpers extracted to `src/btree/serialization.ts` for separation of concerns.
    - Spec v2.15, 19 new tests covering clone independence, policy preservation, round-trip through `JSON.stringify/parse`, and error handling.
12. **WI-12: Deferred backlog checkpoint** _(done)_
    - Reassessed all deferred items after P0-P2 shipped and benchmarked.
    - All items remain deferred: none meet promotion criteria (clear user demand + acceptable complexity/runtime impact).
    - Decision recorded in ADR 0017.

## Consequences

- Users get high-value collection ergonomics early without sacrificing current hot-path design goals.
- Allocation-heavy read patterns shift toward iterators, improving memory behavior for traversal-heavy workloads.
- Higher-risk structural features are intentionally delayed until benchmark evidence justifies complexity.

# ADR 0027: Refresh ancestor cached keys when an emptied leaf is refilled

- Status: Accepted
- Date: 2026-07-02

## Context

The lazy delete rebalance policy (ADR 0024) relaxes the leaf rebalance threshold to `Math.max(1, Math.ceil(minLeafEntries / 4))`. When `maxLeafEntries <= 8`, that threshold reaches `1`, so a leaf can legally be drained to zero entries by `remove`, `removeById`, or `popFirst` before rebalancing kicks in. `deleteRange` can empty a leaf wholesale under any policy.

When rebalancing refills such an emptied leaf from its right sibling — either by borrowing one entry or by merging the sibling into the leaf — the leaf acquires a new minimum key. Two paths failed to propagate that new minimum into ancestor branch key caches:

- `tryBorrowFromLeafSibling` (borrow-from-right) updated only the right sibling's cached key.
- `mergeLeafWithSibling` (merge-right-into-leaf) updated no cached keys.

`deleteRange` compensated with a caller-side fix-up after its rebalance loop, but `remove`, `removeById`, and `popFirst` did not. A deterministic sequence of deletes under `deleteRebalancePolicy: 'lazy'` with `maxLeafEntries <= 8` therefore left stale branch cached keys, and `assertInvariants()` threw `Branch cached key does not match actual child minimum key`.

Point and range queries remained correct, because a stale cached key stays a valid lower bound for descent. The defect violated the tree integrity contract (spec section 5), not observable query results.

## Decision

Centralize the refresh in the shared leaf rebalance path instead of patching each calling operation:

- `tryBorrowFromLeafSibling`: when the leaf was empty before the borrow-from-right, call `updateMinKeyInAncestors(leaf)` after appending the borrowed entry.
- `mergeLeafWithSibling`: when the leaf was empty before absorbing its right sibling, call `updateMinKeyInAncestors(leaf)` after the merge, while the leaf's parent index is still valid.
- Remove the now-redundant caller-side fix-up from `deleteRange`'s `spliceLeafAndRebalance`, so a single enforcement point covers `remove`, `removeById`, `popFirst`, and `deleteRange`.

The refresh is keyed on "leaf was empty before refill", so the hot path is untouched and non-empty leaves pay nothing. Borrow-from-left and merge-into-left paths already maintained cached keys and are unchanged. Branch-level rebalancing is unaffected: branches never reach zero children, so their minimums never change through the affected paths.

## Consequences

- `assertInvariants()` passes after any delete sequence under both rebalance policies, including the previously failing lazy-policy configurations (`maxLeafEntries <= 8`).
- One enforcement point in `rebalance.ts` replaces per-caller fix-ups, removing the drift risk between `deleteRange` and the other delete operations.
- Regression tests added in `tests/inMemoryBTree.emptyLeafRebalance.test.ts`: directed drain scenarios for `popFirst`, `remove`, `removeById`, whole-leaf `deleteRange` under both policies, and a deterministic seeded put/remove fuzz that checks `assertInvariants()` and a reference `Map` at every step.
- Spec updated from version 2.30 to 2.31: section 4.1 now states explicitly that refilling an emptied leaf MUST refresh ancestor cached minimum keys inside the shared rebalance path.
- No public API change; patch-level release.

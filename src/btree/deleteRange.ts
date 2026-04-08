import {
  findLeafForKey,
  lowerBoundInLeaf,
  upperBoundInLeaf,
} from './navigation.js';
import { isEmptyRange } from './rangeQuery.js';
import type { RangeBounds } from './types.js';
import {
  leafRebalanceThreshold,
  rebalanceAfterLeafRemoval,
  updateMinKeyInAncestors,
} from './rebalance.js';
import {
  leafEntryAt,
  leafEntryCount,
  type BTreeState,
  type LeafNode,
} from './types.js';

interface DeleteCursor<TKey, TValue> {
  leaf: LeafNode<TKey, TValue>;
  idx: number;
}

const navigateToStart = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  startKey: TKey,
  lowerExclusive: boolean,
): DeleteCursor<TKey, TValue> | null => {
  const startSeq = lowerExclusive ? Number.MAX_SAFE_INTEGER : 0;
  const leaf = findLeafForKey(state, startKey, startSeq);
  const idx = lowerExclusive
    ? upperBoundInLeaf(state, leaf, startKey, Number.MAX_SAFE_INTEGER)
    : lowerBoundInLeaf(state, leaf, startKey, 0);
  if (idx >= leafEntryCount(leaf)) {
    if (leaf.next === null) return null;
    return { leaf: leaf.next, idx: 0 };
  }
  return { leaf, idx };
};

/** Binary search to find the end position within a leaf for range deletion. */
const findRemoveEnd = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  leaf: LeafNode<TKey, TValue>,
  endKey: TKey,
  upperExclusive: boolean,
): number => {
  const count = leafEntryCount(leaf);
  // Whole-leaf fast-path: if the last entry is within range, all entries from idx are in range
  const lastEntry = leafEntryAt(leaf, count - 1);
  const cmpLast = state.compareKeys(lastEntry.key, endKey);
  if (upperExclusive ? cmpLast < 0 : cmpLast <= 0) {
    return count;
  }
  // Boundary leaf: use binary search to find the end position
  const endSeq = upperExclusive ? 0 : Number.MAX_SAFE_INTEGER;
  const endBound = upperExclusive
    ? lowerBoundInLeaf(state, leaf, endKey, endSeq)
    : upperBoundInLeaf(state, leaf, endKey, endSeq);
  return endBound < count ? endBound : count;
};

const spliceLeafAndRebalance = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  leaf: LeafNode<TKey, TValue>,
  idx: number,
  removeCount: number,
): number => {
  if (state.entryKeys !== null) {
    for (let i = idx; i < idx + removeCount; i += 1) {
      state.entryKeys.delete(leafEntryAt(leaf, i).entryId);
    }
  }
  const phys = leaf.entryOffset + idx;
  leaf.entries.copyWithin(phys, phys + removeCount);
  leaf.entries.length -= removeCount;
  state.entryCount -= removeCount;
  const leafEmptied = leafEntryCount(leaf) === 0;
  if (idx === 0 && !leafEmptied && leaf.parent !== null) {
    updateMinKeyInAncestors(leaf);
  }
  const countAfterSplice = leafEntryCount(leaf);
  // Loop until the leaf satisfies minimum occupancy or is merged/detached.
  // Each iteration either borrows one entry (O(1)) or merges (O(entries), then breaks).
  // Safety guard prevents infinite loops from unforeseen bugs; normal convergence
  // takes at most minLeafEntries + 2 iterations.
  const rebalThreshold = leafRebalanceThreshold(state);
  let safetyGuard = state.minLeafEntries + 4;
  while (
    safetyGuard > 0 &&
    leaf !== state.root &&
    leafEntryCount(leaf) < rebalThreshold
  ) {
    rebalanceAfterLeafRemoval(state, leaf);
    if (
      leaf.parent !== null &&
      leaf.parent.children[leaf.indexInParent] !== leaf
    )
      break;
    safetyGuard -= 1;
  }
  if (
    leafEmptied &&
    leafEntryCount(leaf) > 0 &&
    leaf.parent !== null &&
    leaf.parent.children[leaf.indexInParent] === leaf
  ) {
    updateMinKeyInAncestors(leaf);
  }
  return countAfterSplice;
};

const isLeafStillValid = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  leaf: LeafNode<TKey, TValue>,
): boolean =>
  leaf.parent === null
    ? leaf === state.root
    : leaf.parent.children[leaf.indexInParent] === leaf;

export const deleteRangeEntries = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  startKey: TKey,
  endKey: TKey,
  options?: RangeBounds,
): number => {
  if (state.entryCount === 0) return 0;
  if (isEmptyRange(state.compareKeys, startKey, endKey, options)) return 0;
  const lowerExclusive = options?.lowerBound === 'exclusive';
  const upperExclusive = options?.upperBound === 'exclusive';

  let deleted = 0;
  let needsNavigate = true;
  let leaf: LeafNode<TKey, TValue> = null!;
  let idx = 0;

  while (state.entryCount > 0) {
    if (needsNavigate) {
      const cursor = navigateToStart(state, startKey, lowerExclusive);
      if (cursor === null) break;
      leaf = cursor.leaf;
      idx = cursor.idx;
      needsNavigate = false;
    }
    if (idx >= leafEntryCount(leaf)) break;

    const count = leafEntryCount(leaf);
    const removeEnd = findRemoveEnd(state, leaf, endKey, upperExclusive);
    const removeCount = removeEnd - idx;
    if (removeCount === 0) break;

    const countAfterSplice = spliceLeafAndRebalance(
      state,
      leaf,
      idx,
      removeCount,
    );
    deleted += removeCount;

    if (removeEnd < count) break;
    if (!isLeafStillValid(state, leaf)) {
      needsNavigate = true;
      continue;
    }
    if (leafEntryCount(leaf) > countAfterSplice) {
      // Rebalancing grew this leaf (borrowed or merged from a sibling).
      // Entries borrowed from the LEFT sibling may have keys below startKey,
      // so the old index is unreliable.  Re-navigate from the root to find
      // the correct position for the next deletion pass.
      needsNavigate = true;
      continue;
    }
    // Use live leaf.next instead of a cached pointer: rebalancing may have
    // merged the original next sibling into the current leaf, invalidating
    // any pre-rebalance snapshot.
    if (leaf.next === null) break;
    leaf = leaf.next;
    idx = 0;
  }

  return deleted;
};

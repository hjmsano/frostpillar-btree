import {
  findLeafForKey,
  lowerBoundInLeaf,
  upperBoundInLeaf,
} from './navigation.js';
import type { RangeBounds } from './types.js';
import {
  rebalanceAfterLeafRemoval,
  updateMinKeyInAncestors,
} from './rebalance.js';
import {
  isLeafNode,
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

const findRemoveEnd = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  leaf: LeafNode<TKey, TValue>,
  idx: number,
  endKey: TKey,
  upperExclusive: boolean,
): number => {
  const count = leafEntryCount(leaf);
  let removeEnd = idx;
  while (removeEnd < count) {
    const e = leafEntryAt(leaf, removeEnd);
    const cmpEnd = state.compareKeys(e.key, endKey);
    if (upperExclusive ? cmpEnd >= 0 : cmpEnd > 0) break;
    removeEnd += 1;
  }
  return removeEnd;
};

const computeTreeHeight = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
): number => {
  let h = 0;
  let n = state.root;
  while (!isLeafNode(n)) { n = n.children[n.childOffset]; h += 1; }
  return h;
};

const spliceLeafAndRebalance = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  leaf: LeafNode<TKey, TValue>,
  idx: number,
  removeCount: number,
  maxRebalanceDepth: number,
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
  let maxIter = maxRebalanceDepth;
  while (maxIter > 0 && leaf !== state.root && leafEntryCount(leaf) < state.minLeafEntries) {
    rebalanceAfterLeafRemoval(state, leaf);
    if (leaf.parent !== null && leaf.parent.children[leaf.indexInParent] !== leaf) break;
    maxIter -= 1;
  }
  if (leafEmptied && leafEntryCount(leaf) > 0 && leaf.parent !== null
      && leaf.parent.children[leaf.indexInParent] === leaf) {
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
  const boundCompared = state.compareKeys(startKey, endKey);
  if (boundCompared > 0) return 0;
  const lowerExclusive = options?.lowerBound === 'exclusive';
  const upperExclusive = options?.upperBound === 'exclusive';
  if (lowerExclusive && upperExclusive && boundCompared === 0) return 0;

  const treeHeight = computeTreeHeight(state);
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
    const removeEnd = findRemoveEnd(state, leaf, idx, endKey, upperExclusive);
    const removeCount = removeEnd - idx;
    if (removeCount === 0) break;

    const countAfterSplice = spliceLeafAndRebalance(state, leaf, idx, removeCount, treeHeight);
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

import { BTreeInvariantError } from '../errors.js';
import {
  isLeafNode,
  leafEntryCount,
  leafShiftEntry,
  leafUnshiftEntry,
  writeMinKeyTo,
  type BTreeNode,
  type BTreeState,
  type BranchNode,
  type LeafNode,
} from './types.js';
import {
  removeChildFromBranch,
  rebalanceAfterBranchRemoval,
  updateMinKeyInAncestors,
} from './rebalance-branch.js';

export { updateMinKeyInAncestors };

const requireLeafNode = <TKey, TValue>(
  node: BTreeNode<TKey, TValue>,
): LeafNode<TKey, TValue> => {
  if (!isLeafNode(node))
    throw new BTreeInvariantError('expected leaf, got branch');
  return node;
};

const detachLeafFromChain = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  leaf: LeafNode<TKey, TValue>,
): void => {
  if (leaf.prev !== null) {
    leaf.prev.next = leaf.next;
  } else if (leaf.next !== null) {
    state.leftmostLeaf = leaf.next;
  }
  if (leaf.next !== null) {
    leaf.next.prev = leaf.prev;
  } else if (leaf.prev !== null) {
    state.rightmostLeaf = leaf.prev;
  }
  leaf.prev = null;
  leaf.next = null;
};

const mergeLeafEntries = <TKey, TValue>(
  target: LeafNode<TKey, TValue>,
  source: LeafNode<TKey, TValue>,
): void => {
  if (target.entryOffset > 0) {
    target.entries.copyWithin(0, target.entryOffset);
    target.entries.length = target.entries.length - target.entryOffset;
    target.entryOffset = 0;
  }
  target.entries.push(...source.entries.slice(source.entryOffset));
};

/** Applies the lazy divisor to a minimum-occupancy value. */
export const applyLazyThreshold = (min: number): number =>
  Math.max(1, Math.ceil(min / 4));

export const leafRebalanceThreshold = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
): number => {
  if (state.deleteRebalancePolicy === 'lazy') {
    return applyLazyThreshold(state.minLeafEntries);
  }
  return state.minLeafEntries;
};

const findLeafSiblings = <TKey, TValue>(
  parent: BranchNode<TKey, TValue>,
  leafIndex: number,
): {
  left: LeafNode<TKey, TValue> | null;
  right: LeafNode<TKey, TValue> | null;
} => {
  const left =
    leafIndex > parent.childOffset
      ? requireLeafNode<TKey, TValue>(parent.children[leafIndex - 1])
      : null;
  const right =
    leafIndex + 1 < parent.children.length
      ? requireLeafNode<TKey, TValue>(parent.children[leafIndex + 1])
      : null;
  return { left, right };
};

const tryBorrowFromLeafSibling = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  leaf: LeafNode<TKey, TValue>,
  parent: BranchNode<TKey, TValue>,
  leafIndex: number,
  leftSibling: LeafNode<TKey, TValue> | null,
  rightSibling: LeafNode<TKey, TValue> | null,
): boolean => {
  if (
    rightSibling !== null &&
    leafEntryCount(rightSibling) > state.minLeafEntries
  ) {
    const borrowed = leafShiftEntry(rightSibling);
    if (borrowed === undefined)
      throw new BTreeInvariantError('right leaf borrow failed');
    leaf.entries.push(borrowed);
    writeMinKeyTo<TKey, TValue>(rightSibling, parent.keys[leafIndex + 1]);
    return true;
  }
  if (
    leftSibling !== null &&
    leafEntryCount(leftSibling) > state.minLeafEntries
  ) {
    const borrowed = leftSibling.entries.pop();
    if (borrowed === undefined)
      throw new BTreeInvariantError('left leaf borrow failed');
    leafUnshiftEntry(leaf, borrowed);
    parent.keys[leafIndex] = { key: borrowed.key, sequence: borrowed.entryId };
    updateMinKeyInAncestors(leaf);
    return true;
  }
  return false;
};

const mergeLeafWithSibling = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  leaf: LeafNode<TKey, TValue>,
  parent: BranchNode<TKey, TValue>,
  leafIndex: number,
  leftSibling: LeafNode<TKey, TValue> | null,
  rightSibling: LeafNode<TKey, TValue> | null,
): void => {
  if (leftSibling !== null) {
    mergeLeafEntries(leftSibling, leaf);
    detachLeafFromChain(state, leaf);
    removeChildFromBranch(parent, leafIndex);
    rebalanceAfterBranchRemoval(state, parent);
    return;
  }
  if (rightSibling !== null) {
    mergeLeafEntries(leaf, rightSibling);
    detachLeafFromChain(state, rightSibling);
    removeChildFromBranch(parent, leafIndex + 1);
    rebalanceAfterBranchRemoval(state, parent);
    return;
  }
  throw new BTreeInvariantError('no leaf siblings to rebalance');
};

export const rebalanceAfterLeafRemoval = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  leaf: LeafNode<TKey, TValue>,
): void => {
  if (leaf === state.root) {
    if (state.entryCount === 0) {
      state.leftmostLeaf = leaf;
      state.rightmostLeaf = leaf;
    }
    return;
  }
  if (leafEntryCount(leaf) >= leafRebalanceThreshold(state)) return;
  const parent = leaf.parent;
  if (parent === null)
    throw new BTreeInvariantError('Leaf node has no parent during rebalance.');
  const leafIndex = leaf.indexInParent;
  const { left, right } = findLeafSiblings(parent, leafIndex);
  if (tryBorrowFromLeafSibling(state, leaf, parent, leafIndex, left, right))
    return;
  mergeLeafWithSibling(state, leaf, parent, leafIndex, left, right);
};

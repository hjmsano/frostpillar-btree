import { BTreeInvariantError } from '../errors.js';
import {
  branchChildCount,
  branchCompact,
  branchRemoveAt,
  isLeafNode,
  writeMinKeyTo,
  type BTreeNode,
  type BTreeState,
  type BranchNode,
  type NodeKey,
} from './types.js';

export const updateMinKeyInAncestors = <TKey, TValue>(
  node: BTreeNode<TKey, TValue>,
): void => {
  let current = node;
  while (current.parent !== null) {
    const idx = current.indexInParent;
    if (!writeMinKeyTo(current, current.parent.keys[idx])) return;
    if (idx !== current.parent.childOffset) return;
    current = current.parent;
  }
};

const requireParent = <TKey, TValue>(
  node: BTreeNode<TKey, TValue>,
): BranchNode<TKey, TValue> => {
  if (node.parent === null) {
    throw new BTreeInvariantError('no parent during rebalance');
  }
  return node.parent;
};

const requireBranchNode = <TKey, TValue>(
  node: BTreeNode<TKey, TValue>,
): BranchNode<TKey, TValue> => {
  if (isLeafNode(node))
    throw new BTreeInvariantError('expected branch, got leaf');
  return node;
};

export const removeChildFromBranch = <TKey, TValue>(
  branch: BranchNode<TKey, TValue>,
  childIndex: number,
): void => {
  if (childIndex < branch.childOffset || childIndex >= branch.children.length) {
    throw new BTreeInvariantError('child index out of range');
  }
  branchRemoveAt(branch, childIndex);
};

const borrowFromLeftBranch = <TKey, TValue>(
  branch: BranchNode<TKey, TValue>,
  leftSibling: BranchNode<TKey, TValue>,
  branchIndex: number,
): void => {
  const borrowedChild = leftSibling.children.pop();
  if (borrowedChild === undefined)
    throw new BTreeInvariantError('left branch borrow failed');
  leftSibling.keys.pop();
  borrowedChild.parent = branch;
  const borrowedMinKey: NodeKey<TKey> = {
    key: undefined as unknown as TKey,
    sequence: 0,
  };
  if (!writeMinKeyTo<TKey, TValue>(borrowedChild, borrowedMinKey))
    throw new BTreeInvariantError('borrowed child has no min key');
  if (branch.childOffset > 0) {
    // O(1): fill gap before childOffset
    branch.childOffset -= 1;
    branch.children[branch.childOffset] = borrowedChild;
    branch.keys[branch.childOffset] = borrowedMinKey;
    borrowedChild.indexInParent = branch.childOffset;
  } else {
    // Fallback: no gap available
    branch.children.unshift(borrowedChild);
    branch.keys.unshift(borrowedMinKey);
    for (let i = 0; i < branch.children.length; i += 1)
      branch.children[i].indexInParent = i;
  }
  const parent = requireParent(branch);
  parent.keys[branchIndex] = {
    key: borrowedMinKey.key,
    sequence: borrowedMinKey.sequence,
  };
  updateMinKeyInAncestors(branch);
};

const borrowFromRightBranch = <TKey, TValue>(
  branch: BranchNode<TKey, TValue>,
  rightSibling: BranchNode<TKey, TValue>,
  branchIndex: number,
): void => {
  // O(1) amortized: increment offset instead of shift()
  const shiftIdx = rightSibling.childOffset;
  if (shiftIdx >= rightSibling.children.length)
    throw new BTreeInvariantError('right branch borrow failed');
  const borrowedChild = rightSibling.children[shiftIdx];
  rightSibling.childOffset += 1;
  // Auto-compact if dead slots reach half
  if (rightSibling.childOffset >= rightSibling.children.length >>> 1) {
    branchCompact(rightSibling);
  }
  branch.children.push(borrowedChild);
  borrowedChild.parent = branch;
  const borrowedMinKey: NodeKey<TKey> = {
    key: undefined as unknown as TKey,
    sequence: 0,
  };
  if (!writeMinKeyTo<TKey, TValue>(borrowedChild, borrowedMinKey))
    throw new BTreeInvariantError('borrowed child has no min key');
  branch.keys.push(borrowedMinKey);
  borrowedChild.indexInParent = branch.children.length - 1;
  const parent = requireParent(branch);
  writeMinKeyTo<TKey, TValue>(rightSibling, parent.keys[branchIndex + 1]);
};

const mergeBranchIntoLeft = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  branch: BranchNode<TKey, TValue>,
  leftSibling: BranchNode<TKey, TValue>,
  branchIndex: number,
): void => {
  for (let i = branch.childOffset; i < branch.children.length; i += 1) {
    const child = branch.children[i];
    child.parent = leftSibling;
    child.indexInParent = leftSibling.children.length;
    leftSibling.children.push(child);
    leftSibling.keys.push(branch.keys[i]);
  }
  const parent = requireParent(branch);
  removeChildFromBranch(parent, branchIndex);
  rebalanceAfterBranchRemoval(state, parent);
};

const mergeBranchIntoRight = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  branch: BranchNode<TKey, TValue>,
  rightSibling: BranchNode<TKey, TValue>,
  branchIndex: number,
): void => {
  for (
    let i = rightSibling.childOffset;
    i < rightSibling.children.length;
    i += 1
  ) {
    const child = rightSibling.children[i];
    child.parent = branch;
    child.indexInParent = branch.children.length;
    branch.children.push(child);
    branch.keys.push(rightSibling.keys[i]);
  }
  const parent = requireParent(branch);
  removeChildFromBranch(parent, branchIndex + 1);
  rebalanceAfterBranchRemoval(state, parent);
};

const findBranchSiblings = <TKey, TValue>(
  parent: BranchNode<TKey, TValue>,
  branchIndex: number,
): {
  left: BranchNode<TKey, TValue> | null;
  right: BranchNode<TKey, TValue> | null;
} => {
  const left =
    branchIndex > parent.childOffset
      ? requireBranchNode<TKey, TValue>(parent.children[branchIndex - 1])
      : null;
  const right =
    branchIndex + 1 < parent.children.length
      ? requireBranchNode<TKey, TValue>(parent.children[branchIndex + 1])
      : null;
  return { left, right };
};

export const rebalanceAfterBranchRemoval = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  branch: BranchNode<TKey, TValue>,
): void => {
  const liveCount = branchChildCount(branch);
  if (branch === state.root) {
    if (liveCount === 1) {
      const onlyChild = branch.children[branch.childOffset];
      onlyChild.parent = null;
      state.root = onlyChild;
      if (isLeafNode(onlyChild)) {
        state.leftmostLeaf = onlyChild;
        state.rightmostLeaf = onlyChild;
      }
    }
    return;
  }
  if (liveCount >= state.minBranchChildren) return;
  const parent = branch.parent;
  if (parent === null) throw new BTreeInvariantError('branch has no parent');
  const branchIndex = branch.indexInParent;
  const { left: leftSibling, right: rightSibling } = findBranchSiblings(
    parent,
    branchIndex,
  );
  if (
    rightSibling !== null &&
    branchChildCount(rightSibling) > state.minBranchChildren
  ) {
    borrowFromRightBranch(branch, rightSibling, branchIndex);
    return;
  }
  if (
    leftSibling !== null &&
    branchChildCount(leftSibling) > state.minBranchChildren
  ) {
    borrowFromLeftBranch(branch, leftSibling, branchIndex);
    return;
  }
  if (leftSibling !== null) {
    mergeBranchIntoLeft(state, branch, leftSibling, branchIndex);
    return;
  }
  if (rightSibling !== null) {
    mergeBranchIntoRight(state, branch, rightSibling, branchIndex);
    return;
  }
  throw new BTreeInvariantError('no branch siblings to rebalance');
};

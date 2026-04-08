import { BTreeInvariantError } from '../errors.js';
import {
  NODE_LEAF,
  branchChildCount,
  branchCompact,
  branchInsertAt,
  createBranchNode,
  leafCompact,
  writeMinKeyTo,
  type BTreeNode,
  type BTreeState,
  type BranchNode,
  type LeafNode,
  type NodeKey,
} from './types.js';

const insertChildAfter = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  parent: BranchNode<TKey, TValue>,
  existingChild: BTreeNode<TKey, TValue>,
  childToInsert: BTreeNode<TKey, TValue>,
): void => {
  const newChildMinKey: NodeKey<TKey> = {
    key: undefined as unknown as TKey,
    sequence: 0,
  };
  if (!writeMinKeyTo<TKey, TValue>(childToInsert, newChildMinKey)) {
    throw new BTreeInvariantError('inserted child has no min key');
  }
  childToInsert.parent = parent;
  const logicalIndex = existingChild.indexInParent - parent.childOffset + 1;
  branchInsertAt(parent, logicalIndex, childToInsert, newChildMinKey);
  if (branchChildCount(parent) > state.maxBranchChildren) {
    splitBranch(state, parent);
  }
};

export const splitLeaf = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  leaf: LeafNode<TKey, TValue>,
): void => {
  leafCompact(leaf);
  const splitAt = Math.ceil(leaf.entries.length / 2);
  const sibling: LeafNode<TKey, TValue> = {
    kind: NODE_LEAF,
    entries: leaf.entries.splice(splitAt),
    entryOffset: 0,
    parent: leaf.parent,
    indexInParent: 0,
    prev: leaf,
    next: leaf.next,
  };
  if (leaf.next !== null) {
    leaf.next.prev = sibling;
  } else {
    state.rightmostLeaf = sibling;
  }
  leaf.next = sibling;
  if (leaf.parent === null) {
    state.root = createBranchNode([leaf, sibling], null);
    return;
  }
  insertChildAfter(state, leaf.parent, leaf, sibling);
};

export const splitBranch = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  branch: BranchNode<TKey, TValue>,
): void => {
  branchCompact(branch);
  const splitAt = Math.ceil(branch.children.length / 2);
  const sibling = createBranchNode(
    branch.children.splice(splitAt),
    branch.parent,
  );
  branch.keys.splice(splitAt);
  if (branch.parent === null) {
    state.root = createBranchNode([branch, sibling], null);
    return;
  }
  insertChildAfter(state, branch.parent, branch, sibling);
};

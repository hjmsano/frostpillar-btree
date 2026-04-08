import { BTreeInvariantError } from '../errors.js';
import type {
  BranchNode,
  BTreeNode,
  LeafEntry,
  LeafNode,
  NodeKey,
} from './types.js';
import { writeMinKeyTo } from './types.js';

export const createLeafNode = <TKey, TValue>(
  entries: LeafEntry<TKey, TValue>[],
  parent: BranchNode<TKey, TValue> | null,
): LeafNode<TKey, TValue> => {
  return {
    kind: 0,
    entries,
    entryOffset: 0,
    parent,
    indexInParent: 0,
    prev: null,
    next: null,
  };
};

export const createBranchNode = <TKey, TValue>(
  children: BTreeNode<TKey, TValue>[],
  parent: BranchNode<TKey, TValue> | null,
): BranchNode<TKey, TValue> => {
  const keys: NodeKey<TKey>[] = [];
  const branch: BranchNode<TKey, TValue> = {
    kind: 1,
    children,
    keys,
    childOffset: 0,
    parent,
    indexInParent: 0,
  };

  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    child.parent = branch;
    child.indexInParent = i;
    const target: NodeKey<TKey> = {
      key: undefined as unknown as TKey,
      sequence: 0,
    };
    if (!writeMinKeyTo<TKey, TValue>(child, target)) {
      throw new BTreeInvariantError('branch child has no min key');
    }
    keys.push(target);
  }

  return branch;
};

export const leafEntryCount = <TKey, TValue>(
  leaf: LeafNode<TKey, TValue>,
): number => leaf.entries.length - leaf.entryOffset;

export const leafEntryAt = <TKey, TValue>(
  leaf: LeafNode<TKey, TValue>,
  i: number,
): LeafEntry<TKey, TValue> => leaf.entries[leaf.entryOffset + i];

export const leafShiftEntry = <TKey, TValue>(
  leaf: LeafNode<TKey, TValue>,
): LeafEntry<TKey, TValue> | undefined => {
  if (leaf.entryOffset >= leaf.entries.length) return undefined;
  const entry = leaf.entries[leaf.entryOffset];
  leaf.entryOffset += 1;
  if (leaf.entryOffset >= leaf.entries.length >>> 1) {
    leaf.entries.copyWithin(0, leaf.entryOffset);
    leaf.entries.length = leaf.entries.length - leaf.entryOffset;
    leaf.entryOffset = 0;
  }
  return entry;
};

export const leafPopEntry = <TKey, TValue>(
  leaf: LeafNode<TKey, TValue>,
): LeafEntry<TKey, TValue> | undefined => {
  if (leaf.entryOffset >= leaf.entries.length) return undefined;
  return leaf.entries.pop();
};

export const leafUnshiftEntry = <TKey, TValue>(
  leaf: LeafNode<TKey, TValue>,
  entry: LeafEntry<TKey, TValue>,
): void => {
  if (leaf.entryOffset > 0) {
    leaf.entryOffset -= 1;
    leaf.entries[leaf.entryOffset] = entry;
  } else {
    leaf.entries.unshift(entry);
  }
};

export const leafRemoveAt = <TKey, TValue>(
  leaf: LeafNode<TKey, TValue>,
  logicalIndex: number,
): void => {
  const count = leaf.entries.length - leaf.entryOffset;
  const phys = leaf.entryOffset + logicalIndex;
  if (logicalIndex < count - 1 - logicalIndex) {
    leaf.entries.copyWithin(leaf.entryOffset + 1, leaf.entryOffset, phys);
    leaf.entryOffset += 1;
    if (leaf.entryOffset >= leaf.entries.length >>> 1) {
      leaf.entries.copyWithin(0, leaf.entryOffset);
      leaf.entries.length -= leaf.entryOffset;
      leaf.entryOffset = 0;
    }
  } else {
    leaf.entries.copyWithin(phys, phys + 1);
    leaf.entries.length -= 1;
  }
};

export const leafInsertAt = <TKey, TValue>(
  leaf: LeafNode<TKey, TValue>,
  logicalIndex: number,
  entry: LeafEntry<TKey, TValue>,
): void => {
  const phys = leaf.entryOffset + logicalIndex;
  if (
    leaf.entryOffset > 0 &&
    logicalIndex < (leaf.entries.length - leaf.entryOffset) >>> 1
  ) {
    leaf.entries.copyWithin(leaf.entryOffset - 1, leaf.entryOffset, phys);
    leaf.entryOffset -= 1;
    leaf.entries[phys - 1] = entry;
  } else {
    const len = leaf.entries.length;
    if (phys >= len) {
      leaf.entries.push(entry);
    } else {
      leaf.entries.push(leaf.entries[len - 1]);
      leaf.entries.copyWithin(phys + 1, phys, len);
      leaf.entries[phys] = entry;
    }
  }
};

export const leafCompact = <TKey, TValue>(
  leaf: LeafNode<TKey, TValue>,
): void => {
  if (leaf.entryOffset > 0) {
    leaf.entries.copyWithin(0, leaf.entryOffset);
    leaf.entries.length = leaf.entries.length - leaf.entryOffset;
    leaf.entryOffset = 0;
  }
};

const BRANCH_COMPACT_GAP = 1;

export const branchCompact = <TKey, TValue>(
  branch: BranchNode<TKey, TValue>,
): void => {
  if (branch.childOffset > 0) {
    const gap =
      branch.childOffset <= BRANCH_COMPACT_GAP ? 0 : BRANCH_COMPACT_GAP;
    branch.children.copyWithin(gap, branch.childOffset);
    branch.children.length -= branch.childOffset - gap;
    branch.keys.copyWithin(gap, branch.childOffset);
    branch.keys.length -= branch.childOffset - gap;
    branch.childOffset = gap;
    for (let i = gap; i < branch.children.length; i += 1) {
      branch.children[i].indexInParent = i;
    }
  }
};

export const branchChildCount = <TKey, TValue>(
  branch: BranchNode<TKey, TValue>,
): number => branch.children.length - branch.childOffset;

export const branchInsertAt = <TKey, TValue>(
  branch: BranchNode<TKey, TValue>,
  logicalIndex: number,
  child: BTreeNode<TKey, TValue>,
  key: NodeKey<TKey>,
): void => {
  const phys = branch.childOffset + logicalIndex;
  const count = branch.children.length - branch.childOffset;
  if (branch.childOffset > 0 && logicalIndex < count >>> 1) {
    branch.children.copyWithin(
      branch.childOffset - 1,
      branch.childOffset,
      phys,
    );
    branch.keys.copyWithin(branch.childOffset - 1, branch.childOffset, phys);
    branch.childOffset -= 1;
    branch.children[phys - 1] = child;
    branch.keys[phys - 1] = key;
    for (let i = branch.childOffset; i < phys; i += 1) {
      branch.children[i].indexInParent = i;
    }
    child.indexInParent = phys - 1;
  } else {
    branch.children.splice(phys, 0, child);
    branch.keys.splice(phys, 0, key);
    for (let i = phys; i < branch.children.length; i += 1) {
      branch.children[i].indexInParent = i;
    }
  }
};

export const branchRemoveAt = <TKey, TValue>(
  branch: BranchNode<TKey, TValue>,
  physIndex: number,
): void => {
  const logicalIndex = physIndex - branch.childOffset;
  const count = branch.children.length - branch.childOffset;
  if (logicalIndex < count - 1 - logicalIndex) {
    branch.children.copyWithin(
      branch.childOffset + 1,
      branch.childOffset,
      physIndex,
    );
    branch.keys.copyWithin(
      branch.childOffset + 1,
      branch.childOffset,
      physIndex,
    );
    branch.childOffset += 1;
    for (let i = branch.childOffset; i <= physIndex; i += 1) {
      branch.children[i].indexInParent = i;
    }
    if (branch.childOffset >= branch.children.length >>> 1) {
      branchCompact(branch);
    }
  } else {
    branch.children.copyWithin(physIndex, physIndex + 1);
    branch.keys.copyWithin(physIndex, physIndex + 1);
    branch.children.length -= 1;
    branch.keys.length -= 1;
    for (let i = physIndex; i < branch.children.length; i += 1) {
      branch.children[i].indexInParent = i;
    }
  }
};

import { BTreeInvariantError } from '../errors.js';
import {
  NODE_LEAF,
  leafEntryAt,
  leafEntryCount,
  type BTreeNode,
  type BTreeState,
  type BranchNode,
  type LeafNode,
} from './types.js';

const selectBranchChild = <TKey, TValue>(
  compare: (left: TKey, right: TKey) => number,
  branch: BranchNode<TKey, TValue>,
  userKey: TKey,
  sequence: number,
): BTreeNode<TKey, TValue> => {
  const off = branch.childOffset;
  if (off >= branch.children.length) {
    throw new BTreeInvariantError('branch has no children');
  }

  let selectedIndex = off;
  let lower = off;
  let upper = branch.keys.length - 1;

  while (lower <= upper) {
    const mid = (lower + upper) >>> 1;
    const k = branch.keys[mid];
    const cmp = compare(k.key, userKey);
    if ((cmp !== 0 ? cmp : k.sequence - sequence) <= 0) {
      selectedIndex = mid;
      lower = mid + 1;
    } else {
      upper = mid - 1;
    }
  }

  return branch.children[selectedIndex];
};

export const findLeafForKey = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  userKey: TKey,
  sequence: number,
): LeafNode<TKey, TValue> => {
  const compare = state.compareKeys;
  let cursor: BTreeNode<TKey, TValue> = state.root;
  while (cursor.kind !== NODE_LEAF) {
    cursor = selectBranchChild(compare, cursor, userKey, sequence);
  }

  return cursor;
};

export const lowerBoundInLeaf = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  leaf: LeafNode<TKey, TValue>,
  userKey: TKey,
  sequence: number,
): number => {
  const compare = state.compareKeys;
  let lower = leaf.entryOffset;
  let upper = leaf.entries.length;

  while (lower < upper) {
    const mid = (lower + upper) >>> 1;
    const e = leaf.entries[mid];
    const cmp = compare(e.key, userKey);
    if ((cmp !== 0 ? cmp : e.entryId - sequence) < 0) {
      lower = mid + 1;
    } else {
      upper = mid;
    }
  }

  return lower - leaf.entryOffset;
};

export const upperBoundInLeaf = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  leaf: LeafNode<TKey, TValue>,
  userKey: TKey,
  sequence: number,
): number => {
  const compare = state.compareKeys;
  let lower = leaf.entryOffset;
  let upper = leaf.entries.length;

  while (lower < upper) {
    const mid = (lower + upper) >>> 1;
    const e = leaf.entries[mid];
    const cmp = compare(e.key, userKey);
    if ((cmp !== 0 ? cmp : e.entryId - sequence) <= 0) {
      lower = mid + 1;
    } else {
      upper = mid;
    }
  }

  return lower - leaf.entryOffset;
};

export const findLeafFromHint = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  hint: LeafNode<TKey, TValue>,
  userKey: TKey,
  sequence: number,
): LeafNode<TKey, TValue> => {
  const compare = state.compareKeys;
  let leaf = hint;
  let budget = 32 - Math.clz32(state.entryCount + 1);
  while (budget > 0 && leaf.next !== null && leafEntryCount(leaf.next) > 0) {
    const first = leafEntryAt(leaf.next, 0);
    const cmp = compare(first.key, userKey);
    if (cmp > 0 || (cmp === 0 && first.entryId > sequence)) break;
    leaf = leaf.next;
    budget -= 1;
  }
  // Budget exhausted and key is beyond current leaf — fall back to root descent
  if (budget === 0 && leaf.next !== null && leafEntryCount(leaf.next) > 0) {
    const first = leafEntryAt(leaf.next, 0);
    const cmp = compare(first.key, userKey);
    if (cmp < 0 || (cmp === 0 && first.entryId <= sequence)) {
      return findLeafForKey(state, userKey, sequence);
    }
  }
  return leaf;
};

/** Returns shared cursor — caller must consume result before the next navigation call. */
export const findFirstMatchingUserKey = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  key: TKey,
): { leaf: LeafNode<TKey, TValue>; index: number } | null => {
  if (state.entryCount === 0) return null;
  let leaf = findLeafForKey(state, key, 0);
  let idx = lowerBoundInLeaf(state, leaf, key, 0);
  if (idx >= leafEntryCount(leaf)) {
    if (leaf.next === null) return null;
    leaf = leaf.next;
    idx = lowerBoundInLeaf(state, leaf, key, 0);
    if (idx >= leafEntryCount(leaf)) return null;
  }
  if (state.compareKeys(leafEntryAt(leaf, idx).key, key) !== 0) return null;
  const cursor = state._cursor;
  cursor.leaf = leaf;
  cursor.index = idx;
  return cursor;
};

/** Returns shared cursor — caller must consume result before the next navigation call. */
export const findLastMatchingUserKey = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  key: TKey,
): { leaf: LeafNode<TKey, TValue>; index: number } | null => {
  if (state.entryCount === 0) return null;
  // Upper bound with max sequence lands past all equal-key entries
  let leaf = findLeafForKey(state, key, Number.MAX_SAFE_INTEGER);
  let idx = upperBoundInLeaf(state, leaf, key, Number.MAX_SAFE_INTEGER);
  // Step back one to get the last equal-key entry
  if (idx === 0) {
    if (leaf.prev === null) return null;
    leaf = leaf.prev;
    idx = leafEntryCount(leaf);
    if (idx === 0) return null;
  }
  idx -= 1;
  if (state.compareKeys(leafEntryAt(leaf, idx).key, key) !== 0) return null;
  const cursor = state._cursor;
  cursor.leaf = leaf;
  cursor.index = idx;
  return cursor;
};

export const hasKeyEntry = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  key: TKey,
): boolean => {
  return findFirstMatchingUserKey(state, key) !== null;
};

export const findNextHigherKey = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  key: TKey,
): TKey | null => {
  if (state.entryCount === 0) return null;

  const compare = state.compareKeys;
  // Upper bound with max sequence lands past all equal-key entries
  let leaf: LeafNode<TKey, TValue> | null = findLeafForKey(state, key, Number.MAX_SAFE_INTEGER);
  let idx = upperBoundInLeaf(state, leaf, key, Number.MAX_SAFE_INTEGER);

  // Scan forward until we find an entry strictly greater than key
  while (leaf !== null) {
    if (idx < leafEntryCount(leaf)) {
      const e = leafEntryAt(leaf, idx);
      if (compare(e.key, key) > 0) return e.key;
      idx += 1;
    } else {
      leaf = leaf.next;
      idx = 0;
    }
  }

  return null;
};

export const findNextLowerKey = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  key: TKey,
): TKey | null => {
  if (state.entryCount === 0) return null;

  const compare = state.compareKeys;
  // Lower bound with sequence 0 lands at first equal-key entry
  const leaf = findLeafForKey(state, key, 0);
  const idx = lowerBoundInLeaf(state, leaf, key, 0);

  // Scan backward from the position just before lower bound
  let scanLeaf: LeafNode<TKey, TValue> | null = leaf;
  let scanIdx = idx - 1;
  while (scanLeaf !== null) {
    while (scanIdx >= 0) {
      const e = leafEntryAt(scanLeaf, scanIdx);
      if (compare(e.key, key) < 0) return e.key;
      scanIdx -= 1;
    }
    scanLeaf = scanLeaf.prev;
    if (scanLeaf !== null) {
      scanIdx = leafEntryCount(scanLeaf) - 1;
    }
  }

  return null;
};

/** Returns shared cursor — caller must consume result before the next navigation call. */
export const findPairOrNextLower = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  key: TKey,
): { leaf: LeafNode<TKey, TValue>; index: number } | null => {
  if (state.entryCount === 0) return null;

  const compare = state.compareKeys;
  const leaf = findLeafForKey(state, key, 0);
  const idx = lowerBoundInLeaf(state, leaf, key, 0);
  const cursor = state._cursor;

  // Check for exact match at lower bound position
  if (idx < leafEntryCount(leaf)) {
    if (compare(leafEntryAt(leaf, idx).key, key) === 0) {
      cursor.leaf = leaf;
      cursor.index = idx;
      return cursor;
    }
  } else if (leaf.next !== null) {
    // Lower bound may have landed past this leaf
    const nextIdx = lowerBoundInLeaf(state, leaf.next, key, 0);
    if (nextIdx < leafEntryCount(leaf.next) && compare(leafEntryAt(leaf.next, nextIdx).key, key) === 0) {
      cursor.leaf = leaf.next;
      cursor.index = nextIdx;
      return cursor;
    }
  }

  // No exact match — find the largest entry with key < query
  if (idx > 0) {
    cursor.leaf = leaf;
    cursor.index = idx - 1;
    return cursor;
  }

  if (leaf.prev !== null) {
    const prevCount = leafEntryCount(leaf.prev);
    if (prevCount > 0) {
      cursor.leaf = leaf.prev;
      cursor.index = prevCount - 1;
      return cursor;
    }
  }

  return null;
};


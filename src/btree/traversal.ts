import {
  freezeEntry,
  leafEntryAt,
  leafEntryCount,
  type BTreeEntry,
  type BTreeState,
  type LeafNode,
} from './types.js';

/** Collect all entries into a pre-allocated array, frozen for safe external use. */
export const snapshotEntries = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
): BTreeEntry<TKey, TValue>[] => {
  const result = new Array<BTreeEntry<TKey, TValue>>(state.entryCount);
  let leaf: LeafNode<TKey, TValue> | null = state.leftmostLeaf;
  let writeIdx = 0;
  while (leaf !== null) {
    const count = leafEntryCount(leaf);
    for (let i = 0; i < count; i += 1) {
      result[writeIdx++] = freezeEntry(leafEntryAt(leaf, i));
    }
    leaf = leaf.next;
  }
  return result;
};

/** Collect all internal entries (no freeze) for internal use (clone, serialize). */
export const collectInternalEntries = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
): BTreeEntry<TKey, TValue>[] => {
  const result = new Array<BTreeEntry<TKey, TValue>>(state.entryCount);
  let leaf: LeafNode<TKey, TValue> | null = state.leftmostLeaf;
  let writeIdx = 0;
  while (leaf !== null) {
    const count = leafEntryCount(leaf);
    for (let i = 0; i < count; i += 1) {
      result[writeIdx++] = leafEntryAt(leaf, i);
    }
    leaf = leaf.next;
  }
  return result;
};

/** Iterate all entries, invoking callback with frozen entries. */
export const forEachEntry = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  callback: (entry: BTreeEntry<TKey, TValue>) => void,
  thisArg?: unknown,
): void => {
  let leaf: LeafNode<TKey, TValue> | null = state.leftmostLeaf;
  while (leaf !== null) {
    const count = leafEntryCount(leaf);
    for (let i = 0; i < count; i += 1) {
      callback.call(thisArg, freezeEntry(leafEntryAt(leaf, i)));
    }
    leaf = leaf.next;
  }
};

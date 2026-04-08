import { BTreeInvariantError } from '../errors.js';
import { findLeafForKey, lowerBoundInLeaf } from './navigation.js';
import {
  rebalanceAfterLeafRemoval,
  updateMinKeyInAncestors,
} from './rebalance.js';
import {
  createEntry,
  leafEntryAt,
  leafEntryCount,
  leafRemoveAt,
  type BTreeEntry,
  type BTreeState,
  type EntryId,
  type LeafNode,
} from './types.js';

export const findLeafEntryBySequence = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  userKey: TKey,
  sequence: number,
): { leaf: LeafNode<TKey, TValue>; index: number } | null => {
  const targetLeaf = findLeafForKey(state, userKey, sequence);
  const index = lowerBoundInLeaf(state, targetLeaf, userKey, sequence);
  if (index >= leafEntryCount(targetLeaf)) return null;
  const entry = leafEntryAt(targetLeaf, index);
  if (entry.entryId !== sequence) return null;
  return { leaf: targetLeaf, index };
};

export const peekEntryById = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  entryId: EntryId,
): BTreeEntry<TKey, TValue> | null => {
  if (state.entryKeys === null) {
    throw new BTreeInvariantError(
      'entryKeys lookup map is not enabled on this tree.',
    );
  }
  const userKey = state.entryKeys.get(entryId);
  if (userKey === undefined) return null;
  const found = findLeafEntryBySequence(state, userKey, entryId);
  if (found === null) return null;
  const entry = leafEntryAt(found.leaf, found.index);
  return entry;
};

export const updateEntryById = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  entryId: EntryId,
  newValue: TValue,
): BTreeEntry<TKey, TValue> | null => {
  if (state.entryKeys === null) {
    throw new BTreeInvariantError(
      'entryKeys lookup map is not enabled on this tree.',
    );
  }
  const userKey = state.entryKeys.get(entryId);
  if (userKey === undefined) return null;
  const found = findLeafEntryBySequence(state, userKey, entryId);
  if (found === null) return null;
  const entry = leafEntryAt(found.leaf, found.index);
  const updated = createEntry(entry.key, entry.entryId, newValue);
  found.leaf.entries[found.leaf.entryOffset + found.index] = updated;
  return updated;
};

export const removeEntryById = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  entryId: EntryId,
): BTreeEntry<TKey, TValue> | null => {
  if (state.entryKeys === null) {
    throw new BTreeInvariantError(
      'entryKeys lookup map is not enabled on this tree.',
    );
  }
  const userKey = state.entryKeys.get(entryId);
  if (userKey === undefined) return null;
  const found = findLeafEntryBySequence(state, userKey, entryId);
  if (found === null) return null;
  const entry = leafEntryAt(found.leaf, found.index);
  leafRemoveAt(found.leaf, found.index);
  state.entryCount -= 1;
  state.entryKeys.delete(entryId);
  if (
    found.index === 0 &&
    leafEntryCount(found.leaf) > 0 &&
    found.leaf.parent !== null
  ) {
    updateMinKeyInAncestors(found.leaf);
  }
  if (
    found.leaf !== state.root &&
    leafEntryCount(found.leaf) < state.minLeafEntries
  ) {
    rebalanceAfterLeafRemoval(state, found.leaf);
  }
  return entry;
};

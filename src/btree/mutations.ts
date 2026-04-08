import { BTreeInvariantError, BTreeValidationError } from '../errors.js';
import { bulkLoadEntries } from './bulkLoad.js';
import {
  findFirstMatchingUserKey,
  findLeafForKey,
  findLeafFromHint,
  upperBoundInLeaf,
} from './navigation.js';
import {
  rebalanceAfterLeafRemoval,
  updateMinKeyInAncestors,
} from './rebalance.js';
import { maybeAutoScale } from './autoScale.js';
import { splitLeaf } from './split.js';
import {
  createEntry,
  leafEntryAt,
  leafEntryCount,
  leafInsertAt,
  leafPopEntry,
  leafRemoveAt,
  leafShiftEntry,
  type BTreeEntry,
  type BTreeState,
  type EntryId,
  type LeafEntry,
  type LeafNode,
} from './types.js';

export {
  peekEntryById,
  removeEntryById,
  updateEntryById,
} from './entry-lookup.js';

interface DuplicateHit<TKey, TValue> {
  leaf: LeafNode<TKey, TValue>;
  physIndex: number;
  entry: LeafEntry<TKey, TValue>;
}

const findDuplicateEntry = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  targetLeaf: LeafNode<TKey, TValue>,
  key: TKey,
  insertAt: number,
): DuplicateHit<TKey, TValue> | null => {
  if (state.duplicateKeys === 'allow') return null;
  if (insertAt > 0) {
    const candidate = leafEntryAt(targetLeaf, insertAt - 1);
    if (state.compareKeys(candidate.key, key) === 0) {
      return {
        leaf: targetLeaf,
        physIndex: targetLeaf.entryOffset + insertAt - 1,
        entry: candidate,
      };
    }
  } else if (targetLeaf.prev !== null && leafEntryCount(targetLeaf.prev) > 0) {
    const prevLeaf = targetLeaf.prev;
    const prevCount = leafEntryCount(prevLeaf);
    const candidate = leafEntryAt(prevLeaf, prevCount - 1);
    if (state.compareKeys(candidate.key, key) === 0) {
      return {
        leaf: prevLeaf,
        physIndex: prevLeaf.entryOffset + prevCount - 1,
        entry: candidate,
      };
    }
  }
  return null;
};

const putEntryIntoLeaf = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  targetLeaf: LeafNode<TKey, TValue>,
  key: TKey,
  value: TValue,
): EntryId => {
  const sequence = state.nextSequence;
  const insertAt = upperBoundInLeaf(state, targetLeaf, key, sequence);

  const dup = findDuplicateEntry(state, targetLeaf, key, insertAt);
  if (dup !== null) {
    if (state.duplicateKeys === 'reject') {
      throw new BTreeValidationError('Duplicate key rejected.');
    }
    dup.leaf.entries[dup.physIndex] = createEntry(
      dup.entry.key,
      dup.entry.entryId,
      value,
    );
    return dup.entry.entryId;
  }

  if (state.nextSequence >= Number.MAX_SAFE_INTEGER) {
    throw new BTreeValidationError('Sequence overflow.');
  }
  state.nextSequence += 1;
  leafInsertAt(
    targetLeaf,
    insertAt,
    createEntry(key, sequence as EntryId, value),
  );
  state.entryCount += 1;
  if (state.entryKeys !== null) {
    state.entryKeys.set(sequence as EntryId, key);
  }
  if (insertAt === 0 && targetLeaf.parent !== null)
    updateMinKeyInAncestors(targetLeaf);
  if (leafEntryCount(targetLeaf) > state.maxLeafEntries)
    splitLeaf(state, targetLeaf);
  maybeAutoScale(state);
  return sequence as EntryId;
};

export const putEntry = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  key: TKey,
  value: TValue,
): EntryId => {
  const targetLeaf = findLeafForKey(state, key, state.nextSequence);
  return putEntryIntoLeaf(state, targetLeaf, key, value);
};

export const popFirstEntry = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
): BTreeEntry<TKey, TValue> | null => {
  if (state.entryCount === 0) return null;
  const firstEntry = leafShiftEntry(state.leftmostLeaf);
  if (firstEntry === undefined)
    throw new BTreeInvariantError('leftmost leaf empty but count > 0');
  state.entryCount -= 1;
  if (state.entryKeys !== null) {
    state.entryKeys.delete(firstEntry.entryId);
  }
  if (
    leafEntryCount(state.leftmostLeaf) > 0 &&
    state.leftmostLeaf.parent !== null
  ) {
    updateMinKeyInAncestors(state.leftmostLeaf);
  }
  if (
    state.leftmostLeaf !== state.root &&
    leafEntryCount(state.leftmostLeaf) < state.minLeafEntries
  ) {
    rebalanceAfterLeafRemoval(state, state.leftmostLeaf);
  }
  return firstEntry;
};

export const popLastEntry = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
): BTreeEntry<TKey, TValue> | null => {
  if (state.entryCount === 0) return null;
  const lastEntry = leafPopEntry(state.rightmostLeaf);
  if (lastEntry === undefined)
    throw new BTreeInvariantError('rightmost leaf empty but count > 0');
  state.entryCount -= 1;
  if (state.entryKeys !== null) {
    state.entryKeys.delete(lastEntry.entryId);
  }
  if (
    state.rightmostLeaf !== state.root &&
    leafEntryCount(state.rightmostLeaf) < state.minLeafEntries
  ) {
    rebalanceAfterLeafRemoval(state, state.rightmostLeaf);
  }
  return lastEntry;
};

export const removeFirstMatchingEntry = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  key: TKey,
): BTreeEntry<TKey, TValue> | null => {
  const found = findFirstMatchingUserKey(state, key);
  if (found === null) return null;
  const targetLeaf = found.leaf;
  const removeAt = found.index;
  const targetEntry = leafEntryAt(targetLeaf, removeAt);
  leafRemoveAt(targetLeaf, removeAt);
  state.entryCount -= 1;
  if (state.entryKeys !== null) {
    state.entryKeys.delete(targetEntry.entryId);
  }
  if (
    removeAt === 0 &&
    leafEntryCount(targetLeaf) > 0 &&
    targetLeaf.parent !== null
  )
    updateMinKeyInAncestors(targetLeaf);
  if (
    targetLeaf !== state.root &&
    leafEntryCount(targetLeaf) < state.minLeafEntries
  ) {
    rebalanceAfterLeafRemoval(state, targetLeaf);
  }
  return targetEntry;
};

export const putManyEntries = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  entries: readonly { key: TKey; value: TValue }[],
): EntryId[] => {
  if (entries.length === 0) return [];

  // Validate sort order upfront
  const strictlyAscending = state.duplicateKeys !== 'allow';
  for (let i = 1; i < entries.length; i += 1) {
    const cmp = state.compareKeys(entries[i - 1].key, entries[i].key);
    if (cmp > 0) {
      throw new BTreeValidationError(
        'putMany: entries not in ascending order.',
      );
    }
    if (strictlyAscending && cmp === 0) {
      throw new BTreeValidationError(
        state.duplicateKeys === 'reject'
          ? 'putMany: duplicate key rejected.'
          : 'putMany: equal keys not allowed in strict mode.',
      );
    }
  }

  // Non-empty tree: cursor-optimized sequential put
  if (state.entryCount > 0) {
    const ids = new Array<EntryId>(entries.length);
    let hintLeaf = findLeafForKey(state, entries[0].key, state.nextSequence);
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      const targetLeaf = findLeafFromHint(
        state,
        hintLeaf,
        entry.key,
        state.nextSequence,
      );
      ids[i] = putEntryIntoLeaf(state, targetLeaf, entry.key, entry.value);
      hintLeaf = targetLeaf;
    }
    return ids;
  }

  // Empty tree: input is already validated as sorted (strictly ascending for
  // reject/replace). With no existing entries, there are zero duplicates by
  // definition, so bulk load is safe for all duplicate-key policies.
  return bulkLoadEntries(state, entries);
};

import {
  leafEntryAt,
  leafEntryCount,
  type BTreeEntry,
  type BTreeState,
  type LeafNode,
  type RangeBounds,
} from './types.js';
import {
  findLeafForKey,
  lowerBoundInLeaf,
  upperBoundInLeaf,
} from './navigation.js';

interface RangeCursor<TKey, TValue> {
  leaf: LeafNode<TKey, TValue>;
  index: number;
  compare: (left: TKey, right: TKey) => number;
  upperExclusive: boolean;
}

const initRangeCursor = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  startKey: TKey,
  endKey: TKey,
  options?: RangeBounds,
): RangeCursor<TKey, TValue> | null => {
  if (state.entryCount === 0) return null;

  const compare = state.compareKeys;
  const boundCompared = compare(startKey, endKey);
  if (boundCompared > 0) return null;

  const lowerExclusive = options?.lowerBound === 'exclusive';
  const upperExclusive = options?.upperBound === 'exclusive';

  if (lowerExclusive && upperExclusive && boundCompared === 0) return null;

  const startSeq = lowerExclusive ? Number.MAX_SAFE_INTEGER : 0;
  const leaf = findLeafForKey(state, startKey, startSeq);
  const index = lowerExclusive
    ? upperBoundInLeaf(state, leaf, startKey, Number.MAX_SAFE_INTEGER)
    : lowerBoundInLeaf(state, leaf, startKey, 0);

  return { leaf, index, compare, upperExclusive };
};

export const countRangeEntries = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  startKey: TKey,
  endKey: TKey,
  options?: RangeBounds,
): number => {
  const cursor = initRangeCursor(state, startKey, endKey, options);
  if (cursor === null) return 0;

  let cursorLeaf: LeafNode<TKey, TValue> | null = cursor.leaf;
  let cursorIndex = cursor.index;
  const { compare, upperExclusive } = cursor;

  let count = 0;
  while (cursorLeaf !== null) {
    const leafCount = leafEntryCount(cursorLeaf);
    if (cursorIndex >= leafCount) {
      cursorLeaf = cursorLeaf.next;
      cursorIndex = 0;
      continue;
    }
    // Fast-path: if last entry in leaf is within range, count the whole remainder
    const lastEntry = leafEntryAt(cursorLeaf, leafCount - 1);
    const cmpLast = compare(lastEntry.key, endKey);
    if (upperExclusive ? cmpLast < 0 : cmpLast <= 0) {
      count += leafCount - cursorIndex;
      cursorLeaf = cursorLeaf.next;
      cursorIndex = 0;
      continue;
    }
    // Boundary leaf: use binary search to find end position
    const endSeq = upperExclusive ? 0 : Number.MAX_SAFE_INTEGER;
    const endBound = upperExclusive
      ? lowerBoundInLeaf(state, cursorLeaf, endKey, endSeq)
      : upperBoundInLeaf(state, cursorLeaf, endKey, endSeq);
    const limit = endBound < leafCount ? endBound : leafCount;
    count += limit - cursorIndex;
    return count;
  }

  return count;
};

/** Threshold above which pre-allocation via countRangeEntries pays off vs. dynamic push(). */
const RANGE_PREALLOC_THRESHOLD = 200;

/** Determine the initial output array for rangeQueryEntries. */
const allocateRangeOutput = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  cursorLeaf: LeafNode<TKey, TValue>,
  cursorIndex: number,
  compare: (left: TKey, right: TKey) => number,
  upperExclusive: boolean,
  startKey: TKey,
  endKey: TKey,
  options?: RangeBounds,
): BTreeEntry<TKey, TValue>[] => {
  const firstLeafCount = leafEntryCount(cursorLeaf);
  const firstLeafRemainder = firstLeafCount - cursorIndex;
  if (
    firstLeafRemainder >= RANGE_PREALLOC_THRESHOLD
    && cursorLeaf.next !== null
  ) {
    const lastEntry = leafEntryAt(cursorLeaf, firstLeafCount - 1);
    const cmpLast = compare(lastEntry.key, endKey);
    if (upperExclusive ? cmpLast < 0 : cmpLast <= 0) {
      const total = countRangeEntries(state, startKey, endKey, options);
      return new Array<BTreeEntry<TKey, TValue>>(total);
    }
  }
  return [];
};

/** Append entries from a leaf slice to the output array. */
const appendLeafSlice = <TKey, TValue>(
  leaf: LeafNode<TKey, TValue>,
  from: number,
  to: number,
  output: BTreeEntry<TKey, TValue>[],
  useIndexed: boolean,
  writeIdx: number,
): number => {
  if (useIndexed) {
    for (let i = from; i < to; i += 1) {
      output[writeIdx++] = leafEntryAt(leaf, i);
    }
  } else {
    for (let i = from; i < to; i += 1) {
      output.push(leafEntryAt(leaf, i));
    }
  }
  return writeIdx;
};

export const rangeQueryEntries = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  startKey: TKey,
  endKey: TKey,
  options?: RangeBounds,
): BTreeEntry<TKey, TValue>[] => {
  const cursor = initRangeCursor(state, startKey, endKey, options);
  if (cursor === null) return [];

  let cursorLeaf: LeafNode<TKey, TValue> | null = cursor.leaf;
  let cursorIndex = cursor.index;
  const { compare, upperExclusive } = cursor;

  const output = allocateRangeOutput(state, cursorLeaf, cursorIndex, compare, upperExclusive, startKey, endKey, options);
  let writeIdx = 0;
  const useIndexed = output.length > 0;

  while (cursorLeaf !== null) {
    const leafCount = leafEntryCount(cursorLeaf);
    if (cursorIndex >= leafCount) {
      cursorLeaf = cursorLeaf.next;
      cursorIndex = 0;
      continue;
    }
    const lastEntry = leafEntryAt(cursorLeaf, leafCount - 1);
    const cmpLast = compare(lastEntry.key, endKey);
    if (upperExclusive ? cmpLast < 0 : cmpLast <= 0) {
      writeIdx = appendLeafSlice(cursorLeaf, cursorIndex, leafCount, output, useIndexed, writeIdx);
      cursorLeaf = cursorLeaf.next;
      cursorIndex = 0;
      continue;
    }
    const endSeq = upperExclusive ? 0 : Number.MAX_SAFE_INTEGER;
    const endBound = upperExclusive
      ? lowerBoundInLeaf(state, cursorLeaf, endKey, endSeq)
      : upperBoundInLeaf(state, cursorLeaf, endKey, endSeq);
    const limit = endBound < leafCount ? endBound : leafCount;
    appendLeafSlice(cursorLeaf, cursorIndex, limit, output, useIndexed, writeIdx);
    return output;
  }

  return output;
};

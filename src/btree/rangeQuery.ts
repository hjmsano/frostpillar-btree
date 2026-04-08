import {
  freezeEntry,
  leafEntryAt,
  leafEntryCount,
  toPublicEntry,
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

export function isEmptyRange<TKey>(
  compare: (a: TKey, b: TKey) => number,
  startKey: TKey,
  endKey: TKey,
  options?: RangeBounds,
): boolean {
  const cmp = compare(startKey, endKey);
  if (cmp > 0) return true;
  const lowerExclusive = options?.lowerBound === 'exclusive';
  const upperExclusive = options?.upperBound === 'exclusive';
  return lowerExclusive && upperExclusive && cmp === 0;
}

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
  if (isEmptyRange(compare, startKey, endKey, options)) return null;

  const lowerExclusive = options?.lowerBound === 'exclusive';
  const upperExclusive = options?.upperBound === 'exclusive';
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
    const lastKey = leafEntryAt(cursorLeaf, leafCount - 1).key;
    if (isLastEntryInRange(lastKey, endKey, compare, upperExclusive)) {
      count += leafCount - cursorIndex;
      cursorLeaf = cursorLeaf.next;
      cursorIndex = 0;
      continue;
    }
    count +=
      findBoundaryEnd(state, cursorLeaf, endKey, upperExclusive, leafCount) -
      cursorIndex;
    return count;
  }

  return count;
};

/** Check if the last entry in a leaf is within the query range (whole-leaf fast-path). */
const isLastEntryInRange = <TKey>(
  lastKey: TKey,
  endKey: TKey,
  compare: (left: TKey, right: TKey) => number,
  upperExclusive: boolean,
): boolean => {
  const cmp = compare(lastKey, endKey);
  return upperExclusive ? cmp < 0 : cmp <= 0;
};

/** Binary search to find the end position within a boundary leaf. */
const findBoundaryEnd = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  leaf: LeafNode<TKey, TValue>,
  endKey: TKey,
  upperExclusive: boolean,
  leafCount: number,
): number => {
  const endSeq = upperExclusive ? 0 : Number.MAX_SAFE_INTEGER;
  const endBound = upperExclusive
    ? lowerBoundInLeaf(state, leaf, endKey, endSeq)
    : upperBoundInLeaf(state, leaf, endKey, endSeq);
  return endBound < leafCount ? endBound : leafCount;
};

/** Threshold above which pre-allocation via countRangeEntries pays off vs. dynamic push(). */
const RANGE_PREALLOC_THRESHOLD = 200;

/** Determine the initial output array for range query results. */
const allocateRangeOutput = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  cursor: RangeCursor<TKey, TValue>,
  startKey: TKey,
  endKey: TKey,
  options?: RangeBounds,
): BTreeEntry<TKey, TValue>[] => {
  const firstLeafCount = leafEntryCount(cursor.leaf);
  const firstLeafRemainder = firstLeafCount - cursor.index;
  if (
    firstLeafRemainder >= RANGE_PREALLOC_THRESHOLD &&
    cursor.leaf.next !== null
  ) {
    const lastKey = leafEntryAt(cursor.leaf, firstLeafCount - 1).key;
    if (
      isLastEntryInRange(lastKey, endKey, cursor.compare, cursor.upperExclusive)
    ) {
      return new Array<BTreeEntry<TKey, TValue>>(
        countRangeEntries(state, startKey, endKey, options),
      );
    }
  }
  return [];
};

/** Append entries from a leaf slice to the output array, applying toPublicEntry inline. */
const appendLeafSlicePublic = <TKey, TValue>(
  leaf: LeafNode<TKey, TValue>,
  from: number,
  to: number,
  output: BTreeEntry<TKey, TValue>[],
  useIndexed: boolean,
  writeIdx: number,
): number => {
  if (useIndexed) {
    for (let i = from; i < to; i += 1) {
      output[writeIdx++] = toPublicEntry(leafEntryAt(leaf, i));
    }
  } else {
    for (let i = from; i < to; i += 1) {
      output.push(toPublicEntry(leafEntryAt(leaf, i)));
    }
  }
  return writeIdx;
};

/** Walk cursor through leaves, appending public entries to output. */
const collectPublicEntries = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  cursor: RangeCursor<TKey, TValue>,
  endKey: TKey,
  output: BTreeEntry<TKey, TValue>[],
): void => {
  const { compare, upperExclusive } = cursor;
  let cursorLeaf: LeafNode<TKey, TValue> | null = cursor.leaf;
  let cursorIndex = cursor.index;
  let writeIdx = 0;
  const useIndexed = output.length > 0;
  while (cursorLeaf !== null) {
    const leafCount = leafEntryCount(cursorLeaf);
    if (cursorIndex >= leafCount) {
      cursorLeaf = cursorLeaf.next;
      cursorIndex = 0;
      continue;
    }
    const lastKey = leafEntryAt(cursorLeaf, leafCount - 1).key;
    if (isLastEntryInRange(lastKey, endKey, compare, upperExclusive)) {
      writeIdx = appendLeafSlicePublic(
        cursorLeaf,
        cursorIndex,
        leafCount,
        output,
        useIndexed,
        writeIdx,
      );
      cursorLeaf = cursorLeaf.next;
      cursorIndex = 0;
      continue;
    }
    const limit = findBoundaryEnd(
      state,
      cursorLeaf,
      endKey,
      upperExclusive,
      leafCount,
    );
    appendLeafSlicePublic(
      cursorLeaf,
      cursorIndex,
      limit,
      output,
      useIndexed,
      writeIdx,
    );
    return;
  }
};

/** Single-pass range query that produces public entries (with toPublicEntry) inline. */
export const rangeQueryPublicEntries = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  startKey: TKey,
  endKey: TKey,
  options?: RangeBounds,
): BTreeEntry<TKey, TValue>[] => {
  const cursor = initRangeCursor(state, startKey, endKey, options);
  if (cursor === null) return [];
  const output = allocateRangeOutput(state, cursor, startKey, endKey, options);
  collectPublicEntries(state, cursor, endKey, output);
  return output;
};

/** Streaming range iteration — invokes callback for each entry without array allocation. */
export const forEachRangeEntries = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  startKey: TKey,
  endKey: TKey,
  callback: (entry: BTreeEntry<TKey, TValue>) => void,
  options?: RangeBounds,
): void => {
  const cursor = initRangeCursor(state, startKey, endKey, options);
  if (cursor === null) return;

  let cursorLeaf: LeafNode<TKey, TValue> | null = cursor.leaf;
  let cursorIndex = cursor.index;
  const { compare, upperExclusive } = cursor;

  while (cursorLeaf !== null) {
    const leafCount = leafEntryCount(cursorLeaf);
    if (cursorIndex >= leafCount) {
      cursorLeaf = cursorLeaf.next;
      cursorIndex = 0;
      continue;
    }
    const lastKey = leafEntryAt(cursorLeaf, leafCount - 1).key;
    if (isLastEntryInRange(lastKey, endKey, compare, upperExclusive)) {
      for (let i = cursorIndex; i < leafCount; i += 1) {
        callback(freezeEntry(leafEntryAt(cursorLeaf, i)));
      }
      cursorLeaf = cursorLeaf.next;
      cursorIndex = 0;
      continue;
    }
    const limit = findBoundaryEnd(
      state,
      cursorLeaf,
      endKey,
      upperExclusive,
      leafCount,
    );
    for (let i = cursorIndex; i < limit; i += 1) {
      callback(freezeEntry(leafEntryAt(cursorLeaf, i)));
    }
    return;
  }
};

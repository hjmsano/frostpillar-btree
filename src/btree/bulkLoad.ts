import { BTreeInvariantError, BTreeValidationError } from '../errors.js';
import { maybeAutoScale } from './autoScale.js';
import {
  createBranchNode,
  createLeafNode,
  type BTreeNode,
  type BTreeState,
  type BranchNode,
  type EntryId,
  type LeafEntry,
  type LeafNode,
} from './types.js';

/** Compute chunk sizes that satisfy min-occupancy, single-pass. Returns end-indices. */
const computeChunkBoundaries = (total: number, max: number, min: number): number[] => {
  const boundaries: number[] = [];
  let offset = 0;
  while (offset < total) {
    const remaining = total - offset;
    if (remaining > max && remaining - max < min) {
      const half = Math.ceil(remaining / 2);
      boundaries.push(offset + half);
      boundaries.push(total);
      break;
    }
    const end = offset + max < total ? offset + max : total;
    boundaries.push(end);
    offset = end;
  }
  return boundaries;
};

/** Build leaf nodes from entries, assigning EntryIds and populating the id array. */
const buildLeaves = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  entries: readonly { key: TKey; value: TValue }[],
  ids: EntryId[],
  baseSequence: number,
): LeafNode<TKey, TValue>[] => {
  const boundaries = computeChunkBoundaries(entries.length, state.maxLeafEntries, state.minLeafEntries);
  const leaves = new Array<LeafNode<TKey, TValue>>(boundaries.length);
  let chunkStart = 0;
  for (let c = 0; c < boundaries.length; c += 1) {
    const chunkEnd = boundaries[c];
    const chunk = new Array<LeafEntry<TKey, TValue>>(chunkEnd - chunkStart);
    for (let i = chunkStart; i < chunkEnd; i += 1) {
      const seq = (baseSequence + i) as EntryId;
      chunk[i - chunkStart] = { key: entries[i].key, entryId: seq, value: entries[i].value };
      ids[i] = seq;
      if (state.entryKeys !== null) {
        state.entryKeys.set(seq, entries[i].key);
      }
    }
    leaves[c] = createLeafNode<TKey, TValue>(chunk, null);
    chunkStart = chunkEnd;
  }
  return leaves;
};

export const bulkLoadEntries = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  entries: readonly { key: TKey; value: TValue }[],
): EntryId[] => {
  if (state.entryCount !== 0) {
    throw new BTreeInvariantError('bulk load requires empty tree');
  }

  const baseSequence = state.nextSequence;
  if (baseSequence + entries.length > Number.MAX_SAFE_INTEGER) {
    throw new BTreeValidationError('Sequence overflow.');
  }

  const ids = new Array<EntryId>(entries.length);
  const leaves = buildLeaves(state, entries, ids, baseSequence);

  state.nextSequence = baseSequence + entries.length;
  state.entryCount = entries.length;

  for (let i = 0; i < leaves.length; i += 1) {
    if (i > 0) leaves[i].prev = leaves[i - 1];
    if (i < leaves.length - 1) leaves[i].next = leaves[i + 1];
  }
  state.leftmostLeaf = leaves[0];
  state.rightmostLeaf = leaves[leaves.length - 1];

  if (leaves.length === 1) {
    state.root = leaves[0];
  } else {
    let currentLevel: BTreeNode<TKey, TValue>[] = leaves;
    while (currentLevel.length > 1) {
      const bounds = computeChunkBoundaries(currentLevel.length, state.maxBranchChildren, state.minBranchChildren);
      const nextLevel = new Array<BranchNode<TKey, TValue>>(bounds.length);
      let start = 0;
      for (let b = 0; b < bounds.length; b += 1) {
        nextLevel[b] = createBranchNode(currentLevel.slice(start, bounds[b]), null);
        start = bounds[b];
      }
      currentLevel = nextLevel;
    }
    state.root = currentLevel[0];
  }

  maybeAutoScale(state);
  return ids;
};

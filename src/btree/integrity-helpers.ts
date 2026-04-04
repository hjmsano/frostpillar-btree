import { BTreeInvariantError, BTreeValidationError } from '../errors.js';
import {
  isLeafNode,
  leafEntryAt,
  leafEntryCount,
  type BTreeNode,
  type BTreeState,
  type KeyComparator,
  type NodeKey,
} from './types.js';

export const nodeMinKey = <TKey, TValue>(
  node: BTreeNode<TKey, TValue>,
): NodeKey<TKey> | null => {
  if (isLeafNode(node)) {
    if (node.entryOffset >= node.entries.length) return null;
    const e = node.entries[node.entryOffset];
    return { key: e.key, sequence: e.entryId };
  }

  if (node.childOffset >= node.keys.length) return null;
  return { key: node.keys[node.childOffset].key, sequence: node.keys[node.childOffset].sequence };
};

export const compareNodeKeys = <TKey>(
  comparator: KeyComparator<TKey>,
  leftKey: TKey,
  leftSeq: number,
  rightKey: TKey,
  rightSeq: number,
): number => {
  const cmp = comparator(leftKey, rightKey);
  if (cmp !== 0) {
    return cmp;
  }
  return leftSeq - rightSeq;
};

const getNodeMaxKey = <TKey, TValue>(
  node: BTreeNode<TKey, TValue>,
): NodeKey<TKey> | null => {
  if (isLeafNode(node)) {
    if (node.entryOffset >= node.entries.length) return null;
    const e = node.entries[node.entries.length - 1];
    return { key: e.key, sequence: e.entryId };
  }

  if (node.childOffset >= node.children.length) {
    return null;
  }

  return getNodeMaxKey(node.children[node.children.length - 1]);
};

const validateComparatorResult = (result: number): number => {
  if (!Number.isFinite(result)) {
    throw new BTreeValidationError(
      'compareKeys must return a finite number.',
    );
  }
  return result;
};

const assertComparatorReflexivity = <TKey>(
  comparator: KeyComparator<TKey>,
  key: TKey,
): void => {
  const selfCompared = validateComparatorResult(comparator(key, key));
  if (selfCompared !== 0) {
    throw new BTreeValidationError(
      'compareKeys must satisfy reflexivity: compare(x, x) must return 0.',
    );
  }
};

const assertComparatorTransitivity = <TKey>(
  comparator: KeyComparator<TKey>,
  first: TKey,
  second: TKey,
  third: TKey,
): void => {
  const firstToSecond = Math.sign(
    validateComparatorResult(comparator(first, second)),
  );
  const secondToThird = Math.sign(
    validateComparatorResult(comparator(second, third)),
  );

  if (firstToSecond < 0 && secondToThird < 0) {
    const firstToThird = Math.sign(
      validateComparatorResult(comparator(first, third)),
    );
    if (firstToThird >= 0) {
      throw new BTreeValidationError(
        'compareKeys must satisfy transitivity for observed key triples.',
      );
    }
  }

  if (firstToSecond > 0 && secondToThird > 0) {
    const firstToThird = Math.sign(
      validateComparatorResult(comparator(first, third)),
    );
    if (firstToThird <= 0) {
      throw new BTreeValidationError(
        'compareKeys must satisfy transitivity for observed key triples.',
      );
    }
  }
};

export const assertReflexivityAsInvariant = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  key: TKey,
): void => {
  try {
    assertComparatorReflexivity(state.compareKeys, key);
  } catch (error) {
    if (error instanceof BTreeValidationError) {
      throw new BTreeInvariantError(error.message);
    }
    throw error;
  }
};

export const assertTransitivityAsInvariant = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  first: TKey,
  second: TKey,
  third: TKey,
): void => {
  try {
    assertComparatorTransitivity(state.compareKeys, first, second, third);
  } catch (error) {
    if (error instanceof BTreeValidationError) {
      throw new BTreeInvariantError(error.message);
    }
    throw error;
  }
};

const validateLeafChainStep = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  cursor: BTreeNode<TKey, TValue>,
  previous: BTreeNode<TKey, TValue> | null,
  visited: Set<BTreeNode<TKey, TValue>>,
): void => {
  if (!isLeafNode(cursor)) {
    throw new BTreeInvariantError('Leaf linkage cursor reached non-leaf node.');
  }
  if (visited.has(cursor)) {
    throw new BTreeInvariantError('Cycle detected in leaf linkage.');
  }
  if (cursor.prev !== previous) {
    throw new BTreeInvariantError('Leaf prev pointer mismatch.');
  }

  if (previous !== null && isLeafNode(previous)) {
    const prevMax = getNodeMaxKey(previous);
    const currentMin = nodeMinKey(cursor);
    if (prevMax === null || currentMin === null) {
      throw new BTreeInvariantError('Non-empty tree leaf chain contains empty leaf node.');
    }
    if (compareNodeKeys(state.compareKeys, prevMax.key, prevMax.sequence, currentMin.key, currentMin.sequence) > 0) {
      throw new BTreeInvariantError('Adjacent leaf key ranges are out of order.');
    }
    const prevCount = leafEntryCount(previous);
    const curCount = leafEntryCount(cursor);
    if (
      state.duplicateKeys !== 'allow'
      && prevCount > 0
      && curCount > 0
      && state.compareKeys(
        leafEntryAt(previous, prevCount - 1).key,
        leafEntryAt(cursor, 0).key,
      ) === 0
    ) {
      throw new BTreeInvariantError('Duplicate user key detected across adjacent leaves with uniqueness policy.');
    }
  }
};

export const validateLeafLinks = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  expectedLeafCount: number,
): void => {
  if (state.entryCount === 0) {
    if (!isLeafNode(state.root)) {
      throw new BTreeInvariantError('Empty tree root must be a leaf node.');
    }
    if (
      state.leftmostLeaf !== state.root ||
      state.rightmostLeaf !== state.root
    ) {
      throw new BTreeInvariantError('Empty tree leaf pointers must reference root leaf.');
    }
    return;
  }

  if (state.leftmostLeaf.prev !== null) {
    throw new BTreeInvariantError('Leftmost leaf prev pointer must be null.');
  }
  if (state.rightmostLeaf.next !== null) {
    throw new BTreeInvariantError('Rightmost leaf next pointer must be null.');
  }

  const visited = new Set<BTreeNode<TKey, TValue>>();
  let cursor: BTreeNode<TKey, TValue> | null = state.leftmostLeaf;
  let previous: BTreeNode<TKey, TValue> | null = null;
  let leafCount = 0;

  while (cursor !== null) {
    validateLeafChainStep(state, cursor, previous, visited);
    visited.add(cursor);
    previous = cursor;
    cursor = cursor.next;
    leafCount += 1;
  }

  if (previous !== state.rightmostLeaf) {
    throw new BTreeInvariantError('Rightmost leaf pointer mismatch.');
  }
  if (leafCount !== expectedLeafCount) {
    throw new BTreeInvariantError('Leaf chain count mismatch with tree traversal count.');
  }
};

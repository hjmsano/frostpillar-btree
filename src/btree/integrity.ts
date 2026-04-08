import { BTreeInvariantError } from '../errors.js';
import { computeAutoScaleTier } from './autoScale.js';
import { applyLazyThreshold } from './rebalance.js';
import {
  isLeafNode,
  leafEntryAt,
  leafEntryCount,
  type BTreeNode,
  type BTreeState,
  type BranchNode,
  type NodeKey,
  type LeafNode,
} from './types.js';
import {
  assertReflexivityAsInvariant,
  assertTransitivityAsInvariant,
  compareNodeKeys,
  nodeMinKey,
  validateLeafLinks,
} from './integrity-helpers.js';

interface NodeValidationResult<TKey> {
  minKey: NodeKey<TKey> | null;
  maxKey: NodeKey<TKey> | null;
  leafDepth: number | null;
  leafCount: number;
  branchCount: number;
  entryCount: number;
}

const validateLeafNodeOrdering = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  node: LeafNode<TKey, TValue>,
): void => {
  const count = leafEntryCount(node);

  for (let i = 0; i < count; i += 1) {
    assertReflexivityAsInvariant(state, leafEntryAt(node, i).key);
  }

  for (let index = 1; index < count; index += 1) {
    if (
      compareNodeKeys(
        state.compareKeys,
        leafEntryAt(node, index - 1).key,
        leafEntryAt(node, index - 1).entryId,
        leafEntryAt(node, index).key,
        leafEntryAt(node, index).entryId,
      ) >= 0
    ) {
      throw new BTreeInvariantError('Leaf entries are not strictly ordered.');
    }
  }

  if (state.duplicateKeys !== 'allow') {
    for (let index = 1; index < count; index += 1) {
      if (
        state.compareKeys(
          leafEntryAt(node, index - 1).key,
          leafEntryAt(node, index).key,
        ) === 0
      ) {
        throw new BTreeInvariantError(
          'Duplicate user key detected in tree with uniqueness policy.',
        );
      }
    }
  }

  for (let index = 2; index < count; index += 1) {
    const first = leafEntryAt(node, index - 2);
    const second = leafEntryAt(node, index - 1);
    const third = leafEntryAt(node, index);
    assertTransitivityAsInvariant(state, first.key, second.key, third.key);
  }

  if (count > state.maxLeafEntries) {
    throw new BTreeInvariantError('Leaf node exceeds maximum occupancy.');
  }
};

const validateLeafNode = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  node: LeafNode<TKey, TValue>,
  depth: number,
): NodeValidationResult<TKey> => {
  validateLeafNodeOrdering(state, node);

  const count = leafEntryCount(node);

  let baseMinLeaf = state.autoScale
    ? Math.ceil(computeAutoScaleTier(0).maxLeaf / 2)
    : state.minLeafEntries;
  if (state.deleteRebalancePolicy === 'lazy') {
    baseMinLeaf = applyLazyThreshold(baseMinLeaf);
  }
  if (node !== state.root && count < baseMinLeaf) {
    throw new BTreeInvariantError(
      'Non-root leaf node violates minimum occupancy.',
    );
  }

  const first = count === 0 ? null : leafEntryAt(node, 0);
  const last = count === 0 ? null : leafEntryAt(node, count - 1);
  const minKey =
    first === null ? null : { key: first.key, sequence: first.entryId };
  const maxKey =
    last === null ? null : { key: last.key, sequence: last.entryId };

  return {
    minKey,
    maxKey,
    leafDepth: count === 0 ? null : depth,
    leafCount: 1,
    branchCount: 0,
    entryCount: count,
  };
};

const validateBranchStructure = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  node: BranchNode<TKey, TValue>,
): void => {
  const liveCount = node.children.length - node.childOffset;
  if (liveCount === 0) {
    throw new BTreeInvariantError('Branch node has zero children.');
  }
  const baseMinBranch = state.autoScale
    ? Math.ceil(computeAutoScaleTier(0).maxBranch / 2)
    : state.minBranchChildren;
  if (node !== state.root && liveCount < baseMinBranch) {
    throw new BTreeInvariantError(
      'Non-root branch node violates minimum occupancy.',
    );
  }
  if (liveCount > state.maxBranchChildren) {
    throw new BTreeInvariantError('Branch node exceeds maximum occupancy.');
  }
  if (node.keys.length !== node.children.length) {
    throw new BTreeInvariantError(
      'Branch keys array length does not match children array length.',
    );
  }
};

const validateBranchChild = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  node: BranchNode<TKey, TValue>,
  childIndex: number,
  depth: number,
): NodeValidationResult<TKey> => {
  const child: BTreeNode<TKey, TValue> = node.children[childIndex];
  if (child.parent !== node) {
    throw new BTreeInvariantError(
      'Child-parent pointer mismatch in branch node.',
    );
  }
  if (child.indexInParent !== childIndex) {
    throw new BTreeInvariantError(
      'Child indexInParent does not match actual position in parent.',
    );
  }

  const childValidation = validateNode(state, child, depth + 1);
  if (childValidation.minKey === null || childValidation.maxKey === null) {
    throw new BTreeInvariantError(
      'Branch child must not be empty in non-root branch tree.',
    );
  }

  const cachedMinKey = node.keys[childIndex];
  const actualMinKey = nodeMinKey<TKey, TValue>(child);
  if (
    actualMinKey === null ||
    compareNodeKeys(
      state.compareKeys,
      cachedMinKey.key,
      cachedMinKey.sequence,
      actualMinKey.key,
      actualMinKey.sequence,
    ) !== 0
  ) {
    throw new BTreeInvariantError(
      'Branch cached key does not match actual child minimum key.',
    );
  }

  return childValidation;
};

const mergeChildValidation = <TKey>(
  state: BTreeState<TKey, unknown>,
  accumulated: {
    leafDepth: number | null;
    leafCount: number;
    branchCount: number;
    entryCount: number;
    minKey: NodeKey<TKey> | null;
    maxKey: NodeKey<TKey> | null;
    previousChildMax: NodeKey<TKey> | null;
  },
  childValidation: NodeValidationResult<TKey>,
): void => {
  if (
    accumulated.leafDepth !== null &&
    childValidation.leafDepth !== null &&
    childValidation.leafDepth !== accumulated.leafDepth
  ) {
    throw new BTreeInvariantError('Leaf depth mismatch detected in tree.');
  }
  if (accumulated.leafDepth === null && childValidation.leafDepth !== null) {
    accumulated.leafDepth = childValidation.leafDepth;
  }

  if (
    accumulated.previousChildMax !== null &&
    compareNodeKeys(
      state.compareKeys,
      accumulated.previousChildMax.key,
      accumulated.previousChildMax.sequence,
      childValidation.minKey!.key,
      childValidation.minKey!.sequence,
    ) >= 0
  ) {
    throw new BTreeInvariantError(
      'Branch child key ranges are not strictly ordered.',
    );
  }

  if (accumulated.minKey === null) accumulated.minKey = childValidation.minKey;
  accumulated.maxKey = childValidation.maxKey;
  accumulated.previousChildMax = childValidation.maxKey;

  accumulated.leafCount += childValidation.leafCount;
  accumulated.branchCount += childValidation.branchCount;
  accumulated.entryCount += childValidation.entryCount;
};

const validateNode = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  node: BTreeNode<TKey, TValue>,
  depth: number,
): NodeValidationResult<TKey> => {
  if (isLeafNode(node)) {
    return validateLeafNode(state, node, depth);
  }

  validateBranchStructure(state, node);

  const acc = {
    leafDepth: null as number | null,
    leafCount: 0,
    branchCount: 1,
    entryCount: 0,
    minKey: null as NodeKey<TKey> | null,
    maxKey: null as NodeKey<TKey> | null,
    previousChildMax: null as NodeKey<TKey> | null,
  };

  for (
    let childIndex = node.childOffset;
    childIndex < node.children.length;
    childIndex += 1
  ) {
    const childValidation = validateBranchChild(state, node, childIndex, depth);
    mergeChildValidation(state, acc, childValidation);
  }

  return {
    minKey: acc.minKey,
    maxKey: acc.maxKey,
    leafDepth: acc.leafDepth,
    leafCount: acc.leafCount,
    branchCount: acc.branchCount,
    entryCount: acc.entryCount,
  };
};

export const assertInvariants = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
): void => {
  const validation = validateNode(state, state.root, 0);
  if (validation.entryCount !== state.entryCount) {
    throw new BTreeInvariantError(
      'Index entry count mismatch between tree traversal and tracked state.',
    );
  }

  validateLeafLinks(state, validation.leafCount);
};

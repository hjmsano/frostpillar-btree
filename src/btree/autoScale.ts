import { BTreeValidationError } from '../errors.js';
import {
  DEFAULT_MAX_BRANCH_CHILDREN,
  DEFAULT_MAX_LEAF_ENTRIES,
  createLeafNode,
  normalizeNodeCapacity,
  normalizeDuplicateKeyPolicy,
  type BTreeState,
  type EntryId,
  type InMemoryBTreeConfig,
} from './types.js';

export const minOccupancy = (max: number): number => Math.ceil(max / 2);

const AUTO_SCALE_TIERS: readonly { readonly threshold: number; readonly maxLeaf: number; readonly maxBranch: number }[] = [
  { threshold: 0,         maxLeaf: 32,  maxBranch: 32 },
  { threshold: 1_000,     maxLeaf: 64,  maxBranch: 64 },
  { threshold: 10_000,    maxLeaf: 128, maxBranch: 128 },
  { threshold: 100_000,   maxLeaf: 256, maxBranch: 128 },
  { threshold: 1_000_000, maxLeaf: 512, maxBranch: 256 },
];

export const computeAutoScaleTier = (entryCount: number): { readonly maxLeaf: number; readonly maxBranch: number } => {
  let tier = AUTO_SCALE_TIERS[0];
  for (let i = 1; i < AUTO_SCALE_TIERS.length; i += 1) {
    if (entryCount >= AUTO_SCALE_TIERS[i].threshold) {
      tier = AUTO_SCALE_TIERS[i];
    } else {
      break;
    }
  }
  return tier;
};

export const computeNextAutoScaleThreshold = (entryCount: number): number => {
  for (let i = 1; i < AUTO_SCALE_TIERS.length; i += 1) {
    if (entryCount < AUTO_SCALE_TIERS[i].threshold) {
      return AUTO_SCALE_TIERS[i].threshold;
    }
  }
  return Number.MAX_SAFE_INTEGER;
};

export const createInitialState = <TKey, TValue>(
  config: InMemoryBTreeConfig<TKey>,
): BTreeState<TKey, TValue> => {
  if (typeof config.compareKeys !== 'function') {
    throw new BTreeValidationError('compareKeys must be a function.');
  }
  const autoScale = config.autoScale === true;
  if (autoScale && (config.maxLeafEntries !== undefined || config.maxBranchChildren !== undefined)) {
    throw new BTreeValidationError('autoScale conflicts with explicit capacity.');
  }
  let maxLeafEntries: number;
  let maxBranchChildren: number;
  if (autoScale) {
    const tier = computeAutoScaleTier(0);
    maxLeafEntries = tier.maxLeaf;
    maxBranchChildren = tier.maxBranch;
  } else {
    maxLeafEntries = normalizeNodeCapacity(config.maxLeafEntries, 'maxLeafEntries', DEFAULT_MAX_LEAF_ENTRIES);
    maxBranchChildren = normalizeNodeCapacity(config.maxBranchChildren, 'maxBranchChildren', DEFAULT_MAX_BRANCH_CHILDREN);
  }
  const duplicateKeys = normalizeDuplicateKeyPolicy(config.duplicateKeys);
  const emptyLeaf = createLeafNode<TKey, TValue>([], null);
  return {
    compareKeys: config.compareKeys,
    maxLeafEntries,
    maxBranchChildren,
    duplicateKeys,
    minLeafEntries: minOccupancy(maxLeafEntries),
    minBranchChildren: minOccupancy(maxBranchChildren),
    root: emptyLeaf,
    leftmostLeaf: emptyLeaf,
    rightmostLeaf: emptyLeaf,
    entryCount: 0,
    nextSequence: 0,
    entryKeys: config.enableEntryIdLookup === true ? new Map<EntryId, TKey>() : null,
    autoScale,
    _nextAutoScaleThreshold: autoScale ? computeNextAutoScaleThreshold(0) : Number.MAX_SAFE_INTEGER,
    _cursor: { leaf: emptyLeaf, index: 0 },
  };
};

export const maybeAutoScale = <TKey, TValue>(state: BTreeState<TKey, TValue>): void => {
  if (state.entryCount < state._nextAutoScaleThreshold) return;
  const { maxLeaf, maxBranch } = computeAutoScaleTier(state.entryCount);
  if (maxLeaf > state.maxLeafEntries) {
    state.maxLeafEntries = maxLeaf;
    state.minLeafEntries = minOccupancy(maxLeaf);
  }
  if (maxBranch > state.maxBranchChildren) {
    state.maxBranchChildren = maxBranch;
    state.minBranchChildren = minOccupancy(maxBranch);
  }
  state._nextAutoScaleThreshold = computeNextAutoScaleThreshold(state.entryCount);
};

export const applyAutoScaleCapacitySnapshot = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
  maxLeafEntries: number,
  maxBranchChildren: number,
): void => {
  if (!state.autoScale) {
    return;
  }

  const baseTier = computeAutoScaleTier(0);
  const normalizedLeaf = normalizeNodeCapacity(
    maxLeafEntries,
    'maxLeafEntries',
    DEFAULT_MAX_LEAF_ENTRIES,
  );
  const normalizedBranch = normalizeNodeCapacity(
    maxBranchChildren,
    'maxBranchChildren',
    DEFAULT_MAX_BRANCH_CHILDREN,
  );

  if (normalizedLeaf < baseTier.maxLeaf || normalizedBranch < baseTier.maxBranch) {
    throw new BTreeValidationError(
      'autoScale capacity snapshot must be >= tier-0 capacities.',
    );
  }

  state.maxLeafEntries = normalizedLeaf;
  state.maxBranchChildren = normalizedBranch;
  state.minLeafEntries = minOccupancy(normalizedLeaf);
  state.minBranchChildren = minOccupancy(normalizedBranch);
};

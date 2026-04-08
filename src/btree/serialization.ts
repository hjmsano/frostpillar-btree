import { BTreeValidationError } from '../errors.js';
import { computeAutoScaleTier } from './autoScale.js';
import {
  leafEntryAt,
  leafEntryCount,
  MAX_NODE_CAPACITY,
  MIN_NODE_CAPACITY,
  type BTreeState,
  type DeleteRebalancePolicy,
  type DuplicateKeyPolicy,
  type InMemoryBTreeConfig,
  type KeyComparator,
  type LeafNode,
} from './types.js';

export interface BTreeJSON<TKey, TValue> {
  version: number;
  config: {
    maxLeafEntries: number;
    maxBranchChildren: number;
    duplicateKeys: DuplicateKeyPolicy;
    enableEntryIdLookup: boolean;
    autoScale: boolean;
    deleteRebalancePolicy?: DeleteRebalancePolicy;
  };
  entries: [TKey, TValue][];
}

export const buildConfigFromState = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
): InMemoryBTreeConfig<TKey> => {
  const config: InMemoryBTreeConfig<TKey> = {
    compareKeys: state.compareKeys,
    duplicateKeys: state.duplicateKeys,
    enableEntryIdLookup: state.entryKeys !== null,
    autoScale: state.autoScale,
    deleteRebalancePolicy: state.deleteRebalancePolicy,
  };
  if (!state.autoScale) {
    config.maxLeafEntries = state.maxLeafEntries;
    config.maxBranchChildren = state.maxBranchChildren;
  }
  return config;
};

export const serializeToJSON = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
): BTreeJSON<TKey, TValue> => {
  const entries = new Array<[TKey, TValue]>(state.entryCount);
  let leaf: LeafNode<TKey, TValue> | null = state.leftmostLeaf;
  let writeIdx = 0;
  while (leaf !== null) {
    const count = leafEntryCount(leaf);
    for (let i = 0; i < count; i += 1) {
      const e = leafEntryAt(leaf, i);
      entries[writeIdx++] = [e.key, e.value];
    }
    leaf = leaf.next;
  }
  const config: BTreeJSON<TKey, TValue>['config'] = {
    maxLeafEntries: state.maxLeafEntries,
    maxBranchChildren: state.maxBranchChildren,
    duplicateKeys: state.duplicateKeys,
    enableEntryIdLookup: state.entryKeys !== null,
    autoScale: state.autoScale,
  };
  if (state.deleteRebalancePolicy !== 'standard') {
    config.deleteRebalancePolicy = state.deleteRebalancePolicy;
  }
  return { version: 1, config, entries };
};

const MAX_SERIALIZED_ENTRIES = 1_000_000;

const validateStructure = <TKey, TValue>(
  json: BTreeJSON<TKey, TValue>,
): void => {
  if (typeof json !== 'object' || json === null || json.version !== 1) {
    throw new BTreeValidationError(
      `BTreeJSON: expected version 1, got ${String((json as { version?: unknown })?.version)}.`,
    );
  }
  if (typeof json.config !== 'object' || json.config === null) {
    throw new BTreeValidationError('BTreeJSON: invalid config.');
  }
  if (!Array.isArray(json.entries)) {
    throw new BTreeValidationError('BTreeJSON: entries must be array.');
  }
  if (json.entries.length > MAX_SERIALIZED_ENTRIES) {
    throw new BTreeValidationError('BTreeJSON: entry count exceeds maximum.');
  }
  for (let i = 0; i < json.entries.length; i += 1) {
    const entry = json.entries[i];
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new BTreeValidationError(`BTreeJSON: bad entries[${i}].`);
    }
  }
};

const validateConfig = <TKey, TValue>(
  cfg: BTreeJSON<TKey, TValue>['config'],
): void => {
  const validateCapacity = (
    field: 'maxLeafEntries' | 'maxBranchChildren',
    value: number,
  ): void => {
    if (
      !Number.isInteger(value) ||
      value < MIN_NODE_CAPACITY ||
      value > MAX_NODE_CAPACITY
    ) {
      throw new BTreeValidationError(`BTreeJSON: invalid ${field}.`);
    }
  };

  if (
    cfg.duplicateKeys !== 'allow' &&
    cfg.duplicateKeys !== 'reject' &&
    cfg.duplicateKeys !== 'replace'
  ) {
    throw new BTreeValidationError(
      `BTreeJSON: invalid duplicateKeys: ${String(cfg.duplicateKeys)}.`,
    );
  }
  if (typeof cfg.enableEntryIdLookup !== 'boolean') {
    throw new BTreeValidationError('BTreeJSON: invalid enableEntryIdLookup.');
  }
  if (typeof cfg.autoScale !== 'boolean') {
    throw new BTreeValidationError('BTreeJSON: invalid autoScale.');
  }

  if (typeof cfg.maxLeafEntries !== 'number') {
    throw new BTreeValidationError('BTreeJSON: invalid maxLeafEntries.');
  }
  if (typeof cfg.maxBranchChildren !== 'number') {
    throw new BTreeValidationError('BTreeJSON: invalid maxBranchChildren.');
  }

  validateCapacity('maxLeafEntries', cfg.maxLeafEntries);
  validateCapacity('maxBranchChildren', cfg.maxBranchChildren);

  if (cfg.autoScale) {
    const tier0 = computeAutoScaleTier(0);
    if (
      cfg.maxLeafEntries < tier0.maxLeaf ||
      cfg.maxBranchChildren < tier0.maxBranch
    ) {
      throw new BTreeValidationError(
        'BTreeJSON: autoScale capacity below tier-0.',
      );
    }
  }
};

export const validateBTreeJSON = <TKey, TValue>(
  json: BTreeJSON<TKey, TValue>,
): void => {
  validateStructure(json);
  validateConfig(json.config);
};

export const validateBTreeJSONSortOrder = <TKey, TValue>(
  json: BTreeJSON<TKey, TValue>,
  compareKeys: KeyComparator<TKey>,
): void => {
  const strict = json.config.duplicateKeys !== 'allow';
  for (let i = 1; i < json.entries.length; i += 1) {
    const cmp = compareKeys(json.entries[i - 1][0], json.entries[i][0]);
    if (cmp > 0) {
      throw new BTreeValidationError('fromJSON: entries not sorted.');
    }
    if (strict && cmp === 0) {
      throw new BTreeValidationError(
        'fromJSON: duplicate keys require duplicateKeys "allow".',
      );
    }
  }
};

export const buildConfigFromJSON = <TKey>(
  json: BTreeJSON<TKey, unknown>,
  compareKeys: KeyComparator<TKey>,
): InMemoryBTreeConfig<TKey> => {
  const cfg = json.config;
  const config: InMemoryBTreeConfig<TKey> = {
    compareKeys,
    duplicateKeys: cfg.duplicateKeys,
    enableEntryIdLookup: cfg.enableEntryIdLookup,
    autoScale: cfg.autoScale,
    deleteRebalancePolicy: cfg.deleteRebalancePolicy,
  };
  if (!cfg.autoScale) {
    config.maxLeafEntries = cfg.maxLeafEntries;
    config.maxBranchChildren = cfg.maxBranchChildren;
  }
  return config;
};

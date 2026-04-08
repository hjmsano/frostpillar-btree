import { BTreeValidationError } from '../errors.js';

export const DEFAULT_MAX_LEAF_ENTRIES = 64;
export const DEFAULT_MAX_BRANCH_CHILDREN = 64;
export const MIN_NODE_CAPACITY = 3;
export const MAX_NODE_CAPACITY = 16384;

export const NODE_LEAF = 0 as const;
export const NODE_BRANCH = 1 as const;

export type KeyComparator<TKey> = (left: TKey, right: TKey) => number;

export type DuplicateKeyPolicy = 'allow' | 'reject' | 'replace';

export type DeleteRebalancePolicy = 'standard' | 'lazy';

/**
 * Defines the inclusivity of the lower and upper bounds for a key range scan.
 * Both bounds default to `'inclusive'` when omitted.
 */
export interface RangeBounds {
  /** Lower bound type. Defaults to `'inclusive'` when omitted. */
  lowerBound?: 'inclusive' | 'exclusive';
  /** Upper bound type. Defaults to `'inclusive'` when omitted. */
  upperBound?: 'inclusive' | 'exclusive';
}

export const normalizeDuplicateKeyPolicy = (
  value: DuplicateKeyPolicy | undefined,
): DuplicateKeyPolicy => {
  if (value === undefined) {
    return 'replace';
  }
  if (value !== 'allow' && value !== 'reject' && value !== 'replace') {
    throw new BTreeValidationError(`Invalid duplicateKeys option.`);
  }
  return value;
};

export const normalizeDeleteRebalancePolicy = (
  value: DeleteRebalancePolicy | undefined,
): DeleteRebalancePolicy => {
  if (value === undefined) {
    return 'standard';
  }
  if (value !== 'standard' && value !== 'lazy') {
    throw new BTreeValidationError(`Invalid deleteRebalancePolicy option.`);
  }
  return value;
};

export type EntryId = number & { readonly __brand: 'EntryId' };

export interface BTreeEntry<TKey, TValue> {
  readonly entryId: EntryId;
  readonly key: TKey;
  readonly value: TValue;
}

export interface NodeKey<TKey> {
  key: TKey;
  sequence: number;
}

/** Internal mutable entry stored in leaf nodes. */
export interface LeafEntry<TKey, TValue> {
  entryId: EntryId;
  key: TKey;
  value: TValue;
}

/**
 * Shallow-copies a `LeafEntry` into a plain `BTreeEntry` for safe public API return.
 * Used by single-entry read APIs to prevent callers from holding live internal references.
 */
export const toPublicEntry = <TKey, TValue>(
  entry: LeafEntry<TKey, TValue>,
): BTreeEntry<TKey, TValue> => ({
  entryId: entry.entryId,
  key: entry.key,
  value: entry.value,
});

/**
 * Freezes and returns an internal entry for safe exposure via bulk read APIs.
 * Cheaper than toPublicEntry (no allocation) but prevents external mutation.
 * Idempotent: re-freezing an already-frozen object is a no-op in V8.
 */
export const freezeEntry = <TKey, TValue>(
  entry: LeafEntry<TKey, TValue>,
): BTreeEntry<TKey, TValue> =>
  Object.freeze(entry) as unknown as BTreeEntry<TKey, TValue>;

export interface LeafNode<TKey, TValue> {
  kind: typeof NODE_LEAF;
  entries: LeafEntry<TKey, TValue>[];
  entryOffset: number;
  parent: BranchNode<TKey, TValue> | null;
  indexInParent: number;
  prev: LeafNode<TKey, TValue> | null;
  next: LeafNode<TKey, TValue> | null;
}

export interface BranchNode<TKey, TValue> {
  kind: typeof NODE_BRANCH;
  children: BTreeNode<TKey, TValue>[];
  keys: NodeKey<TKey>[];
  childOffset: number;
  parent: BranchNode<TKey, TValue> | null;
  indexInParent: number;
}

export type BTreeNode<TKey, TValue> =
  | LeafNode<TKey, TValue>
  | BranchNode<TKey, TValue>;

export interface BTreeState<TKey, TValue> {
  compareKeys: KeyComparator<TKey>;
  maxLeafEntries: number;
  maxBranchChildren: number;
  duplicateKeys: DuplicateKeyPolicy;
  root: BTreeNode<TKey, TValue>;
  leftmostLeaf: LeafNode<TKey, TValue>;
  rightmostLeaf: LeafNode<TKey, TValue>;
  entryCount: number;
  nextSequence: number;
  minLeafEntries: number;
  minBranchChildren: number;
  entryKeys: Map<EntryId, TKey> | null;
  autoScale: boolean;
  deleteRebalancePolicy: DeleteRebalancePolicy;
  _nextAutoScaleThreshold: number;
  /** @internal Shared return object for navigation functions — never store a reference across calls. */
  _cursor: { leaf: LeafNode<TKey, TValue>; index: number };
}

export interface InMemoryBTreeConfig<TKey> {
  compareKeys: KeyComparator<TKey>;
  maxLeafEntries?: number;
  maxBranchChildren?: number;
  duplicateKeys?: DuplicateKeyPolicy;
  enableEntryIdLookup?: boolean;
  autoScale?: boolean;
  deleteRebalancePolicy?: DeleteRebalancePolicy;
}

export interface BTreeStats {
  height: number;
  leafCount: number;
  branchCount: number;
  entryCount: number;
}

export const isLeafNode = <TKey, TValue>(
  node: BTreeNode<TKey, TValue>,
): node is LeafNode<TKey, TValue> => {
  return node.kind === NODE_LEAF;
};

export const writeMinKeyTo = <TKey, TValue>(
  node: BTreeNode<TKey, TValue>,
  target: NodeKey<TKey>,
): boolean => {
  if (node.kind === NODE_LEAF) {
    if (node.entryOffset >= node.entries.length) return false;
    const e = node.entries[node.entryOffset];
    target.key = e.key;
    target.sequence = e.entryId;
    return true;
  }
  if (node.childOffset >= node.keys.length) return false;
  target.key = node.keys[node.childOffset].key;
  target.sequence = node.keys[node.childOffset].sequence;
  return true;
};

export const normalizeNodeCapacity = (
  value: number | undefined,
  field: string,
  defaultValue: number,
): number => {
  if (value === undefined) {
    return defaultValue;
  }

  if (
    !Number.isInteger(value) ||
    value < MIN_NODE_CAPACITY ||
    value > MAX_NODE_CAPACITY
  ) {
    throw new BTreeValidationError(
      `${field}: integer ${MIN_NODE_CAPACITY}–${MAX_NODE_CAPACITY} required.`,
    );
  }

  return value;
};

export {
  createLeafNode,
  createBranchNode,
  leafEntryCount,
  leafEntryAt,
  leafShiftEntry,
  leafPopEntry,
  leafUnshiftEntry,
  leafRemoveAt,
  leafInsertAt,
  leafCompact,
  branchCompact,
  branchChildCount,
  branchInsertAt,
  branchRemoveAt,
} from './node-ops.js';

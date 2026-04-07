import { BTreeInvariantError, BTreeValidationError } from '../errors.js';

export const DEFAULT_MAX_LEAF_ENTRIES = 64;
export const DEFAULT_MAX_BRANCH_CHILDREN = 64;
export const MIN_NODE_CAPACITY = 3;
export const MAX_NODE_CAPACITY = 16384;

export const NODE_LEAF = 0 as const;
export const NODE_BRANCH = 1 as const;

export type KeyComparator<TKey> = (left: TKey, right: TKey) => number;

export type DuplicateKeyPolicy = 'allow' | 'reject' | 'replace';

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
    throw new BTreeValidationError(
      `Invalid duplicateKeys option.`,
    );
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
 * Prevents callers from holding a reference that mutates when `updateById` is called.
 */
export const toPublicEntry = <TKey, TValue>(
  entry: LeafEntry<TKey, TValue>,
): BTreeEntry<TKey, TValue> => ({
  entryId: entry.entryId,
  key: entry.key,
  value: entry.value,
});

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

  if (!Number.isInteger(value) || value < MIN_NODE_CAPACITY || value > MAX_NODE_CAPACITY) {
    throw new BTreeValidationError(
      `${field}: integer ${MIN_NODE_CAPACITY}–${MAX_NODE_CAPACITY} required.`,
    );
  }

  return value;
};

export const createLeafNode = <TKey, TValue>(
  entries: LeafEntry<TKey, TValue>[],
  parent: BranchNode<TKey, TValue> | null,
): LeafNode<TKey, TValue> => {
  return {
    kind: NODE_LEAF,
    entries,
    entryOffset: 0,
    parent,
    indexInParent: 0,
    prev: null,
    next: null,
  };
};

export const createBranchNode = <TKey, TValue>(
  children: BTreeNode<TKey, TValue>[],
  parent: BranchNode<TKey, TValue> | null,
): BranchNode<TKey, TValue> => {
  const keys: NodeKey<TKey>[] = [];
  const branch: BranchNode<TKey, TValue> = {
    kind: NODE_BRANCH,
    children,
    keys,
    childOffset: 0,
    parent,
    indexInParent: 0,
  };

  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    child.parent = branch;
    child.indexInParent = i;
    const target: NodeKey<TKey> = { key: undefined as unknown as TKey, sequence: 0 };
    if (!writeMinKeyTo<TKey, TValue>(child, target)) {
      throw new BTreeInvariantError(
        'branch child has no min key',
      );
    }
    keys.push(target);
  }

  return branch;
};

/** Number of logical entries in the leaf */
export const leafEntryCount = <TKey, TValue>(leaf: LeafNode<TKey, TValue>): number =>
  leaf.entries.length - leaf.entryOffset;

/** Get logical entry at index i (0-based from the logical start) */
export const leafEntryAt = <TKey, TValue>(leaf: LeafNode<TKey, TValue>, i: number): LeafEntry<TKey, TValue> =>
  leaf.entries[leaf.entryOffset + i];

/** Remove and return the first logical entry. O(1) amortized — increments offset and compacts when dead slots reach half. */
export const leafShiftEntry = <TKey, TValue>(leaf: LeafNode<TKey, TValue>): LeafEntry<TKey, TValue> | undefined => {
  if (leaf.entryOffset >= leaf.entries.length) return undefined;
  const entry = leaf.entries[leaf.entryOffset];
  leaf.entryOffset += 1;
  if (leaf.entryOffset >= (leaf.entries.length >>> 1)) {
    leaf.entries.copyWithin(0, leaf.entryOffset);
    leaf.entries.length = leaf.entries.length - leaf.entryOffset;
    leaf.entryOffset = 0;
  }
  return entry;
};

/** Remove and return the last logical entry. O(1) — pops from the backing array tail. */
export const leafPopEntry = <TKey, TValue>(leaf: LeafNode<TKey, TValue>): LeafEntry<TKey, TValue> | undefined => {
  if (leaf.entryOffset >= leaf.entries.length) return undefined;
  return leaf.entries.pop();
};

/** Prepend entry to logical start. Falls back to unshift if no gap, otherwise fills gap. */
export const leafUnshiftEntry = <TKey, TValue>(leaf: LeafNode<TKey, TValue>, entry: LeafEntry<TKey, TValue>): void => {
  if (leaf.entryOffset > 0) {
    leaf.entryOffset -= 1;
    leaf.entries[leaf.entryOffset] = entry;
  } else {
    leaf.entries.unshift(entry);
  }
};

/** Remove logical entry at index. Shifts the smaller side to halve average cost. */
export const leafRemoveAt = <TKey, TValue>(leaf: LeafNode<TKey, TValue>, logicalIndex: number): void => {
  const count = leaf.entries.length - leaf.entryOffset;
  const phys = leaf.entryOffset + logicalIndex;
  if (logicalIndex < count - 1 - logicalIndex) {
    // Left side is smaller — shift left entries right by 1
    leaf.entries.copyWithin(leaf.entryOffset + 1, leaf.entryOffset, phys);
    leaf.entryOffset += 1;
    // Compact if dead slots exceed half
    if (leaf.entryOffset >= (leaf.entries.length >>> 1)) {
      leaf.entries.copyWithin(0, leaf.entryOffset);
      leaf.entries.length -= leaf.entryOffset;
      leaf.entryOffset = 0;
    }
  } else {
    // Right side is smaller or equal — shift right entries left by 1
    leaf.entries.copyWithin(phys, phys + 1);
    leaf.entries.length -= 1;
  }
};

/** Insert entry at logical index. Uses entryOffset gap when inserting in the first half. */
export const leafInsertAt = <TKey, TValue>(leaf: LeafNode<TKey, TValue>, logicalIndex: number, entry: LeafEntry<TKey, TValue>): void => {
  const phys = leaf.entryOffset + logicalIndex;
  if (leaf.entryOffset > 0 && logicalIndex < ((leaf.entries.length - leaf.entryOffset) >>> 1)) {
    // Insert in first half with available gap — shift left portion left by 1
    leaf.entries.copyWithin(leaf.entryOffset - 1, leaf.entryOffset, phys);
    leaf.entryOffset -= 1;
    leaf.entries[phys - 1] = entry;
  } else {
    // Default: splice to shift right portion right by 1
    leaf.entries.splice(phys, 0, entry);
  }
};

/** Compact the backing array — remove dead slots before entryOffset. Call before splits/merges. */
export const leafCompact = <TKey, TValue>(leaf: LeafNode<TKey, TValue>): void => {
  if (leaf.entryOffset > 0) {
    leaf.entries.copyWithin(0, leaf.entryOffset);
    leaf.entries.length = leaf.entries.length - leaf.entryOffset;
    leaf.entryOffset = 0;
  }
};

/** Gap size reserved at the front after compaction to allow O(1) left-prepend. */
const BRANCH_COMPACT_GAP = 1;

/** Compact branch arrays — remove dead slots before childOffset, keeping a small gap. */
export const branchCompact = <TKey, TValue>(branch: BranchNode<TKey, TValue>): void => {
  if (branch.childOffset > 0) {
    const gap = branch.childOffset <= BRANCH_COMPACT_GAP ? 0 : BRANCH_COMPACT_GAP;
    branch.children.copyWithin(gap, branch.childOffset);
    branch.children.length -= branch.childOffset - gap;
    branch.keys.copyWithin(gap, branch.childOffset);
    branch.keys.length -= branch.childOffset - gap;
    branch.childOffset = gap;
    for (let i = gap; i < branch.children.length; i += 1) {
      branch.children[i].indexInParent = i;
    }
  }
};

/** Number of logical children in the branch. */
export const branchChildCount = <TKey, TValue>(branch: BranchNode<TKey, TValue>): number =>
  branch.children.length - branch.childOffset;

/** Insert a child at a logical index. Shifts the smaller side to halve average cost. */
export const branchInsertAt = <TKey, TValue>(
  branch: BranchNode<TKey, TValue>,
  logicalIndex: number,
  child: BTreeNode<TKey, TValue>,
  key: NodeKey<TKey>,
): void => {
  const phys = branch.childOffset + logicalIndex;
  const count = branch.children.length - branch.childOffset;
  if (branch.childOffset > 0 && logicalIndex < (count >>> 1)) {
    // Left side is smaller and gap is available — shift left portion left by 1
    branch.children.copyWithin(branch.childOffset - 1, branch.childOffset, phys);
    branch.keys.copyWithin(branch.childOffset - 1, branch.childOffset, phys);
    branch.childOffset -= 1;
    branch.children[phys - 1] = child;
    branch.keys[phys - 1] = key;
    // Re-index only the shifted portion + inserted element
    for (let i = branch.childOffset; i < phys; i += 1) {
      branch.children[i].indexInParent = i;
    }
    child.indexInParent = phys - 1;
  } else {
    // Right side — shift right portion right by 1 via splice
    branch.children.splice(phys, 0, child);
    branch.keys.splice(phys, 0, key);
    // Re-index from insertion point onward
    for (let i = phys; i < branch.children.length; i += 1) {
      branch.children[i].indexInParent = i;
    }
  }
};

/** Remove a child at a physical index. Shifts the smaller side. */
export const branchRemoveAt = <TKey, TValue>(
  branch: BranchNode<TKey, TValue>,
  physIndex: number,
): void => {
  const logicalIndex = physIndex - branch.childOffset;
  const count = branch.children.length - branch.childOffset;
  if (logicalIndex < count - 1 - logicalIndex) {
    // Left side is smaller — shift left entries right by 1
    branch.children.copyWithin(branch.childOffset + 1, branch.childOffset, physIndex);
    branch.keys.copyWithin(branch.childOffset + 1, branch.childOffset, physIndex);
    branch.childOffset += 1;
    // Re-index shifted portion
    for (let i = branch.childOffset; i <= physIndex; i += 1) {
      branch.children[i].indexInParent = i;
    }
    // Auto-compact if dead slots reach half
    if (branch.childOffset >= (branch.children.length >>> 1)) {
      branchCompact(branch);
    }
  } else {
    // Right side is smaller or equal — shift right entries left by 1
    branch.children.copyWithin(physIndex, physIndex + 1);
    branch.keys.copyWithin(physIndex, physIndex + 1);
    branch.children.length -= 1;
    branch.keys.length -= 1;
    for (let i = physIndex; i < branch.children.length; i += 1) {
      branch.children[i].indexInParent = i;
    }
  }
};


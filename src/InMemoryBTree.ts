import { deleteRangeEntries } from './btree/deleteRange.js';
import { applyAutoScaleCapacitySnapshot } from './btree/autoScale.js';
import {
  putEntry,
  putManyEntries,
  peekEntryById,
  popFirstEntry,
  popLastEntry,
  removeEntryById,
  removeFirstMatchingEntry,
  updateEntryById,
} from './btree/mutations.js';
import { findFirstMatchingUserKey, findLastMatchingUserKey, findNextHigherKey, findNextLowerKey, findPairOrNextLower, hasKeyEntry } from './btree/navigation.js';
import { countRangeEntries, rangeQueryEntries } from './btree/rangeQuery.js';
import {
  buildConfigFromJSON,
  buildConfigFromState,
  serializeToJSON,
  validateBTreeJSON,
  type BTreeJSON,
} from './btree/serialization.js';
import {
  computeAutoScaleTier,
  computeNextAutoScaleThreshold,
  createInitialState,
  minOccupancy,
} from './btree/autoScale.js';
import {
  createLeafNode,
  leafEntryAt,
  leafEntryCount,
  toPublicEntry,
  type BTreeEntry,
  type BTreeState,
  type BTreeStats,
  type DuplicateKeyPolicy,
  type EntryId,
  type InMemoryBTreeConfig,
  type KeyComparator,
  type LeafNode,
  type RangeBounds,
} from './btree/types.js';
import { BTreeValidationError } from './errors.js';
import { assertInvariants } from './btree/integrity.js';
import { getStats } from './btree/stats.js';

export type { BTreeJSON };
export type { BTreeEntry, BTreeStats, DuplicateKeyPolicy, EntryId, InMemoryBTreeConfig, RangeBounds };

export class InMemoryBTree<TKey, TValue> {
  private readonly state: BTreeState<TKey, TValue>;

  public constructor(config: InMemoryBTreeConfig<TKey>) {
    this.state = createInitialState<TKey, TValue>(config);
  }

  public put(key: TKey, value: TValue): EntryId {
    return putEntry(this.state, key, value);
  }

  public putMany(entries: readonly { key: TKey; value: TValue }[]): EntryId[] {
    return putManyEntries(this.state, entries);
  }

  public remove(key: TKey): BTreeEntry<TKey, TValue> | null {
    const entry = removeFirstMatchingEntry(this.state, key);
    if (entry === null) return null;
    return toPublicEntry(entry);
  }

  public removeById(entryId: EntryId): BTreeEntry<TKey, TValue> | null {
    if (this.state.entryKeys === null) {
      throw new BTreeValidationError('Requires enableEntryIdLookup: true.');
    }
    const entry = removeEntryById(this.state, entryId);
    if (entry === null) return null;
    return toPublicEntry(entry);
  }

  public peekById(entryId: EntryId): BTreeEntry<TKey, TValue> | null {
    if (this.state.entryKeys === null) {
      throw new BTreeValidationError('Requires enableEntryIdLookup: true.');
    }
    const entry = peekEntryById(this.state, entryId);
    if (entry === null) return null;
    return toPublicEntry(entry);
  }

  public updateById(entryId: EntryId, value: TValue): BTreeEntry<TKey, TValue> | null {
    if (this.state.entryKeys === null) {
      throw new BTreeValidationError('Requires enableEntryIdLookup: true.');
    }
    const entry = updateEntryById(this.state, entryId, value);
    if (entry === null) return null;
    return toPublicEntry(entry);
  }

  public popFirst(): BTreeEntry<TKey, TValue> | null {
    const entry = popFirstEntry(this.state);
    if (entry === null) return null;
    return toPublicEntry(entry);
  }

  public peekFirst(): BTreeEntry<TKey, TValue> | null {
    if (this.state.entryCount === 0) {
      return null;
    }
    return toPublicEntry(leafEntryAt(this.state.leftmostLeaf, 0));
  }

  public peekLast(): BTreeEntry<TKey, TValue> | null {
    if (this.state.entryCount === 0) {
      return null;
    }
    const leaf = this.state.rightmostLeaf;
    return toPublicEntry(leafEntryAt(leaf, leafEntryCount(leaf) - 1));
  }

  public popLast(): BTreeEntry<TKey, TValue> | null {
    const entry = popLastEntry(this.state);
    if (entry === null) return null;
    return toPublicEntry(entry);
  }

  public clear(): void {
    const emptyLeaf = createLeafNode<TKey, TValue>([], null);
    this.state.root = emptyLeaf;
    this.state.leftmostLeaf = emptyLeaf;
    this.state.rightmostLeaf = emptyLeaf;
    this.state.entryCount = 0;
    this.state._cursor.leaf = emptyLeaf;
    this.state._cursor.index = 0;
    if (this.state.entryKeys !== null) {
      this.state.entryKeys.clear();
    }
    if (this.state.autoScale) {
      const tier = computeAutoScaleTier(0);
      this.state.maxLeafEntries = tier.maxLeaf;
      this.state.maxBranchChildren = tier.maxBranch;
      this.state.minLeafEntries = minOccupancy(tier.maxLeaf);
      this.state.minBranchChildren = minOccupancy(tier.maxBranch);
      this.state._nextAutoScaleThreshold = computeNextAutoScaleThreshold(0);
    }
  }

  public get(key: TKey): TValue | null {
    const found = findFirstMatchingUserKey(this.state, key);
    if (found === null) return null;
    return leafEntryAt(found.leaf, found.index).value;
  }

  public hasKey(key: TKey): boolean {
    return hasKeyEntry(this.state, key);
  }

  public findFirst(key: TKey): BTreeEntry<TKey, TValue> | null {
    const found = findFirstMatchingUserKey(this.state, key);
    if (found === null) return null;
    return toPublicEntry(leafEntryAt(found.leaf, found.index));
  }

  /**
   * Returns the last entry whose key matches `key`, or `null` if not found.
   * Useful when `duplicateKeys` is `'allow'` and multiple entries share the same key.
   */
  public findLast(key: TKey): BTreeEntry<TKey, TValue> | null {
    const found = findLastMatchingUserKey(this.state, key);
    if (found === null) return null;
    return toPublicEntry(leafEntryAt(found.leaf, found.index));
  }

  /**
   * Returns the smallest key in the tree that is strictly greater than `key`,
   * or `null` if no such key exists.
   */
  public nextHigherKey(key: TKey): TKey | null {
    return findNextHigherKey(this.state, key);
  }

  /**
   * Returns the largest key in the tree that is strictly less than `key`,
   * or `null` if no such key exists.
   */
  public nextLowerKey(key: TKey): TKey | null {
    return findNextLowerKey(this.state, key);
  }

  /**
   * Returns the entry for `key` if it exists; otherwise returns the entry with
   * the largest key strictly less than `key`. Returns `null` when the tree is
   * empty or every key is greater than `key`.
   */
  public getPairOrNextLower(key: TKey): BTreeEntry<TKey, TValue> | null {
    const found = findPairOrNextLower(this.state, key);
    if (found === null) return null;
    return toPublicEntry(leafEntryAt(found.leaf, found.index));
  }

  /**
   * Returns the number of entries whose keys fall within [`startKey`, `endKey`].
   * Pass `options` to make either bound exclusive.
   */
  public count(startKey: TKey, endKey: TKey, options?: RangeBounds): number {
    return countRangeEntries(this.state, startKey, endKey, options);
  }

  /**
   * Deletes all entries whose keys fall within [`startKey`, `endKey`].
   * Pass `options` to make either bound exclusive.
   * @returns The number of entries deleted.
   */
  public deleteRange(startKey: TKey, endKey: TKey, options?: RangeBounds): number {
    return deleteRangeEntries(this.state, startKey, endKey, options);
  }

  public range(startKey: TKey, endKey: TKey, options?: RangeBounds): BTreeEntry<TKey, TValue>[] {
    return rangeQueryEntries(this.state, startKey, endKey, options).map(toPublicEntry);
  }

  public *entries(): IterableIterator<BTreeEntry<TKey, TValue>> {
    let leaf: LeafNode<TKey, TValue> | null = this.state.leftmostLeaf;
    while (leaf !== null) {
      const count = leafEntryCount(leaf);
      for (let i = 0; i < count; i += 1) {
        yield toPublicEntry(leafEntryAt(leaf, i));
      }
      leaf = leaf.next;
    }
  }

  public *entriesReversed(): IterableIterator<BTreeEntry<TKey, TValue>> {
    let leaf: LeafNode<TKey, TValue> | null = this.state.rightmostLeaf;
    while (leaf !== null) {
      const count = leafEntryCount(leaf);
      for (let i = count - 1; i >= 0; i -= 1) {
        yield toPublicEntry(leafEntryAt(leaf, i));
      }
      leaf = leaf.prev;
    }
  }

  public *keys(): IterableIterator<TKey> {
    for (const entry of this.entries()) {
      yield entry.key;
    }
  }

  public *values(): IterableIterator<TValue> {
    for (const entry of this.entries()) {
      yield entry.value;
    }
  }

  public [Symbol.iterator](): IterableIterator<BTreeEntry<TKey, TValue>> {
    return this.entries();
  }

  public forEach(callback: (entry: BTreeEntry<TKey, TValue>) => void, thisArg?: unknown): void {
    let leaf: LeafNode<TKey, TValue> | null = this.state.leftmostLeaf;
    while (leaf !== null) {
      const count = leafEntryCount(leaf);
      for (let i = 0; i < count; i += 1) {
        callback.call(thisArg, toPublicEntry(leafEntryAt(leaf, i)));
      }
      leaf = leaf.next;
    }
  }

  public snapshot(): BTreeEntry<TKey, TValue>[] {
    const result = new Array<BTreeEntry<TKey, TValue>>(this.state.entryCount);
    let leaf: LeafNode<TKey, TValue> | null = this.state.leftmostLeaf;
    let writeIdx = 0;
    while (leaf !== null) {
      const count = leafEntryCount(leaf);
      for (let i = 0; i < count; i += 1) {
        result[writeIdx++] = toPublicEntry(leafEntryAt(leaf, i));
      }
      leaf = leaf.next;
    }
    return result;
  }

  /**
   * Returns a new `InMemoryBTree` with identical configuration and a deep copy
   * of all entries. The clone shares no mutable state with the original.
   * Note: `EntryId` values are reassigned in the clone — IDs from the source tree are not valid for the clone.
   */
  public clone(): InMemoryBTree<TKey, TValue> {
    const cloned = new InMemoryBTree<TKey, TValue>(buildConfigFromState(this.state));
    applyAutoScaleCapacitySnapshot(
      cloned.state,
      this.state.maxLeafEntries,
      this.state.maxBranchChildren,
    );
    if (this.state.entryCount > 0) {
      // Traverse leaf chain directly — stored entries satisfy { key, value }
      const pairs = new Array<BTreeEntry<TKey, TValue>>(this.state.entryCount);
      let leaf: LeafNode<TKey, TValue> | null = this.state.leftmostLeaf;
      let writeIdx = 0;
      while (leaf !== null) {
        const count = leafEntryCount(leaf);
        for (let i = 0; i < count; i += 1) {
          pairs[writeIdx++] = leafEntryAt(leaf, i);
        }
        leaf = leaf.next;
      }
      cloned.putMany(pairs);
    }
    return cloned;
  }

  public toJSON(): BTreeJSON<TKey, TValue> {
    return serializeToJSON(this.state);
  }

  public static fromJSON<TKey, TValue>(
    json: BTreeJSON<TKey, TValue>,
    compareKeys: KeyComparator<TKey>,
  ): InMemoryBTree<TKey, TValue> {
    validateBTreeJSON(json);
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
    const tree = new InMemoryBTree<TKey, TValue>(buildConfigFromJSON(json, compareKeys));
    applyAutoScaleCapacitySnapshot(
      tree.state,
      json.config.maxLeafEntries,
      json.config.maxBranchChildren,
    );
    if (json.entries.length > 0) {
      const pairs = new Array<{ key: TKey; value: TValue }>(json.entries.length);
      for (let i = 0; i < json.entries.length; i += 1) {
        pairs[i] = { key: json.entries[i][0], value: json.entries[i][1] };
      }
      tree.putMany(pairs);
    }
    return tree;
  }

  public size(): number {
    return this.state.entryCount;
  }

  public assertInvariants(): void {
    assertInvariants(this.state);
  }

  public getStats(): BTreeStats {
    return getStats(this.state);
  }
}

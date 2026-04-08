import { deleteRangeEntries } from './btree/deleteRange.js';
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
import {
  findFirstMatchingUserKey,
  findLastMatchingUserKey,
  findNextHigherKey,
  findNextLowerKey,
  findPairOrNextLower,
  hasKeyEntry,
} from './btree/navigation.js';
import {
  countRangeEntries,
  forEachRangeEntries,
  rangeQueryPublicEntries,
} from './btree/rangeQuery.js';
import {
  buildConfigFromJSON,
  buildConfigFromState,
  serializeToJSON,
  validateBTreeJSON,
  validateBTreeJSONSortOrder,
  type BTreeJSON,
} from './btree/serialization.js';
import {
  applyAutoScaleCapacitySnapshot,
  createInitialState,
  resetAutoScaleToTier0,
} from './btree/autoScale.js';
import {
  createLeafNode,
  freezeEntry,
  leafEntryAt,
  leafEntryCount,
  toPublicEntry,
  type BTreeEntry,
  type BTreeState,
  type BTreeStats,
  type DeleteRebalancePolicy,
  type DuplicateKeyPolicy,
  type EntryId,
  type InMemoryBTreeConfig,
  type KeyComparator,
  type LeafNode,
  type RangeBounds,
} from './btree/types.js';
import {
  collectInternalEntries,
  forEachEntry,
  snapshotEntries,
} from './btree/traversal.js';
import { BTreeValidationError } from './errors.js';
import { assertInvariants } from './btree/integrity.js';
import { getStats } from './btree/stats.js';

export type {
  BTreeEntry,
  BTreeJSON,
  BTreeStats,
  DeleteRebalancePolicy,
  DuplicateKeyPolicy,
  EntryId,
  InMemoryBTreeConfig,
  RangeBounds,
};

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

  public updateById(
    entryId: EntryId,
    value: TValue,
  ): BTreeEntry<TKey, TValue> | null {
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
    this.state.entryKeys?.clear();
    if (this.state.autoScale) {
      resetAutoScaleToTier0(this.state);
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

  public findLast(key: TKey): BTreeEntry<TKey, TValue> | null {
    const found = findLastMatchingUserKey(this.state, key);
    if (found === null) return null;
    return toPublicEntry(leafEntryAt(found.leaf, found.index));
  }

  public nextHigherKey(key: TKey): TKey | null {
    return findNextHigherKey(this.state, key);
  }
  public nextLowerKey(key: TKey): TKey | null {
    return findNextLowerKey(this.state, key);
  }

  public getPairOrNextLower(key: TKey): BTreeEntry<TKey, TValue> | null {
    const found = findPairOrNextLower(this.state, key);
    if (found === null) return null;
    return toPublicEntry(leafEntryAt(found.leaf, found.index));
  }

  public count(startKey: TKey, endKey: TKey, options?: RangeBounds): number {
    return countRangeEntries(this.state, startKey, endKey, options);
  }

  public deleteRange(
    startKey: TKey,
    endKey: TKey,
    options?: RangeBounds,
  ): number {
    return deleteRangeEntries(this.state, startKey, endKey, options);
  }

  public range(
    startKey: TKey,
    endKey: TKey,
    options?: RangeBounds,
  ): BTreeEntry<TKey, TValue>[] {
    return rangeQueryPublicEntries(this.state, startKey, endKey, options);
  }

  public *entries(): IterableIterator<BTreeEntry<TKey, TValue>> {
    let leaf: LeafNode<TKey, TValue> | null = this.state.leftmostLeaf;
    while (leaf !== null) {
      const count = leafEntryCount(leaf);
      for (let i = 0; i < count; i += 1) {
        yield freezeEntry(leafEntryAt(leaf, i));
      }
      leaf = leaf.next;
    }
  }

  public *entriesReversed(): IterableIterator<BTreeEntry<TKey, TValue>> {
    let leaf: LeafNode<TKey, TValue> | null = this.state.rightmostLeaf;
    while (leaf !== null) {
      const count = leafEntryCount(leaf);
      for (let i = count - 1; i >= 0; i -= 1) {
        yield freezeEntry(leafEntryAt(leaf, i));
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

  public forEachRange(
    startKey: TKey,
    endKey: TKey,
    callback: (entry: BTreeEntry<TKey, TValue>) => void,
    options?: RangeBounds,
  ): void {
    forEachRangeEntries(this.state, startKey, endKey, callback, options);
  }

  public forEach(
    callback: (entry: BTreeEntry<TKey, TValue>) => void,
    thisArg?: unknown,
  ): void {
    forEachEntry(this.state, callback, thisArg);
  }

  public snapshot(): BTreeEntry<TKey, TValue>[] {
    return snapshotEntries(this.state);
  }

  public clone(): InMemoryBTree<TKey, TValue> {
    const cloned = new InMemoryBTree<TKey, TValue>(
      buildConfigFromState(this.state),
    );
    applyAutoScaleCapacitySnapshot(
      cloned.state,
      this.state.maxLeafEntries,
      this.state.maxBranchChildren,
    );
    if (this.state.entryCount > 0) {
      cloned.putMany(collectInternalEntries(this.state));
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
    validateBTreeJSONSortOrder(json, compareKeys);
    const tree = new InMemoryBTree<TKey, TValue>(
      buildConfigFromJSON(json, compareKeys),
    );
    applyAutoScaleCapacitySnapshot(
      tree.state,
      json.config.maxLeafEntries,
      json.config.maxBranchChildren,
    );
    if (json.entries.length > 0) {
      const pairs = new Array<{ key: TKey; value: TValue }>(
        json.entries.length,
      );
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

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
} from './btree/autoScale.js';
import {
  createLeafNode,
  leafEntryAt,
  leafEntryCount,
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
    return removeFirstMatchingEntry(this.state, key);
  }

  public removeById(entryId: EntryId): BTreeEntry<TKey, TValue> | null {
    if (this.state.entryKeys === null) {
      throw new BTreeValidationError('Requires enableEntryIdLookup: true.');
    }
    return removeEntryById(this.state, entryId);
  }

  public peekById(entryId: EntryId): BTreeEntry<TKey, TValue> | null {
    if (this.state.entryKeys === null) {
      throw new BTreeValidationError('Requires enableEntryIdLookup: true.');
    }
    return peekEntryById(this.state, entryId);
  }

  public updateById(entryId: EntryId, value: TValue): BTreeEntry<TKey, TValue> | null {
    if (this.state.entryKeys === null) {
      throw new BTreeValidationError('Requires enableEntryIdLookup: true.');
    }
    return updateEntryById(this.state, entryId, value);
  }

  public popFirst(): BTreeEntry<TKey, TValue> | null {
    return popFirstEntry(this.state);
  }

  public peekFirst(): BTreeEntry<TKey, TValue> | null {
    if (this.state.entryCount === 0) {
      return null;
    }
    return leafEntryAt(this.state.leftmostLeaf, 0);
  }

  public peekLast(): BTreeEntry<TKey, TValue> | null {
    if (this.state.entryCount === 0) {
      return null;
    }
    const leaf = this.state.rightmostLeaf;
    return leafEntryAt(leaf, leafEntryCount(leaf) - 1);
  }

  public popLast(): BTreeEntry<TKey, TValue> | null {
    return popLastEntry(this.state);
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
      this.state.minLeafEntries = Math.ceil(tier.maxLeaf / 2);
      this.state.minBranchChildren = Math.ceil(tier.maxBranch / 2);
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
    return leafEntryAt(found.leaf, found.index);
  }

  public findLast(key: TKey): BTreeEntry<TKey, TValue> | null {
    const found = findLastMatchingUserKey(this.state, key);
    if (found === null) return null;
    return leafEntryAt(found.leaf, found.index);
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
    return leafEntryAt(found.leaf, found.index);
  }

  public count(startKey: TKey, endKey: TKey, options?: RangeBounds): number {
    return countRangeEntries(this.state, startKey, endKey, options);
  }

  public deleteRange(startKey: TKey, endKey: TKey, options?: RangeBounds): number {
    return deleteRangeEntries(this.state, startKey, endKey, options);
  }

  public range(startKey: TKey, endKey: TKey, options?: RangeBounds): BTreeEntry<TKey, TValue>[] {
    return rangeQueryEntries(this.state, startKey, endKey, options);
  }

  public *entries(): IterableIterator<BTreeEntry<TKey, TValue>> {
    let leaf: LeafNode<TKey, TValue> | null = this.state.leftmostLeaf;
    while (leaf !== null) {
      const count = leafEntryCount(leaf);
      for (let i = 0; i < count; i += 1) {
        yield leafEntryAt(leaf, i);
      }
      leaf = leaf.next;
    }
  }

  public *entriesReversed(): IterableIterator<BTreeEntry<TKey, TValue>> {
    let leaf: LeafNode<TKey, TValue> | null = this.state.rightmostLeaf;
    while (leaf !== null) {
      const count = leafEntryCount(leaf);
      for (let i = count - 1; i >= 0; i -= 1) {
        yield leafEntryAt(leaf, i);
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
        callback.call(thisArg, leafEntryAt(leaf, i));
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
        result[writeIdx++] = leafEntryAt(leaf, i);
      }
      leaf = leaf.next;
    }
    return result;
  }

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

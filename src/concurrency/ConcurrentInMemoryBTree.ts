import {
  InMemoryBTree,
  type BTreeEntry,
  type BTreeJSON,
  type BTreeStats,
  type EntryId,
  type RangeBounds,
} from '../InMemoryBTree.js';
import type { KeyComparator } from '../btree/types.js';
import type { ConcurrentInMemoryBTreeConfig } from './types.js';
import {
  computeConfigFingerprint,
  normalizeMaxSyncMutationsPerBatch,
  normalizeMaxRetries,
  normalizeReadMode,
} from './helpers.js';
import { Coordinator } from './coordinator.js';
import {
  createClearEvaluator,
  createDeleteRangeEvaluator,
  createPopFirstEvaluator,
  createPopLastEvaluator,
  createPutEvaluator,
  createPutManyEvaluator,
  createRemoveByIdEvaluator,
  createRemoveEvaluator,
  createUpdateByIdEvaluator,
} from './writeOps.js';

export class ConcurrentInMemoryBTree<TKey, TValue> {
  private readonly coord: Coordinator<TKey, TValue>;
  private readonly compareKeys: KeyComparator<TKey>;
  private readonly duplicateKeys: 'allow' | 'reject' | 'replace';

  public constructor(config: ConcurrentInMemoryBTreeConfig<TKey, TValue>) {
    this.compareKeys = config.compareKeys;
    this.duplicateKeys = config.duplicateKeys ?? 'replace';
    const tree = new InMemoryBTree<TKey, TValue>({
      compareKeys: config.compareKeys,
      maxLeafEntries: config.maxLeafEntries,
      maxBranchChildren: config.maxBranchChildren,
      duplicateKeys: config.duplicateKeys,
      enableEntryIdLookup: config.enableEntryIdLookup,
      autoScale: config.autoScale,
      deleteRebalancePolicy: config.deleteRebalancePolicy,
    });
    this.coord = new Coordinator(
      tree,
      config.store,
      normalizeMaxRetries(config.maxRetries),
      normalizeMaxSyncMutationsPerBatch(config.maxSyncMutationsPerBatch),
      computeConfigFingerprint(config),
      normalizeReadMode(config.readMode),
    );
  }

  public async sync(): Promise<void> {
    await this.coord.runExclusive(async () => {
      await this.coord.syncUnlocked();
    });
  }

  public async syncThenRead<TResult>(
    fn: (tree: InMemoryBTree<TKey, TValue>) => TResult,
  ): Promise<TResult> {
    return this.coord.runExclusive(async () => {
      await this.coord.syncUnlocked();
      return fn(this.coord.tree);
    });
  }

  public async put(key: TKey, value: TValue): Promise<EntryId> {
    return this.coord.writeOp(
      createPutEvaluator(this.duplicateKeys, key, value),
    ) as Promise<EntryId>;
  }
  public async remove(key: TKey): Promise<BTreeEntry<TKey, TValue> | null> {
    return this.coord.writeOp(createRemoveEvaluator(key));
  }
  public async removeById(
    entryId: EntryId,
  ): Promise<BTreeEntry<TKey, TValue> | null> {
    return this.coord.writeOp(createRemoveByIdEvaluator(entryId));
  }
  public async updateById(
    entryId: EntryId,
    value: TValue,
  ): Promise<BTreeEntry<TKey, TValue> | null> {
    return this.coord.writeOp(createUpdateByIdEvaluator(entryId, value));
  }
  public async popFirst(): Promise<BTreeEntry<TKey, TValue> | null> {
    return this.coord.writeOp(createPopFirstEvaluator());
  }
  public async popLast(): Promise<BTreeEntry<TKey, TValue> | null> {
    return this.coord.writeOp(createPopLastEvaluator());
  }
  public async putMany(
    entries: readonly { key: TKey; value: TValue }[],
  ): Promise<EntryId[]> {
    if (entries.length === 0) return [];
    return this.coord.writeOp(
      createPutManyEvaluator(entries, this.duplicateKeys, this.compareKeys),
    ) as Promise<EntryId[]>;
  }
  public async deleteRange(
    startKey: TKey,
    endKey: TKey,
    options?: RangeBounds,
  ): Promise<number> {
    const result = await this.coord.writeOp(
      createDeleteRangeEvaluator(startKey, endKey, options),
    );
    return result ?? 0;
  }
  public async clear(): Promise<void> {
    await this.coord.writeOp(createClearEvaluator());
  }

  public async get(key: TKey): Promise<TValue | null> {
    return this.coord.readOp((t) => t.get(key));
  }
  public async hasKey(key: TKey): Promise<boolean> {
    return this.coord.readOp((t) => t.hasKey(key));
  }
  public async findFirst(key: TKey): Promise<BTreeEntry<TKey, TValue> | null> {
    return this.coord.readOp((t) => t.findFirst(key));
  }
  public async findLast(key: TKey): Promise<BTreeEntry<TKey, TValue> | null> {
    return this.coord.readOp((t) => t.findLast(key));
  }
  public async range(
    startKey: TKey,
    endKey: TKey,
    options?: RangeBounds,
  ): Promise<BTreeEntry<TKey, TValue>[]> {
    return this.coord.readOp((t) => t.range(startKey, endKey, options));
  }
  public async snapshot(): Promise<BTreeEntry<TKey, TValue>[]> {
    return this.coord.readOp((t) => t.snapshot());
  }
  public async size(): Promise<number> {
    return this.coord.readOp((t) => t.size());
  }
  public async assertInvariants(): Promise<void> {
    await this.coord.readOp((t) => t.assertInvariants());
  }
  public async getStats(): Promise<BTreeStats> {
    return this.coord.readOp((t) => t.getStats());
  }
  public async peekFirst(): Promise<BTreeEntry<TKey, TValue> | null> {
    return this.coord.readOp((t) => t.peekFirst());
  }
  public async peekLast(): Promise<BTreeEntry<TKey, TValue> | null> {
    return this.coord.readOp((t) => t.peekLast());
  }
  public async peekById(
    entryId: EntryId,
  ): Promise<BTreeEntry<TKey, TValue> | null> {
    return this.coord.readOp((t) => t.peekById(entryId));
  }
  public async count(
    startKey: TKey,
    endKey: TKey,
    options?: RangeBounds,
  ): Promise<number> {
    return this.coord.readOp((t) => t.count(startKey, endKey, options));
  }
  public async nextHigherKey(key: TKey): Promise<TKey | null> {
    return this.coord.readOp((t) => t.nextHigherKey(key));
  }
  public async nextLowerKey(key: TKey): Promise<TKey | null> {
    return this.coord.readOp((t) => t.nextLowerKey(key));
  }
  public async getPairOrNextLower(
    key: TKey,
  ): Promise<BTreeEntry<TKey, TValue> | null> {
    return this.coord.readOp((t) => t.getPairOrNextLower(key));
  }
  public async entries(): Promise<BTreeEntry<TKey, TValue>[]> {
    return this.coord.readOp((t) => Array.from(t.entries()));
  }
  public async entriesReversed(): Promise<BTreeEntry<TKey, TValue>[]> {
    return this.coord.readOp((t) => Array.from(t.entriesReversed()));
  }
  public async keys(): Promise<TKey[]> {
    return this.coord.readOp((t) => Array.from(t.keys()));
  }
  public async values(): Promise<TValue[]> {
    return this.coord.readOp((t) => Array.from(t.values()));
  }
  public async forEach(
    callback: (entry: BTreeEntry<TKey, TValue>) => void,
  ): Promise<void> {
    await this.coord.readOp((t) => {
      t.forEach(callback);
    });
  }
  public async forEachRange(
    startKey: TKey,
    endKey: TKey,
    callback: (entry: BTreeEntry<TKey, TValue>) => void,
    options?: RangeBounds,
  ): Promise<void> {
    await this.coord.readOp((t) => {
      t.forEachRange(startKey, endKey, callback, options);
    });
  }

  public async *[Symbol.asyncIterator](): AsyncIterableIterator<
    BTreeEntry<TKey, TValue>
  > {
    const all = await this.entries();
    for (const entry of all) yield entry;
  }
  public async clone(): Promise<InMemoryBTree<TKey, TValue>> {
    return this.coord.readOp((t) => t.clone());
  }
  public async toJSON(): Promise<BTreeJSON<TKey, TValue>> {
    return this.coord.readOp((t) => t.toJSON());
  }
  public static fromJSON<TKey, TValue>(
    json: BTreeJSON<TKey, TValue>,
    compareKeys: KeyComparator<TKey>,
  ): InMemoryBTree<TKey, TValue> {
    return InMemoryBTree.fromJSON(json, compareKeys);
  }
}

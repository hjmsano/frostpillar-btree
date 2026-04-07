import { InMemoryBTree, type BTreeEntry, type BTreeJSON, type BTreeStats, type DuplicateKeyPolicy, type EntryId, type RangeBounds } from '../InMemoryBTree.js';
import type { KeyComparator } from '../btree/types.js';
import { BTreeConcurrencyError } from '../errors.js';
import type { BTreeMutation, ConcurrentInMemoryBTreeConfig, ReadMode } from './types.js';
import {
  type MutationResult,
  assertAppendVersionContract,
  computeConfigFingerprint,
  normalizeMaxSyncMutationsPerBatch,
  normalizeMaxRetries,
  normalizeReadMode,
  validateMutationBatch,
} from './helpers.js';
import {
  applyMutationLocal,
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
  private readonly store: ConcurrentInMemoryBTreeConfig<TKey, TValue>['store'];
  private readonly compareKeys: KeyComparator<TKey>;
  private readonly maxRetries: number;
  private readonly maxSyncMutationsPerBatch: number;
  private readonly duplicateKeys: DuplicateKeyPolicy;
  private readonly configFingerprint: string;
  private readonly readMode: ReadMode;
  private readonly tree: InMemoryBTree<TKey, TValue>;
  private currentVersion: bigint;
  private operationQueue: Promise<void>;
  private initSeen: boolean;
  private corrupted: boolean;

  public constructor(config: ConcurrentInMemoryBTreeConfig<TKey, TValue>) {
    this.store = config.store;
    this.compareKeys = config.compareKeys;
    this.maxRetries = normalizeMaxRetries(config.maxRetries);
    this.maxSyncMutationsPerBatch = normalizeMaxSyncMutationsPerBatch(
      config.maxSyncMutationsPerBatch,
    );
    this.duplicateKeys = config.duplicateKeys ?? 'replace';
    this.readMode = normalizeReadMode(config.readMode);
    this.configFingerprint = computeConfigFingerprint(config);
    this.tree = new InMemoryBTree<TKey, TValue>({
      compareKeys: config.compareKeys,
      maxLeafEntries: config.maxLeafEntries,
      maxBranchChildren: config.maxBranchChildren,
      duplicateKeys: config.duplicateKeys,
      enableEntryIdLookup: config.enableEntryIdLookup,
      autoScale: config.autoScale,
    });
    this.currentVersion = 0n;
    this.operationQueue = Promise.resolve();
    this.initSeen = false;
    this.corrupted = false;
  }

  public async sync(): Promise<void> {
    await this.runExclusive(async (): Promise<void> => {
      await this.syncUnlocked();
    });
  }

  private async syncUnlocked(): Promise<void> {
    const log = await this.store.getLogEntriesSince(this.currentVersion);
    if (typeof log.version !== 'bigint') {
      throw new BTreeConcurrencyError('Store contract: version must be bigint.');
    }
    if (!Array.isArray(log.mutations)) {
      throw new BTreeConcurrencyError('Store contract: mutations must be an array.');
    }
    if (log.mutations.length > this.maxSyncMutationsPerBatch) {
      throw new BTreeConcurrencyError(
        `Sync batch exceeded limit (${String(this.maxSyncMutationsPerBatch)}).`,
      );
    }
    if (log.version <= this.currentVersion) {
      return;
    }
    validateMutationBatch(log.mutations, this.configFingerprint);
    try {
      for (const mutation of log.mutations) {
        applyMutationLocal(this.tree, mutation, () => { this.initSeen = true; });
      }
      this.currentVersion = log.version;
    } catch {
      this.corrupted = true;
      throw new BTreeConcurrencyError(
        'Replay failure: instance is permanently corrupted. Discard and create a new instance.',
      );
    }
  }

  private runExclusive<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    const run = async (): Promise<TResult> => {
      if (this.corrupted) {
        throw new BTreeConcurrencyError(
          'Instance is permanently corrupted. Discard and create a new instance.',
        );
      }
      return operation();
    };
    const result = this.operationQueue.then(run, run);
    this.operationQueue = result.then(
      (): void => undefined,
      (): void => undefined,
    );
    return result;
  }

  private readOp<TResult>(fn: (tree: InMemoryBTree<TKey, TValue>) => TResult): Promise<TResult> {
    return this.runExclusive(async (): Promise<TResult> => {
      if (this.readMode === 'strong') {
        await this.syncUnlocked();
      }
      return fn(this.tree);
    });
  }

  private async appendMutationAndApplyUnlocked<
    TMutation extends BTreeMutation<TKey, TValue>,
  >(
    evaluate: (tree: InMemoryBTree<TKey, TValue>) => TMutation | null,
  ): Promise<MutationResult<TKey, TValue, TMutation> | null> {
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      await this.syncUnlocked();
      const mutation = evaluate(this.tree);
      if (mutation === null) {
        return null;
      }
      const expectedVersion = this.currentVersion;
      const mutations: BTreeMutation<TKey, TValue>[] = this.initSeen
        ? [mutation]
        : [{ type: 'init', configFingerprint: this.configFingerprint }, mutation];
      const appendResult = await this.store.append(expectedVersion, mutations);
      assertAppendVersionContract(expectedVersion, appendResult);
      if (appendResult.applied) {
        for (const m of mutations) {
          if (m === mutation) break;
          applyMutationLocal(this.tree, m, () => { this.initSeen = true; });
        }
        const localResult = applyMutationLocal(
          this.tree, mutation, () => { this.initSeen = true; },
        ) as MutationResult<TKey, TValue, TMutation>;
        this.currentVersion = appendResult.version;
        return localResult;
      }
    }
    throw new BTreeConcurrencyError(
      `Mutation failed after ${String(this.maxRetries)} retries.`,
    );
  }

  public async put(key: TKey, value: TValue): Promise<EntryId> {
    return this.runExclusive(async (): Promise<EntryId> => {
      return this.appendMutationAndApplyUnlocked(
        createPutEvaluator(this.duplicateKeys, key, value),
      ) as Promise<EntryId>;
    });
  }

  public async remove(key: TKey): Promise<BTreeEntry<TKey, TValue> | null> {
    return this.runExclusive(async (): Promise<BTreeEntry<TKey, TValue> | null> => {
      return this.appendMutationAndApplyUnlocked(createRemoveEvaluator(key));
    });
  }

  public async removeById(entryId: EntryId): Promise<BTreeEntry<TKey, TValue> | null> {
    return this.runExclusive(async (): Promise<BTreeEntry<TKey, TValue> | null> => {
      return this.appendMutationAndApplyUnlocked(createRemoveByIdEvaluator(entryId));
    });
  }

  public async updateById(entryId: EntryId, value: TValue): Promise<BTreeEntry<TKey, TValue> | null> {
    return this.runExclusive(async (): Promise<BTreeEntry<TKey, TValue> | null> => {
      return this.appendMutationAndApplyUnlocked(createUpdateByIdEvaluator(entryId, value));
    });
  }

  public async popFirst(): Promise<BTreeEntry<TKey, TValue> | null> {
    return this.runExclusive(async (): Promise<BTreeEntry<TKey, TValue> | null> => {
      return this.appendMutationAndApplyUnlocked(createPopFirstEvaluator());
    });
  }

  public async popLast(): Promise<BTreeEntry<TKey, TValue> | null> {
    return this.runExclusive(async (): Promise<BTreeEntry<TKey, TValue> | null> => {
      return this.appendMutationAndApplyUnlocked(createPopLastEvaluator());
    });
  }

  public async putMany(entries: readonly { key: TKey; value: TValue }[]): Promise<EntryId[]> {
    if (entries.length === 0) {
      return [];
    }
    return this.runExclusive(async (): Promise<EntryId[]> => {
      return this.appendMutationAndApplyUnlocked(
        createPutManyEvaluator(entries, this.duplicateKeys, this.compareKeys),
      ) as Promise<EntryId[]>;
    });
  }

  public async deleteRange(startKey: TKey, endKey: TKey, options?: RangeBounds): Promise<number> {
    return this.runExclusive(async (): Promise<number> => {
      const result = await this.appendMutationAndApplyUnlocked(
        createDeleteRangeEvaluator(startKey, endKey, options),
      );
      return result ?? 0;
    });
  }

  public async clear(): Promise<void> {
    await this.runExclusive(async (): Promise<void> => {
      await this.appendMutationAndApplyUnlocked(createClearEvaluator());
    });
  }

  public async get(key: TKey): Promise<TValue | null> {
    return this.readOp((tree) => tree.get(key));
  }

  public async hasKey(key: TKey): Promise<boolean> {
    return this.readOp((tree) => tree.hasKey(key));
  }

  public async findFirst(key: TKey): Promise<BTreeEntry<TKey, TValue> | null> {
    return this.readOp((tree) => tree.findFirst(key));
  }

  public async findLast(key: TKey): Promise<BTreeEntry<TKey, TValue> | null> {
    return this.readOp((tree) => tree.findLast(key));
  }

  public async range(startKey: TKey, endKey: TKey, options?: RangeBounds): Promise<BTreeEntry<TKey, TValue>[]> {
    return this.readOp((tree) => tree.range(startKey, endKey, options));
  }

  public async snapshot(): Promise<BTreeEntry<TKey, TValue>[]> {
    return this.readOp((tree) => tree.snapshot());
  }

  public async size(): Promise<number> {
    return this.readOp((tree) => tree.size());
  }

  public async assertInvariants(): Promise<void> {
    await this.readOp((tree) => tree.assertInvariants());
  }

  public async getStats(): Promise<BTreeStats> {
    return this.readOp((tree) => tree.getStats());
  }

  public async peekFirst(): Promise<BTreeEntry<TKey, TValue> | null> {
    return this.readOp((tree) => tree.peekFirst());
  }

  public async peekLast(): Promise<BTreeEntry<TKey, TValue> | null> {
    return this.readOp((tree) => tree.peekLast());
  }

  public async peekById(entryId: EntryId): Promise<BTreeEntry<TKey, TValue> | null> {
    return this.readOp((tree) => tree.peekById(entryId));
  }

  public async count(startKey: TKey, endKey: TKey, options?: RangeBounds): Promise<number> {
    return this.readOp((tree) => tree.count(startKey, endKey, options));
  }

  public async nextHigherKey(key: TKey): Promise<TKey | null> {
    return this.readOp((tree) => tree.nextHigherKey(key));
  }

  public async nextLowerKey(key: TKey): Promise<TKey | null> {
    return this.readOp((tree) => tree.nextLowerKey(key));
  }

  public async getPairOrNextLower(key: TKey): Promise<BTreeEntry<TKey, TValue> | null> {
    return this.readOp((tree) => tree.getPairOrNextLower(key));
  }

  public async entries(): Promise<BTreeEntry<TKey, TValue>[]> {
    return this.readOp((tree) => Array.from(tree.entries()));
  }

  public async entriesReversed(): Promise<BTreeEntry<TKey, TValue>[]> {
    return this.readOp((tree) => Array.from(tree.entriesReversed()));
  }

  public async keys(): Promise<TKey[]> {
    return this.readOp((tree) => Array.from(tree.keys()));
  }

  public async values(): Promise<TValue[]> {
    return this.readOp((tree) => Array.from(tree.values()));
  }

  public async forEach(callback: (entry: BTreeEntry<TKey, TValue>) => void): Promise<void> {
    await this.readOp((tree) => { tree.forEach(callback); });
  }

  public async *[Symbol.asyncIterator](): AsyncIterableIterator<BTreeEntry<TKey, TValue>> {
    const all = await this.entries();
    for (const entry of all) {
      yield entry;
    }
  }

  public async clone(): Promise<InMemoryBTree<TKey, TValue>> {
    return this.readOp((tree) => tree.clone());
  }

  public async toJSON(): Promise<BTreeJSON<TKey, TValue>> {
    return this.readOp((tree) => tree.toJSON());
  }

  public static fromJSON<TKey, TValue>(
    json: BTreeJSON<TKey, TValue>,
    compareKeys: KeyComparator<TKey>,
  ): InMemoryBTree<TKey, TValue> {
    return InMemoryBTree.fromJSON(json, compareKeys);
  }
}

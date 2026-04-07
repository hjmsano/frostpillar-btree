import { InMemoryBTree, type BTreeEntry, type BTreeJSON, type BTreeStats, type DuplicateKeyPolicy, type EntryId, type RangeBounds } from '../InMemoryBTree.js';
import type { KeyComparator } from '../btree/types.js';
import { BTreeConcurrencyError, BTreeValidationError } from '../errors.js';
import type { BTreeMutation, ConcurrentInMemoryBTreeConfig } from './types.js';
import {
  type AnyMutationResult,
  type MutationResult,
  assertAppendVersionContract,
  assertNeverMutation,
  computeConfigFingerprint,
  normalizeMaxSyncMutationsPerBatch,
  normalizeMaxRetries,
  normalizeReadMode,
  validateMutationBatch,
} from './helpers.js';
import type { ReadMode } from './types.js';

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
        this.applyMutationLocal(mutation);
      }
      this.currentVersion = log.version;
    } catch {
      this.corrupted = true;
      throw new BTreeConcurrencyError(
        'Replay failure: instance is permanently corrupted. Discard and create a new instance.',
      );
    }
  }

  private applyMutationLocal(
    mutation: Extract<BTreeMutation<TKey, TValue>, { type: 'put' }>,
  ): EntryId;
  private applyMutationLocal(
    mutation: Extract<BTreeMutation<TKey, TValue>, { type: 'putMany' }>,
  ): EntryId[];
  private applyMutationLocal(
    mutation: Extract<BTreeMutation<TKey, TValue>, { type: 'remove' }>,
  ): BTreeEntry<TKey, TValue> | null;
  private applyMutationLocal(
    mutation: Extract<BTreeMutation<TKey, TValue>, { type: 'removeById' }>,
  ): BTreeEntry<TKey, TValue> | null;
  private applyMutationLocal(
    mutation: Extract<BTreeMutation<TKey, TValue>, { type: 'updateById' }>,
  ): BTreeEntry<TKey, TValue> | null;
  private applyMutationLocal(
    mutation: Extract<BTreeMutation<TKey, TValue>, { type: 'popFirst' }>,
  ): BTreeEntry<TKey, TValue> | null;
  private applyMutationLocal(
    mutation: Extract<BTreeMutation<TKey, TValue>, { type: 'popLast' }>,
  ): BTreeEntry<TKey, TValue> | null;
  private applyMutationLocal(
    mutation: Extract<BTreeMutation<TKey, TValue>, { type: 'deleteRange' }>,
  ): number;
  private applyMutationLocal(
    mutation: Extract<BTreeMutation<TKey, TValue>, { type: 'clear' }>,
  ): null;
  private applyMutationLocal(
    mutation: BTreeMutation<TKey, TValue>,
  ): AnyMutationResult<TKey, TValue>;
  private applyMutationLocal(
    mutation: BTreeMutation<TKey, TValue>,
  ): AnyMutationResult<TKey, TValue> {
    switch (mutation.type) {
      case 'init':
        this.initSeen = true;
        return null;
      case 'put':
        return this.tree.put(mutation.key, mutation.value);
      case 'putMany':
        return this.tree.putMany(mutation.entries);
      case 'remove':
        return this.tree.remove(mutation.key);
      case 'removeById':
        return this.tree.removeById(mutation.entryId);
      case 'updateById':
        return this.tree.updateById(mutation.entryId, mutation.value);
      case 'popFirst':
        return this.tree.popFirst();
      case 'popLast':
        return this.tree.popLast();
      case 'deleteRange':
        return this.tree.deleteRange(mutation.startKey, mutation.endKey, mutation.options);
      case 'clear':
        this.tree.clear();
        return null;
      default:
        return assertNeverMutation(mutation);
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

  /**
   * Appends a mutation to the shared store using optimistic concurrency and,
   * on success, applies the same mutation locally in this method.
   *
   * The `evaluate` callback is called against the current (synced) local tree to
   * decide whether and what mutation to append. If the store append fails due to a
   * concurrent write, the tree is re-synced and `evaluate` is invoked again.
   *
   * The callback MUST be a pure function: it must not produce side effects and must
   * return the same logical result for equivalent tree states, because it may be
   * called multiple times across retries.
   *
   */
  private async appendMutationAndApplyUnlocked<
    TMutation extends BTreeMutation<TKey, TValue>,
  >(
    evaluate: (tree: InMemoryBTree<TKey, TValue>) => TMutation,
  ): Promise<MutationResult<TKey, TValue, TMutation>>;
  private async appendMutationAndApplyUnlocked<
    TMutation extends BTreeMutation<TKey, TValue>,
  >(
    evaluate: (tree: InMemoryBTree<TKey, TValue>) => TMutation | null,
  ): Promise<MutationResult<TKey, TValue, TMutation> | null>;
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
          this.applyMutationLocal(m);
        }
        const localResult = this.applyMutationLocal(mutation) as MutationResult<
          TKey,
          TValue,
          TMutation
        >;
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
        (tree): { type: 'put'; key: TKey; value: TValue } => {
          if (this.duplicateKeys === 'reject' && tree.hasKey(key)) {
            throw new BTreeValidationError('Duplicate key rejected.');
          }
          return { type: 'put', key, value };
        },
      );
    });
  }

  public async remove(key: TKey): Promise<BTreeEntry<TKey, TValue> | null> {
    return this.runExclusive(async (): Promise<BTreeEntry<TKey, TValue> | null> => {
      return this.appendMutationAndApplyUnlocked(
        (tree): { type: 'remove'; key: TKey } | null => {
          return tree.hasKey(key) ? { type: 'remove', key } : null;
        },
      );
    });
  }

  public async removeById(entryId: EntryId): Promise<BTreeEntry<TKey, TValue> | null> {
    return this.runExclusive(async (): Promise<BTreeEntry<TKey, TValue> | null> => {
      return this.appendMutationAndApplyUnlocked(
        (tree): { type: 'removeById'; entryId: EntryId } | null => {
          return tree.peekById(entryId) !== null ? { type: 'removeById', entryId } : null;
        },
      );
    });
  }

  public async updateById(
    entryId: EntryId,
    value: TValue,
  ): Promise<BTreeEntry<TKey, TValue> | null> {
    return this.runExclusive(async (): Promise<BTreeEntry<TKey, TValue> | null> => {
      return this.appendMutationAndApplyUnlocked(
        (tree): { type: 'updateById'; entryId: EntryId; value: TValue } | null => {
          return tree.peekById(entryId) !== null ? { type: 'updateById', entryId, value } : null;
        },
      );
    });
  }

  public async popFirst(): Promise<BTreeEntry<TKey, TValue> | null> {
    return this.runExclusive(async (): Promise<BTreeEntry<TKey, TValue> | null> => {
      return this.appendMutationAndApplyUnlocked((tree) => {
        return tree.peekFirst() !== null ? { type: 'popFirst' } : null;
      });
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

  public async popLast(): Promise<BTreeEntry<TKey, TValue> | null> {
    return this.runExclusive(async (): Promise<BTreeEntry<TKey, TValue> | null> => {
      return this.appendMutationAndApplyUnlocked((tree) => {
        return tree.peekLast() !== null ? { type: 'popLast' } : null;
      });
    });
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

  public async putMany(
    entries: readonly { key: TKey; value: TValue }[],
  ): Promise<EntryId[]> {
    if (entries.length === 0) {
      return [];
    }
    return this.runExclusive(async (): Promise<EntryId[]> => {
      return this.appendMutationAndApplyUnlocked(
        (tree): { type: 'putMany'; entries: readonly { key: TKey; value: TValue }[] } => {
          const strictlyAscending = this.duplicateKeys !== 'allow';
          for (let i = 1; i < entries.length; i += 1) {
            const cmp = this.compareKeys(entries[i - 1].key, entries[i].key);
            if (cmp > 0) {
              throw new BTreeValidationError('putMany: entries not in ascending order.');
            }
            if (strictlyAscending && cmp === 0) {
              throw new BTreeValidationError(
                this.duplicateKeys === 'reject'
                  ? 'putMany: duplicate key rejected.'
                  : 'putMany: equal keys not allowed in strict mode.',
              );
            }
          }
          if (this.duplicateKeys === 'reject') {
            for (const entry of entries) {
              if (tree.hasKey(entry.key)) {
                throw new BTreeValidationError('Duplicate key rejected.');
              }
            }
          }
          return { type: 'putMany', entries };
        },
      );
    });
  }

  public async deleteRange(
    startKey: TKey,
    endKey: TKey,
    options?: RangeBounds,
  ): Promise<number> {
    return this.runExclusive(async (): Promise<number> => {
      const result = await this.appendMutationAndApplyUnlocked(
        (tree): { type: 'deleteRange'; startKey: TKey; endKey: TKey; options?: RangeBounds } | null => {
          const count = tree.count(startKey, endKey, options);
          if (count === 0) {
            return null;
          }
          return { type: 'deleteRange', startKey, endKey, options };
        },
      );
      return result ?? 0;
    });
  }

  public async clear(): Promise<void> {
    await this.runExclusive(async (): Promise<null> => {
      return this.appendMutationAndApplyUnlocked(
        (): { type: 'clear' } => ({ type: 'clear' }),
      );
    });
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

  public async forEach(
    callback: (entry: BTreeEntry<TKey, TValue>) => void,
  ): Promise<void> {
    await this.readOp((tree) => {
      tree.forEach(callback);
    });
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

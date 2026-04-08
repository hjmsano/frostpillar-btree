import { InMemoryBTree } from '../InMemoryBTree.js';
import { BTreeConcurrencyError } from '../errors.js';
import type { BTreeMutation, ReadMode, SharedTreeStore } from './types.js';
import {
  type MutationResult,
  assertAppendVersionContract,
  validateMutationBatch,
} from './helpers.js';
import { applyMutationLocal } from './writeOps.js';
import { validateSyncLog } from './syncLogValidation.js';

export class Coordinator<TKey, TValue> {
  public readonly tree: InMemoryBTree<TKey, TValue>;
  public readonly store: SharedTreeStore<TKey, TValue>;
  public readonly maxRetries: number;
  public readonly maxSyncMutationsPerBatch: number;
  public readonly configFingerprint: string;
  public readonly readMode: ReadMode;
  public currentVersion: bigint;
  public operationQueue: Promise<void>;
  public initSeen: boolean;
  public corrupted: boolean;

  public constructor(
    tree: InMemoryBTree<TKey, TValue>,
    store: SharedTreeStore<TKey, TValue>,
    maxRetries: number,
    maxSyncMutationsPerBatch: number,
    configFingerprint: string,
    readMode: ReadMode,
  ) {
    this.tree = tree;
    this.store = store;
    this.maxRetries = maxRetries;
    this.maxSyncMutationsPerBatch = maxSyncMutationsPerBatch;
    this.configFingerprint = configFingerprint;
    this.readMode = readMode;
    this.currentVersion = 0n;
    this.operationQueue = Promise.resolve();
    this.initSeen = false;
    this.corrupted = false;
  }

  public async syncUnlocked(): Promise<void> {
    const log = await this.store.getLogEntriesSince(this.currentVersion);
    validateSyncLog(log, this.maxSyncMutationsPerBatch);
    if (log.version <= this.currentVersion) return;
    validateMutationBatch(log.mutations, this.configFingerprint);
    try {
      const markInit = (): void => {
        this.initSeen = true;
      };
      for (const mutation of log.mutations)
        applyMutationLocal(this.tree, mutation, markInit);
      this.currentVersion = log.version;
    } catch (error: unknown) {
      this.corrupted = true;
      const cause = error instanceof Error ? error.message : String(error);
      throw new BTreeConcurrencyError(
        `Replay failure: instance is permanently corrupted. Discard and create a new instance. Cause: ${cause}`,
      );
    }
  }

  public runExclusive<TResult>(
    operation: () => Promise<TResult>,
  ): Promise<TResult> {
    const run = async (): Promise<TResult> => {
      if (this.corrupted)
        throw new BTreeConcurrencyError(
          'Instance is permanently corrupted. Discard and create a new instance.',
        );
      return operation();
    };
    const result = this.operationQueue.then(run, run);
    this.operationQueue = result.then(
      (): void => undefined,
      (): void => undefined,
    );
    return result;
  }

  public readOp<TResult>(
    fn: (tree: InMemoryBTree<TKey, TValue>) => TResult,
  ): Promise<TResult> {
    return this.runExclusive(async (): Promise<TResult> => {
      if (this.readMode === 'strong') await this.syncUnlocked();
      return fn(this.tree);
    });
  }

  public async appendAndApply<TMutation extends BTreeMutation<TKey, TValue>>(
    evaluate: (tree: InMemoryBTree<TKey, TValue>) => TMutation | null,
  ): Promise<MutationResult<TKey, TValue, TMutation> | null> {
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      await this.syncUnlocked();
      const mutation = evaluate(this.tree);
      if (mutation === null) return null;
      const expectedVersion = this.currentVersion;
      const mutations: BTreeMutation<TKey, TValue>[] = this.initSeen
        ? [mutation]
        : [
            { type: 'init', configFingerprint: this.configFingerprint },
            mutation,
          ];
      const appendResult = await this.store.append(expectedVersion, mutations);
      assertAppendVersionContract(expectedVersion, appendResult);
      if (appendResult.applied) {
        try {
          const markInit = (): void => {
            this.initSeen = true;
          };
          for (const m of mutations) {
            if (m === mutation) break;
            applyMutationLocal(this.tree, m, markInit);
          }
          const result = applyMutationLocal(
            this.tree,
            mutation,
            markInit,
          ) as MutationResult<TKey, TValue, TMutation>;
          this.currentVersion = appendResult.version;
          return result;
        } catch (error: unknown) {
          this.corrupted = true;
          const cause = error instanceof Error ? error.message : String(error);
          throw new BTreeConcurrencyError(
            `Local apply failure after successful append: instance is permanently corrupted. Discard and create a new instance. Cause: ${cause}`,
          );
        }
      }
    }
    throw new BTreeConcurrencyError(
      `Mutation failed after ${String(this.maxRetries)} retries.`,
    );
  }

  public writeOp<TMutation extends BTreeMutation<TKey, TValue>>(
    evaluator: (tree: InMemoryBTree<TKey, TValue>) => TMutation | null,
  ): Promise<MutationResult<TKey, TValue, TMutation> | null> {
    return this.runExclusive(async () => this.appendAndApply(evaluator));
  }
}

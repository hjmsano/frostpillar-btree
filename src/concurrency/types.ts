import type { EntryId, InMemoryBTreeConfig } from '../InMemoryBTree.js';


export type BTreeMutation<TKey, TValue> =
  | { type: 'init'; configFingerprint: string }
  | { type: 'put'; key: TKey; value: TValue }
  | { type: 'remove'; key: TKey }
  | { type: 'removeById'; entryId: EntryId }
  | { type: 'updateById'; entryId: EntryId; value: TValue }
  | { type: 'popFirst' }
  | { type: 'popLast' };

export interface SharedTreeLog<TKey, TValue> {
  version: bigint;
  mutations: BTreeMutation<TKey, TValue>[];
}

export interface SharedTreeStore<TKey, TValue> {
  getLogEntriesSince(
    version: bigint,
  ): Promise<SharedTreeLog<TKey, TValue>>;
  append(
    expectedVersion: bigint,
    mutations: BTreeMutation<TKey, TValue>[],
  ): Promise<{ applied: boolean; version: bigint }>;
}

export type ReadMode = 'strong' | 'local';

export interface ConcurrentInMemoryBTreeConfig<TKey, TValue>
  extends InMemoryBTreeConfig<TKey> {
  store: SharedTreeStore<TKey, TValue>;
  maxRetries?: number;
  maxSyncMutationsPerBatch?: number;
  readMode?: ReadMode;
}

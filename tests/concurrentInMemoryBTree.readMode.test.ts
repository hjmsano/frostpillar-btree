import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BTreeConcurrencyError,
  BTreeValidationError,
  ConcurrentInMemoryBTree,
} from '../src/index.js';
import type {
  BTreeMutation,
  SharedTreeLog,
  SharedTreeStore,
} from '../src/index.js';

import {
  AtomicMemorySharedTreeStore,
  SyncCountingStore,
} from './helpers/sharedTreeStoreStubs.js';

const numCmp = (left: number, right: number): number => left - right;

class AppendCountingStore<TKey, TValue> implements SharedTreeStore<
  TKey,
  TValue
> {
  public appendCount = 0;
  private readonly delegate: AtomicMemorySharedTreeStore<TKey, TValue>;

  public constructor(delegate: AtomicMemorySharedTreeStore<TKey, TValue>) {
    this.delegate = delegate;
  }

  public getLogEntriesSince(
    version: bigint,
  ): Promise<SharedTreeLog<TKey, TValue>> {
    return this.delegate.getLogEntriesSince(version);
  }

  public append(
    expectedVersion: bigint,
    mutations: BTreeMutation<TKey, TValue>[],
  ): Promise<{ applied: boolean; version: bigint }> {
    this.appendCount += 1;
    return this.delegate.append(expectedVersion, mutations);
  }
}

// --- readMode: 'strong' (default) ---

void test('readMode defaults to strong: reads call sync', async (): Promise<void> => {
  const base = new AtomicMemorySharedTreeStore<number, string>();
  const store = new SyncCountingStore(base);
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: numCmp,
    store,
  });

  await tree.put(1, 'one');
  store.syncCount = 0;

  await tree.get(1);
  await tree.hasKey(1);
  await tree.size();

  assert.ok(
    store.syncCount >= 3,
    `expected >= 3 syncs, got ${store.syncCount}`,
  );
});

void test('readMode strong: explicit config value behaves like default', async (): Promise<void> => {
  const base = new AtomicMemorySharedTreeStore<number, string>();
  const store = new SyncCountingStore(base);
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: numCmp,
    store,
    readMode: 'strong',
  });

  await tree.put(1, 'one');
  store.syncCount = 0;

  await tree.get(1);
  assert.ok(store.syncCount >= 1);
});

// --- readMode: 'local' ---

void test('readMode local: reads do not call sync', async (): Promise<void> => {
  const base = new AtomicMemorySharedTreeStore<number, string>();
  const store = new SyncCountingStore(base);
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: numCmp,
    store,
    readMode: 'local',
  });

  await tree.put(1, 'one');
  store.syncCount = 0;

  await tree.get(1);
  await tree.hasKey(1);
  await tree.size();
  await tree.snapshot();
  await tree.peekFirst();
  await tree.peekLast();
  await tree.findFirst(1);
  await tree.findLast(1);
  await tree.range(0, 10);
  await tree.count(0, 10);
  await tree.nextHigherKey(0);
  await tree.nextLowerKey(2);
  await tree.getPairOrNextLower(1);
  await tree.forEachRange(0, 10, (_entry): void => {
    /* no-op */
  });

  assert.equal(
    store.syncCount,
    0,
    'local reads must not call store.getLogEntriesSince',
  );
});

void test('readMode local: explicit sync catches up with remote mutations', async (): Promise<void> => {
  const base = new AtomicMemorySharedTreeStore<number, string>();
  const store = new SyncCountingStore(base);

  const writer = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: numCmp,
    store: base,
  });
  const reader = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: numCmp,
    store,
    readMode: 'local',
  });

  // Writer inserts an entry via the store
  await writer.put(1, 'one');

  // Reader has not synced, so it sees empty tree
  assert.equal(await reader.size(), 0);
  assert.equal(await reader.get(1), null);

  // After explicit sync, reader catches up
  await reader.sync();
  assert.equal(await reader.size(), 1);
  assert.equal(await reader.get(1), 'one');
});

void test('readMode local: writes still sync before appending', async (): Promise<void> => {
  const base = new AtomicMemorySharedTreeStore<number, string>();
  const store = new SyncCountingStore(base);
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: numCmp,
    store,
    readMode: 'local',
  });

  store.syncCount = 0;
  await tree.put(1, 'one');
  // Writes must still sync (as part of appendMutationAndApplyUnlocked)
  assert.ok(
    store.syncCount >= 1,
    'write ops must sync even in local read mode',
  );
});

void test('readMode local: stale duplicate reject is detected before append', async (): Promise<void> => {
  const base = new AtomicMemorySharedTreeStore<number, string>();
  const seeder = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: numCmp,
    store: base,
    duplicateKeys: 'reject',
  });
  await seeder.put(1, 'one');

  const store = new AppendCountingStore(base);
  const localWriter = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: numCmp,
    store,
    duplicateKeys: 'reject',
    readMode: 'local',
  });

  await assert.rejects(async (): Promise<void> => {
    await localWriter.put(1, 'ONE');
  }, BTreeValidationError);
  assert.equal(
    store.appendCount,
    0,
    'local-mode write must sync before evaluating mutation and avoid stale append attempts',
  );
});

void test('readMode local: peekById works without sync', async (): Promise<void> => {
  const base = new AtomicMemorySharedTreeStore<number, string>();
  const store = new SyncCountingStore(base);
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: numCmp,
    store,
    readMode: 'local',
    enableEntryIdLookup: true,
  });

  const id = await tree.put(1, 'one');
  store.syncCount = 0;

  const entry = await tree.peekById(id);
  assert.equal(entry?.value, 'one');
  assert.equal(store.syncCount, 0);
});

// --- readMode: invalid value ---

void test('readMode invalid: throws BTreeConcurrencyError', (): void => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  assert.throws((): void => {
    new ConcurrentInMemoryBTree<number, string>({
      compareKeys: numCmp,
      store,
      readMode: 'invalid' as 'strong',
    });
  }, BTreeConcurrencyError);
});

// --- readMode local: assertInvariants and getStats work ---

void test('readMode local: assertInvariants works without sync', async (): Promise<void> => {
  const base = new AtomicMemorySharedTreeStore<number, string>();
  const store = new SyncCountingStore(base);
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: numCmp,
    store,
    readMode: 'local',
  });

  await tree.put(1, 'one');
  await tree.put(2, 'two');
  store.syncCount = 0;

  await tree.assertInvariants();
  const stats = await tree.getStats();
  assert.equal(stats.entryCount, 2);
  assert.equal(store.syncCount, 0);
});

// forEachRange read-mode tests are in concurrentInMemoryBTree.forEachRange.test.ts

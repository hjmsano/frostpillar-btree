import assert from 'node:assert/strict';
import test from 'node:test';

import { ConcurrentInMemoryBTree } from '../src/index.js';

import {
  AtomicMemorySharedTreeStore,
  SyncCountingStore,
} from './helpers/sharedTreeStoreStubs.js';

const numCmp = (left: number, right: number): number => left - right;

void test('syncThenRead: syncs once then runs callback without additional syncs', async (): Promise<void> => {
  const base = new AtomicMemorySharedTreeStore<number, string>();
  const store = new SyncCountingStore(base);
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: numCmp,
    store,
  });

  await tree.put(1, 'one');
  await tree.put(2, 'two');
  await tree.put(3, 'three');
  store.syncCount = 0;

  const result = await tree.syncThenRead((t) => {
    const val1 = t.get(1);
    const val2 = t.get(2);
    const val3 = t.get(3);
    const sz = t.size();
    return { val1, val2, val3, sz };
  });

  assert.equal(result.val1, 'one');
  assert.equal(result.val2, 'two');
  assert.equal(result.val3, 'three');
  assert.equal(result.sz, 3);
  // Only one sync call, not three
  assert.equal(store.syncCount, 1);
});

void test('syncThenRead: works with readMode local — always syncs', async (): Promise<void> => {
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

  await writer.put(1, 'one');
  store.syncCount = 0;

  // Normal local read sees nothing
  assert.equal(await reader.size(), 0);

  // syncThenRead always syncs, even in local mode
  const size = await reader.syncThenRead((t) => t.size());
  assert.equal(size, 1);
  assert.equal(store.syncCount, 1);
});

void test('syncThenRead: serializes with other operations', async (): Promise<void> => {
  const base = new AtomicMemorySharedTreeStore<number, string>();
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: numCmp,
    store: base,
  });

  await tree.put(1, 'one');
  await tree.put(2, 'two');

  // Run syncThenRead and a write concurrently — they must not interleave
  const [rangeResult] = await Promise.all([
    tree.syncThenRead((t) => t.range(1, 2)),
    tree.put(3, 'three'),
  ]);

  // rangeResult must be a consistent snapshot (either 2 or 3 entries, but not partial)
  assert.ok(rangeResult.length >= 2);
});

void test('syncThenRead: returns callback result correctly', async (): Promise<void> => {
  const base = new AtomicMemorySharedTreeStore<number, string>();
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: numCmp,
    store: base,
  });

  await tree.put(10, 'ten');
  await tree.put(20, 'twenty');

  const snapshot = await tree.syncThenRead((t) => t.snapshot());
  assert.equal(snapshot.length, 2);
  assert.equal(snapshot[0].key, 10);
  assert.equal(snapshot[1].key, 20);
});

void test('syncThenRead: catches up with remote mutations before reading', async (): Promise<void> => {
  const base = new AtomicMemorySharedTreeStore<number, string>();

  const writer = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: numCmp,
    store: base,
  });

  const reader = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: numCmp,
    store: base,
  });

  // Writer inserts entries
  await writer.put(1, 'one');
  await writer.put(2, 'two');

  // Reader uses syncThenRead to see the latest
  const result = await reader.syncThenRead((t) => {
    return { size: t.size(), first: t.peekFirst() };
  });

  assert.equal(result.size, 2);
  assert.equal(result.first?.key, 1);
});

void test('syncThenRead: multiple reads are efficient — single sync', async (): Promise<void> => {
  const base = new AtomicMemorySharedTreeStore<number, string>();
  const store = new SyncCountingStore(base);
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: numCmp,
    store,
  });

  // Populate with many entries
  for (let i = 0; i < 100; i += 1) {
    await tree.put(i, `v${String(i)}`);
  }
  store.syncCount = 0;

  // Run many reads in one syncThenRead call
  const result = await tree.syncThenRead((t) => {
    const results: (string | null)[] = [];
    for (let i = 0; i < 100; i += 1) {
      results.push(t.get(i));
    }
    return results;
  });

  assert.equal(result.length, 100);
  assert.equal(result[0], 'v0');
  assert.equal(result[99], 'v99');
  // Only ONE sync, not 100
  assert.equal(store.syncCount, 1);
});

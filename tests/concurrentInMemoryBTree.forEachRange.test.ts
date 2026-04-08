import assert from 'node:assert/strict';
import test from 'node:test';

import { ConcurrentInMemoryBTree } from '../src/index.js';
import {
  AtomicMemorySharedTreeStore,
  SyncCountingStore,
} from './helpers/sharedTreeStoreStubs.js';

const numCmp = (left: number, right: number): number => left - right;

void test('readMode strong: forEachRange syncs before reading', async (): Promise<void> => {
  const base = new AtomicMemorySharedTreeStore<number, string>();
  const store = new SyncCountingStore(base);
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: numCmp,
    store,
    readMode: 'strong',
  });
  await tree.put(1, 'one');
  await tree.put(2, 'two');
  await tree.put(3, 'three');
  store.syncCount = 0;
  const keys: number[] = [];
  await tree.forEachRange(1, 3, (entry): void => {
    keys.push(entry.key);
  });
  assert.ok(store.syncCount >= 1, 'strong mode forEachRange must sync');
  assert.deepEqual(keys, [1, 2, 3]);
});

void test('readMode local: forEachRange does not sync', async (): Promise<void> => {
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
  const keys: number[] = [];
  await tree.forEachRange(1, 2, (entry): void => {
    keys.push(entry.key);
  });
  assert.equal(store.syncCount, 0, 'local mode forEachRange must not sync');
  assert.deepEqual(keys, [1, 2]);
});

void test('readMode strong: forEachRange sees cross-instance writes', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: numCmp,
    store,
  });
  const reader = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: numCmp,
    store,
    readMode: 'strong',
  });
  await writer.put(10, 'ten');
  await writer.put(20, 'twenty');
  await writer.put(30, 'thirty');
  const keys: number[] = [];
  await reader.forEachRange(10, 30, (entry): void => {
    keys.push(entry.key);
  });
  assert.deepEqual(keys, [10, 20, 30]);
});

void test('readMode local: forEachRange returns stale data until sync', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: numCmp,
    store,
  });
  const reader = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: numCmp,
    store,
    readMode: 'local',
  });
  await writer.put(1, 'one');
  await writer.put(2, 'two');
  const beforeSync: number[] = [];
  await reader.forEachRange(1, 2, (entry): void => {
    beforeSync.push(entry.key);
  });
  assert.deepEqual(beforeSync, []);
  await reader.sync();
  const afterSync: number[] = [];
  await reader.forEachRange(1, 2, (entry): void => {
    afterSync.push(entry.key);
  });
  assert.deepEqual(afterSync, [1, 2]);
});

void test('forEachRange with exclusive bounds in concurrent context', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: numCmp,
    store,
  });
  await tree.put(1, 'one');
  await tree.put(2, 'two');
  await tree.put(3, 'three');
  await tree.put(4, 'four');
  const keys: number[] = [];
  await tree.forEachRange(
    1,
    4,
    (entry): void => {
      keys.push(entry.key);
    },
    { lowerBound: 'exclusive', upperBound: 'exclusive' },
  );
  assert.deepEqual(keys, [2, 3]);
});

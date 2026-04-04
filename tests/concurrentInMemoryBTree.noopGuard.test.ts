import assert from 'node:assert/strict';
import test from 'node:test';

import { ConcurrentInMemoryBTree, type EntryId } from '../src/index.js';

import { AtomicMemorySharedTreeStore } from './helpers/sharedTreeStoreStubs.js';

void test('remove of non-existent key does not append to store', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  const result = await tree.remove(999);

  assert.equal(result, null);
  const log = await store.getLogEntriesSince(0n);
  assert.equal(log.version, 0n);
});

void test('removeById of non-existent entryId does not append to store', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    enableEntryIdLookup: true,
  });

  const result = await tree.removeById(999 as EntryId);

  assert.equal(result, null);
  const log = await store.getLogEntriesSince(0n);
  assert.equal(log.version, 0n);
});

void test('updateById of non-existent entryId does not append to store', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    enableEntryIdLookup: true,
  });

  const result = await tree.updateById(999 as EntryId, 'val');

  assert.equal(result, null);
  const log = await store.getLogEntriesSince(0n);
  assert.equal(log.version, 0n);
});

void test('remove of non-existent key after real insert does not increment version', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  await tree.put(10, 'ten');
  const logAfterInsert = await store.getLogEntriesSince(0n);
  assert.equal(logAfterInsert.version, 1n);

  const result = await tree.remove(999);

  assert.equal(result, null);
  const logAfterRemove = await store.getLogEntriesSince(0n);
  assert.equal(logAfterRemove.version, 1n);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { ConcurrentInMemoryBTree } from '../src/index.js';

import { AtomicMemorySharedTreeStore } from './helpers/sharedTreeStoreStubs.js';

void test('assertInvariants syncs and passes after cross-instance mutations', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });
  const reader = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  await writer.put(10, 'ten');
  await writer.put(20, 'twenty');
  await reader.remove(10);

  await writer.assertInvariants();
  await reader.assertInvariants();
});

// --- no-op mutation replay correctness tests ---

void test('remove of non-existent key: cross-instance replay is harmless', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });
  const reader = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  const id1 = await writer.put(1, 'one');
  const id2 = await writer.put(2, 'two');

  // Remove a key that does not exist — mutation is appended but is a no-op
  assert.equal(await writer.remove(999), null);

  // Reader syncs the no-op remove mutation; tree should still be intact
  assert.equal(await reader.size(), 2);
  assert.deepEqual(await reader.snapshot(), [
    { entryId: id1, key: 1, value: 'one' },
    { entryId: id2, key: 2, value: 'two' },
  ]);
  await reader.assertInvariants();
});

void test('removeById of non-existent entryId: cross-instance replay is harmless', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    enableEntryIdLookup: true,
  });
  const reader = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    enableEntryIdLookup: true,
  });

  const id1 = await writer.put(1, 'one');
  await writer.removeById(id1);

  // removeById on an already-removed entryId — no-op mutation appended
  assert.equal(await writer.removeById(id1), null);

  // Reader syncs the no-op removeById; tree should be empty and consistent
  assert.equal(await reader.size(), 0);
  await reader.assertInvariants();
});

void test('updateById of non-existent entryId: cross-instance replay is harmless', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    enableEntryIdLookup: true,
  });
  const reader = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    enableEntryIdLookup: true,
  });

  const id1 = await writer.put(1, 'one');
  const id2 = await writer.put(2, 'two');
  await writer.removeById(id1);

  // updateById on a removed entryId — no-op mutation appended
  assert.equal(await writer.updateById(id1, 'updated'), null);

  // Reader syncs the no-op updateById; remaining entry should be unaffected
  assert.equal(await reader.size(), 1);
  assert.deepEqual(await reader.snapshot(), [
    { entryId: id2, key: 2, value: 'two' },
  ]);
  await reader.assertInvariants();
});

void test('multiple no-op mutations do not corrupt tree state across instances', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writerA = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    enableEntryIdLookup: true,
  });
  const writerB = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    enableEntryIdLookup: true,
  });

  const id1 = await writerA.put(1, 'one');
  const id2 = await writerA.put(2, 'two');
  const id3 = await writerA.put(3, 'three');

  // Mix of no-op and effective operations
  assert.equal(await writerB.remove(999), null); // no-op: key 999 does not exist
  assert.notEqual(await writerB.removeById(id1), null); // effective: writerB syncs and removes id1
  assert.equal(await writerA.updateById(id1, 'updated'), null); // no-op: id1 already removed by writerB
  assert.equal(await writerA.remove(888), null); // no-op: key 888 does not exist

  const snapshot = await writerA.snapshot();
  const keys = snapshot.map((e) => e.key);
  assert.deepEqual(keys, [2, 3]);
  assert.deepEqual(snapshot, [
    { entryId: id2, key: 2, value: 'two' },
    { entryId: id3, key: 3, value: 'three' },
  ]);

  await writerA.assertInvariants();
  await writerB.assertInvariants();
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { ConcurrentInMemoryBTree } from '../src/index.js';

import { AtomicMemorySharedTreeStore } from './helpers/sharedTreeStoreStubs.js';

void test('get returns null on empty tree', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new AtomicMemorySharedTreeStore<number, string>(),
  });

  assert.equal(await tree.get(42), null);
});

void test('get syncs and returns value for existing key', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });
  const reader = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  await writer.put(5, 'five');
  assert.equal(await reader.get(5), 'five');
  assert.equal(await reader.get(999), null);
});

void test('findFirst returns null on empty tree', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new AtomicMemorySharedTreeStore<number, string>(),
  });

  assert.equal(await tree.findFirst(1), null);
});

void test('findFirst syncs and returns the first entry matching key', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    duplicateKeys: 'allow',
  });
  const reader = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    duplicateKeys: 'allow',
  });

  const idA = await writer.put(5, 'a');
  await writer.put(5, 'b');

  assert.deepEqual(await reader.findFirst(5), { entryId: idA, key: 5, value: 'a' });
  assert.equal(await reader.findFirst(999), null);
});

void test('findLast returns null on empty tree', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new AtomicMemorySharedTreeStore<number, string>(),
  });

  assert.equal(await tree.findLast(1), null);
});

void test('findLast syncs and returns the last entry matching key', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    duplicateKeys: 'allow',
  });
  const reader = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    duplicateKeys: 'allow',
  });

  await writer.put(5, 'a');
  const idB = await writer.put(5, 'b');

  assert.deepEqual(await reader.findLast(5), { entryId: idB, key: 5, value: 'b' });
  assert.equal(await reader.findLast(999), null);
});

void test('peekLast returns null on empty tree', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new AtomicMemorySharedTreeStore<number, string>(),
  });

  assert.equal(await tree.peekLast(), null);
});

void test('peekLast syncs and returns the largest entry without removing it', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });
  const reader = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  await writer.put(5, 'five');
  await writer.put(10, 'ten');
  const id20 = await writer.put(20, 'twenty');

  assert.deepEqual(await reader.peekLast(), { entryId: id20, key: 20, value: 'twenty' });
  assert.equal(await reader.size(), 3);
});

void test('popLast returns null on empty tree', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new AtomicMemorySharedTreeStore<number, string>(),
  });

  assert.equal(await tree.popLast(), null);
});

void test('popLast removes the largest entry and coordinates through store', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  await tree.put(5, 'five');
  const id10 = await tree.put(10, 'ten');
  const id20 = await tree.put(20, 'twenty');

  assert.deepEqual(await tree.popLast(), { entryId: id20, key: 20, value: 'twenty' });
  assert.deepEqual(await tree.popLast(), { entryId: id10, key: 10, value: 'ten' });
  assert.equal(await tree.size(), 1);
});

void test('popLast reflects cross-instance state through shared store', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });
  const reader = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  await writer.put(1, 'one');
  const id2 = await writer.put(2, 'two');

  assert.deepEqual(await reader.popLast(), { entryId: id2, key: 2, value: 'two' });
  assert.equal(await writer.size(), 1);
});

void test('concurrent popLast from two instances does not double-remove', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const treeA = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });
  const treeB = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  await treeA.put(1, 'one');
  await treeA.put(2, 'two');

  const [resultA, resultB] = await Promise.all([treeA.popLast(), treeB.popLast()]);

  // Both must be non-null (two entries, two pops)
  assert.notEqual(resultA, null, 'resultA should not be null');
  assert.notEqual(resultB, null, 'resultB should not be null');
  // Each instance must have removed a different key
  assert.notEqual(resultA!.key, resultB!.key, 'each instance must remove a different key');

  const removedKeys = [resultA!.key, resultB!.key].sort((left: number, right: number): number => left - right);
  assert.deepEqual(removedKeys, [1, 2]);
  assert.equal(await treeA.size(), 0);
  await treeA.assertInvariants();
});

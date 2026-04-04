import assert from 'node:assert/strict';
import test from 'node:test';

import { BTreeValidationError, ConcurrentInMemoryBTree } from '../src/index.js';

import { AtomicMemorySharedTreeStore } from './helpers/sharedTreeStoreStubs.js';

void test('popFirst returns null on empty tree', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new AtomicMemorySharedTreeStore<number, string>(),
  });

  assert.equal(await tree.popFirst(), null);
});

void test('popFirst removes the smallest entry and coordinates through store', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  const id5 = await tree.put(5, 'five');
  const id10 = await tree.put(10, 'ten');
  await tree.put(20, 'twenty');

  assert.deepEqual(await tree.popFirst(), { entryId: id5, key: 5, value: 'five' });
  assert.deepEqual(await tree.popFirst(), { entryId: id10, key: 10, value: 'ten' });
  assert.equal(await tree.size(), 1);
});

void test('popFirst reflects cross-instance state through shared store', async (): Promise<void> => {
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
  await writer.put(2, 'two');

  assert.deepEqual(await reader.popFirst(), { entryId: id1, key: 1, value: 'one' });
  assert.equal(await writer.size(), 1);
});

void test('concurrent popFirst from two instances does not double-remove', async (): Promise<void> => {
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

  const [resultA, resultB] = await Promise.all([treeA.popFirst(), treeB.popFirst()]);

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

void test('remove(key) removes first matching entry through shared store', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });
  const reader = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  const id5 = await writer.put(5, 'five');
  await writer.put(10, 'ten');

  assert.deepEqual(await reader.remove(5), { entryId: id5, key: 5, value: 'five' });
  assert.equal(await writer.hasKey(5), false);
  assert.equal(await writer.size(), 1);
});

void test('remove(key) returns null for missing key without appending to store', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  await tree.put(1, 'one');
  const versionBefore = store.currentVersion;
  assert.equal(await tree.remove(999), null);
  assert.equal(store.currentVersion, versionBefore, 'store version must not advance for a no-op remove');
  assert.equal(await tree.size(), 1);
});

void test('remove(key) with equal keys removes earliest entry through store', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    duplicateKeys: 'allow',
  });

  const idA = await tree.put(5, 'a');
  const idB = await tree.put(5, 'b');

  assert.deepEqual(await tree.remove(5), { entryId: idA, key: 5, value: 'a' });
  assert.deepEqual(await tree.snapshot(), [{ entryId: idB, key: 5, value: 'b' }]);
});

void test('range syncs and returns cross-instance entries inclusively', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });
  const reader = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  const id10 = await writer.put(10, 'ten');
  const id20 = await writer.put(20, 'twenty');
  await writer.put(30, 'thirty');

  assert.deepEqual(await reader.range(10, 20), [
    { entryId: id10, key: 10, value: 'ten' },
    { entryId: id20, key: 20, value: 'twenty' },
  ]);
});

void test('range returns empty array on empty tree and reversed bounds', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  assert.deepEqual(await tree.range(1, 10), []);

  await tree.put(5, 'five');
  assert.deepEqual(await tree.range(10, 1), []);
});

void test('snapshot syncs and returns all entries from cross-instance writes', async (): Promise<void> => {
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
  const id3 = await writer.put(3, 'three');

  assert.deepEqual(await reader.snapshot(), [
    { entryId: id1, key: 1, value: 'one' },
    { entryId: id2, key: 2, value: 'two' },
    { entryId: id3, key: 3, value: 'three' },
  ]);
});

void test('snapshot returns empty array on empty tree', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new AtomicMemorySharedTreeStore<number, string>(),
  });

  assert.deepEqual(await tree.snapshot(), []);
});

void test('getStats syncs and reflects cross-instance structure', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });
  const reader = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  const emptyStats = await reader.getStats();
  assert.equal(emptyStats.entryCount, 0);
  assert.equal(emptyStats.height, 1);

  await writer.put(1, 'one');
  await writer.put(2, 'two');
  await writer.put(3, 'three');

  const stats = await reader.getStats();
  assert.equal(stats.entryCount, 3);
  assert.ok(stats.height >= 1);
  assert.ok(stats.leafCount >= 1);
});

void test('removeById returns null for non-existent entryId without appending to store', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    enableEntryIdLookup: true,
  });

  const id = await tree.put(1, 'one');
  await tree.removeById(id);

  const versionBefore = store.currentVersion;
  assert.equal(await tree.removeById(id), null);
  assert.equal(store.currentVersion, versionBefore, 'store version must not advance for a no-op removeById');
  assert.equal(await tree.size(), 0);
});

void test('updateById returns null for non-existent entryId without appending to store', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    enableEntryIdLookup: true,
  });

  const id = await tree.put(1, 'one');
  await tree.removeById(id);

  const versionBefore = store.currentVersion;
  assert.equal(await tree.updateById(id, 'updated'), null);
  assert.equal(store.currentVersion, versionBefore, 'store version must not advance for a no-op updateById');
  assert.equal(await tree.size(), 0);
});

void test('peekById throws when enableEntryIdLookup is disabled', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  const id = await tree.put(1, 'one');
  const versionBefore = store.currentVersion;
  await assert.rejects(async (): Promise<void> => {
    await tree.peekById(id);
  }, BTreeValidationError);
  assert.equal(
    store.currentVersion,
    versionBefore,
    'store version must not advance when lookup is disabled',
  );
});

void test('removeById throws when enableEntryIdLookup is disabled and does not append', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  const id = await tree.put(1, 'one');
  const versionBefore = store.currentVersion;
  await assert.rejects(async (): Promise<void> => {
    await tree.removeById(id);
  }, BTreeValidationError);
  assert.equal(
    store.currentVersion,
    versionBefore,
    'store version must not advance when lookup is disabled',
  );
  assert.equal(await tree.size(), 1);
});

void test('updateById throws when enableEntryIdLookup is disabled and does not append', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  const id = await tree.put(1, 'one');
  const versionBefore = store.currentVersion;
  await assert.rejects(async (): Promise<void> => {
    await tree.updateById(id, 'ONE');
  }, BTreeValidationError);
  assert.equal(
    store.currentVersion,
    versionBefore,
    'store version must not advance when lookup is disabled',
  );
  assert.equal(await tree.get(1), 'one');
});

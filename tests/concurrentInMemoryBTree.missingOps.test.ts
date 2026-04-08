import assert from 'node:assert/strict';
import test from 'node:test';

import { ConcurrentInMemoryBTree } from '../src/index.js';

import { AtomicMemorySharedTreeStore } from './helpers/sharedTreeStoreStubs.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeTree = (
  store: AtomicMemorySharedTreeStore<number, string>,
): ConcurrentInMemoryBTree<number, string> =>
  new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

const seedTree = async (
  tree: ConcurrentInMemoryBTree<number, string>,
): Promise<void> => {
  await tree.put(10, 'v10');
  await tree.put(20, 'v20');
  await tree.put(30, 'v30');
  await tree.put(40, 'v40');
  await tree.put(50, 'v50');
};

// ---------------------------------------------------------------------------
// putMany()
// ---------------------------------------------------------------------------

void test('putMany inserts all entries and returns EntryId array', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = makeTree(store);

  const ids = await tree.putMany([
    { key: 1, value: 'one' },
    { key: 2, value: 'two' },
    { key: 3, value: 'three' },
  ]);

  assert.equal(ids.length, 3);
  assert.equal(await tree.size(), 3);
  assert.equal(await tree.get(1), 'one');
  assert.equal(await tree.get(2), 'two');
  assert.equal(await tree.get(3), 'three');
});

void test('putMany propagates to other instances via shared store', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = makeTree(store);
  const reader = makeTree(store);

  await writer.putMany([
    { key: 10, value: 'ten' },
    { key: 20, value: 'twenty' },
    { key: 30, value: 'thirty' },
  ]);

  assert.equal(await reader.size(), 3);
  assert.deepEqual(
    (await reader.snapshot()).map((e) => e.key),
    [10, 20, 30],
  );
});

void test('putMany with empty array returns empty array and does not advance store version', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = makeTree(store);
  await tree.put(1, 'one');
  const versionBefore = store.currentVersion;

  const ids = await tree.putMany([]);
  assert.deepEqual(ids, []);
  assert.equal(store.currentVersion, versionBefore);
  assert.equal(await tree.size(), 1);
});

void test('putMany rejects unsorted entries without poisoning the shared log', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = makeTree(store);
  const versionBefore = store.currentVersion;

  await assert.rejects(
    tree.putMany([
      { key: 3, value: 'three' },
      { key: 1, value: 'one' },
    ]),
    (error: Error) => error.message.includes('not in ascending order'),
  );

  assert.equal(store.currentVersion, versionBefore);
  assert.equal(await tree.size(), 0);
});

void test('putMany rejects duplicate keys in input when duplicateKeys is reject', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    duplicateKeys: 'reject',
  });
  const versionBefore = store.currentVersion;

  await assert.rejects(
    tree.putMany([
      { key: 1, value: 'one' },
      { key: 1, value: 'one-dup' },
    ]),
    (error: Error) => error.message.includes('duplicate key rejected'),
  );

  assert.equal(store.currentVersion, versionBefore);
  assert.equal(await tree.size(), 0);
});

void test('putMany rejects entries conflicting with existing keys when duplicateKeys is reject', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    duplicateKeys: 'reject',
  });

  await tree.put(2, 'existing');
  const versionAfterPut = store.currentVersion;

  await assert.rejects(
    tree.putMany([
      { key: 1, value: 'one' },
      { key: 2, value: 'two-dup' },
      { key: 3, value: 'three' },
    ]),
    (error: Error) => error.message.includes('Duplicate key rejected'),
  );

  assert.equal(store.currentVersion, versionAfterPut);
  assert.equal(await tree.size(), 1);
  assert.equal(await tree.get(2), 'existing');
});

void test('putMany failure does not corrupt replay for other instances', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    duplicateKeys: 'reject',
  });
  const reader = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    duplicateKeys: 'reject',
  });

  await writer.put(5, 'five');

  await assert.rejects(
    writer.putMany([
      { key: 5, value: 'five-dup' },
    ]),
    (error: Error) => error.message.includes('Duplicate key rejected'),
  );

  await reader.sync();
  assert.equal(await reader.size(), 1);
  assert.equal(await reader.get(5), 'five');

  await writer.put(10, 'ten');
  assert.equal(await reader.get(10), 'ten');
});

// ---------------------------------------------------------------------------
// deleteRange()
// ---------------------------------------------------------------------------

void test('deleteRange removes entries in range and returns count', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = makeTree(store);
  await seedTree(tree);

  const deleted = await tree.deleteRange(20, 40);
  assert.equal(deleted, 3);
  assert.equal(await tree.size(), 2);
  assert.deepEqual(
    (await tree.snapshot()).map((e) => e.key),
    [10, 50],
  );
});

void test('deleteRange propagates to other instances via shared store', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = makeTree(store);
  const reader = makeTree(store);

  await seedTree(writer);
  await writer.deleteRange(20, 40);

  assert.equal(await reader.size(), 2);
  assert.deepEqual(
    (await reader.snapshot()).map((e) => e.key),
    [10, 50],
  );
});

void test('deleteRange with exclusive bounds follows RangeBounds semantics', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = makeTree(store);
  await seedTree(tree);

  const deleted = await tree.deleteRange(20, 40, { lowerBound: 'exclusive', upperBound: 'exclusive' });
  assert.equal(deleted, 1);
  assert.equal(await tree.size(), 4);
  assert.deepEqual(
    (await tree.snapshot()).map((e) => e.key),
    [10, 20, 40, 50],
  );
});

void test('deleteRange returns 0 for empty tree without advancing store version', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = makeTree(store);

  const deleted = await tree.deleteRange(1, 100);
  assert.equal(deleted, 0);
});

void test('deleteRange returns 0 when no entries match range without advancing store version', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = makeTree(store);
  await seedTree(tree);
  const versionBefore = store.currentVersion;

  const deleted = await tree.deleteRange(100, 200);
  assert.equal(deleted, 0);
  assert.equal(store.currentVersion, versionBefore);
});

// ---------------------------------------------------------------------------
// clear()
// ---------------------------------------------------------------------------

void test('clear removes all entries and propagates to other instances', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = makeTree(store);
  const reader = makeTree(store);

  await seedTree(writer);
  await writer.clear();

  assert.equal(await writer.size(), 0);
  assert.deepEqual(await writer.snapshot(), []);
  assert.equal(await reader.size(), 0);
  assert.deepEqual(await reader.snapshot(), []);
});

void test('clear on empty tree still advances store version', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = makeTree(store);
  const versionBefore = store.currentVersion;

  await tree.clear();

  assert.ok(store.currentVersion > versionBefore);
  assert.equal(await tree.size(), 0);
});

void test('clear allows subsequent puts after clearing', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = makeTree(store);
  await seedTree(tree);
  await tree.clear();

  await tree.put(99, 'ninety-nine');
  assert.equal(await tree.size(), 1);
  assert.equal(await tree.get(99), 'ninety-nine');
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { ConcurrentInMemoryBTree } from '../src/index.js';

import { AtomicMemorySharedTreeStore } from './helpers/sharedTreeStoreStubs.js';

// ---------------------------------------------------------------------------
// Helper
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
// count(startKey, endKey)
// ---------------------------------------------------------------------------

void test('count syncs and returns correct count', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = makeTree(store);
  const reader = makeTree(store);

  await seedTree(writer);

  assert.equal(await reader.count(10, 40), 4);
  assert.equal(await reader.count(15, 35), 2);
  assert.equal(await reader.count(100, 200), 0);
});

void test('count with lowerBound exclusive', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = makeTree(store);
  const reader = makeTree(store);

  await seedTree(writer);

  // Without exclusive: count(10, 40) = 4 entries (10, 20, 30, 40)
  // With lowerBound exclusive: excludes 10, so 3 entries (20, 30, 40)
  assert.equal(await reader.count(10, 40, { lowerBound: 'exclusive' }), 3);
});

void test('count with upperBound exclusive', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = makeTree(store);
  const reader = makeTree(store);

  await seedTree(writer);

  // count(10, 40) with upperBound exclusive: excludes 40, so 3 entries (10, 20, 30)
  assert.equal(await reader.count(10, 40, { upperBound: 'exclusive' }), 3);
});

void test('count with both bounds exclusive', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = makeTree(store);
  const reader = makeTree(store);

  await seedTree(writer);

  assert.equal(
    await reader.count(10, 40, {
      lowerBound: 'exclusive',
      upperBound: 'exclusive',
    }),
    2,
  );
});

// ---------------------------------------------------------------------------
// range(startKey, endKey, options)
// ---------------------------------------------------------------------------

void test('range with upperBound exclusive', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = makeTree(store);
  const reader = makeTree(store);

  await seedTree(writer);

  const result = await reader.range(10, 40, { upperBound: 'exclusive' });
  const keys = result.map((entry) => entry.key);

  assert.deepEqual(keys, [10, 20, 30]);
});

void test('range with lowerBound exclusive', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = makeTree(store);
  const reader = makeTree(store);

  await seedTree(writer);

  const result = await reader.range(10, 40, { lowerBound: 'exclusive' });
  const keys = result.map((entry) => entry.key);

  assert.deepEqual(keys, [20, 30, 40]);
});

// ---------------------------------------------------------------------------
// nextHigherKey(key)
// ---------------------------------------------------------------------------

void test('nextHigherKey returns null on empty tree', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = makeTree(store);

  assert.equal(await tree.nextHigherKey(5), null);
});

void test('nextHigherKey syncs and returns the next higher key', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = makeTree(store);
  const reader = makeTree(store);

  await seedTree(writer);

  assert.equal(await reader.nextHigherKey(10), 20);
  assert.equal(await reader.nextHigherKey(25), 30);
  assert.equal(await reader.nextHigherKey(50), null);
});

// ---------------------------------------------------------------------------
// nextLowerKey(key)
// ---------------------------------------------------------------------------

void test('nextLowerKey returns null on empty tree', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = makeTree(store);

  assert.equal(await tree.nextLowerKey(5), null);
});

void test('nextLowerKey syncs and returns the next lower key', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = makeTree(store);
  const reader = makeTree(store);

  await seedTree(writer);

  assert.equal(await reader.nextLowerKey(30), 20);
  assert.equal(await reader.nextLowerKey(25), 20);
  assert.equal(await reader.nextLowerKey(10), null);
});

// ---------------------------------------------------------------------------
// getPairOrNextLower(key)
// ---------------------------------------------------------------------------

void test('getPairOrNextLower returns null on empty tree', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = makeTree(store);

  assert.equal(await tree.getPairOrNextLower(5), null);
});

void test('getPairOrNextLower returns exact match when key exists', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = makeTree(store);
  const reader = makeTree(store);

  await seedTree(writer);

  const result = await reader.getPairOrNextLower(30);
  assert.notEqual(result, null);
  assert.equal(result!.key, 30);
  assert.equal(result!.value, 'v30');
});

void test('getPairOrNextLower returns next lower when key does not exist', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = makeTree(store);
  const reader = makeTree(store);

  await seedTree(writer);

  const result = await reader.getPairOrNextLower(25);
  assert.notEqual(result, null);
  assert.equal(result!.key, 20);
  assert.equal(result!.value, 'v20');
});

void test('getPairOrNextLower returns null when key is below all entries', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = makeTree(store);
  const reader = makeTree(store);

  await seedTree(writer);

  assert.equal(await reader.getPairOrNextLower(5), null);
});

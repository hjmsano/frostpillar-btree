import assert from 'node:assert/strict';
import test from 'node:test';

import { ConcurrentInMemoryBTree, InMemoryBTree } from '../src/index.js';
import type { BTreeEntry } from '../src/index.js';

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
// entries()
// ---------------------------------------------------------------------------

void test('entries returns all entries in ascending order', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = makeTree(store);
  await seedTree(tree);

  const result = await tree.entries();
  const keys = result.map((e) => e.key);
  assert.deepEqual(keys, [10, 20, 30, 40, 50]);
});

void test('entries syncs cross-instance state', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = makeTree(store);
  const reader = makeTree(store);

  await seedTree(writer);

  const result = await reader.entries();
  assert.equal(result.length, 5);
  assert.equal(result[0].key, 10);
  assert.equal(result[4].key, 50);
});

void test('entries returns empty array for empty tree', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = makeTree(store);

  const result = await tree.entries();
  assert.deepEqual(result, []);
});

// ---------------------------------------------------------------------------
// entriesReversed()
// ---------------------------------------------------------------------------

void test('entriesReversed returns all entries in descending order', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = makeTree(store);
  await seedTree(tree);

  const result = await tree.entriesReversed();
  const keys = result.map((e) => e.key);
  assert.deepEqual(keys, [50, 40, 30, 20, 10]);
});

void test('entriesReversed syncs cross-instance state', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = makeTree(store);
  const reader = makeTree(store);

  await seedTree(writer);

  const result = await reader.entriesReversed();
  assert.equal(result.length, 5);
  assert.equal(result[0].key, 50);
});

void test('entriesReversed returns empty array for empty tree', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = makeTree(store);

  const result = await tree.entriesReversed();
  assert.deepEqual(result, []);
});

// ---------------------------------------------------------------------------
// keys()
// ---------------------------------------------------------------------------

void test('keys returns all keys in ascending order', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = makeTree(store);
  await seedTree(tree);

  const result = await tree.keys();
  assert.deepEqual(result, [10, 20, 30, 40, 50]);
});

void test('keys returns empty array for empty tree', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = makeTree(store);

  const result = await tree.keys();
  assert.deepEqual(result, []);
});

// ---------------------------------------------------------------------------
// values()
// ---------------------------------------------------------------------------

void test('values returns all values in ascending key order', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = makeTree(store);
  await seedTree(tree);

  const result = await tree.values();
  assert.deepEqual(result, ['v10', 'v20', 'v30', 'v40', 'v50']);
});

void test('values returns empty array for empty tree', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = makeTree(store);

  const result = await tree.values();
  assert.deepEqual(result, []);
});

// ---------------------------------------------------------------------------
// forEach()
// ---------------------------------------------------------------------------

void test('forEach invokes callback for each entry in ascending order', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = makeTree(store);
  await seedTree(tree);

  const collected: BTreeEntry<number, string>[] = [];
  await tree.forEach((entry) => {
    collected.push(entry);
  });

  const keys = collected.map((e) => e.key);
  assert.deepEqual(keys, [10, 20, 30, 40, 50]);
});

void test('forEach syncs cross-instance state before iterating', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = makeTree(store);
  const reader = makeTree(store);

  await seedTree(writer);

  const collected: number[] = [];
  await reader.forEach((entry) => {
    collected.push(entry.key);
  });

  assert.deepEqual(collected, [10, 20, 30, 40, 50]);
});

void test('forEach does nothing on empty tree', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = makeTree(store);

  let called = false;
  await tree.forEach(() => {
    called = true;
  });

  assert.equal(called, false);
});

// ---------------------------------------------------------------------------
// [Symbol.asyncIterator]
// ---------------------------------------------------------------------------

void test('asyncIterator yields all entries in ascending order', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = makeTree(store);
  await seedTree(tree);

  const keys: number[] = [];
  for await (const entry of tree) {
    keys.push(entry.key);
  }

  assert.deepEqual(keys, [10, 20, 30, 40, 50]);
});

void test('asyncIterator yields nothing for empty tree', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = makeTree(store);

  const keys: number[] = [];
  for await (const entry of tree) {
    keys.push(entry.key);
  }

  assert.deepEqual(keys, []);
});

// ---------------------------------------------------------------------------
// clone()
// ---------------------------------------------------------------------------

void test('clone returns an independent InMemoryBTree with same entries', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = makeTree(store);
  await seedTree(tree);

  const cloned = await tree.clone();

  assert.ok(cloned instanceof InMemoryBTree);
  assert.equal(cloned.size(), 5);
  assert.deepEqual(
    cloned.snapshot().map((e) => e.key),
    [10, 20, 30, 40, 50],
  );
});

void test('clone is independent: mutations on clone do not affect concurrent tree', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = makeTree(store);
  await tree.put(1, 'one');
  await tree.put(2, 'two');

  const cloned = await tree.clone();
  cloned.put(99, 'ninety-nine');

  assert.equal(await tree.size(), 2);
  assert.equal(cloned.size(), 3);
});

void test('clone syncs cross-instance state before cloning', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = makeTree(store);
  const reader = makeTree(store);

  await seedTree(writer);

  const cloned = await reader.clone();
  assert.equal(cloned.size(), 5);
});

void test('clone of empty tree returns empty InMemoryBTree', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = makeTree(store);

  const cloned = await tree.clone();
  assert.ok(cloned instanceof InMemoryBTree);
  assert.equal(cloned.size(), 0);
  assert.deepEqual(cloned.snapshot(), []);
});

// ---------------------------------------------------------------------------
// toJSON()
// ---------------------------------------------------------------------------

void test('toJSON returns a BTreeJSON with all entries', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = makeTree(store);
  await seedTree(tree);

  const json = await tree.toJSON();

  assert.ok(typeof json === 'object');
  assert.equal(json.version, 1);
  assert.equal(json.entries.length, 5);
  assert.deepEqual(
    json.entries.map(([k]) => k),
    [10, 20, 30, 40, 50],
  );
});

void test('toJSON syncs cross-instance state', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = makeTree(store);
  const reader = makeTree(store);

  await seedTree(writer);

  const json = await reader.toJSON();
  assert.equal(json.entries.length, 5);
});

void test('toJSON of empty tree has empty entries array', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = makeTree(store);

  const json = await tree.toJSON();
  assert.deepEqual(json.entries, []);
});

// ---------------------------------------------------------------------------
// fromJSON() static
// ---------------------------------------------------------------------------

void test('fromJSON returns a local InMemoryBTree with correct entries', async (): Promise<void> => {
  const compareKeys = (left: number, right: number): number => left - right;
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = makeTree(store);
  await seedTree(tree);

  const json = await tree.toJSON();
  const restored = ConcurrentInMemoryBTree.fromJSON(json, compareKeys);

  assert.ok(restored instanceof InMemoryBTree);
  assert.equal(restored.size(), 5);
  assert.deepEqual(
    restored.snapshot().map((e) => e.key),
    [10, 20, 30, 40, 50],
  );
});

void test('fromJSON round-trips values correctly', async (): Promise<void> => {
  const compareKeys = (left: number, right: number): number => left - right;
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = makeTree(store);
  await tree.put(1, 'alpha');
  await tree.put(2, 'beta');

  const json = await tree.toJSON();
  const restored = ConcurrentInMemoryBTree.fromJSON(json, compareKeys);

  assert.equal(restored.get(1), 'alpha');
  assert.equal(restored.get(2), 'beta');
});

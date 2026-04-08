import assert from 'node:assert/strict';
import test from 'node:test';

import { ConcurrentInMemoryBTree } from '../src/index.js';

import {
  AtomicMemorySharedTreeStore,
  FailOnceCompareAndSetStore,
} from './helpers/sharedTreeStoreStubs.js';

// ---------------------------------------------------------------------------
// popLast()
// ---------------------------------------------------------------------------

void test('popLast returns null on empty concurrent tree', async (): Promise<void> => {
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
  await tree.put(10, 'ten');
  const id20 = await tree.put(20, 'twenty');

  assert.deepEqual(await tree.popLast(), {
    entryId: id20,
    key: 20,
    value: 'twenty',
  });
  assert.equal(await tree.size(), 2);
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

  assert.deepEqual(await reader.popLast(), {
    entryId: id2,
    key: 2,
    value: 'two',
  });
  assert.equal(await writer.size(), 1);
});

// ---------------------------------------------------------------------------
// 3+ writer contention
// ---------------------------------------------------------------------------

void test('three concurrent writers avoid lost updates', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const createTree = (): ConcurrentInMemoryBTree<number, string> =>
    new ConcurrentInMemoryBTree<number, string>({
      compareKeys: (left: number, right: number): number => left - right,
      store,
    });

  const treeA = createTree();
  const treeB = createTree();
  const treeC = createTree();

  // All three writers race to insert concurrently
  await Promise.all([
    treeA.put(10, 'a10'),
    treeB.put(20, 'b20'),
    treeC.put(30, 'c30'),
  ]);

  // Each writer should see all 3 entries after sync
  assert.equal(await treeA.size(), 3);
  assert.equal(await treeB.size(), 3);
  assert.equal(await treeC.size(), 3);

  const snapshot = await treeA.snapshot();
  const keys = snapshot.map((e) => e.key).sort((a, b) => a - b);
  assert.deepEqual(keys, [10, 20, 30]);
  await treeA.assertInvariants();
});

void test('three writers with sequential inserts maintain consistency', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const createTree = (): ConcurrentInMemoryBTree<number, string> =>
    new ConcurrentInMemoryBTree<number, string>({
      compareKeys: (left: number, right: number): number => left - right,
      store,
    });

  const treeA = createTree();
  const treeB = createTree();
  const treeC = createTree();

  // Interleaved writes from 3 writers
  for (let i = 0; i < 10; i += 1) {
    await Promise.all([
      treeA.put(i * 3, `a${i}`),
      treeB.put(i * 3 + 1, `b${i}`),
      treeC.put(i * 3 + 2, `c${i}`),
    ]);
  }

  assert.equal(await treeA.size(), 30);
  const snapshot = await treeA.snapshot();
  for (let i = 1; i < snapshot.length; i += 1) {
    assert.ok(
      snapshot[i - 1].key < snapshot[i].key,
      'entries must be strictly ascending',
    );
  }
  await treeA.assertInvariants();
});

// ---------------------------------------------------------------------------
// size / multi-instance stress / updateById retry
// ---------------------------------------------------------------------------

void test('size syncs and reflects cross-instance mutations', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });
  const reader = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  assert.equal(await reader.size(), 0);

  await writer.put(1, 'one');
  await writer.put(2, 'two');
  await writer.put(3, 'three');
  assert.equal(await reader.size(), 3);

  await reader.remove(2);
  assert.equal(await writer.size(), 2);

  await writer.popFirst();
  assert.equal(await reader.size(), 1);
});

void test('multi-instance stress with many entries across writers', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, number>();
  const writerA = new ConcurrentInMemoryBTree<number, number>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });
  const writerB = new ConcurrentInMemoryBTree<number, number>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });
  const reader = new ConcurrentInMemoryBTree<number, number>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  for (let i = 0; i < 20; i += 1) {
    await writerA.put(i * 2, i);
  }
  for (let i = 0; i < 20; i += 1) {
    await writerB.put(i * 2 + 1, i);
  }

  assert.equal(await reader.size(), 40);

  const snapshot = await reader.snapshot();
  assert.equal(snapshot.length, 40);

  for (let i = 1; i < snapshot.length; i += 1) {
    assert.ok(snapshot[i - 1].key < snapshot[i].key);
  }

  await reader.assertInvariants();
});

void test('updateById retries after concurrent conflict', async (): Promise<void> => {
  const base = new AtomicMemorySharedTreeStore<number, string>();
  const setupTree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (a, b) => a - b,
    store: base,
    enableEntryIdLookup: true,
  });
  const id = await setupTree.put(10, 'ten');

  const failOnceStore = new FailOnceCompareAndSetStore(base);
  const retryTree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (a, b) => a - b,
    store: failOnceStore,
    enableEntryIdLookup: true,
    maxRetries: 4,
  });
  const result = await retryTree.updateById(id, 'TEN');
  assert.notEqual(result, null);
  assert.equal(result!.value, 'TEN');
  assert.deepEqual(await retryTree.peekById(id), {
    entryId: id,
    key: 10,
    value: 'TEN',
  });
});

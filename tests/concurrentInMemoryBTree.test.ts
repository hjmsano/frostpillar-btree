import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BTreeConcurrencyError,
  ConcurrentInMemoryBTree,
} from '../src/index.js';

import {
  AlwaysConflictStore,
  AtomicMemorySharedTreeStore,
  DelayFirstReadStore,
  DelayFirstSuccessfulAppendStore,
  FailOnceCompareAndSetStore,
  JumpVersionStore,
  NonReplayingAppendStore,
  UnknownMutationStore,
} from './helpers/sharedTreeStoreStubs.js';

void test('concurrent coordinators avoid lost updates through shared CAS store', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const createTree = (): ConcurrentInMemoryBTree<number, string> => {
    return new ConcurrentInMemoryBTree<number, string>({
      compareKeys: (left: number, right: number): number => left - right,
      store,
    });
  };

  const first = createTree();
  const second = createTree();

  const [id10, id20] = await Promise.all([first.put(10, 'ten'), second.put(20, 'twenty')]);

  await first.sync();
  assert.deepEqual(await first.range(0, 30), [
    { entryId: id10, key: 10, value: 'ten' },
    { entryId: id20, key: 20, value: 'twenty' },
  ]);
});

void test('retries and succeeds when first CAS attempt conflicts', async (): Promise<void> => {
  const base = new AtomicMemorySharedTreeStore<number, string>();
  const store = new FailOnceCompareAndSetStore(base);

  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    maxRetries: 4,
  });

  const id7 = await tree.put(7, 'value');
  assert.deepEqual(await tree.range(7, 7), [{ entryId: id7, key: 7, value: 'value' }]);
});

void test('fails with typed error after max retry exhaustion', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new AlwaysConflictStore<number, string>(),
    maxRetries: 2,
  });

  await assert.rejects(async (): Promise<void> => {
    await tree.put(1, 'one');
  }, BTreeConcurrencyError);
});

void test('tree recovers and accepts operations after retry exhaustion error', async (): Promise<void> => {
  const base = new AtomicMemorySharedTreeStore<number, string>();

  // First: use a working tree to seed data via the base store
  const seedTree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: base,
  });
  await seedTree.put(1, 'one');

  // Second: create a tree with AlwaysConflict that will fail
  const alwaysConflict = new AlwaysConflictStore<number, string>();
  const failingTree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: alwaysConflict,
    maxRetries: 1,
  });

  await assert.rejects(
    async (): Promise<void> => { await failingTree.put(99, 'fail'); },
    BTreeConcurrencyError,
  );

  // Now create a fresh tree on the working store — it should operate normally
  const recoveryTree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: base,
  });
  const id2 = await recoveryTree.put(2, 'two');
  assert.notEqual(id2, null);
  assert.equal(await recoveryTree.size(), 2);
  assert.equal(await recoveryTree.get(2), 'two');
});

void test('serializes overlapping sync calls to avoid duplicate mutation replay', async (): Promise<void> => {
  const base = new AtomicMemorySharedTreeStore<number, string>();
  const store = new DelayFirstReadStore(base);
  const seeded = await store.append(0n, [{ type: 'put', key: 1, value: 'one' }]);
  assert.equal(seeded.applied, true);

  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  const firstSync = tree.sync();
  await store.waitUntilFirstReadBlocked();
  const secondSync = tree.sync();
  store.unblockFirstRead();
  await Promise.all([firstSync, secondSync]);

  const entries = await tree.range(1, 1);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].key, 1);
  assert.equal(entries[0].value, 'one');
});

void test('hasKey syncs and reflects cross-instance state', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });
  const reader = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  assert.equal(await reader.hasKey(5), false);
  await writer.put(5, 'five');
  assert.equal(await reader.hasKey(5), true);
  await writer.remove(5);
  assert.equal(await reader.hasKey(5), false);
});

void test('peekFirst returns null on empty tree', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new AtomicMemorySharedTreeStore<number, string>(),
  });

  assert.equal(await tree.peekFirst(), null);
});

void test('peekFirst returns the smallest entry without removing it', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  await tree.put(20, 'twenty');
  const id5 = await tree.put(5, 'five');
  await tree.put(10, 'ten');

  assert.deepEqual(await tree.peekFirst(), { entryId: id5, key: 5, value: 'five' });
  assert.equal(await tree.size(), 3);
});

void test('peekFirst syncs from store before returning', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });
  const reader = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  const id3 = await writer.put(3, 'three');
  assert.deepEqual(await reader.peekFirst(), { entryId: id3, key: 3, value: 'three' });
});

void test('peekById returns null for unknown entryId', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new AtomicMemorySharedTreeStore<number, string>(),
    enableEntryIdLookup: true,
  });

  const id = await tree.put(1, 'one');
  await tree.removeById(id);

  assert.equal(await tree.peekById(id), null);
});

void test('peekById returns the correct entry without removing it', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new AtomicMemorySharedTreeStore<number, string>(),
    enableEntryIdLookup: true,
  });

  await tree.put(10, 'ten');
  const idTwenty = await tree.put(20, 'twenty');
  await tree.put(30, 'thirty');

  assert.deepEqual(await tree.peekById(idTwenty), { entryId: idTwenty, key: 20, value: 'twenty' });
  assert.equal(await tree.size(), 3);
});

void test('peekById syncs from store before returning and reflects remote removal', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const owner = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    enableEntryIdLookup: true,
  });
  const remote = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    enableEntryIdLookup: true,
  });

  const id = await owner.put(7, 'seven');
  assert.deepEqual(await owner.peekById(id), { entryId: id, key: 7, value: 'seven' });

  await remote.remove(7);

  assert.equal(await owner.peekById(id), null);
});

void test('removeById works across synchronized instances sharing one store', async (): Promise<void> => {
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

  const id = await writer.put(11, 'eleven');
  assert.deepEqual(await reader.removeById(id), { entryId: id, key: 11, value: 'eleven' });
  assert.equal(await writer.peekById(id), null);
});

void test('updateById works across synchronized instances sharing one store', async (): Promise<void> => {
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

  const id = await writer.put(12, 'twelve');
  assert.deepEqual(await reader.updateById(id, 'TWELVE'), { entryId: id, key: 12, value: 'TWELVE' });
  assert.deepEqual(await writer.peekById(id), { entryId: id, key: 12, value: 'TWELVE' });
});

void test('uses committed store version from append result when versions jump', async (): Promise<void> => {
  const store = new JumpVersionStore<number, string>();
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  const id1 = await tree.put(1, 'one');
  assert.deepEqual(await tree.range(1, 1), [{ entryId: id1, key: 1, value: 'one' }]);
});

void test('rejects unknown mutation types from shared store', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new UnknownMutationStore<number, string>(),
  });

  await assert.rejects(async (): Promise<void> => {
    await tree.sync();
  }, BTreeConcurrencyError);
});

void test('applies successful appends locally even when store does not replay payloads', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new NonReplayingAppendStore<number, string>(),
    enableEntryIdLookup: true,
  });

  const id = await tree.put(10, 'ten');
  assert.deepEqual(await tree.peekById(id), { entryId: id, key: 10, value: 'ten' });
  assert.deepEqual(await tree.updateById(id, 'TEN'), { entryId: id, key: 10, value: 'TEN' });
  assert.deepEqual(await tree.peekById(id), { entryId: id, key: 10, value: 'TEN' });
  assert.deepEqual(await tree.removeById(id), { entryId: id, key: 10, value: 'TEN' });
  assert.equal(await tree.peekById(id), null);
});

void test('serializes sync against in-flight append to avoid double apply', async (): Promise<void> => {
  const base = new AtomicMemorySharedTreeStore<number, string>();
  const store = new DelayFirstSuccessfulAppendStore(base);

  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  const insertPromise = tree.put(3, 'three');
  await store.waitUntilFirstAppendBlocked();
  const syncPromise = tree.sync();
  store.unblockFirstAppend();
  await Promise.all([insertPromise, syncPromise]);

  const entries = await tree.range(3, 3);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].key, 3);
  assert.equal(entries[0].value, 'three');
});
